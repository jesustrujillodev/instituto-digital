import type { AppResponse } from "@/shared/response/response.types";
import type { ClassroomStop } from "../domain/classroom.types";
import type { ContentCreated } from "../domain/content.types";
import { FINAL_QUIZ_OWNER } from "../domain/quiz.rules";
import type { QuizOwnerRef } from "../domain/quiz.types";

export const INTENT_FIELD = "intent";
export const PAYLOAD_FIELD = "payload";

export const CONTENT_INTENTS = {
	createModule: "create-module",
	updateModule: "update-module",
	archiveModule: "archive-module",
	createLesson: "create-lesson",
	updateLesson: "update-lesson",
	archiveLesson: "archive-lesson",
	reorder: "reorder",
	uploadUrl: "upload-url",
	saveMaterial: "save-material",
	saveQuiz: "save-quiz",
	renameQuiz: "rename-quiz",
	archiveModuleQuiz: "archive-module-quiz",
	submitQuiz: "submit-quiz",
	grantRetake: "grant-retake",
} as const;

export type ContentActionData = AppResponse<ContentCreated | null>;

export const contentPath = (courseDocumentId: string) =>
	`/dashboard/cursos/${courseDocumentId}/contenido`;

/**
 * La ruta del material de una lección.
 *
 * Es aparte del temario para que el árbol no cargue el cuerpo de cada lección:
 * el panel lo pide con `fetcher.load` cuando se abre, y escribe contra la misma
 * ruta. Así las dos superficies —el paso del alta y la pantalla del curso
 * publicado— siguen montando el mismo panel.
 */
export const materialPath = (
	courseDocumentId: string,
	lessonDocumentId: string,
) => `${contentPath(courseDocumentId)}/${lessonDocumentId}`;

export const LESSON_PARAM = "leccion";
export const MODULE_PARAM = "modulo";

/**
 * El banco de un cuestionario, para quien lo arma: el examen del curso o, con
 * `?leccion=` o `?modulo=`, la práctica de esa lección o la evaluación de ese
 * módulo. Sin componente: lo leen y le escriben el paso de Evaluación y el
 * panel del temario.
 */
export const quizPath = (
	courseDocumentId: string,
	owner: QuizOwnerRef = FINAL_QUIZ_OWNER,
) => {
	const base = `/dashboard/cursos/${courseDocumentId}/cuestionario`;
	if (owner.lessonDocumentId) {
		return `${base}?${LESSON_PARAM}=${owner.lessonDocumentId}`;
	}
	if (owner.moduleDocumentId) {
		return `${base}?${MODULE_PARAM}=${owner.moduleDocumentId}`;
	}
	return base;
};

export const classroomPath = (courseDocumentId: string) =>
	`/dashboard/mis-cursos/${courseDocumentId}/aula`;

export const examPath = (courseDocumentId: string) =>
	`${classroomPath(courseDocumentId)}/examen`;

/** A dónde lleva una parada del aula: una lección o la evaluación de un módulo. */
export const stopPath = (courseDocumentId: string, stop: ClassroomStop) =>
	stop.kind === "LESSON"
		? `${classroomPath(courseDocumentId)}/${stop.documentId}`
		: `${classroomPath(courseDocumentId)}/modulo/${stop.documentId}`;

/** Donde quien imparte habilita otro intento de una evaluación de módulo. */
export const retakePath = (courseDocumentId: string) =>
	`/dashboard/imparticion/${courseDocumentId}/cuestionarios`;

export interface ParsedContentFormData {
	intent: string | null;
	/** `undefined` si falta o no es JSON: la validación lo rechaza después. */
	payload: unknown;
}

/** Un JSON en un solo campo, igual que el resto de paneles del proyecto. */
export function parseContentFormData(
	formData: FormData,
): ParsedContentFormData {
	const intent = formData.get(INTENT_FIELD);
	const raw = formData.get(PAYLOAD_FIELD);

	let payload: unknown;
	if (typeof raw === "string") {
		try {
			payload = JSON.parse(raw);
		} catch {
			payload = undefined;
		}
	}

	return { intent: typeof intent === "string" ? intent : null, payload };
}
