import { useMemo, useState } from "react";
import * as v from "valibot";
import { toFieldErrors } from "@/shared/rules/format-vali-error";
import {
	certificateDesignSchema,
	designsEqual,
} from "../domain/certificate.rules";
import type {
	CertificateDesign,
	CertificateSignatory,
} from "../domain/certificate.types";

type SignatoryIndex = 0 | 1;

/**
 * El borrador que se edita, frente al último guardado.
 *
 * Se resincroniza cuando cambia lo guardado —tras guardar, descartar o volver a
 * cargar—, y solo entonces: una revalidación que devuelve lo mismo no pisa lo
 * que se está escribiendo. Mismo criterio que `use-theme-draft.ts`.
 */
export const useCertificateDraft = (saved: CertificateDesign) => {
	const fingerprint = JSON.stringify(saved);
	const [synced, setSynced] = useState(fingerprint);
	const [draft, setDraft] = useState(saved);

	if (synced !== fingerprint) {
		setSynced(fingerprint);
		setDraft(saved);
	}

	const errors = useMemo(() => {
		const result = v.safeParse(certificateDesignSchema, draft);
		return result.success ? {} : toFieldErrors(result.issues);
	}, [draft]);

	const update = (patch: Partial<Omit<CertificateDesign, "signatories">>) =>
		setDraft((current) => ({ ...current, ...patch }));

	const updateSignatory = (
		index: SignatoryIndex,
		patch: Partial<CertificateSignatory>,
	) =>
		setDraft((current) => {
			const signatories = [...current.signatories] as [
				CertificateSignatory,
				CertificateSignatory,
			];
			signatories[index] = { ...signatories[index], ...patch };
			return { ...current, signatories };
		});

	return {
		draft,
		errors,
		isValid: Object.keys(errors).length === 0,
		isDirty: !designsEqual(draft, saved),
		update,
		updateSignatory,
		reset: () => setDraft(saved),
	};
};

export type CertificateDraft = ReturnType<typeof useCertificateDraft>;
