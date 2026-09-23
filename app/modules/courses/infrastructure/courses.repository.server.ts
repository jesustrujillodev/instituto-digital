import { Prisma } from "@prisma/client";
import { groupScopeWhere } from "@/modules/groups/domain/group.access";
import type { AccessScope } from "@/shared/auth/scope.rules";
import type { ICradle } from "@/shared/di/container.types";
import {
	type CourseScope,
	courseScopeWhere,
	courseScopeWriteWhere,
} from "../domain/course.access";
import { COURSE_LIST_DEFAULTS } from "../domain/course.config";
import { CourseNotFoundError } from "../domain/course.errors";
import { toDetail, toSummary } from "../domain/course.mapper";
import type { ICourseRepository } from "../domain/course.repository";
import type {
	CourseWriteData,
	CreateCourseData,
	ListCoursesDto,
	UpdateCourseData,
} from "../domain/course.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const SUMMARY_SELECT = {
	id: true,
	documentId: true,
	dependencyId: true,
	title: true,
	coverImageUrl: true,
	modality: true,
	format: true,
	access: true,
	status: true,
	capacity: true,
	createdAt: true,
	updatedAt: true,
	dependency: { select: { name: true } },
	createdBy: { select: { firstName: true, lastName: true } },
	_count: { select: { sessions: true, trainers: true } },
	sessions: {
		select: { startsAt: true },
		orderBy: { startsAt: "asc" },
	},
} satisfies Prisma.CourseSelect;

const DETAIL_SELECT = {
	...SUMMARY_SELECT,
	completionRule: true,
	description: true,
	hours: true,
	enrollmentDeadline: true,
	minAttendance: true,
	requiresEvaluation: true,
	evaluationMethod: true,
	qrOpensBeforeMinutes: true,
	qrClosesAfterMinutes: true,
	planLine: {
		select: {
			documentId: true,
			title: true,
			plan: { select: { documentId: true } },
		},
	},
	publishedAt: true,
	cancelledAt: true,
	sessions: {
		select: {
			id: true,
			documentId: true,
			startsAt: true,
			endsAt: true,
			venue: true,
			link: true,
		},
		orderBy: { startsAt: "asc" },
	},
	trainers: {
		select: {
			user: {
				select: {
					documentId: true,
					firstName: true,
					lastName: true,
					email: true,
					archivedAt: true,
					trainerProfile: { select: { specialty: true, archivedAt: true } },
				},
			},
		},
		orderBy: { assignedAt: "asc" },
	},
	dependencyAudience: {
		select: { dependency: { select: { documentId: true, name: true } } },
	},
	groupAudience: {
		select: { group: { select: { documentId: true, name: true } } },
	},
} satisfies Prisma.CourseSelect;

/** Lo mínimo que el escaneo del QR necesita: ni roster ni audiencia. */
const QR_SELECT = {
	id: true,
	documentId: true,
	title: true,
	status: true,
	qrOpensBeforeMinutes: true,
	qrClosesAfterMinutes: true,
	dependency: { select: { name: true } },
	sessions: {
		select: {
			id: true,
			documentId: true,
			startsAt: true,
			endsAt: true,
			venue: true,
		},
		orderBy: { startsAt: "asc" },
	},
} satisfies Prisma.CourseSelect;

const SEARCHABLE_FIELDS = ["title", "description"] as const;

// ÚNICA capa que puede importar tipos del ORM ⇒ única que traduce sus códigos.
const translatePrismaError = (error: unknown): never => {
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2025"
	) {
		throw new CourseNotFoundError();
	}
	throw error;
};

const toFilters = (
	dto: ListCoursesDto,
	scope: CourseScope,
): Prisma.CourseWhereInput => ({
	// El alcance va primero y los filtros se SUMAN: pedir otra dependencia por
	// la URL no amplía nada, solo acota.
	...courseScopeWhere(scope),
	...(dto.dependency && {
		AND: [{ dependency: { documentId: dto.dependency } }],
	}),
	...(dto.status && { status: dto.status }),
	...(dto.modality && { modality: dto.modality }),
	...(dto.access && { access: dto.access }),
	...(dto.search && {
		OR: SEARCHABLE_FIELDS.map((field) => ({
			[field]: { contains: dto.search, mode: Prisma.QueryMode.insensitive },
		})),
	}),
});

const toOrderBy = (
	dto: ListCoursesDto,
): Prisma.CourseOrderByWithRelationInput => ({
	[dto.sortBy ?? "createdAt"]: dto.sortDir ?? "desc",
});

/**
 * Clave única + alcance para una escritura.
 *
 * Fuera de alcance, Prisma no encuentra la fila y lanza P2025: se ve igual que
 * inexistente. `null` corta antes de tocar la base.
 */
const writeWhere = (
	documentId: string,
	scope: CourseScope,
): Prisma.CourseWhereUniqueInput => {
	const filter = courseScopeWriteWhere(scope);
	if (filter === null) throw new CourseNotFoundError();

	return { documentId, ...filter };
};

const scalarsOf = (data: CourseWriteData) => ({
	title: data.title,
	description: data.description,
	hours: data.hours,
	modality: data.modality,
	format: data.format,
	completionRule: data.completionRule,
	access: data.access,
	capacity: data.capacity,
	enrollmentDeadline: data.enrollmentDeadline,
	minAttendance: data.minAttendance,
	requiresEvaluation: data.requiresEvaluation,
	evaluationMethod: data.evaluationMethod,
	qrOpensBeforeMinutes: data.qrOpensBeforeMinutes,
	qrClosesAfterMinutes: data.qrClosesAfterMinutes,
});

/**
 * La portada solo entra al `data` si el servicio la mandó.
 *
 * Con spread incondicional, `undefined` llegaría a Prisma en cada guardado del
 * formulario y —aunque Prisma lo ignora— el contrato dejaría de distinguir
 * "conservar" de "quitar". Aquí la distinción es explícita: ausente conserva,
 * `null` quita.
 */
const coverOf = (data: UpdateCourseData) =>
	data.coverImageUrl === undefined ? {} : { coverImageUrl: data.coverImageUrl };

export const createCourseRepository = ({
	prisma,
}: Dependencies): ICourseRepository => {
	/** Reemplaza enteras las tablas de unión: ninguna fila tiene hijos. */
	const replaceJoins = async (courseId: number, data: CourseWriteData) => {
		await prisma.courseTrainer.deleteMany({ where: { courseId } });
		await prisma.courseDependencyAudience.deleteMany({ where: { courseId } });
		await prisma.courseGroupAudience.deleteMany({ where: { courseId } });

		if (data.trainerIds.length > 0) {
			await prisma.courseTrainer.createMany({
				data: data.trainerIds.map((userId) => ({ courseId, userId })),
			});
		}
		if (data.audienceDependencyIds.length > 0) {
			await prisma.courseDependencyAudience.createMany({
				data: data.audienceDependencyIds.map((dependencyId) => ({
					courseId,
					dependencyId,
				})),
			});
		}
		if (data.audienceGroupIds.length > 0) {
			await prisma.courseGroupAudience.createMany({
				data: data.audienceGroupIds.map((groupId) => ({ courseId, groupId })),
			});
		}
	};

	/**
	 * Diferencia las sesiones por `documentId` en vez de recrearlas.
	 *
	 * Solo se actualiza una sesión si su `documentId` pertenece a ESTE curso: uno
	 * ajeno enviado a mano se trata como sesión nueva y nunca toca la otra fila.
	 */
	const syncSessions = async (
		courseId: number,
		existing: readonly { id: number; documentId: string }[],
		sessions: CourseWriteData["sessions"],
	) => {
		const owned = new Map(existing.map((row) => [row.documentId, row.id]));
		const kept = new Set(
			sessions.flatMap((session) =>
				session.documentId && owned.has(session.documentId)
					? [session.documentId]
					: [],
			),
		);

		const removedIds = existing
			.filter((row) => !kept.has(row.documentId))
			.map((row) => row.id);

		if (removedIds.length > 0) {
			await prisma.courseSession.deleteMany({
				where: { id: { in: removedIds } },
			});
		}

		for (const { documentId, ...fields } of sessions) {
			const id = documentId ? owned.get(documentId) : undefined;

			if (id !== undefined) {
				await prisma.courseSession.update({ where: { id }, data: fields });
			} else {
				await prisma.courseSession.create({ data: { courseId, ...fields } });
			}
		}
	};

	return {
		async findAll(filters, scope) {
			const page = filters.page ?? COURSE_LIST_DEFAULTS.page;
			const pageSize = filters.pageSize ?? COURSE_LIST_DEFAULTS.pageSize;

			const courses = await prisma.course.findMany({
				where: toFilters(filters, scope),
				orderBy: toOrderBy(filters),
				skip: (page - 1) * pageSize,
				take: pageSize,
				select: SUMMARY_SELECT,
			});

			return courses.map(toSummary);
		},
		async count(filters, scope) {
			return prisma.course.count({ where: toFilters(filters, scope) });
		},
		async findById(documentId, scope) {
			// `findFirst` y no `findUnique`: hace falta combinar la clave única con
			// el filtro de alcance.
			const course = await prisma.course.findFirst({
				where: { documentId, ...courseScopeWhere(scope) },
				select: DETAIL_SELECT,
			});

			return course ? toDetail(course) : null;
		},
		async create(data: CreateCourseData) {
			const course = await prisma.course.create({
				data: {
					...scalarsOf(data),
					coverImageUrl: data.coverImageUrl,
					dependencyId: data.dependencyId,
					createdById: data.createdById,
					planLineId: data.planLineId,
					sessions: {
						create: data.sessions.map(
							({ documentId: _ignored, ...fields }) => fields,
						),
					},
				},
				select: { id: true, documentId: true },
			});

			await replaceJoins(course.id, data);

			const created = await prisma.course.findUniqueOrThrow({
				where: { id: course.id },
				select: DETAIL_SELECT,
			});

			return toDetail(created);
		},
		async update(documentId: string, data: UpdateCourseData, scope) {
			try {
				const course = await prisma.course.update({
					where: writeWhere(documentId, scope),
					data: { ...scalarsOf(data), ...coverOf(data) },
					select: {
						id: true,
						sessions: { select: { id: true, documentId: true } },
					},
				});

				await syncSessions(course.id, course.sessions, data.sessions);
				await replaceJoins(course.id, data);

				const updated = await prisma.course.findUniqueOrThrow({
					where: { id: course.id },
					select: DETAIL_SELECT,
				});

				return toDetail(updated);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async publish(documentId, scope) {
			try {
				const course = await prisma.course.update({
					where: writeWhere(documentId, scope),
					data: { status: "PUBLISHED", publishedAt: new Date() },
					select: DETAIL_SELECT,
				});

				return toDetail(course);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async finish(courseId, at) {
			const { count } = await prisma.course.updateMany({
				where: { id: courseId, status: "PUBLISHED" },
				data: { status: "FINISHED", finishedAt: at },
			});

			return count === 1;
		},
		async setEnrollmentClosed(courseId, at) {
			await prisma.course.update({
				where: { id: courseId },
				data: { enrollmentClosedAt: at },
			});
		},
		async cancel(documentId, scope) {
			try {
				const course = await prisma.course.update({
					where: writeWhere(documentId, scope),
					data: { status: "CANCELLED", cancelledAt: new Date() },
					select: DETAIL_SELECT,
				});

				return toDetail(course);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async findEligibleTrainers(userDocumentIds) {
			if (userDocumentIds.length === 0) return [];

			return prisma.user.findMany({
				where: {
					documentId: { in: [...userDocumentIds] },
					archivedAt: null,
					trainerProfile: { is: { archivedAt: null } },
				},
				select: { id: true, documentId: true },
			});
		},
		async findEligibleDependencies(documentIds) {
			if (documentIds.length === 0) return [];

			return prisma.dependency.findMany({
				where: { documentId: { in: [...documentIds] }, archivedAt: null },
				select: { id: true, documentId: true },
			});
		},
		async findEligibleGroups(documentIds, scope: AccessScope) {
			if (documentIds.length === 0) return [];

			return prisma.group.findMany({
				where: {
					documentId: { in: [...documentIds] },
					archivedAt: null,
					...groupScopeWhere(scope),
				},
				select: { id: true, documentId: true },
			});
		},
		async findByQrToken(token) {
			const course = await prisma.course.findUnique({
				where: { qrToken: token },
				select: QR_SELECT,
			});

			if (!course) return null;

			return {
				...course,
				dependencyName: course.dependency.name,
			};
		},
		async rotateQrToken(courseId, token, at) {
			await prisma.course.update({
				where: { id: courseId },
				data: { qrToken: token, qrTokenRotatedAt: at },
			});
		},
	};
};
