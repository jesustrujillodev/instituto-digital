import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/ui/dialog";
import type {
	CertificateDesignV2,
	CertificateRenderData,
	CertificateTemplateView,
} from "../../domain/certificate.types";
import { BlankDesignPicker } from "./blank-design-picker";
import { PropertySection } from "./fields";
import { TemplateLibrary } from "./template-library";
import { PRESET_CHOICES, TemplateGrid } from "./templates-panel";

interface StartDialogProps {
	data: CertificateRenderData;
	logoUrls: Record<string, string>;
	templates: readonly CertificateTemplateView[];
	actionPath: string;
	folioFormat: string;
	apply: (design: CertificateDesignV2, name: string) => void;
}

/**
 * Cómo empezar un certificado que aún no tiene diseño: en blanco, desde un
 * diseño de partida o desde la biblioteca. Cerrarlo deja el institucional.
 */
export function StartDialog({
	data,
	logoUrls,
	templates,
	actionPath,
	folioFormat,
	apply,
}: StartDialogProps) {
	const [open, setOpen] = useState(true);

	const choose = (design: CertificateDesignV2, name: string) => {
		apply(design, name);
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
				<DialogHeader className="border-b p-5">
					<DialogTitle>¿Cómo quieres empezar?</DialogTitle>
					<DialogDescription>
						Esta capacitación aún no tiene certificado. Si cierras este aviso,
						empiezas con el diseño institucional.
					</DialogDescription>
				</DialogHeader>

				<PropertySection title="Documento en blanco">
					<BlankDesignPicker
						data={data}
						logoUrls={logoUrls}
						folioFormat={folioFormat}
						layout="wide"
						onChoose={(design) => choose(design, "En blanco")}
					/>
				</PropertySection>

				<PropertySection title="Diseños de partida">
					<div className="[&>div]:grid-cols-3">
						<TemplateGrid
							choices={PRESET_CHOICES}
							data={data}
							logoUrls={logoUrls}
							readOnly={false}
							onChoose={(choice) => choose(choice.design, choice.name)}
						/>
					</div>
				</PropertySection>

				<div className="[&_.grid]:grid-cols-3">
					<TemplateLibrary
						templates={templates}
						data={data}
						logoUrls={logoUrls}
						readOnly={false}
						actionPath={actionPath}
						onApply={(design, name) => choose(design, name)}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
