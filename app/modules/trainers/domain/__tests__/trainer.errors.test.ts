import { describe, expect, test } from "vitest";
import { DomainError } from "@/shared/errors/domain-error";
import {
	DuplicateTrainerEmailError,
	ExternalTrainerRequiresInstitutionError,
	InternalTrainerCannotHaveInstitutionError,
	TRAINER_ERROR_CODES,
	TrainerForbiddenScopeError,
	TrainerProfileAlreadyExistsError,
	TrainerProfileNotFoundError,
} from "../trainer.errors";

/**
 * Se comprueba el `code` y NUNCA el `message`: el código es contrato estable y
 * el mensaje es texto traducible de UI.
 */
describe("errores del catálogo", () => {
	test("cada error expone su código estable", () => {
		expect(new TrainerProfileNotFoundError().code).toBe(
			TRAINER_ERROR_CODES.NOT_FOUND,
		);
		expect(new TrainerProfileAlreadyExistsError().code).toBe(
			TRAINER_ERROR_CODES.ALREADY_EXISTS,
		);
		expect(new DuplicateTrainerEmailError().code).toBe(
			TRAINER_ERROR_CODES.DUPLICATE_EMAIL,
		);
		expect(new ExternalTrainerRequiresInstitutionError().code).toBe(
			TRAINER_ERROR_CODES.EXTERNAL_REQUIRES_INSTITUTION,
		);
		expect(new InternalTrainerCannotHaveInstitutionError().code).toBe(
			TRAINER_ERROR_CODES.INTERNAL_CANNOT_HAVE_INSTITUTION,
		);
		expect(new TrainerForbiddenScopeError().code).toBe(
			TRAINER_ERROR_CODES.FORBIDDEN_SCOPE,
		);
	});

	// Extender DomainError es lo que hace que `toResponseError` los reconozca
	// como conocidos y deje viajar su código en el envelope.
	test("todos descienden de DomainError", () => {
		expect(new TrainerProfileNotFoundError()).toBeInstanceOf(DomainError);
		expect(new TrainerForbiddenScopeError()).toBeInstanceOf(DomainError);
	});
});
