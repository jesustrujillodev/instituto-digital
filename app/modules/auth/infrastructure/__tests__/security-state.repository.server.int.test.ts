import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDbFixtures } from "@/core/__tests__/db.fixtures";
import { prisma } from "@/core/db.server";
import type { AuthConfig } from "../../domain/auth.config";
import { createSecurityStateRepository } from "../security-state.repository.server";

const repository = createSecurityStateRepository({
	prisma,
	authConfig: { accessTokenTtlS: 300 } as AuthConfig,
});
const fixtures = createDbFixtures();

const session = (userId: number) =>
	prisma.session.create({
		data: {
			userId,
			refreshTokenHash: fixtures.unique("hash"),
			expiresAt: new Date(Date.now() + 60_000),
		},
	});

/** La base y el proceso corren en la misma máquina. */
const CLOCK_TOLERANCE_MS = 5_000;

describe("estado de seguridad contra Postgres", () => {
	beforeAll(() => prisma.securityState.deleteMany({}));
	afterAll(async () => {
		await prisma.securityState.deleteMany({});
		await fixtures.cleanup();
	});

	test("revokeAllTokens crea la fila si falta y mueve el epoch con la hora de la base", async () => {
		const snapshot = await repository.revokeAllTokens();

		expect(
			Math.abs(snapshot.tokensValidAfter.getTime() - Date.now()),
		).toBeLessThan(CLOCK_TOLERANCE_MS);
		expect(snapshot.lockdownAt).toBeNull();
	});

	test("revokeUserTokens deja el epoch del usuario en la foto", async () => {
		const user = await fixtures.user();

		await repository.revokeUserTokens(user.id);
		const snapshot = await repository.get();

		expect(snapshot.userTokensValidAfter.get(user.id)).toBeInstanceOf(Date);
	});

	test("el cierre except-admin purga todas las sesiones salvo las de superadministradores, y lift lo levanta", async () => {
		const admin = await fixtures.user({ role: "SUPERADMIN" });
		const person = await fixtures.user();
		await Promise.all([session(admin.id), session(person.id)]);

		const { snapshot, purgedSessions } = await repository.lockdown({
			scope: "except-admin",
			reason: "incidente",
			by: admin.id,
		});

		expect(purgedSessions).toBeGreaterThanOrEqual(1);
		expect(snapshot).toMatchObject({
			lockdownScope: "except-admin",
			lockdownReason: "incidente",
			lockdownBy: admin.id,
		});
		expect(await prisma.session.count({ where: { userId: admin.id } })).toBe(1);
		expect(await prisma.session.count({ where: { userId: person.id } })).toBe(
			0,
		);

		expect(await repository.lift()).toMatchObject({
			lockdownAt: null,
			lockdownScope: null,
			lockdownReason: null,
			lockdownBy: null,
		});
	});
});
