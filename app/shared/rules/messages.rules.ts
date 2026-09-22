import * as v from "valibot";

/**
 * Traduce al español el mensaje por defecto de valibot.
 *
 * Es una RED DE SEGURIDAD, no el mecanismo principal: la redacción buena —la
 * que nombra el campo— vive en el segundo argumento de cada acción, dentro del
 * `<modulo>.rules.ts` que la declara, y siempre gana sobre lo de aquí
 * (`_addIssue` consulta `context.message` antes que el mensaje específico).
 *
 * Lo que este archivo garantiza es que un esquema nuevo, o un campo al que se
 * le olvidó el mensaje, nunca enseñe "Invalid length: Expected >=3 but
 * received 0" a un usuario.
 *
 * Se registra sin `lang` a propósito: `issue.lang` es `undefined` mientras
 * nadie llame a `setGlobalConfig({ lang })`, y ese es el caso del proyecto —la
 * plataforma es monolingüe. Añadir un idioma sería registrar un segundo juego
 * con su etiqueta, sin tocar estos mensajes.
 *
 * El import es un efecto de carga y vive en `app/root.tsx`, el único módulo
 * que ambos bundles evalúan antes de cualquier loader, action o render.
 */

const REQUIRED = "Este dato es obligatorio.";

/** Un dato ausente es "falta" y no "tipo incorrecto", aunque valibot los mezcle. */
const orRequired = (message: string) => (issue: { received: string }) =>
	issue.received === "undefined" || issue.received === "null"
		? REQUIRED
		: message;

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" });

const describe = (requirement: unknown): string =>
	requirement instanceof Date
		? dateFormatter.format(requirement)
		: String(requirement);

// ── Tipos base ────────────────────────────────────────────────────────────────

v.setSpecificMessage(v.string, orRequired("Debe ser un texto."));
v.setSpecificMessage(v.number, orRequired("Debe ser un número."));
v.setSpecificMessage(v.boolean, orRequired("Debe ser verdadero o falso."));
v.setSpecificMessage(v.date, orRequired("Debe ser una fecha válida."));
v.setSpecificMessage(v.array, orRequired("Debe ser una lista de valores."));
v.setSpecificMessage(v.object, orRequired("Debe ser un conjunto de datos."));
v.setSpecificMessage(v.record, orRequired("Debe ser un conjunto de datos."));

// ── Vocabularios cerrados ─────────────────────────────────────────────────────

const INVALID_OPTION = "La opción seleccionada no es válida.";

v.setSpecificMessage(v.picklist, orRequired(INVALID_OPTION));
v.setSpecificMessage(v.literal, orRequired(INVALID_OPTION));
v.setSpecificMessage(v.union, orRequired(INVALID_OPTION));
v.setSpecificMessage(v.variant, orRequired(INVALID_OPTION));

// ── Longitud ──────────────────────────────────────────────────────────────────
// `minLength` y `maxLength` valen igual para texto y para lista, y el mensaje
// no puede ser el mismo: se decide por la forma de la entrada.

v.setSpecificMessage(v.minLength, (issue) =>
	Array.isArray(issue.input)
		? `Selecciona al menos ${issue.requirement} ${issue.requirement === 1 ? "opción" : "opciones"}.`
		: `Debe tener al menos ${issue.requirement} ${issue.requirement === 1 ? "carácter" : "caracteres"}.`,
);

v.setSpecificMessage(v.maxLength, (issue) =>
	Array.isArray(issue.input)
		? `No puedes seleccionar más de ${issue.requirement} ${issue.requirement === 1 ? "opción" : "opciones"}.`
		: `No puede superar los ${issue.requirement} caracteres.`,
);

// ── Rango ─────────────────────────────────────────────────────────────────────

v.setSpecificMessage(
	v.minValue,
	(issue) => `El valor mínimo permitido es ${describe(issue.requirement)}.`,
);
v.setSpecificMessage(
	v.maxValue,
	(issue) => `El valor máximo permitido es ${describe(issue.requirement)}.`,
);

// ── Formatos ──────────────────────────────────────────────────────────────────

v.setSpecificMessage(v.integer, "Debe ser un número entero, sin decimales.");
v.setSpecificMessage(v.email, "Escribe un correo electrónico válido.");
v.setSpecificMessage(v.url, "Escribe una dirección web válida, con https://");
v.setSpecificMessage(v.regex, "El formato no es válido.");

/** Nunca lo escribe una persona: si falla, la referencia llegó corrupta. */
v.setSpecificMessage(v.uuid, "La referencia recibida no es válida.");

// ── Últimos recursos ──────────────────────────────────────────────────────────
// Cualquier esquema o acción que no aparezca arriba. Deliberadamente vagos: si
// uno de estos dos se ve en pantalla, falta un mensaje en el `rules.ts`.

v.setSchemaMessage(
	orRequired("El dato recibido no tiene el formato esperado."),
);
v.setGlobalMessage("El dato recibido no es válido.");
