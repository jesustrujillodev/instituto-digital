import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import {
	ANNUAL_PLAN_ERROR_CODES,
	AnnualPlanAlreadyExistsError,
} from "../../domain/annual-plan.errors";
import type {
	PlanLineDto,
	PlanWriteData,
	StoredLineWithPlan,
	StoredPlan,
} from "../../domain/annual-plan.types";
import { createAnnualPlanService } from "../annual-plan.service.server";

const NOW = zonedInputToUtc("2026-09-16", "10:00");
const PLAN_DOC = "11111111-1111-4111-8111-111111111111";
const LINE_DOC = "22222222-2222-4222-8222-222222222222";

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
	email: "carlos.sop@instituto.gob.mx",
	role: "DEPENDENCY_DEPUTY",
	dependencyId: 3,
	isTrainer: false,
	...overrides,
});

const SUPERADMIN = actorOf({ role: "SUPERADMIN", dependencyId: null });

const DTO: PlanLineDto = {
	title: "Excel básico",
	plannedMonth: 10,
	plannedModality: "ONLINE",
	estimatedDuration: null,
	targetAudience: null,
	notes: null,
};

const planOf = (fiscalYear = 2026): StoredPlan => ({
	id: 7,
	documentId: PLAN_DOC,
	dependencyId: 3,
	dependencyName: "Obras Públicas",
	fiscalYear,
	lines: [],
});

const lineOf = (
	overrides: Partial<StoredLineWithPlan> = {},
): StoredLineWithPlan => ({
	id: 21,
	documentId: LINE_DOC,
	title: "Seguridad en obra",
	plannedMonth: 9,
	plannedModality: "HYBRID",
	estimatedDuration: null,
	targetAudience: null,
	notes: null,
	cancelledAt: null,
	courses: [],
	plan: {
		id: 7,
		documentId: PLAN_DOC,
		dependencyId: 3,
		dependencyName: "Obras Públicas",
		fiscalYear: 2026,
	},
	...overrides,
});

const createHarness = (
	options: {
		plans?: StoredPlan[];
		line?: StoredLineWithPlan | null;
		createFails?: Error;
	} = {},
) => {
	const calls = {
		wheres: [] as unknown[],
		createdPlans: [] as PlanWriteData[],
		createdLines: [] as unknown[][],
		updatedLines: [] as unknown[][],
		cancellations: [] as unknown[][],
		deleted: [] as number[],
	};
	const plans = options.plans ?? [planOf()];

	const annualPlanRepository = {
		findPlans: async (where: unknown) => {
			calls.wheres.push(where);
			return plans;
		},
		findPlan: async (documentId: string, where: object) => {
			calls.wheres.push(where);
			return "id" in where
				? null
				: (plans.find((plan) => plan.documentId === documentId) ?? null);
		},
		createPlan: async (data: PlanWriteData) => {
			if (options.createFails) throw options.createFails;
			calls.createdPlans.push(data);
			return { documentId: "new-plan" };
		},
		findLine: async (_documentId: string, where: unknown) => {
			calls.wheres.push(where);
			return options.line === undefined ? lineOf() : options.line;
		},
		createLine: async (...args: unknown[]) => {
			calls.createdLines.push(args);
		},
		updateLine: async (...args: unknown[]) => {
			calls.updatedLines.push(args);
		},
		setLineCancelled: async (...args: unknown[]) => {
			calls.cancellations.push(args);
		},
		deleteLine: async (lineId: number) => {
			calls.deleted.push(lineId);
		},
	} as unknown as ICradle["annualPlanRepository"];

	const service = createAnnualPlanService({
		annualPlanRepository,
		clock: { now: () => NOW },
		logger: silentLogger,
	});

	return { service, calls };
};

const expectCode = (result: { success: boolean }, code: string) =>
	expect(result).toMatchObject({ success: false, error: { code } });

describe("annualPlanService.listPlans", () => {
	test("el titular ve sus planes y los ejercicios que puede crear", async () => {
		const { service, calls } = createHarness();

		const result = await service.listPlans({}, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: { canManage: true, creatableYears: [2027] },
		});
		expect(calls.wheres).toEqual([{ dependencyId: 3 }]);
	});

	test("el superadministrador consulta todo y no crea", async () => {
		const { service, calls } = createHarness();

		const result = await service.listPlans({}, SUPERADMIN);

		expect(result).toMatchObject({
			success: true,
			data: { canManage: false, creatableYears: [] },
		});
		expect(calls.wheres).toEqual([{}]);
	});
});

describe("annualPlanService.createPlan", () => {
	test("crea el plan en la dependencia del alcance", async () => {
		const { service, calls } = createHarness();

		const result = await service.createPlan({ fiscalYear: 2027 }, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: { documentId: "new-plan" },
		});
		expect(calls.createdPlans).toEqual([
			{ dependencyId: 3, fiscalYear: 2027, createdById: 2 },
		]);
	});

	test("rechaza un ejercicio pasado, un duplicado y al superadministrador", async () => {
		expectCode(
			await createHarness().service.createPlan({ fiscalYear: 2025 }, actorOf()),
			ANNUAL_PLAN_ERROR_CODES.INVALID_YEAR,
		);
		expectCode(
			await createHarness({
				createFails: new AnnualPlanAlreadyExistsError(2026),
			}).service.createPlan({ fiscalYear: 2026 }, actorOf()),
			ANNUAL_PLAN_ERROR_CODES.ALREADY_EXISTS,
		);
		expectCode(
			await createHarness().service.createPlan(
				{ fiscalYear: 2026 },
				SUPERADMIN,
			),
			ANNUAL_PLAN_ERROR_CODES.FORBIDDEN_SCOPE,
		);
	});
});

describe("annualPlanService — líneas", () => {
	test("agrega una línea a un plan vigente", async () => {
		const { service, calls } = createHarness();

		const result = await service.addLine(PLAN_DOC, DTO, actorOf());

		expect(result.success).toBe(true);
		expect(calls.createdLines).toEqual([[7, DTO, 2]]);
	});

	test("un plan de un ejercicio anterior no admite cambios", async () => {
		const { service, calls } = createHarness({ plans: [planOf(2025)] });

		expectCode(
			await service.addLine(PLAN_DOC, DTO, actorOf()),
			ANNUAL_PLAN_ERROR_CODES.READ_ONLY,
		);
		expect(calls.createdLines).toEqual([]);
	});

	test("editar, cancelar, reactivar y borrar en éxito", async () => {
		const { service, calls } = createHarness();

		expect((await service.updateLine(LINE_DOC, DTO, actorOf())).success).toBe(
			true,
		);
		expect((await service.cancelLine(LINE_DOC, actorOf())).success).toBe(true);
		expect((await service.deleteLine(LINE_DOC, actorOf())).success).toBe(true);

		const cancelled = createHarness({ line: lineOf({ cancelledAt: NOW }) });
		expect(
			(await cancelled.service.reactivateLine(LINE_DOC, actorOf())).success,
		).toBe(true);

		expect(calls.updatedLines).toEqual([[21, DTO]]);
		expect(calls.cancellations).toEqual([[21, { at: NOW, actorId: 2 }]]);
		expect(calls.deleted).toEqual([21]);
		expect(cancelled.calls.cancellations).toEqual([[21, null]]);
	});

	test("no se cancela con curso activo ni se borra con historial", async () => {
		const withCourse = createHarness({
			line: lineOf({
				courses: [
					{
						documentId: "c",
						title: "Curso",
						status: "PUBLISHED",
						format: "SCHEDULED",
					},
				],
			}),
		});
		const withHistory = createHarness({
			line: lineOf({
				courses: [
					{
						documentId: "c",
						title: "Curso",
						status: "CANCELLED",
						format: "SCHEDULED",
					},
				],
			}),
		});

		expectCode(
			await withCourse.service.cancelLine(LINE_DOC, actorOf()),
			ANNUAL_PLAN_ERROR_CODES.LINE_HAS_ACTIVE_COURSE,
		);
		expectCode(
			await withHistory.service.deleteLine(LINE_DOC, actorOf()),
			ANNUAL_PLAN_ERROR_CODES.LINE_HAS_COURSES,
		);
		expect(withCourse.calls.cancellations).toEqual([]);
		expect(withHistory.calls.deleted).toEqual([]);
	});

	test("una línea fuera del alcance responde LINE_NOT_FOUND", async () => {
		const { service } = createHarness({ line: null });

		expectCode(
			await service.updateLine(LINE_DOC, DTO, actorOf()),
			ANNUAL_PLAN_ERROR_CODES.LINE_NOT_FOUND,
		);
	});

	test("el superadministrador no escribe líneas", async () => {
		const { service, calls } = createHarness();

		expectCode(
			await service.cancelLine(LINE_DOC, SUPERADMIN),
			ANNUAL_PLAN_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(calls.wheres).toEqual([]);
	});
});

describe("annualPlanService.findLineForCourse", () => {
	test("devuelve el prellenado de una línea disponible", async () => {
		const { service } = createHarness();

		const result = await service.findLineForCourse(LINE_DOC, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: {
				lineDocumentId: LINE_DOC,
				title: "Seguridad en obra",
				plannedModality: "HYBRID",
				fiscalYear: 2026,
			},
		});
	});

	test("una línea cancelada o con curso activo no se ofrece", async () => {
		expectCode(
			await createHarness({
				line: lineOf({ cancelledAt: NOW }),
			}).service.findLineForCourse(LINE_DOC, actorOf()),
			ANNUAL_PLAN_ERROR_CODES.LINE_CANCELLED,
		);
		expectCode(
			await createHarness({
				line: lineOf({
					courses: [
						{
							documentId: "c",
							title: "Curso",
							status: "DRAFT",
							format: "SCHEDULED",
						},
					],
				}),
			}).service.findLineForCourse(LINE_DOC, actorOf()),
			ANNUAL_PLAN_ERROR_CODES.LINE_HAS_ACTIVE_COURSE,
		);
	});
});
