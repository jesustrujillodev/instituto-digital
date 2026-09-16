import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { DuplicateEmailError } from "@/modules/users/domain/user.errors";
import type { SafeUser } from "@/modules/users/domain/user.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type { Role } from "@/shared/rules/atoms.rules";
import { TRAINER_ERROR_CODES } from "../../domain/trainer.errors";
import type { TrainerDetail } from "../../domain/trainer.types";
import { createTrainerService } from "../trainers.service.server";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const userOf = (overrides: Partial<SafeUser> = {}): SafeUser =>
	({
		id: 9,
		documentId: USER_ID,
		email: "ana@instituto.gob.mx",
		firstName: "Ana",
		lastName: "Ruiz",
		role: "USER",
		phone: null,
		type: "INTERNAL",
		employeeNumber: "EMP-0007",
		jobTitle: null,
		photoUrl: null,
		dependencyId: 3,
		isTrainer: false,
		archivedAt: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...overrides,
	}) as SafeUser;

const detailOf = (overrides: Partial<TrainerDetail> = {}): TrainerDetail => ({
	userDocumentId: USER_ID,
	firstName: "Ana",
	lastName: "Ruiz",
	email: "ana@instituto.gob.mx",
	type: "INTERNAL",
	specialty: "Protección civil",
	institution: null,
	dependencyName: "Obras Públicas",
	archivedAt: null,
	phone: null,
	bio: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	coursesTaught: 0,
	averageRating: null,
	...overrides,
});

const actorOf = (
	role: Role = "DEPENDENCY_HEAD",
	dependencyId: number | null = 3,
): AuthContext => ({
	userId: 99,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "titular@instituto.gob.mx",
	role,
	dependencyId,
	isTrainer: false,
});

/**
 * Dobles mínimos: solo lo que toca la operación bajo prueba. Un doble completo
 * del cradle escondería de qué depende cada caso de uso.
 */
const createHarness = (
	options: {
		user?: SafeUser | null;
		exists?: boolean;
		trainers?: TrainerDetail[];
		total?: number;
		createThrows?: Error;
		userCreateThrows?: Error;
		revokeFails?: boolean;
	} = {},
) => {
	const calls = {
		listFilters: [] as unknown[],
		created: [] as unknown[],
		usersCreated: [] as unknown[],
		updated: [] as unknown[],
		archived: [] as number[],
		unarchived: [] as number[],
		revoked: [] as number[],
		scopes: [] as unknown[],
		transactions: 0,
	};

	const trainerRepository = {
		findAll: async (filters: unknown) => {
			calls.listFilters.push(filters);
			return options.trainers ?? [];
		},
		count: async () => options.total ?? 0,
		findByUserDocumentId: async () => options.trainers?.[0] ?? null,
		existsForUser: async () => options.exists ?? false,
		create: async (data: unknown) => {
			if (options.createThrows) throw options.createThrows;
			calls.created.push(data);
			return detailOf();
		},
		update: async (userId: number, dto: unknown) => {
			calls.updated.push({ userId, dto });
			return detailOf();
		},
		archive: async (userId: number) => {
			calls.archived.push(userId);
			return detailOf({ archivedAt: new Date() });
		},
		unarchive: async (userId: number) => {
			calls.unarchived.push(userId);
			return detailOf();
		},
	} as unknown as ICradle["trainerRepository"];

	const userRepository = {
		findById: async (_documentId: string, scope: unknown) => {
			calls.scopes.push(scope);
			return options.user === undefined ? userOf() : options.user;
		},
		create: async (data: unknown) => {
			if (options.userCreateThrows) throw options.userCreateThrows;
			calls.usersCreated.push(data);
			return userOf({ id: 21, type: "EXTERNAL", dependencyId: null });
		},
	} as unknown as ICradle["userRepository"];

	const passwordService = {
		hash: async (plain: string) => `hashed:${plain}`,
	} as unknown as ICradle["passwordService"];

	const sessionMonitorService = {
		revokeAllForUser: async (userId: number) => {
			calls.revoked.push(userId);
			return options.revokeFails
				? {
						success: false as const,
						error: { code: "INTERNAL_ERROR", message: "técnico" },
						timestamp: new Date().toISOString(),
					}
				: {
						success: true as const,
						data: null,
						timestamp: new Date().toISOString(),
					};
		},
	} as unknown as ICradle["sessionMonitorService"];

	// El doble hace lo que hace el real: ejecuta el callback. Lo que la prueba
	// vigila es que la escritura compuesta pase POR él, no cómo abre la
	// transacción — eso es de Postgres.
	const runInTransaction = (async <T>(callback: () => Promise<T>) => {
		calls.transactions += 1;
		return callback();
	}) as unknown as ICradle["runInTransaction"];

	const service = createTrainerService({
		trainerRepository,
		userRepository,
		passwordService,
		sessionMonitorService,
		runInTransaction,
		logger: silentLogger,
	});

	return { service, calls };
};

describe("createTrainerService — catálogo", () => {
	// El catálogo es la única lista del sistema sin recorte por dependencia: §4
	// del alcance lo quiere global para que cualquier titular pueda asignar a
	// cualquier capacitador activo.
	test("list no recibe ningún alcance", async () => {
		const { service, calls } = createHarness({
			trainers: [detailOf()],
			total: 1,
		});

		const result = await service.list({ page: 1, pageSize: 10 });

		expect(result.success).toBe(true);
		expect(calls.scopes).toEqual([]);
	});

	test("list devuelve la paginación con los defaults del módulo", async () => {
		const { service } = createHarness({ trainers: [detailOf()], total: 1 });

		const result = await service.list({});

		expect(result.success && result.pagination).toEqual({
			page: 1,
			pageSize: 10,
			total: 1,
			totalPages: 1,
		});
	});

	test("una cuenta sin perfil responde NOT_FOUND, no un dato nulo", async () => {
		const { service } = createHarness({ trainers: [] });

		const result = await service.findByUser(USER_ID);

		expect(result.success).toBe(false);
		expect(!result.success && result.error.code).toBe(
			TRAINER_ERROR_CODES.NOT_FOUND,
		);
	});

	test("la ficha expone las estadísticas que calcula el repositorio", async () => {
		const { service } = createHarness({
			trainers: [{ ...detailOf(), coursesTaught: 2, averageRating: 4 }],
		});

		const result = await service.findByUser(USER_ID);

		expect(result.success && result.data.coursesTaught).toBe(2);
		expect(result.success && result.data.averageRating).toBe(4);
	});
});

describe("createTrainerService — activar perfil", () => {
	test("crea el perfil y revoca los tokens del afectado", async () => {
		const { service, calls } = createHarness();

		const result = await service.activateProfile(
			{ userDocumentId: USER_ID, specialty: "Protección civil" },
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.created).toEqual([
			{
				userId: 9,
				specialty: "Protección civil",
				institution: null,
				bio: null,
			},
		]);
		// `isTrainer` viaja firmado en el access token: sin revocar, el cambio
		// tardaría en notarse lo que dure ese token.
		expect(calls.revoked).toEqual([9]);
	});

	// La lectura pide alcance global porque un externo no pertenece a ninguna
	// dependencia; quien decide de verdad es canManageTrainer.
	test("lee la cuenta con alcance global y decide con la jerarquía", async () => {
		const { service, calls } = createHarness();

		await service.activateProfile(
			{ userDocumentId: USER_ID, specialty: "Protección civil" },
			actorOf(),
		);

		expect(calls.scopes).toEqual([{ kind: "global" }]);
	});

	test("un titular no activa el perfil de otra dependencia", async () => {
		const { service, calls } = createHarness({
			user: userOf({ dependencyId: 7 }),
		});

		const result = await service.activateProfile(
			{ userDocumentId: USER_ID, specialty: "Protección civil" },
			actorOf("DEPENDENCY_HEAD", 3),
		);

		expect(!result.success && result.error.code).toBe(
			TRAINER_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(calls.created).toEqual([]);
	});

	test("un participante sin rol de administración no activa nada", async () => {
		const { service, calls } = createHarness();

		const result = await service.activateProfile(
			{ userDocumentId: USER_ID, specialty: "Protección civil" },
			actorOf("USER", 3),
		);

		expect(!result.success && result.error.code).toBe(
			TRAINER_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(calls.created).toEqual([]);
	});

	test("una cuenta que ya tiene perfil se rechaza con su código propio", async () => {
		const { service, calls } = createHarness({ exists: true });

		const result = await service.activateProfile(
			{ userDocumentId: USER_ID, specialty: "Protección civil" },
			actorOf(),
		);

		expect(!result.success && result.error.code).toBe(
			TRAINER_ERROR_CODES.ALREADY_EXISTS,
		);
		expect(calls.created).toEqual([]);
	});

	test("una cuenta inexistente responde NOT_FOUND", async () => {
		const { service } = createHarness({ user: null });

		const result = await service.activateProfile(
			{ userDocumentId: USER_ID, specialty: "Protección civil" },
			actorOf(),
		);

		expect(!result.success && result.error.code).toBe(
			TRAINER_ERROR_CODES.NOT_FOUND,
		);
	});

	// La revocación es best-effort: la activación ya está confirmada y deshacerla
	// sería peor que una ventana de sesión.
	test("un fallo al revocar no tumba la activación", async () => {
		const { service, calls } = createHarness({ revokeFails: true });

		const result = await service.activateProfile(
			{ userDocumentId: USER_ID, specialty: "Protección civil" },
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.revoked).toEqual([9]);
	});
});

describe("createTrainerService — editar y desactivar", () => {
	test("editar el perfil no revoca sesiones", async () => {
		const { service, calls } = createHarness();

		const result = await service.updateProfile(
			USER_ID,
			{ specialty: "Primeros auxilios" },
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.updated).toEqual([
			{ userId: 9, dto: { specialty: "Primeros auxilios" } },
		]);
		expect(calls.revoked).toEqual([]);
	});

	test("un interno no puede llevar institución", async () => {
		const { service, calls } = createHarness();

		const result = await service.updateProfile(
			USER_ID,
			{ institution: "Universidad Autónoma" },
			actorOf(),
		);

		expect(!result.success && result.error.code).toBe(
			TRAINER_ERROR_CODES.INTERNAL_CANNOT_HAVE_INSTITUTION,
		);
		expect(calls.updated).toEqual([]);
	});

	test("un externo sin institución se rechaza", async () => {
		const { service } = createHarness({
			user: userOf({
				type: "EXTERNAL",
				dependencyId: null,
				employeeNumber: null,
			}),
		});

		const result = await service.updateProfile(
			USER_ID,
			{ institution: "" },
			actorOf(),
		);

		expect(!result.success && result.error.code).toBe(
			TRAINER_ERROR_CODES.EXTERNAL_REQUIRES_INSTITUTION,
		);
	});

	// Un externo no tiene dependencia, así que el alcance del titular no lo
	// alcanzaría: ahí manda el rol, que es lo que dice la matriz de §3.
	test("un titular sí administra a un externo", async () => {
		const { service, calls } = createHarness({
			user: userOf({
				type: "EXTERNAL",
				dependencyId: null,
				employeeNumber: null,
			}),
		});

		const result = await service.deactivateProfile(USER_ID, actorOf());

		expect(result.success).toBe(true);
		expect(calls.archived).toEqual([9]);
	});

	test("desactivar y reactivar revocan los tokens", async () => {
		const { service, calls } = createHarness();

		await service.deactivateProfile(USER_ID, actorOf());
		await service.reactivateProfile(USER_ID, actorOf());

		expect(calls.archived).toEqual([9]);
		expect(calls.unarchived).toEqual([9]);
		expect(calls.revoked).toEqual([9, 9]);
	});
});

describe("createTrainerService — alta de capacitador externo", () => {
	test("crea cuenta y perfil dentro de la misma transacción", async () => {
		const { service, calls } = createHarness();

		const result = await service.createExternal(
			{
				firstName: "Luis",
				lastName: "Mora",
				email: "luis@universidad.mx",
				password: "Password123!",
				specialty: "Transparencia",
				institution: "Universidad Autónoma",
			},
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.transactions).toBe(1);
		expect(calls.usersCreated).toEqual([
			{
				email: "luis@universidad.mx",
				password: "hashed:Password123!",
				firstName: "Luis",
				lastName: "Mora",
				phone: undefined,
				role: "USER",
				type: "EXTERNAL",
				dependencyId: null,
			},
		]);
		expect(calls.created).toEqual([
			{
				userId: 21,
				specialty: "Transparencia",
				institution: "Universidad Autónoma",
				bio: null,
			},
		]);
	});

	// La invariante de §4 del alcance —todo externo tiene perfil— no la puede
	// imponer la base, porque el dato que decide está en otra tabla.
	test("si el perfil falla, la cuenta tampoco queda creada", async () => {
		const boom = new Error("perfil roto");
		const { service, calls } = createHarness({ createThrows: boom });

		const result = await service.createExternal(
			{
				firstName: "Luis",
				lastName: "Mora",
				email: "luis@universidad.mx",
				password: "Password123!",
				specialty: "Transparencia",
				institution: "Universidad Autónoma",
			},
			actorOf(),
		);

		expect(result.success).toBe(false);
		// La escritura pasó por la frontera transaccional, que es lo que hace que
		// el fallo deshaga también el INSERT de la cuenta.
		expect(calls.transactions).toBe(1);
		expect(calls.created).toEqual([]);
	});

	test("el choque de correo se traduce al código del catálogo", async () => {
		const { service } = createHarness({
			userCreateThrows: new DuplicateEmailError(),
		});

		const result = await service.createExternal(
			{
				firstName: "Luis",
				lastName: "Mora",
				email: "luis@universidad.mx",
				password: "Password123!",
				specialty: "Transparencia",
				institution: "Universidad Autónoma",
			},
			actorOf(),
		);

		expect(!result.success && result.error.code).toBe(
			TRAINER_ERROR_CODES.DUPLICATE_EMAIL,
		);
	});

	test("un participante no registra externos", async () => {
		const { service, calls } = createHarness();

		const result = await service.createExternal(
			{
				firstName: "Luis",
				lastName: "Mora",
				email: "luis@universidad.mx",
				password: "Password123!",
				specialty: "Transparencia",
				institution: "Universidad Autónoma",
			},
			actorOf("USER", 3),
		);

		expect(!result.success && result.error.code).toBe(
			TRAINER_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(calls.transactions).toBe(0);
	});
});
