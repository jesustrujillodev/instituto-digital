import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Gestión de usuarios, con alcance por dependencia impuesto en cada loader y
 * action, más el perfil propio, que solo exige sesión.
 */
export const usersRoutes = [
	route("perfil", "modules/users/routes/perfil/index.tsx"),
	route("usuarios", "modules/users/routes/usuarios/index.tsx"),
	route("usuarios/nuevo", "modules/users/routes/usuarios/nuevo/index.tsx"),
	route(
		"usuarios/:documentId/editar",
		"modules/users/routes/usuarios/$documentId.editar/index.tsx",
	),
] satisfies RouteConfigEntry[];
