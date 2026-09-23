import { describe, expect, test } from "vitest";
import { ANNUAL_PLAN_ERROR_CODES } from "@/modules/annual-plan/domain/annual-plan.errors";
import type { LockedPlanLine } from "@/modules/annual-plan/domain/annual-plan.types";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { NotificationEvent } from "@/modules/notifications/domain/notification.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type { Role } from "@/shared/rules/atoms.rules";
import { COURSE_ERROR_CODES } from "../../domain/course.errors";
import { hasScheduleChanges } from "../../domain/course.rules";
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
const LINE_ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-09-16T18:00:00.000Z");

const lineOf = (overrides: Partial<LockedPlanLine> = {}): LockedPlanLine => ({
	id: 21,
	cancelledAt: null,
	plan: { dependencyId: 3, fiscalYear: 2026 },
	courses: [],
	...overrides,
});

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
	coverImageUrl: null,
	modality: "IN_PERSON",
	format: "SCHEDULED",
	completionRule: "ATTENDANCE",
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
	qrOpensBeforeMinutes: 15,
	qrClosesAfterMinutes: 15,
	planLine: null,
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
		planLine?: LockedPlanLine | null;
		recipients?: {
			email: string;
			firstName: string | null;
			lastName: string | null;
		}[];
		/** Hace fallar la subida para comprobar que nada se escribe después. */
		uploadFails?: boolean;
		/** Sin bucket, subir una portada es un error de configuración. */
		noBucket?: boolean;
		/** Lecciones activas del temario; solo las mira un autogestivo. */
		lessons?: number;
	} = {},
) => {
	let inTransaction = false;
	let txDepth = 0;
	const calls = {
		notified: [] as { events: NotificationEvent[]; inTransaction: boolean }[],
		transactions: 0,
		lineLocks: [] as { documentId: string; inTransaction: boolean }[],
		lockedCourses: [] as number[],
		created: [] as unknown[],
		updated: [] as unknown[],
		published: [] as unknown[],
		cancelled: [] as unknown[],
		listScopes: [] as unknown[],
		groupScopes: [] as unknown[],
		uploaded: [] as { bucket: string; key: string; contentType?: string }[],
		deleted: [] as { bucket: string; key: string }[],
		lessonCounts: [] as number[],
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
		findNotifiableRecipients: async () =>
			options.recipients ?? [
				{
					email: "diana.sop@instituto.gob.mx",
					firstName: "Diana",
					lastName: "Sánchez",
				},
			],
		lockCourseSeats: async (courseId: number) => {
			calls.lockedCourses.push(courseId);
			return { capacity: null, enrolled: options.enrolled ?? 0 };
		},
	} as unknown as ICradle["enrollmentRepository"];

	const annualPlanRepository = {
		lockLineForCourse: async (documentId: string) => {
			calls.lineLocks.push({ documentId, inTransaction });
			return options.planLine === undefined ? lineOf() : options.planLine;
		},
	} as unknown as ICradle["annualPlanRepository"];

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

	// Solo los métodos del puerto que toca la portada: un doble completo del
	// cradle escondería de qué depende de verdad esta operación.
	const storageProvider = {
		uploadFile: async (
			bucket: string,
			key: string,
			_body: unknown,
			contentType?: string,
		) => {
			if (options.uploadFails) throw new Error("bucket caído");
			calls.uploaded.push({ bucket, key, contentType });
		},
		deleteFile: async (bucket: string, key: string) => {
			calls.deleted.push({ bucket, key });
		},
		getPublicUrl: (_bucket: string, key: string) =>
			`/api/storage?key=${encodeURIComponent(key)}`,
	} as unknown as ICradle["storageProvider"];

	// Lo único que este módulo le pide al temario: cuántas lecciones vivas hay.
	const contentRepository = {
		countActiveLessons: async (courseId: number) => {
			calls.lessonCounts.push(courseId);
			return options.lessons ?? 0;
		},
	} as unknown as ICradle["contentRepository"];

	const service = createCourseService({
		notificationService,
		storageProvider,
		contentRepository,
		storageBucket: options.noBucket ? null : "instituto-storage",
		storagePublicBucket: null,
		courseRepository,
		dependencyRepository,
		trainerRepository,
		groupRepository,
		enrollmentRepository,
		annualPlanRepository,
		runInTransaction,
		clock: { now: () => NOW },
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
			expect(result.pagination).toMatchObject({ page: 1, pageSize: 12 });
		}
	});
});

describe("coursesService.create desde una línea del plan", () => {
	test("bloquea la línea dentro de la transacción y guarda el vínculo", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			dtoOf({ planLine: LINE_ID }),
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.lineLocks).toEqual([
			{ documentId: LINE_ID, inTransaction: true },
		]);
		expect(calls.created[0]).toMatchObject({ planLineId: 21 });
	});

	test("sin línea no toca el plan y el vínculo queda en null", async () => {
		const { service, calls } = createHarness();

		await service.create(dtoOf(), actorOf());

		expect(calls.lineLocks).toEqual([]);
		expect(calls.created[0]).toMatchObject({ planLineId: null });
	});

	test("una línea de otra dependencia se ve como inexistente", async () => {
		const { service, calls } = createHarness({
			planLine: lineOf({ plan: { dependencyId: 4, fiscalYear: 2026 } }),
		});

		const result = await service.create(
			dtoOf({ planLine: LINE_ID }),
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: COURSE_ERROR_CODES.PLAN_LINE_NOT_FOUND },
		});
		expect(calls.created).toEqual([]);
	});

	test("una línea con curso activo, cancelada o de un plan pasado no admite otro", async () => {
		const cases = [
			[
				lineOf({ courses: [{ status: "DRAFT" }] }),
				ANNUAL_PLAN_ERROR_CODES.LINE_HAS_ACTIVE_COURSE,
			],
			[
				lineOf({ cancelledAt: new Date("2026-08-01") }),
				ANNUAL_PLAN_ERROR_CODES.LINE_CANCELLED,
			],
			[
				lineOf({ plan: { dependencyId: 3, fiscalYear: 2025 } }),
				ANNUAL_PLAN_ERROR_CODES.READ_ONLY,
			],
		] as const;

		for (const [planLine, code] of cases) {
			const { service, calls } = createHarness({ planLine });

			const result = await service.create(
				dtoOf({ planLine: LINE_ID }),
				actorOf(),
			);

			expect(result).toMatchObject({ success: false, error: { code } });
			expect(calls.created).toEqual([]);
		}
	});

	test("un curso cancelado en la línea no la ocupa", async () => {
		const { service } = createHarness({
			planLine: lineOf({ courses: [{ status: "CANCELLED" }] }),
		});

		const result = await service.create(
			dtoOf({ planLine: LINE_ID }),
			actorOf(),
		);

		expect(result.success).toBe(true);
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

	// El formulario puede traer sesiones de antes de cambiar el formato: el
	// servicio las descarta, y con ellas la modalidad, que deja de referirse a
	// nada.
	test("un autogestivo se guarda sin sesiones", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			dtoOf({
				format: "SELF_PACED",
				completionRule: "CONTENT",
				requiresEvaluation: true,
			}),
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.created[0]).toMatchObject({
			format: "SELF_PACED",
			completionRule: "CONTENT",
			modality: "ONLINE",
			sessions: [],
		});
	});

	test.each([
		[
			"un autogestivo por asistencia",
			{ format: "SELF_PACED", completionRule: "ATTENDANCE" },
			COURSE_ERROR_CODES.INCOMPATIBLE_COMPLETION_RULE,
		],
		[
			"un autogestivo por asistencia y contenido",
			{ format: "SELF_PACED", completionRule: "BOTH" },
			COURSE_ERROR_CODES.INCOMPATIBLE_COMPLETION_RULE,
		],
	] as const)("no crea %s", async (_case, overrides, code) => {
		const { service, calls } = createHarness();

		const result = await service.create(dtoOf(overrides), actorOf());

		expect(result).toMatchObject({ success: false, error: { code } });
		expect(calls.created).toHaveLength(0);
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

	// Pasar a autogestivo borra las sesiones, y con ellas las marcas de
	// asistencia que cuelgan de cada una.
	test("un curso publicado no cambia de formato", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ status: "PUBLISHED" }),
		});

		const result = await service.update(
			COURSE_ID,
			dtoOf({
				format: "SELF_PACED",
				completionRule: "CONTENT",
				requiresEvaluation: true,
			}) as UpdateCourseDto,
			actorOf(),
		);

		expect(result).toMatchObject({
			error: { code: COURSE_ERROR_CODES.FORMAT_LOCKED },
		});
		expect(calls.updated).toHaveLength(0);
	});

	// Sus créditos ya se otorgan conforme cada quien completa: cambiar el
	// criterio mediría a unos con una regla y a otros con otra.
	test("un autogestivo publicado no cambia su evaluación", async () => {
		const { service, calls } = createHarness({
			course: courseOf({
				status: "PUBLISHED",
				format: "SELF_PACED",
				completionRule: "CONTENT",
				requiresEvaluation: false,
				sessions: [],
			}),
		});

		const result = await service.update(
			COURSE_ID,
			dtoOf({
				format: "SELF_PACED",
				completionRule: "CONTENT",
				requiresEvaluation: true,
			}) as UpdateCourseDto,
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: COURSE_ERROR_CODES.COMPLETION_LOCKED },
		});
		expect(calls.updated).toHaveLength(0);
	});

	test("un autogestivo sin evaluación se crea", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			dtoOf({
				format: "SELF_PACED",
				completionRule: "CONTENT",
				requiresEvaluation: false,
			}),
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.created[0]).toMatchObject({ requiresEvaluation: false });
	});

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

describe("la portada y la escritura son una sola unidad", () => {
	const coverOf = (
		overrides: Partial<{ name: string; type: string; size: number }> = {},
	) => ({
		name: "portada.webp",
		type: "image/webp",
		size: 120_000,
		arrayBuffer: async () => new ArrayBuffer(8),
		...overrides,
	});

	test("al crear, sube la portada y persiste la referencia del proxy", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(dtoOf(), actorOf(), coverOf());

		expect(result.success).toBe(true);
		expect(calls.uploaded).toHaveLength(1);
		expect(calls.uploaded[0].key).toMatch(
			/^media\/portadas\/portada-\d+\.webp$/,
		);
		expect(calls.created[0]).toMatchObject({
			coverImageUrl: `/api/storage?key=${encodeURIComponent(calls.uploaded[0].key)}`,
		});
	});

	test("sin portada no toca storage y la columna nace en null", async () => {
		const { service, calls } = createHarness();

		await service.create(dtoOf(), actorOf());

		expect(calls.uploaded).toEqual([]);
		expect(calls.created[0]).toMatchObject({ coverImageUrl: null });
	});

	// La razón de ser de la transacción: sin ella, cada guardado fallido dejaría
	// una portada en el bucket que ninguna fila referencia.
	test("si la escritura del curso falla, la subida se revierte", async () => {
		const { service, calls } = createHarness({ enrolled: 2 });

		const result = await service.update(
			COURSE_ID,
			dtoOf({ capacity: 1 }) as UpdateCourseDto,
			actorOf(),
			coverOf(),
		);

		expect(result).toMatchObject({
			error: { code: COURSE_ERROR_CODES.CAPACITY_BELOW_ENROLLED },
		});
		expect(calls.uploaded).toHaveLength(1);
		expect(calls.deleted).toEqual([
			{ bucket: "instituto-storage", key: calls.uploaded[0].key },
		]);
		expect(calls.updated).toEqual([]);
	});

	test("si la subida falla, el curso no se escribe", async () => {
		const { service, calls } = createHarness({ uploadFails: true });

		const result = await service.create(dtoOf(), actorOf(), coverOf());

		expect(result.success).toBe(false);
		expect(calls.created).toEqual([]);
	});

	test("al sustituir, borra la anterior después de guardar", async () => {
		const previous = "media/portadas/vieja-1700000000.webp";
		const { service, calls } = createHarness({
			course: courseOf({
				coverImageUrl: `/api/storage?key=${encodeURIComponent(previous)}`,
			}),
		});

		await service.update(
			COURSE_ID,
			dtoOf() as UpdateCourseDto,
			actorOf(),
			coverOf(),
		);

		expect(calls.deleted).toEqual([
			{ bucket: "instituto-storage", key: previous },
		]);
		expect(calls.updated[0]).toMatchObject({
			data: {
				coverImageUrl: `/api/storage?key=${encodeURIComponent(calls.uploaded[0].key)}`,
			},
		});
	});

	test("`removeCover` deja la columna en null y borra el objeto", async () => {
		const previous = "media/portadas/vieja-1700000000.webp";
		const { service, calls } = createHarness({
			course: courseOf({
				coverImageUrl: `/api/storage?key=${encodeURIComponent(previous)}`,
			}),
		});

		await service.update(
			COURSE_ID,
			dtoOf({ removeCover: true }) as UpdateCourseDto,
			actorOf(),
		);

		expect(calls.uploaded).toEqual([]);
		expect(calls.updated[0]).toMatchObject({ data: { coverImageUrl: null } });
		expect(calls.deleted).toEqual([
			{ bucket: "instituto-storage", key: previous },
		]);
	});

	test("guardar sin tocar la portada la conserva", async () => {
		const { service, calls } = createHarness({
			course: courseOf({
				coverImageUrl: "/api/storage?key=media/portadas/x.webp",
			}),
		});

		await service.update(COURSE_ID, dtoOf() as UpdateCourseDto, actorOf());

		// Omitida, no `null`: mandar `null` borraría la portada en cada guardado.
		expect(calls.updated[0]).toMatchObject({ data: {} });
		expect(
			(calls.updated[0] as { data: Record<string, unknown> }).data,
		).not.toHaveProperty("coverImageUrl");
		expect(calls.deleted).toEqual([]);
	});

	test.each([
		["un tipo fuera de la allowlist", { type: "image/gif" }],
		["un archivo por encima del tope", { size: 6 * 1024 * 1024 }],
		["un archivo vacío", { size: 0 }],
	])("rechaza %s sin subir nada", async (_case, overrides) => {
		const { service, calls } = createHarness();

		const result = await service.create(dtoOf(), actorOf(), coverOf(overrides));

		expect(result).toMatchObject({
			success: false,
			error: { code: COURSE_ERROR_CODES.COVER_INVALID },
		});
		expect(calls.uploaded).toEqual([]);
		expect(calls.created).toEqual([]);
	});

	test("sin bucket configurado falla y no escribe el curso", async () => {
		const { service, calls } = createHarness({ noBucket: true });

		const result = await service.create(dtoOf(), actorOf(), coverOf());

		expect(result.success).toBe(false);
		expect(calls.created).toEqual([]);
	});
});

const selfPacedCourse = () =>
	courseOf({
		format: "SELF_PACED",
		completionRule: "CONTENT",
		requiresEvaluation: true,
		sessions: [],
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

	test("un curso con sesiones ni siquiera consulta el temario", async () => {
		const { service, calls } = createHarness();

		await service.publish(COURSE_ID, actorOf());

		expect(calls.lessonCounts).toEqual([]);
	});

	test("publica un autogestivo sin una sola sesión", async () => {
		const { service, calls } = createHarness({
			course: selfPacedCourse(),
			lessons: 2,
		});

		const result = await service.publish(COURSE_ID, actorOf());

		expect(result.success).toBe(true);
		expect(calls.published).toHaveLength(1);
	});

	test("no publica un autogestivo sin lecciones", async () => {
		const { service, calls } = createHarness({
			course: selfPacedCourse(),
			lessons: 0,
		});

		const result = await service.publish(COURSE_ID, actorOf());

		expect(result).toMatchObject({
			success: false,
			error: { code: COURSE_ERROR_CODES.WITHOUT_LESSONS },
		});
		expect(calls.published).toHaveLength(0);
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

describe("avisos de cambios y cancelación (§6.12)", () => {
	const publishedWithSession = () =>
		courseOf({
			status: "PUBLISHED",
			sessions: [
				{
					id: 1,
					documentId: "ses-1",
					startsAt: new Date("2026-10-05T16:00:00.000Z"),
					endsAt: new Date("2026-10-05T20:00:00.000Z"),
					venue: "Sala A",
					link: null,
				},
			],
		});

	const sameSession = {
		documentId: "ses-1",
		date: "2026-10-05",
		startTime: "09:00",
		endTime: "13:00",
		venue: "Sala A",
	};

	test("cambiar la sede de un publicado avisa dentro de la transacción", async () => {
		const { service, calls } = createHarness({
			course: publishedWithSession(),
		});

		await service.update(
			COURSE_ID,
			dtoOf({ sessions: [{ ...sameSession, venue: "Sala B" }] }),
			actorOf(),
		);

		expect(calls.notified).toHaveLength(1);
		expect(calls.notified[0].inTransaction).toBe(true);
		expect(calls.notified[0].events[0]).toMatchObject({
			template: "COURSE_UPDATED",
			to: { email: "diana.sop@instituto.gob.mx" },
		});
	});

	test("cambiar solo el título no avisa", async () => {
		const { service, calls } = createHarness({
			course: publishedWithSession(),
		});

		await service.update(
			COURSE_ID,
			dtoOf({ title: "Otro título", sessions: [sameSession] }),
			actorOf(),
		);

		expect(calls.notified).toEqual([]);
	});

	test("un borrador no avisa aunque cambien sus sesiones", async () => {
		const { service, calls } = createHarness({
			course: { ...publishedWithSession(), status: "DRAFT" },
		});

		await service.update(
			COURSE_ID,
			dtoOf({ sessions: [{ ...sameSession, venue: "Sala B" }] }),
			actorOf(),
		);

		expect(calls.notified).toEqual([]);
	});

	test("cancelar un publicado avisa a inscritos e invitados; un borrador no", async () => {
		const published = createHarness({
			course: courseOf({ status: "PUBLISHED" }),
		});
		const draft = createHarness({ course: courseOf({ status: "DRAFT" }) });

		await published.service.cancel(COURSE_ID, actorOf());
		await draft.service.cancel(COURSE_ID, actorOf());

		expect(published.calls.notified[0]).toMatchObject({
			inTransaction: true,
			events: [{ template: "COURSE_CANCELLED" }],
		});
		expect(draft.calls.notified).toEqual([]);
	});

	test("sin inscritos ni invitados no se encola nada", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ status: "PUBLISHED" }),
			recipients: [],
		});

		await service.cancel(COURSE_ID, actorOf());

		expect(calls.notified).toEqual([]);
	});
});

describe("hasScheduleChanges", () => {
	const session = {
		documentId: "a",
		startsAt: new Date("2026-10-05T16:00:00.000Z"),
		endsAt: new Date("2026-10-05T20:00:00.000Z"),
		venue: "Sala A",
		link: null,
	};

	test("detecta alta, baja, horario, sede y enlace", () => {
		expect(hasScheduleChanges([session], [session])).toBe(false);
		expect(
			hasScheduleChanges(
				[session],
				[session, { ...session, documentId: undefined }],
			),
		).toBe(true);
		expect(hasScheduleChanges([session], [])).toBe(true);
		expect(
			hasScheduleChanges(
				[session],
				[{ ...session, endsAt: new Date("2026-10-05T21:00:00.000Z") }],
			),
		).toBe(true);
		expect(
			hasScheduleChanges([session], [{ ...session, venue: "Sala B" }]),
		).toBe(true);
		expect(
			hasScheduleChanges([session], [{ ...session, link: "https://meet" }]),
		).toBe(true);
	});

	test("una sesión con documentId ajeno cuenta como alta", () => {
		expect(
			hasScheduleChanges([session], [{ ...session, documentId: "otro" }]),
		).toBe(true);
	});
});
