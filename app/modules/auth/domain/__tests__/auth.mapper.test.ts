import { describe, expect, test } from "vitest";
import type { SafeUser } from "@/modules/users/domain/user.types";
import { toSessionDomain, toSessionSummary } from "../auth.mapper";
import type { Session } from "../auth.types";

const SESSION_ID = "8f1a2b3c-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-03T12:00:00.000Z").getTime();

const rawSessionOf = (overrides: Record<string, unknown> = {}) => ({
	id: SESSION_ID,
	userId: 7,
	refreshTokenHash: "a".repeat(64),
	prevTokenHash: null,
	rotatedAt: null,
	userAgent: "Mozilla/5.0",
	ipAddress: "203.0.113.7",
	expiresAt: new Date("2026-08-10T00:00:00.000Z"),
	createdAt: new Date("2026-08-03T00:00:00.000Z"),
	updatedAt: new Date("2026-08-03T00:00:00.000Z"),
	...overrides,
});

const sessionOf = (overrides: Partial<Session> = {}): Session =>
	({ ...rawSessionOf(), ...overrides }) as Session;

const ownerOf = (overrides: Partial<SafeUser> = {}): SafeUser =>
	({
		id: 7,
		documentId: "11111111-1111-4111-8111-111111111111",
		email: "ana@empresa.com",
		firstName: "Ana",
		lastName: "Ruiz",
		role: "USER",
		phone: null,
		photoUrl: null,
		archivedAt: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...overrides,
	}) as SafeUser;

const ctxOf = (currentSessionId: string | null = null) => ({
	now: NOW,
	currentSessionId,
});

describe("toSessionDomain", () => {
	test("parses a raw row into the domain session", () => {
		const session = toSessionDomain(rawSessionOf());

		expect(session.id).toBe(SESSION_ID);
		expect(session.userId).toBe(7);
	});

	// Parsea contra el esquema en vez de castear: una fila incompleta falla aquí,
	// donde se puede diagnosticar, y no tres capas más arriba.
	test("throws when the row does not match the schema", () => {
		const { expiresAt: _, ...incomplete } = rawSessionOf();

		expect(() => toSessionDomain(incomplete)).toThrow();
	});
});

describe("toSessionSummary", () => {
	// LA invariante del mapper: enumera los campos que SALEN en vez de omitir los
	// que no. Por eso añadir una columna secreta al modelo no la filtra por
	// descuido a la pantalla de administración.
	test("never leaks the token hashes", () => {
		const summary = toSessionSummary(
			sessionOf({ prevTokenHash: "b".repeat(64) }),
			ownerOf(),
			ctxOf(),
		);

		expect(summary).not.toHaveProperty("refreshTokenHash");
		expect(summary).not.toHaveProperty("prevTokenHash");
		expect(JSON.stringify(summary)).not.toContain("a".repeat(64));
		expect(JSON.stringify(summary)).not.toContain("b".repeat(64));
	});

	test("exposes exactly the fields the admin screen needs", () => {
		const summary = toSessionSummary(sessionOf(), ownerOf(), ctxOf());

		expect(Object.keys(summary).sort()).toEqual(
			[
				"createdAt",
				"expiresAt",
				"ipAddress",
				"isCurrent",
				"isExpired",
				"ownerEmail",
				"ownerFullName",
				"userAgent",
				"userId",
				"id",
			].sort(),
		);
	});

	test("resolves the owner email and full name", () => {
		const summary = toSessionSummary(sessionOf(), ownerOf(), ctxOf());

		expect(summary.ownerEmail).toBe("ana@empresa.com");
		expect(summary.ownerFullName).toBe("Ana Ruiz");
	});

	test("a partial name does not leave stray spaces", () => {
		const summary = toSessionSummary(
			sessionOf(),
			ownerOf({ firstName: "Ana", lastName: null }),
			ctxOf(),
		);

		expect(summary.ownerFullName).toBe("Ana");
	});

	test("an owner with no name at all yields null, not an empty string", () => {
		const summary = toSessionSummary(
			sessionOf(),
			ownerOf({ firstName: null, lastName: null }),
			ctxOf(),
		);

		expect(summary.ownerFullName).toBeNull();
	});

	// El dueño puede venir null si la fila quedó huérfana entre la lectura del
	// listado y la del usuario. La FK es cascade, así que es una carrera y no un
	// estado persistente: la tabla debe pintar la fila igual, no romperse.
	test("survives a null owner with a placeholder", () => {
		const summary = toSessionSummary(sessionOf(), null, ctxOf());

		expect(summary.ownerEmail).toBe("—");
		expect(summary.ownerFullName).toBeNull();
	});

	test("derives isExpired from the context clock", () => {
		const expired = toSessionSummary(
			sessionOf({ expiresAt: new Date(NOW - 1) }),
			ownerOf(),
			ctxOf(),
		);
		const alive = toSessionSummary(
			sessionOf({ expiresAt: new Date(NOW + 1) }),
			ownerOf(),
			ctxOf(),
		);

		expect(expired.isExpired).toBe(true);
		expect(alive.isExpired).toBe(false);
	});

	// Frontera exacta: una sesión que expira justo AHORA todavía no ha expirado.
	test("a session expiring exactly now is not expired yet", () => {
		const summary = toSessionSummary(
			sessionOf({ expiresAt: new Date(NOW) }),
			ownerOf(),
			ctxOf(),
		);

		expect(summary.isExpired).toBe(false);
	});

	test("marks isCurrent only for the session the panel is viewed from", () => {
		expect(
			toSessionSummary(sessionOf(), ownerOf(), ctxOf(SESSION_ID)).isCurrent,
		).toBe(true);
		expect(
			toSessionSummary(sessionOf(), ownerOf(), ctxOf("otro")).isCurrent,
		).toBe(false);
	});

	// Sin token de refresh no hay sesión propia que marcar: ninguna fila debe
	// aparecer como "esta es la tuya".
	test("no session is current when the context has no current id", () => {
		expect(
			toSessionSummary(sessionOf(), ownerOf(), ctxOf(null)).isCurrent,
		).toBe(false);
	});

	test("carries the informative metadata through", () => {
		const summary = toSessionSummary(sessionOf(), ownerOf(), ctxOf());

		expect(summary.userAgent).toBe("Mozilla/5.0");
		expect(summary.ipAddress).toBe("203.0.113.7");
		expect(summary.userId).toBe(7);
	});
});
