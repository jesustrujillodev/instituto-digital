/**
 * Preferencia de movimiento reducido, para lo que el CSS no alcanza.
 *
 * Casi todo el movimiento de la aplicación se atiende desde la hoja de estilos
 * (ver el bloque `prefers-reduced-motion` de app.css), que es donde debe estar:
 * no necesita JavaScript, funciona en el primer pintado y no se olvida al añadir
 * un componente nuevo.
 *
 * El desplazamiento programático es la excepción. `scroll-behavior: auto` en la
 * hoja NO gana a un `behavior: "smooth"` escrito en la llamada: la opción del
 * `scrollIntoView` manda sobre la propiedad CSS. Así que el único sitio donde se
 * puede respetar la preferencia es el propio punto de llamada, y por eso existe
 * este módulo en vez de repetir el `matchMedia` en cada formulario.
 */

/** La misma consulta que evalúa el CSS. Un solo literal para las dos vías. */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * `true` si el sistema pide menos movimiento.
 *
 * En servidor devuelve `false`: no hay preferencia que consultar, y suponer que
 * la hay dejaría el HTML inicial decidiendo por alguien que no ha dicho nada.
 * Se consulta en cada llamada, sin cachear, porque es un ajuste del sistema
 * operativo que se puede cambiar con la pestaña abierta.
 */
export const prefersReducedMotion = (): boolean =>
	typeof window !== "undefined" &&
	typeof window.matchMedia === "function" &&
	window.matchMedia(REDUCED_MOTION_QUERY).matches;

/**
 * Lleva un elemento a la vista, suave o de golpe según la preferencia.
 *
 * `behavior` no se acepta como parámetro a propósito: quien llama decide QUÉ
 * mostrar y dónde encuadrarlo; cuánto se mueve la pantalla para conseguirlo lo
 * decide quien la mira.
 */
export const scrollIntoView = (
	element: Element | null | undefined,
	options: Omit<ScrollIntoViewOptions, "behavior"> = {},
): void => {
	element?.scrollIntoView({
		...options,
		behavior: prefersReducedMotion() ? "auto" : "smooth",
	});
};
