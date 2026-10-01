/**
 * Abrir una lección registra `IN_PROGRESS` y no cambia nada de lo que la
 * lección pinta: volver a cargarla solo re-firmaría las URL del material y el
 * reproductor recargaría su fuente. El índice del aula sí se entera, porque su
 * loader es otro. Un fallo recarga, para enseñar el estado real.
 */
export const shouldRevalidateLesson = ({
	formData,
	actionResult,
	defaultShouldRevalidate,
}: {
	formData?: FormData;
	actionResult?: unknown;
	defaultShouldRevalidate: boolean;
}): boolean => {
	const opened =
		formData?.get("status") === "IN_PROGRESS" &&
		(actionResult as { success?: unknown } | undefined)?.success === true;

	return opened ? false : defaultShouldRevalidate;
};
