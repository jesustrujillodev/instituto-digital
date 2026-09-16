import type { AuthContext } from "@/modules/auth/domain/auth.types";

/**
 * Hasta dónde llega lo que una sesión puede ver y tocar.
 *
 * Es el vocabulario del aislamiento entre dependencias, y vive en `shared`
 * porque lo comparten `users` y `dependencies`. La traducción a un `where`
 * concreto NO vive aquí: depende de las columnas de cada tabla y es del módulo
 * que las conoce.
 *
 * `none` no es defensivo por gusto. Un titular cuya fila quedara sin dependencia
 * —una migración a medias, una escritura manual— tiene que traducirse a "no ve
 * nada" y jamás a un `where` vacío, que es lo que pasaría si el caso se dejara
 * fuera y alguien cayera en la rama por defecto.
 */
export type AccessScope =
	| { kind: "global" }
	| { kind: "dependency"; dependencyId: number }
	| { kind: "self"; userId: number }
	| { kind: "none" };

/**
 * El alcance que le corresponde a una sesión.
 *
 * Se deriva del rol y de la dependencia del claim, nunca de lo que pida la
 * petición: es la única forma de que añadir un filtro a la URL no pueda ampliar
 * lo que alguien alcanza.
 *
 * `ADMIN` conserva alcance global por compatibilidad con la plantilla, donde es
 * el rol que administra a todo el mundo. Ninguna cuenta del instituto lo usa.
 */
export const resolveScope = (
	auth: Pick<AuthContext, "userId" | "role" | "dependencyId">,
): AccessScope => {
	switch (auth.role) {
		case "SUPERADMIN":
		case "ADMIN":
			return { kind: "global" };

		case "DEPENDENCY_HEAD":
		case "DEPENDENCY_DEPUTY":
			return auth.dependencyId === null
				? { kind: "none" }
				: { kind: "dependency", dependencyId: auth.dependencyId };

		case "USER":
			return { kind: "self", userId: auth.userId };

		default: {
			// Un rol nuevo en la tupla rompe aquí en compilación. Es deliberado:
			// decidir su alcance es parte de añadirlo, y el olvido no puede
			// resolverse en silencio a "global".
			const exhaustive: never = auth.role;
			return exhaustive;
		}
	}
};
