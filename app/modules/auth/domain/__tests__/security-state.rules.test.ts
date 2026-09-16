import { describe, expect, test } from "vitest";
import type { SecuritySnapshot } from "../security-state.repository";
import {
	evaluateToken,
	exemptRolesFor,
	isLockedOutForRole,
} from "../security-state.rules";

const claimsWithRole = (userId: number, iat: number, role: "USER" | "ADMIN") =>
	({ userId, role, iat }) as const;

const EPOCH = new Date("2026-07-30T12:00:00.000Z");

/** `iat` es un entero en SEGUNDOS — igual que lo emite jose. */
const iatOf = (date: Date) => Math.floor(date.getTime() / 1000);

const snapshotOf = (
	overrides: Partial<SecuritySnapshot> = {},
): SecuritySnapshot => ({
	tokensValidAfter: EPOCH,
	lockdownAt: null,
	lockdownScope: null,
	lockdownReason: null,
	lockdownBy: null,
	userTokensValidAfter: new Map(),
	readAt: EPOCH,
	...overrides,
});

const claims = (userId: number, iat: number) =>
	({ userId, role: "USER", iat }) as const;

describe("evaluateToken", () => {
	test("rejects a token issued before the global epoch", () => {
		const before = iatOf(new Date(EPOCH.getTime() - 60_000));

		expect(evaluateToken(claims(1, before), snapshotOf())).toEqual({
			allowed: false,
			reason: "GLOBAL_EPOCH",
		});
	});

	test("allows a token issued after the global epoch", () => {
		const after = iatOf(new Date(EPOCH.getTime() + 60_000));

		expect(evaluateToken(claims(1, after), snapshotOf())).toEqual({
			allowed: true,
		});
	});

	// La propiedad que NO se debe "arreglar" con un margen de tolerancia: `iat`
	// viene en segundos y el epoch en milisegundos, así que un token acuñado en el
	// mismo segundo que el corte se trunca hacia atrás y cae. Falla hacia cerrado
	// y se autocorrige por refresh; un margen sería una ventana de fuga.
	test("rejects a token minted in the same second as the epoch (fail-closed)", () => {
		const epochWithMs = new Date("2026-07-30T12:00:00.500Z");
		const sameSecond = iatOf(epochWithMs); // trunca a ...00.000

		const verdict = evaluateToken(
			claims(1, sameSecond),
			snapshotOf({ tokensValidAfter: epochWithMs }),
		);

		expect(verdict).toEqual({ allowed: false, reason: "GLOBAL_EPOCH" });
	});

	test("a user epoch cuts that user and leaves the rest untouched", () => {
		const userEpoch = new Date(EPOCH.getTime() + 60_000);
		const issuedAt = iatOf(new Date(EPOCH.getTime() + 30_000));
		const snapshot = snapshotOf({
			userTokensValidAfter: new Map([[7, userEpoch]]),
		});

		expect(evaluateToken(claims(7, issuedAt), snapshot)).toEqual({
			allowed: false,
			reason: "USER_EPOCH",
		});
		expect(evaluateToken(claims(8, issuedAt), snapshot)).toEqual({
			allowed: true,
		});
	});

	test("a token newer than its user epoch is allowed", () => {
		const userEpoch = new Date(EPOCH.getTime() + 30_000);
		const issuedAt = iatOf(new Date(EPOCH.getTime() + 90_000));

		const verdict = evaluateToken(
			claims(7, issuedAt),
			snapshotOf({ userTokensValidAfter: new Map([[7, userEpoch]]) }),
		);

		expect(verdict).toEqual({ allowed: true });
	});

	// El caso normal: el mapa viene vacío porque no hay epochs de usuario
	// vigentes. Ausencia no es "revocado", es "nada que comparar".
	test("allows when the snapshot carries no user epochs", () => {
		const issuedAt = iatOf(new Date(EPOCH.getTime() + 1000));

		expect(evaluateToken(claims(42, issuedAt), snapshotOf())).toEqual({
			allowed: true,
		});
	});

	// El epoch global se evalúa primero: si ambos cortan, el motivo reportado es
	// el global. Importa para las métricas, que cuentan por `reason`.
	test("reports GLOBAL_EPOCH when both epochs would reject", () => {
		const issuedAt = iatOf(new Date(EPOCH.getTime() - 60_000));

		const verdict = evaluateToken(
			claims(7, issuedAt),
			snapshotOf({ userTokensValidAfter: new Map([[7, EPOCH]]) }),
		);

		expect(verdict).toEqual({ allowed: false, reason: "GLOBAL_EPOCH" });
	});

	describe("lockdown", () => {
		const issuedAfterEpoch = iatOf(new Date(EPOCH.getTime() + 60_000));

		test("scope 'all' blocks USER and ADMIN alike", () => {
			const snapshot = snapshotOf({ lockdownAt: EPOCH, lockdownScope: "all" });

			expect(
				evaluateToken(claimsWithRole(1, issuedAfterEpoch, "USER"), snapshot),
			).toEqual({ allowed: false, reason: "LOCKDOWN" });
			expect(
				evaluateToken(claimsWithRole(1, issuedAfterEpoch, "ADMIN"), snapshot),
			).toEqual({ allowed: false, reason: "LOCKDOWN" });
		});

		test("scope 'except-admin' lets ADMIN through and blocks USER", () => {
			const snapshot = snapshotOf({
				lockdownAt: EPOCH,
				lockdownScope: "except-admin",
			});

			expect(
				evaluateToken(claimsWithRole(1, issuedAfterEpoch, "ADMIN"), snapshot),
			).toEqual({ allowed: true });
			expect(
				evaluateToken(claimsWithRole(1, issuedAfterEpoch, "USER"), snapshot),
			).toEqual({ allowed: false, reason: "LOCKDOWN" });
		});

		// Precedencia: el lockdown gana aunque el iat sea posterior a cualquier
		// epoch — no es "otro epoch más", corta primero y siempre.
		test("LOCKDOWN wins even when iat is newer than every epoch", () => {
			const snapshot = snapshotOf({
				lockdownAt: EPOCH,
				lockdownScope: "all",
				tokensValidAfter: new Date(EPOCH.getTime() - 1_000_000),
				userTokensValidAfter: new Map([
					[1, new Date(EPOCH.getTime() - 1_000_000)],
				]),
			});

			expect(
				evaluateToken(claimsWithRole(1, issuedAfterEpoch, "USER"), snapshot),
			).toEqual({ allowed: false, reason: "LOCKDOWN" });
		});
	});
});

describe("isLockedOutForRole", () => {
	const snapshotFor = (
		lockdownAt: Date | null,
		lockdownScope: "all" | "except-admin" | null,
	) => ({ lockdownAt, lockdownScope });

	test("sin lockdown activo no bloquea a nadie", () => {
		expect(isLockedOutForRole(snapshotFor(null, null), "USER")).toBe(false);
		expect(isLockedOutForRole(snapshotFor(null, "all"), "ADMIN")).toBe(false);
	});

	test("el alcance all no exime a ningún rol", () => {
		expect(isLockedOutForRole(snapshotFor(new Date(), "all"), "USER")).toBe(
			true,
		);
		expect(isLockedOutForRole(snapshotFor(new Date(), "all"), "ADMIN")).toBe(
			true,
		);
	});

	test("except-admin exime solo a los roles de plataforma", () => {
		expect(
			isLockedOutForRole(snapshotFor(new Date(), "except-admin"), "ADMIN"),
		).toBe(false);
		expect(
			isLockedOutForRole(snapshotFor(new Date(), "except-admin"), "USER"),
		).toBe(true);
	});

	// La razón de ser del alcance: quien tiene que levantar el cierre se queda
	// dentro. Si el superadministrador cayera con todos los demás, un lockdown
	// sería irreversible desde la propia plataforma.
	test("except-admin deja dentro al superadministrador", () => {
		expect(
			isLockedOutForRole(snapshotFor(new Date(), "except-admin"), "SUPERADMIN"),
		).toBe(false);
	});

	test("except-admin saca a titulares, auxiliares y participantes", () => {
		for (const role of ["DEPENDENCY_HEAD", "DEPENDENCY_DEPUTY", "USER"]) {
			expect(
				isLockedOutForRole(snapshotFor(new Date(), "except-admin"), role),
			).toBe(true);
		}
	});

	// Un rol que no existe no puede colarse por ser desconocido: el predicado es
	// una allowlist, no una denylist.
	test("un rol desconocido queda bloqueado", () => {
		expect(
			isLockedOutForRole(snapshotFor(new Date(), "except-admin"), "OWNER"),
		).toBe(true);
	});

	// Fail-closed: un cierre activo con el alcance sin declarar se trata como el
	// MÁS restrictivo. Interpretarlo como "sin restricción" dejaría la plataforma
	// abierta justo cuando alguien acaba de cerrarla.
	test("un lockdown activo sin alcance declarado se trata como all", () => {
		expect(isLockedOutForRole(snapshotFor(new Date(), null), "ADMIN")).toBe(
			true,
		);
		expect(isLockedOutForRole(snapshotFor(new Date(), null), "USER")).toBe(
			true,
		);
	});
});

describe("exemptRolesFor", () => {
	// Es la fuente que consume la purga de sesiones del repositorio. Si dejara de
	// coincidir con lo que decide `isLockedOutForRole`, el lockdown borraría la
	// sesión de alguien a quien la regla deja pasar — y lo echaría de una
	// plataforma que solo él puede reabrir.
	test("all no exime a nadie", () => {
		expect(exemptRolesFor("all")).toEqual([]);
	});

	test("except-admin exime a los roles de plataforma", () => {
		expect(exemptRolesFor("except-admin")).toEqual(["ADMIN", "SUPERADMIN"]);
	});

	test("coincide con lo que decide isLockedOutForRole", () => {
		const lockedDown = {
			lockdownAt: new Date(),
			lockdownScope: "all" as const,
		};

		for (const scope of ["all", "except-admin"] as const) {
			for (const role of ["USER", "ADMIN", "SUPERADMIN", "DEPENDENCY_HEAD"]) {
				expect(
					isLockedOutForRole({ ...lockedDown, lockdownScope: scope }, role),
				).toBe(!exemptRolesFor(scope).includes(role as never));
			}
		}
	});
});
