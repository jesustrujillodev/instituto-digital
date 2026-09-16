import { describe, expect, test } from "vitest";
import { INTENT_FIELD, SESSION_INTENTS } from "../session-monitor-form";

describe("INTENT_FIELD", () => {
	test("is the stable field name the action reads", () => {
		expect(INTENT_FIELD).toBe("intent");
	});
});

describe("SESSION_INTENTS", () => {
	// Son el contrato del `switch` del action: el valor viaja en el FormData, así
	// que renombrar uno rompe el botón que lo envía sin que nada falle en
	// compilación.
	test("keeps its stable wire values", () => {
		expect(SESSION_INTENTS).toEqual({
			revokeSession: "revoke-session",
			revokeUser: "revoke-user",
			revokeAll: "revoke-all",
			cleanupExpired: "cleanup-expired",
			lockdown: "lockdown",
			lift: "lift",
		});
	});

	// Dos intents con el mismo valor harían que un botón ejecutara la acción del
	// otro, y el `switch` elegiría por orden de declaración.
	test("no two intents share a value", () => {
		const values = Object.values(SESSION_INTENTS);

		expect(new Set(values).size).toBe(values.length);
	});

	test("no intent collides with the field name itself", () => {
		expect(Object.values(SESSION_INTENTS)).not.toContain(INTENT_FIELD);
	});
});
