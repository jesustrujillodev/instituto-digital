import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import {
	DependencyAlreadyHasHeadError,
	DuplicateDependencyNameError,
} from "../../domain/dependency.errors";
import type {
	Dependency,
	DependencyMember,
	HeadCandidate,
} from "../../domain/dependency.types";
import { createDependencyService } from "../dependencies.service.server";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_ID = "22222222-2222-4222-8222-222222222222";
const HEAD_ID = "33333333-3333-4333-8333-333333333333";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const dependencyOf = (overrides: Partial<Dependency> = {}): Dependency => ({
	id: 5,
	documentId: DOCUMENT_ID,
	name: "Obras Públicas",
	acronym: "SOP",
	archivedAt: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	...overrides,
});

const memberOf = (overrides: Partial<DependencyMember> = {}) => ({
	id: 9,
	documentId: CANDIDATE_ID,
	archivedAt: null,
	...overrides,
});

const candidateOf = (
	overrides: Partial<HeadCandidate> = {},
): HeadCandidate => ({
	documentId: CANDIDATE_ID,
	firstName: "Ana",
	lastName: "Ruiz",
	email: "ana@instituto.gob.mx",
	isHead: false,
	...overrides,
});

/**
 * Dobles mínimos: solo lo que toca la operación bajo prueba. El resto se deja
 * fuera a propósito — un doble completo esconde qué depende de qué (mismo
 * criterio que users.service.server.test.ts).
 */
const createHarness = (
	options: {
		dependency?: Dependency | null;
		dependencies?: Dependency[];
		active?: Dependency[];
		candidates?: HeadCandidate[];
		total?: number;
		member?: DependencyMember | null;
		head?: DependencyMember | null;
		revokeFails?: boolean;
		assignThrows?: Error;
		createThrows?: Error;
	} = {},
) => {
	const calls = {
		findAll: [] as unknown[],
		count: 0,
		created: [] as unknown[],
		updated: [] as unknown[],
		archived: [] as string[],
		unarchived: [] as string[],
		assignHead: [] as unknown[],
		revoked: [] as number[],
		candidates: [] as number[],
	};

	const dependencyRepository = {
		findAll: async (filters: unknown) => {
			calls.findAll.push(filters);
			return options.dependencies ?? [];
		},
		count: async () => {
			calls.count += 1;
			return options.total ?? 0;
		},
		findById: async () =>
			options.dependency === undefined ? dependencyOf() : options.dependency,
		findActive: async () => options.active ?? [],
		findHeadCandidates: async (dependencyId: number) => {
			calls.candidates.push(dependencyId);
			return options.candidates ?? [];
		},
		create: async (dto: unknown) => {
			if (options.createThrows) throw options.createThrows;
			calls.created.push(dto);
			return dependencyOf();
		},
		update: async (documentId: string, dto: unknown) => {
			calls.updated.push({ documentId, dto });
			return dependencyOf();
		},
		archive: async (documentId: string) => {
			calls.archived.push(documentId);
			return dependencyOf({ archivedAt: new Date() });
		},
		unarchive: async (documentId: string) => {
			calls.unarchived.push(documentId);
			return dependencyOf();
		},
		findMember: async () =>
			options.member === undefined ? memberOf() : options.member,
		findHead: async () => options.head ?? null,
		assignHead: async (params: unknown) => {
			if (options.assignThrows) throw options.assignThrows;
			calls.assignHead.push(params);
		},
	} as unknown as ICradle["dependencyRepository"];

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

	const service = createDependencyService({
		dependencyRepository,
		sessionMonitorService,
		logger: silentLogger,
	});

	return { service, calls };
};

describe("createDependencyService — list", () => {
	test("devuelve la página con su paginación derivada del total", async () => {
		const { service } = createHarness({
			dependencies: [dependencyOf()],
			total: 42,
		});

		const result = await service.list({ page: 2, pageSize: 10 });

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

	// Los defaults del módulo, no literales del servicio: si el repositorio
	// paginara con otros, la meta describiría una página que no se consultó.
	test("la paginación usa los defaults del módulo cuando no se piden", async () => {
		const { service } = createHarness({ total: 3 });

		const result = await service.list({});

		expect(result.success && result.pagination).toEqual({
			page: 1,
			pageSize: 10,
			total: 3,
			totalPages: 1,
		});
	});

	test("reenvía los filtros al repositorio tal cual", async () => {
		const { service, calls } = createHarness();

		await service.list({ search: "obras", status: "archived" });

		expect(calls.findAll).toEqual([{ search: "obras", status: "archived" }]);
	});
});

describe("createDependencyService — listActive", () => {
	// Es un catálogo para un selector, no una página: una meta de paginación
	// inventada mentiría sobre lo que se consultó.
	test("no lleva paginación", async () => {
		const { service } = createHarness({ active: [dependencyOf()] });

		const result = await service.listActive();

		expect(result.success).toBe(true);
		expect(result.success && result.pagination).toBeUndefined();
		expect(result.success && result.data).toHaveLength(1);
	});
});

describe("createDependencyService — findById", () => {
	test("devuelve la dependencia dentro del envelope", async () => {
		const { service } = createHarness();

		const result = await service.findById(DOCUMENT_ID);

		expect(result.success && result.data.documentId).toBe(DOCUMENT_ID);
	});

	// Falla con el código, no devuelve un dato nulo: quien llama no tiene que
	// distinguir entre "no existe" y "existe pero vacía".
	test("falla con DEPENDENCY_NOT_FOUND si no existe", async () => {
		const { service } = createHarness({ dependency: null });

		const result = await service.findById(DOCUMENT_ID);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("DEPENDENCY_NOT_FOUND");
		}
	});
});

describe("createDependencyService — listHeadCandidates", () => {
	test("devuelve el personal activo de la dependencia", async () => {
		const { service, calls } = createHarness({
			candidates: [
				candidateOf(),
				candidateOf({ documentId: HEAD_ID, isHead: true }),
			],
		});

		const result = await service.listHeadCandidates(DOCUMENT_ID);

		expect(result.success && result.data).toHaveLength(2);
		// Se consulta por el id interno resuelto, no por el documentId de la URL.
		expect(calls.candidates).toEqual([5]);
	});

	// Sin esto, un documentId inventado devolvería [] y la pantalla lo leería como
	// "esta dependencia no tiene personal" en vez de "no existe".
	test("falla si la dependencia no existe, en vez de devolver una lista vacía", async () => {
		const { service, calls } = createHarness({ dependency: null });

		const result = await service.listHeadCandidates(DOCUMENT_ID);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("DEPENDENCY_NOT_FOUND");
		expect(calls.candidates).toEqual([]);
	});
});

describe("createDependencyService — create / update", () => {
	test("create devuelve la dependencia creada", async () => {
		const { service, calls } = createHarness();

		const result = await service.create({ name: "Obras Públicas" });

		expect(result.success).toBe(true);
		expect(calls.created).toEqual([{ name: "Obras Públicas" }]);
	});

	// El nombre es `@unique` en la base: el repositorio traduce el P2002 y el
	// runner lo convierte en la rama `success: false` sin que el servicio lo
	// mencione. Es el contrato del módulo, no una cortesía del caso de uso.
	test("create propaga el nombre duplicado como fallo del envelope", async () => {
		const { service } = createHarness({
			createThrows: new DuplicateDependencyNameError(),
		});

		const result = await service.create({ name: "Obras Públicas" });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("DUPLICATE_DEPENDENCY_NAME");
		}
	});

	test("update reenvía documentId y dto", async () => {
		const { service, calls } = createHarness();

		await service.update(DOCUMENT_ID, { acronym: "SOP" });

		expect(calls.updated).toEqual([
			{ documentId: DOCUMENT_ID, dto: { acronym: "SOP" } },
		]);
	});
});

describe("createDependencyService — archive / unarchive", () => {
	// Desactivar no borra: el efecto lo imponen las reglas de `users`, y el
	// historial se conserva.
	test("archive marca la fecha y devuelve la dependencia", async () => {
		const { service, calls } = createHarness();

		const result = await service.archive(DOCUMENT_ID);

		expect(calls.archived).toEqual([DOCUMENT_ID]);
		expect(result.success && result.data.archivedAt).toBeInstanceOf(Date);
	});

	test("unarchive la devuelve activa", async () => {
		const { service, calls } = createHarness();

		const result = await service.unarchive(DOCUMENT_ID);

		expect(calls.unarchived).toEqual([DOCUMENT_ID]);
		expect(result.success && result.data.archivedAt).toBeNull();
	});
});

describe("createDependencyService — assignHead", () => {
	// LA invariante del orden. Al revés, el índice único parcial dispara a mitad
	// de transacción: habría dos titulares activos en la misma dependencia.
	test("degrada al titular actual antes de promover al candidato", async () => {
		const { service, calls } = createHarness({
			head: memberOf({ id: 4, documentId: HEAD_ID }),
			member: memberOf({ id: 9 }),
		});

		const result = await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(result.success).toBe(true);
		expect(calls.assignHead).toEqual([
			{ dependencyId: 5, candidateUserId: 9, currentHeadUserId: 4 },
		]);
	});

	test("sin titular previo pasa currentHeadUserId en null", async () => {
		const { service, calls } = createHarness({ head: null });

		await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(calls.assignHead).toEqual([
			{ dependencyId: 5, candidateUserId: 9, currentHeadUserId: null },
		]);
	});

	// El cambio de rol no se nota mientras viva el access token que firmó el rol
	// anterior: sin revocar, el relevado seguiría administrando y el promovido no
	// vería su menú nuevo.
	test("revoca los tokens de los DOS afectados, después del commit", async () => {
		const { service, calls } = createHarness({
			head: memberOf({ id: 4, documentId: HEAD_ID }),
			member: memberOf({ id: 9 }),
		});

		await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(calls.revoked).toEqual([4, 9]);
	});

	test("sin titular previo solo revoca al promovido", async () => {
		const { service, calls } = createHarness({ head: null });

		await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(calls.revoked).toEqual([9]);
	});

	// Best-effort: la designación YA está confirmada y deshacerla sería peor que
	// una ventana de sesión. Un fallo se registra, no se propaga.
	test("un fallo al revocar no tumba la designación", async () => {
		const { service, calls } = createHarness({ revokeFails: true });

		const result = await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(result.success).toBe(true);
		expect(calls.assignHead).toHaveLength(1);
	});

	test("falla si la dependencia no existe", async () => {
		const { service, calls } = createHarness({ dependency: null });

		const result = await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("DEPENDENCY_NOT_FOUND");
		expect(calls.assignHead).toEqual([]);
	});

	// Sería darle quien la administre a una unidad que ya no opera.
	test("rechaza una dependencia desactivada", async () => {
		const { service, calls } = createHarness({
			dependency: dependencyOf({ archivedAt: new Date() }),
		});

		const result = await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("DEPENDENCY_INACTIVE");
		expect(calls.assignHead).toEqual([]);
	});

	// null cubre dos casos que para quien pregunta son el mismo: la cuenta no
	// existe, o existe en otra dependencia. Decir cuál confirmaría una cuenta ajena.
	test("rechaza a quien no pertenece a la dependencia", async () => {
		const { service, calls } = createHarness({ member: null });

		const result = await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("HEAD_MUST_BELONG_TO_DEPENDENCY");
		}
		expect(calls.assignHead).toEqual([]);
	});

	// El índice único parcial solo cuenta titulares NO archivados: promover una
	// cuenta archivada no violaría la base y dejaría un titular que no puede entrar.
	test("rechaza a un candidato archivado", async () => {
		const { service, calls } = createHarness({
			member: memberOf({ archivedAt: new Date() }),
		});

		const result = await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("HEAD_MUST_BE_ACTIVE");
		expect(calls.assignHead).toEqual([]);
	});

	// Degradar y volver a promover a la misma persona dejaría el mismo estado a
	// cambio de echarla de la plataforma.
	test("designar a quien ya es titular no escribe ni revoca nada", async () => {
		const { service, calls } = createHarness({
			member: memberOf({ id: 9 }),
			head: memberOf({ id: 9 }),
		});

		const result = await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(result.success).toBe(true);
		expect(calls.assignHead).toEqual([]);
		expect(calls.revoked).toEqual([]);
	});

	// Dos designaciones simultáneas: la aplicación comprueba, pero la garantía es
	// del índice. Su error tiene copia propia y no puede confundirse con el nombre.
	test("propaga el rechazo del índice único parcial", async () => {
		const { service, calls } = createHarness({
			assignThrows: new DependencyAlreadyHasHeadError(),
		});

		const result = await service.assignHead(DOCUMENT_ID, CANDIDATE_ID);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("DEPENDENCY_ALREADY_HAS_HEAD");
		}
		expect(calls.revoked).toEqual([]);
	});
});
