import type { CertificateState } from "../domain/certificate.rules";

export const STATE_LABELS: Record<
	CertificateState,
	{ label: string; hint: string }
> = {
	"never-published": {
		label: "Sin publicar",
		hint: "Mientras no lo publiques, se emite con el diseño por defecto.",
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
