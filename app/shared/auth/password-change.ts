/** Donde se cambia la propia contraseña («Mi perfil»). */
export const PASSWORD_CHANGE_PATH = "/dashboard/perfil";

/** Lo único que usa quien debe cambiar la contraseña que le puso otra persona. */
const ALLOWED_PATHS = [
	PASSWORD_CHANGE_PATH,
	"/cerrar-sesion",
	"/cerrar-sesiones",
	// La foto del perfil y del menú se sirven por el proxy.
	"/api/storage",
];

/**
 * ¿Puede entrar aquí quien aún debe cambiar su contraseña? Las peticiones de
 * datos de React Router llegan como `<ruta>.data`.
 */
export const allowsPendingPasswordChange = (pathname: string): boolean => {
	const path = pathname.replace(/\.data$/, "").replace(/\/+$/, "") || "/";
	return ALLOWED_PATHS.includes(path);
};
