import { useFormIds } from "@/shared/hooks/use-form-ids";

// Centraliza la lista para que las secciones puedan tipar exactamente los ids
// que consumen (`Pick<UserFormIds, "email">`) en vez de recibir un Record suelto.
const FIELD_KEYS = [
	"firstName",
	"lastName",
	"email",
	"phone",
	"role",
	"password",
	"photo",
	"type",
	"employeeNumber",
	"jobTitle",
	"dependency",
] as const;

export type UserFormIds = ReturnType<typeof useUserFormIds>;

export const useUserFormIds = () => useFormIds(FIELD_KEYS);

const RESET_PASSWORD_KEYS = ["newPassword"] as const;

export type ResetPasswordFormIds = ReturnType<typeof useResetPasswordFormIds>;

export const useResetPasswordFormIds = () => useFormIds(RESET_PASSWORD_KEYS);
