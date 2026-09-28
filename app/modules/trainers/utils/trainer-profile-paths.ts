/** Endpoint de las mutaciones del perfil de una cuenta. */
export const trainerProfileActionPath = (userDocumentId: string) =>
	`/dashboard/usuarios/${userDocumentId}/perfil-capacitador`;

/** La tabla de usuarios filtrada a quienes tienen el perfil activo. */
export const TRAINERS_LIST_PATH = "/dashboard/usuarios?trainer=yes";
