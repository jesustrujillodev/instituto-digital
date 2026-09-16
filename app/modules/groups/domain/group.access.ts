import type { AccessScope } from "@/shared/auth/scope.rules";
import type { Role } from "@/shared/rules/atoms.rules";

/**
 * Quién ENTRA a la pantalla de grupos.
 *
 * Incluye al superadministrador aunque la matriz de §3 no le dé su
 * administración: crea cursos en cualquier dependencia y consulta los grupos
 * para elegir su audiencia. Lo que no puede es escribir, y eso lo
 * corta `requireDependencyScope`.
 */
export const GROUP_ACCESS_ROLES: readonly Role[] = [
	"SUPERADMIN",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];

/**
 * Quién los CREA y los administra.
 *
 * Se declara para documentar la intención; la comprobación efectiva no es por
 * rol sino por alcance —solo quien tiene uno de dependencia puede escribir—,
 * porque un grupo pertenece forzosamente a una.
 */
export const GROUP_MANAGER_ROLES: readonly Role[] = [
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];

/** Fragmento de `where` que restringe una LECTURA de grupos al alcance. */
export type GroupScopeWhere = {
	id?: { in: number[] };
	dependencyId?: number;
};

/**
 * Traducción del alcance a un filtro.
 *
 * El `switch` es exhaustivo con comprobación `never`: una variante nueva de
 * `AccessScope` rompe en compilación en vez de caer en una rama por defecto que
 * devolvería `{}` —es decir, acceso a todo—.
 *
 * `self` cae en el predicado imposible igual que `none`: un participante no
 * tiene grupos propios, no es que los vea todos.
 */
export const groupScopeWhere = (scope: AccessScope): GroupScopeWhere => {
	switch (scope.kind) {
		case "global":
			return {};
		case "dependency":
			return { dependencyId: scope.dependencyId };
		case "self":
		case "none":
			// `IN ()` no puede casar con ninguna fila.
			return { id: { in: [] } };
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

/**
 * Lo mismo para una ESCRITURA: solo igualdades.
 *
 * Existe aparte porque el `where` de un `update` de Prisma exige igualdad sobre
 * la clave única y no admite un predicado como `IN ()`. Intentar reutilizar el
 * filtro de lectura no compila, que es exactamente lo que debe pasar.
 *
 * Devuelve `null` cuando el alcance no alcanza nada: quien escribe corta ANTES
 * de llegar a la base, y el tipo `| null` lo obliga a hacerlo. Lo que no puede
 * pasar es que se convierta en `{}`, que sería "alcanza todo".
 */
export type GroupScopeWriteWhere = { dependencyId?: number };

export const groupScopeWriteWhere = (
	scope: AccessScope,
): GroupScopeWriteWhere | null => {
	switch (scope.kind) {
		case "global":
			return {};
		case "dependency":
			return { dependencyId: scope.dependencyId };
		case "self":
		case "none":
			return null;
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

/**
 * ¿Este alcance puede escribir grupos?
 *
 * Solo el de dependencia. Un grupo pertenece a una unidad concreta, así que un
 * alcance global no sabría a cuál asignarlo y uno propio no administra nada.
 */
export const canManageGroups = (scope: AccessScope): scope is DependencyScope =>
	scope.kind === "dependency";

type DependencyScope = Extract<AccessScope, { kind: "dependency" }>;
