import { describe, expect, test } from "vitest";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { ENROLLMENT_ERROR_CODES } from "../../domain/enrollment.errors";
import { ENROLLMENT_ERROR_MESSAGES } from "../enrollment-error-messages";
import { batchMessage, personNameOf } from "../enrollment-labels";
import { parseEnrollmentFormData } from "../parse-enrollment-form-data";

describe("ENROLLMENT_ERROR_MESSAGES", () => {
	test("todo código del módulo tiene copia", () => {
		for (const code of Object.values(ENROLLMENT_ERROR_CODES)) {
			expect(ENROLLMENT_ERROR_MESSAGES[code]).toBeDefined();
		}
	});

	test("tiene entrada de reserva para lo inesperado", () => {
		expect(
			ENROLLMENT_ERROR_MESSAGES[RESPONSE_ERROR_CODES.UNEXPECTED],
		).toBeDefined();
	});

	test.each([
		[404, ENROLLMENT_ERROR_CODES.COURSE_NOT_FOUND],
		[403, ENROLLMENT_ERROR_CODES.NOT_ELIGIBLE],
		[403, ENROLLMENT_ERROR_CODES.FORBIDDEN_SCOPE],
	])("un loader responde %s a %s", (status, code) => {
		expect(ENROLLMENT_ERROR_MESSAGES[code]).toMatchObject({ status });
	});
});

describe("batchMessage", () => {
	const verb = { singular: "invitado", plural: "invitados" };

	test("sin omitidos solo cuenta los afectados", () => {
		expect(batchMessage({ affected: 1, skipped: 0 }, verb)).toBe("1 invitado");
	});

	test("con omitidos los añade", () => {
		expect(batchMessage({ affected: 2, skipped: 3 }, verb)).toBe(
			"2 invitados, 3 omitidos",
		);
	});
});

describe("personNameOf", () => {
	test("cae al correo si no hay nombre", () => {
		expect(
			personNameOf({ firstName: null, lastName: null, email: "a@b.mx" }),
		).toBe("a@b.mx");
	});
});

describe("parseEnrollmentFormData", () => {
	test("junta las listas repetidas e ignora vacíos", () => {
		const form = new FormData();
		form.append("intent", "invite");
		form.append("userDocumentIds", "u1");
		form.append("userDocumentIds", "");
		form.append("userDocumentIds", "u2");
		form.append("groupDocumentIds", "g1");

		expect(parseEnrollmentFormData(form)).toEqual({
			intent: "invite",
			courseDocumentId: undefined,
			userDocumentIds: ["u1", "u2"],
			groupDocumentIds: ["g1"],
		});
	});
});
