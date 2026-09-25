import { FileUp, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { Dropzone } from "@/shared/components/ui/dropzone";
import { validateUploadInput } from "@/shared/storage/upload-validation";
import { type LessonUploadKind, uploadLimitsOf } from "../domain/content.rules";

/** Lo que el panel necesita saber del archivo ya escrito en el bucket. */
export interface UploadedMaterial {
	key: string;
	fileName: string;
	mimeType: string;
}

export interface UploadTicket {
	key: string;
	uploadUrl: string;
}

const megabytes = (bytes: number) => Math.floor(bytes / (1024 * 1024));

const acceptOf = (kind: LessonUploadKind) =>
	Object.fromEntries(
		uploadLimitsOf(kind).allowedTypes.map((type) => [type, [] as string[]]),
	);

/**
 * El `PUT` con progreso real.
 *
 * `fetch` no informa del avance de la subida, y un video de cientos de MB sin
 * barra parece colgado. `XMLHttpRequest` sigue siendo la única API del
 * navegador que lo reporta.
 */
const putToBucket = (
	url: string,
	file: File,
	onProgress: (percent: number) => void,
) =>
	new Promise<void>((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("PUT", url);
		request.setRequestHeader("Content-Type", file.type);

		request.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				onProgress(Math.round((event.loaded / event.total) * 100));
			}
		};
		request.onload = () =>
			request.status >= 200 && request.status < 300
				? resolve()
				: reject(new Error(`El bucket rechazó la subida (${request.status}).`));
		request.onerror = () =>
			reject(new Error("No se pudo conectar con el almacenamiento."));

		request.send(file);
	});

export function LessonUploadField({
	kind,
	current,
	requestTicket,
	onUploaded,
	disabled,
}: {
	kind: LessonUploadKind;
	/** El material ya guardado, para poder reemplazarlo. */
	current: { fileName: string; fileSize: number | null } | null;
	/** Pide al servidor el permiso de subida. `null` si lo rechazó. */
	requestTicket: (file: File) => Promise<UploadTicket | null>;
	onUploaded: (material: UploadedMaterial) => void;
	disabled?: boolean;
}) {
	const limits = uploadLimitsOf(kind);
	const [progress, setProgress] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	const upload = async (file: File) => {
		setError(null);

		// La misma función que valida el servidor antes de firmar: aquí solo
		// ahorra el viaje.
		const reason = validateUploadInput(file, limits);
		if (reason) {
			setError(`No se puede subir: ${reason}.`);
			return;
		}

		setProgress(0);
		try {
			const ticket = await requestTicket(file);
			if (!ticket) return;

			await putToBucket(ticket.uploadUrl, file, setProgress);
			onUploaded({
				key: ticket.key,
				fileName: file.name,
				mimeType: file.type,
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setProgress(null);
		}
	};

	const busy = progress !== null;

	if (busy) {
		return (
			<div className="flex flex-col gap-2 rounded-xl border border-border border-dashed p-5 text-sm">
				<span className="flex items-center gap-2">
					<Loader2 className="size-4 animate-spin" aria-hidden="true" />
					<span className="flex-1">Subiendo…</span>
					<span className="text-muted-foreground tabular-nums">
						{progress}%
					</span>
				</span>
				<span
					className="h-1 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-valuenow={progress ?? 0}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="Avance de la subida"
				>
					<span
						className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
						style={{ width: `${progress}%` }}
					/>
				</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{current ? (
				<div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
					<FileUp
						className="size-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					<span className="flex-1 truncate">{current.fileName}</span>
					{current.fileSize === null ? null : (
						<span className="text-muted-foreground text-xs">
							{megabytes(current.fileSize) || "<1"} MB
						</span>
					)}
				</div>
			) : null}

			<Dropzone
				accept={acceptOf(kind)}
				maxFiles={1}
				maxSize={limits.maxBytes}
				disabled={disabled}
				onError={(cause) => setError(cause.message)}
				onDrop={(files) => {
					const file = files.at(0);
					if (file) void upload(file);
				}}
				className="gap-3 rounded-xl border-dashed bg-transparent py-8 hover:bg-muted/40"
			>
				<span className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground">
					<Upload className="size-4" aria-hidden="true" />
				</span>
				<span className="font-normal text-sm">
					{current
						? "Arrastra otro archivo para reemplazarlo"
						: "Arrastra el archivo aquí"}
				</span>
				{/* La zona entera es el botón: esto solo lo señala. */}
				<span className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-sm">
					Elegir archivo
				</span>
				<span className="font-normal text-muted-foreground text-xs">
					{kind === "VIDEO"
						? `MP4 o WEBM · hasta ${megabytes(limits.maxBytes)} MB`
						: `PDF, imagen, Word, Excel o PowerPoint · hasta ${megabytes(limits.maxBytes)} MB`}
				</span>
			</Dropzone>

			{kind === "VIDEO" ? (
				<p className="text-muted-foreground text-xs">
					No se convierte: lo que subas es lo que se reproduce.
				</p>
			) : null}

			{error ? <p className="text-destructive text-xs">{error}</p> : null}
		</div>
	);
}
