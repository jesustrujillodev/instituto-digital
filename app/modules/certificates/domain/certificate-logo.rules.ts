import * as v from "valibot";
import type { AuthContext } from "@/modules/auth/domain/auth.types";

export const INSTITUTIONAL_LOGO = {
	/** Público y con CDN: un logo no es dato sensible y se cachea para siempre. */
	prefix: "media/logos",
	types: ["png", "webp", "svg"] as const,
	maxBytes: 2 * 1024 * 1024,
	maxSvgBytes: 512 * 1024,
	nameMax: 60,
} as const;

/** Los logos los administra la plataforma, no una dependencia. */
export const canManageLogos = (actor: Pick<AuthContext, "role">): boolean =>
	actor.role === "SUPERADMIN";

const documentId = v.pipe(
	v.string("Falta el identificador del logo."),
	v.uuid("El identificador del logo no es válido."),
);

export const certificateLogoRules = {
	upload: v.object({
		name: v.pipe(
			v.string("El nombre del logo debe ser texto."),
			v.trim(),
			v.nonEmpty("Escribe el nombre del logo."),
			v.maxLength(
				INSTITUTIONAL_LOGO.nameMax,
				`El nombre del logo no puede superar los ${INSTITUTIONAL_LOGO.nameMax} caracteres.`,
			),
		),
	}),
	target: v.object({ documentId }),
	archive: v.object({
		documentId,
		archived: v.boolean("Indica si el logo se archiva."),
	}),
} as const;
