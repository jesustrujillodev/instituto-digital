import type {
	CertificateState,
	CertificateTemplateId,
} from "../domain/certificate.rules";

export const TEMPLATE_LABELS: Record<
	CertificateTemplateId,
	{ label: string; description: string }
> = {
	institucional: {
		label: "Institucional",
		description: "Franja de color con el logo y el texto centrado.",
	},
	minima: {
		label: "Mínima",
		description: "Columna de color a la izquierda y tipografía limpia.",
	},
	marco: {
		label: "Con marco",
		description: "Doble marco de color y el logo en una placa.",
	},
};

export const STATE_LABELS: Record<
	CertificateState,
	{ label: string; hint: string }
> = {
	"never-published": {
		label: "Sin publicar",
		hint: "Se emitirá con el diseño que publiques.",
	},
	published: {
		label: "Publicado",
		hint: "Es el diseño con el que se emitirá.",
	},
	"unpublished-changes": {
		label: "Cambios sin publicar",
		hint: "Se sigue emitiendo con el publicado hasta que publiques estos cambios.",
	},
};
