/** `#rrggbb`: la única forma de color que entra a un diseño. */
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * El color, solo si es un `#rrggbb`; si no, el de reserva.
 *
 * Entra al CSS y al SVG sin escapar —no hay escape posible dentro de una
 * declaración—, así que cualquier otra forma se descarta: `red;} body{…}` sería
 * una inyección de estilos con el diseño como vector.
 */
export const safeColor = (value: string, fallback: string): string =>
	HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
