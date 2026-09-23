import { Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextInput } from "@/shared/components/common/text-input";
import {
	CERTIFICATE_ACCENTS,
	CERTIFICATE_MIN_LOGO_CONTRAST,
} from "../domain/certificate.config";
import { accentContrastWithWhite } from "../domain/certificate.rules";

const ACCENT_NAMES: Record<(typeof CERTIFICATE_ACCENTS)[number], string> = {
	"#750d2f": "Guinda",
	"#912240": "Guinda claro",
	"#225b4f": "Verde",
	"#ba945c": "Oro",
	"#383838": "Gris",
};

export function CertificateColorPanel({
	value,
	error,
	disabled,
	onChange,
}: {
	value: string;
	error?: string;
	disabled: boolean;
	onChange: (accent: string) => void;
}) {
	const lowContrast =
		!error && accentContrastWithWhite(value) < CERTIFICATE_MIN_LOGO_CONTRAST;

	return (
		<div className="flex flex-col gap-4">
			<fieldset className="flex flex-wrap gap-2">
				<legend className="sr-only">Colores del manual</legend>
				{CERTIFICATE_ACCENTS.map((accent) => {
					const selected = accent === value.toLowerCase();

					return (
						<button
							key={accent}
							type="button"
							aria-pressed={selected}
							aria-label={ACCENT_NAMES[accent]}
							title={ACCENT_NAMES[accent]}
							disabled={disabled}
							onClick={() => onChange(accent)}
							className={cn(
								"flex size-10 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
								selected && "ring-2 ring-foreground",
							)}
							style={{ background: accent }}
						>
							{selected && (
								<Check className="size-4 text-white" aria-hidden="true" />
							)}
						</button>
					);
				})}
			</fieldset>

			<div className="flex items-end gap-3">
				<input
					type="color"
					aria-label="Elegir otro color"
					value={error ? CERTIFICATE_ACCENTS[0] : value}
					disabled={disabled}
					onChange={(event) => onChange(event.target.value)}
					className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1 disabled:cursor-not-allowed"
				/>
				<TextInput
					id="certificate-accent"
					label="Otro color (hex)"
					placeholder="#750d2f"
					value={value}
					disabled={disabled}
					error={error}
					onChange={(event) => onChange(event.target.value.trim())}
				/>
			</div>

			{lowContrast && (
				<p className="flex items-start gap-2 text-sm text-warning-foreground">
					<TriangleAlert
						className="mt-0.5 size-4 shrink-0"
						aria-hidden="true"
					/>
					Es un color claro: el logo del Ayuntamiento, que es blanco, casi no se
					leerá sobre él.
				</p>
			)}
		</div>
	);
}
