import { useCallback, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import type { AppResponse } from "@/shared/response/response.types";

type SubmitArgs = Parameters<ReturnType<typeof useFetcher>["submit"]>;

/**
 * Un fetcher cuyo envío se puede esperar hasta tener la respuesta.
 *
 * `fetcher.submit` resuelve al terminar, pero la respuesta solo llega en el
 * siguiente render: se entrega desde un efecto, cuando el fetcher vuelve a
 * `idle` después de haber salido de él. `undefined` si el envío no produjo
 * respuesta (por ejemplo, lo interrumpió otro).
 */
export function useFetcherPromise<T extends AppResponse<unknown>>() {
	const fetcher = useFetcher<T>();
	type Data = typeof fetcher.data;
	const pending = useRef<((data: Data) => void) | null>(null);
	const started = useRef(false);

	useEffect(() => {
		if (fetcher.state !== "idle") {
			started.current = true;
			return;
		}
		if (!started.current || !pending.current) return;

		const resolve = pending.current;
		pending.current = null;
		started.current = false;
		resolve(fetcher.data);
	}, [fetcher.state, fetcher.data]);

	const submit = useCallback(
		(target: SubmitArgs[0], options?: SubmitArgs[1]) =>
			new Promise<Data>((resolve) => {
				pending.current?.(undefined);
				pending.current = resolve;
				started.current = false;
				void fetcher.submit(target, options);
			}),
		[fetcher.submit],
	);

	return { fetcher, submit };
}
