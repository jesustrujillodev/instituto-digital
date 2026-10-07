import { Prisma } from "@prisma/client";
import { isEffectiveMembership } from "@/modules/groups/domain/group.access";
import type { ICradle } from "@/shared/di/container.types";
import { resolveAssetRef } from "@/shared/storage/public-url";
import { openEnrollmentWhere } from "../domain/enrollment.access";
import {
	ACTIVE_ENROLLMENT_STATUSES,
	AVAILABLE_LIST_DEFAULTS,
	ENROLLMENT_CANDIDATES_LIMIT,
	MY_COURSE_STATUSES,
} from "../domain/enrollment.config";
import { EnrollmentStateChangedError } from "../domain/enrollment.errors";
import {
	toEnrollmentCourse,
	toOwnEnrollment,
	toRosterEntry,
} from "../domain/enrollment.mapper";
import type {
	CatalogFilter,
	CourseFilter,
	IEnrollmentRepository,
} from "../domain/enrollment.repository";
import type {
	EnrollmentWrite,
	ListAvailableCoursesDto,
	MyCourseRecord,
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
	hours: true,
	coverImageUrl: true,
	modality: true,
	format: true,
	completionRule: true,
	minAttendance: true,
	requiresEvaluation: true,
	minPassingGrade: true,
	access: true,
	status: true,
	capacity: true,
	enrollmentDeadline: true,
	enrollmentClosedAt: true,
	finishedAt: true,
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
const myCourseStatuses = [...MY_COURSE_STATUSES];

// Los filtros de dominio usan arreglos `readonly`, que Prisma no acepta tal cual.
const asWhere = (filter: CourseFilter) =>
	filter as unknown as Prisma.CourseWhereInput;

const insensitive = (search: string) => ({
	contains: search,
	mode: Prisma.QueryMode.insensitive,
});

const availableWhere = (
	filters: ListAvailableCoursesDto,
	filter: CatalogFilter,
	now: Date,
): Prisma.CourseWhereInput => ({
	AND: [
		asWhere(filter),
		...(openEnrollmentWhere(now) as unknown as Prisma.CourseWhereInput[]),
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
		resolveAssetRef(assetUrlResolver, reference);

	/** Las inscripciones de «Mis cursos», con lo que le fue a la persona en cada curso. */
	const readMyCourses = async (
		userId: number,
		where: Prisma.EnrollmentWhereInput,
	): Promise<MyCourseRecord[]> => {
		const mine = { ...where, userId, status: { in: myCourseStatuses } };
		// La asistencia se acota por la misma inscripción y no por los ids de la
		// primera lectura: así las dos viajan juntas en vez de una tras otra.
		const [rows, attended] = await Promise.all([
			prisma.enrollment.findMany({
				where: mine,
				orderBy: { updatedAt: "desc" },
				select: {
					documentId: true,
					origin: true,
					status: true,
					result: true,
					userId: true,
					actedById: true,
					grade: true,
					completed: true,
					progressPercent: true,
					contentCompletedAt: true,
					withdrawnAt: true,
					course: {
						select: {
							...COURSE_SELECT,
							ratings: { where: { userId }, select: { score: true } },
							certificateIssues: {
								where: { userId, revokedAt: null },
								select: { documentId: true },
							},
							certificate: { select: { isDownloadable: true } },
						},
					},
				},
			}),
			prisma.courseAttendance.findMany({
				where: {
					userId,
					attended: true,
					session: { course: { enrollments: { some: mine } } },
				},
				select: { session: { select: { courseId: true } } },
			}),
		]);
		const attendedByCourse = new Map<number, number>();
		for (const { session } of attended) {
			attendedByCourse.set(
				session.courseId,
				(attendedByCourse.get(session.courseId) ?? 0) + 1,
			);
		}

		return rows.map(
			({
				course: { ratings, certificateIssues, certificate, ...course },
				grade,
				completed,
				progressPercent,
				contentCompletedAt,
				withdrawnAt,
				...enrollment
			}) => ({
				enrollment: { ...toOwnEnrollment(enrollment), withdrawnAt },
				course: toEnrollmentCourse(course, resolveCover),
				outcome: {
					grade,
					completed,
					progressPercent,
					contentCompletedAt,
					attendedSessions: attendedByCourse.get(course.id) ?? 0,
					myRating: ratings.at(0)?.score ?? null,
					certificate: certificateIssues[0]
						? {
								documentId: certificateIssues[0].documentId,
								downloadable: certificate?.isDownloadable ?? true,
							}
						: null,
				},
			}),
		);
	};

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
					actedById: true,
					documentId: true,
					origin: true,
					status: true,
					result: true,
					completed: true,
				},
			});

			return (
				enrollment && {
					...toOwnEnrollment(enrollment),
					userId: enrollment.userId,
					completed: enrollment.completed,
				}
			);
		},

		async findParticipantEnrollment(courseId, userDocumentId) {
			const enrollment = await prisma.enrollment.findFirst({
				where: { courseId, user: { documentId: userDocumentId } },
				select: {
					userId: true,
					actedById: true,
					documentId: true,
					origin: true,
					status: true,
					result: true,
					completed: true,
					dependencyId: true,
					user: { select: { email: true, firstName: true, lastName: true } },
				},
			});

			return (
				enrollment && {
					...toOwnEnrollment(enrollment),
					userId: enrollment.userId,
					completed: enrollment.completed,
					dependencyId: enrollment.dependencyId,
					...enrollment.user,
				}
			);
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

		async markPendingAsFailed(courseId, actorId, at) {
			await prisma.enrollment.updateMany({
				where: { courseId, status: "ENROLLED", result: "PENDING" },
				data: {
					result: "FAILED",
					grade: null,
					resultRecordedById: actorId,
					resultRecordedAt: at,
				},
			});
		},

		async findProgressStates(courseId) {
			return prisma.enrollment.findMany({
				where: { courseId, status: "ENROLLED" },
				select: {
					userId: true,
					progressPercent: true,
					contentCompletedAt: true,
					result: true,
					grade: true,
					completed: true,
				},
			});
		},

		async saveProgress(courseId, writes) {
			for (const write of writes) {
				await prisma.enrollment.updateMany({
					where: { courseId, userId: write.userId, status: "ENROLLED" },
					data: { progressPercent: write.percent },
				});
				if (write.completedAt) {
					await prisma.enrollment.updateMany({
						where: {
							courseId,
							userId: write.userId,
							status: "ENROLLED",
							contentCompletedAt: null,
						},
						data: { contentCompletedAt: write.completedAt },
					});
				}
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
			return readMyCourses(userId, {});
		},

		async findMyCourse(userId, courseDocumentId) {
			const [record] = await readMyCourses(userId, {
				course: { documentId: courseDocumentId },
			});
			return record ?? null;
		},

		async findRoster(courseId, dependencyId) {
			const rows = await prisma.enrollment.findMany({
				where: { courseId, ...(dependencyId !== null && { dependencyId }) },
				orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
				select: {
					documentId: true,
					origin: true,
					status: true,
					result: true,
					userId: true,
					actedById: true,
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

		async countInvited(courseId, dependencyId) {
			return prisma.enrollment.count({
				where: {
					courseId,
					status: "INVITED",
					...(dependencyId !== null && { dependencyId }),
				},
			});
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

			const rows = await prisma.groupMember.findMany({
				where: {
					groupId: { in: [...groupIds] },
					user: {
						type: "INTERNAL",
						archivedAt: null,
						dependencyId: { not: null },
					},
				},
				select: {
					group: { select: { dependencyId: true } },
					user: { select: PARTICIPANT_SELECT },
				},
			});

			// Quien está en varios de los grupos se cuenta una vez.
			const members = new Map<number, (typeof rows)[number]["user"]>();
			for (const row of rows) {
				if (isEffectiveMembership(row.user, row.group)) {
					members.set(row.user.id, row.user);
				}
			}

			return toParticipants([...members.values()]);
		},

		async findGroupEnrollable({ courseId, groupIds, dependencyId }) {
			if (groupIds.length === 0) return [];

			const rows = await prisma.groupMember.findMany({
				where: {
					groupId: { in: [...groupIds] },
					user: {
						type: "INTERNAL",
						archivedAt: null,
						dependencyId: dependencyId ?? { not: null },
						enrollments: { none: { courseId, status: "ENROLLED" } },
					},
				},
				select: {
					groupId: true,
					group: { select: { dependencyId: true } },
					user: { select: { documentId: true, dependencyId: true } },
				},
			});

			return rows
				.filter((row) => isEffectiveMembership(row.user, row.group))
				.map((row) => ({
					groupId: row.groupId,
					userDocumentId: row.user.documentId,
				}));
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
					dependencyId: true,
					dependency: { select: { name: true } },
				},
			});

			return rows.flatMap(({ dependency, dependencyId, ...candidate }) =>
				dependencyId === null
					? []
					: [
							{
								...candidate,
								dependencyId,
								dependencyName: dependency?.name ?? "",
							},
						],
			);
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
