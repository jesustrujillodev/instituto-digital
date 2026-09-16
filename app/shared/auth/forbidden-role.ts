import { data } from "react-router";
import {
	FORBIDDEN_ROLE_CODE,
	type ForbiddenRoleData,
	HTTP_STATUS,
} from "@/shared/http/route-error";
import type { Role } from "@/shared/rules/atoms.rules";

/**
 * El 403 de autorización, en un solo sitio.
 *
 * Vivía dentro de `requireRole`, que bastaba mientras entrar a una pantalla
 * dependiera solo del rol. El catálogo de capacitadores admite además a
 * cualquiera con perfil activo, así que hay un guard que no puede delegar en
 * `requireRole` y sí tiene que responder exactamente lo mismo: dos `data()`
 * escritos aparte divergirían y `isForbiddenRoleError` solo reconocería uno.
 *
 * `statusText` explícito: al convertir un `data()` lanzado en ErrorResponse,
 * react-router usa "Internal Server Error" por defecto.
 */
export const forbiddenRole = (roles: readonly Role[]) =>
	data<ForbiddenRoleData>(
		{ code: FORBIDDEN_ROLE_CODE, requiredRoles: roles },
		{ status: HTTP_STATUS.FORBIDDEN, statusText: "Forbidden" },
	);
