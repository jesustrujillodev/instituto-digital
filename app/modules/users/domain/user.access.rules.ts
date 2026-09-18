import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { type AccessScope, resolveScope } from "@/shared/auth/scope.rules";
import { ROLES, type Role } from "@/shared/rules/atoms.rules";
import type { SafeUser } from "./user.types";

/**
 * Jerarquía real de gestión de cuentas.
 *
 * Vive en `modules/users/domain` y no en `shared/rules/atoms.rules.ts` porque el
 * JSDoc de `hasRole` lo pide explícitamente: nombrar roles concretos en código
 * compartido rompe el contrato de "editar solo esa tupla". Y va en su propio
 * archivo, aparte de `user.rules.ts`, por el límite de 300 líneas de
 * `docs/reglas.md` §21.
 *
 * Todo lo de aquí es PURO: se prueba sin base de datos y sin contenedor.
 */

/**
 * Rango relativo, solo para comparar. No se persiste ni viaja en ningún claim:
 * un número en la base sería un segundo vocabulario de roles que mantener.
 */
const RANK: Record<Role, number> = {
	USER: 0,
	DEPENDENCY_DEPUTY: 1,
	DEPENDENCY_HEAD: 2,
	SUPERADMIN: 3,
};

/**
 * Qué roles puede otorgar cada rol.
 *
 * `DEPENDENCY_HEAD` no aparece en ninguna lista a propósito, ni siquiera en la
 * del superadministrador: la titularidad se designa desde la pantalla de la
 * dependencia, que la aplica en una transacción —degrada al anterior y promueve
 * al nuevo— y revoca los tokens de ambos. Otorgarla desde el formulario de
 * usuario se saltaría ese relevo y chocaría contra el índice único parcial.
 *
 * Cada lista va en el orden de `ROLES`, de mayor a menor: el selector del
 * formulario la pinta tal cual.
 */
const ASSIGNABLE_ROLES: Record<Role, readonly Role[]> = {
	SUPERADMIN: ["SUPERADMIN", "DEPENDENCY_DEPUTY", "USER"],
	DEPENDENCY_HEAD: ["DEPENDENCY_DEPUTY", "USER"],
	DEPENDENCY_DEPUTY: ["USER"],
	USER: [],
};

/** Quién entra a la pantalla de gestión de cuentas; el alcance la recorta. */
export const USER_MANAGER_ROLES: readonly Role[] = [
	"SUPERADMIN",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];

/**
 * Fragmento de `where` que restringe una LECTURA de usuarios al alcance.
 *
 * Es un objeto plano, sin tipos del ORM: el repositorio lo funde con sus filtros
 * y Prisma lo interpreta. Así la regla se prueba sin base de datos.
 */
export type UserScopeWhere = {
	id?: number | { in: number[] };
	dependencyId?: number;
};

/**
 * Lo mismo para una ESCRITURA: solo igualdades.
 *
 * Existe aparte porque el `where` de un `update` de Prisma exige igualdad sobre
 * la clave única y no admite un predicado como `IN ()`. Intentar reutilizar el
 * filtro de lectura no compila, que es exactamente lo que debe pasar.
 */
export type UserScopeWriteWhere = {
	id?: number;
	dependencyId?: number;
};

/**
 * Traducción del alcance a un filtro.
 *
 * El `switch` es exhaustivo con comprobación `never`: una variante nueva de
 * `AccessScope` rompe en compilación en vez de caer en una rama por defecto que
 * devolvería `{}` —es decir, acceso a todo—.
 *
 * `none` devuelve un predicado imposible y no `{}`. La diferencia es el aislamiento
 * entero: `{}` no filtra nada.
 */
export const scopeWhere = (scope: AccessScope): UserScopeWhere => {
	switch (scope.kind) {
		case "global":
			return {};
		case "dependency":
			return { dependencyId: scope.dependencyId };
		case "self":
			return { id: scope.userId };
		case "none":
			// `IN ()` no puede casar con ninguna fila. Se prefiere a un id centinela
			// como -1, que solo funciona mientras nadie cambie la secuencia de la PK.
			return { id: { in: [] } };
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

/**
 * Alcance → filtro de escritura, o `null` cuando el alcance no alcanza nada.
 *
 * Devuelve `null` en vez de un predicado imposible porque no hay ninguno que
 * Prisma acepte junto a una clave única. Quien escribe tiene que cortar ANTES de
 * llegar a la base, con el mismo error que daría una fila fuera de alcance — y el
 * tipo `| null` lo obliga a hacerlo.
 *
 * Lo que no puede pasar es que `none` se convierta en `{}`: eso convertiría "no
 * alcanza nada" en "alcanza todo".
 */
export const scopeWriteWhere = (
	scope: AccessScope,
): UserScopeWriteWhere | null => {
	switch (scope.kind) {
		case "global":
			return {};
		case "dependency":
			return { dependencyId: scope.dependencyId };
		case "self":
			return { id: scope.userId };
		case "none":
			return null;
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

/** Los roles que este actor puede otorgar, para acotar el selector del formulario. */
export const assignableRoles = (actorRole: Role): readonly Role[] =>
	ASSIGNABLE_ROLES[actorRole];

/**
 * ¿Puede este actor otorgar este rol?
 *
 * Se comprueba en el servidor y no solo al pintar el `Select`: ocultar una opción
 * no es una regla de negocio, y el formulario se puede enviar a mano.
 */
export const canAssignRole = (actorRole: Role, targetRole: Role): boolean =>
	ASSIGNABLE_ROLES[actorRole].includes(targetRole);

/** ¿Administra auxiliares? Se deriva de lo que puede otorgar, no se repite. */
export const canManageDeputies = (actorRole: Role): boolean =>
	canAssignRole(actorRole, "DEPENDENCY_DEPUTY");

/**
 * ¿Puede este actor administrar esta cuenta?
 *
 * Dos condiciones independientes, y las dos tienen que cumplirse: nadie edita a
 * alguien de rango superior al suyo (regla 10), y nadie sale de su alcance.
 *
 * El rango se comprueba ANTES del alcance porque es la condición que no depende
 * de datos de la fila: un titular no puede editar al superadministrador ni
 * estando ambos en la misma dependencia.
 */
export const canManageUser = (
	actor: Pick<AuthContext, "userId" | "role" | "dependencyId">,
	target: Pick<SafeUser, "id" | "role" | "dependencyId">,
): boolean => {
	if (RANK[target.role] > RANK[actor.role]) return false;

	const scope = resolveScope(actor);

	switch (scope.kind) {
		case "global":
			return true;
		case "dependency":
			return target.dependencyId === scope.dependencyId;
		case "self":
			return target.id === scope.userId;
		case "none":
			return false;
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

/**
 * ¿Puede este actor mover esta cuenta a otra dependencia?
 *
 * Nadie se cambia a sí mismo: la adscripción la decide quien administra. El
 * superadministrador mueve a cualquiera; el titular y el auxiliar, solo a los
 * participantes de su propia dependencia, hacia cualquier otra.
 *
 * Un externo queda fuera por su tipo: no pertenece a ninguna dependencia y el
 * CHECK `users_type_coherence` le prohíbe tener una.
 *
 * No excluye al titular movido: esa es la regla 6, un estado de la cuenta y no
 * un permiso del actor, y el servicio la responde con su propio error.
 */
export const canChangeUserDependency = (
	actor: Pick<AuthContext, "userId" | "role" | "dependencyId">,
	target: Pick<SafeUser, "id" | "role" | "dependencyId" | "type">,
): boolean => {
	if (target.type !== "INTERNAL" || target.id === actor.userId) return false;

	switch (actor.role) {
		case "SUPERADMIN":
			return true;
		case "DEPENDENCY_HEAD":
		case "DEPENDENCY_DEPUTY":
			return (
				target.role === "USER" &&
				actor.dependencyId !== null &&
				target.dependencyId === actor.dependencyId
			);
		default:
			return false;
	}
};

/**
 * Rol que le queda a quien cambia de dependencia.
 *
 * Auxiliar y titular son cargos DE una dependencia, no atributos de la persona:
 * al salir se pierden. Las inscripciones, los créditos y el historial se
 * conservan, que es lo que la regla 7 separa.
 *
 * El titular está bloqueado aguas arriba por el servicio (regla 6); se degrada
 * aquí igualmente porque un titular arrastrado a otra dependencia es un estado
 * peor que una degradación inesperada.
 */
export const roleAfterDependencyChange = (currentRole: Role): Role =>
	currentRole === "DEPENDENCY_DEPUTY" || currentRole === "DEPENDENCY_HEAD"
		? "USER"
		: currentRole;

/** Todos los roles conocidos tienen rango declarado. Lo verifica su prueba. */
export const RANKED_ROLES: readonly Role[] = ROLES;
