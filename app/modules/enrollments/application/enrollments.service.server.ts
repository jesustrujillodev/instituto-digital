import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	type CourseScope,
	courseScopeWriteWhere,
	courseVisibilityWhere,
	dependencyVisibilityWhere,
	resolveCourseScope,
	toAudienceScope,
} from "@/modules/courses/domain/course.access";
import {
	toNotifiedCourse,
	toNotifiedSessions,
} from "@/modules/notifications/domain/notification.mapper";
import type { Recipient } from "@/modules/notifications/domain/notification.types";
import { canRateCourse } from "@/modules/ratings/domain/rating.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	ACTIVE_ENROLLMENT_STATUSES,
	AVAILABLE_LIST_DEFAULTS,
} from "../domain/enrollment.config";
import {
	EnrollmentAlreadyEnrolledError,
	EnrollmentClosedError,
	EnrollmentCourseNotFoundError,
	EnrollmentForbiddenScopeError,
	EnrollmentInvitationNotFoundError,
	EnrollmentInvitationsDisabledError,
	EnrollmentNotEligibleError,
	EnrollmentNotEnrolledError,
	EnrollmentStateChangedError,
	EnrollmentUnknownGroupError,
	EnrollmentUnknownParticipantError,
	EnrollmentWithdrawClosedError,
} from "../domain/enrollment.errors";
import {
	toAvailableCourse,
	withAvailability,
} from "../domain/enrollment.mapper";
import type { CourseFilter } from "../domain/enrollment.repository";
import {
	acceptsInvitations,
	assertSeatsFor,
	assertSelfEnrollable,
	canParticipate,
	canSelfEnroll,
	canTransition,
	canWithdraw,
	classifyMyCourse,
	enrollmentClosesAt,
	isEnrollmentOpen,
} from "../domain/enrollment.rules";
import type { IEnrollmentService } from "../domain/enrollment.service";
import type {
	AssignParticipantsDto,
	EnrollmentCourse,
	EnrollmentWrite,
	InviteParticipantsDto,
	ListAvailableCoursesDto,
	MyCourses,
	ParticipantAccount,
} from "../domain/enrollment.types";

type Dependencies = {
	enrollmentRepository: ICradle["enrollmentRepository"];
	courseRepository: ICradle["courseRepository"];
	groupRepository: ICradle["groupRepository"];
	notificationService: ICradle["notificationService"];
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

const unique = (values: readonly string[]): string[] => [...new Set(values)];

/** Dependencia a la que se limita el personal asignable; `null` en el alcance global. */
const assignableDependencyOf = (scope: CourseScope): number | null =>
	scope.kind === "dependency" || scope.kind === "creator"
		? scope.dependencyId
		: null;

/** El curso cuyas inscripciones opera el actor, y desde qué lado. */
interface RosterAccess {
	course: EnrollmentCourse;
	scope: CourseScope;
	organizer: boolean;
	/** Tope de personas que alcanza al inscribir; `null` es cualquiera. */
	assignLimit: number | null;
	/** Lo mismo al invitar: quien organiza invita a gente de otras dependencias. */
	inviteLimit: number | null;
}

export const createEnrollmentService = ({
	enrollmentRepository,
	courseRepository,
	groupRepository,
	notificationService,
	runInTransaction,
	clock,
	logger,
}: Dependencies): IEnrollmentService => {
	const run = createOperationRunner(logger.child({ module: "enrollments" }));

	const requireParticipant = (actor: AuthContext): number => {
		if (!canParticipate(actor) || actor.dependencyId === null) {
			throw new EnrollmentNotEligibleError();
		}
		return actor.dependencyId;
	};

	const visibilityOf = async (actor: AuthContext) =>
		courseVisibilityWhere({
			userId: actor.userId,
			role: actor.role,
			dependencyId: actor.dependencyId,
			isTrainer: actor.isTrainer,
			groupIds: await groupRepository.findGroupIdsOfUser(actor.userId),
		});

	const requireCourse = async (
		documentId: string,
		filter: CourseFilter | null,
	): Promise<EnrollmentCourse> => {
		const course = filter
			? await enrollmentRepository.findCourse(documentId, filter)
			: null;
		if (!course) throw new EnrollmentCourseNotFoundError();

		return course;
	};

	const persist = (
		data: EnrollmentWrite,
		expected: EnrollmentWrite["status"] | null,
	) => {
		if (!canTransition(expected, data.status)) {
			throw new EnrollmentStateChangedError();
		}
		return enrollmentRepository.save(data, expected);
	};

	/** Un aviso por persona sobre este curso, con sus sesiones de ahora. */
	const notifyCourse = (
		template:
			| "COURSE_INVITATION"
			| "ENROLLMENT_CONFIRMED"
			| "ENROLLMENT_ASSIGNED",
		course: EnrollmentCourse,
		recipients: readonly Recipient[],
	) =>
		recipients.length === 0
			? Promise.resolve()
			: notificationService.notify(
					recipients.map((to) => ({
						template,
						to,
						course: toNotifiedCourse(course),
						sessions: toNotifiedSessions(course.sessions),
					})),
				);

	/** El `AuthContext` no trae el nombre: el saludo cae en "Hola:". */
	const actorRecipient = (actor: AuthContext): Recipient => ({
		email: actor.email,
		firstName: null,
		lastName: null,
	});

	const requireOpen = (course: EnrollmentCourse, now: Date) => {
		if (!isEnrollmentOpen(course, now)) {
			throw new EnrollmentClosedError(enrollmentClosesAt(course));
		}
	};

	/**
	 * Quien organiza el curso opera sus inscripciones completas. Una dependencia
	 * que lo ve sin organizarlo (§6.6) solo manda y ve a su propio personal.
	 */
	const requireRosterAccess = async (
		documentId: string,
		actor: AuthContext,
	): Promise<RosterAccess> => {
		const scope = resolveCourseScope(actor);
		const write = courseScopeWriteWhere(scope);
		if (write === null) throw new EnrollmentForbiddenScopeError();

		const assignLimit = assignableDependencyOf(scope);
		const managed = await enrollmentRepository.findCourse(documentId, write);
		if (managed) {
			return {
				course: managed,
				scope,
				organizer: true,
				assignLimit,
				inviteLimit: null,
			};
		}
		if (scope.kind !== "dependency") throw new EnrollmentCourseNotFoundError();

		return {
			course: await requireCourse(
				documentId,
				dependencyVisibilityWhere(scope.dependencyId),
			),
			scope,
			organizer: false,
			assignLimit,
			inviteLimit: scope.dependencyId,
		};
	};

	/**
	 * Personas y miembros de grupos de un lote, sin repetir.
	 *
	 * Una persona elegida fuera del tope rechaza el lote entero; un miembro de
	 * grupo fuera del tope solo se omite, porque nadie lo eligió a él.
	 */
	const resolveBatch = async (
		dto: AssignParticipantsDto,
		access: RosterAccess,
		limit: number | null,
	) => {
		const userDocumentIds = unique(dto.userDocumentIds ?? []);
		const groupDocumentIds = unique(dto.groupDocumentIds ?? []);

		const [people, groups] = await Promise.all([
			enrollmentRepository.findParticipants(userDocumentIds, limit),
			courseRepository.findEligibleGroups(
				groupDocumentIds,
				toAudienceScope(access.scope),
			),
		]);
		if (people.length !== userDocumentIds.length) {
			throw new EnrollmentUnknownParticipantError();
		}
		if (groups.length !== groupDocumentIds.length) {
			throw new EnrollmentUnknownGroupError();
		}

		const members = groups.length
			? await enrollmentRepository.findGroupParticipants(
					groups.map((group) => group.id),
				)
			: [];

		const reachable = new Map<number, ParticipantAccount>();
		for (const participant of people) {
			reachable.set(participant.id, participant);
		}

		const requested = new Set(reachable.keys());
		for (const member of members) {
			requested.add(member.id);
			if (limit === null || member.dependencyId === limit) {
				reachable.set(member.id, member);
			}
		}

		return { reachable, requested: requested.size };
	};

	return {
		async listAvailable(filters: ListAvailableCoursesDto, actor: AuthContext) {
			return run("listAvailable", async () => {
				requireParticipant(actor);
				const filter = await visibilityOf(actor);
				const now = clock.now();

				// Las tres consultas comparten filtro y son independientes entre sí:
				// encadenarlas triplicaría la latencia de la primera pantalla que ve
				// un participante.
				const [rows, total, organizers] = await Promise.all([
					enrollmentRepository.findAvailable({
						filters,
						filter,
						now,
						userId: actor.userId,
					}),
					enrollmentRepository.countAvailable({
						filters,
						filter,
						now,
						userId: actor.userId,
					}),
					enrollmentRepository.findAvailableOrganizers({
						filters,
						filter,
						now,
						userId: actor.userId,
					}),
				]);

				return ok(
					{
						courses: rows.map((row) =>
							toAvailableCourse(row.course, row.myStatus, now),
						),
						organizers,
					},
					{
						pagination: toPaginationMeta({
							page: filters.page ?? AVAILABLE_LIST_DEFAULTS.page,
							pageSize: filters.pageSize ?? AVAILABLE_LIST_DEFAULTS.pageSize,
							total,
						}),
					},
				);
			});
		},

		async findAvailable(courseDocumentId: string, actor: AuthContext) {
			return run("findAvailable", async () => {
				requireParticipant(actor);
				const course = await requireCourse(
					courseDocumentId,
					await visibilityOf(actor),
				);
				const now = clock.now();
				const detail = withAvailability(course, now);

				const scope = resolveCourseScope(actor);
				const [enrollment, visibleToDependency] = await Promise.all([
					enrollmentRepository.findEnrollment(course.id, actor.userId),
					scope.kind === "dependency"
						? enrollmentRepository.findCourse(
								courseDocumentId,
								dependencyVisibilityWhere(scope.dependencyId),
							)
						: Promise.resolve(null),
				]);
				const status = enrollment?.status ?? null;

				return ok({
					course: detail,
					enrollment: enrollment && {
						documentId: enrollment.documentId,
						origin: enrollment.origin,
						status: enrollment.status,
						result: enrollment.result,
					},
					can: {
						enroll:
							detail.isOpen &&
							status !== "ENROLLED" &&
							status !== "INVITED" &&
							canSelfEnroll(course, status),
						withdraw:
							status === "ENROLLED" &&
							canWithdraw(course, now, enrollment?.completed ?? false),
						accept: status === "INVITED" && detail.isOpen,
						decline: status === "INVITED",
						assign: detail.isOpen && visibleToDependency !== null,
					},
				});
			});
		},

		async listMine(actor: AuthContext) {
			return run("listMine", async () => {
				requireParticipant(actor);
				const now = clock.now();
				const entries = await enrollmentRepository.findMine(actor.userId);

				const mine: MyCourses = {
					invitations: [],
					upcoming: [],
					inProgress: [],
					finished: [],
				};

				for (const record of entries) {
					const entry = {
						...record,
						canRate:
							record.outcome.myRating === null &&
							canRateCourse({
								courseStatus: record.course.status,
								courseFormat: record.course.format,
								enrollmentStatus: record.enrollment.status,
								attendedSessions: record.outcome.attendedSessions,
								completed: record.outcome.completed,
							}),
					};
					if (entry.enrollment.status === "INVITED") {
						if (entry.course.status === "PUBLISHED") {
							mine.invitations.push(entry);
						}
						continue;
					}
					mine[
						classifyMyCourse(entry.course, now, entry.outcome.completed)
					].push(entry);
				}

				return ok(mine);
			});
		},

		async listRoster(courseDocumentId: string, actor: AuthContext) {
			return run("listRoster", async () => {
				const access = await requireRosterAccess(courseDocumentId, actor);

				return ok({
					course: withAvailability(access.course, clock.now()),
					entries: await enrollmentRepository.findRoster(
						access.course.id,
						access.organizer ? null : access.inviteLimit,
					),
					reach: {
						organizer: access.organizer,
						canInvite: acceptsInvitations(access.course),
					},
				});
			});
		},

		async listRosterOptions(
			courseDocumentId: string,
			search: string | undefined,
			actor: AuthContext,
		) {
			return run("listRosterOptions", async () => {
				const access = await requireRosterAccess(courseDocumentId, actor);
				const { course, assignLimit } = access;

				const [candidates, groups] = await Promise.all([
					enrollmentRepository.searchCandidates({
						courseId: course.id,
						dependencyId: acceptsInvitations(course)
							? access.inviteLimit
							: assignLimit,
						search,
					}),
					groupRepository.findActive(toAudienceScope(access.scope)),
				]);

				const enrollable = await enrollmentRepository.findGroupEnrollable({
					courseId: course.id,
					groupIds: groups.map((group) => group.id),
					dependencyId: assignLimit,
				});

				return ok({
					candidates: candidates.map(({ dependencyId, ...candidate }) => ({
						...candidate,
						assignable: assignLimit === null || dependencyId === assignLimit,
					})),
					groups: groups.map((group) => ({
						documentId: group.documentId,
						name: group.name,
						dependencyName: group.dependencyName,
						memberCount: group.memberCount,
						enrollableMemberIds: enrollable
							.filter((row) => row.groupId === group.id)
							.map((row) => row.userDocumentId),
					})),
				});
			});
		},

		async enroll(courseDocumentId: string, actor: AuthContext) {
			return run("enroll", async () => {
				const dependencyId = requireParticipant(actor);
				const course = await requireCourse(
					courseDocumentId,
					await visibilityOf(actor),
				);
				const now = clock.now();
				requireOpen(course, now);

				await runInTransaction(async () => {
					const seats = await enrollmentRepository.lockCourseSeats(course.id);
					const current = await enrollmentRepository.findEnrollment(
						course.id,
						actor.userId,
					);

					if (current?.status === "ENROLLED") {
						throw new EnrollmentAlreadyEnrolledError();
					}
					assertSelfEnrollable(course, current?.status ?? null);
					assertSeatsFor(seats.capacity, seats.enrolled, 1);

					await persist(
						{
							courseId: course.id,
							userId: actor.userId,
							dependencyId,
							origin: current?.status === "INVITED" ? "INVITATION" : "SELF",
							status: "ENROLLED",
							actedById: actor.userId,
							at: now,
						},
						current?.status ?? null,
					);
					await notifyCourse("ENROLLMENT_CONFIRMED", course, [
						actorRecipient(actor),
					]);
				});

				return ok(null);
			});
		},

		async withdraw(courseDocumentId: string, actor: AuthContext) {
			return run("withdraw", async () => {
				const dependencyId = requireParticipant(actor);
				const course = await requireCourse(
					courseDocumentId,
					await visibilityOf(actor),
				);
				const current = await enrollmentRepository.findEnrollment(
					course.id,
					actor.userId,
				);

				if (current?.status !== "ENROLLED") {
					throw new EnrollmentNotEnrolledError();
				}

				const now = clock.now();
				if (!canWithdraw(course, now, current.completed)) {
					throw new EnrollmentWithdrawClosedError();
				}

				await persist(
					{
						courseId: course.id,
						userId: actor.userId,
						dependencyId,
						origin: current.origin,
						status: "WITHDRAWN",
						actedById: actor.userId,
						at: now,
					},
					"ENROLLED",
				);

				return ok(null);
			});
		},

		async accept(courseDocumentId: string, actor: AuthContext) {
			return run("accept", async () => {
				const dependencyId = requireParticipant(actor);
				const course = await requireCourse(
					courseDocumentId,
					await visibilityOf(actor),
				);
				const invitation = await enrollmentRepository.findEnrollment(
					course.id,
					actor.userId,
				);

				if (invitation?.status !== "INVITED") {
					throw new EnrollmentInvitationNotFoundError();
				}

				const now = clock.now();
				requireOpen(course, now);

				await runInTransaction(async () => {
					const seats = await enrollmentRepository.lockCourseSeats(course.id);
					assertSeatsFor(seats.capacity, seats.enrolled, 1);

					await persist(
						{
							courseId: course.id,
							userId: actor.userId,
							dependencyId,
							origin: invitation.origin,
							status: "ENROLLED",
							actedById: actor.userId,
							at: now,
						},
						"INVITED",
					);
					await notifyCourse("ENROLLMENT_CONFIRMED", course, [
						actorRecipient(actor),
					]);
				});

				return ok(null);
			});
		},

		async decline(courseDocumentId: string, actor: AuthContext) {
			return run("decline", async () => {
				const dependencyId = requireParticipant(actor);
				const course = await requireCourse(
					courseDocumentId,
					await visibilityOf(actor),
				);
				const invitation = await enrollmentRepository.findEnrollment(
					course.id,
					actor.userId,
				);

				if (invitation?.status !== "INVITED") {
					throw new EnrollmentInvitationNotFoundError();
				}

				await persist(
					{
						courseId: course.id,
						userId: actor.userId,
						dependencyId,
						origin: invitation.origin,
						status: "DECLINED",
						actedById: actor.userId,
						at: clock.now(),
					},
					"INVITED",
				);

				return ok(null);
			});
		},

		async assign(
			courseDocumentId: string,
			dto: AssignParticipantsDto,
			actor: AuthContext,
		) {
			return run("assign", async () => {
				const access = await requireRosterAccess(courseDocumentId, actor);
				const { course } = access;
				const now = clock.now();
				requireOpen(course, now);

				const { reachable, requested } = await resolveBatch(
					dto,
					access,
					access.assignLimit,
				);

				return ok(
					await runInTransaction(async () => {
						const seats = await enrollmentRepository.lockCourseSeats(course.id);
						const existing = new Map(
							(
								await enrollmentRepository.findEnrollments(course.id, [
									...reachable.keys(),
								])
							).map((entry) => [entry.userId, entry.status]),
						);
						const pending = [...reachable.values()].filter(
							(participant) => existing.get(participant.id) !== "ENROLLED",
						);

						assertSeatsFor(seats.capacity, seats.enrolled, pending.length);

						for (const participant of pending) {
							await persist(
								{
									courseId: course.id,
									userId: participant.id,
									dependencyId: participant.dependencyId,
									origin: "ASSIGNED",
									status: "ENROLLED",
									actedById: actor.userId,
									at: now,
								},
								existing.get(participant.id) ?? null,
							);
						}
						await notifyCourse("ENROLLMENT_ASSIGNED", course, pending);

						return {
							affected: pending.length,
							skipped: requested - pending.length,
						};
					}),
				);
			});
		},

		async invite(
			courseDocumentId: string,
			dto: InviteParticipantsDto,
			actor: AuthContext,
		) {
			return run("invite", async () => {
				const access = await requireRosterAccess(courseDocumentId, actor);
				const { course } = access;
				if (!acceptsInvitations(course)) {
					throw new EnrollmentInvitationsDisabledError();
				}
				const now = clock.now();
				requireOpen(course, now);

				const { reachable, requested } = await resolveBatch(
					dto,
					access,
					access.inviteLimit,
				);

				return ok(
					await runInTransaction(async () => {
						const existing = new Map(
							(
								await enrollmentRepository.findEnrollments(course.id, [
									...reachable.keys(),
								])
							).map((entry) => [entry.userId, entry.status]),
						);
						const pending = [...reachable.values()].filter((participant) => {
							const status = existing.get(participant.id);
							return !status || !ACTIVE_ENROLLMENT_STATUSES.includes(status);
						});

						for (const participant of pending) {
							await persist(
								{
									courseId: course.id,
									userId: participant.id,
									dependencyId: participant.dependencyId,
									origin: "INVITATION",
									status: "INVITED",
									actedById: actor.userId,
									at: now,
								},
								existing.get(participant.id) ?? null,
							);
						}
						await notifyCourse("COURSE_INVITATION", course, pending);

						return {
							affected: pending.length,
							skipped: requested - pending.length,
						};
					}),
				);
			});
		},
	};
};
