import { describe, expect, test } from "vitest";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const NOW = new Date("2026-10-07T17:00:00.000Z");

const authPayloadOf = (overrides: Record<string, unknown> = {}) => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 50,
	email: "laura.sop@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
	...overrides,
});

const okOf = (data: unknown) => ({
	success: true,
	data,
	timestamp: NOW.toISOString(),
});

const WEEK = {
	today: "2026-10-07",
	days: ["2026-10-07"],
	sessions: [],
	truncated: false,
};

const DIGEST = {
	invitations: [
		{
			courseDocumentId: "urge",
			title: "Urge",
			closesSoon: true,
			closesAt: NOW,
		},
		{
			courseDocumentId: "calma",
			title: "Calma",
			closesSoon: false,
			closesAt: null,
		},
	],
	inProgress: [],
	upcoming: [],
	toRate: [],
	counts: {
		invitations: 2,
		inProgress: 0,
		upcoming: 0,
		toRate: 0,
		finished: 0,
	},
};

/** Cada servicio registra que se le llamó y responde con lo mínimo que el panel lee. */
const createHarness = (
	authPayload: unknown,
	failing: Record<string, unknown> = {},
) => {
	const called: string[] = [];
	const reply =
		(name: string, data: unknown) =>
		async (..._args: unknown[]) => {
			called.push(name);
			return failing[name] ?? okOf(data);
		};

	const context = {
		authPayload,
		clock: { now: () => NOW },
		userService: { findById: reply("user", { firstName: "Laura" }) },
		dependencyService: {
			findByInternalId: reply("dependency", { name: "Obras Públicas" }),
			listWithoutHead: reply("withoutHead", []),
		},
		calendarService: { listWeek: reply("week", WEEK) },
		enrollmentSummaryService: {
			summarizeMine: reply("mine", DIGEST),
			summarizeOpen: reply("open", { courses: [], total: 0 }),
		},
		certificateService: { listMine: reply("certificates", []) },
		creditService: {
			summarizeYear: reply("credits", { fiscalYear: 2026, total: 0, hours: 0 }),
		},
		teachingService: {
			summarizePending: reply("pending", {
				awaitingFinish: [],
				truncated: false,
			}),
		},
		courseAttentionService: {
			summarize: reply("attention", {
				drafts: { courses: [], truncated: false },
				withoutTrainer: { courses: [], truncated: false },
			}),
		},
		annualPlanService: {
			summarizeCurrent: reply("plan", {
				fiscalYear: 2026,
				plan: null,
				dueLines: [],
				dueTotal: 0,
			}),
			summarizeCoverage: reply("coverage", {
				fiscalYear: 2026,
				plans: [],
				withoutPlan: [],
			}),
		},
		sessionMonitorService: { countActive: reply("sessions", 4) },
		operationsService: {
			summarizeHealth: reply("health", {
				failedEmails: 0,
				stuckEmails: 0,
				recentJobFailures: 0,
				windowDays: 7,
			}),
		},
	} as unknown as LoaderArgs["context"];

	return { context, called };
};

const run = (context: LoaderArgs["context"]) =>
	loader({
		request: new Request("https://app.example.com/dashboard"),
		context,
		params: {},
	} as unknown as LoaderArgs);

describe("dashboard loader", () => {
	test("el participante lee lo suyo y nada de organizar ni de la plataforma", async () => {
		const { context, called } = createHarness(authPayloadOf());

		const result = await run(context);

		expect(new Set(called)).toEqual(
			new Set([
				"user",
				"dependency",
				"week",
				"mine",
				"certificates",
				"credits",
			]),
		);
		expect(result.data).toMatchObject({
			header: { firstName: "Laura", dependencyName: "Obras Públicas" },
			platform: null,
			organizing: null,
			learning: { invitations: [{ courseDocumentId: "calma" }] },
			today: { items: [{ kind: "invitation", courseDocumentId: "urge" }] },
		});
	});

	test("el titular capacitador suma lo que organiza, su plan y lo que falta finalizar", async () => {
		const { context, called } = createHarness(
			authPayloadOf({ role: "DEPENDENCY_HEAD", isTrainer: true }),
		);

		const result = await run(context);

		expect(called).toEqual(
			expect.arrayContaining(["pending", "attention", "open", "plan", "mine"]),
		);
		expect(called).not.toContain("coverage");
		expect(result.data.organizing).toMatchObject({ plan: { plan: null } });
	});

	test("el capacitador externo ve su semana y lo que imparte, sin cursar", async () => {
		const { context, called } = createHarness(
			authPayloadOf({ dependencyId: null, isTrainer: true }),
		);

		const result = await run(context);

		expect(new Set(called)).toEqual(new Set(["user", "week", "pending"]));
		expect(result.data.learning).toBeNull();
		expect(result.data.today).not.toBeNull();
	});

	test("el superadministrador lee la plataforma y no tiene «Para hoy»", async () => {
		const { context, called } = createHarness(
			authPayloadOf({ role: "SUPERADMIN", dependencyId: null }),
		);

		const result = await run(context);

		expect(new Set(called)).toEqual(
			new Set([
				"user",
				"week",
				"withoutHead",
				"sessions",
				"coverage",
				"health",
			]),
		);
		expect(result.data.today).toBeNull();
		expect(result.data.platform).toMatchObject({ activeSessions: 4 });
	});

	test("un fallo de una faceta corta con el status de su diccionario", async () => {
		const { context } = createHarness(authPayloadOf(), {
			mine: {
				success: false,
				error: { code: "ENROLLMENT_NOT_ELIGIBLE", message: "técnico" },
				timestamp: NOW.toISOString(),
			},
		});

		const thrown = await run(context).catch((error) => error);

		expect(thrown.data.code).toBe("ENROLLMENT_NOT_ELIGIBLE");
	});

	test("sin sesión redirige al inicio de sesión sin leer nada", async () => {
		const { context, called } = createHarness(null);

		const thrown = await run(context).catch((error) => error);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
		expect(called).toEqual([]);
	});
});
