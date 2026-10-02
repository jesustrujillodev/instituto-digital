import {
	ArrowLeft,
	Layers,
	LayoutTemplate,
	Minus,
	Plus,
	Redo2,
	Save,
	Scan,
	Send,
	Shapes,
	SquareDashed,
	Undo2,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { Link, useFetcher } from "react-router";
import { sileo } from "sileo";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { Button } from "@/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import type {
	CertificateRenderData,
	LogoOption,
	UploadedImage,
} from "../../domain/certificate.types";
import type {
	CertificateDesignV2,
	DesignElement,
} from "../../domain/design/design-v2.schema";
import { catalogFontFacesCss } from "../../domain/design/render-v2";
import { useEditorShortcuts } from "../../hooks/use-editor-shortcuts";
import { useImageUpload } from "../../hooks/use-image-upload";
import { usePdfBackground } from "../../hooks/use-pdf-background";
import {
	CERTIFICATE_INTENTS,
	type CertificateActionData,
	INTENT_FIELD,
	PAYLOAD_FIELD,
	PDF_FIELD,
	RASTER_DPI_FIELD,
	RASTER_FIELD,
} from "../../utils/certificate-form";
import { alignElements, distributeElements } from "../../utils/editor/align";
import {
	addElements,
	duplicateElements,
	moveElements,
	moveLayer,
	removeElements,
	reorderElements,
	updateElement,
	withoutDecoration,
} from "../../utils/editor/commands";
import {
	createEditorState,
	editorReducer,
	isEditorDirty,
} from "../../utils/editor/editor-state";
import {
	createFieldElement,
	createImageElement,
	createShapeElement,
	createTextElement,
	isMandatory,
} from "../../utils/editor/elements";
import { canRedo, canUndo } from "../../utils/editor/history";
import type { EditorCommand } from "../../utils/editor/keymap";
import { resizePage } from "../../utils/editor/page";
import { EditorStage, ZOOM_RANGE, type Zoom } from "./editor-stage";
import { InsertPanel, type InsertRequest } from "./insert-panel";
import { LayersPanel } from "./layers-panel";
import { PagePanel } from "./page-panel";
import { type ElementAction, PropertiesPanel } from "./properties-panel";
import { type TemplateChoice, TemplatesPanel } from "./templates-panel";

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const FONT_FACES = catalogFontFacesCss("");

const newId = (taken: ReadonlySet<string>) => {
	let id: string;
	do id = `el-${crypto.randomUUID().slice(0, 8)}`;
	while (taken.has(id));
	return id;
};

/** Colores que ya usa el documento, para ofrecerlos en los selectores. */
const colorsOf = (design: CertificateDesignV2) => {
	const colors = new Set<string>();
	if (design.background.kind === "color") colors.add(design.background.color);
	for (const element of design.elements) {
		if ("color" in element) colors.add(element.color);
		if (element.type === "shape") {
			if (element.fill) colors.add(element.fill);
			if (element.stroke) colors.add(element.stroke);
		}
	}
	return [...colors];
};

/** Chromium dibuja la vista previa igual que el archivo; Firefox y Safari, casi. */
const isChromium = () =>
	typeof navigator !== "undefined" &&
	/Chrome|Chromium|Edg\//.test(navigator.userAgent);

export interface CertificateEditorProps {
	title: string;
	subtitle: string;
	backHref: string;
	/** El diseño con el que abre: el guardado, o el v1 convertido. */
	initialDesign: CertificateDesignV2;
	/** Los datos de muestra con el formato de folio en pantalla. */
	sampleData: (folioFormat: string) => CertificateRenderData;
	logos: readonly LogoOption[];
	readOnly: boolean;
	/** A dónde van los guardados y las subidas. */
	actionPath: string;
	/** Publicar existe en el certificado de un curso, no en una plantilla. */
	canPublish: boolean;
	/** El borrador en pantalla es igual al publicado. */
	isPublished: (design: CertificateDesignV2) => boolean;
	/**
	 * Abre un v1 convertido: no cuenta como cambio (no avisa al salir), pero
	 * se puede guardar tal cual hasta que se guarde una vez.
	 */
	convertedFromV1?: boolean;
	status?: ReactNode;
	notice?: ReactNode;
	/** La biblioteca de plantillas; `apply` pone un diseño en pantalla (se puede deshacer). */
	library?: (context: {
		data: CertificateRenderData;
		logoUrls: Record<string, string>;
		apply: (design: CertificateDesignV2, name: string) => void;
	}) => ReactNode;
	headerActions?: (design: CertificateDesignV2, dirty: boolean) => ReactNode;
	/**
	 * Lo que se muestra al abrir el editor (el diálogo de inicio de un
	 * certificado sin diseño); recibe lo mismo que la biblioteca.
	 */
	start?: (context: {
		data: CertificateRenderData;
		logoUrls: Record<string, string>;
		folioFormat: string;
		apply: (design: CertificateDesignV2, name: string) => void;
	}) => ReactNode;
}

/**
 * El editor libre del certificado (docs/adr/0028): lienzo, capas, insertar,
 * página, plantillas y propiedades. Guarda con el mismo action de siempre; el
 * diseño solo existe en el servidor cuando se guarda.
 */
export function CertificateEditor({
	title,
	subtitle,
	backHref,
	initialDesign,
	sampleData,
	logos,
	readOnly,
	actionPath,
	canPublish,
	isPublished,
	convertedFromV1 = false,
	status,
	notice,
	library,
	headerActions,
	start,
}: CertificateEditorProps) {
	const [state, dispatch] = useReducer(editorReducer, initialDesign, (design) =>
		createEditorState(design),
	);
	const design = state.history.present;
	const dirty = isEditorDirty(state);
	const data = useMemo(
		() => sampleData(design.folioFormat),
		[sampleData, design.folioFormat],
	);
	const [zoom, setZoom] = useState<Zoom>("fit");
	const [scale, setScale] = useState(1);
	const [tab, setTab] = useState("insert");
	const [announcement, setAnnouncement] = useState("");
	const clipboard = useRef<DesignElement[]>([]);
	const [chromium, setChromium] = useState(true);
	useEffect(() => setChromium(isChromium()), []);

	const saver = useFetcher<CertificateActionData>();
	useFetcherToast(saver);
	const submitted = useRef<CertificateDesignV2 | null>(null);
	const [savedOnce, setSavedOnce] = useState(false);
	useEffect(() => {
		if (saver.state === "idle" && saver.data?.success && submitted.current) {
			dispatch({ type: "saved", design: submitted.current });
			submitted.current = null;
			setSavedOnce(true);
		}
	}, [saver.state, saver.data]);
	const savable = dirty || (convertedFromV1 && !savedOnce);
	const pendingIntent =
		saver.state !== "idle" ? saver.formData?.get(INTENT_FIELD) : null;

	const save = useCallback(
		(intent: string) => {
			if (readOnly) return;
			submitted.current = design;
			saver.submit(
				{ [INTENT_FIELD]: intent, [PAYLOAD_FIELD]: JSON.stringify(design) },
				{ method: "post", action: actionPath },
			);
		},
		[readOnly, design, saver, actionPath],
	);

	const commit = useCallback(
		(next: CertificateDesignV2, coalesceKey?: string, select?: string[]) =>
			dispatch({ type: "commit", design: next, coalesceKey, select }),
		[],
	);
	const seal = useCallback(() => dispatch({ type: "seal" }), []);
	const select = useCallback(
		(ids: string[]) => dispatch({ type: "select", ids }),
		[],
	);

	const page = { w: design.page.widthPt, h: design.page.heightPt };
	const taken = () => new Set(design.elements.map((element) => element.id));
	const insert = (element: DesignElement, message: string) => {
		commit(addElements(design, [element]), undefined, [element.id]);
		setAnnouncement(message);
	};

	const handleInsert = (request: InsertRequest) => {
		const id = newId(taken());
		switch (request.kind) {
			case "text":
				return insert(createTextElement(id, page), "Texto añadido");
			case "field":
				return insert(
					createFieldElement(id, page, request.token),
					"Campo añadido",
				);
			case "shape":
				return insert(
					createShapeElement(id, page, request.shape),
					"Forma añadida",
				);
			case "logo":
				return insert(
					createImageElement(
						id,
						page,
						{ kind: "logo", logoId: request.logo.id },
						request.logo,
						request.logo.name,
					),
					"Logo añadido",
				);
		}
	};

	const onImageUploaded = useCallback(
		(image: UploadedImage, signature: boolean) => {
			dispatch({
				type: "commit",
				design: addElements(design, [
					createImageElement(
						newId(new Set(design.elements.map((element) => element.id))),
						{ w: design.page.widthPt, h: design.page.heightPt },
						{
							kind: "asset",
							ref: image.ref,
							role: signature ? "signature" : "image",
						},
						image,
						signature ? "Firma" : "Imagen",
					),
				]),
			});
		},
		[design],
	);
	const imageUpload = useImageUpload(actionPath, onImageUploaded);

	const pdfBackground = usePdfBackground();
	const backgroundFetcher = useFetcher<CertificateActionData>();
	useFetcherToast(backgroundFetcher);
	const handledBackground = useRef<unknown>(null);
	useEffect(() => {
		const result = backgroundFetcher.data;
		if (
			backgroundFetcher.state !== "idle" ||
			!result ||
			handledBackground.current === result
		)
			return;
		handledBackground.current = result;
		if (!result.success || !result.data || !("pdfRef" in result.data)) return;
		const uploaded = result.data;
		const resized = resizePage(design, {
			preset: "CUSTOM",
			orientation:
				uploaded.widthPt >= uploaded.heightPt ? "landscape" : "portrait",
			widthPt: uploaded.widthPt,
			heightPt: uploaded.heightPt,
		});
		commit({
			...resized,
			background: {
				kind: "pdf",
				pdfRef: uploaded.pdfRef,
				rasterRef: uploaded.rasterRef,
				rasterDpi: uploaded.rasterDpi,
				widthPt: uploaded.widthPt,
				heightPt: uploaded.heightPt,
			},
		});
	}, [backgroundFetcher.state, backgroundFetcher.data, design, commit]);

	const uploadPdf = async (file: File) => {
		try {
			const rasterized = await pdfBackground.rasterize(file);
			const form = new FormData();
			form.set(INTENT_FIELD, CERTIFICATE_INTENTS.uploadBackground);
			form.set(PDF_FIELD, rasterized.pdf);
			form.set(RASTER_FIELD, rasterized.raster);
			form.set(RASTER_DPI_FIELD, String(rasterized.rasterDpi));
			backgroundFetcher.submit(form, {
				method: "post",
				action: actionPath,
				encType: "multipart/form-data",
			});
		} catch {
			sileo.error({
				title: "No se pudo leer el PDF",
				description: "Revisa que no esté protegido y vuelve a exportarlo.",
			});
		}
	};

	const selection = state.selection;
	const selected = design.elements.filter((element) =>
		selection.includes(element.id),
	);

	const runAction = (action: ElementAction) => {
		switch (action.type) {
			case "delete": {
				const next = removeElements(design, selection);
				if (next !== design) {
					commit(next, undefined, []);
					setAnnouncement("Elementos eliminados");
				} else if (selected.some(isMandatory)) {
					setAnnouncement("El QR y el folio no se pueden eliminar");
				}
				return;
			}
			case "duplicate": {
				const copy = duplicateElements(design, selection, () => newId(taken()));
				commit(copy.design, undefined, copy.ids);
				return;
			}
			case "align":
				commit({
					...design,
					elements: alignElements(
						design.elements,
						selection,
						action.alignment,
						page,
					),
				});
				return;
			case "distribute":
				commit({
					...design,
					elements: distributeElements(design.elements, selection, action.axis),
				});
				return;
		}
	};

	const onCommand = (command: EditorCommand) => {
		if (command.type === "save") {
			if (savable) save(CERTIFICATE_INTENTS.saveDraft);
			return;
		}
		if (command.type === "undo") return dispatch({ type: "undo" });
		if (command.type === "redo") return dispatch({ type: "redo" });
		if (command.type === "select-all")
			return select(design.elements.map((element) => element.id));
		if (command.type === "deselect") return select([]);
		if (readOnly) return;
		switch (command.type) {
			case "delete":
				return runAction({ type: "delete" });
			case "duplicate":
				return runAction({ type: "duplicate" });
			case "copy":
				clipboard.current = selected.filter((element) => !isMandatory(element));
				return;
			case "paste": {
				if (clipboard.current.length === 0) return;
				const ids = new Set(design.elements.map((element) => element.id));
				const pasted = clipboard.current.map((element) => {
					const id = newId(ids);
					ids.add(id);
					return { ...element, id, x: element.x + 12, y: element.y + 12 };
				});
				clipboard.current = pasted;
				commit(
					addElements(design, pasted),
					undefined,
					pasted.map((element) => element.id),
				);
				return;
			}
			case "nudge":
				commit(
					moveElements(design, selection, command.dx, command.dy),
					"nudge",
				);
				return;
			case "reorder":
				commit(reorderElements(design, selection, command.direction));
				return;
		}
	};
	useEditorShortcuts(onCommand, true);

	const applyDesign = useCallback(
		(next: CertificateDesignV2, name: string) => {
			dispatch({
				type: "commit",
				design: { ...structuredClone(next), folioFormat: design.folioFormat },
				select: [],
			});
			setAnnouncement(`Diseño «${name}» aplicado. Ctrl+Z para volver.`);
		},
		[design.folioFormat],
	);
	const chooseTemplate = (choice: TemplateChoice) =>
		applyDesign(choice.design, choice.name);

	const logoUrls = useMemo(
		() =>
			Object.fromEntries(
				logos
					.filter((logo) => !logo.builtin)
					.map((logo) => [logo.id, logo.url]),
			),
		[logos],
	);
	const documentColors = useMemo(() => colorsOf(design), [design]);
	const sampleFolio = data.folio;

	const zoomBy = (direction: 1 | -1) => {
		const next =
			direction === 1
				? (ZOOM_STEPS.find((step) => step > scale + 0.001) ?? ZOOM_RANGE.max)
				: ([...ZOOM_STEPS].reverse().find((step) => step < scale - 0.001) ??
					ZOOM_RANGE.min);
		setZoom(next);
	};

	const published = isPublished(design);

	return (
		<div className="flex h-dvh flex-col bg-background">
			<style>{FONT_FACES}</style>
			<header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
				<Button variant="ghost" size="icon-sm" asChild>
					<Link to={backHref} aria-label="Volver">
						<ArrowLeft aria-hidden="true" />
					</Link>
				</Button>
				<div className="min-w-0">
					<p className="truncate font-medium text-sm leading-tight">{title}</p>
					<p className="truncate text-muted-foreground text-xs">{subtitle}</p>
				</div>
				<div className="hidden items-center gap-2 md:flex">{status}</div>
				<div className="ml-auto flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Deshacer"
								disabled={!canUndo(state.history)}
								onClick={() => dispatch({ type: "undo" })}
							>
								<Undo2 aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Deshacer (Ctrl+Z)</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Rehacer"
								disabled={!canRedo(state.history)}
								onClick={() => dispatch({ type: "redo" })}
							>
								<Redo2 aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Rehacer (Ctrl+Shift+Z)</TooltipContent>
					</Tooltip>
					<div className="mx-1 flex items-center rounded-md border">
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Alejar"
							onClick={() => zoomBy(-1)}
						>
							<Minus aria-hidden="true" />
						</Button>
						<span
							className="w-12 text-center text-xs tabular-nums"
							aria-live="polite"
						>
							{Math.round(scale * 100)} %
						</span>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Acercar"
							onClick={() => zoomBy(1)}
						>
							<Plus aria-hidden="true" />
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Ajustar a la ventana"
							onClick={() => setZoom("fit")}
						>
							<Scan aria-hidden="true" />
						</Button>
					</div>
					{headerActions?.(design, dirty)}
					{!readOnly && (
						<>
							<Button
								variant="outline"
								size="sm"
								disabled={!savable}
								pending={pendingIntent === CERTIFICATE_INTENTS.saveDraft}
								onClick={() => save(CERTIFICATE_INTENTS.saveDraft)}
							>
								<Save aria-hidden="true" />
								Guardar
							</Button>
							{canPublish && (
								<Button
									size="sm"
									disabled={published && !dirty}
									pending={pendingIntent === CERTIFICATE_INTENTS.publish}
									onClick={() => save(CERTIFICATE_INTENTS.publish)}
								>
									<Send aria-hidden="true" />
									Publicar
								</Button>
							)}
						</>
					)}
				</div>
			</header>

			{notice}
			{!chromium && (
				<p className="border-b bg-muted px-4 py-1.5 text-center text-muted-foreground text-xs">
					La vista previa puede diferir ligeramente del archivo en este
					navegador. Para precisión exacta, usa Chrome o Edge.
				</p>
			)}

			<div className="flex min-h-0 flex-1">
				<aside className="flex w-72 shrink-0 flex-col border-r">
					<Tabs
						value={tab}
						onValueChange={setTab}
						className="flex min-h-0 flex-1 flex-col gap-0"
					>
						<TabsList className="m-2 grid w-auto grid-cols-4">
							<TabsTrigger
								value="insert"
								aria-label="Insertar"
								title="Insertar"
							>
								<Shapes aria-hidden="true" />
							</TabsTrigger>
							<TabsTrigger value="layers" aria-label="Capas" title="Capas">
								<Layers aria-hidden="true" />
							</TabsTrigger>
							<TabsTrigger value="page" aria-label="Página" title="Página">
								<SquareDashed aria-hidden="true" />
							</TabsTrigger>
							<TabsTrigger
								value="templates"
								aria-label="Plantillas"
								title="Plantillas"
							>
								<LayoutTemplate aria-hidden="true" />
							</TabsTrigger>
						</TabsList>
						<div className="min-h-0 flex-1 overflow-y-auto">
							<TabsContent value="insert">
								<InsertPanel
									logos={logos}
									uploading={imageUpload.pending}
									disabled={readOnly}
									onInsert={handleInsert}
									onUpload={imageUpload.upload}
								/>
							</TabsContent>
							<TabsContent value="layers">
								<LayersPanel
									elements={design.elements}
									selection={selection}
									readOnly={readOnly}
									onSelect={select}
									onToggle={(id, field) => {
										const element = design.elements.find((e) => e.id === id);
										if (element)
											commit(
												updateElement(design, id, { [field]: !element[field] }),
											);
									}}
									onMove={(id, index) => commit(moveLayer(design, id, index))}
								/>
							</TabsContent>
							<TabsContent value="page">
								<PagePanel
									design={design}
									documentColors={documentColors}
									readOnly={readOnly}
									uploading={
										pdfBackground.pending || backgroundFetcher.state !== "idle"
									}
									onPage={(next) => commit(resizePage(design, next))}
									onBackground={(background) =>
										commit({ ...design, background })
									}
									onRemoveDecoration={() => {
										commit(withoutDecoration(design), undefined, []);
										setAnnouncement(
											"Formas y logos quitados. Ctrl+Z para volver.",
										);
									}}
									onUploadPdf={uploadPdf}
								/>
							</TabsContent>
							<TabsContent value="templates">
								<TemplatesPanel
									data={data}
									folioFormat={design.folioFormat}
									page={design.page}
									logoUrls={logoUrls}
									readOnly={readOnly}
									onChoose={chooseTemplate}
									library={library?.({ data, logoUrls, apply: applyDesign })}
								/>
							</TabsContent>
						</div>
					</Tabs>
				</aside>

				<EditorStage
					design={design}
					data={data}
					logoUrls={logoUrls}
					selection={selection}
					zoom={zoom}
					onScale={setScale}
					readOnly={readOnly}
					onCommit={commit}
					onSeal={seal}
					onSelect={select}
				/>

				<aside
					className="w-72 shrink-0 overflow-y-auto border-l"
					aria-label="Propiedades"
				>
					<PropertiesPanel
						selected={selected}
						documentColors={documentColors}
						folioFormat={design.folioFormat}
						sampleFolio={sampleFolio}
						readOnly={readOnly}
						onPatch={(id, value, field) =>
							commit(updateElement(design, id, value), `prop-${id}-${field}`)
						}
						onFolioFormat={(folioFormat) =>
							commit({ ...design, folioFormat }, "folio-format")
						}
						onSeal={seal}
						onAction={runAction}
					/>
				</aside>
			</div>

			<p className="sr-only" aria-live="polite">
				{announcement}
			</p>
			{start?.({
				data,
				logoUrls,
				folioFormat: design.folioFormat,
				apply: applyDesign,
			})}
			<UnsavedChangesDialog when={dirty && saver.state === "idle"} />
		</div>
	);
}
