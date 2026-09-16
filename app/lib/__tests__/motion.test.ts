import { afterEach, describe, expect, test, vi } from "vitest";
import { prefersReducedMotion, scrollIntoView } from "../motion";

/** Navegador de mentira: solo lo que este módulo consulta. */
const withMatchMedia = (matches: boolean) => {
	const matchMedia = vi.fn(() => ({ matches }));
	vi.stubGlobal("window", { matchMedia });
	return matchMedia;
};

const fakeElement = () =>
	({ scrollIntoView: vi.fn() }) as unknown as Element & {
		scrollIntoView: ReturnType<typeof vi.fn>;
	};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("prefersReducedMotion", () => {
	test("sigue lo que dice el sistema", () => {
		withMatchMedia(true);
		expect(prefersReducedMotion()).toBe(true);

		withMatchMedia(false);
		expect(prefersReducedMotion()).toBe(false);
	});

	// En servidor no hay preferencia que consultar. Devolver `true` "por si acaso"
	// dejaría el HTML inicial decidiendo por alguien que no ha dicho nada.
	test("en servidor no hay preferencia: false, y sin reventar", () => {
		expect(prefersReducedMotion()).toBe(false);
	});

	test("un navegador sin matchMedia tampoco rompe", () => {
		vi.stubGlobal("window", {});
		expect(prefersReducedMotion()).toBe(false);
	});

	// Es un ajuste del sistema operativo que se puede cambiar con la pestaña
	// abierta: cachear la respuesta la dejaría obsoleta hasta recargar.
	test("se vuelve a consultar en cada llamada", () => {
		const matchMedia = withMatchMedia(false);

		prefersReducedMotion();
		prefersReducedMotion();

		expect(matchMedia).toHaveBeenCalledTimes(2);
	});
});

describe("scrollIntoView", () => {
	test("suave cuando nadie ha pedido menos movimiento", () => {
		withMatchMedia(false);
		const element = fakeElement();

		scrollIntoView(element, { block: "center" });

		expect(element.scrollIntoView).toHaveBeenCalledWith({
			block: "center",
			behavior: "smooth",
		});
	});

	// El CSS no llega hasta aquí: la opción de la llamada gana a
	// `scroll-behavior`, así que este es el único punto donde se puede atender.
	test("instantáneo cuando el sistema pide menos movimiento", () => {
		withMatchMedia(true);
		const element = fakeElement();

		scrollIntoView(element, { block: "start" });

		expect(element.scrollIntoView).toHaveBeenCalledWith({
			block: "start",
			behavior: "auto",
		});
	});

	// Los tres sitios que lo usan buscan el elemento por id y pueden no
	// encontrarlo: que eso no sea una excepción es parte del contrato.
	test("sin elemento no hace nada", () => {
		withMatchMedia(false);

		expect(() => scrollIntoView(null)).not.toThrow();
		expect(() => scrollIntoView(undefined)).not.toThrow();
	});
});
