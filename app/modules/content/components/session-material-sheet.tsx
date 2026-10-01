import {
	Clock,
	ExternalLink,
	FileText,
	Link2,
	type LucideIcon,
	Plus,
	Trash2,
	Video,
} from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/shared/components/ui/sheet";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { SESSION_MATERIAL_MAX_PER_SESSION } from "../domain/content.config";
import type { SessionMaterialType } from "../domain/session-material.rules";
import type { SessionMaterial } from "../domain/session-material.types";
import type {
	SessionMaterialSource,
	SheetMaterial,
} from "../hooks/use-session-materials";
import { LessonUploadField } from "./lesson-upload-field";

export const SESSION_MATERIAL_ICONS: Record<SessionMaterialType, LucideIcon> = {
	FILE: FileText,
	VIDEO: Video,
	LINK: Link2,
};

const TYPE_LABELS: Record<SessionMaterialType, string> = {
	FILE: "Documento",
	VIDEO: "Video",
	LINK: "Enlace",
};

const megabytes = (bytes: number) =>
	`${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;

const hostOf = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
};

/** «PDF · 2 MB», «Video · 140 MB», «youtube.com». */
export const sessionMaterialMetaOf = (
	material: Pick<
		SessionMaterial,
		"type" | "fileName" | "fileSize" | "externalUrl"
	>,
) => {
	if (material.type === "LINK") {
		return material.externalUrl ? hostOf(material.externalUrl) : "Enlace";
	}
	const extension = material.fileName?.split(".").at(-1)?.toUpperCase();
	return [
		material.type === "VIDEO" ? "Video" : extension,
		material.fileSize !== null && megabytes(material.fileSize),
	]
		.filter(Boolean)
		.join(" · ");
};

/**
 * El material de UNA sesión: lo que ya tiene y el formulario para agregar más.
 * La fuente decide si cada cambio se guarda en el acto (sesión guardada) o
 * espera con el paso del alta (sesión nueva).
 */
export function SessionMaterialSheet({
	open,
	title,
	description,
	source,
	onClose,
}: {
	open: boolean;
	title: string;
	description: string;
	source: SessionMaterialSource | null;
	onClose: () => void;
}) {
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
				<header className="flex flex-col gap-0.5 border-border border-b px-6 pt-5 pb-4 pr-12">
					<SheetDescription className="text-xs">{description}</SheetDescription>
					<SheetTitle className="font-bold text-lg">{title}</SheetTitle>
				</header>
				{source && <SheetBody source={source} />}
			</SheetContent>
		</Sheet>
	);
}

function SheetBody({ source }: { source: SessionMaterialSource }) {
	const [removing, setRemoving] = useState<SheetMaterial | null>(null);
	const { materials } = source;
	const full = (materials?.length ?? 0) >= SESSION_MATERIAL_MAX_PER_SESSION;

	return (
		<>
			<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
				{source.pending && (
					<p className="rounded-lg bg-muted px-3 py-2 text-muted-foreground text-xs">
						La sesión todavía no está guardada: su material se guarda cuando
						continúes con el paso.
					</p>
				)}

				{materials === null ? (
					<div aria-busy="true">
						<span className="sr-only">Cargando el material…</span>
						<ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
							{["first", "second"].map((key) => (
								<li key={key} className="flex items-center gap-3 px-4 py-3">
									<Skeleton className="size-8 shrink-0 rounded-lg" />
									<Skeleton className="h-4 flex-1 rounded-md" />
								</li>
							))}
						</ul>
					</div>
				) : materials.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Esta sesión todavía no tiene material. Agrega la presentación, una
						lectura previa o la grabación.
					</p>
				) : (
					<ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
						{materials.map((material) => (
							<MaterialRow
								key={material.id}
								material={material}
								editable={source.editable}
								busy={source.busy}
								onToggle={(value) => source.toggle(material.id, value)}
								onRemove={() =>
									source.pending
										? source.remove(material.id)
										: setRemoving(material)
								}
							/>
						))}
					</ul>
				)}

				{source.editable ? (
					full ? (
						<p className="text-muted-foreground text-sm">
							Una sesión admite hasta {SESSION_MATERIAL_MAX_PER_SESSION}{" "}
							materiales.
						</p>
					) : (
						<AddMaterialForm source={source} />
					)
				) : (
					<p className="text-muted-foreground text-sm">
						La capacitación terminó o se canceló: su material queda como está.
					</p>
				)}
			</div>

			<ConfirmDialog
				open={removing !== null}
				onOpenChange={(open) => {
					if (!open) setRemoving(null);
				}}
				title="¿Quitar este material?"
				description={`«${removing?.title ?? ""}» deja de estar disponible para los participantes.`}
				confirmLabel="Quitar"
				cancelLabel="Volver"
				destructive
				onConfirm={() => {
					if (removing) source.remove(removing.id);
					setRemoving(null);
				}}
			/>
		</>
	);
}

function MaterialRow({
	material,
	editable,
	busy,
	onToggle,
	onRemove,
}: {
	material: SheetMaterial;
	editable: boolean;
	busy: boolean;
	onToggle: (availableFromSession: boolean) => void;
	onRemove: () => void;
}) {
	const id = useId();
	const Icon = SESSION_MATERIAL_ICONS[material.type];

	return (
		<li className="flex flex-col gap-2 px-4 py-3">
			<div className="flex items-start gap-3">
				<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
					<Icon className="size-4" aria-hidden="true" />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					{material.href ? (
						<a
							href={material.href}
							target="_blank"
							rel="noreferrer"
							className="flex items-center gap-1.5 font-medium text-sm underline-offset-4 hover:underline"
						>
							<span className="truncate">{material.title}</span>
							<ExternalLink
								className="size-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
						</a>
					) : (
						<span className="truncate font-medium text-sm">
							{material.title}
						</span>
					)}
					<span className="truncate text-muted-foreground text-xs">
						{sessionMaterialMetaOf(material)}
					</span>
				</div>
				{editable && (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={`Quitar ${material.title}`}
						disabled={busy}
						onClick={onRemove}
						className="text-muted-foreground hover:text-destructive"
					>
						<Trash2 aria-hidden="true" />
					</Button>
				)}
			</div>

			{editable ? (
				<div className="flex items-center gap-2 pl-11">
					<Checkbox
						id={id}
						checked={material.availableFromSession}
						disabled={busy}
						onCheckedChange={(checked) => onToggle(checked === true)}
					/>
					<Label
						htmlFor={id}
						className="font-normal text-muted-foreground text-xs"
					>
						Disponible a partir de la sesión
					</Label>
				</div>
			) : (
				material.availableFromSession && (
					<span className="flex items-center gap-1.5 pl-11 text-muted-foreground text-xs">
						<Clock className="size-3.5" aria-hidden="true" />
						Disponible a partir de la sesión
					</span>
				)
			)}
		</li>
	);
}

function AddMaterialForm({ source }: { source: SessionMaterialSource }) {
	const id = useId();
	const [type, setType] = useState<SessionMaterialType>("FILE");
	const [title, setTitle] = useState("");
	const [link, setLink] = useState("");
	const [fromSession, setFromSession] = useState(false);

	const reset = () => {
		setTitle("");
		setLink("");
		setFromSession(false);
	};

	const nameOr = (fallback: string) => title.trim() || fallback;

	const addLink = async () => {
		const externalUrl = link.trim();
		if (externalUrl === "") return;

		const added = await source.add({
			type: "LINK",
			title: nameOr(hostOf(externalUrl)),
			availableFromSession: fromSession,
			externalUrl,
		});
		if (added) reset();
	};

	const linkReady = link.trim() !== "";

	// Sin `<form>`: la hoja se monta dentro del formulario del paso, y en React el
	// `submit` de un formulario en un portal sube hasta el de afuera y lo guarda.
	return (
		<section className="flex flex-col gap-4 border-border border-t pt-5">
			<h3 className="font-medium text-sm">Agregar material</h3>

			<RadioGroup
				aria-label="Clase de material"
				value={type}
				onValueChange={(value) => setType(value as SessionMaterialType)}
				className="grid grid-cols-3 gap-2"
			>
				{(["FILE", "VIDEO", "LINK"] as const).map((value) => {
					const Icon = SESSION_MATERIAL_ICONS[value];
					const selected = type === value;

					return (
						<label
							key={value}
							htmlFor={`${id}-${value}`}
							className={cn(
								"flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-150",
								"has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30",
								selected
									? "border-primary bg-primary/5 font-medium"
									: "border-border hover:border-foreground/25",
							)}
						>
							<RadioGroupItem
								id={`${id}-${value}`}
								value={value}
								className="sr-only"
							/>
							<Icon className="size-4" aria-hidden="true" />
							{TYPE_LABELS[value]}
						</label>
					);
				})}
			</RadioGroup>

			<div className="flex flex-col gap-2">
				<Label htmlFor={`${id}-title`}>
					Nombre{" "}
					<span className="font-normal text-muted-foreground">
						{type === "LINK"
							? "· si lo dejas vacío, se usa el sitio"
							: "· si lo dejas vacío, se usa el nombre del archivo"}
					</span>
				</Label>
				<Input
					id={`${id}-title`}
					value={title}
					maxLength={120}
					placeholder={
						type === "VIDEO"
							? "Grabación de la sesión"
							: type === "LINK"
								? "Formulario de la actividad"
								: "Presentación de la sesión"
					}
					onChange={(event) => setTitle(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") event.preventDefault();
					}}
				/>
			</div>

			<div className="flex items-start gap-2">
				<Checkbox
					id={`${id}-from-session`}
					checked={fromSession}
					onCheckedChange={(checked) => setFromSession(checked === true)}
					className="mt-0.5"
				/>
				<div className="flex flex-col gap-0.5">
					<Label htmlFor={`${id}-from-session`} className="font-normal">
						Disponible a partir de la sesión
					</Label>
					<p className="text-muted-foreground text-xs">
						Antes de que empiece, el participante ve que existe pero no puede
						abrirlo. Sin marcar, lo ve desde que se publica la capacitación.
					</p>
				</div>
			</div>

			{type === "LINK" ? (
				<div className="flex flex-col gap-2">
					<Label htmlFor={`${id}-link`}>Dirección</Label>
					<div className="flex gap-2">
						<Input
							id={`${id}-link`}
							type="url"
							inputMode="url"
							placeholder="https://"
							value={link}
							onChange={(event) => setLink(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								void addLink();
							}}
						/>
						<Button
							type="button"
							disabled={!linkReady || source.busy}
							onClick={() => void addLink()}
						>
							<Plus aria-hidden="true" />
							Agregar
						</Button>
					</div>
				</div>
			) : (
				<LessonUploadField
					key={type}
					kind={type}
					current={null}
					disabled={source.busy}
					requestTicket={(file) => source.requestTicket(type, file)}
					onUploaded={(uploaded) =>
						void source
							.add({
								type,
								title: nameOr(uploaded.fileName),
								availableFromSession: fromSession,
								...uploaded,
							})
							.then((added) => {
								if (added) reset();
							})
					}
				/>
			)}
		</section>
	);
}
