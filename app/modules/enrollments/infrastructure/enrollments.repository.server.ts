import { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import {
	ACTIVE_ENROLLMENT_STATUSES,
	AVAILABLE_LIST_DEFAULTS,
	ENROLLMENT_CANDIDATES_LIMIT,
} from "../domain/enrollment.config";
import { EnrollmentStateChangedError } from "../domain/enrollment.errors";
import {
	toEnrollmentCourse,
	toOwnEnrollment,
	toRosterEntry,
} from "../domain/enrollment.mapper";
import type {
	CourseFilter,
	IEnrollmentRepository,
} from "../domain/enrollment.repository";
import type {
	EnrollmentWrite,
	ListAvailableCoursesDto,
	ParticipantAccount,
} from "../domain/enrollment.types";

type Dependencies = {
	prisma: ICradle["prisma"];
	// Traduce la key a la URL con la que se pinta: la del dominio público cuando
	// hay CDN, la referencia del proxy si no. Sin esto, cada portada del catálogo
	// se sirve con una firma nueva y el navegador no puede cachear ninguna.
	assetUrlResolver: ICradle["assetUrlResolver"];
};

const COURSE_SELECT = {
	id: true,
	documentId: true,
	title: true,
	description: true,
	coverImageUrl: true,
	modality: true,
	access: true,
	status: true,
	capacity: true,
	enrollmentDeadline: true,
	dependency: { select: { name: true } },
	_count: {
		select: { enrollments: { where: { status: "ENROLLED" } } },
	},
	sessions: {
		select: {
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
			user: { select: { firstName: true, lastName: true, email: true } },
		},
		orderBy: { assignedAt: "asc" },
	},
} satisfies Prisma.CourseSelect;

const PARTICIPANT_SELECT = {
	id: true,
	documentId: true,
	dependencyId: true,
	email: true,
	firstName: true,
	lastName: true,
} satisfies Prisma.UserSelect;

const CANDIDATE_SEARCHABLE_FIELDS = ["firstName", "lastName", "email"] as const;
const COURSE_SEARCHABLE_FIELDS = ["title", "description"] as const;

const activeStatuses = [...ACTIVE_ENROLLMENT_STATUSES];

// Los filtros de dominio usan arreglos `readonly`, que Prisma no acepta tal cual.
const asWhere = (filter: CourseFilter) =>
	filter as unknown as Prisma.CourseWhereInput;

const insensitive = (search: string) => ({
	contains: search,
	mode: Prisma.QueryMode.insensitive,
});

const availableWhere = (
	filters: ListAvailableCoursesDto,
	filter: CourseFilter,
	now: Date,
): Prisma.CourseWhereInput => ({
	AND: [
		asWhere(filter),
		{ status: "PUBLISHED" },
		{ sessions: { some: {}, none: { startsAt: { lte: now } } } },
		{ OR: [{ enrollmentDeadline: null }, { enrollmentDeadline: { gt: now } }] },
		...(filters.dependency
			? [{ dependency: { documentId: filters.dependency } }]
			: []),
		...(filters.modality ? [{ modality: filters.modality }] : []),
		...(filters.search
			? [
					{
						OR: COURSE_SEARCHABLE_FIELDS.map((field) => ({
							[field]: insensitive(filters.search as string),
						})),
					},
				]
			: []),
	],
});

const toParticipants = (
	rows: readonly (Omit<ParticipantAccount, "dependencyId"> & {
		dependencyId: number | null;
	})[],
): ParticipantAccount[] =>
	rows.flatMap(({ dependencyId, ...row }) =>
		dependencyId === null ? [] : [{ ...row, dependencyId }],
	);

const timestampsFor = (data: EnrollmentWrite) => {
	switch (data.status) {
		case "INVITED":
			return { invitedAt: data.at, respondedAt: null, withdrawnAt: null };
		case "ENROLLED":
			return {
				enrolledAt: data.at,
				withdrawnAt: null,
				...(data.origin === "INVITATION" && { respondedAt: data.at }),
			};
		case "DECLINED":
			return { respondedAt: data.at };
		case "WITHDRAWN":
			return { withdrawnAt: data.at };
		default: {
			const exhaustive: never = data.status;
			return exhaustive;
		}
	}
};

export const createEnrollmentRepository = ({
	prisma,
	assetUrlResolver,
}: Dependencies): IEnrollmentRepository => {
	const resolveCover = (reference: string | null) =>
		reference ? assetUrlResolver(getKeyFromUrl(reference) ?? "") : null;

	return {
		async findCourse(documentId, filter) {
			const course = await prisma.course.findFirst({
				where: { AND: [{ documentId }, asWhere(filter)] },
				select: COURSE_SELECT,
			});

			return course ? toEnrollmentCourse(course, resolveCover) : null;
		},

		async findAvailable({ filters, filter, now, userId }) {
			const page = filters.page ?? AVAILABLE_LIST_DEFAULTS.page;
			const pageSize = filters.pageSize ?? AVAILABLE_LIST_DEFAULTS.pageSize;

			const courses = await prisma.course.findMany({
				where: availableWhere(filters, filter, now),
				orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
				skip: (page - 1) * pageSize,
				take: pageSize,
				select: {
					...COURSE_SELECT,
					enrollments: { where: { userId }, select: { status: true } },
				},
			});

			return courses.map(({ enrollments, ...course }) => ({
				course: toEnrollmentCourse(course, resolveCover),
				myStatus: enrollments.at(0)?.status ?? null,
			}));
		},

		async countAvailable({ filters, filter, now }) {
			return prisma.course.count({
				where: availableWhere(filters, filter, now),
			});
		},

		async findEnrollment(courseId, userId) {
			const enrollment = await prisma.enrollment.findUnique({
				where: { courseId_userId: { courseId, userId } },
				select: {
					userId: true,
					documentId: true,
					origin: true,
					status: true,
					result: true,
				},
			});

			return enrollment;
		},

		async findEnrollments(courseId, userIds) {
			if (userIds.length === 0) return [];

			return prisma.enrollment.findMany({
				where: { courseId, userId: { in: [...userIds] } },
				select: { userId: true, status: true, origin: true },
			});
		},

		async lockCourseSeats(courseId) {
			await prisma.$queryRaw`SELECT id FROM "org"."courses" WHERE id = ${courseId} FOR UPDATE`;

			const [course, enrolled] = await Promise.all([
				prisma.course.findUniqueOrThrow({
					where: { id: courseId },
					select: { capacity: true },
				}),
				prisma.enrollment.count({ where: { courseId, status: "ENROLLED" } }),
			]);

			return { capacity: course.capacity, enrolled };
		},

		async save(data, expected) {
			const fields = {
				dependencyId: data.dependencyId,
				origin: data.origin,
				status: data.status,
				actedById: data.actedById,
				...timestampsFor(data),
			};

			try {
				if (expected === null) {
					await prisma.enrollment.create({
						data: { courseId: data.courseId, userId: data.userId, ...fields },
					});
					return;
				}

				const { count } = await prisma.enrollment.updateMany({
					where: {
						courseId: data.courseId,
						userId: data.userId,
						status: expected,
					},
					data: fields,
				});
				if (count === 0) throw new EnrollmentStateChangedError();
			} catch (error) {
				if (
					error instanceof Prisma.PrismaClientKnownRequestError &&
					error.code === "P2002"
				) {
					throw new EnrollmentStateChangedError();
				}
				throw error;
			}
		},

		async saveResults(courseId, entries, actorId, at) {
			// Secuencial: la transacción interactiva de Prisma no admite consultas en paralelo.
			for (const entry of entries) {
				await prisma.enrollment.updateMany({
					where: { courseId, userId: entry.userId, status: "ENROLLED" },
					data: {
						result: entry.result,
						grade: entry.grade,
						resultRecordedById: actorId,
						resultRecordedAt: at,
					},
				});
			}
		},

		async setCompletion(courseId, completedUserIds) {
			const ids = [...completedUserIds];

			await prisma.enrollment.updateMany({
				where: { courseId, status: "ENROLLED", userId: { in: ids } },
				data: { completed: true },
			});
			await prisma.enrollment.updateMany({
				where: { courseId, status: "ENROLLED", userId: { notIn: ids } },
				data: { completed: false },
			});
		},

		async findNotifiableRecipients(courseId) {
			const rows = await prisma.enrollment.findMany({
				where: {
					courseId,
					status: { in: activeStatuses },
					user: { archivedAt: null },
				},
				select: {
					user: { select: { email: true, firstName: true, lastName: true } },
				},
			});

			return rows.map(({ user }) => user);
		},

		async findMine(userId) {
			const rows = await prisma.enrollment.findMany({
				where: { userId, status: { in: activeStatuses } },
				orderBy: { updatedAt: "desc" },
				select: {
					documentId: true,
					origin: true,
					status: true,
					result: true,
					grade: true,
					completed: true,
					course: {
						select: {
							...COURSE_SELECT,
							ratings: { where: { userId }, select: { score: true } },
						},
					},
				},
			});

			const attended = await prisma.courseAttendance.findMany({
				where: {
					userId,
					attended: true,
					session: { courseId: { in: rows.map((row) => row.course.id) } },
				},
				select: { session: { select: { courseId: true } } },
			});
			const attendedByCourse = new Map<number, number>();
			for (const { session } of attended) {
				attendedByCourse.set(
					session.courseId,
					(attendedByCourse.get(session.courseId) ?? 0) + 1,
				);
			}

			return rows.map(
				({
					course: { ratings, ...course },
					grade,
					completed,
					...enrollment
				}) => ({
					enrollment: toOwnEnrollment(enrollment),
					course: toEnrollmentCourse(course, resolveCover),
					outcome: {
						grade,
						completed,
						attendedSessions: attendedByCourse.get(course.id) ?? 0,
						myRating: ratings.at(0)?.score ?? null,
					},
				}),
			);
		},

		async findRoster(courseId) {
			const rows = await prisma.enrollment.findMany({
				where: { courseId },
				orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
				select: {
					documentId: true,
					origin: true,
					status: true,
					result: true,
					updatedAt: true,
					dependency: { select: { name: true } },
					user: {
						select: {
							documentId: true,
							firstName: true,
							lastName: true,
							email: true,
						},
					},
				},
			});

			return rows.map(toRosterEntry);
		},

		async findParticipants(userDocumentIds, dependencyId) {
			if (userDocumentIds.length === 0) return [];

			const rows = await prisma.user.findMany({
				where: {
					documentId: { in: [...userDocumentIds] },
					type: "INTERNAL",
					archivedAt: null,
					dependencyId: dependencyId ?? { not: null },
				},
				select: PARTICIPANT_SELECT,
			});

			return toParticipants(rows);
		},

		async findGroupParticipants(groupIds) {
			if (groupIds.length === 0) return [];

			const rows = await prisma.user.findMany({
				where: {
					groupMemberships: { some: { groupId: { in: [...groupIds] } } },
					type: "INTERNAL",
					archivedAt: null,
					dependencyId: { not: null },
				},
				select: PARTICIPANT_SELECT,
			});

			return toParticipants(rows);
		},

		async searchCandidates({ courseId, dependencyId, search }) {
			const rows = await prisma.user.findMany({
				where: {
					type: "INTERNAL",
					archivedAt: null,
					dependencyId: dependencyId ?? { not: null },
					enrollments: { none: { courseId, status: { in: activeStatuses } } },
					...(search && {
						OR: CANDIDATE_SEARCHABLE_FIELDS.map((field) => ({
							[field]: insensitive(search),
						})),
					}),
				},
				orderBy: [{ firstName: "asc" }, { email: "asc" }],
				take: ENROLLMENT_CANDIDATES_LIMIT,
				select: {
					documentId: true,
					firstName: true,
					lastName: true,
					email: true,
					dependency: { select: { name: true } },
				},
			});

			return rows.map(({ dependency, ...candidate }) => ({
				...candidate,
				dependencyName: dependency?.name ?? "",
			}));
		},

		async findAvailableOrganizers({ filters, filter, now }) {
			// El filtro de dependencia se deja FUERA a propósito: si entrara, elegir
			// una dependencia dejaría el selector con esa sola opción y no habría
			// forma de volver. `distinct` sobre el resto da justo las que ofrecer.
			const rows = await prisma.course.findMany({
				where: availableWhere(
					{ ...filters, dependency: undefined },
					filter,
					now,
				),
				distinct: ["dependencyId"],
				select: { dependency: { select: { documentId: true, name: true } } },
				orderBy: { dependency: { name: "asc" } },
			});

			return rows.map(({ dependency }) => dependency);
		},
	};
};
