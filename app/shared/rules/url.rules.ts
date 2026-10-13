/**
 * Solo http(s). Un enlace que se pinta como `href` con `javascript:` o `data:`
 * es una inyección con fecha diferida, aunque React bloquee hoy `javascript:`.
 */
export const isHttpUrl = (value: string): boolean => {
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
};
