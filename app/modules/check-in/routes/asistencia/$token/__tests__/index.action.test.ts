import { describe, expect, test } from "vitest";
import { CHECK_IN_ERROR_CODES } from "../../../../domain/check-in.errors";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const authPayload = {
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 7,
	email: "ana@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const resultOf = (status: "RECORDED" | "ALREADY_RECORDED") => ({
	status,
	course: { documentId: "c", title: "Curso", dependencyName: "Obras" },
	session: {
		documentId: "s",
		ordinal: 1,
		total: 1,
		startsAt: new Date(0),
		endsAt: new Date(0),
		venue: null,
	},
	recordedAt: new Date(0),
});

const createContext = (
	register: () => Promise<unknown>,
	allowed = true,
): ActionArgs["context"] =>
	({
		authPayload,
		rateLimiter: {
			consume: () => ({ allowed, retryAfterMs: allowed ? 0 : 30_000 }),
		},
		checkInService: { register },
	}) as unknown as ActionArgs["context"];

const run = (context: ActionArgs["context"], token = TOKEN) =>
	action({
		request: new Request(`https://app.example.com/asistencia/${token}`, {
			method: "POST",
		}),
		context,
		params: { token },
	} as unknown as ActionArgs);

describe("escaneo action", () => {
	test("el registro nuevo se anuncia como tal", async () => {
		const result = await run(
			createContext(async () => ({
				success: true,
				data: resultOf("RECORDED"),
				timestamp: new Date().toISOString(),
			})),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.message).toBe("Asistencia registrada.");
	});

	test("el repetido lo dice sin sonar a error", async () => {
		const result = await run(
			createContext(async () => ({
				success: true,
				data: resultOf("ALREADY_RECORDED"),
				timestamp: new Date().toISOString(),
			})),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.message).toBe("Tu asistencia ya estaba registrada.");
	});

	// Un action devuelve el envelope: la pantalla sigue en pie y pinta el motivo.
	test("un rechazo vuelve localizado, sin lanzar", async () => {
		const result = await run(
			createContext(async () => ({
				success: false,
				error: { code: CHECK_IN_ERROR_CODES.SESSION_CLOSED, message: "" },
				timestamp: new Date().toISOString(),
			})),
		);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(CHECK_IN_ERROR_CODES.SESSION_CLOSED);
		expect(result.error.message).not.toBe("");
	});

	test("un token mal formado no llega al servicio", async () => {
		let called = false;
		const result = await run(
			createContext(async () => {
				called = true;
				return { success: true, data: resultOf("RECORDED") };
			}),
			"no-es-un-token",
		);

		expect(called).toBe(false);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(CHECK_IN_ERROR_CODES.INVALID_TOKEN);
	});

	test("el rate limit corta antes del servicio", async () => {
		let called = false;
		const result = await run(
			createContext(async () => {
				called = true;
				return { success: true, data: resultOf("RECORDED") };
			}, false),
		);

		expect(called).toBe(false);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(CHECK_IN_ERROR_CODES.RATE_LIMITED);
	});
});
