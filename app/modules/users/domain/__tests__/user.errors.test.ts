import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	DuplicateEmailError,
	InvalidUploadError,
	USER_ERROR_CODES,
	UserError,
	UserHasRelatedRecordsError,
	UserNotArchivedError,
	UserNotFoundError,
} from "../user.errors";

const ALL_ERRORS = [
	new UserNotFoundError(),
	new DuplicateEmailError(),
	new UserNotArchivedError(),
	new UserHasRelatedRecordsError(),
	new InvalidUploadError("tipo no permitido"),
];

describe("USER_ERROR_CODES", () => {
	// Son la clave del diccionario de copia: renombrar uno deja su entrada
	// huérfana y el usuario acabaría leyendo el texto de reserva.
	test("mantiene sus valores estables", () => {
		expect(USER_ERROR_CODES).toEqual({
			NOT_FOUND: "USER_NOT_FOUND",
			DUPLICATE_EMAIL: "DUPLICATE_EMAIL",
			DUPLICATE_EMPLOYEE_NUMBER: "DUPLICATE_EMPLOYEE_NUMBER",
			EMPLOYEE_NUMBER_REQUIRED: "EMPLOYEE_NUMBER_REQUIRED",
			DEPENDENCY_INACTIVE: "USER_DEPENDENCY_INACTIVE",
			DEPENDENCY_NOT_FOUND: "USER_DEPENDENCY_NOT_FOUND",
			HEAD_CANNOT_LEAVE: "HEAD_CANNOT_LEAVE_DEPENDENCY",
			FORBIDDEN_SCOPE: "FORBIDDEN_SCOPE",
			INVALID_CURRENT_PASSWORD: "INVALID_CURRENT_PASSWORD",
			NOT_ARCHIVED: "USER_NOT_ARCHIVED",
			HAS_RELATED_RECORDS: "USER_HAS_RELATED_RECORDS",
			INVALID_UPLOAD: "INVALID_UPLOAD",
			EXTERNAL_REQUIRES_TRAINER: "EXTERNAL_REQUIRES_TRAINER_PROFILE",
		});
	});
});

describe("errores del módulo de usuarios", () => {
	test("cada error lleva su propio código", () => {
		expect(new UserNotFoundError().code).toBe("USER_NOT_FOUND");
		expect(new DuplicateEmailError().code).toBe("DUPLICATE_EMAIL");
		expect(new UserNotArchivedError().code).toBe("USER_NOT_ARCHIVED");
		expect(new UserHasRelatedRecordsError().code).toBe(
			"USER_HAS_RELATED_RECORDS",
		);
		expect(new InvalidUploadError("x").code).toBe("INVALID_UPLOAD");
	});

	// Sin esto, `toResponseError` los trataría como desconocidos: el envelope
	// respondería UNEXPECTED_ERROR y el action no podría distinguir un correo
	// duplicado de una caída de la base.
	test("todos extienden UserError y DomainError", () => {
		for (const error of ALL_ERRORS) {
			expect(error).toBeInstanceOf(UserError);
			expect(isDomainError(error)).toBe(true);
		}
	});

	test("ningún código está repetido entre dos errores", () => {
		const codes = ALL_ERRORS.map((error) => error.code);

		expect(new Set(codes).size).toBe(codes.length);
	});

	test("el nombre corresponde a la clase concreta", () => {
		expect(new UserNotFoundError().name).toBe("UserNotFoundError");
		expect(new InvalidUploadError("x").name).toBe("InvalidUploadError");
	});
});

describe("InvalidUploadError", () => {
	// `details` viaja dentro del envelope hasta el cliente: el adaptador redacta
	// el mensaje concreto sin volver a inspeccionar la clase del error.
	test("lleva el motivo en details serializables", () => {
		const error = new InvalidUploadError("supera el máximo de 5000 bytes");

		expect(error.details).toEqual({ reason: "supera el máximo de 5000 bytes" });
		expect(JSON.parse(JSON.stringify(error.details))).toEqual({
			reason: "supera el máximo de 5000 bytes",
		});
	});

	test("el motivo también aparece en el mensaje técnico", () => {
		expect(new InvalidUploadError("archivo vacío").message).toContain(
			"archivo vacío",
		);
	});
});

describe("UserHasRelatedRecordsError", () => {
	// No enumera qué modelos apuntan al usuario a propósito: la restricción la
	// impone la base, así que este módulo no tiene que conocer los modelos que se
	// añadan después.
	test("no enumera los modelos relacionados", () => {
		expect(new UserHasRelatedRecordsError().details).toBeUndefined();
	});
});
