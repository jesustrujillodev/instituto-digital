/** Rutas cuyo segmento final es una credencial: el QR de asistencia y el de inscripción. */
const TOKEN_ROUTES = /^\/(asistencia|inscripcion)\/[^/]+?(\.data)?$/;

/**
 * La URL tal como puede quedar en el log de acceso: sin la consulta (`?key=`,
 * `?redirectTo=` con el token del QR) y sin el token de las rutas de QR. El
 * log lo lee cualquiera con acceso a la plataforma; la credencial no.
 */
export const redactAccessUrl = (url: string): string => {
	const queryAt = url.indexOf("?");
	const path = queryAt === -1 ? url : url.slice(0, queryAt);
	const redacted = path.replace(TOKEN_ROUTES, "/$1/:token$2");
	return queryAt === -1 ? redacted : `${redacted}?…`;
};

export interface AccessEntry {
	method: string;
	url: string;
	status: number;
	contentLength: string | undefined;
	ms: number;
}

/** El formato `tiny` de morgan, con la URL ya sin credenciales. */
export const formatAccessLine = (entry: AccessEntry): string =>
	`${entry.method} ${redactAccessUrl(entry.url)} ${entry.status} ${entry.contentLength ?? "-"} - ${entry.ms.toFixed(3)} ms`;
