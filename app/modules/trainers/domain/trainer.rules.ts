import * as v from "valibot";
import { USER_TYPES } from "@/modules/users/domain/user.rules";
import { atoms } from "@/shared/rules/atoms.rules";
import {
	createListRule,
	SORT_DIRECTIONS,
	type SortDirection,
} from "@/shared/rules/list.rules";

// ── Átomos del módulo ─────────────────────────────────────────────────────────

const specialty = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(3),
	v.maxLength(120),
);

/** Institución de procedencia. Solo la tienen los externos. */
const institution = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(2),
	v.maxLength(160),
);

const bio = v.pipe(v.string(), v.trim(), v.maxLength(600));

const name = v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(80));

const phone = v.pipe(v.string(), v.regex(/^\+?[\d\s-]{7,15}$/));

const documentId = v.pipe(v.string(), v.uuid());

// ── Entidad y proyecciones ────────────────────────────────────────────────────

export const trainerProfileSchema = v.object({
	userId: v.number(),
	specialty: v.string(),
	institution: v.nullable(v.string()),
	bio: v.nullable(v.string()),
	archivedAt: v.nullable(v.date()),
	createdAt: v.date(),
	updatedAt: v.date(),
});

/**
 * Fila del catálogo. Proyección corta a propósito: el catálogo es la única
 * lista del sistema sin recorte por dependencia.
 */
export const trainerSummarySchema = v.object({
	userDocumentId: v.string(),
	firstName: v.nullable(v.string()),
	lastName: v.nullable(v.string()),
	email: v.string(),
	type: v.picklist(USER_TYPES),
	specialty: v.string(),
	institution: v.nullable(v.string()),
	dependencyName: v.nullable(v.string()),
	archivedAt: v.nullable(v.date()),
});

export const trainerDetailSchema = v.object({
	...trainerSummarySchema.entries,
	phone: v.nullable(v.string()),
	bio: v.nullable(v.string()),
	createdAt: v.date(),
	updatedAt: v.date(),
	/** Lo calculará PRD-06 desde `course_trainers`, al existir cursos finalizados. */
	coursesTaught: v.number(),
	/** Lo calculará PRD-06 desde `valoracion`. */
	averageRating: v.nullable(v.number()),
});

/** Estados por los que se puede filtrar el catálogo. Sin valor ⇒ "active". */
export const TRAINER_STATUSES = ["active", "archived", "all"] as const;
export type TrainerStatusFilter = (typeof TRAINER_STATUSES)[number];

/**
 * Columnas ordenables. Es una allowlist: el valor llega del query string y
 * termina en un `orderBy`.
 */
export const TRAINER_SORT_FIELDS = [
	"firstName",
	"lastName",
	"email",
	"specialty",
	"createdAt",
] as const;
export type TrainerSortField = (typeof TRAINER_SORT_FIELDS)[number];

/** Campos que se ordenan por la cuenta y no por el perfil. */
export const TRAINER_USER_SORT_FIELDS: readonly TrainerSortField[] = [
	"firstName",
	"lastName",
	"email",
];

export { SORT_DIRECTIONS, type SortDirection };

// ── Reglas de entrada ─────────────────────────────────────────────────────────

/** Activación sobre una cuenta interna que ya existe. */
export const activateProfileRule = v.object({
	userDocumentId: documentId,
	specialty,
	bio: v.optional(bio),
});

export const updateProfileRule = v.partial(
	v.object({
		specialty,
		institution,
		bio,
	}),
);

/**
 * Alta de capacitador externo: crea la cuenta y el perfil a la vez.
 *
 * No lleva dependencia ni número de empleado —el CHECK `users_type_coherence`
 * los prohíbe para un externo— y la institución es obligatoria, que es lo que
 * lo sitúa en algún sitio.
 */
export const createExternalTrainerRule = v.object({
	firstName: name,
	lastName: name,
	email: atoms.email,
	password: atoms.newPassword,
	phone: v.optional(phone),
	specialty,
	institution,
	bio: v.optional(bio),
});

export const findTrainerRule = v.object({ userDocumentId: documentId });

export const listTrainersRule = createListRule({
	type: v.optional(v.picklist(USER_TYPES)),
	specialty: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120))),
	status: v.optional(v.picklist(TRAINER_STATUSES)),
	sortBy: v.optional(v.picklist(TRAINER_SORT_FIELDS)),
	sortDir: v.optional(v.picklist(SORT_DIRECTIONS)),
});

export const trainerRules = {
	activate: activateProfileRule,
	update: updateProfileRule,
	createExternal: createExternalTrainerRule,
	find: findTrainerRule,
	list: listTrainersRule,
} as const;
