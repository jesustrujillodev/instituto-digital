/**
 * Escapa texto para interpolarlo en HTML, en contenido o en un atributo entre
 * comillas.
 *
 * Es la única defensa de las plantillas que arman HTML concatenando cadenas
 * (correos, certificados): todo dato que venga de una persona pasa por aquí.
 */
export const escapeHtml = (value: string): string =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
