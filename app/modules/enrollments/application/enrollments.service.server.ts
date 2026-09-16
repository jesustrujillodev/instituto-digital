import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	type CourseScope,
	courseScopeWhere,
	courseScopeWriteWhere,
	courseVisibilityWhere,
	dependencyVisibilityWhere,
	resolveCourseScope,
	toAudienceScope,
} from "@/modules/courses/domain/course.access";
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
	assertSeatsFor,
	canParticipate,
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
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

const unique = (values: readonly string[]): string[] => [...new Set(values)];

/** Filtro de cursos a los que el actor puede asignar personal (§6.6). */
const assignFilterOf = (scope: CourseScope): CourseFilter | null => {
	switch (scope.kind) {
		case "global":
			return {};
		case "dependency":
			return dependencyVisibilityWhere(scope.dependencyId);
		case "creator":
			return courseScopeWriteWhere(scope);
		case "none":
			return null;
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

/** Dependencia a la que se limita el personal asignable; `null` en el alcance global. */
const assignableDependencyOf = (scope: CourseScope): number | null =>
	scope.kind === "dependency" || scope.kind === "creator"
		? scope.dependencyId
		: null;

export const createEnrollmentService = ({
	enrollmentRepository,
	courseRepository,
	groupRepository,
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

	const requireOpen = (course: EnrollmentCourse, now: Date) => {
		if (!isEnrollmentOpen(course, now)) {
			throw new EnrollmentClosedError(enrollmentClosesAt(course));
		}
	};

	/** El curso que el actor administra, con el alcance de escritura. */
	const requireManagedCourse = (documentId: string, actor: AuthContext) => {
		const scope = resolveCourseScope(actor);
		const filter = courseScopeWriteWhere(scope);
		if (filter === null) throw new EnrollmentForbiddenScopeError();

		return requireCourse(documentId, filter).then((course) => ({
			course,
			scope,
		}));
	};

	return {
		async listAvailable(filters: ListAvailableCoursesDto, actor: AuthContext) {
			return run("listAvailable", async () => {
				requireParticipant(actor);
				const filter = await visibilityOf(actor);
				const now = clock.now();

				const [rows, total] = await Promise.all([
					enrollmentRepository.findAvailable({
						filters,
						filter,
						now,
						userId: actor.userId,
					}),
					enrollmentRepository.countAvailable({ filters, filter, now }),
				]);

				return ok(
					rows.map((row) => toAvailableCourse(row.course, row.myStatus)),
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
							detail.isOpen && status !== "ENROLLED" && status !== "INVITED",
						withdraw: status === "ENROLLED" && canWithdraw(course, now),
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
								enrollmentStatus: record.enrollment.status,
								attendedSessions: record.outcome.attendedSessions,
							}),
					};
					if (entry.enrollment.status === "INVITED") {
						if (entry.course.status === "PUBLISHED") {
							mine.invitations.push(entry);
						}
						continue;
					}
					mine[classifyMyCourse(entry.course, now)].push(entry);
				}

				return ok(mine);
			});
		},

		async listAssignCandidates(
			courseDocumentId: string,
			search: string | undefined,
			actor: AuthContext,
		) {
			return run("listAssignCandidates", async () => {
				const scope = resolveCourseScope(actor);
				const course = await requireCourse(
					courseDocumentId,
					assignFilterOf(scope),
				);

				return ok(
					await enrollmentRepository.searchCandidates({
						courseId: course.id,
						dependencyId: assignableDependencyOf(scope),
						search,
					}),
				);
			});
		},

		async listRoster(courseDocumentId: string, actor: AuthContext) {
			return run("listRoster", async () => {
				const scope = resolveCourseScope(actor);
				if (scope.kind === "none") throw new EnrollmentForbiddenScopeError();

				const course = await requireCourse(
					courseDocumentId,
					courseScopeWhere(scope),
				);

				return ok({
					course: withAvailability(course, clock.now()),
					entries: await enrollmentRepository.findRoster(course.id),
				});
			});
		},

		async listRosterOptions(
			courseDocumentId: string,
			search: string | undefined,
			actor: AuthContext,
		) {
			return run("listRosterOptions", async () => {
				const { course, scope } = await requireManagedCourse(
					courseDocumentId,
					actor,
				);

				const [candidates, groups] = await Promise.all([
					enrollmentRepository.searchCandidates({
						courseId: course.id,
						dependencyId: null,
						search,
					}),
					groupRepository.findActive(toAudienceScope(scope)),
				]);

				return ok({
					candidates,
					groups: groups.map((group) => ({
						documentId: group.documentId,
						name: group.name,
						dependencyName: group.dependencyName,
						memberCount: group.memberCount,
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
				if (!canWithdraw(course, now)) {
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
				const scope = resolveCourseScope(actor);
				const filter = assignFilterOf(scope);
				if (filter === null) throw new EnrollmentForbiddenScopeError();

				const course = await requireCourse(courseDocumentId, filter);
				const now = clock.now();
				requireOpen(course, now);

				const requested = unique(dto.userDocumentIds);
				const participants = await enrollmentRepository.findParticipants(
					requested,
					assignableDependencyOf(scope),
				);
				if (participants.length !== requested.length) {
					throw new EnrollmentUnknownParticipantError();
				}

				return ok(
					await runInTransaction(async () => {
						const seats = await enrollmentRepository.lockCourseSeats(course.id);
						const existing = new Map(
							(
								await enrollmentRepository.findEnrollments(
									course.id,
									participants.map((participant) => participant.id),
								)
							).map((entry) => [entry.userId, entry.status]),
						);
						const pending = participants.filter(
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

						return {
							affected: pending.length,
							skipped: participants.length - pending.length,
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
				const { course, scope } = await requireManagedCourse(
					courseDocumentId,
					actor,
				);
				const now = clock.now();
				requireOpen(course, now);

				const userDocumentIds = unique(dto.userDocumentIds ?? []);
				const groupDocumentIds = unique(dto.groupDocumentIds ?? []);

				const [people, groups] = await Promise.all([
					enrollmentRepository.findParticipants(userDocumentIds, null),
					courseRepository.findEligibleGroups(
						groupDocumentIds,
						toAudienceScope(scope),
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

				const invitees = new Map<number, ParticipantAccount>();
				for (const participant of [...people, ...members]) {
					invitees.set(participant.id, participant);
				}

				return ok(
					await runInTransaction(async () => {
						const existing = new Map(
							(
								await enrollmentRepository.findEnrollments(course.id, [
									...invitees.keys(),
								])
							).map((entry) => [entry.userId, entry.status]),
						);
						const pending = [...invitees.values()].filter((participant) => {
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

						return {
							affected: pending.length,
							skipped: invitees.size - pending.length,
						};
					}),
				);
			});
		},
	};
};
