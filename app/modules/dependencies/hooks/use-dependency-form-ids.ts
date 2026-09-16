import { useFormIds } from "@/shared/hooks/use-form-ids";

// Centraliza la lista para que las secciones puedan tipar exactamente los ids
// que consumen en vez de recibir un Record suelto.
const FIELD_KEYS = ["name", "acronym"] as const;

export type DependencyFormIds = ReturnType<typeof useDependencyFormIds>;

export const useDependencyFormIds = () => useFormIds(FIELD_KEYS);

const ASSIGN_HEAD_KEYS = ["userDocumentId"] as const;

export type AssignHeadFormIds = ReturnType<typeof useAssignHeadFormIds>;

export const useAssignHeadFormIds = () => useFormIds(ASSIGN_HEAD_KEYS);
