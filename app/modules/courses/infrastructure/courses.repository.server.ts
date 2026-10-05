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
	CourseSessionData,
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
	trainers: {
		select: {
			user: { select: { firstName: true, lastName: true, email: true } },
		},
		orderBy: { assignedAt: "asc" },
	},
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
	minPassingGrade: true,
	qrOpensBeforeMinutes: true,
	qrClosesAfterMinutes: true,
	planLine: {
		select: {
			documentId: true,
			title: true,
			plan: { select: { documentId: true, fiscalYear: true } },
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
const isMissingRow = (error: unknown): boolean =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === "P2025";

/** Una escritura condicionada que ya no encuentra su fila devuelve `null`. */
const unlessMissing = async <T>(write: Promise<T>): Promise<T | null> => {
	try {
		return await write;
	} catch (error) {
		if (isMissingRow(error)) return null;
		throw error;
	}
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

const SYNC_SELECT = {
	id: true,
	sessions: {
		select: {
			id: true,
			documentId: true,
			startsAt: true,
			endsAt: true,
			venue: true,
			link: true,
		},
	},
	trainers: { select: { userId: true } },
	dependencyAudience: { select: { dependencyId: true } },
	groupAudience: { select: { groupId: true } },
} satisfies Prisma.CourseSelect;

type StoredCollections = Prisma.CourseGetPayload<{
	select: typeof SYNC_SELECT;
}>;

type SessionFields = Omit<CourseSessionData, "documentId">;

const sameSession = (
	stored: StoredCollections["sessions"][number],
	next: SessionFields,
): boolean =>
	stored.startsAt.getTime() === next.startsAt.getTime() &&
	stored.endsAt.getTime() === next.endsAt.getTime() &&
	stored.venue === next.venue &&
	stored.link === next.link;

const diffIds = (current: readonly number[], next: readonly number[]) => {
	const before = new Set(current);
	const after = new Set(next);

	return {
		added: [...after].filter((id) => !before.has(id)),
		removed: [...before].filter((id) => !after.has(id)),
	};
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
	minPassingGrade: data.minPassingGrade,
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
	/** Toca solo las filas de unión que cambiaron: ninguna tiene hijos. */
	const syncJoins = async (
		courseId: number,
		stored: StoredCollections,
		data: CourseWriteData,
	) => {
		const trainers = diffIds(
			stored.trainers.map((row) => row.userId),
			data.trainerIds,
		);
		const dependencies = diffIds(
			stored.dependencyAudience.map((row) => row.dependencyId),
			data.audienceDependencyIds,
		);
		const groups = diffIds(
			stored.groupAudience.map((row) => row.groupId),
			data.audienceGroupIds,
		);

		if (trainers.removed.length > 0) {
			await prisma.courseTrainer.deleteMany({
				where: { courseId, userId: { in: trainers.removed } },
			});
		}
		if (trainers.added.length > 0) {
			await prisma.courseTrainer.createMany({
				data: trainers.added.map((userId) => ({ courseId, userId })),
			});
		}
		if (dependencies.removed.length > 0) {
			await prisma.courseDependencyAudience.deleteMany({
				where: { courseId, dependencyId: { in: dependencies.removed } },
			});
		}
		if (dependencies.added.length > 0) {
			await prisma.courseDependencyAudience.createMany({
				data: dependencies.added.map((dependencyId) => ({
					courseId,
					dependencyId,
				})),
			});
		}
		if (groups.removed.length > 0) {
			await prisma.courseGroupAudience.deleteMany({
				where: { courseId, groupId: { in: groups.removed } },
			});
		}
		if (groups.added.length > 0) {
			await prisma.courseGroupAudience.createMany({
				data: groups.added.map((groupId) => ({ courseId, groupId })),
			});
		}
	};

	/**
	 * Diferencia las sesiones por `documentId` en vez de recrearlas, y solo
	 * escribe las que cambiaron.
	 *
	 * Solo se actualiza una sesión si su `documentId` pertenece a ESTE curso: uno
	 * ajeno enviado a mano se trata como sesión nueva y nunca toca la otra fila.
	 */
	const syncSessions = async (
		courseId: number,
		existing: StoredCollections["sessions"],
		sessions: CourseWriteData["sessions"],
	) => {
		const owned = new Map(existing.map((row) => [row.documentId, row]));
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

		const created: SessionFields[] = [];
		for (const { documentId, ...fields } of sessions) {
			const stored = documentId ? owned.get(documentId) : undefined;

			if (!stored) {
				created.push(fields);
			} else if (!sameSession(stored, fields)) {
				await prisma.courseSession.update({
					where: { id: stored.id },
					data: fields,
				});
			}
		}

		if (created.length > 0) {
			await prisma.courseSession.createMany({
				data: created.map((fields) => ({ courseId, ...fields })),
			});
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
			const sessions = data.sessions.map(
				({ documentId: _ignored, ...fields }) => fields,
			);

			const course = await prisma.course.create({
				data: {
					...scalarsOf(data),
					coverImageUrl: data.coverImageUrl,
					dependencyId: data.dependencyId,
					createdById: data.createdById,
					planLineId: data.planLineId,
					...(sessions.length > 0 && {
						sessions: { createMany: { data: sessions } },
					}),
					...(data.trainerIds.length > 0 && {
						trainers: {
							createMany: {
								data: data.trainerIds.map((userId) => ({ userId })),
							},
						},
					}),
					...(data.audienceDependencyIds.length > 0 && {
						dependencyAudience: {
							createMany: {
								data: data.audienceDependencyIds.map((dependencyId) => ({
									dependencyId,
								})),
							},
						},
					}),
					...(data.audienceGroupIds.length > 0 && {
						groupAudience: {
							createMany: {
								data: data.audienceGroupIds.map((groupId) => ({ groupId })),
							},
						},
					}),
				},
				select: DETAIL_SELECT,
			});

			return toDetail(course);
		},
		async lock(documentId) {
			await prisma.$queryRaw`SELECT id FROM "org"."courses" WHERE "documentId" = ${documentId}::uuid FOR UPDATE`;
		},
		async findSessionsWithAttendance(sessionDocumentIds) {
			if (sessionDocumentIds.length === 0) return [];

			const rows = await prisma.courseSession.findMany({
				where: {
					documentId: { in: [...sessionDocumentIds] },
					attendance: { some: {} },
				},
				select: { documentId: true },
			});

			return rows.map((row) => row.documentId);
		},
		async findSessionMaterialRefs(sessionDocumentIds) {
			const rows = await prisma.sessionMaterial.findMany({
				where: {
					session: { documentId: { in: sessionDocumentIds } },
					fileUrl: { not: null },
				},
				select: { fileUrl: true },
			});

			return rows.flatMap((row) => (row.fileUrl ? [row.fileUrl] : []));
		},
		async update(documentId: string, data: UpdateCourseData, scope, expected) {
			const stored = await unlessMissing(
				prisma.course.update({
					where: { ...writeWhere(documentId, scope), status: expected },
					data: {
						...scalarsOf(data),
						...coverOf(data),
						...(data.planLineId !== undefined && {
							planLineId: data.planLineId,
						}),
					},
					select: SYNC_SELECT,
				}),
			);
			if (!stored) return null;

			await syncSessions(stored.id, stored.sessions, data.sessions);
			await syncJoins(stored.id, stored, data);

			const updated = await prisma.course.findUniqueOrThrow({
				where: { id: stored.id },
				select: DETAIL_SELECT,
			});

			return toDetail(updated);
		},
		async publish(documentId, scope) {
			const course = await unlessMissing(
				prisma.course.update({
					where: { ...writeWhere(documentId, scope), status: "DRAFT" },
					data: { status: "PUBLISHED", publishedAt: new Date() },
					select: DETAIL_SELECT,
				}),
			);

			return course ? toDetail(course) : null;
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
		async cancel(documentId, scope, expected) {
			const course = await unlessMissing(
				prisma.course.update({
					where: { ...writeWhere(documentId, scope), status: expected },
					data: { status: "CANCELLED", cancelledAt: new Date() },
					select: DETAIL_SELECT,
				}),
			);

			return course ? toDetail(course) : null;
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
		async findByEnrollmentQrToken(token) {
			return prisma.course.findUnique({
				where: { enrollmentQrToken: token },
				select: { id: true, documentId: true, status: true, access: true },
			});
		},
		async findEnrollmentQrState(courseId) {
			const course = await prisma.course.findUniqueOrThrow({
				where: { id: courseId },
				select: {
					enrollmentQrToken: true,
					enrollmentQrTokenRotatedAt: true,
				},
			});

			return {
				token: course.enrollmentQrToken,
				rotatedAt: course.enrollmentQrTokenRotatedAt,
			};
		},
		async rotateEnrollmentQrToken(courseId, token, at) {
			await prisma.course.update({
				where: { id: courseId },
				data: { enrollmentQrToken: token, enrollmentQrTokenRotatedAt: at },
			});
		},
	};
};
