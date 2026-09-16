import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type { Role } from "@/shared/rules/atoms.rules";
import { COURSE_ERROR_CODES } from "../../domain/course.errors";
import type {
	CourseDetail,
	CreateCourseDto,
	UpdateCourseDto,
} from "../../domain/course.types";
import { createCourseService } from "../courses.service.server";

const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TRAINER_ID = "11111111-1111-4111-8111-111111111111";
const DEPENDENCY_ID = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const courseOf = (overrides: Partial<CourseDetail> = {}): CourseDetail => ({
	id: 7,
	documentId: COURSE_ID,
	dependencyId: 3,
	dependencyName: "Obras Públicas",
	title: "Ofimática básica",
	modality: "IN_PERSON",
	access: "PUBLIC",
	status: "DRAFT",
	capacity: null,
	sessionCount: 1,
	trainerCount: 1,
	firstSessionAt: null,
	lastSessionAt: null,
	createdByName: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	description: null,
	enrollmentDeadline: null,
	minAttendance: 80,
	requiresEvaluation: false,
	planLineId: null,
	publishedAt: null,
	cancelledAt: null,
	sessions: [
		{
			id: 1,
			documentId: "44444444-4444-4444-8444-444444444444",
			startsAt: new Date("2026-10-05T16:00:00.000Z"),
			endsAt: new Date("2026-10-05T20:00:00.000Z"),
			venue: "Sala A",
			link: null,
		},
	],
	trainers: [
		{
			userDocumentId: TRAINER_ID,
			firstName: "Luis",
			lastName: "Ramírez",
			email: "luis@instituto.gob.mx",
			specialty: "Ofimática",
			isActive: true,
		},
	],
	audience: { dependencies: [], groups: [] },
	...overrides,
});

const actorOf = (
	role: Role = "DEPENDENCY_HEAD",
	overrides: Partial<AuthContext> = {},
): AuthContext => ({
	userId: 99,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "titular@instituto.gob.mx",
	role,
	dependencyId: 3,
	isTrainer: false,
	...overrides,
});

const dtoOf = (overrides: Partial<CreateCourseDto> = {}): CreateCourseDto => ({
	title: "Ofimática básica",
	modality: "IN_PERSON",
	access: "PUBLIC",
	trainers: [TRAINER_ID],
	sessions: [
		{
			date: "2026-10-05",
			startTime: "09:00",
			endTime: "13:00",
			venue: "Sala A",
		},
	],
	...overrides,
});

const dependencyOf = (id: number, archivedAt: Date | null = null) => ({
	id,
	documentId: DEPENDENCY_ID,
	name: "Obras Públicas",
	acronym: null,
	archivedAt,
	createdAt: new Date(0),
	updatedAt: new Date(0),
});

const createHarness = (
	options: {
		course?: CourseDetail | null;
		eligibleTrainers?: number;
		eligibleDependencies?: number;
		eligibleGroups?: number;
		dependencyArchived?: boolean;
		enrolled?: number;
	} = {},
) => {
	const calls = {
		transactions: 0,
		lockedCourses: [] as number[],
		created: [] as unknown[],
		updated: [] as unknown[],
		published: [] as unknown[],
		cancelled: [] as unknown[],
		listScopes: [] as unknown[],
		groupScopes: [] as unknown[],
	};

	const refs = (count: number) =>
		Array.from({ length: count }, (_, index) => ({
			id: index + 1,
			documentId: `ref-${index}`,
		}));

	const courseRepository = {
		findAll: async (_filters: unknown, scope: unknown) => {
			calls.listScopes.push(scope);
			return [];
		},
		count: async (_filters: unknown, scope: unknown) => {
			calls.listScopes.push(scope);
			return 0;
		},
		findById: async () =>
			options.course === undefined ? courseOf() : options.course,
		create: async (data: unknown) => {
			calls.created.push(data);
			return courseOf();
		},
		update: async (documentId: string, data: unknown, scope: unknown) => {
			calls.updated.push({ documentId, data, scope });
			return courseOf();
		},
		publish: async (documentId: string, scope: unknown) => {
			calls.published.push({ documentId, scope });
			return courseOf({ status: "PUBLISHED" });
		},
		cancel: async (documentId: string, scope: unknown) => {
			calls.cancelled.push({ documentId, scope });
			return courseOf({ status: "CANCELLED" });
		},
		findEligibleTrainers: async (ids: readonly string[]) =>
			refs(options.eligibleTrainers ?? ids.length),
		findEligibleDependencies: async (ids: readonly string[]) =>
			refs(options.eligibleDependencies ?? ids.length),
		findEligibleGroups: async (ids: readonly string[], scope: unknown) => {
			calls.groupScopes.push(scope);
			return refs(options.eligibleGroups ?? ids.length);
		},
	} as unknown as ICradle["courseRepository"];

	const archivedAt = options.dependencyArchived ? new Date() : null;
	const dependencyRepository = {
		findById: async () => dependencyOf(4, archivedAt),
		findByInternalId: async (id: number) => dependencyOf(id, archivedAt),
		findActive: async () => [dependencyOf(3)],
	} as unknown as ICradle["dependencyRepository"];

	const trainerRepository = {
		findActive: async () => [
			{
				userDocumentId: TRAINER_ID,
				firstName: "Luis",
				lastName: "Ramírez",
				email: "luis@instituto.gob.mx",
				type: "INTERNAL",
				specialty: "Ofimática",
				institution: null,
				dependencyName: "Obras Públicas",
				archivedAt: null,
			},
		],
	} as unknown as ICradle["trainerRepository"];

	const groupRepository = {
		findActive: async (scope: unknown) => {
			calls.groupScopes.push(scope);
			return [];
		},
	} as unknown as ICradle["groupRepository"];

	const enrollmentRepository = {
		lockCourseSeats: async (courseId: number) => {
			calls.lockedCourses.push(courseId);
			return { capacity: null, enrolled: options.enrolled ?? 0 };
		},
	} as unknown as ICradle["enrollmentRepository"];

	const runInTransaction = (async <T>(callback: () => Promise<T>) => {
		calls.transactions += 1;
		return callback();
	}) as unknown as ICradle["runInTransaction"];

	const service = createCourseService({
		courseRepository,
		dependencyRepository,
		trainerRepository,
		groupRepository,
		enrollmentRepository,
		runInTransaction,
		logger: silentLogger,
	});

	return { service, calls };
};

describe("coursesService.list", () => {
	test("el alcance llega al repositorio y la paginación sale de los defaults", async () => {
		const { service, calls } = createHarness();
		const scope = { kind: "dependency", dependencyId: 3 } as const;

		const result = await service.list({}, scope);

		expect(result.success).toBe(true);
		expect(calls.listScopes).toEqual([scope, scope]);
		if (result.success) {
			expect(result.pagination).toMatchObject({ page: 1, pageSize: 10 });
		}
	});
});

describe("coursesService.create", () => {
	test("escribe dentro de una transacción con la dependencia del alcance", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			// La dependencia del formulario se ignora fuera del alcance global.
			dtoOf({ dependency: DEPENDENCY_ID }),
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.transactions).toBe(1);
		expect(calls.created[0]).toMatchObject({
			dependencyId: 3,
			createdById: 99,
			minAttendance: 80,
			trainerIds: [1],
		});
	});

	test("convierte la hora de Tijuana a UTC antes de escribir", async () => {
		const { service, calls } = createHarness();

		await service.create(dtoOf(), actorOf());

		expect(calls.created[0]).toMatchObject({
			sessions: [
				{
					startsAt: new Date("2026-10-05T16:00:00.000Z"),
					endsAt: new Date("2026-10-05T20:00:00.000Z"),
				},
			],
		});
	});

	test("un capacitador interno crea en su dependencia", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			dtoOf(),
			actorOf("USER", { isTrainer: true }),
		);

		expect(result.success).toBe(true);
		expect(calls.created[0]).toMatchObject({ dependencyId: 3 });
	});

	test("un participante sin perfil falla con su código", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(dtoOf(), actorOf("USER"));

		expect(result).toMatchObject({
			success: false,
			error: { code: COURSE_ERROR_CODES.FORBIDDEN_SCOPE },
		});
		expect(calls.created).toHaveLength(0);
	});

	test("el superadministrador tiene que elegir la organizadora", async () => {
		const { service } = createHarness();

		const result = await service.create(dtoOf(), actorOf("SUPERADMIN"));

		expect(result).toMatchObject({
			success: false,
			error: { code: COURSE_ERROR_CODES.ORGANIZER_REQUIRED },
		});
	});

	test("el superadministrador crea en la dependencia que eligió", async () => {
		const { service, calls } = createHarness();

		await service.create(
			dtoOf({ dependency: DEPENDENCY_ID }),
			actorOf("SUPERADMIN", { dependencyId: null }),
		);

		expect(calls.created[0]).toMatchObject({ dependencyId: 4 });
	});

	test("una dependencia desactivada no organiza cursos", async () => {
		const { service } = createHarness({ dependencyArchived: true });

		const result = await service.create(dtoOf(), actorOf());

		expect(result).toMatchObject({
			error: { code: COURSE_ERROR_CODES.DEPENDENCY_INACTIVE },
		});
	});

	test("rechaza el lote si un capacitador no está disponible", async () => {
		const { service, calls } = createHarness({ eligibleTrainers: 0 });

		const result = await service.create(dtoOf(), actorOf());

		expect(result).toMatchObject({
			error: { code: COURSE_ERROR_CODES.UNKNOWN_TRAINER },
		});
		expect(calls.created).toHaveLength(0);
	});

	test("rechaza una audiencia que no existe o cae fuera del alcance", async () => {
		const { service, calls } = createHarness({ eligibleGroups: 0 });

		const result = await service.create(
			dtoOf({ access: "RESTRICTED", audienceGroups: [GROUP_ID] }),
			actorOf(),
		);

		expect(result).toMatchObject({
			error: { code: COURSE_ERROR_CODES.UNKNOWN_AUDIENCE },
		});
		expect(calls.groupScopes).toEqual([
			{ kind: "dependency", dependencyId: 3 },
		]);
	});

	test("un curso no restringido descarta la audiencia enviada", async () => {
		const { service, calls } = createHarness();

		await service.create(
			dtoOf({
				access: "PUBLIC",
				audienceDependencies: [DEPENDENCY_ID],
				audienceGroups: [GROUP_ID],
			}),
			actorOf(),
		);

		expect(calls.created[0]).toMatchObject({
			audienceDependencyIds: [],
			audienceGroupIds: [],
		});
	});

	test("una sesión que termina antes de empezar falla señalándola", async () => {
		const { service } = createHarness();

		const result = await service.create(
			dtoOf({
				sessions: [
					{ date: "2026-10-05", startTime: "13:00", endTime: "09:00" },
				],
			}),
			actorOf(),
		);

		expect(result).toMatchObject({
			error: {
				code: COURSE_ERROR_CODES.SESSION_INVALID_RANGE,
				details: { sessionNumber: 1 },
			},
		});
	});

	test("una fecha límite posterior a la primera sesión falla", async () => {
		const { service } = createHarness();

		const result = await service.create(
			dtoOf({ enrollmentDeadline: "2026-10-20" }),
			actorOf(),
		);

		expect(result).toMatchObject({
			error: { code: COURSE_ERROR_CODES.DEADLINE_AFTER_START },
		});
	});
});

describe("coursesService.update", () => {
	const updateDto = dtoOf() as UpdateCourseDto;

	test("actualiza dentro de una transacción con el alcance del actor", async () => {
		const { service, calls } = createHarness();

		const result = await service.update(COURSE_ID, updateDto, actorOf());

		expect(result.success).toBe(true);
		expect(calls.transactions).toBe(1);
		expect(calls.updated[0]).toMatchObject({
			documentId: COURSE_ID,
			scope: { kind: "dependency", dependencyId: 3 },
		});
	});

	test.each(["FINISHED", "CANCELLED"] as const)(
		"un curso %s no se edita",
		async (status) => {
			const { service, calls } = createHarness({
				course: courseOf({ status }),
			});

			const result = await service.update(COURSE_ID, updateDto, actorOf());

			expect(result).toMatchObject({
				error: { code: COURSE_ERROR_CODES.NOT_EDITABLE },
			});
			expect(calls.updated).toHaveLength(0);
		},
	);

	test("bloquea el curso y rechaza un cupo menor que los inscritos", async () => {
		const { service, calls } = createHarness({ enrolled: 2 });

		const result = await service.update(
			COURSE_ID,
			dtoOf({ capacity: 1 }) as UpdateCourseDto,
			actorOf(),
		);

		expect(result).toMatchObject({
			error: { code: COURSE_ERROR_CODES.CAPACITY_BELOW_ENROLLED },
		});
		expect(calls.lockedCourses).toEqual([7]);
		expect(calls.updated).toHaveLength(0);
	});

	test("fuera de alcance se ve igual que inexistente", async () => {
		const { service } = createHarness({ course: null });

		const result = await service.update(COURSE_ID, updateDto, actorOf());

		expect(result).toMatchObject({
			error: { code: COURSE_ERROR_CODES.NOT_FOUND },
		});
	});

	test("un capacitador interno escribe con alcance de autor", async () => {
		const { service, calls } = createHarness();

		await service.update(
			COURSE_ID,
			updateDto,
			actorOf("USER", { isTrainer: true }),
		);

		expect(calls.updated[0]).toMatchObject({
			scope: { kind: "creator", dependencyId: 3, userId: 99 },
		});
	});
});

describe("coursesService.publish", () => {
	test("publica un borrador completo", async () => {
		const { service, calls } = createHarness();

		const result = await service.publish(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: { status: "PUBLISHED" },
		});
		expect(calls.published).toHaveLength(1);
	});

	test.each([
		[
			"sin sesiones",
			courseOf({ sessions: [] }),
			COURSE_ERROR_CODES.WITHOUT_SESSIONS,
		],
		[
			"sin capacitador activo",
			courseOf({
				trainers: [{ ...courseOf().trainers[0], isActive: false }],
			}),
			COURSE_ERROR_CODES.WITHOUT_ACTIVE_TRAINER,
		],
		[
			"con una sesión sin sede",
			courseOf({ sessions: [{ ...courseOf().sessions[0], venue: null }] }),
			COURSE_ERROR_CODES.SESSION_MISSING_VENUE,
		],
		[
			"restringido sin audiencia",
			courseOf({ access: "RESTRICTED" }),
			COURSE_ERROR_CODES.AUDIENCE_REQUIRED,
		],
	])("no publica un curso %s", async (_case, course, code) => {
		const { service, calls } = createHarness({ course });

		const result = await service.publish(COURSE_ID, actorOf());

		expect(result).toMatchObject({ success: false, error: { code } });
		expect(calls.published).toHaveLength(0);
	});
});

describe("coursesService.cancel", () => {
	test("cancela sin borrar nada", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ status: "PUBLISHED" }),
		});

		const result = await service.cancel(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: { status: "CANCELLED" },
		});
		expect(calls.cancelled).toHaveLength(1);
	});

	test("un curso ya cancelado no se vuelve a cancelar", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ status: "CANCELLED" }),
		});

		const result = await service.cancel(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			error: {
				code: COURSE_ERROR_CODES.INVALID_TRANSITION,
				details: { from: "CANCELLED", to: "CANCELLED" },
			},
		});
		expect(calls.cancelled).toHaveLength(0);
	});
});

describe("coursesService.listFormOptions", () => {
	test("solo el alcance global elige organizadora", async () => {
		const { service } = createHarness();

		const own = await service.listFormOptions({
			kind: "dependency",
			dependencyId: 3,
		});
		const global = await service.listFormOptions({ kind: "global" });

		expect(own).toMatchObject({
			data: { canChooseOrganizer: false, organizers: [] },
		});
		expect(global).toMatchObject({
			data: {
				canChooseOrganizer: true,
				organizers: [{ name: "Obras Públicas" }],
			},
		});
	});

	test("los grupos se leen con el alcance de audiencia del actor", async () => {
		const { service, calls } = createHarness();

		const result = await service.listFormOptions({
			kind: "creator",
			dependencyId: 3,
			userId: 99,
		});

		expect(result).toMatchObject({
			data: { trainers: [{ documentId: TRAINER_ID }] },
		});
		expect(calls.groupScopes).toEqual([
			{ kind: "dependency", dependencyId: 3 },
		]);
	});
});
