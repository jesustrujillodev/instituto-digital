import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { ROLES, type Role } from "@/shared/rules/atoms.rules";
import {
	canChangeRole,
	leavesNoActiveSuperadmin,
	roleLockOf,
} from "../user.role.rules";
import type { SafeUser } from "../user.types";

const actorOf = (
	role: Role,
	userId = 99,
): Pick<AuthContext, "userId" | "role"> => ({ userId, role });

/** El superadministrador es el único interno que puede no tener dependencia. */
const targetOf = (
	role: Role,
	id = 7,
	dependencyId: number | null = role === "SUPERADMIN" ? null : 1,
): Pick<SafeUser, "id" | "role" | "dependencyId"> => ({
	id,
	role,
	dependencyId,
});

describe("roleLockOf / canChangeRole", () => {
	// El formulario de edición siempre reenvía el rol actual, también el de un
	// titular, que nadie puede otorgar.
	test("conservar el rol no pide permiso, ni siquiera el propio o el de titular", () => {
		for (const actorRole of ROLES) {
			for (const role of ROLES) {
				expect(canChangeRole(actorOf(actorRole), targetOf(role), role)).toBe(
					true,
				);
				expect(
					canChangeRole(actorOf(actorRole), targetOf(role, 99), role),
				).toBe(true);
			}
		}
	});

	test("cambiarlo exige poder otorgar el nuevo", () => {
		const head = actorOf("DEPENDENCY_HEAD");

		expect(canChangeRole(head, targetOf("USER"), "DEPENDENCY_DEPUTY")).toBe(
			true,
		);
		expect(canChangeRole(head, targetOf("USER"), "SUPERADMIN")).toBe(false);
	});

	// Retirarla desde el formulario dejaría a la dependencia sin titular.
	test("nadie quita la titularidad, ni el superadministrador", () => {
		for (const actorRole of ROLES) {
			const actor = actorOf(actorRole);
			const target = targetOf("DEPENDENCY_HEAD");

			expect(roleLockOf(actor, target)).toBe("head");
			expect(canChangeRole(actor, target, "USER")).toBe(false);
		}
	});

	// Un superadministrador degradado no podría recuperar el rol, y podría ser el
	// último.
	test("el superadministrador no cambia su propio rol", () => {
		const actor = actorOf("SUPERADMIN");
		const self = targetOf("SUPERADMIN", 99);

		expect(roleLockOf(actor, self)).toBe("self");
		expect(canChangeRole(actor, self, "USER")).toBe(false);
	});

	test("el superadministrador sí cambia el de otro superadministrador con dependencia", () => {
		const actor = actorOf("SUPERADMIN");
		const other = targetOf("SUPERADMIN", 7, 3);

		expect(roleLockOf(actor, other)).toBeNull();
		expect(canChangeRole(actor, other, "USER")).toBe(true);
	});

	// Cualquier otro rol exige dependencia: el cambio chocaría contra el CHECK
	// `users_type_coherence` y llegaría como error inesperado.
	test("un superadministrador sin dependencia no baja a ningún otro rol", () => {
		const actor = actorOf("SUPERADMIN");
		const other = targetOf("SUPERADMIN");

		expect(roleLockOf(actor, other)).toBe("dependency");
		expect(canChangeRole(actor, other, "DEPENDENCY_DEPUTY")).toBe(false);
		expect(canChangeRole(actor, other, "USER")).toBe(false);
		expect(canChangeRole(actor, other, "SUPERADMIN")).toBe(true);
	});

	test("quitar un rol exige poder otorgarlo", () => {
		const actor = actorOf("DEPENDENCY_HEAD");
		const superadmin = targetOf("SUPERADMIN");

		expect(roleLockOf(actor, superadmin)).toBe("rank");
		expect(canChangeRole(actor, superadmin, "USER")).toBe(false);
	});
});

describe("leavesNoActiveSuperadmin", () => {
	test("sacar al único superadministrador activo lo deja sin ninguno", () => {
		expect(leavesNoActiveSuperadmin([7], 7)).toBe(true);
	});

	test("con otro activo, sacar a uno no deja al sistema sin ninguno", () => {
		expect(leavesNoActiveSuperadmin([7, 8], 7)).toBe(false);
	});

	// Degradar o archivar a quien no es superadministrador activo no toca el
	// conteo, aunque solo quede uno.
	test("una cuenta que no está entre los activos no cuenta", () => {
		expect(leavesNoActiveSuperadmin([8], 7)).toBe(false);
	});
});
