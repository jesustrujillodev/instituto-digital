import type { TrainerSummary } from "../domain/trainer.types";

/**
 * Fila de la tabla: el catálogo con el `id` de tipo string que exige DataTable.
 *
 * El identificador es el `documentId` de la CUENTA porque el perfil no tiene uno
 * propio: su identidad es la de la persona.
 */
export type TrainerRow = TrainerSummary & { id: string };

export const toTrainerRows = (trainers: TrainerSummary[]): TrainerRow[] =>
	trainers.map((trainer) => ({ ...trainer, id: trainer.userDocumentId }));

/** Nombre completo, o el correo cuando la cuenta no lo tiene capturado. */
export const fullNameOf = (
	trainer: Pick<TrainerSummary, "firstName" | "lastName" | "email">,
) =>
	[trainer.firstName, trainer.lastName].filter(Boolean).join(" ").trim() ||
	trainer.email;

/** De dónde viene: su dependencia si es interno, su institución si es externo. */
export const originOf = (
	trainer: Pick<TrainerSummary, "type" | "dependencyName" | "institution">,
) =>
	trainer.type === "EXTERNAL"
		? (trainer.institution ?? "Externo")
		: (trainer.dependencyName ?? "Sin dependencia");
