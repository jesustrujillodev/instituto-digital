import type { ReactNode } from "react";
import type { CertificateRenderData } from "../../domain/certificate.types";
import { PRESET_LABELS, PRESETS } from "../../domain/design/design.presets";
import { CERTIFICATE_TEMPLATE_IDS } from "../../domain/design/design-v1.schema";
import type { CertificateDesignV2 } from "../../domain/design/design-v2.schema";
import { BlankDesignPicker } from "./blank-design-picker";
import { DesignThumbnail } from "./design-thumbnail";
import { PropertySection } from "./fields";

export interface TemplateChoice {
	id: string;
	name: string;
	design: CertificateDesignV2;
	/** Una plantilla de la biblioteca: aplicarla copia sus imágenes al curso. */
	documentId?: string;
}

interface TemplatesPanelProps {
	data: CertificateRenderData;
	logoUrls: Record<string, string>;
	readOnly: boolean;
	onChoose: (choice: TemplateChoice) => void;
	/** La biblioteca, si la pantalla la ofrece. */
	library?: ReactNode;
	/** Para el documento en blanco: conserva el folio y arranca con esta página. */
	folioFormat: string;
	page: CertificateDesignV2["page"];
}

export const PRESET_CHOICES: TemplateChoice[] = CERTIFICATE_TEMPLATE_IDS.map(
	(id) => ({
		id: `preset-${id}`,
		name: PRESET_LABELS[id],
		design: PRESETS[id],
	}),
);

export function TemplateGrid({
	choices,
	data,
	logoUrls,
	readOnly,
	onChoose,
}: Omit<TemplatesPanelProps, "library" | "folioFormat" | "page"> & {
	choices: readonly TemplateChoice[];
}) {
	return (
		<div className="grid grid-cols-2 gap-3">
			{choices.map((choice) => (
				<button
					key={choice.id}
					type="button"
					disabled={readOnly}
					onClick={() => onChoose(choice)}
					className="flex flex-col gap-1.5 rounded-md p-1 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
				>
					<DesignThumbnail
						design={choice.design}
						data={data}
						logoUrls={logoUrls}
						label={choice.name}
					/>
					<span className="truncate">{choice.name}</span>
				</button>
			))}
		</div>
	);
}

/**
 * Documento en blanco, diseños de partida y biblioteca. Elegir uno reemplaza el
 * diseño en pantalla, conserva el formato del folio y se puede deshacer.
 */
export function TemplatesPanel({
	data,
	logoUrls,
	readOnly,
	onChoose,
	library,
	folioFormat,
	page,
}: TemplatesPanelProps) {
	return (
		<div className="flex flex-col">
			<PropertySection title="Documento en blanco">
				<BlankDesignPicker
					data={data}
					logoUrls={logoUrls}
					folioFormat={folioFormat}
					initialPage={page}
					readOnly={readOnly}
					layout="narrow"
					onChoose={(design) =>
						onChoose({ id: "blank", name: "En blanco", design })
					}
				/>
			</PropertySection>
			<PropertySection title="Diseños de partida">
				<TemplateGrid
					choices={PRESET_CHOICES}
					data={data}
					logoUrls={logoUrls}
					readOnly={readOnly}
					onChoose={onChoose}
				/>
			</PropertySection>
			{library}
		</div>
	);
}
