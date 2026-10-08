import { describe, expect, test } from "vitest";
import type { AuthConfig } from "../../domain/auth.config";
import { createSecurityStateRepository } from "../security-state.repository.server";

const LOCKED_AT = new Date("2026-09-01T12:00:00.000Z");
const EPOCH = new Date("2026-09-01T11:00:00.000Z");

type SqlCall = { sql: string; values: unknown[] };

/** Doble de Prisma que registra cada sentencia SQL tal como se envía. */
const createHarness = (
	row: Record<string, unknown> | null = {
		tokensValidAfter: EPOCH,
		lockdownAt: LOCKED_AT,
		lockdownScope: "except-admin",
		lockdownReason: "incidente",
		lockdownBy: 9,
	},
) => {
	const sql: SqlCall[] = [];
	const sessionDeletes: unknown[] = [];

	const prisma = {
		$executeRaw: async (
			strings: TemplateStringsArray,
			...values: unknown[]
		) => {
			sql.push({ sql: strings.join("?").replace(/\s+/g, " ").trim(), values });
			return 1;
		},
		$transaction: async (operations: Promise<unknown>[]) =>
			Promise.all(operations),
		securityState: { findUnique: async () => row },
		user: {
			findMany: async () => [{ id: 50, tokensValidAfter: EPOCH }],
		},
		session: {
			deleteMany: async (args?: unknown) => {
				sessionDeletes.push(args);
				return { count: 3 };
			},
		},
	};

	const repository = createSecurityStateRepository({
		prisma: prisma as never,
		authConfig: { accessTokenTtlS: 900 } as AuthConfig,
	});

	return { repository, sql, sessionDeletes };
};

describe("securityStateRepository", () => {
	test("revocar todo fija el epoch con la hora de la base, no la del proceso", async () => {
		const { repository, sql } = createHarness();

		await repository.revokeAllTokens();

		expect(sql).toEqual([
			{
				sql: 'INSERT INTO auth.security_state (id, tokens_valid_after, "updatedAt") VALUES (1, now(), now()) ON CONFLICT (id) DO UPDATE SET tokens_valid_after = now(), "updatedAt" = now()',
				values: [],
			},
		]);
	});

	test("revocar a una persona escribe su epoch con la hora de la base", async () => {
		const { repository, sql } = createHarness();

		await repository.revokeUserTokens(50);

		expect(sql).toEqual([
			{
				sql: "UPDATE auth.users SET tokens_valid_after = now() WHERE id = ?",
				values: [50],
			},
		]);
	});

	test("el cierre parametriza alcance, motivo y autor, y purga sesiones en la misma transacción", async () => {
		const { repository, sql, sessionDeletes } = createHarness();

		const result = await repository.lockdown({
			scope: "all",
			reason: "incidente",
			by: 9,
		});

		expect(sql).toHaveLength(1);
		expect(sql[0].sql).toContain("INSERT INTO auth.security_state");
		expect(sql[0].sql).toContain("lockdown_at = now()");
		expect(sql[0].values).toEqual([
			"all",
			"incidente",
			9,
			"all",
			"incidente",
			9,
		]);
		expect(sessionDeletes).toEqual([{}]);
		expect(result.purgedSessions).toBe(3);
	});

	test("levantar el cierre limpia sus columnas con la hora de la base", async () => {
		const { repository, sql } = createHarness();

		await repository.lift();

		expect(sql).toEqual([
			{
				sql: 'UPDATE auth.security_state SET lockdown_at = NULL, lockdown_scope = NULL, lockdown_reason = NULL, lockdown_by = NULL, "updatedAt" = now() WHERE id = 1',
				values: [],
			},
		]);
	});

	test("la foto descarta un alcance que el dominio no reconoce", async () => {
		const { repository } = createHarness({
			tokensValidAfter: EPOCH,
			lockdownAt: null,
			lockdownScope: "cualquier-cosa",
			lockdownReason: null,
			lockdownBy: null,
		});

		const snapshot = await repository.get();

		expect(snapshot.lockdownScope).toBeNull();
		expect(snapshot.userTokensValidAfter).toEqual(new Map([[50, EPOCH]]));
	});

	test("sin la fila de estado, falla en vez de abrir la plataforma", async () => {
		const { repository } = createHarness(null);

		await expect(repository.get()).rejects.toThrow(
			"security_state row missing",
		);
	});
});
