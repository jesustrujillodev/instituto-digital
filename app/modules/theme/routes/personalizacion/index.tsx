export { action } from "./index.action";
export { loader } from "./index.loader";

import { Palette } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { PageHeader } from "@/shared/components/common/page-header";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { ContrastPanel } from "../../components/contrast-panel";
import { ThemePreviewGallery } from "../../components/theme-preview-gallery";
import { ThemeTokenPanel } from "../../components/theme-token-panel";
import { type SaveState, ThemeToolbar } from "../../components/theme-toolbar";
import { deriveDarkVariant } from "../../domain/theme.rules";
import { useThemeDraft } from "../../hooks/use-theme-draft";
import { useThemeMode } from "../../hooks/use-theme-mode";
import {
	INTENT_FIELD,
	THEME_INTENTS,
	type ThemeBuilderActionData,
	TOKENS_FIELD,
} from "../../utils/theme-builder-form";
import type { Route } from "./+types/index";

/** Espera del autoguardado tras el último cambio. */
const AUTOSAVE_DEBOUNCE_MS = 1200;

/**
 * Luz de fondo de la galería.
 *
 * No es decoración: sobre un fondo plano, una tarjeta con `--card` translúcido
 * se ve EXACTAMENTE igual que una opaca, así que el admin no tenía forma de
 * comprobar el alfa que acababa de poner. Con tres focos difusos detrás, la
 * transparencia se delata sola.
 *
 * Va como `background-image` del propio contenedor y no como una capa absoluta
 * dentro: el panel hace scroll a partir de `xl`, y una capa `inset-0` se
 * desplazaría con el contenido dejando el resto del panel a oscuras.
 *
 * Los colores salen de los tokens del tema en edición —aquí sí, al contrario que
 * el cromo del selector—: es una superficie de preview, y tiene que teñirse con
 * lo que se está construyendo.
 */
// Los tres focos salen de `primary` y de dos series de gráfica, no de `accent`:
// `accent` es una superficie —0,97 de luminosidad en los presets claros—, así que
// como foco de luz no se distinguía del fondo.
const GALLERY_GLOW = [
	"radial-gradient(60% 45% at 12% 0%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 70%)",
	"radial-gradient(50% 40% at 92% 12%, color-mix(in oklch, var(--chart-2) 20%, transparent), transparent 70%)",
	"radial-gradient(55% 45% at 62% 100%, color-mix(in oklch, var(--chart-4) 24%, transparent), transparent 70%)",
].join(", ");

export const handle = {
	breadcrumb: () => [{ label: "Personalización" }],
} satisfies BreadcrumbHandle;

export default function PersonalizacionPage({
	loaderData,
}: Route.ComponentProps) {
	const { themes, theme, exportedCss, previewDocumentId } = loaderData.data;

	const [searchParams, setSearchParams] = useSearchParams();

	/*
	 * Dos fetchers, no uno.
	 *
	 * El autoguardado tiene el suyo y NO pasa por `useFetcherToast`: el action
	 * responde "Borrador guardado" y con un solo fetcher eso era un toast de
	 * éxito cada 1,2 s mientras se arrastra un slider — media pantalla de avisos
	 * tapando justo la galería que se está mirando. Lo que el autoguardado tiene
	 * que decir cabe en un indicador de tres estados junto al selector.
	 */
	const fetcher = useFetcher<ThemeBuilderActionData>();
	const saveFetcher = useFetcher<ThemeBuilderActionData>();

	useFetcherToast(fetcher);

	// El modo sale del loader raíz y solo sirve para SEMBRAR la pestaña: a partir
	// de ahí manda `variant`, y la pantalla pinta la variante que se edita. Un
	// admin en oscuro que abra la pestaña Claro ve la página en claro.
	const { mode } = useThemeMode();
	const {
		tokens,
		setTokens,
		setColor,
		setShared,
		setShadow,
		variant,
		setVariant,
		isDirty,
	} = useThemeDraft(theme, mode);

	const tokensFingerprint = useMemo(() => JSON.stringify(tokens), [tokens]);

	/*
	 * Corte del bucle de autoguardado.
	 *
	 * Cuando el action rechazaba un token, el efecto volvía a programar el
	 * guardado en cuanto el fetcher quedaba libre: un error cada 1,2 s y, de
	 * propina, los loaders de root, del layout y de la página re-ejecutados en
	 * cada intento. Se recuerda la huella del último envío rechazado y no se
	 * reintenta hasta que los tokens cambien; "Reintentar" sigue permitiendo
	 * forzarlo a mano.
	 */
	const attempted = useRef<string | null>(null);

	const saveDraft = useCallback(() => {
		if (!theme) return;
		attempted.current = tokensFingerprint;
		saveFetcher.submit(
			{
				[INTENT_FIELD]: THEME_INTENTS.saveDraft,
				documentId: theme.documentId,
				[TOKENS_FIELD]: tokensFingerprint,
			},
			{ method: "post" },
		);
	}, [saveFetcher, theme, tokensFingerprint]);

	const saveError =
		saveFetcher.data && !saveFetcher.data.success
			? saveFetcher.data.error.message
			: null;
	const saveBlocked =
		saveError !== null && attempted.current === tokensFingerprint;

	const isPreset = theme?.isPreset ?? false;
	const isBusy = fetcher.state !== "idle";
	const isSaving = saveFetcher.state !== "idle";
	const isPreviewing = previewDocumentId === theme?.documentId;

	const saveState: SaveState = saveBlocked
		? { kind: "failed", message: saveError }
		: isDirty || isSaving
			? { kind: "saving" }
			: { kind: "saved" };

	// Autoguardado: el builder se usa moviendo sliders, y obligar a pulsar
	// "guardar" tras cada ajuste acabaría con cambios perdidos. Los presets se
	// excluyen porque la invariante los rechaza y cada intento sería un error por
	// cada slider movido.
	useEffect(() => {
		if (!theme || isPreset || !isDirty || isSaving || saveBlocked) return;

		const timer = setTimeout(saveDraft, AUTOSAVE_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [theme, isPreset, isDirty, isSaving, saveBlocked, saveDraft]);

	/*
	 * Crear y duplicar abren el tema nuevo; solo crear pide su nombre.
	 *
	 * Una copia nace como "X (copia)", que ya dice lo que es. Un tema creado nace
	 * como "Tema nuevo", que no dice nada, así que ahí sí se pregunta. La
	 * distinción se recuerda al enviar y no viaja en la respuesta: cuándo abrir un
	 * diálogo es cosa de la pantalla, no del action.
	 */
	const askForName = useRef(false);

	const submit = useCallback(
		(fields: Record<string, string>) => {
			askForName.current = fields[INTENT_FIELD] === THEME_INTENTS.create;
			fetcher.submit(fields, { method: "post" });
		},
		[fetcher],
	);

	const openTheme = useCallback(
		(documentId: string) => {
			searchParams.set("tema", documentId);
			setSearchParams(searchParams);
		},
		[searchParams, setSearchParams],
	);

	/*
	 * Un tema recién nacido —creado o duplicado— se abre solo.
	 *
	 * En dos pasos y no en uno: abrir el tema es una navegación, así que entre el
	 * `setSearchParams` y el loader que responde hay renders en los que `theme`
	 * sigue siendo el anterior. Disparar ahí el diálogo ofrecería renombrar el
	 * tema del que se venía — y lo renombraría de verdad, porque el envío lleva su
	 * documentId. Por eso se espera a que el tema cargado SEA el nuevo.
	 */
	const created =
		fetcher.data?.success === true
			? (fetcher.data.data?.createdDocumentId ?? null)
			: null;
	const opened = useRef<string | null>(null);
	const [pendingRename, setPendingRename] = useState<string | null>(null);
	const [renaming, setRenaming] = useState(false);

	useEffect(() => {
		if (!created || opened.current === created) return;
		opened.current = created;

		openTheme(created);
		if (askForName.current) setPendingRename(created);
	}, [created, openTheme]);

	useEffect(() => {
		if (!pendingRename || theme?.documentId !== pendingRename) return;

		setPendingRename(null);
		setRenaming(true);
	}, [pendingRename, theme?.documentId]);

	const summary = themes.find((item) => item.documentId === theme?.documentId);

	return (
		<div className="flex flex-col gap-4 pb-10">
			<PageHeader
				title="Personalización"
				description="El tema lo ve todo el mundo. El modo claro u oscuro lo elige cada persona."
			/>

			{themes.length === 0 || !theme ? (
				<Empty className="border border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Palette />
						</EmptyMedia>
						<EmptyTitle>La biblioteca está vacía</EmptyTitle>
						<EmptyDescription>
							Ejecuta <code>bun run seed</code> para sembrar los temas de
							fábrica.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					<ThemeToolbar
						themes={themes}
						theme={theme}
						summary={summary}
						tokens={tokens}
						exportedCss={exportedCss}
						isPreviewing={isPreviewing}
						isBusy={isBusy}
						saveState={saveState}
						variant={variant}
						renaming={renaming}
						onRenamingChange={setRenaming}
						onRetrySave={saveDraft}
						onOpenTheme={openTheme}
						submit={submit}
					/>

					<div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
						{/* Una superficie, no seis. Los tokens y el informe de contraste
						    son secciones de la misma columna, separadas por un divisor:
						    apiladas como tarjetas independientes, cada borde competía con
						    el siguiente y ninguno significaba nada. */}
						<div className="rounded-lg border bg-card">
							<ThemeTokenPanel
								tokens={tokens}
								variant={variant}
								onVariantChange={setVariant}
								onColorChange={setColor}
								onSharedChange={setShared}
								onShadowChange={setShadow}
								onDeriveDark={() => {
									setTokens((current) => ({
										...current,
										dark: deriveDarkVariant(current.light),
									}));
									setVariant("dark");
								}}
								disabled={isPreset}
							/>

							<ContrastPanel tokens={tokens} variant={variant} />
						</div>

						{/*
						 * La galería se queda a la vista mientras se baja por los tokens.
						 *
						 * La columna izquierda mide varias pantallas, así que al llegar a
						 * "Medidas" lo que se está editando ya no se veía. `self-start` es
						 * lo que hace posible el sticky: sin él el elemento de rejilla se
						 * estira hasta el alto de la columna más alta y no tiene margen
						 * para desplazarse.
						 *
						 * Solo desde `xl`, que es donde hay dos columnas; por debajo la
						 * galería va debajo de los tokens y fijarla taparía la mitad de la
						 * pantalla.
						 *
						 * El `top` deja sitio a la cabecera, que también es sticky y opaca.
						 * Se mide por lo alto porque quedarse corto la haría tapar el borde
						 * de la galería, y pasarse solo deja aire.
						 */}
						<div
							className="self-start rounded-lg border bg-background p-4 xl:sticky xl:top-32 xl:max-h-[calc(100svh-9rem)] xl:overflow-y-auto"
							style={{ backgroundImage: GALLERY_GLOW }}
						>
							<ThemePreviewGallery />
						</div>
					</div>
				</>
			)}
		</div>
	);
}
