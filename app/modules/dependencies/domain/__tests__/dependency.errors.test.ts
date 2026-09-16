import { describe, expect, test } from "vitest";
import { DomainError } from "@/shared/errors/domain-error";
import {
	DEPENDENCY_ERROR_CODES,
	DependencyAlreadyHasHeadError,
	DependencyInactiveError,
	DependencyNotFoundError,
	DuplicateDependencyNameError,
	HeadMustBeActiveError,
	HeadMustBelongToDependencyError,
} from "../dependency.errors";

const ERRORS = [
	[new DependencyNotFoundError(), "DEPENDENCY_NOT_FOUND"],
	[new DuplicateDependencyNameError(), "DUPLICATE_DEPENDENCY_NAME"],
	[new DependencyInactiveError(), "DEPENDENCY_INACTIVE"],
	[new DependencyAlreadyHasHeadError(), "DEPENDENCY_ALREADY_HAS_HEAD"],
	[new HeadMustBelongToDependencyError(), "HEAD_MUST_BELONG_TO_DEPENDENCY"],
	[new HeadMustBeActiveError(), "HEAD_MUST_BE_ACTIVE"],
] as const;

describe("errores de dependencias", () => {
	// El `code` es el contrato: es lo que viaja en el envelope y la clave con la
	// que el adaptador elige la copia. El `message` es texto interno y puede
	// cambiar sin avisar, así que nunca se asserta.
	test.each(ERRORS)("$0.name expone su código estable", (error, code) => {
		expect(error.code).toBe(code);
	});

	// Sin esta herencia, `toResponseError` no los reconocería como conocidos y su
	// código no viajaría: la pantalla recibiría UNEXPECTED_ERROR y perdería la copia.
	test.each(ERRORS)("$0.name extiende DomainError", (error) => {
		expect(error).toBeInstanceOf(DomainError);
	});

	test.each(ERRORS)("$0.name lleva el nombre de su clase", (error) => {
		expect(error.name).toBe(error.constructor.name);
	});

	// El diccionario existe aparte de las clases porque los mensajes necesitan la
	// constante sin instanciar el error. Si divergieran, la copia se perdería.
	test("los códigos del diccionario coinciden con los de las clases", () => {
		expect(Object.values(DEPENDENCY_ERROR_CODES).sort()).toEqual(
			ERRORS.map(([error]) => error.code).sort(),
		);
	});

	// Los dos errores de titular tienen códigos distintos a propósito: uno se
	// resuelve dando de alta a la persona en la dependencia, el otro restaurando
	// su cuenta. Una sola copia no serviría para ambos.
	test("no pertenecer y estar archivado son códigos distintos", () => {
		expect(new HeadMustBelongToDependencyError().code).not.toBe(
			new HeadMustBeActiveError().code,
		);
	});
});
