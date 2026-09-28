import { useFormIds } from "@/shared/hooks/use-form-ids";

const PROFILE_KEYS = ["specialty", "institution", "bio"] as const;

export type TrainerProfileFormIds = ReturnType<typeof useTrainerProfileFormIds>;

export const useTrainerProfileFormIds = () => useFormIds(PROFILE_KEYS);

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
