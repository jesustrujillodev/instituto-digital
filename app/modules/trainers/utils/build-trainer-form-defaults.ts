import type { TrainerDetail } from "../domain/trainer.types";

export interface TrainerFormValues {
	specialty: string;
	institution: string;
	bio: string;
}

/**
 * Valores iniciales del formulario del perfil.
 *
 * Ningún campo puede quedar `undefined`: react-hook-form nacería con inputs no
 * controlados y `isDirty` dejaría de ser fiable, que es lo que gobierna el aviso
 * de cambios sin guardar.
 */
export function buildTrainerFormDefaults(
	trainer?: TrainerDetail | null,
): TrainerFormValues {
	return {
		specialty: trainer?.specialty ?? "",
		institution: trainer?.institution ?? "",
		bio: trainer?.bio ?? "",
	};
}
