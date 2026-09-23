import { ImageUp, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { TextInput } from "@/shared/components/common/text-input";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Dropzone } from "@/shared/components/ui/dropzone";
import { Label } from "@/shared/components/ui/label";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { validateUploadInput } from "@/shared/storage/upload-validation";
import {
	CERTIFICATE_SIGNATURE,
	CERTIFICATE_SIGNATURE_HINT,
	CERTIFICATE_TEXT_LIMITS,
} from "../domain/certificate.config";
import type { CertificateSignatory } from "../domain/certificate.types";
import type { CertificateDraft } from "../hooks/use-certificate-draft";
import {
	CERTIFICATE_INTENTS,
	type CertificateActionData,
	FILE_FIELD,
	INTENT_FIELD,
} from "../utils/certificate-form";
import { resizeSignatureImage } from "../utils/resize-signature-image";

const ACCEPT = Object.fromEntries(
	CERTIFICATE_SIGNATURE.allowedTypes.map((type) => [type, []]),
);

/**
 * Una firma y quien la suscribe.
 *
 * La imagen se sube en cuanto se elige, y el diseño guarda solo la referencia
 * que devuelve el servidor: una vista previa local (`blob:`) nunca llega a la
 * base de datos.
 */
function SignatoryCard({
	index,
	signatory,
	errors,
	disabled,
	onChange,
}: {
	index: 0 | 1;
	signatory: CertificateSignatory;
	errors: Record<string, string>;
	disabled: boolean;
	onChange: (patch: Partial<CertificateSignatory>) => void;
}) {
	const fetcher = useFetcher<CertificateActionData>();
	useFetcherToast(fetcher);
	const [error, setError] = useState<string | null>(null);
	const [preparing, setPreparing] = useState(false);
	const uploading = preparing || fetcher.state !== "idle";

	const uploaded =
		fetcher.data?.success === true ? fetcher.data.data?.signatureUrl : null;

	// Cada subida entra al borrador UNA vez: la respuesta del fetcher se queda
	// ahí, y reaplicarla en cada render no dejaría quitar la imagen después.
	const applied = useRef<string | null>(null);
	const latestOnChange = useRef(onChange);
	latestOnChange.current = onChange;

	useEffect(() => {
		if (!uploaded || applied.current === uploaded) return;
		applied.current = uploaded;
		latestOnChange.current({ signatureUrl: uploaded });
	}, [uploaded]);

	const handleDrop = async (files: File[]) => {
		const [file] = files;
		if (!file) return;

		setError(null);
		setPreparing(true);
		try {
			const resized = await resizeSignatureImage(file);
			const reason = validateUploadInput(resized, CERTIFICATE_SIGNATURE);
			if (reason) {
				setError(
					`La imagen no sirve como firma: ${CERTIFICATE_SIGNATURE_HINT}.`,
				);
				return;
			}

			const form = new FormData();
			form.set(INTENT_FIELD, CERTIFICATE_INTENTS.uploadSignature);
			form.set(FILE_FIELD, resized);
			fetcher.submit(form, { method: "post", encType: "multipart/form-data" });
		} finally {
			setPreparing(false);
		}
	};

	const prefix = `signatories.${index}`;
	const id = `certificate-signatory-${index}`;

	return (
		<fieldset className="flex flex-col gap-3 rounded-lg border p-4">
			<legend className="px-1 font-medium text-sm">Firma {index + 1}</legend>

			<div className="flex items-center gap-2">
				<Checkbox
					id={`${id}-enabled`}
					checked={signatory.enabled}
					disabled={disabled}
					onCheckedChange={(checked) => onChange({ enabled: checked === true })}
				/>
				<Label htmlFor={`${id}-enabled`} className="font-normal">
					Aparece en el certificado
				</Label>
			</div>

			{signatory.enabled && (
				<>
					<TextInput
						id={`${id}-name`}
						label="Nombre"
						maxLength={CERTIFICATE_TEXT_LIMITS.signatoryName}
						value={signatory.name}
						disabled={disabled}
						error={errors[`${prefix}.name`]}
						onChange={(event) => onChange({ name: event.target.value })}
					/>
					<TextInput
						id={`${id}-role`}
						label="Cargo"
						maxLength={CERTIFICATE_TEXT_LIMITS.signatoryRole}
						value={signatory.role}
						disabled={disabled}
						error={errors[`${prefix}.role`]}
						onChange={(event) => onChange({ role: event.target.value })}
					/>

					<div className="flex flex-col gap-1.5">
						<Label id={`${id}-image`}>Imagen de la firma</Label>
						<Dropzone
							accept={ACCEPT}
							maxFiles={1}
							maxSize={CERTIFICATE_SIGNATURE.maxSourceBytes}
							disabled={disabled || uploading}
							onDrop={handleDrop}
							onError={() =>
								setError(
									`La imagen no sirve como firma: ${CERTIFICATE_SIGNATURE_HINT}.`,
								)
							}
							aria-labelledby={`${id}-image`}
							className="h-24 w-full p-2"
						>
							{signatory.signatureUrl ? (
								<img
									src={signatory.signatureUrl}
									alt={`Firma de ${signatory.name}`}
									className="h-full w-full object-contain"
								/>
							) : (
								<span className="flex flex-col items-center gap-1 text-muted-foreground text-xs">
									{uploading ? (
										<Loader2
											className="size-5 animate-spin"
											aria-hidden="true"
										/>
									) : (
										<ImageUp className="size-5" aria-hidden="true" />
									)}
									{uploading ? "Subiendo…" : CERTIFICATE_SIGNATURE_HINT}
								</span>
							)}
						</Dropzone>
						{error && <p className="text-destructive text-xs">{error}</p>}
						{signatory.signatureUrl && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="self-start"
								disabled={disabled}
								onClick={() => onChange({ signatureUrl: null })}
							>
								<X className="size-4" aria-hidden="true" />
								Quitar imagen
							</Button>
						)}
					</div>
				</>
			)}
		</fieldset>
	);
}

export function CertificateSignaturesPanel({
	draft,
	disabled,
}: {
	draft: CertificateDraft;
	disabled: boolean;
}) {
	const { draft: design, errors, updateSignatory } = draft;

	return (
		<div className="flex flex-col gap-4">
			{([0, 1] as const).map((index) => (
				<SignatoryCard
					key={index}
					index={index}
					signatory={design.signatories[index]}
					errors={errors}
					disabled={disabled}
					onChange={(patch) => updateSignatory(index, patch)}
				/>
			))}
		</div>
	);
}
