import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	adminResetPasswordRule,
	changePasswordRule,
	createUserRule,
	deleteUserRule,
	findUserRule,
	listUsersRule,
	safeUserSchema,
	USER_SORT_FIELDS,
	USER_STATUSES,
	updateUserRule,
	userRules,
	userSchema,
} from "../user.rules";

describe("adminResetPasswordRule", () => {
	test("acepta una contraseña que cumple la política", () => {
		const result = v.safeParse(adminResetPasswordRule, {
			newPassword: "Password123!",
		});

		expect(result.success).toBe(true);
	});

	test("rechaza una contraseña por debajo del mínimo de la política", () => {
		const result = v.safeParse(adminResetPasswordRule, {
			newPassword: "corta",
		});

		expect(result.success).toBe(false);
	});

	test("no exige confirmación ni currentPassword", () => {
		// La diferencia con changePasswordRule es intencional: el admin no conoce
		// la contraseña anterior y ve (o genera) la nueva antes de entregarla.
		const result = v.safeParse(adminResetPasswordRule, {
			newPassword: "Password123!",
		});

		expect(result.success).toBe(true);
	});
});

describe("listUsersRule", () => {
	test("acepta un listado sin filtros", () => {
		expect(v.safeParse(listUsersRule, {}).success).toBe(true);
	});

	test("acepta los tres estados soportados", () => {
		for (const status of ["active", "archived", "all"]) {
			expect(v.safeParse(listUsersRule, { status }).success).toBe(true);
		}
	});

	test("rechaza un estado desconocido", () => {
		expect(v.safeParse(listUsersRule, { status: "borrados" }).success).toBe(
			false,
		);
	});

	test("rechaza un rol fuera de la tupla ROLES", () => {
		expect(v.safeParse(listUsersRule, { role: "OWNER" }).success).toBe(false);
	});

	test("rechaza un pageSize por encima del tope compartido", () => {
		expect(v.safeParse(listUsersRule, { pageSize: 500 }).success).toBe(false);
	});
});

describe("userSchema / safeUserSchema", () => {
	const raw = {
		id: 7,
		documentId: "11111111-1111-4111-8111-111111111111",
		email: "ana@empresa.com",
		firstName: "Ana",
		lastName: "Ruiz",
		password: "$2a$12$hash",
		role: "USER",
		phone: null,
		photoUrl: null,
		type: "INTERNAL",
		employeeNumber: "EMP-0007",
		jobTitle: null,
		dependencyId: 3,
		isTrainer: false,
		archivedAt: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
	};

	test("userSchema acepta la fila completa, con contraseña", () => {
		expect(v.safeParse(userSchema, raw).success).toBe(true);
	});

	// safeUserSchema es userSchema OMITIENDO password: es lo que garantiza que un
	// usuario de dominio nunca arrastre el hash hasta la respuesta.
	test("safeUserSchema no declara el campo password", () => {
		const { password: _, ...safe } = raw;

		const result = v.safeParse(safeUserSchema, safe);

		expect(result.success).toBe(true);
		expect(result.success && "password" in result.output).toBe(false);
	});

	test("safeUserSchema descarta la contraseña si se la pasan igualmente", () => {
		const result = v.safeParse(safeUserSchema, raw);

		expect(result.success && "password" in result.output).toBe(false);
	});

	// Soft-delete: null = activa, fecha = instante en que se archivó.
	test("archivedAt admite null y una fecha", () => {
		const { password: _, ...safe } = raw;

		expect(v.safeParse(safeUserSchema, safe).success).toBe(true);
		expect(
			v.safeParse(safeUserSchema, { ...safe, archivedAt: new Date() }).success,
		).toBe(true);
	});
});

describe("createUserRule", () => {
	// El alta mínima ya no es correo y contraseña: una cuenta interna sin número de
	// empleado y sin dependencia violaría el CHECK de la base, así que la regla lo
	// exige antes de llegar allí.
	const valid = {
		email: "ana@empresa.com",
		password: "contrasena1",
		employeeNumber: "EMP-0007",
		dependency: "33333333-3333-4333-8333-333333333333",
	};

	test("acepta el alta mínima de una cuenta interna", () => {
		expect(v.safeParse(createUserRule, valid).success).toBe(true);
	});

	// La misma coherencia que impone el CHECK users_type_coherence, declarada aquí
	// para que el formulario marque el campo exacto que falta en vez de mostrar un
	// error de Postgres sin código de dominio.
	test("un interno sin número de empleado falla en SU campo", () => {
		const { employeeNumber: _, ...sinNumero } = valid;
		const result = v.safeParse(createUserRule, sinNumero);

		expect(result.success).toBe(false);
		expect(result.issues?.[0]?.path?.at(-1)?.key).toBe("employeeNumber");
	});

	test("un interno sin dependencia falla en SU campo", () => {
		const { dependency: _, ...sinDependencia } = valid;
		const result = v.safeParse(createUserRule, sinDependencia);

		expect(result.success).toBe(false);
		expect(result.issues?.[0]?.path?.at(-1)?.key).toBe("dependency");
	});

	// El superadministrador es el único interno exento: su alcance es global y no
	// administra una unidad concreta.
	test("el superadministrador no necesita dependencia", () => {
		const { dependency: _, ...sinDependencia } = valid;

		expect(
			v.safeParse(createUserRule, { ...sinDependencia, role: "SUPERADMIN" })
				.success,
		).toBe(true);
	});

	test("una cuenta externa no lleva número de empleado ni dependencia", () => {
		expect(
			v.safeParse(createUserRule, {
				email: "externo@proveedor.com",
				password: "contrasena1",
				type: "EXTERNAL",
			}).success,
		).toBe(true);

		expect(
			v.safeParse(createUserRule, { ...valid, type: "EXTERNAL" }).success,
		).toBe(false);
	});

	// Sin declararlo, el tipo llega undefined al servicio y la coherencia se
	// evaluaría contra un valor que la base sí tiene por defecto.
	test("el tipo por defecto es interno", () => {
		const result = v.safeParse(createUserRule, valid);

		expect(result.success && result.output.type).toBe("INTERNAL");
	});

	// En el ALTA sí aplica la política completa, a diferencia del login.
	test("aplica la política de contraseñas", () => {
		expect(
			v.safeParse(createUserRule, { ...valid, password: "corta" }).success,
		).toBe(false);
	});

	test("recorta los nombres al parsear", () => {
		const result = v.safeParse(createUserRule, {
			...valid,
			firstName: "  Ana  ",
			lastName: "  Ruiz  ",
		});

		expect(result.success && result.output.firstName).toBe("Ana");
		expect(result.success && result.output.lastName).toBe("Ruiz");
	});

	test("normaliza el correo a minúsculas", () => {
		const result = v.safeParse(createUserRule, {
			...valid,
			email: "Ana@Empresa.COM",
		});

		expect(result.success && result.output.email).toBe("ana@empresa.com");
	});

	test("el rol es opcional y solo admite los de la tupla", () => {
		expect(v.safeParse(createUserRule, valid).success).toBe(true);
		expect(
			v.safeParse(createUserRule, { ...valid, role: "DEPENDENCY_DEPUTY" })
				.success,
		).toBe(true);
		expect(
			v.safeParse(createUserRule, { ...valid, role: "OWNER" }).success,
		).toBe(false);
	});

	test("valida el formato del teléfono", () => {
		expect(
			v.safeParse(createUserRule, { ...valid, phone: "+34 600 123 456" })
				.success,
		).toBe(true);
		expect(
			v.safeParse(createUserRule, { ...valid, phone: "123" }).success,
		).toBe(false);
		expect(
			v.safeParse(createUserRule, { ...valid, phone: "no-es-un-telefono" })
				.success,
		).toBe(false);
	});

	test("rechaza un alta sin correo o sin contraseña", () => {
		expect(
			v.safeParse(createUserRule, { email: "ana@empresa.com" }).success,
		).toBe(false);
		expect(
			v.safeParse(createUserRule, { password: "contrasena1" }).success,
		).toBe(false);
	});
});

describe("updateUserRule", () => {
	// Es `v.partial`: una edición manda solo lo que cambia, y un objeto vacío es
	// una petición válida (no cambia nada) en vez de un error de validación.
	test("acepta un objeto vacío y cualquier subconjunto", () => {
		expect(v.safeParse(updateUserRule, {}).success).toBe(true);
		expect(v.safeParse(updateUserRule, { firstName: "Ana" }).success).toBe(
			true,
		);
		expect(
			v.safeParse(updateUserRule, { role: "DEPENDENCY_DEPUTY" }).success,
		).toBe(true);
	});

	// NO incluye password: cambiar la contraseña es otra regla, con su propia
	// exigencia de confirmación.
	test("no admite la contraseña como campo editable", () => {
		const result = v.safeParse(updateUserRule, { password: "contrasena1" });

		expect(result.success && "password" in result.output).toBe(false);
	});

	test("sigue validando el formato de lo que sí manda", () => {
		expect(v.safeParse(updateUserRule, { email: "ana" }).success).toBe(false);
		expect(v.safeParse(updateUserRule, { phone: "123" }).success).toBe(false);
		expect(v.safeParse(updateUserRule, { role: "OWNER" }).success).toBe(false);
	});
});

describe("changePasswordRule", () => {
	const valid = {
		currentPassword: "anterior1",
		newPassword: "contrasena1",
		confirmPassword: "contrasena1",
	};

	test("acepta un cambio bien formado", () => {
		expect(v.safeParse(changePasswordRule, valid).success).toBe(true);
	});

	// Autoservicio: exige demostrar que se conoce la anterior. Es justo lo que la
	// regla del reseteo administrativo no pide, y por eso son dos reglas y no una
	// con un opcional.
	test("exige la contraseña actual", () => {
		const { currentPassword: _, ...sinActual } = valid;

		expect(v.safeParse(changePasswordRule, sinActual).success).toBe(false);
	});

	test("rechaza contraseñas que no coinciden y señala la confirmación", () => {
		const result = v.safeParse(changePasswordRule, {
			...valid,
			confirmPassword: "otra-cosa1",
		});

		expect(result.success).toBe(false);
		expect(result.issues?.[0].path?.at(-1)?.key).toBe("confirmPassword");
	});

	test("aplica la política sobre la contraseña nueva", () => {
		expect(
			v.safeParse(changePasswordRule, {
				...valid,
				newPassword: "corta",
				confirmPassword: "corta",
			}).success,
		).toBe(false);
	});

	// La actual NO se valida contra la política: puede ser antigua y no cumplirla,
	// y exigírselo impediría cambiarla, que es justo lo contrario de lo buscado.
	test("no aplica la política sobre la contraseña actual", () => {
		expect(
			v.safeParse(changePasswordRule, { ...valid, currentPassword: "x" })
				.success,
		).toBe(true);
	});
});

describe("findUserRule / deleteUserRule", () => {
	const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

	test("aceptan un uuid", () => {
		expect(v.safeParse(findUserRule, { documentId: DOCUMENT_ID }).success).toBe(
			true,
		);
		expect(
			v.safeParse(deleteUserRule, { documentId: DOCUMENT_ID }).success,
		).toBe(true);
	});

	// El id llega de la URL y acaba en un `where`: sin el uuid, el repositorio
	// recibiría lo que se escriba en la barra de direcciones.
	test("rechazan cualquier cosa que no sea un uuid", () => {
		expect(v.safeParse(findUserRule, { documentId: "1" }).success).toBe(false);
		expect(
			v.safeParse(deleteUserRule, { documentId: "../admin" }).success,
		).toBe(false);
		expect(v.safeParse(findUserRule, { documentId: "" }).success).toBe(false);
	});
});

describe("USER_STATUSES / USER_SORT_FIELDS", () => {
	test("los estados son los tres soportados", () => {
		expect(USER_STATUSES).toEqual(["active", "archived", "all"]);
	});

	// Allowlist, no sugerencia: el valor llega del query string y termina en un
	// `orderBy`, así que solo pueden pasar nombres de columna conocidos.
	test("las columnas ordenables no incluyen ninguna sensible", () => {
		expect(USER_SORT_FIELDS).not.toContain("password");
		expect(USER_SORT_FIELDS).not.toContain("id");

		for (const sortBy of USER_SORT_FIELDS) {
			expect(v.safeParse(listUsersRule, { sortBy }).success).toBe(true);
		}
	});
});

describe("userRules", () => {
	test("expone las ocho reglas del módulo", () => {
		expect(Object.keys(userRules).sort()).toEqual([
			"adminResetPassword",
			"changeDependency",
			"changePassword",
			"create",
			"delete",
			"find",
			"list",
			"update",
		]);
	});
});
