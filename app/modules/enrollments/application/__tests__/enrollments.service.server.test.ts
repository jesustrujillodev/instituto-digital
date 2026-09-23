import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { NotificationEvent } from "@/modules/notifications/domain/notification.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type { Role } from "@/shared/rules/atoms.rules";
import type { EnrollmentStatus } from "../../domain/enrollment.config";
import { ENROLLMENT_ERROR_CODES } from "../../domain/enrollment.errors";
import type {
	CandidateAccount,
	EnrollmentCourse,
	EnrollmentWrite,
	MyCourseEntry,
	MyCourseRecord,
	ParticipantAccount,
} from "../../domain/enrollment.types";
import { createEnrollmentService } from "../enrollments.service.server";

const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEPENDENCY_DOC_ID = "44444444-4444-4444-8444-444444444444";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-09-16T18:00:00.000Z");

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const courseOf = (
	overrides: Partial<EnrollmentCourse> = {},
): EnrollmentCourse => ({
	id: 7,
	documentId: COURSE_ID,
	dependencyName: "SEDESOL",
	title: "Atención ciudadana",
	description: null,
	hours: null,
	coverUrl: null,
	modality: "IN_PERSON",
	format: "SCHEDULED",
	completionRule: "ATTENDANCE",
	access: "PUBLIC",
	status: "PUBLISHED",
	capacity: null,
	enrolledCount: 0,
	enrollmentDeadline: null,
	enrollmentClosedAt: null,
	finishedAt: null,
	sessions: [
		{
			documentId: "s1",
			startsAt: new Date("2026-10-20T23:00:00.000Z"),
			endsAt: new Date("2026-10-21T02:00:00.000Z"),
			venue: "Sala",
			link: null,
		},
	],
	trainers: [],
	firstSessionAt: new Date("2026-10-20T23:00:00.000Z"),
	lastSessionEndsAt: new Date("2026-10-21T02:00:00.000Z"),
	...overrides,
});

const actorOf = (
	role: Role = "USER",
	overrides: Partial<AuthContext> = {},
): AuthContext => ({
	userId: 50,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "miguel.sds@instituto.gob.mx",
	role,
	dependencyId: 4,
	isTrainer: false,
	...overrides,
});

const participantOf = (id: number, documentId: string): ParticipantAccount => ({
	id,
	documentId,
	dependencyId: 4,
	email: `persona-${id}@instituto.gob.mx`,
	firstName: `Persona ${id}`,
	lastName: null,
});

interface HarnessOptions {
	course?: EnrollmentCourse | null;
	/** `false`: el actor ve el curso por su dependencia, pero no lo organiza. */
	managed?: boolean;
	candidates?: CandidateAccount[];
	enrollable?: { groupId: number; userDocumentId: string }[];
	own?: EnrollmentStatus | null;
	seats?: { capacity: number | null; enrolled: number };
	participants?: ParticipantAccount[];
	groupMembers?: ParticipantAccount[];
	eligibleGroups?: number;
	existing?: { userId: number; status: EnrollmentStatus }[];
	mine?: MyCourseRecord[];
	available?: EnrollmentCourse[];
}

const createHarness = (options: HarnessOptions = {}) => {
	let txDepth = 0;
	const calls = {
		notified: [] as { events: NotificationEvent[]; inTransaction: boolean }[],
		transactions: 0,
		locks: [] as number[],
		lockedInTransaction: [] as boolean[],
		saved: [] as { data: EnrollmentWrite; expected: EnrollmentStatus | null }[],
		courseFilters: [] as unknown[],
		participantScopes: [] as (number | null)[],
		availableFilters: [] as unknown[],
		organizerFilters: [] as unknown[],
		rosterScopes: [] as (number | null)[],
		candidateScopes: [] as (number | null)[],
	};
	let inTransaction = false;

	const enrollmentRepository = {
		findCourse: async (_documentId: string, filter: object) => {
			calls.courseFilters.push(filter);
			// El filtro de escritura son igualdades; el de visibilidad, un `OR`.
			if (options.managed === false && !("OR" in filter)) return null;
			return options.course === undefined ? courseOf() : options.course;
		},
		findRoster: async (_courseId: number, dependencyId: number | null) => {
			calls.rosterScopes.push(dependencyId);
			return [];
		},
		findGroupEnrollable: async () => options.enrollable ?? [],
		findEnrollment: async () =>
			options.own
				? {
						userId: 50,
						documentId: "e1",
						origin: "INVITATION",
						status: options.own,
						result: "PENDING",
					}
				: null,
		findEnrollments: async () =>
			(options.existing ?? []).map((entry) => ({
				...entry,
				origin: "SELF",
			})),
		lockCourseSeats: async (courseId: number) => {
			calls.locks.push(courseId);
			calls.lockedInTransaction.push(inTransaction);
			return options.seats ?? { capacity: null, enrolled: 0 };
		},
		save: async (data: EnrollmentWrite, expected: EnrollmentStatus | null) => {
			calls.saved.push({ data, expected });
		},
		findParticipants: async (
			ids: readonly string[],
			dependencyId: number | null,
		) => {
			calls.participantScopes.push(dependencyId);
			return (
				options.participants ??
				ids.map((documentId, index) => participantOf(100 + index, documentId))
			);
		},
		findGroupParticipants: async () => options.groupMembers ?? [],
		findMine: async () => options.mine ?? [],
		searchCandidates: async (params: { dependencyId: number | null }) => {
			calls.candidateScopes.push(params.dependencyId);
			return options.candidates ?? [];
		},
		findAvailable: async (params: { filters: unknown; filter: unknown }) => {
			calls.availableFilters.push(params.filters);
			calls.courseFilters.push(params.filter);
			return (options.available ?? [courseOf()]).map((course) => ({
				course,
				myStatus: null,
			}));
		},
		countAvailable: async () => (options.available ?? [courseOf()]).length,
		findAvailableOrganizers: async (params: { filters: unknown }) => {
			calls.organizerFilters.push(params.filters);
			return [{ documentId: DEPENDENCY_DOC_ID, name: "SEDESOL" }];
		},
	} as unknown as ICradle["enrollmentRepository"];

	const courseRepository = {
		findEligibleGroups: async (ids: readonly string[]) =>
			Array.from({ length: options.eligibleGroups ?? ids.length }, (_, i) => ({
				id: 900 + i,
				documentId: ids[i] ?? "g",
			})),
	} as unknown as ICradle["courseRepository"];

	const groupRepository = {
		findGroupIdsOfUser: async () => [5],
		findActive: async () => [
			{
				id: 900,
				documentId: GROUP_ID,
				name: "Ventanilla",
				dependencyName: "SEDESOL",
				memberCount: 3,
			},
		],
	} as unknown as ICradle["groupRepository"];

	const runInTransaction = (async <T>(callback: () => Promise<T>) => {
		calls.transactions += 1;
		inTransaction = true;
		txDepth += 1;
		try {
			return await callback();
		} finally {
			inTransaction = false;
			txDepth -= 1;
		}
	}) as unknown as ICradle["runInTransaction"];

	const notificationService = {
		notify: async (events: NotificationEvent[]) => {
			calls.notified.push({ events, inTransaction: txDepth > 0 });
			return {
				success: true as const,
				data: { queued: events.length },
				timestamp: new Date().toISOString(),
			};
		},
	} as unknown as ICradle["notificationService"];

	const service = createEnrollmentService({
		notificationService,
		enrollmentRepository,
		courseRepository,
		groupRepository,
		runInTransaction,
		clock: { now: () => NOW },
		logger: silentLogger,
	});

	return { service, calls };
};

describe("enrollmentService.listAvailable", () => {
	test("devuelve la página y las opciones del filtro con su paginación", async () => {
		const { service } = createHarness();

		const result = await service.listAvailable({}, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: {
				courses: [{ documentId: COURSE_ID, coverUrl: null }],
				organizers: [{ name: "SEDESOL" }],
			},
			pagination: { page: 1, pageSize: 12 },
		});
	});

	test("las opciones del filtro salen del MISMO alcance de visibilidad", async () => {
		const { service, calls } = createHarness();

		await service.listAvailable({ modality: "ONLINE" }, actorOf());

		// Ofrecer dependencias que el visor no puede ver filtraría a cero y, peor,
		// revelaría que existen.
		expect(calls.courseFilters).toHaveLength(1);
		expect(calls.organizerFilters).toEqual([{ modality: "ONLINE" }]);
	});

	test("un actor que no puede cursar no ve catálogo", async () => {
		const { service } = createHarness();

		const result = await service.listAvailable({}, actorOf("SUPERADMIN"));

		expect(result).toMatchObject({
			success: false,
			error: { code: ENROLLMENT_ERROR_CODES.NOT_ELIGIBLE },
		});
	});
});

describe("enrollmentService.enroll", () => {
	test("inscribe dentro de una transacción con el curso bloqueado", async () => {
		const { service, calls } = createHarness({
			seats: { capacity: 20, enrolled: 3 },
		});

		const result = await service.enroll(COURSE_ID, actorOf());

		expect(result.success).toBe(true);
		expect(calls.lockedInTransaction).toEqual([true]);
		expect(calls.saved).toEqual([
			{
				data: {
					courseId: 7,
					userId: 50,
					dependencyId: 4,
					origin: "SELF",
					status: "ENROLLED",
					actedById: 50,
					at: NOW,
				},
				expected: null,
			},
		]);
	});

	test("la visibilidad incluye los grupos actuales de la persona", async () => {
		const { service, calls } = createHarness();

		await service.enroll(COURSE_ID, actorOf());

		expect(JSON.stringify(calls.courseFilters[0])).toContain('"in":[5]');
	});

	test("reinscribirse tras una baja reutiliza la fila", async () => {
		const { service, calls } = createHarness({ own: "WITHDRAWN" });

		await service.enroll(COURSE_ID, actorOf());

		expect(calls.saved[0]?.expected).toBe("WITHDRAWN");
	});

	test("sin cupo falla y no escribe", async () => {
		const { service, calls } = createHarness({
			seats: { capacity: 1, enrolled: 1 },
		});

		const result = await service.enroll(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.FULL },
		});
		expect(calls.saved).toHaveLength(0);
	});

	test("una segunda inscripción falla con su código", async () => {
		const { service } = createHarness({ own: "ENROLLED" });

		const result = await service.enroll(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.ALREADY_ENROLLED },
		});
	});

	test("con la inscripción cerrada falla antes de bloquear", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ enrollmentDeadline: new Date("2026-09-10") }),
		});

		const result = await service.enroll(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.CLOSED },
		});
		expect(calls.locks).toHaveLength(0);
	});

	// Quien administra o imparte un curso por invitación lo ve sin estar
	// invitado: verlo no le da derecho a inscribirse solo (docs/adr/0004).
	test("un curso por invitación rechaza a quien no tiene invitación", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ access: "INVITATION" }),
		});

		const result = await service.enroll(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			success: false,
			error: { code: ENROLLMENT_ERROR_CODES.INVITATION_REQUIRED },
		});
		expect(calls.saved).toHaveLength(0);
	});

	test("con invitación pendiente, inscribirse la acepta", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ access: "INVITATION" }),
			own: "INVITED",
		});

		const result = await service.enroll(COURSE_ID, actorOf());

		expect(result.success).toBe(true);
		expect(calls.saved[0]).toMatchObject({
			data: { origin: "INVITATION", status: "ENROLLED" },
			expected: "INVITED",
		});
	});

	test("un curso que no puede ver responde como inexistente", async () => {
		const { service } = createHarness({ course: null });

		const result = await service.enroll(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.COURSE_NOT_FOUND },
		});
	});

	test.each([
		["un externo", actorOf("USER", { dependencyId: null, isTrainer: true })],
		["el superadministrador", actorOf("SUPERADMIN", { dependencyId: null })],
	])("%s no se inscribe", async (_label, actor) => {
		const { service, calls } = createHarness();

		const result = await service.enroll(COURSE_ID, actor);

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.NOT_ELIGIBLE },
		});
		expect(calls.courseFilters).toHaveLength(0);
	});
});

describe("enrollmentService.withdraw", () => {
	test("da de baja antes de la primera sesión", async () => {
		const { service, calls } = createHarness({ own: "ENROLLED" });

		const result = await service.withdraw(COURSE_ID, actorOf());

		expect(result.success).toBe(true);
		expect(calls.saved[0]).toMatchObject({
			data: { status: "WITHDRAWN" },
			expected: "ENROLLED",
		});
	});

	test("desde que empieza la primera sesión ya no", async () => {
		const { service, calls } = createHarness({
			own: "ENROLLED",
			course: courseOf({ firstSessionAt: new Date("2026-09-14T16:00:00Z") }),
		});

		const result = await service.withdraw(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.WITHDRAW_CLOSED },
		});
		expect(calls.saved).toHaveLength(0);
	});

	test("sin inscripción activa falla con su código", async () => {
		const { service } = createHarness({ own: "INVITED" });

		const result = await service.withdraw(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.NOT_ENROLLED },
		});
	});
});

describe("enrollmentService.accept y decline", () => {
	test("aceptar ocupa lugar con el curso bloqueado", async () => {
		const { service, calls } = createHarness({
			own: "INVITED",
			seats: { capacity: 2, enrolled: 1 },
		});

		const result = await service.accept(COURSE_ID, actorOf());

		expect(result.success).toBe(true);
		expect(calls.lockedInTransaction).toEqual([true]);
		expect(calls.saved[0]).toMatchObject({
			data: { status: "ENROLLED", origin: "INVITATION", dependencyId: 4 },
			expected: "INVITED",
		});
	});

	test("aceptar sin cupo falla", async () => {
		const { service, calls } = createHarness({
			own: "INVITED",
			seats: { capacity: 2, enrolled: 2 },
		});

		const result = await service.accept(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.FULL },
		});
		expect(calls.saved).toHaveLength(0);
	});

	test("aceptar sin invitación pendiente falla", async () => {
		const { service } = createHarness({ own: "DECLINED" });

		const result = await service.accept(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.INVITATION_NOT_FOUND },
		});
	});

	test("rechazar no toca el cupo", async () => {
		const { service, calls } = createHarness({ own: "INVITED" });

		const result = await service.decline(COURSE_ID, actorOf());

		expect(result.success).toBe(true);
		expect(calls.locks).toHaveLength(0);
		expect(calls.saved[0]).toMatchObject({
			data: { status: "DECLINED" },
			expected: "INVITED",
		});
	});

	test("rechazar sin invitación falla", async () => {
		const { service } = createHarness({ own: null });

		const result = await service.decline(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.INVITATION_NOT_FOUND },
		});
	});
});

describe("enrollmentService.assign", () => {
	const head = actorOf("DEPENDENCY_HEAD", { userId: 60, dependencyId: 3 });

	test("asigna solo personal de su dependencia con origen asignado", async () => {
		const { service, calls } = createHarness({
			existing: [{ userId: 100, status: "WITHDRAWN" }],
		});

		const result = await service.assign(
			COURSE_ID,
			{ userDocumentIds: [USER_A, USER_B] },
			head,
		);

		expect(result).toMatchObject({
			success: true,
			data: { affected: 2, skipped: 0 },
		});
		expect(calls.participantScopes).toEqual([3]);
		expect(calls.saved.map((entry) => entry.expected)).toEqual([
			"WITHDRAWN",
			null,
		]);
		expect(calls.saved[0]?.data).toMatchObject({
			origin: "ASSIGNED",
			status: "ENROLLED",
			actedById: 60,
		});
	});

	test("omite a quien ya está inscrito", async () => {
		const { service, calls } = createHarness({
			existing: [{ userId: 100, status: "ENROLLED" }],
		});

		const result = await service.assign(
			COURSE_ID,
			{ userDocumentIds: [USER_A, USER_B] },
			head,
		);

		expect(result).toMatchObject({ data: { affected: 1, skipped: 1 } });
		expect(calls.saved).toHaveLength(1);
	});

	test("todo o nada: si no alcanza el cupo no inscribe a nadie", async () => {
		const { service, calls } = createHarness({
			seats: { capacity: 3, enrolled: 2 },
		});

		const result = await service.assign(
			COURSE_ID,
			{ userDocumentIds: [USER_A, USER_B] },
			head,
		);

		expect(result).toMatchObject({
			error: {
				code: ENROLLMENT_ERROR_CODES.FULL,
				details: { seatsLeft: 1 },
			},
		});
		expect(calls.saved).toHaveLength(0);
	});

	test("rechaza el lote si alguien no es elegible", async () => {
		const { service, calls } = createHarness({
			participants: [participantOf(100, USER_A)],
		});

		const result = await service.assign(
			COURSE_ID,
			{ userDocumentIds: [USER_A, USER_B] },
			head,
		);

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.UNKNOWN_PARTICIPANT },
		});
		expect(calls.transactions).toBe(0);
	});

	test("un participante sin alcance no asigna", async () => {
		const { service } = createHarness();

		const result = await service.assign(
			COURSE_ID,
			{ userDocumentIds: [USER_A] },
			actorOf(),
		);

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.FORBIDDEN_SCOPE },
		});
	});

	test("inscribe a un grupo completo y omite a los miembros de otra dependencia", async () => {
		const { service, calls } = createHarness({
			groupMembers: [
				participantOf(100, USER_A),
				{ ...participantOf(101, USER_B), dependencyId: 9 },
			],
		});

		const result = await service.assign(
			COURSE_ID,
			{ userDocumentIds: [], groupDocumentIds: [GROUP_ID] },
			actorOf("DEPENDENCY_HEAD", { userId: 60, dependencyId: 4 }),
		);

		expect(result).toMatchObject({
			success: true,
			data: { affected: 1, skipped: 1 },
		});
		expect(calls.saved.map(({ data }) => data.userId)).toEqual([100]);
	});

	test("el cupo cuenta a los miembros del grupo junto con las personas", async () => {
		const { service, calls } = createHarness({
			seats: { capacity: 10, enrolled: 8 },
			participants: [participantOf(100, USER_A)],
			groupMembers: [participantOf(101, USER_B), participantOf(102, "c")],
		});

		const result = await service.assign(
			COURSE_ID,
			{ userDocumentIds: [USER_A], groupDocumentIds: [GROUP_ID] },
			actorOf("DEPENDENCY_HEAD", { userId: 60, dependencyId: 4 }),
		);

		expect(result).toMatchObject({
			error: {
				code: ENROLLMENT_ERROR_CODES.FULL,
				details: { seatsLeft: 2 },
			},
		});
		expect(calls.saved).toHaveLength(0);
	});

	test("una dependencia que no organiza el curso inscribe a su personal", async () => {
		const { service, calls } = createHarness({ managed: false });

		const result = await service.assign(
			COURSE_ID,
			{ userDocumentIds: [USER_A] },
			head,
		);

		expect(result).toMatchObject({ success: true, data: { affected: 1 } });
		expect(calls.participantScopes).toEqual([3]);
	});

	test("un capacitador interno solo asigna en los cursos que creó", async () => {
		const { service, calls } = createHarness({ course: null });

		const result = await service.assign(
			COURSE_ID,
			{ userDocumentIds: [USER_A] },
			actorOf("USER", { isTrainer: true }),
		);

		expect(calls.courseFilters[0]).toEqual({
			dependencyId: 4,
			createdById: 50,
		});
		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.COURSE_NOT_FOUND },
		});
	});
});

describe("enrollmentService.invite", () => {
	const trainer = actorOf("USER", { isTrainer: true });
	const byInvitation = courseOf({ access: "INVITATION" });

	test("expande grupos, deduplica y omite a los activos", async () => {
		const { service, calls } = createHarness({
			course: byInvitation,
			participants: [participantOf(100, USER_A)],
			groupMembers: [
				participantOf(100, USER_A),
				participantOf(101, USER_B),
				participantOf(102, "c"),
			],
			existing: [
				{ userId: 101, status: "ENROLLED" },
				{ userId: 102, status: "DECLINED" },
			],
		});

		const result = await service.invite(
			COURSE_ID,
			{ userDocumentIds: [USER_A], groupDocumentIds: [GROUP_ID] },
			trainer,
		);

		expect(result).toMatchObject({ data: { affected: 2, skipped: 1 } });
		expect(calls.locks).toHaveLength(0);
		expect(
			calls.saved.map(({ data, expected }) => [data.userId, expected]),
		).toEqual([
			[100, null],
			[102, "DECLINED"],
		]);
		expect(calls.saved[0]?.data).toMatchObject({
			origin: "INVITATION",
			status: "INVITED",
		});
	});

	test("un grupo fuera de su alcance rechaza el envío", async () => {
		const { service, calls } = createHarness({
			course: byInvitation,
			eligibleGroups: 0,
		});

		const result = await service.invite(
			COURSE_ID,
			{ userDocumentIds: [], groupDocumentIds: [GROUP_ID] },
			trainer,
		);

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.UNKNOWN_GROUP },
		});
		expect(calls.saved).toHaveLength(0);
	});

	test("un curso cerrado no admite invitaciones", async () => {
		const { service } = createHarness({
			course: courseOf({ access: "INVITATION", status: "DRAFT" }),
		});

		const result = await service.invite(
			COURSE_ID,
			{ userDocumentIds: [USER_A], groupDocumentIds: [] },
			trainer,
		);

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.CLOSED },
		});
	});

	test("sin alcance de administración falla con su código", async () => {
		const { service } = createHarness({ course: byInvitation });

		const result = await service.invite(
			COURSE_ID,
			{ userDocumentIds: [USER_A], groupDocumentIds: [] },
			actorOf(),
		);

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.FORBIDDEN_SCOPE },
		});
	});

	test("un curso público o restringido no admite invitaciones", async () => {
		const { service, calls } = createHarness();

		const result = await service.invite(
			COURSE_ID,
			{ userDocumentIds: [USER_A], groupDocumentIds: [] },
			trainer,
		);

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.INVITATIONS_DISABLED },
		});
		expect(calls.saved).toHaveLength(0);
	});
});

describe("enrollmentService.listRoster", () => {
	const head = actorOf("DEPENDENCY_HEAD", { dependencyId: 3 });

	test("quien organiza ve a todas las personas", async () => {
		const { service, calls } = createHarness();

		const result = await service.listRoster(COURSE_ID, head);

		expect(result).toMatchObject({
			data: { reach: { organizer: true, canInvite: false } },
		});
		expect(calls.rosterScopes).toEqual([null]);
	});

	test("una dependencia invitada solo ve a su personal", async () => {
		const { service, calls } = createHarness({ managed: false });

		const result = await service.listRoster(COURSE_ID, head);

		expect(result).toMatchObject({ data: { reach: { organizer: false } } });
		expect(calls.rosterScopes).toEqual([3]);
	});

	test("un capacitador interno no alcanza cursos ajenos", async () => {
		const { service } = createHarness({ managed: false });

		const result = await service.listRoster(
			COURSE_ID,
			actorOf("USER", { isTrainer: true }),
		);

		expect(result).toMatchObject({
			error: { code: ENROLLMENT_ERROR_CODES.COURSE_NOT_FOUND },
		});
	});
});

describe("enrollmentService.listRosterOptions", () => {
	const head = actorOf("DEPENDENCY_HEAD", { dependencyId: 4 });
	const candidateOf = (documentId: string, dependencyId: number) => ({
		documentId,
		firstName: null,
		lastName: null,
		email: `${documentId}@instituto.gob.mx`,
		dependencyName: "SEDESOL",
		dependencyId,
	});

	test("en un curso por invitación marca a quién solo se puede invitar", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ access: "INVITATION" }),
			candidates: [candidateOf(USER_A, 4), candidateOf(USER_B, 9)],
		});

		const result = await service.listRosterOptions(COURSE_ID, undefined, head);

		expect(calls.candidateScopes).toEqual([null]);
		expect(result).toMatchObject({
			data: {
				candidates: [
					{ documentId: USER_A, assignable: true },
					{ documentId: USER_B, assignable: false },
				],
			},
		});
	});

	test("en un curso sin invitación solo ofrece personal propio", async () => {
		const { service, calls } = createHarness();

		await service.listRosterOptions(COURSE_ID, undefined, head);

		expect(calls.candidateScopes).toEqual([4]);
	});

	test("cada grupo trae a los miembros que ocuparían lugar", async () => {
		const { service } = createHarness({
			enrollable: [
				{ groupId: 900, userDocumentId: USER_A },
				{ groupId: 901, userDocumentId: USER_B },
			],
		});

		const result = await service.listRosterOptions(COURSE_ID, undefined, head);

		expect(result).toMatchObject({
			data: {
				groups: [{ documentId: GROUP_ID, enrollableMemberIds: [USER_A] }],
			},
		});
	});
});

describe("enrollmentService.findAvailable", () => {
	test("un invitado puede aceptar o rechazar, no inscribirse directo", async () => {
		const { service } = createHarness({ own: "INVITED" });

		const result = await service.findAvailable(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			data: {
				can: {
					enroll: false,
					accept: true,
					decline: true,
					withdraw: false,
					assign: false,
				},
			},
		});
	});

	test("el titular puede asignar si su dependencia ve el curso", async () => {
		const { service } = createHarness();

		const result = await service.findAvailable(
			COURSE_ID,
			actorOf("DEPENDENCY_HEAD", { dependencyId: 3 }),
		);

		expect(result).toMatchObject({
			data: { can: { enroll: true, assign: true } },
		});
	});
});

describe("enrollmentService.listMine", () => {
	const entry = (
		status: EnrollmentStatus,
		course: Partial<EnrollmentCourse>,
		outcome: Partial<MyCourseRecord["outcome"]> = {},
	): MyCourseRecord => ({
		enrollment: {
			documentId: `e-${status}-${course.title}`,
			origin: "SELF",
			status,
			result: "PENDING",
		},
		course: courseOf(course),
		outcome: {
			grade: null,
			completed: false,
			progressPercent: 0,
			contentCompletedAt: null,
			attendedSessions: 0,
			myRating: null,
			...outcome,
		},
	});

	test("reparte invitaciones y cursos por momento", async () => {
		const { service } = createHarness({
			mine: [
				entry("INVITED", { title: "invitación" }),
				entry("INVITED", { title: "cancelado", status: "CANCELLED" }),
				entry("ENROLLED", { title: "próximo" }),
				entry("ENROLLED", {
					title: "en curso",
					firstSessionAt: new Date("2026-09-14T16:00:00Z"),
					lastSessionEndsAt: new Date("2026-09-28T20:00:00Z"),
				}),
				entry("ENROLLED", { title: "cancelado", status: "CANCELLED" }),
			],
		});

		const result = await service.listMine(actorOf());

		if (!result.success) throw new Error("se esperaba éxito");
		const titles = (list: MyCourseEntry[]) =>
			list.map((item) => item.course.title);

		expect(titles(result.data.invitations)).toEqual(["invitación"]);
		expect(titles(result.data.upcoming)).toEqual(["próximo"]);
		expect(titles(result.data.inProgress)).toEqual(["en curso"]);
		expect(titles(result.data.finished)).toEqual(["cancelado"]);
	});

	test("solo puede valorar quien asistió a un curso finalizado y no lo ha valorado", async () => {
		const finished = { status: "FINISHED" as const };
		const { service } = createHarness({
			mine: [
				entry(
					"ENROLLED",
					{ ...finished, title: "asistió" },
					{ attendedSessions: 1 },
				),
				entry("ENROLLED", { ...finished, title: "no asistió" }),
				entry(
					"ENROLLED",
					{ ...finished, title: "ya valoró" },
					{ attendedSessions: 2, myRating: 4 },
				),
				entry("ENROLLED", { title: "publicado" }, { attendedSessions: 1 }),
			],
		});

		const result = await service.listMine(actorOf());

		if (!result.success) throw new Error("se esperaba éxito");
		const rateable = [
			...result.data.upcoming,
			...result.data.inProgress,
			...result.data.finished,
		]
			.filter((item: MyCourseEntry) => item.canRate)
			.map((item) => item.course.title);

		expect(rateable).toEqual(["asistió"]);
	});
});

describe("avisos de inscripción e invitación (§6.12)", () => {
	test("inscribirse confirma a la persona dentro de la transacción", async () => {
		const { service, calls } = createHarness();

		await service.enroll(COURSE_ID, actorOf());

		expect(calls.notified).toHaveLength(1);
		expect(calls.notified[0]).toMatchObject({
			inTransaction: true,
			events: [
				{
					template: "ENROLLMENT_CONFIRMED",
					to: { email: "miguel.sds@instituto.gob.mx" },
				},
			],
		});
	});

	test("aceptar una invitación también confirma", async () => {
		const { service, calls } = createHarness({ own: "INVITED" });

		await service.accept(COURSE_ID, actorOf());

		expect(calls.notified[0]?.events[0]?.template).toBe("ENROLLMENT_CONFIRMED");
	});

	test("sin cupo no se inscribe ni se avisa", async () => {
		const { service, calls } = createHarness({
			seats: { capacity: 1, enrolled: 1 },
		});

		await service.enroll(COURSE_ID, actorOf());

		expect(calls.notified).toEqual([]);
	});

	test("asignar avisa a cada persona asignada", async () => {
		const { service, calls } = createHarness({
			participants: [participantOf(100, USER_A), participantOf(101, USER_B)],
			existing: [{ userId: 101, status: "ENROLLED" }],
		});

		await service.assign(
			COURSE_ID,
			{ userDocumentIds: [USER_A, USER_B] },
			actorOf("DEPENDENCY_HEAD", { userId: 60, dependencyId: 4 }),
		);

		expect(calls.notified[0]?.events).toMatchObject([
			{
				template: "ENROLLMENT_ASSIGNED",
				to: { email: "persona-100@instituto.gob.mx" },
			},
		]);
	});

	test("invitar avisa solo a los invitados de verdad, no a los omitidos", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ access: "INVITATION" }),
			participants: [participantOf(100, USER_A)],
			groupMembers: [participantOf(101, USER_B)],
			existing: [{ userId: 101, status: "INVITED" }],
		});

		await service.invite(
			COURSE_ID,
			{ userDocumentIds: [USER_A], groupDocumentIds: [GROUP_ID] },
			actorOf("USER", { isTrainer: true }),
		);

		expect(
			calls.notified.flatMap(({ events }) =>
				events.map((event) => event.to.email),
			),
		).toEqual(["persona-100@instituto.gob.mx"]);
		expect(calls.notified[0]?.events[0]?.template).toBe("COURSE_INVITATION");
	});
});
