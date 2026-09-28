import { describe, expect, test } from "vitest";
import type { TrainerDetail } from "@/modules/trainers/domain/trainer.types";
import type { SafeUser } from "../../domain/user.types";
import {
	fullNameOf,
	initialsOf,
	toUserListItems,
	toUserRows,
	type UserListItem,
} from "../to-user-rows";

const userOf = (overrides: Partial<SafeUser> = {}): SafeUser => ({
	id: 1,
	documentId: "11111111-1111-4111-8111-111111111111",
	email: "ana@empresa.com",
	firstName: "Ana",
	lastName: "Ruiz",
	role: "USER",
	phone: null,
	photoUrl: null,
	type: "INTERNAL",
	employeeNumber: null,
	jobTitle: null,
	dependencyId: null,
	isTrainer: false,
	archivedAt: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	...overrides,
});

const itemOf = (overrides: Partial<UserListItem> = {}): UserListItem => ({
	...userOf(),
	trainerProfile: null,
	canManage: true,
	canManageTrainer: true,
	...overrides,
});

describe("toUserRows", () => {
	// El `id` numérico se SUSTITUYE, no se añade: la PK interna de la base no
	// tiene por qué viajar al cliente, y la tabla necesita el identificador
	// público que ya usan las URLs y los actions.
	test("sustituye el id numérico por el documentId", () => {
		const [row] = toUserRows([itemOf()]);

		expect(row.id).toBe("11111111-1111-4111-8111-111111111111");
	});

	test("no deja rastro de la PK interna en la fila", () => {
		const [row] = toUserRows([itemOf({ id: 42 })]);

		expect(Object.values(row)).not.toContain(42);
	});

	test("conserva el resto de campos del usuario", () => {
		const [row] = toUserRows([itemOf({ email: "ana@empresa.com" })]);

		expect(row.email).toBe("ana@empresa.com");
		expect(row.firstName).toBe("Ana");
		expect(row.role).toBe("USER");
	});

	test("mapea la lista entera y respeta el orden", () => {
		const rows = toUserRows([
			itemOf({ documentId: "a" }),
			itemOf({ documentId: "b" }),
		]);

		expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
	});

	test("una lista vacía devuelve una lista vacía", () => {
		expect(toUserRows([])).toEqual([]);
	});
});

describe("fullNameOf", () => {
	test("une nombre y apellido", () => {
		expect(fullNameOf({ firstName: "Ana", lastName: "Ruiz" })).toBe("Ana Ruiz");
	});

	test("con un solo campo no deja espacios sueltos", () => {
		expect(fullNameOf({ firstName: "Ana", lastName: null })).toBe("Ana");
		expect(fullNameOf({ firstName: null, lastName: "Ruiz" })).toBe("Ruiz");
	});

	test("sin nombre registrado devuelve cadena vacía", () => {
		expect(fullNameOf({ firstName: null, lastName: null })).toBe("");
	});
});

describe("initialsOf", () => {
	test("toma la primera letra de nombre y apellido, en mayúscula", () => {
		expect(
			initialsOf({ firstName: "ana", lastName: "ruiz", email: "a@b.com" }),
		).toBe("AR");
	});

	test("con un solo campo devuelve una sola inicial", () => {
		expect(
			initialsOf({ firstName: "Ana", lastName: null, email: "a@b.com" }),
		).toBe("A");
	});

	// Una cuenta recién creada puede no tener nombre todavía; el avatar no puede
	// quedarse en blanco, así que cae al correo.
	test("sin nombre cae a la primera letra del correo", () => {
		expect(
			initialsOf({ firstName: null, lastName: null, email: "ana@empresa.com" }),
		).toBe("A");
	});

	test("sin nombre ni correo cae al interrogante", () => {
		expect(initialsOf({ firstName: null, lastName: null, email: "" })).toBe(
			"?",
		);
	});
});

describe("toUserListItems", () => {
	const HEAD = {
		userId: 99,
		role: "DEPENDENCY_HEAD" as const,
		dependencyId: 3,
	};

	const profileOf = (userDocumentId: string): TrainerDetail => ({
		userDocumentId,
		firstName: "Luis",
		lastName: "Mora",
		email: "luis@universidad.mx",
		type: "EXTERNAL",
		specialty: "Transparencia",
		institution: "Universidad Autónoma",
		dependencyName: null,
		archivedAt: null,
		phone: null,
		bio: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		coursesTaught: 0,
		averageRating: null,
	});

	test("une a cada cuenta su perfil por el documentId", () => {
		const [withProfile, without] = toUserListItems(
			[userOf({ documentId: "a" }), userOf({ documentId: "b" })],
			[profileOf("a")],
			HEAD,
		);

		expect(withProfile.trainerProfile?.specialty).toBe("Transparencia");
		expect(without.trainerProfile).toBeNull();
	});

	// El titular VE al externo —puede asignarlo y administrar su perfil— pero su
	// alcance no llega a la cuenta, que no pertenece a ninguna dependencia.
	test("un titular administra el perfil de un externo, no su cuenta", () => {
		const [external] = toUserListItems(
			[userOf({ type: "EXTERNAL", dependencyId: null })],
			[],
			HEAD,
		);

		expect(external.canManage).toBe(false);
		expect(external.canManageTrainer).toBe(true);
	});

	test("un titular administra cuenta y perfil de su gente", () => {
		const [own] = toUserListItems([userOf({ dependencyId: 3 })], [], HEAD);

		expect(own.canManage).toBe(true);
		expect(own.canManageTrainer).toBe(true);
	});

	test("nadie administra a alguien de rango superior", () => {
		const [superior] = toUserListItems(
			[userOf({ role: "SUPERADMIN", dependencyId: 3 })],
			[],
			{ ...HEAD, role: "DEPENDENCY_DEPUTY" },
		);

		expect(superior.canManage).toBe(false);
		expect(superior.canManageTrainer).toBe(false);
	});
});
