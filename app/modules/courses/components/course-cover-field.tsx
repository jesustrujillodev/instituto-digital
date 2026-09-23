import { ImageUp, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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
				className={cn(
					"group w-full overflow-hidden p-0",
					// La vista previa guarda la proporción de la tarjeta del catálogo; el
					// hueco vacío es solo un blanco donde soltar, y ocupa el ancho entero.
					shownUrl && "aspect-video sm:max-w-md",
				)}
			>
				{shownUrl ? (
					<>
						<img
							src={shownUrl}
							alt="Portada del curso"
							className="size-full object-cover"
						/>
						{/* El velo sube a 80%: al 60% sobre una foto clara el texto se
						    queda por debajo de 4.5:1 en modo claro. Y se revela también
						    con el foco: con solo `group-hover` quien navega con teclado
						    no ve nunca que la portada se puede cambiar. */}
						<span className="absolute inset-0 flex items-center justify-center gap-2 bg-foreground/80 text-background opacity-0 transition-opacity duration-200 group-focus-visible:opacity-100 group-hover:opacity-100">
							<ImageUp className="size-5" aria-hidden="true" />
							Cambiar portada
						</span>
					</>
				) : (
					<span className="flex flex-col items-center gap-2 p-8 text-muted-foreground">
						{isProcessing ? (
							<Loader2 className="size-6 animate-spin" aria-hidden="true" />
						) : (
							<ImageUp className="size-6" aria-hidden="true" />
						)}
						<span className="font-medium text-foreground text-sm">
							{isProcessing
								? "Preparando la imagen…"
								: "Arrastra una imagen o haz clic"}
						</span>
						<span className="text-xs">{COURSE_COVER_HINT}</span>
					</span>
				)}
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
