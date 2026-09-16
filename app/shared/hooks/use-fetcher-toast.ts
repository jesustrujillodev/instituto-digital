import { useEffect, useRef } from "react";
import type { useFetcher } from "react-router";
import { sileo } from "sileo";
import type { AppResponse } from "@/shared/response/response.types";

interface Options {
	onSuccess?: () => void;
	onError?: () => void;
	successMessage?: string;
	errorMessage?: string;
}

/**
 * Respuesta mínima que debe devolver un action para poder anunciarse aquí: el
 * envelope estándar con cualquier dato.
 *
 * Antes era una interfaz propia casi idéntica a la de los actions, y nada
 * garantizaba que ambas siguieran coincidiendo.
 */
export type FetcherToastData = AppResponse<unknown>;

/**
 * Caracteres que caben en la píldora de Sileo con la fuente más ancha del
 * catálogo. El título va en una sola línea (`nowrap`, 350px) y lo que sobra se
 * corta sin puntos suspensivos, así que conviene quedarse corto.
 */
const TITLE_MAX = 36;

/**
 * Reparte un mensaje entre título y descripción.
 *
 * Los actions devuelven una sola frase y casi todas caben ("Usuario archivado").
 * Las de éxito parcial no: "Cambios guardados, pero no se pudo actualizar la
 * foto." quedaría cortada a media palabra. Se parten por la primera coma o punto,
 * que en esos mensajes separa justo el resultado de la salvedad.
 */
export function splitToastMessage(message: string): {
	title: string;
	description?: string;
} {
	if (message.length <= TITLE_MAX) return { title: message };

	const cut = message.search(/[,.:;]\s/);
	if (cut <= 0 || cut > TITLE_MAX) return { title: "", description: message };

	const rest = message.slice(cut + 1).trim();
	return {
		title: message.slice(0, cut),
		description: rest.charAt(0).toUpperCase() + rest.slice(1),
	};
}

/**
 * Anuncia el resultado de un fetcher con un toast, exactamente una vez por
 * respuesta.
 *
 * Un `useEffect` ingenuo sobre `fetcher.data` dispara el toast dos veces cuando
 * las callbacks cambian de referencia entre renders. Aquí las callbacks viven en
 * refs (no son dependencias del efecto) y se recuerda el último dato ya
 * procesado, así que una re-renderización no vuelve a anunciar lo mismo.
 */
export function useFetcherToast<T extends FetcherToastData>(
	fetcher: ReturnType<typeof useFetcher<T>>,
	options: Options = {},
) {
	const { onSuccess, onError, successMessage, errorMessage } = options;

	const onSuccessRef = useRef(onSuccess);
	const onErrorRef = useRef(onError);
	onSuccessRef.current = onSuccess;
	onErrorRef.current = onError;

	const processedRef = useRef<T | null | undefined>(undefined);

	useEffect(() => {
		const data = fetcher.data;
		if (!data || data === processedRef.current) return;
		processedRef.current = data as T;

		if (data.success) {
			const message = data.message ?? successMessage;
			if (message) {
				const { title, description } = splitToastMessage(message);
				sileo.success({ title: title || "Listo", description });
			}
			onSuccessRef.current?.();
		} else {
			// `error.message` ya viene traducido por el action (localizeError); el
			// `errorMessage` de las opciones solo cubre el caso de un fallo sin copia.
			// El título fijo nombra el hecho; la causa, que puede ser larga ("Publica
			// el tema antes: …"), va en la descripción.
			const message = data.error.message || errorMessage;
			if (message) {
				sileo.error({ title: "No se pudo completar", description: message });
			}
			onErrorRef.current?.();
		}
	}, [fetcher.data, successMessage, errorMessage]);
}
