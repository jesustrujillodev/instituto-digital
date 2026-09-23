import { TextInput } from "@/shared/components/common/text-input";
import { TextareaInput } from "@/shared/components/common/textarea-input";
import { CERTIFICATE_TEXT_LIMITS } from "../domain/certificate.config";
import type { CertificateDraft } from "../hooks/use-certificate-draft";

/** Los textos que decide quien diseña; los del curso y la persona los pone la emisión. */
export function CertificateContentPanel({
	draft,
	courseDescription,
	sampleFolio,
	disabled,
}: {
	draft: CertificateDraft;
	courseDescription: string | null;
	sampleFolio: string;
	disabled: boolean;
}) {
	const { draft: design, errors, update } = draft;

	return (
		<div className="flex flex-col gap-4">
			<TextInput
				id="certificate-subtitle"
				label="Subtítulo"
				placeholder="Programa anual de capacitación 2026"
				maxLength={CERTIFICATE_TEXT_LIMITS.subtitle}
				value={design.subtitle}
				disabled={disabled}
				error={errors.subtitle}
				helperText="Opcional. Va sobre el nombre de quien recibe."
				onChange={(event) => update({ subtitle: event.target.value })}
			/>

			<TextareaInput
				id="certificate-description"
				label="Descripción"
				rows={4}
				maxLength={CERTIFICATE_TEXT_LIMITS.description}
				placeholder={courseDescription ?? "Qué acredita este certificado."}
				value={design.description}
				disabled={disabled}
				error={errors.description}
				helperText="Vacía, el certificado usa la descripción del curso."
				onChange={(event) => update({ description: event.target.value })}
			/>

			<TextInput
				id="certificate-folio"
				label="Formato del folio"
				placeholder="{year}-{seq}"
				maxLength={CERTIFICATE_TEXT_LIMITS.folioFormat}
				value={design.folioFormat}
				disabled={disabled}
				error={errors.folioFormat}
				helperText={`{seq} es el consecutivo, {year} el año y {month} el mes. El primero saldría: ${sampleFolio}`}
				onChange={(event) => update({ folioFormat: event.target.value })}
			/>
		</div>
	);
}
