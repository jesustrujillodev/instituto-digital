import { FlaskConical, X } from "lucide-react";
import { Link, useFetcher, useRouteLoaderData } from "react-router";
import { Button } from "@/shared/components/ui/button";
import {
	INTENT_FIELD,
	THEME_INTENTS,
	type ThemeBuilderActionData,
} from "../utils/theme-builder-form";

/**
 * Barra flotante mientras "probar en toda la app" está activo.
 *
 * Se pinta a partir de lo que devuelve el LOADER RAÍZ, no leyendo la cookie: el
 * servidor ya comprobó el rol antes de atenderla, así que si esto aparece es
 * porque el preview está realmente en marcha. Un componente que leyera la cookie
 * la pintaría también a quien la hubiera fabricado sin ser admin, y prometería
 * un preview que no está pasando.
 *
 * Existe porque un preview global sin salida visible es una trampa: quien navega
 * a otra pantalla vería colores que nadie ha publicado y no sabría por qué.
 */
export function ThemePreviewBar() {
	const data = useRouteLoaderData<typeof import("@/root").loader>("root");
	const fetcher = useFetcher<ThemeBuilderActionData>();

	const preview = data?.theme.preview;
	if (!preview) return null;

	/*
	 * Dos formas, no una encogida.
	 *
	 * En escritorio es una píldora que ocupa lo que mide su texto. A 400 px eso
	 * no cabía —mensaje de cuarenta caracteres más dos botones— y la píldora se
	 * salía de la pantalla por los dos lados, llevándose con ella el botón de
	 * salir, que es justamente la vía de escape de un preview global.
	 *
	 * En móvil pasa a ser una tarjeta de ancho completo: el aviso arriba, los dos
	 * botones abajo repartiéndose el ancho a 44 px de alto, que es la medida de un
	 * pulgar. Ninguna de las dos acciones se esconde: "volver al editor" es la que
	 * lleva a arreglar el tema y "salir" la que lo corta.
	 *
	 * Sin `backdrop-blur`: `bg-card` es opaco, así que el desenfoque no se veía y
	 * solo obligaba al navegador a componer la capa en cada scroll.
	 */
	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
			<div className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-xl border bg-card px-4 py-3 text-card-foreground shadow-lg sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-3 sm:rounded-full sm:py-2">
				<p className="flex items-start gap-2 text-sm sm:items-center">
					<FlaskConical className="mt-0.5 size-4 shrink-0 text-muted-foreground sm:mt-0" />
					<span>
						Estás probando <strong>{preview.name}</strong>. Solo tú lo ves.
					</span>
				</p>

				<div className="flex items-center gap-2 sm:contents">
					<Button
						size="sm"
						variant="ghost"
						asChild
						className="h-11 flex-1 sm:h-8 sm:flex-none"
					>
						<Link to={`/dashboard/personalizacion?tema=${preview.documentId}`}>
							Volver al editor
						</Link>
					</Button>

					<fetcher.Form
						method="post"
						action="/dashboard/personalizacion"
						className="contents"
					>
						<input
							type="hidden"
							name={INTENT_FIELD}
							value={THEME_INTENTS.stopPreview}
						/>
						<Button
							size="sm"
							variant="outline"
							type="submit"
							disabled={fetcher.state !== "idle"}
							className="h-11 flex-1 gap-1.5 sm:h-8 sm:flex-none"
						>
							<X className="size-3.5" />
							Salir
						</Button>
					</fetcher.Form>
				</div>
			</div>
		</div>
	);
}
