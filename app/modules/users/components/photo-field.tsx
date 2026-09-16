import { ImageUp, User as UserIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { validateUploadInput } from "@/shared/storage/upload-validation";
import { USER_PHOTO, USER_PHOTO_HINT } from "../domain/user.config";
import { PHOTO_FIELD } from "../utils/parse-user-form-data";

interface PhotoFieldProps {
	id: string;
	value: File | null;
	/** Referencia ya persistida (proxy de storage) cuando se está editando. */
	existingUrl?: string | null;
	/** Iniciales que se muestran mientras no hay imagen; sin ellas, un icono. */
	fallback: string | null;
	onChange: (file: File | null) => void;
}

/**
 * Campo de foto de perfil, fuera de react-hook-form.
 *
 * La foto no forma parte de createUserRule/updateUserRule: viaja por separado en
 * el multipart y se persiste con su propio caso de uso. Meterla en el resolver
 * obligaría a declarar un `File` en un contrato que también corre en el
 * servidor, donde ya no es un `File` del navegador.
 */
export function PhotoField({
	id,
	value,
	existingUrl,
	fallback,
	onChange,
}: PhotoFieldProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(null);
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

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0] ?? null;

		if (!file) {
			setError(null);
			onChange(null);
			return;
		}

		// Mismo validador y mismos límites que corre el servicio al subirla.
		const reason = validateUploadInput(file, {
			allowedTypes: USER_PHOTO.allowedTypes,
			maxBytes: USER_PHOTO.maxBytes,
		});

		if (reason) {
			setError(`No se puede usar esta imagen: ${reason}`);
			onChange(null);
			event.target.value = "";
			return;
		}

		setError(null);
		onChange(file);
	};

	const clear = () => {
		setError(null);
		onChange(null);
		if (inputRef.current) inputRef.current.value = "";
	};

	const shownUrl = previewUrl ?? existingUrl ?? undefined;

	return (
		<div className="grid w-full items-center gap-1.5">
			<Label htmlFor={id} className="text-sm font-medium text-foreground">
				Foto de perfil
			</Label>

			<div className="flex items-center gap-4">
				{/* Sin `size="lg"`: su `data-[size=lg]:size-10` gana a cualquier
				    `size-*` de className y el avatar se quedaba en 40px. */}
				<Avatar className="size-16">
					{shownUrl && <AvatarImage src={shownUrl} alt="" />}
					<AvatarFallback className="text-lg">
						{fallback ?? <UserIcon className="size-6" aria-hidden="true" />}
					</AvatarFallback>
				</Avatar>

				<div className="flex flex-col gap-1.5">
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => inputRef.current?.click()}
						>
							<ImageUp className="h-4 w-4" />
							{shownUrl ? "Cambiar foto" : "Subir foto"}
						</Button>

						{value && (
							<Button type="button" variant="ghost" size="sm" onClick={clear}>
								<X className="h-4 w-4" />
								Quitar
							</Button>
						)}
					</div>

					<span className="text-sm text-muted-foreground">
						{value ? value.name : USER_PHOTO_HINT}
					</span>
				</div>
			</div>

			{/* Un input de archivo no se puede precargar por seguridad del
			    navegador: el estado "ya hay foto" es nuestro, no del DOM. */}
			<input
				ref={inputRef}
				id={id}
				name={PHOTO_FIELD}
				type="file"
				accept={USER_PHOTO.allowedTypes.join(",")}
				className="sr-only"
				onChange={handleChange}
			/>

			{error && (
				<span className="text-sm text-destructive" role="alert">
					{error}
				</span>
			)}
		</div>
	);
}
