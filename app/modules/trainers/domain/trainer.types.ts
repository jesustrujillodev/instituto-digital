import * as v from "valibot";
import type { AppResponse } from "@/shared/response/response.types";
import { createResponseSchema } from "@/shared/rules/response.rules";
import type {
	activateProfileRule,
	createExternalTrainerRule,
	findTrainerRule,
	listTrainersRule,
	updateProfileRule,
} from "./trainer.rules";
import { trainerDetailSchema, trainerSummarySchema } from "./trainer.rules";

export type TrainerSummary = v.InferOutput<typeof trainerSummarySchema>;
export type TrainerDetail = v.InferOutput<typeof trainerDetailSchema>;
export type TrainerStats = Pick<
	TrainerDetail,
	"coursesTaught" | "averageRating"
>;

export type ActivateProfileDto = v.InferInput<typeof activateProfileRule>;
export type UpdateProfileDto = v.InferInput<typeof updateProfileRule>;
export type CreateExternalTrainerDto = v.InferInput<
	typeof createExternalTrainerRule
>;
export type FindTrainerDto = v.InferInput<typeof findTrainerRule>;
export type ListTrainersDto = v.InferInput<typeof listTrainersRule>;

/**
 * Lo que el repositorio ESCRIBE al crear un perfil. El `userId` interno ya está
 * traducido y la institución ya pasó por la coherencia interno/externo.
 */
export interface CreateProfileData {
	userId: number;
	specialty: string;
	institution: string | null;
	bio: string | null;
}

// ===============================================================
// Contrato de respuesta del modulo
// ===============================================================

export type TrainerResponse = AppResponse<TrainerDetail>;
export type TrainerListResponse = AppResponse<TrainerSummary[]>;

export const trainerResponseSchema = createResponseSchema(trainerDetailSchema);

export const trainerListResponseSchema = createResponseSchema(
	v.array(trainerSummarySchema),
);
