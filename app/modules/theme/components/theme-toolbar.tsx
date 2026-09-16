import {
	Check,
	ClipboardCopy,
	Copy,
	FlaskConical,
	LoaderCircle,
	MoreHorizontal,
	Pencil,
	Plus,
	RotateCcw,
	Trash2,
	TriangleAlert,
	Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { sileo } from "sileo";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import type {
	Theme,
	ThemeSummary,
	ThemeTokens,
	ThemeVariantName,
} from "../domain/theme.types";
import {
	INTENT_FIELD,
	THEME_INTENTS,
	TOKENS_FIELD,
} from "../utils/theme-builder-form";
import { ThemePicker } from "./theme-picker";

/** Estado del autoguardado, tal y como se le cuenta a la persona. */
export type SaveState =
	| { kind: "saving" }
	| { kind: "saved" }
	| { kind: "failed"; message: string };

/**
 * Lo único que hay que hacer ahora con este tema.
 *
 * El dominio tiene tres pasos —borrador, publicado, activo— y la pantalla los
 * enseñaba como tres botones simultáneos, todos habilitados, sin decir cuál
 * tocaba. Son secuenciales: mientras haya cambios sin publicar, activar no
 * sirve de nada. Aquí se resuelve cuál es el siguiente y el resto se va al menú.
 *
 * `hasUnpublishedChanges` es `false` cuando el tema NUNCA se publicó (el
 * repositorio lo calcula contra `publishedTokens`, que entonces es `null`), así
 * que el primer publicar se decide por `isPublished` y no por él.
 */
type PrimaryAction = "clone" | "publish" | "activate" | "none";

const resolvePrimary = (summary: ThemeSummary | undefined): PrimaryAction => {
	if (!summary || summary.isPreset) return "clone";
	if (!summary.isPublished || summary.hasUnpublishedChanges) return "publish";
	if (!summary.isActive) return "activate";
	return "none";
};

function SaveIndicator({
	state,
	onRetry,
}: {
	state: SaveState;
	onRetry: () => void;
}) {
	if (state.kind === "failed") {
		return (
			<p className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
				<TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
				<span className="truncate">{state.message}</span>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={onRetry}
					className="h-6 shrink-0 px-2 text-destructive"
				>
					Reintentar
				</Button>
			</p>
		);
	}

	// `role="status"` y no un toast: el autoguardado dispara cada 1,2 s mientras
	// se arrastra un slider, y anunciarlo con un toast por vez llenaba la
	// pantalla de avisos de éxito tapando la galería que se estaba mirando.
	return (
		<p
			role="status"
			className="flex items-center gap-1.5 text-xs text-muted-foreground"
		>
			{state.kind === "saving" ? (
				<>
					<LoaderCircle
						className="size-3.5 animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/>
					Guardando…
				</>
			) : (
				<>
					<Check className="size-3.5" aria-hidden="true" />
					Guardado
				</>
			)}
		</p>
	);
}

interface ThemeToolbarProps {
	themes: ThemeSummary[];
	theme: Theme;
	summary: ThemeSummary | undefined;
	tokens: ThemeTokens;
	/** Variante en edición, para que el punto del selector enseñe lo que se ve. */
	variant: ThemeVariantName;
	exportedCss: string;
	isPreviewing: boolean;
	isBusy: boolean;
	saveState: SaveState;
	/**
	 * El diálogo de renombrar lo controla la ruta.
	 *
	 * No es estado de la barra porque no siempre lo abre un clic aquí: al crear
	 * un tema, la ruta lo abre sola en cuanto el tema nuevo está cargado.
	 */
	renaming: boolean;
	onRenamingChange: (open: boolean) => void;
	onRetrySave: () => void;
	onOpenTheme: (documentId: string) => void;
	submit: (fields: Record<string, string>) => void;
}

/**
 * Identidad del tema, su estado y la única acción que toca ahora.
 *
 * Sustituye a una barra de nueve botones al mismo peso. Lo que queda visible es
 * qué tema se edita, en qué punto está y cuál es el siguiente paso; lo demás
 * —duplicar, renombrar, probar, descartar, importar, exportar, eliminar— vive en
 * el menú, que es donde se busca lo que no se hace todos los días.
 */
export function ThemeToolbar({
	themes,
	theme,
	summary,
	tokens,
	variant,
	exportedCss,
	isPreviewing,
	isBusy,
	saveState,
	renaming,
	onRenamingChange,
	onRetrySave,
	onOpenTheme,
	submit,
}: ThemeToolbarProps) {
	const [name, setName] = useState(theme.name);
	const [importing, setImporting] = useState(false);
	const [pastedCss, setPastedCss] = useState("");
	const [deleting, setDeleting] = useState(false);

	const isPreset = theme.isPreset;
	const primary = resolvePrimary(summary);
	const swatch = tokens[variant].primary;

	const copyCss = async () => {
		await navigator.clipboard.writeText(exportedCss);
		sileo.success({ title: "CSS del tema copiado" });
	};

	// El campo readopta el nombre actual cada vez que el diálogo se abre, venga
	// de donde venga. Con el nombre sembrado solo al montar, un tema creado desde
	// el menú se ofrecía a renombrar con el nombre del tema anterior.
	useEffect(() => {
		if (renaming) setName(theme.name);
	}, [renaming, theme.name]);

	return (
		<>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
				<ThemePicker
					themes={themes}
					value={theme.documentId}
					swatch={swatch}
					onChange={onOpenTheme}
				/>

				{/* El estado deja de ser un `·` mudo dentro del desplegable. */}
				{isPreset && <Badge variant="outline">Fábrica</Badge>}
				{summary?.isActive && <Badge variant="secondary">Activo</Badge>}
				{summary?.hasUnpublishedChanges && (
					<Badge variant="outline">Sin publicar</Badge>
				)}

				<div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
					{!isPreset && (
						<SaveIndicator state={saveState} onRetry={onRetrySave} />
					)}

					{primary === "clone" && (
						<Button
							size="sm"
							className="gap-1.5"
							disabled={isBusy}
							onClick={() =>
								submit({
									[INTENT_FIELD]: THEME_INTENTS.clone,
									documentId: theme.documentId,
									name: `${theme.name} (copia)`,
								})
							}
						>
							<Copy className="size-3.5" />
							Duplicar para editar
						</Button>
					)}

					{primary === "publish" && (
						<Button
							size="sm"
							className="gap-1.5"
							disabled={isBusy || saveState.kind !== "saved"}
							onClick={() =>
								submit({
									[INTENT_FIELD]: THEME_INTENTS.publish,
									documentId: theme.documentId,
								})
							}
						>
							<Check className="size-3.5" />
							{summary?.isPublished ? "Publicar cambios" : "Publicar"}
						</Button>
					)}

					{primary === "activate" && (
						<Button
							size="sm"
							className="gap-1.5"
							disabled={isBusy}
							onClick={() =>
								submit({
									[INTENT_FIELD]: THEME_INTENTS.activate,
									documentId: theme.documentId,
								})
							}
						>
							Activar para todos
						</Button>
					)}

					{primary === "none" && (
						<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Check className="size-3.5" aria-hidden="true" />
							Publicado y activo
						</p>
					)}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="icon" variant="ghost" className="size-8">
								<MoreHorizontal className="size-4" />
								<span className="sr-only">Más acciones del tema</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuItem
								onSelect={() => onRenamingChange(true)}
								disabled={isPreset}
							>
								<Pencil />
								Renombrar…
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={() =>
									submit({
										[INTENT_FIELD]: THEME_INTENTS.clone,
										documentId: theme.documentId,
										name: `${theme.name} (copia)`,
									})
								}
							>
								<Copy />
								Duplicar
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={() =>
									submit({
										[INTENT_FIELD]: THEME_INTENTS.create,
										name: "Tema nuevo",
									})
								}
							>
								<Plus />
								Tema nuevo
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							<DropdownMenuItem
								disabled={isPreset}
								onSelect={() =>
									isPreviewing
										? submit({ [INTENT_FIELD]: THEME_INTENTS.stopPreview })
										: submit({
												[INTENT_FIELD]: THEME_INTENTS.startPreview,
												documentId: theme.documentId,
												[TOKENS_FIELD]: JSON.stringify(tokens),
											})
								}
							>
								<FlaskConical />
								{isPreviewing ? "Dejar de probar" : "Probar en toda la app"}
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={isPreset || !summary?.hasUnpublishedChanges}
								onSelect={() =>
									submit({
										[INTENT_FIELD]: THEME_INTENTS.discard,
										documentId: theme.documentId,
									})
								}
							>
								<RotateCcw />
								Descartar cambios
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							<DropdownMenuItem
								disabled={isPreset}
								onSelect={() => setImporting(true)}
							>
								<Upload />
								Importar CSS…
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={copyCss}>
								<ClipboardCopy />
								Copiar CSS
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							<DropdownMenuItem
								variant="destructive"
								disabled={isPreset || summary?.isActive}
								onSelect={() => setDeleting(true)}
							>
								<Trash2 />
								Eliminar
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{isPreset && (
					<p className="w-full text-xs text-muted-foreground">
						Un tema de fábrica no se edita ni se borra. Duplícalo y trabaja
						sobre la copia.
					</p>
				)}
			</div>

			<Dialog open={renaming} onOpenChange={onRenamingChange}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Renombrar tema</DialogTitle>
						<DialogDescription>
							Es el nombre con el que aparece en la biblioteca.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-2">
						<Label htmlFor="theme-name">Nombre</Label>
						<Input
							id="theme-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>

					<DialogFooter>
						<Button variant="ghost" onClick={() => onRenamingChange(false)}>
							Cancelar
						</Button>
						<Button
							disabled={isBusy || !name.trim() || name === theme.name}
							onClick={() => {
								submit({
									[INTENT_FIELD]: THEME_INTENTS.rename,
									documentId: theme.documentId,
									name,
								});
								onRenamingChange(false);
							}}
						>
							Guardar nombre
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={importing} onOpenChange={setImporting}>
				<DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Importar CSS en el borrador</DialogTitle>
						<DialogDescription>
							Pega el bloque{" "}
							<code>
								:root {"{ … }"} .dark {"{ … }"}
							</code>{" "}
							de tweakcn o del generador de shadcn. Reemplaza el borrador
							entero.
						</DialogDescription>
					</DialogHeader>

					<Textarea
						value={pastedCss}
						onChange={(event) => setPastedCss(event.target.value)}
						placeholder=":root { --background: oklch(1 0 0); … }"
						className="max-h-[min(24rem,50dvh)] min-h-56 overflow-y-auto font-mono text-xs"
					/>

					<DialogFooter>
						<Button variant="ghost" onClick={() => setImporting(false)}>
							Cancelar
						</Button>
						<Button
							disabled={isBusy || pastedCss.trim() === ""}
							onClick={() => {
								submit({
									[INTENT_FIELD]: THEME_INTENTS.importCss,
									documentId: theme.documentId,
									css: pastedCss,
								});
								setPastedCss("");
								setImporting(false);
							}}
						>
							Importar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Eliminar no tiene vuelta atrás y antes ocurría en un clic, con el
			    botón a un dedo de "Descartar cambios". */}
			<ConfirmDialog
				open={deleting}
				onOpenChange={setDeleting}
				title={`¿Eliminar "${theme.name}"?`}
				description="Se borran el borrador y la versión publicada. No se puede deshacer."
				confirmLabel="Eliminar tema"
				destructive
				onConfirm={() =>
					submit({
						[INTENT_FIELD]: THEME_INTENTS.delete,
						documentId: theme.documentId,
					})
				}
			/>
		</>
	);
}
