import * as v from "valibot";
import { type CertificateDesignV1, designV1Schema } from "./design-v1.schema";
import { type CertificateDesignV2, designV2Schema } from "./design-v2.schema";

/**
 * Un diseño guardado, de cualquier versión. Un blob sin `version` es v1: así
 * se escribieron todos antes del editor libre, borradores y snapshots.
 */
export const certificateDesignSchema = v.pipe(
	v.unknown(),
	v.transform((blob) =>
		blob && typeof blob === "object" && !("version" in blob)
			? { ...blob, version: 1 }
			: blob,
	),
	v.variant(
		"version",
		[
			v.pipe(
				v.object({ ...designV1Schema.entries, version: v.literal(1) }),
				v.transform(({ version: _, ...design }) => design),
			),
			designV2Schema,
		],
		"El diseño del certificado no es válido.",
	),
);

export type CertificateDesign = CertificateDesignV1 | CertificateDesignV2;

export const isDesignV2 = (
	design: CertificateDesign,
): design is CertificateDesignV2 => "version" in design && design.version === 2;
