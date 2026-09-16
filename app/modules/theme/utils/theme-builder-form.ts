import type { AppResponse } from "@/shared/response/response.types";

/** Nombre del campo que transporta la intención de la mutación. */
export const INTENT_FIELD = "intent";

/**
 * Campo que transporta el juego de tokens completo, serializado como JSON.
 *
 * Un `<input>` por token serían más de setenta campos, y el action tendría que
 * recomponer el objeto adivinando la forma a partir de los nombres. Con un solo
 * campo, la frontera valida contra el MISMO esquema que el resto del módulo.
 */
export const TOKENS_FIELD = "tokens";

/**
 * Intenciones que acepta el action del builder.
 *
 * Viajan como un dato más del envío y no como estado mutado antes de enviar:
 * así el comportamiento no depende del orden de los efectos y dos clics
 * seguidos no pueden cruzarse.
 */
export const THEME_INTENTS = {
	create: "create",
	clone: "clone",
	rename: "rename",
	saveDraft: "save-draft",
	importCss: "import-css",
	publish: "publish",
	activate: "activate",
	discard: "discard",
	delete: "delete",
	startPreview: "start-preview",
	stopPreview: "stop-preview",
} as const;

export type ThemeIntent = (typeof THEME_INTENTS)[keyof typeof THEME_INTENTS];

/**
 * Lo único que una intención necesita devolver de vuelta.
 *
 * `create` es la excepción a "la pantalla revalida en lugar de leer el
 * resultado": el tema nace en el servidor y su `documentId` no existe en
 * ninguna otra parte, así que sin esto el cliente no puede abrir lo que acaba
 * de crear — tendría que adivinarlo diffando la biblioteca antes y después.
 */
export interface ThemeCreated {
	createdDocumentId: string;
}

/**
 * Respuesta común de todas las intenciones: el envelope estándar, con dato de
 * vuelta solo donde hace falta.
 *
 * Que las once compartan un tipo es lo que permite que el toast y la barra de
 * estado no tengan que ramificar por intención.
 */
export type ThemeBuilderActionData = AppResponse<ThemeCreated | null>;
