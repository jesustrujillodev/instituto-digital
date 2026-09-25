import { ImageIcon, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Dropzone } from "@/shared/components/ui/dropzone";
import { Label } from "@/shared/components/ui/label";
import { validateUploadInput } from "@/shared/storage/upload-validation";
import { COURSE_COVER, COURSE_COVER_HINT } from "../domain/course.config";
import { resizeCoverImage } from "../utils/resize-cover-image";

const ACCEPT = Object.fromEntries(
	COURSE_COVER.allowedTypes.map((type) => [type, []]),
);

/**
 * Traduce el rechazo de react-dropzone.
 *
 * Sus mensajes vienen en inglés y con el tamaño en bytes crudos; debajo de una
 * etiqueta en español eso no es un error, es ruido.
 */
const coverRejectionMessage = (error: Error): string => {
	const raw = error.message ?? "";

	if (raw.includes("larger than")) {
		const megabytes = COURSE_COVER.maxSourceBytes / (1024 * 1024);
		return `La imagen pesa demasiado: el máximo son ${megabytes} MB.`;
	}
	if (raw.includes("file type")) {
		return "Ese formato no se admite. Usa PNG, JPG o WEBP.";
	}

	return "No se pudo usar esa imagen. Prueba con otra.";
};

interface CourseCoverFieldProps {
	id: string;
	/** Portada nueva elegida en esta sesión de edición. */
	value: File | null;
	/** La que ya está guardada, al editar. */
	existingUrl?: string | null;
	/** La guardada se va a borrar al guardar. */
	removed: boolean;
	onChange: (file: File | null) => void;
	onRemove: () => void;
}

/**
 * Portada del curso, fuera de react-hook-form.
 *
 * La portada no participa en ninguna regla de `createCourseRule`: viaja por su
 * propio campo del multipart. Meterla en el resolver obligaría a declarar un
 * `File` en un contrato que también corre en el servidor, donde ya no lo es
 * (guía de formularios §10.4).
 */
export function CourseCoverField({
	id,
	value,
	existingUrl,
	removed,
	onChange,
	onRemove,
}: CourseCoverFieldProps) {
	const [error, setError] = useState<string | null>(null);
	const [isProcessing, setProcessing] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	// El object URL se revoca al cambiar de archivo y al desmontar: sin esto el
	// navegador retiene el blob durante toda la sesión.
	useEffect(() => {
		if (!value) {
			setPreviewUrl(null);
			return;
		}

		const url = URL.createObjectURL(value);
		setPreviewUrl(url);

		return () => URL.revokeObjectURL(url);
	}, [value]);

	const handleDrop = async (files: File[]) => {
		const original = files.at(0);
		if (!original) return;

		setError(null);
		setProcessing(true);

		try {
			// Se reescala ANTES de validar: el tope aplica al archivo que de verdad
			// se sube, y una foto de teléfono de 8 MB cabe de sobra ya recortada.
			const resized = await resizeCoverImage(original);
			const reason = validateUploadInput(resized, {
				allowedTypes: COURSE_COVER.allowedTypes,
				maxBytes: COURSE_COVER.maxBytes,
			});

			if (reason) {
				setError(`No se puede usar esta imagen: ${reason}`);
				onChange(null);
				return;
			}

			onChange(resized);
		} finally {
			setProcessing(false);
		}
	};

	const shownUrl = previewUrl ?? (removed ? null : (existingUrl ?? null));
	const canRemove = Boolean(value) || (Boolean(existingUrl) && !removed);

	return (
		<div className="grid w-full items-center gap-1.5">
			<Label id={id} className="font-medium text-foreground text-sm">
				Portada
			</Label>

			<Dropzone
				accept={ACCEPT}
				maxFiles={1}
				maxSize={COURSE_COVER.maxSourceBytes}
				disabled={isProcessing}
				onDrop={handleDrop}
				onError={(dropError) => setError(coverRejectionMessage(dropError))}
				aria-labelledby={id}
				className="h-auto w-full flex-row items-center justify-start gap-5 whitespace-normal rounded-xl border-dashed bg-transparent p-5 text-left hover:bg-muted/40"
			>
				<span className="relative flex aspect-video w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground sm:w-40">
					{isProcessing ? (
						<Loader2 className="size-5 animate-spin" aria-hidden="true" />
					) : shownUrl ? (
						<img
							src={shownUrl}
							alt="Portada del curso"
							className="size-full object-cover"
						/>
					) : (
						<ImageIcon className="size-5" aria-hidden="true" />
					)}
				</span>
				<span className="flex min-w-0 flex-col gap-1">
					<span className="font-medium text-foreground text-sm">
						{isProcessing ? (
							"Preparando la imagen…"
						) : (
							<>
								{shownUrl
									? "Arrastra otra imagen o "
									: "Arrastra una imagen o "}
								<span className="text-primary underline underline-offset-4">
									elige un archivo
								</span>
							</>
						)}
					</span>
					<span className="font-normal text-muted-foreground text-xs">
						{COURSE_COVER_HINT}
					</span>
				</span>
			</Dropzone>

			<div className="flex min-h-8 flex-wrap items-center gap-2">
				{canRemove && (
					<Button type="button" variant="ghost" size="sm" onClick={onRemove}>
						<X className="size-4" />
						Quitar portada
					</Button>
				)}
				{value && (
					<span className="truncate text-muted-foreground text-xs">
						{value.name}
					</span>
				)}
			</div>

			{error && (
				<span className="text-destructive text-sm" role="alert">
					{error}
				</span>
			)}
		</div>
	);
}
