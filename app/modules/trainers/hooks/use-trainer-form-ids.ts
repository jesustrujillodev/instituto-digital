import { useFormIds } from "@/shared/hooks/use-form-ids";

const PROFILE_KEYS = ["specialty", "institution", "bio"] as const;

export type TrainerFormIds = ReturnType<typeof useTrainerFormIds>;

export const useTrainerFormIds = () => useFormIds(PROFILE_KEYS);

const EXTERNAL_KEYS = [
	"firstName",
	"lastName",
	"email",
	"password",
	"phone",
	"specialty",
	"institution",
	"bio",
] as const;

export type ExternalTrainerFormIds = ReturnType<
	typeof useExternalTrainerFormIds
>;

export const useExternalTrainerFormIds = () => useFormIds(EXTERNAL_KEYS);

const ACTIVATE_KEYS = ["userDocumentId", "specialty", "bio"] as const;

export type ActivateProfileFormIds = ReturnType<
	typeof useActivateProfileFormIds
>;

export const useActivateProfileFormIds = () => useFormIds(ACTIVATE_KEYS);
