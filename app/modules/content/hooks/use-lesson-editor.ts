import { useState } from "react";
import { useFetcherPromise } from "@/shared/hooks/use-fetcher-promise";
import { LESSON_MAX_ESTIMATED_MINUTES } from "../domain/content.config";
import { isHttpUrl, type LessonType } from "../domain/content.rules";
import type { ContentLesson } from "../domain/content.types";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	contentPath,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/content-form";
import { reportSaveFailure } from "../utils/report-save-failure";
import { useLessonMaterial } from "./use-lesson-material";

export interface LessonMeta {
	title: string;
	type: LessonType;
	isRequired: boolean;
	/** Como se escribe en el campo: vacío es "sin estimar". */
	minutes: string;
}

const metaOf = (lesson: ContentLesson): LessonMeta => ({
	title: lesson.title,
	type: lesson.type,
	isRequired: lesson.isRequired,
	minutes:
		lesson.estimatedMinutes === null ? "" : String(lesson.estimatedMinutes),
});

const sameMeta = (a: LessonMeta, b: LessonMeta) =>
	a.title.trim() === b.title.trim() &&
	a.type === b.type &&
	a.isRequired === b.isRequired &&
	a.minutes.trim() === b.minutes.trim();

/** El primer problema del borrador, o `null` si se puede guardar. */
const problemOf = (meta: LessonMeta): string | null => {
	if (meta.title.trim() === "") return "La lección necesita un nombre.";

	const minutes = meta.minutes.trim();
	if (minutes === "") return null;
	const value = Number(minutes);
	if (
		!Number.isInteger(value) ||
		value < 1 ||
		value > LESSON_MAX_ESTIMATED_MINUTES
	) {
		return `Los minutos estimados van de 1 a ${LESSON_MAX_ESTIMATED_MINUTES}.`;
	}
	return null;
};

/**
 * Una lección en edición: su ficha y su material, en borrador.
 *
 * Todo se guarda con `flush`, que llama quien sabe cuándo toca (al cambiar de
 * lección, al cerrar el panel, al continuar). El tipo es la excepción: cambia
 * qué material se captura, así que se guarda en el momento.
 *
 * Quien lo usa monta una instancia por lección (`key` con su `documentId`).
 */
export function useLessonEditor({
	courseDocumentId,
	lesson,
	canWrite,
}: {
	courseDocumentId: string;
	lesson: ContentLesson;
	canWrite: boolean;
}) {
	const saver = useFetcherPromise<ContentActionData>();
	const [saved, setSaved] = useState(() => metaOf(lesson));
	const [draft, setDraft] = useState(() => metaOf(lesson));

	const material = useLessonMaterial({
		courseDocumentId,
		// El material sigue al tipo GUARDADO: el del borrador todavía no existe.
		lesson: {
			documentId: lesson.documentId,
			title: saved.title,
			type: saved.type,
		},
		active: true,
	});

	const metaDirty = !sameMeta(draft, saved);
	const dirty = canWrite && (metaDirty || material.dirty);
	const saving = saver.fetcher.state !== "idle" || material.busy;

	const saveMeta = async (meta: LessonMeta) => {
		const problem = problemOf(meta);
		if (problem) {
			reportSaveFailure("Revisa la lección", problem);
			return false;
		}

		const minutes = meta.minutes.trim();
		const result = await saver.submit(
			{
				[INTENT_FIELD]: CONTENT_INTENTS.updateLesson,
				[PAYLOAD_FIELD]: JSON.stringify({
					lessonDocumentId: lesson.documentId,
					title: meta.title.trim(),
					type: meta.type,
					isRequired: meta.isRequired,
					estimatedMinutes: minutes === "" ? null : Number(minutes),
				}),
			},
			{ method: "post", action: contentPath(courseDocumentId) },
		);

		if (!result?.success) {
			reportSaveFailure("No se pudo guardar la lección", result);
			return false;
		}
		setSaved({ ...meta, title: meta.title.trim(), minutes });
		return true;
	};

	const saveMaterial = async () => {
		if (!material.dirty) return true;

		if (saved.type === "LINK") {
			const link = material.link.trim();
			if (link === "" || !isHttpUrl(link)) {
				reportSaveFailure(
					"Revisa el material",
					"El enlace tiene que ser una dirección web completa, con https://.",
				);
				return false;
			}
		}

		const result = await material.saveDraft();
		if (!result?.success) {
			reportSaveFailure("No se pudo guardar el material", result);
			return false;
		}
		return true;
	};

	/** Guarda lo pendiente. `false` si algo falló: quien llama no debe seguir. */
	const flush = async () => {
		if (!canWrite) return true;
		if (!(await saveMaterial())) return false;
		if (metaDirty && !(await saveMeta(draft))) return false;
		return true;
	};

	// Lo escrito en el material se guarda antes: con el tipo nuevo, ese borrador
	// deja de tener dónde vivir.
	const changeType = async (type: LessonType) => {
		if (type === draft.type) return;
		if (!(await saveMaterial())) return;

		const next = { ...draft, type };
		setDraft(next);
		if (!(await saveMeta(next))) {
			setDraft((current) => ({ ...current, type: saved.type }));
		}
	};

	const update = (patch: Partial<Omit<LessonMeta, "type">>) =>
		setDraft((current) => ({ ...current, ...patch }));

	return {
		draft,
		update,
		changeType,
		flush,
		dirty,
		saving,
		material,
		/** La lección como está guardada: la que el material representa. */
		materialLesson: {
			documentId: lesson.documentId,
			title: saved.title,
			type: saved.type,
		},
	};
}

export type LessonEditor = ReturnType<typeof useLessonEditor>;
