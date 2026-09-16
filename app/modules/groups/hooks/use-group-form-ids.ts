import { useFormIds } from "@/shared/hooks/use-form-ids";

const FIELD_KEYS = ["name", "description"] as const;

export type GroupFormIds = ReturnType<typeof useGroupFormIds>;

export const useGroupFormIds = () => useFormIds(FIELD_KEYS);
