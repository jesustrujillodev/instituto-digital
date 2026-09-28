import * as v from "valibot";
import { USER_TYPES } from "@/modules/users/domain/user.rules";
import { atoms } from "@/shared/rules/atoms.rules";

// ── Átomos del módulo ─────────────────────────────────────────────────────────

const specialty = v.pipe(
	v.string("La especialidad es obligatoria."),
	v.trim(),
	v.minLength(3, "La especialidad debe tener al menos 3 caracteres."),
	v.maxLength(120, "La especialidad no puede superar los 120 caracteres."),
);

/** Institución de procedencia. Solo la tienen los externos. */
const institution = v.pipe(
	v.string("La institución es obligatoria."),
	v.trim(),
	v.minLength(2, "La institución debe tener al menos 2 caracteres."),
	v.maxLength(160, "La institución no puede superar los 160 caracteres."),
);

const bio = v.pipe(
	v.string("La semblanza debe ser texto."),
	v.trim(),
	v.maxLength(600, "La semblanza no puede superar los 600 caracteres."),
);

const firstName = v.pipe(
	v.string("El nombre es obligatorio."),
	v.trim(),
	v.minLength(2, "El nombre debe tener al menos 2 caracteres."),
	v.maxLength(80, "El nombre no puede superar los 80 caracteres."),
);

const lastName = v.pipe(
	v.string("Los apellidos son obligatorios."),
	v.trim(),
	v.minLength(2, "Los apellidos deben tener al menos 2 caracteres."),
	v.maxLength(80, "Los apellidos no pueden superar los 80 caracteres."),
);

const phone = v.pipe(
	v.string("El teléfono debe ser texto."),
	v.regex(
		/^\+?[\d\s-]{7,15}$/,
		"Escribe un teléfono válido, de 7 a 15 dígitos.",
	),
);

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

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
 * Capacitador en una lista para elegir. Es la única proyección de personas que
 * no se recorta por dependencia: cualquier titular asigna a cualquier
 * capacitador activo (§4).
 */
export const trainerSummarySchema = v.object({
	userDocumentId: v.string(),
	firstName: v.nullable(v.string()),
	lastName: v.nullable(v.string()),
	email: v.string(),
	type: v.picklist(USER_TYPES, "El tipo de cuenta no es válido."),
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

// ── Reglas de entrada ─────────────────────────────────────────────────────────

/** Activación sobre una cuenta interna que ya existe. */
export const activateProfileRule = v.object({
	userDocumentId: documentId,
	specialty,
	bio: v.optional(bio),
});

/** La semblanza admite `null`: vaciarla es un cambio, no la ausencia del campo. */
export const updateProfileRule = v.partial(
	v.object({
		specialty,
		institution,
		bio: v.nullable(bio),
	}),
);

/**
 * Lo que se captura del perfil en el diálogo, sin la cuenta: la validación del
 * cliente. El servidor vuelve a validar con la regla de su intención.
 */
export const profileFieldsRule = v.object({
	specialty,
	bio: v.optional(bio),
});

/** Lo mismo para un externo, que además declara su institución. */
export const externalProfileFieldsRule = v.object({
	...profileFieldsRule.entries,
	institution,
});

/**
 * Alta de capacitador externo: crea la cuenta y el perfil a la vez.
 *
 * No lleva dependencia ni número de empleado —el CHECK `users_type_coherence`
 * los prohíbe para un externo— y la institución es obligatoria, que es lo que
 * lo sitúa en algún sitio.
 */
export const createExternalTrainerRule = v.object({
	firstName,
	lastName,
	email: atoms.email,
	password: atoms.newPassword,
	phone: v.optional(phone),
	specialty,
	institution,
	bio: v.optional(bio),
});

export const findTrainerRule = v.object({ userDocumentId: documentId });

export const trainerRules = {
	activate: activateProfileRule,
	update: updateProfileRule,
	createExternal: createExternalTrainerRule,
	find: findTrainerRule,
} as const;
