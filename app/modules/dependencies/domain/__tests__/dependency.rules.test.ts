import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	assignHeadRule,
	createDependencyRule,
	DEPENDENCY_SORT_FIELDS,
	DEPENDENCY_STATUSES,
	dependencySchema,
	findDependencyRule,
	listDependenciesRule,
	updateDependencyRule,
} from "../dependency.rules";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";

describe("dependencySchema", () => {
	const raw = {
		id: 5,
		documentId: DOCUMENT_ID,
		name: "Obras Públicas",
		acronym: "SOP",
		archivedAt: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
	};

	test("acepta la fila completa", () => {
		expect(v.safeParse(dependencySchema, raw).success).toBe(true);
	});

	// Las dos columnas nullable de la tabla. Si el esquema las exigiera, una
	// dependencia sin siglas o activa no se podría mapear.
	test("acronym y archivedAt admiten null", () => {
		expect(
			v.safeParse(dependencySchema, { ...raw, acronym: null, archivedAt: null })
				.success,
		).toBe(true);
	});

	test("archivedAt admite una fecha", () => {
		expect(
			v.safeParse(dependencySchema, { ...raw, archivedAt: new Date() }).success,
		).toBe(true);
	});
});

describe("createDependencyRule", () => {
	test("acepta el nombre solo, sin siglas", () => {
		const result = v.safeParse(createDependencyRule, {
			name: "Obras Públicas",
		});

		expect(result.success).toBe(true);
		expect(result.success && result.output.acronym).toBeUndefined();
	});

	// El nombre es la columna `@unique`: recortarlo antes de validar evita que
	// " Obras" y "Obras" sean dos unidades que la base acepta por separado.
	test("recorta el nombre antes de validar", () => {
		const result = v.safeParse(createDependencyRule, {
			name: "  Obras Públicas  ",
		});

		expect(result.success && result.output.name).toBe("Obras Públicas");
	});

	test("recorta también las siglas", () => {
		const result = v.safeParse(createDependencyRule, {
			name: "Obras Públicas",
			acronym: "  SOP  ",
		});

		expect(result.success && result.output.acronym).toBe("SOP");
	});

	// Un nombre de dos letras no identifica nada, y uno recortado a espacios
	// pasaría el `minLength` si se validara antes del trim.
	test("rechaza un nombre demasiado corto", () => {
		expect(v.safeParse(createDependencyRule, { name: "OP" }).success).toBe(
			false,
		);
		expect(v.safeParse(createDependencyRule, { name: "   " }).success).toBe(
			false,
		);
	});

	test("rechaza un nombre que excede el máximo", () => {
		expect(
			v.safeParse(createDependencyRule, { name: "a".repeat(121) }).success,
		).toBe(false);
	});

	test("rechaza siglas que exceden el máximo", () => {
		expect(
			v.safeParse(createDependencyRule, {
				name: "Obras Públicas",
				acronym: "a".repeat(17),
			}).success,
		).toBe(false);
	});

	test("exige el nombre", () => {
		expect(v.safeParse(createDependencyRule, {}).success).toBe(false);
	});
});

describe("updateDependencyRule", () => {
	// Es `partial`: una edición que solo cambia las siglas no debe obligar a
	// reenviar el nombre.
	test("admite un subconjunto de campos", () => {
		expect(v.safeParse(updateDependencyRule, { acronym: "SOP" }).success).toBe(
			true,
		);
		expect(v.safeParse(updateDependencyRule, {}).success).toBe(true);
	});

	test("sigue validando el formato de lo que sí manda", () => {
		expect(v.safeParse(updateDependencyRule, { name: "OP" }).success).toBe(
			false,
		);
	});
});

describe("findDependencyRule / assignHeadRule", () => {
	test("exigen uuid", () => {
		expect(v.safeParse(findDependencyRule, { documentId: "5" }).success).toBe(
			false,
		);
		expect(
			v.safeParse(findDependencyRule, { documentId: DOCUMENT_ID }).success,
		).toBe(true);
	});

	// Los dos identificadores son públicos: el interno no viaja al cliente y la
	// traducción es del repositorio.
	test("assignHeadRule exige los dos documentId", () => {
		expect(
			v.safeParse(assignHeadRule, {
				documentId: DOCUMENT_ID,
				userDocumentId: USER_DOCUMENT_ID,
			}).success,
		).toBe(true);

		expect(
			v.safeParse(assignHeadRule, { documentId: DOCUMENT_ID }).success,
		).toBe(false);
	});
});

describe("listDependenciesRule", () => {
	test("hereda la paginación base", () => {
		const result = v.safeParse(listDependenciesRule, { page: 2, pageSize: 25 });

		expect(result.success).toBe(true);
	});

	test("todos los filtros son opcionales", () => {
		expect(v.safeParse(listDependenciesRule, {}).success).toBe(true);
	});

	// El valor llega del query string y acaba en un `orderBy`: si no fuera una
	// allowlist, cualquier nombre de columna pasaría.
	test("sortBy es una allowlist", () => {
		expect(v.safeParse(listDependenciesRule, { sortBy: "name" }).success).toBe(
			true,
		);
		expect(v.safeParse(listDependenciesRule, { sortBy: "id" }).success).toBe(
			false,
		);
	});

	test("status solo admite los estados declarados", () => {
		for (const status of DEPENDENCY_STATUSES) {
			expect(v.safeParse(listDependenciesRule, { status }).success).toBe(true);
		}
		expect(
			v.safeParse(listDependenciesRule, { status: "inactive" }).success,
		).toBe(false);
	});

	test("sortDir solo admite asc y desc", () => {
		expect(v.safeParse(listDependenciesRule, { sortDir: "asc" }).success).toBe(
			true,
		);
		expect(
			v.safeParse(listDependenciesRule, { sortDir: "ascending" }).success,
		).toBe(false);
	});
});

describe("allowlists exportadas", () => {
	// Son contrato con la UI: la tabla ordena por estas claves y el repositorio las
	// usa tal cual en el orderBy.
	test("los campos ordenables son los de la tabla", () => {
		expect(DEPENDENCY_SORT_FIELDS).toEqual([
			"name",
			"acronym",
			"archivedAt",
			"createdAt",
		]);
	});

	test("los estados son activa, archivada y todas", () => {
		expect(DEPENDENCY_STATUSES).toEqual(["active", "archived", "all"]);
	});
});
