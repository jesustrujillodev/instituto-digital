import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { CREDIT_ERROR_CODES } from "../../domain/credit.errors";
import type { StaffQuery } from "../../domain/credit.types";
import { createCreditService } from "../credits.service.server";

const NOW = new Date("2026-09-16T18:00:00.000Z");
const SOP = {
	id: 3,
	documentId: "33333333-3333-4333-8333-333333333333",
	name: "Obras Públicas",
};
const SDS = {
	id: 4,
	documentId: "44444444-4444-4444-8444-444444444444",
	name: "Desarrollo Social",
};

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const actorOf = (overrides: Partial<AuthContext> = {}): AuthContext => ({
	userId: 2,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "laura.sop@instituto.gob.mx",
	role: "DEPENDENCY_HEAD",
	dependencyId: SOP.id,
	isTrainer: false,
	...overrides,
});

const createHarness = () => {
	const calls = {
		staff: [] as StaffQuery[],
		summaries: [] as number[],
		mine: [] as number[],
	};
	const dependencies = [SOP, SDS];

	const creditRepository = {
		findMine: async (userId: number) => {
			calls.mine.push(userId);
			return [];
		},
		findStaff: async (query: StaffQuery) => {
			calls.staff.push(query);
			return [];
		},
		countStaff: async () => 0,
		summarizeByDependency: async (fiscalYear: number) => {
			calls.summaries.push(fiscalYear);
			return [];
		},
		findDependency: async (documentId: string) =>
			dependencies.find((row) => row.documentId === documentId) ?? null,
		findDependencyById: async (id: number) =>
			dependencies.find((row) => row.id === id) ?? null,
	} as unknown as ICradle["creditRepository"];

	const service = createCreditService({
		creditRepository,
		clock: { now: () => NOW },
		logger: silentLogger,
	});

	return { service, calls };
};

describe("creditService.listMine", () => {
	test("lee solo los de quien consulta y usa el ejercicio actual por defecto", async () => {
		const { service, calls } = createHarness();

		const result = await service.listMine({}, actorOf({ userId: 50 }));

		expect(result).toMatchObject({ success: true, data: { fiscalYear: 2026 } });
		expect(calls.mine).toEqual([50]);
	});
});

describe("creditService.listOverview", () => {
	test("el titular ve el personal de su dependencia aunque pida otra", async () => {
		const { service, calls } = createHarness();

		const result = await service.listOverview(
			{ dependency: SDS.documentId, fiscalYear: 2025 },
			actorOf(),
		);

		expect(result).toMatchObject({
			success: true,
			data: {
				view: "staff",
				dependency: { name: "Obras Públicas" },
				canChangeDependency: false,
			},
			pagination: { page: 1, pageSize: 20, total: 0 },
		});
		expect(calls.staff[0]).toMatchObject({
			dependencyId: SOP.id,
			fiscalYear: 2025,
		});
	});

	test("el superadministrador ve el resumen por dependencia", async () => {
		const { service, calls } = createHarness();

		const result = await service.listOverview(
			{},
			actorOf({ role: "SUPERADMIN", dependencyId: null }),
		);

		expect(result).toMatchObject({
			success: true,
			data: { view: "dependencies" },
		});
		expect(calls.summaries).toEqual([2026]);
		expect(calls.staff).toEqual([]);
	});

	test("el superadministrador puede abrir el personal de una dependencia", async () => {
		const { service, calls } = createHarness();

		const result = await service.listOverview(
			{ dependency: SDS.documentId },
			actorOf({ role: "SUPERADMIN", dependencyId: null }),
		);

		expect(result).toMatchObject({
			success: true,
			data: { view: "staff", canChangeDependency: true },
		});
		expect(calls.staff[0].dependencyId).toBe(SDS.id);
	});

	test("una dependencia inexistente responde su código", async () => {
		const { service } = createHarness();

		const result = await service.listOverview(
			{ dependency: "55555555-5555-4555-8555-555555555555" },
			actorOf({ role: "SUPERADMIN", dependencyId: null }),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CREDIT_ERROR_CODES.DEPENDENCY_NOT_FOUND },
		});
	});

	test("un participante no consulta créditos ajenos", async () => {
		const { service, calls } = createHarness();

		const result = await service.listOverview({}, actorOf({ role: "USER" }));

		expect(result).toMatchObject({
			success: false,
			error: { code: CREDIT_ERROR_CODES.FORBIDDEN_SCOPE },
		});
		expect(calls.staff).toEqual([]);
		expect(calls.summaries).toEqual([]);
	});
});
