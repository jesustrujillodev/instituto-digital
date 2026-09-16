import { describe, expect, test } from "vitest";
import {
	validateAddMembers,
	validateCreateGroup,
	validateFindGroup,
	validateListCandidates,
	validateListGroups,
	validateRemoveMember,
	validateUpdateGroup,
} from "../group.validators";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("validadores de grupos", () => {
	test("devuelven el dto ya parseado", () => {
		expect(validateCreateGroup({ name: "Mandos medios" })).toEqual({
			name: "Mandos medios",
		});
		expect(validateFindGroup({ documentId: UUID })).toEqual({
			documentId: UUID,
		});
		expect(validateUpdateGroup({})).toEqual({});
		expect(validateListGroups({})).toEqual({});
		expect(validateListCandidates({ documentId: UUID })).toEqual({
			documentId: UUID,
		});
	});

	// Lanzan ValiError: quien llama lo envuelve en `parseInput`, que es lo que lo
	// convierte en la rama de validación del envelope.
	test("lanzan cuando el dato no cumple", () => {
		expect(() => validateFindGroup({ documentId: "x" })).toThrow();
		expect(() =>
			validateAddMembers({ documentId: UUID, userDocumentIds: [] }),
		).toThrow();
		expect(() => validateRemoveMember({ documentId: UUID })).toThrow();
	});
});
