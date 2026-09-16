import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_THEME_TOKENS } from "../domain/theme.config";
import { themeCss, tokensEqual } from "../domain/theme.mapper";
import type {
	ColorTokenName,
	Theme,
	ThemeMode,
	ThemeShadowTokens,
	ThemeSharedTokens,
	ThemeTokens,
	ThemeVariantName,
} from "../domain/theme.types";

/** Id del `<style>` que pinta el borrador. Uno solo, reescrito en cada cambio. */
const DRAFT_STYLE_ID = "theme-draft";

/** Espera antes de repintar. Un slider dispara decenas de cambios por segundo. */
const REPAINT_DEBOUNCE_MS = 60;

/**
 * Estado del tema en edición, con preview en vivo sobre el documento entero.
 *
 * El preview NO se limita a una galería en una caja: reescribe un `<style>` al
 * final del `<head>`, después del que emitió el servidor, así que pisa los
 * tokens de toda la página. El sidebar y la cabecera cambian mientras se mueve
 * el slider, que es la única forma de juzgar un tema de verdad.
 *
 * El estado local se descarta y se readopta el del servidor cuando cambia el
 * BORRADOR PERSISTIDO —cambio de tema, importar CSS, descartar—, y no cuando
 * cambia el estado local. Guardar no provoca ningún salto: lo que vuelve del
 * servidor es exactamente lo que se acaba de mandar.
 *
 * MIENTRAS SE EDITA, la pantalla pinta la VARIANTE que se está editando, no el
 * modo de la persona. Antes eran dos cosas sueltas: la pestaña empezaba siempre
 * en "Claro" y el preview pintaba `mode`, así que un admin en oscuro editaba la
 * pestaña clara y no veía absolutamente nada —ni en la página ni en la galería—,
 * y "Derivar oscuro" en modo claro tampoco enseñaba su resultado. Por eso la
 * variante vive AQUÍ, junto al `<style>` que la pinta: son la misma decisión.
 */
export function useThemeDraft(theme: Theme | null, mode: ThemeMode) {
	const serverTokens = theme?.draftTokens ?? DEFAULT_THEME_TOKENS;

	// Huella de lo PERSISTIDO. Es la señal de readopción; el estado local no la
	// mueve, así que escribir no puede pisarse a sí mismo.
	const fingerprint = useMemo(
		() => `${theme?.documentId ?? ""}:${JSON.stringify(serverTokens)}`,
		[theme?.documentId, serverTokens],
	);

	const [tokens, setTokens] = useState<ThemeTokens>(serverTokens);
	const lastFingerprint = useRef(fingerprint);

	if (lastFingerprint.current !== fingerprint) {
		lastFingerprint.current = fingerprint;
		setTokens(serverTokens);
	}

	/*
	 * Variante en edición. Arranca en la que la persona está viendo.
	 *
	 * `system` no se puede resolver en el servidor —solo el navegador sabe qué
	 * pide el sistema operativo—, así que el primer render dice "claro" y este
	 * efecto lo corrige en cliente. Es una sola vez, al montar: a partir de ahí
	 * manda la pestaña, no el sistema.
	 *
	 * Hasta que la variante está resuelta (`ready`) no se toca NI el `<style>` NI
	 * la clase de `<html>`: la página sigue enseñando lo que mandó el servidor,
	 * que ya es correcto. Sin esa espera, alguien en modo sistema con el sistema
	 * en oscuro vería un fotograma en claro al entrar al builder.
	 */
	const [variant, setVariant] = useState<ThemeVariantName>(
		mode === "dark" ? "dark" : "light",
	);
	const [ready, setReady] = useState(false);
	const adopted = useRef(false);

	useEffect(() => {
		if (adopted.current) return;
		adopted.current = true;

		if (
			mode === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches
		) {
			setVariant("dark");
		}
		// Los dos `set` de este efecto se agrupan en un solo render: el primer
		// pintado del borrador ya sale con la variante definitiva.
		setReady(true);
	}, [mode]);

	const painted = useRef<ThemeVariantName | null>(null);

	useEffect(() => {
		if (!ready) return;

		const paint = () => {
			const style =
				document.getElementById(DRAFT_STYLE_ID) ??
				document.head.appendChild(
					Object.assign(document.createElement("style"), {
						id: DRAFT_STYLE_ID,
					}),
				);

			style.textContent = themeCss(tokens, variant);
			painted.current = variant;
		};

		// Cambiar de pestaña es un salto, no un arrastre: se pinta en el acto, en
		// el mismo commit en el que se ajusta la clase de `<html>`. Esperar los
		// 60 ms dejaría ese rato con la clase de una variante y los tokens de otra.
		if (painted.current !== variant) {
			paint();
			return;
		}

		const timer = setTimeout(paint, REPAINT_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [tokens, variant, ready]);

	/*
	 * La clase de `<html>` acompaña a la variante mientras dura el builder.
	 *
	 * Los tokens no bastan: el `@custom-variant dark` de app.css se engancha a
	 * `.dark` y a `.theme-system`, así que pintar los tokens oscuros sin la clase
	 * dejaría todas las utilidades `dark:` (el relleno de los campos, los bordes
	 * de los botones outline) resolviendo la rama clara encima de un tema oscuro.
	 *
	 * Se restauran las dos clases al desmontar, igual que el `<style>`: fuera del
	 * builder la clase vuelve a ser cosa del loader raíz.
	 */
	useEffect(() => {
		if (!ready) return;

		const root = document.documentElement;
		const hadDark = root.classList.contains("dark");
		const hadSystem = root.classList.contains("theme-system");

		root.classList.toggle("dark", variant === "dark");
		root.classList.remove("theme-system");

		return () => {
			root.classList.toggle("dark", hadDark);
			root.classList.toggle("theme-system", hadSystem);
		};
	}, [variant, ready]);

	// Al salir del builder se retira el borrador: la app vuelve a lo que sirve el
	// servidor. Sin esto, navegar a otra pantalla la dejaría con colores que nadie
	// ha publicado.
	useEffect(() => () => document.getElementById(DRAFT_STYLE_ID)?.remove(), []);

	const setColor = useCallback(
		(variant: ThemeVariantName, token: ColorTokenName, value: string) =>
			setTokens((current) => ({
				...current,
				[variant]: { ...current[variant], [token]: value },
			})),
		[],
	);

	const setShared = useCallback(
		<K extends keyof ThemeSharedTokens>(key: K, value: ThemeSharedTokens[K]) =>
			setTokens((current) => ({
				...current,
				shared: { ...current.shared, [key]: value },
			})),
		[],
	);

	const setShadow = useCallback(
		<K extends keyof ThemeShadowTokens>(key: K, value: ThemeShadowTokens[K]) =>
			setTokens((current) => ({
				...current,
				shared: {
					...current.shared,
					shadow: { ...current.shared.shadow, [key]: value },
				},
			})),
		[],
	);

	return {
		tokens,
		setTokens,
		setColor,
		setShared,
		setShadow,
		/** Variante en edición, que es también la que se está pintando. */
		variant,
		setVariant,
		/** Hay cambios locales sin guardar. */
		isDirty: !tokensEqual(tokens, serverTokens),
	};
}
