import type { CertificateRenderData } from "../certificate.types";

/**
 * Campos dinámicos que un texto puede llevar entre llaves. Cada uno sale de un
 * campo de `CertificateRenderData`, así que el `dataSnapshot` de una emisión
 * alcanza para resolverlos todos.
 */
export const DESIGN_TOKENS = {
	participante: "recipientName",
	capacitacion: "courseTitle",
	descripcion: "courseDescription",
	dependencia: "dependencyName",
	horas: "hours",
	fecha: "issuedOn",
	folio: "folio",
} as const satisfies Record<string, keyof CertificateRenderData>;

export type DesignToken = keyof typeof DESIGN_TOKENS;

export const DESIGN_TOKEN_LABELS: Record<DesignToken, string> = {
	participante: "Nombre del participante",
	capacitacion: "Nombre de la capacitación",
	descripcion: "Descripción de la capacitación",
	dependencia: "Dependencia",
	horas: "Duración",
	fecha: "Fecha de emisión",
	folio: "Folio",
};

const TOKEN_PATTERN = /\{([a-z]+)\}/g;

const isToken = (name: string): name is DesignToken =>
	Object.hasOwn(DESIGN_TOKENS, name);

/** Las palabras entre llaves que no son un campo conocido. */
export const unknownTokensOf = (content: string): string[] =>
	[...content.matchAll(TOKEN_PATTERN)]
		.map(([, name]) => name)
		.filter((name) => !isToken(name));

/**
 * Un texto escrito antes del editor libre, con sus llaves desarmadas: `{x}` que
 * no sea un campo pasa a `(x)`, para que no invalide el diseño.
 */
export const literalText = (content: string): string =>
	content.replace(TOKEN_PATTERN, (match, name: string) =>
		isToken(name) ? match : `(${name})`,
	);

export const tokensOf = (content: string): DesignToken[] =>
	[...content.matchAll(TOKEN_PATTERN)].map(([, name]) => name).filter(isToken);

/**
 * El texto con sus campos resueltos, o null si alguno no tiene valor (un curso
 * sin horas): el elemento entero se omite, como la línea de duración del v1.
 *
 * Una sola pasada: un valor que a su vez contenga `{folio}` no se vuelve a
 * sustituir. El resultado es texto plano; quien lo pinta lo escapa.
 */
export const resolveTokens = (
	content: string,
	data: CertificateRenderData,
): string | null => {
	let missing = false;
	const resolved = content.replace(TOKEN_PATTERN, (match, name: string) => {
		if (!isToken(name)) return match;
		const value = data[DESIGN_TOKENS[name]];
		if (value === null || value === undefined || value === "") {
			missing = true;
			return "";
		}
		return value;
	});
	return missing ? null : resolved;
};
