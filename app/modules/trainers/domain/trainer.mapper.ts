import * as v from "valibot";
import { TRAINER_STATS_PENDING } from "./trainer.config";
import { trainerDetailSchema, trainerSummarySchema } from "./trainer.rules";
import type { TrainerDetail, TrainerSummary } from "./trainer.types";

/**
 * Fila del perfil con su cuenta unida → fila del catálogo.
 *
 * Aplana la relación en la frontera para que ninguna capa de arriba conozca la
 * forma del join.
 */
export const toSummary = (raw: {
	specialty: string;
	institution: string | null;
	archivedAt: Date | null;
	user: {
		documentId: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		type: string;
		dependency: { name: string } | null;
	};
}): TrainerSummary =>
	v.parse(trainerSummarySchema, {
		userDocumentId: raw.user.documentId,
		firstName: raw.user.firstName,
		lastName: raw.user.lastName,
		email: raw.user.email,
		type: raw.user.type,
		specialty: raw.specialty,
		institution: raw.institution,
		dependencyName: raw.user.dependency?.name ?? null,
		archivedAt: raw.archivedAt,
	});

/**
 * Lo mismo, con los campos de la ficha.
 *
 * `coursesTaught` y `averageRating` salen de `TRAINER_STATS_PENDING` hasta que
 * PRD-03 y PRD-06 creen sus tablas.
 */
export const toDetail = (raw: {
	specialty: string;
	institution: string | null;
	bio: string | null;
	archivedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	user: {
		documentId: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		phone: string | null;
		type: string;
		dependency: { name: string } | null;
	};
}): TrainerDetail =>
	v.parse(trainerDetailSchema, {
		...toSummary(raw),
		phone: raw.user.phone,
		bio: raw.bio,
		createdAt: raw.createdAt,
		updatedAt: raw.updatedAt,
		...TRAINER_STATS_PENDING,
	});
