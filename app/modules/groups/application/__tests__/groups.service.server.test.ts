import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AccessScope } from "@/shared/auth/scope.rules";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type { Role } from "@/shared/rules/atoms.rules";
import { GROUP_ERROR_CODES } from "../../domain/group.errors";
import type { Group, GroupMemberAccount } from "../../domain/group.types";
import { createGroupService } from "../groups.service.server";

const GROUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_B = "22222222-2222-4222-8222-222222222222";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const groupOf = (overrides: Partial<Group> = {}): Group => ({
	id: 5,
	documentId: GROUP_ID,
	dependencyId: 3,
	dependencyName: "Obras Públicas",
	name: "Mandos medios",
	description: null,
	memberCount: 0,
	archivedAt: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
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

const DEPENDENCY_SCOPE: AccessScope = { kind: "dependency", dependencyId: 3 };

const createHarness = (
	options: {
		group?: Group | null;
		eligible?: GroupMemberAccount[];
		dependencyArchived?: boolean;
		dependencyMissing?: boolean;
	} = {},
) => {
	const calls = {
		findByIdScopes: [] as unknown[],
		listScopes: [] as unknown[],
		created: [] as unknown[],
		updated: [] as unknown[],
		archived: [] as unknown[],
		unarchived: [] as unknown[],
		addedMembers: [] as unknown[],
		removedMembers: [] as unknown[],
		candidateQueries: [] as unknown[],
		eligibilityQueries: [] as unknown[],
	};

	const groupRepository = {
		findAll: async (_filters: unknown, scope: unknown) => {
			calls.listScopes.push(scope);
			return [];
		},
		count: async (_filters: unknown, scope: unknown) => {
			calls.listScopes.push(scope);
			return 0;
		},
		findById: async (_documentId: string, scope: unknown) => {
			calls.findByIdScopes.push(scope);
			return options.group === undefined ? groupOf() : options.group;
		},
		create: async (data: unknown) => {
			calls.created.push(data);
			return groupOf();
		},
		update: async (documentId: string, dto: unknown, scope: unknown) => {
			calls.updated.push({ documentId, dto, scope });
			return groupOf();
		},
		archive: async (documentId: string, scope: unknown) => {
			calls.archived.push({ documentId, scope });
			return groupOf({ archivedAt: new Date() });
		},
		unarchive: async (documentId: string, scope: unknown) => {
			calls.unarchived.push({ documentId, scope });
			return groupOf();
		},
		listMembers: async () => [],
		listCandidates: async (params: unknown) => {
			calls.candidateQueries.push(params);
			return [];
		},
		findEligibleAccounts: async (params: unknown) => {
			calls.eligibilityQueries.push(params);
			return options.eligible ?? [];
		},
		addMembers: async (params: unknown) => {
			calls.addedMembers.push(params);
		},
		removeMember: async (params: unknown) => {
			calls.removedMembers.push(params);
		},
	} as unknown as ICradle["groupRepository"];

	const dependencyRepository = {
		findByInternalId: async () =>
			options.dependencyMissing
				? null
				: {
						id: 3,
						documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
						name: "Obras Públicas",
						acronym: "SOP",
						archivedAt: options.dependencyArchived ? new Date() : null,
						createdAt: new Date(0),
						updatedAt: new Date(0),
					},
	} as unknown as ICradle["dependencyRepository"];

	const service = createGroupService({
		groupRepository,
		dependencyRepository,
		logger: silentLogger,
	});

	return { service, calls };
};

describe("createGroupService — lectura", () => {
	// El alcance viaja al repositorio y `findAll`/`count` comparten el mismo: si
	// solo se filtrara el listado, el total delataría grupos ajenos.
	test("list reenvía el alcance a las dos consultas", async () => {
		const { service, calls } = createHarness();

		await service.list({}, DEPENDENCY_SCOPE);

		expect(calls.listScopes).toEqual([DEPENDENCY_SCOPE, DEPENDENCY_SCOPE]);
	});

	test("un grupo fuera de alcance responde igual que inexistente", async () => {
		const { service } = createHarness({ group: null });

		const result = await service.findById(GROUP_ID, DEPENDENCY_SCOPE);

		expect(!result.success && result.error.code).toBe(
			GROUP_ERROR_CODES.NOT_FOUND,
		);
	});

	// El superadministrador consulta los grupos de todas las dependencias: la
	// matriz de §3 no le da su administración, pero en PRD-03 tendrá que elegir
	// audiencias.
	test("un alcance global puede leer", async () => {
		const { service } = createHarness();

		const result = await service.findById(GROUP_ID, { kind: "global" });

		expect(result.success).toBe(true);
	});
});

describe("createGroupService — escritura y alcance", () => {
	test("un alcance global no crea grupos", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			{ name: "Mandos medios" },
			actorOf("SUPERADMIN", null),
		);

		expect(!result.success && result.error.code).toBe(
			GROUP_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(calls.created).toEqual([]);
	});

	test("un alcance global tampoco archiva ni edita", async () => {
		const { service, calls } = createHarness();
		const superadmin = actorOf("SUPERADMIN", null);

		const archived = await service.archive(GROUP_ID, superadmin);
		const updated = await service.update(
			GROUP_ID,
			{ name: "Otro" },
			superadmin,
		);

		expect(!archived.success && archived.error.code).toBe(
			GROUP_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(!updated.success && updated.error.code).toBe(
			GROUP_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(calls.archived).toEqual([]);
		expect(calls.updated).toEqual([]);
	});

	// La dependencia no viaja en el formulario: la pone el alcance de quien crea.
	test("la dependencia del grupo sale del alcance, no del dto", async () => {
		const { service, calls } = createHarness();

		await service.create({ name: "Mandos medios" }, actorOf());

		expect(calls.created).toEqual([{ name: "Mandos medios", dependencyId: 3 }]);
	});

	test("una dependencia archivada no admite grupos nuevos", async () => {
		const { service, calls } = createHarness({ dependencyArchived: true });

		const result = await service.create({ name: "Mandos medios" }, actorOf());

		expect(!result.success && result.error.code).toBe(
			GROUP_ERROR_CODES.DEPENDENCY_INACTIVE,
		);
		expect(calls.created).toEqual([]);
	});

	test("un titular sin dependencia no alcanza nada", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			{ name: "Mandos medios" },
			actorOf("DEPENDENCY_HEAD", null),
		);

		expect(!result.success && result.error.code).toBe(
			GROUP_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(calls.created).toEqual([]);
	});
});

describe("createGroupService — miembros", () => {
	// Es la regla central del módulo: la dependencia que decide es la DEL GRUPO,
	// nunca la de quien busca.
	test("los candidatos se piden por la dependencia del grupo", async () => {
		const { service, calls } = createHarness({
			group: groupOf({ dependencyId: 12 }),
		});

		await service.listCandidates(GROUP_ID, "ana", { kind: "global" });

		expect(calls.candidateQueries).toEqual([
			{ groupId: 5, dependencyId: 12, search: "ana" },
		]);
	});

	test("la elegibilidad también se comprueba contra la dependencia del grupo", async () => {
		const { service, calls } = createHarness({
			group: groupOf({ dependencyId: 12 }),
			eligible: [{ id: 41, documentId: MEMBER_A }],
		});

		await service.addMembers(GROUP_ID, [MEMBER_A], actorOf());

		expect(calls.eligibilityQueries).toEqual([
			{ dependencyId: 12, userDocumentIds: [MEMBER_A] },
		]);
	});

	test("agrega el lote con el autor del alta", async () => {
		const { service, calls } = createHarness({
			eligible: [
				{ id: 41, documentId: MEMBER_A },
				{ id: 42, documentId: MEMBER_B },
			],
		});

		const result = await service.addMembers(
			GROUP_ID,
			[MEMBER_A, MEMBER_B],
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.addedMembers).toEqual([
			{ groupId: 5, userIds: [41, 42], addedById: 99 },
		]);
	});

	// Dejar dentro a las válidas y callar el resto convertiría un error en una
	// lista silenciosamente incompleta.
	test("si alguna cuenta no cumple, se rechaza el lote entero", async () => {
		const { service, calls } = createHarness({
			eligible: [{ id: 41, documentId: MEMBER_A }],
		});

		const result = await service.addMembers(
			GROUP_ID,
			[MEMBER_A, MEMBER_B],
			actorOf(),
		);

		expect(!result.success && result.error.code).toBe(
			GROUP_ERROR_CODES.MEMBER_OUT_OF_DEPENDENCY,
		);
		expect(calls.addedMembers).toEqual([]);
	});

	test("el superadministrador no agrega ni da de baja miembros", async () => {
		const { service, calls } = createHarness({
			eligible: [{ id: 41, documentId: MEMBER_A }],
		});
		const superadmin = actorOf("SUPERADMIN", null);

		const added = await service.addMembers(GROUP_ID, [MEMBER_A], superadmin);
		const removed = await service.removeMember(GROUP_ID, MEMBER_A, superadmin);

		expect(!added.success && added.error.code).toBe(
			GROUP_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(!removed.success && removed.error.code).toBe(
			GROUP_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(calls.addedMembers).toEqual([]);
		expect(calls.removedMembers).toEqual([]);
	});

	test("la baja de un miembro es puntual y por identificador público", async () => {
		const { service, calls } = createHarness();

		const result = await service.removeMember(GROUP_ID, MEMBER_A, actorOf());

		expect(result.success).toBe(true);
		expect(calls.removedMembers).toEqual([
			{ groupId: 5, userDocumentId: MEMBER_A },
		]);
	});

	test("no se pueden tocar los miembros de un grupo fuera de alcance", async () => {
		const { service, calls } = createHarness({ group: null });

		const result = await service.addMembers(GROUP_ID, [MEMBER_A], actorOf());

		expect(!result.success && result.error.code).toBe(
			GROUP_ERROR_CODES.NOT_FOUND,
		);
		expect(calls.addedMembers).toEqual([]);
	});
});
