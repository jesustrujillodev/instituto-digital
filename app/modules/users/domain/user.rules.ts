import * as v from "valibot";
import { atoms } from "@/shared/rules/atoms.rules";
import {
	createListRule,
	SORT_DIRECTIONS,
	type SortDirection,
} from "@/shared/rules/list.rules";

const phone = v.pipe(v.string(), v.regex(/^\+?[\d\s-]{7,15}$/));

// Rol: picklist único compartido — se edita en shared/rules/atoms.rules.ts
const role = atoms.role;

/**
 * Espejo del enum `UserType` de Postgres.
 *
 * Interno = personal del Ayuntamiento, con número de empleado y dependencia.
 * Externo llega en PRD-02 con el capacitador externo; el valor existe ya para no
 * migrar el enum dos veces.
 */
export const USER_TYPES = ["INTERNAL", "EXTERNAL"] as const;
export type UserType = (typeof USER_TYPES)[number];

const employeeNumber = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1),
	v.maxLength(32),
);

const jobTitle = v.pipe(v.string(), v.trim(), v.maxLength(120));

/**
 * Identificador PÚBLICO de la dependencia destino.
 *
 * El formulario habla en `documentId` y nunca en la PK interna, igual que el
 * resto del sistema; la traducción a `dependencyId` es del servicio, que además
 * es quien comprueba que exista y esté activa.
 */
const dependencyDocumentId = v.pipe(v.string(), v.uuid());

export const userSchema = v.object({
	id: v.number(),
	documentId: v.string(),
	email: v.string(),
	firstName: v.nullable(v.string()),
	lastName: v.nullable(v.string()),
	password: v.nullable(v.string()),
	// Antes era `v.string()` laxo porque la fila trae texto libre. Ahora se valida
	// contra la tupla: el precio es que una fila con un rol desconocido deja de
	// mapearse —la migración las normaliza— y la ganancia es que `SafeUser["role"]`
	// ya es `Role`, lo que elimina los `as Role` de la UI.
	role,
	phone: v.nullable(v.string()),
	/** Interno o externo. Gobierna qué campos son obligatorios. */
	type: v.picklist(USER_TYPES),
	/** Obligatorio y único para internos; lo impone el CHECK de la base. */
	employeeNumber: v.nullable(v.string()),
	jobTitle: v.nullable(v.string()),
	photoUrl: v.nullable(v.string()),
	// Adscripción. Está en el esquema de persistencia —y por tanto en SafeUser—
	// porque el refresh relee al usuario por aquí para volver a firmar el claim:
	// si el mapper lo descartara, cada rotación emitiría un token sin dependencia.
	dependencyId: v.nullable(v.number()),
	/** Derivado de `trainer_profiles`, no es columna. Lo arma el mapper. */
	isTrainer: v.boolean(),
	// Soft-delete: null = activo, fecha = instante en que se archivó.
	archivedAt: v.nullable(v.date()),
	createdAt: v.date(),
	updatedAt: v.date(),
});

/** Filtro por perfil de capacitador. Llega del query string, de ahí el picklist. */
export const USER_TRAINER_FILTERS = ["yes", "no"] as const;
export type UserTrainerFilter = (typeof USER_TRAINER_FILTERS)[number];

/** Estados por los que se puede filtrar el listado. Sin valor ⇒ "active". */
export const USER_STATUSES = ["active", "archived", "all"] as const;
export type UserStatusFilter = (typeof USER_STATUSES)[number];

/**
 * Columnas por las que se puede ordenar el listado.
 *
 * Es una allowlist, no una sugerencia: el valor llega del query string y termina
 * en un `orderBy`, así que solo pueden pasar nombres de columna conocidos.
 */
export const USER_SORT_FIELDS = [
	"firstName",
	"lastName",
	"email",
	"phone",
	"employeeNumber",
	"role",
	"archivedAt",
	"createdAt",
] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

// Sentido de ordenación: contrato compartido de listados, no una regla de este
// dominio. Se re-exporta para no cambiar la superficie pública del módulo.
export { SORT_DIRECTIONS, type SortDirection };

export const safeUserSchema = v.omit(userSchema, ["password"]);

/**
 * Coherencia interno/externo, la misma que impone el CHECK
 * `users_type_coherence` de la base.
 *
 * Se declara aquí y no solo en la base para que el formulario marque el campo
 * exacto que falta: una violación del CHECK llega como un error de Postgres sin
 * código de dominio, y el usuario vería "ha ocurrido un error inesperado" en vez
 * de "falta el número de empleado".
 *
 * El superadministrador es el único interno exento de dependencia, porque su
 * alcance es global y no administra una unidad concreta.
 */
export const createUserRule = v.pipe(
	v.object({
		email: atoms.email,
		password: atoms.newPassword, // creación: aplica la política de contraseñas
		firstName: v.optional(v.pipe(v.string(), v.trim())),
		lastName: v.optional(v.pipe(v.string(), v.trim())),
		phone: v.optional(phone),
		role: v.optional(role),
		type: v.optional(v.picklist(USER_TYPES), "INTERNAL"),
		employeeNumber: v.optional(employeeNumber),
		jobTitle: v.optional(jobTitle),
		dependency: v.optional(dependencyDocumentId),
	}),
	v.forward(
		v.check(
			(input) => input.type !== "INTERNAL" || Boolean(input.employeeNumber),
			"El número de empleado es obligatorio para el personal interno",
		),
		["employeeNumber"],
	),
	v.forward(
		v.check(
			(input) =>
				input.type !== "INTERNAL" ||
				input.role === "SUPERADMIN" ||
				Boolean(input.dependency),
			"Elige la dependencia a la que pertenece",
		),
		["dependency"],
	),
	v.forward(
		v.check(
			(input) => input.type !== "EXTERNAL" || !input.employeeNumber,
			"Una cuenta externa no lleva número de empleado",
		),
		["employeeNumber"],
	),
	v.forward(
		v.check(
			(input) => input.type !== "EXTERNAL" || !input.dependency,
			"Una cuenta externa no pertenece a ninguna dependencia",
		),
		["dependency"],
	),
);

/**
 * La edición NO incluye la dependencia ni el tipo.
 *
 * La dependencia se cambia con `changeDependency`, que escribe la bitácora y
 * revoca los tokens: dejarla aquí permitiría moverla sin dejar rastro. El tipo se
 * fija al crear la cuenta, y mientras no existan externos (PRD-02) no hay a qué
 * cambiarlo; hacerlo exigiría vaciar dependencia y número de empleado a la vez
 * para no violar el CHECK.
 */
export const updateUserRule = v.partial(
	v.object({
		email: atoms.email,
		firstName: v.pipe(v.string(), v.trim()),
		lastName: v.pipe(v.string(), v.trim()),
		phone,
		role,
		employeeNumber,
		jobTitle,
	}),
);

export const changePasswordRule = v.pipe(
	v.object({
		currentPassword: v.string(),
		newPassword: atoms.newPassword, // cambio: aplica la política de contraseñas
		confirmPassword: v.string(),
	}),
	v.forward(
		v.partialCheck(
			[["newPassword"], ["confirmPassword"]],
			(input) => input.newPassword === input.confirmPassword,
			"Las contraseñas no coinciden",
		),
		["confirmPassword"],
	),
);

/**
 * Reseteo de contraseña ejecutado por quien administra OTRA cuenta.
 *
 * Deliberadamente NO pide `currentPassword`: quien administra no la conoce.
 * Es una regla distinta de `changePasswordRule` (autoservicio), no una variante
 * opcional de ella — mezclarlas dejaría la puerta abierta a cambiar la propia
 * contraseña sin demostrar que se conoce la anterior.
 *
 * Sin confirmación: quien administra ve lo que escribe (o lo genera) y tiene que
 * entregárselo a la persona, así que repetirla no protege de ningún error.
 */
export const adminResetPasswordRule = v.object({
	newPassword: atoms.newPassword,
});

export const findUserRule = v.object({
	documentId: v.pipe(v.string(), v.uuid()),
});

export const listUsersRule = createListRule({
	role: v.optional(role),
	/**
	 * Filtro por dependencia, con su identificador público.
	 *
	 * Es un filtro ADICIONAL al alcance, nunca una forma de ampliarlo: el alcance
	 * se aplica siempre y sale del claim, así que pedir otra dependencia por la URL
	 * no devuelve nada. Solo se ofrece en pantalla cuando el alcance es global,
	 * porque para el resto es redundante y engañoso.
	 */
	dependency: v.optional(dependencyDocumentId),
	type: v.optional(v.picklist(USER_TYPES)),
	trainer: v.optional(v.picklist(USER_TRAINER_FILTERS)),
	status: v.optional(v.picklist(USER_STATUSES)),
	sortBy: v.optional(v.picklist(USER_SORT_FIELDS)),
	sortDir: v.optional(v.picklist(SORT_DIRECTIONS)),
});
export const deleteUserRule = v.object({
	documentId: v.pipe(v.string(), v.uuid()),
});

/** Traslado de una cuenta: solo el destino, la cuenta movida sale de la URL. */
export const changeDependencyRule = v.object({
	dependency: dependencyDocumentId,
});

export const userRules = {
	create: createUserRule,
	update: updateUserRule,
	changePassword: changePasswordRule,
	adminResetPassword: adminResetPasswordRule,
	find: findUserRule,
	list: listUsersRule,
	delete: deleteUserRule,
	changeDependency: changeDependencyRule,
} as const;
