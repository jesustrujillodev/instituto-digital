import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { NotificationEvent } from "@/modules/notifications/domain/notification.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type { Role } from "@/shared/rules/atoms.rules";
import type { UploadInput } from "@/shared/storage/upload-validation";
import type { SafeUser } from "../../domain/user.types";
import { createUserService } from "../users.service.server";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const DEPENDENCY_ID = "22222222-2222-4222-8222-222222222222";
const BUCKET = "mi-bucket";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const userOf = (overrides: Partial<SafeUser> = {}): SafeUser =>
	({
		id: 7,
		documentId: DOCUMENT_ID,
		email: "ana@instituto.gob.mx",
		firstName: "Ana",
		lastName: "Ruiz",
		role: "USER",
		phone: null,
		photoUrl: null,
		type: "INTERNAL",
		employeeNumber: "EMP-0007",
		jobTitle: null,
		dependencyId: 3,
		archivedAt: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...overrides,
	}) as SafeUser;

/** El actor de la mutación. Su rol y su dependencia deciden qué puede tocar. */
const actorOf = (
	role: Role = "SUPERADMIN",
	dependencyId: number | null = null,
): AuthContext => ({
	userId: 99,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "admin@instituto.gob.mx",
	role,
	dependencyId,
	isTrainer: false,
});

const photoOf = (overrides: Partial<UploadInput> = {}): UploadInput => ({
	name: "ana.png",
	type: "image/png",
	size: 1024,
	arrayBuffer: async () => new ArrayBuffer(8),
	...overrides,
});

const GLOBAL_SCOPE = { kind: "global" } as const;

/**
 * Dobles mínimos: solo lo que toca la operación bajo prueba. El resto del cradle
 * se deja fuera a propósito — un doble completo escondería qué depende de qué.
 */
const createHarness = (
	options: {
		user?: SafeUser | null;
		users?: SafeUser[];
		total?: number;
		storageBucket?: string | null;
		dependency?: { id: number; archivedAt: Date | null } | null;
		revokeFails?: boolean;
		passwordMatches?: boolean;
		userWithPassword?: { password: string | null } | null;
	} = {},
) => {
	let txDepth = 0;
	const calls = {
		notified: [] as { events: NotificationEvent[]; inTransaction: boolean }[],
		findAll: [] as unknown[],
		countScopes: [] as unknown[],
		findByIdScopes: [] as unknown[],
		created: [] as Record<string, unknown>[],
		updated: [] as unknown[],
		hashed: [] as string[],
		uploaded: [] as { bucket: string; key: string }[],
		photoUrl: [] as string[],
		updatePassword: [] as { hash: string; scope: unknown }[],
		archived: [] as unknown[],
		unarchived: [] as unknown[],
		deleted: [] as unknown[],
		changeDependency: [] as unknown[],
		history: [] as unknown[],
		revoked: [] as number[],
	};

	const userRepository = {
		findAll: async (filters: unknown, scope: unknown) => {
			calls.findAll.push({ filters, scope });
			return options.users ?? [];
		},
		count: async (_filters: unknown, scope: unknown) => {
			calls.countScopes.push(scope);
			return options.total ?? 0;
		},
		findById: async (_documentId: string, scope: unknown) => {
			calls.findByIdScopes.push(scope);
			return options.user === undefined ? userOf() : options.user;
		},
		findByEmail: async () =>
			options.userWithPassword === undefined
				? { ...userOf(), password: "hash-en-base" }
				: options.userWithPassword,
		create: async (data: Record<string, unknown>) => {
			calls.created.push(data);
			return userOf();
		},
		update: async (documentId: string, dto: unknown, scope: unknown) => {
			calls.updated.push({ documentId, dto, scope });
			return userOf();
		},
		updatePhoto: async (_documentId: string, url: string) => {
			calls.photoUrl.push(url);
			return userOf({ photoUrl: url });
		},
		updatePassword: async (
			_documentId: string,
			hash: string,
			scope: unknown,
		) => {
			calls.updatePassword.push({ hash, scope });
		},
		archive: async (documentId: string, scope: unknown) => {
			calls.archived.push({ documentId, scope });
			return userOf({ archivedAt: new Date() });
		},
		unarchive: async (documentId: string, scope: unknown) => {
			calls.unarchived.push({ documentId, scope });
			return userOf();
		},
		delete: async (documentId: string, scope: unknown) => {
			calls.deleted.push({ documentId, scope });
		},
		changeDependency: async (params: unknown) => {
			calls.changeDependency.push(params);
			return userOf({ dependencyId: 5, role: "USER" });
		},
		listDependencyHistory: async (documentId: string, scope: unknown) => {
			calls.history.push({ documentId, scope });
			return [];
		},
	} as unknown as ICradle["userRepository"];

	const dependencyRepository = {
		findById: async () =>
			options.dependency === undefined
				? { id: 5, name: "Desarrollo Social", archivedAt: null }
				: options.dependency,
		findByInternalId: async (id: number) => ({
			id,
			name: "Obras Públicas",
			archivedAt: null,
		}),
	} as unknown as ICradle["dependencyRepository"];

	const runInTransaction = (async <T>(callback: () => Promise<T>) => {
		txDepth += 1;
		try {
			return await callback();
		} finally {
			txDepth -= 1;
		}
	}) as unknown as ICradle["runInTransaction"];

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

	const passwordService = {
		hash: async (plain: string) => {
			calls.hashed.push(plain);
			return `hash-de-${plain}`;
		},
		compare: async () => options.passwordMatches ?? true,
	} as unknown as ICradle["passwordService"];

	const storageProvider = {
		uploadFile: async (bucket: string, key: string) => {
			calls.uploaded.push({ bucket, key });
		},
		getPublicUrl: (_bucket: string, key: string) =>
			`/api/storage?key=${encodeURIComponent(key)}`,
	} as unknown as ICradle["storageProvider"];

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

	const service = createUserService({
		notificationService,
		runInTransaction,
		userRepository,
		dependencyRepository,
		sessionMonitorService,
		passwordService,
		storageProvider,
		storageBucket:
			options.storageBucket === undefined ? BUCKET : options.storageBucket,
		storagePublicBucket: null,
		logger: silentLogger,
	});

	return { service, calls };
};

describe("createUserService — list", () => {
	test("devuelve la página con su paginación derivada del total", async () => {
		const { service } = createHarness({ users: [userOf()], total: 42 });

		const result = await service.list({ page: 2, pageSize: 10 }, GLOBAL_SCOPE);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toHaveLength(1);
			expect(result.pagination).toEqual({
				page: 2,
				pageSize: 10,
				total: 42,
				totalPages: 5,
			});
		}
	});

	// Si solo se filtrara el listado, el total contaría cuentas ajenas y las
	// delataría aunque ninguna apareciera en pantalla (criterio de aceptación 4).
	test("reenvía el MISMO alcance a findAll y a count", async () => {
		const scope = { kind: "dependency", dependencyId: 3 } as const;
		const { service, calls } = createHarness();

		await service.list({}, scope);

		expect(calls.findAll).toEqual([{ filters: {}, scope }]);
		expect(calls.countScopes).toEqual([scope]);
	});

	test("un alcance vacío también llega al repositorio", async () => {
		const scope = { kind: "none" } as const;
		const { service, calls } = createHarness();

		await service.list({}, scope);

		expect(calls.countScopes).toEqual([scope]);
	});
});

describe("createUserService — findById", () => {
	test("reenvía el alcance y devuelve la cuenta", async () => {
		const scope = { kind: "dependency", dependencyId: 3 } as const;
		const { service, calls } = createHarness();

		const result = await service.findById(DOCUMENT_ID, scope);

		expect(result.success && result.data.documentId).toBe(DOCUMENT_ID);
		expect(calls.findByIdScopes).toEqual([scope]);
	});

	// Criterio de aceptación 2 del PRD: fuera de alcance se ve igual que
	// inexistente. El repositorio devuelve null en los dos casos y el servicio no
	// los distingue — decirlo confirmaría que la cuenta existe.
	test("fuera de alcance responde USER_NOT_FOUND, no un permiso denegado", async () => {
		const { service } = createHarness({ user: null });

		const result = await service.findById(DOCUMENT_ID, GLOBAL_SCOPE);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("USER_NOT_FOUND");
	});
});

describe("createUserService — create", () => {
	const validDto = {
		email: "nueva@instituto.gob.mx",
		password: "contrasena1",
		employeeNumber: "EMP-0100",
		type: "INTERNAL" as const,
		dependency: DEPENDENCY_ID,
	};

	test("hashea la contraseña antes de persistirla", async () => {
		const { service, calls } = createHarness();

		await service.create(validDto, actorOf());

		expect(calls.hashed).toEqual(["contrasena1"]);
		expect(calls.created[0].password).toBe("hash-de-contrasena1");
		expect(calls.created[0].password).not.toBe("contrasena1");
	});

	// El dto de frontera habla en documentId; la columna, en id interno. Si el
	// documentId llegara al repositorio, Prisma lo leería como la RELACIÓN
	// `dependency` y la escritura fallaría.
	test("traduce la dependencia a su id interno y no deja pasar el público", async () => {
		const { service, calls } = createHarness();

		await service.create(validDto, actorOf());

		expect(calls.created[0].dependencyId).toBe(5);
		expect(calls.created[0]).not.toHaveProperty("dependency");
	});

	test("rechaza un alta en una dependencia desactivada", async () => {
		const { service, calls } = createHarness({
			dependency: { id: 5, archivedAt: new Date() },
		});

		const result = await service.create(validDto, actorOf());

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("USER_DEPENDENCY_INACTIVE");
		}
		expect(calls.created).toEqual([]);
	});

	test("rechaza un alta en una dependencia inexistente", async () => {
		const { service, calls } = createHarness({ dependency: null });

		const result = await service.create(validDto, actorOf());

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("USER_DEPENDENCY_NOT_FOUND");
		}
		expect(calls.created).toEqual([]);
	});

	// La regla de valibot lo exige en la frontera; esto cubre la escritura que no
	// pasa por un formulario, antes de que el CHECK de la base la rechace con un
	// error sin código de dominio.
	test("un interno sin número de empleado falla con su código", async () => {
		const { service, calls } = createHarness();
		const { employeeNumber: _, ...sinNumero } = validDto;

		const result = await service.create(sinNumero, actorOf());

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("EMPLOYEE_NUMBER_REQUIRED");
		}
		expect(calls.created).toEqual([]);
	});

	// §4 del alcance: todo externo tiene perfil de capacitador, y esa invariante
	// cruza dos tablas, así que la base no puede imponerla. El alta de externos
	// vive en el catálogo, que crea cuenta y perfil en la misma transacción.
	test("una cuenta externa no se da de alta desde aquí", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			{ ...validDto, type: "EXTERNAL", employeeNumber: undefined },
			actorOf(),
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("EXTERNAL_REQUIRES_TRAINER_PROFILE");
		}
		expect(calls.created).toEqual([]);
	});

	// Criterio de aceptación 5 del PRD: un auxiliar da de alta participantes pero
	// no puede convertir a nadie en auxiliar ni en titular.
	test("un auxiliar no puede otorgar el rol de auxiliar", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			{ ...validDto, role: "DEPENDENCY_DEPUTY" },
			actorOf("DEPENDENCY_DEPUTY", 3),
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("FORBIDDEN_SCOPE");
		expect(calls.created).toEqual([]);
	});

	test("un titular sí puede otorgar el rol de auxiliar", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			{ ...validDto, role: "DEPENDENCY_DEPUTY" },
			actorOf("DEPENDENCY_HEAD", 3),
		);

		expect(result.success).toBe(true);
		expect(calls.created).toHaveLength(1);
	});

	// La titularidad se designa en la pantalla de la dependencia, que la aplica en
	// una transacción y revoca los tokens. Otorgarla aquí se saltaría ese relevo.
	test("nadie otorga DEPENDENCY_HEAD desde el alta, ni el superadministrador", async () => {
		const { service } = createHarness();

		const result = await service.create(
			{ ...validDto, role: "DEPENDENCY_HEAD" },
			actorOf("SUPERADMIN"),
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("FORBIDDEN_SCOPE");
	});

	// Se FUERZA la propia y no se rechaza: el campo llega fijo y deshabilitado, así
	// que otro valor solo puede venir de un envío manipulado.
	test("un titular da de alta en SU dependencia, ignore lo que pida el formulario", async () => {
		const { service, calls } = createHarness();

		await service.create(validDto, actorOf("DEPENDENCY_HEAD", 3));

		expect(calls.created[0].dependencyId).toBe(3);
	});

	// Su alcance es global, no una dependencia: es el único interno exento.
	test("el superadministrador puede crearse sin dependencia", async () => {
		const { service, calls } = createHarness();
		const { dependency: _, ...sinDependencia } = validDto;

		const result = await service.create(
			{ ...sinDependencia, role: "SUPERADMIN" },
			actorOf("SUPERADMIN"),
		);

		expect(result.success).toBe(true);
		expect(calls.created[0].dependencyId).toBeNull();
	});
});

describe("createUserService — jerarquía en las mutaciones", () => {
	// El alcance por sí solo no basta: un auxiliar y su titular comparten
	// dependencia, así que sin comparar rangos el auxiliar podría archivar a quien
	// lo administra (regla 10).
	test("un auxiliar no archiva a su titular aunque compartan dependencia", async () => {
		const { service, calls } = createHarness({
			user: userOf({ role: "DEPENDENCY_HEAD", dependencyId: 3 }),
		});

		const result = await service.archive(
			DOCUMENT_ID,
			actorOf("DEPENDENCY_DEPUTY", 3),
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("FORBIDDEN_SCOPE");
		expect(calls.archived).toEqual([]);
	});

	// Aquí SÍ se dice que falta permiso: el actor ya conoce la cuenta —está en su
	// dependencia— y un 404 le haría buscar un problema que no existe.
	test("sin rango responde FORBIDDEN_SCOPE y no USER_NOT_FOUND", async () => {
		const { service } = createHarness({
			user: userOf({ role: "SUPERADMIN", dependencyId: 3 }),
		});

		const result = await service.update(
			DOCUMENT_ID,
			{ firstName: "Otra" },
			actorOf("DEPENDENCY_HEAD", 3),
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("FORBIDDEN_SCOPE");
	});

	test("cambiar a un rol que no se puede otorgar falla", async () => {
		const { service, calls } = createHarness();

		const result = await service.update(
			DOCUMENT_ID,
			{ role: "SUPERADMIN" },
			actorOf("DEPENDENCY_HEAD", 3),
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("FORBIDDEN_SCOPE");
		expect(calls.updated).toEqual([]);
	});
});

describe("createUserService — archive", () => {
	// Sin revocar, "un usuario inactivo no puede iniciar sesión" solo se cumpliría
	// al expirar su access token: durante ese rato seguiría operando con normalidad
	// (criterio de aceptación 10).
	test("revoca el epoch y las sesiones al archivar", async () => {
		const { service, calls } = createHarness();

		const result = await service.archive(DOCUMENT_ID, actorOf());

		expect(result.success).toBe(true);
		expect(calls.archived).toHaveLength(1);
		expect(calls.revoked).toEqual([7]);
	});

	// Best-effort: la cuenta ya está archivada y deshacerlo sería peor que una
	// ventana de sesión. El fallo se registra, no se propaga.
	test("un fallo al revocar no tumba el archivado", async () => {
		const { service, calls } = createHarness({ revokeFails: true });

		const result = await service.archive(DOCUMENT_ID, actorOf());

		expect(result.success).toBe(true);
		expect(calls.archived).toHaveLength(1);
	});

	// Restaurar no revoca nada: no hay sesión que cortar, la cuenta estaba fuera.
	test("unarchive no revoca sesiones", async () => {
		const { service, calls } = createHarness();

		await service.unarchive(DOCUMENT_ID, actorOf());

		expect(calls.unarchived).toHaveLength(1);
		expect(calls.revoked).toEqual([]);
	});
});

describe("createUserService — delete", () => {
	test("exige que la cuenta esté archivada", async () => {
		const { service, calls } = createHarness({
			user: userOf({ archivedAt: null }),
		});

		const result = await service.delete(DOCUMENT_ID, actorOf());

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("USER_NOT_ARCHIVED");
		expect(calls.deleted).toEqual([]);
	});

	test("borra cuando la cuenta ya estaba archivada, con su alcance", async () => {
		const { service, calls } = createHarness({
			user: userOf({ archivedAt: new Date() }),
		});

		const result = await service.delete(DOCUMENT_ID, actorOf());

		expect(result.success).toBe(true);
		expect(calls.deleted).toEqual([
			{ documentId: DOCUMENT_ID, scope: GLOBAL_SCOPE },
		]);
	});
});

describe("createUserService — changeDependency", () => {
	test("escribe la bitácora con el autor y revoca los tokens", async () => {
		const { service, calls } = createHarness();

		const result = await service.changeDependency(
			DOCUMENT_ID,
			DEPENDENCY_ID,
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.changeDependency).toEqual([
			{
				documentId: DOCUMENT_ID,
				toDependencyId: 5,
				changedById: 99,
				nextRole: "USER",
				scope: GLOBAL_SCOPE,
			},
		]);
		// El claim `dependencyId` viaja firmado: sin revocar, el alcance nuevo no
		// valdría hasta que expirara el token (regla 11).
		expect(calls.revoked).toEqual([7]);
	});

	// Regla 7: auxiliar y titular son cargos DE una dependencia y se pierden al
	// salir. Las inscripciones y el historial se conservan.
	test("el auxiliar se degrada a participante al cambiarse", async () => {
		const { service, calls } = createHarness({
			user: userOf({ id: 99, role: "DEPENDENCY_DEPUTY", dependencyId: 3 }),
		});

		await service.changeDependency(
			DOCUMENT_ID,
			DEPENDENCY_ID,
			actorOf("DEPENDENCY_DEPUTY", 3),
		);

		expect(calls.changeDependency).toHaveLength(1);
		expect((calls.changeDependency[0] as { nextRole: string }).nextRole).toBe(
			"USER",
		);
	});

	// Criterio de aceptación 9 del PRD. Dejaría su dependencia sin quien la
	// administre, y el índice único parcial le impediría ser titular de la nueva.
	test("un titular no puede cambiarse por su cuenta", async () => {
		const { service, calls } = createHarness({
			user: userOf({ id: 99, role: "DEPENDENCY_HEAD", dependencyId: 3 }),
		});

		const result = await service.changeDependency(
			DOCUMENT_ID,
			DEPENDENCY_ID,
			actorOf("DEPENDENCY_HEAD", 3),
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("HEAD_CANNOT_LEAVE_DEPENDENCY");
		}
		expect(calls.changeDependency).toEqual([]);
	});

	// La misma regla, ahora sobre la cuenta movida: relevar al titular es un acto
	// propio del superadministrador, no un efecto colateral de un traslado.
	test("tampoco lo puede mover un administrador", async () => {
		const { service, calls } = createHarness({
			user: userOf({ role: "DEPENDENCY_HEAD", dependencyId: 3 }),
		});

		const result = await service.changeDependency(
			DOCUMENT_ID,
			DEPENDENCY_ID,
			actorOf("SUPERADMIN"),
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("HEAD_CANNOT_LEAVE_DEPENDENCY");
		}
		expect(calls.changeDependency).toEqual([]);
	});

	test("rechaza una dependencia destino desactivada", async () => {
		const { service, calls } = createHarness({
			dependency: { id: 5, archivedAt: new Date() },
		});

		const result = await service.changeDependency(
			DOCUMENT_ID,
			DEPENDENCY_ID,
			actorOf(),
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("USER_DEPENDENCY_INACTIVE");
		}
		expect(calls.changeDependency).toEqual([]);
	});

	// Una línea de historial sin cambio sería ruido, y cerrar la sesión por un
	// clic que no movió nada, gratuito.
	test("moverse a la dependencia en la que ya está no escribe ni revoca", async () => {
		const { service, calls } = createHarness({
			user: userOf({ dependencyId: 5 }),
		});

		const result = await service.changeDependency(
			DOCUMENT_ID,
			DEPENDENCY_ID,
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.changeDependency).toEqual([]);
		expect(calls.revoked).toEqual([]);
	});
});

describe("createUserService — updatePhoto", () => {
	test("rechaza un tipo fuera de la allowlist con INVALID_UPLOAD", async () => {
		const { service, calls } = createHarness();

		const result = await service.updatePhoto(
			DOCUMENT_ID,
			photoOf({ type: "application/pdf" }),
			actorOf(),
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("INVALID_UPLOAD");
		expect(calls.uploaded).toEqual([]);
	});

	test("sube al bucket inyectado, bajo el prefijo del módulo", async () => {
		const { service, calls } = createHarness();

		await service.updatePhoto(DOCUMENT_ID, photoOf(), actorOf());

		expect(calls.uploaded).toHaveLength(1);
		expect(calls.uploaded[0].bucket).toBe(BUCKET);
		expect(calls.uploaded[0].key.startsWith("profile-photos/")).toBe(true);
	});

	// Se persiste la referencia del proxy: así cambiar S3↔GCS no invalida lo
	// guardado.
	test("persiste la referencia del proxy, no la del proveedor", async () => {
		const { service, calls } = createHarness();

		await service.updatePhoto(DOCUMENT_ID, photoOf(), actorOf());

		expect(calls.photoUrl[0].startsWith("/api/storage?key=")).toBe(true);
	});

	// Error de configuración, no de negocio: sale como UNEXPECTED_ERROR y su
	// mensaje real se queda en el log, no viaja al cliente.
	test("sin bucket falla sin filtrar el nombre de la variable", async () => {
		const { service } = createHarness({ storageBucket: null });

		const result = await service.updatePhoto(DOCUMENT_ID, photoOf(), actorOf());

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("UNEXPECTED_ERROR");
			expect(result.error.message).not.toContain("STORAGE_BUCKET_NAME");
		}
	});

	// El alcance también protege la foto: subirla a una cuenta ajena es
	// escribirla.
	test("una cuenta fuera de alcance no recibe foto", async () => {
		const { service, calls } = createHarness({ user: null });

		const result = await service.updatePhoto(DOCUMENT_ID, photoOf(), actorOf());

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("USER_NOT_FOUND");
		expect(calls.uploaded).toEqual([]);
	});
});

describe("createUserService — resetPassword", () => {
	test("hashea antes de persistir y devuelve la cuenta", async () => {
		const { service, calls } = createHarness();

		const result = await service.resetPassword(
			DOCUMENT_ID,
			"contrasenaNueva1",
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.hashed).toEqual(["contrasenaNueva1"]);
		expect(calls.updatePassword[0].hash).toBe("hash-de-contrasenaNueva1");
	});

	test("una cuenta fuera de alcance no se hashea ni se persiste", async () => {
		const { service, calls } = createHarness({ user: null });

		const result = await service.resetPassword(DOCUMENT_ID, "x1", actorOf());

		expect(result.success).toBe(false);
		expect(calls.hashed).toEqual([]);
		expect(calls.updatePassword).toEqual([]);
	});
});

describe("createUserService — changeOwnPassword", () => {
	const dto = {
		currentPassword: "vieja1",
		newPassword: "contrasena1",
		confirmPassword: "contrasena1",
	};

	test("comprueba la anterior antes de escribir la nueva", async () => {
		const { service, calls } = createHarness();

		const result = await service.changeOwnPassword(dto, actorOf("USER", 3));

		expect(result.success).toBe(true);
		expect(calls.updatePassword[0].hash).toBe("hash-de-contrasena1");
	});

	// Es lo que separa el autoservicio del reseteo administrativo: sin la
	// anterior, una sesión ajena abierta en un equipo compartido bastaría para
	// secuestrar la cuenta.
	test("una contraseña actual incorrecta no escribe nada", async () => {
		const { service, calls } = createHarness({ passwordMatches: false });

		const result = await service.changeOwnPassword(dto, actorOf("USER", 3));

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("INVALID_CURRENT_PASSWORD");
		}
		expect(calls.updatePassword).toEqual([]);
	});

	// No revoca: quien la cambia conoce la nueva y echarlo de su propia sesión
	// justo después sería gratuito.
	test("no revoca las sesiones propias", async () => {
		const { service, calls } = createHarness();

		await service.changeOwnPassword(dto, actorOf("USER", 3));

		expect(calls.revoked).toEqual([]);
	});

	// Una cuenta sin contraseña (alta a medias) no puede compararse contra nada.
	test("una cuenta sin contraseña falla en vez de aceptar cualquiera", async () => {
		const { service, calls } = createHarness({
			userWithPassword: { password: null },
		});

		const result = await service.changeOwnPassword(dto, actorOf("USER", 3));

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("USER_NOT_FOUND");
		expect(calls.updatePassword).toEqual([]);
	});
});

describe("createUserService — listDependencyHistory", () => {
	// El alcance se aplica sobre la CUENTA: no se puede leer el historial de
	// alguien que no se alcanza.
	test("reenvía el alcance al repositorio", async () => {
		const scope = { kind: "dependency", dependencyId: 3 } as const;
		const { service, calls } = createHarness();

		const result = await service.listDependencyHistory(DOCUMENT_ID, scope);

		expect(result.success).toBe(true);
		expect(calls.history).toEqual([{ documentId: DOCUMENT_ID, scope }]);
	});
});

describe("createUserService — avisos (§6.12)", () => {
	const validDto = {
		email: "nueva@instituto.gob.mx",
		password: "contrasena1",
		employeeNumber: "EMP-0100",
		type: "INTERNAL" as const,
		dependency: DEPENDENCY_ID,
	};

	test("el alta encola la bienvenida en la transacción y sin la contraseña", async () => {
		const { service, calls } = createHarness();

		await service.create(validDto, actorOf());

		expect(calls.notified).toHaveLength(1);
		expect(calls.notified[0]).toMatchObject({
			inTransaction: true,
			events: [{ template: "ACCOUNT_CREATED" }],
		});
		expect(JSON.stringify(calls.notified)).not.toContain("contrasena1");
		expect(JSON.stringify(calls.notified)).not.toContain("hash-de-");
	});

	test("restablecer la contraseña avisa sin incluirla", async () => {
		const { service, calls } = createHarness();

		await service.resetPassword(DOCUMENT_ID, "OtraClave123!", actorOf());

		expect(calls.notified[0]).toMatchObject({
			inTransaction: true,
			events: [
				{ template: "PASSWORD_RESET", to: { email: "ana@instituto.gob.mx" } },
			],
		});
		expect(JSON.stringify(calls.notified)).not.toContain("OtraClave123!");
	});

	test("un traslado hecho por un administrador avisa con origen y destino", async () => {
		const { service, calls } = createHarness();

		await service.changeDependency(DOCUMENT_ID, DEPENDENCY_ID, actorOf());

		expect(calls.notified[0]?.events).toMatchObject([
			{
				template: "DEPENDENCY_CHANGED",
				fromDependency: "Obras Públicas",
				toDependency: "Desarrollo Social",
			},
		]);
	});

	test("cambiarse uno mismo no avisa", async () => {
		const { service, calls } = createHarness({
			user: userOf({ id: 99, role: "USER", dependencyId: 3 }),
		});

		await service.changeDependency(
			DOCUMENT_ID,
			DEPENDENCY_ID,
			actorOf("USER", 3),
		);

		expect(calls.changeDependency).toHaveLength(1);
		expect(calls.notified).toEqual([]);
	});

	test("si el alta falla no se encola nada", async () => {
		const { service, calls } = createHarness({ dependency: null });

		await service.create(validDto, actorOf());

		expect(calls.notified).toEqual([]);
	});
});
