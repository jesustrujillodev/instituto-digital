import * as v from "valibot";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	type CourseScopeWriteWhere,
	courseScopeWriteWhere,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import {
	type CourseStatus,
	canEdit,
} from "@/modules/courses/domain/course.rules";
import {
	canTeach,
	resolveTeachingScope,
	type TeachingCourseWhere,
	teachingCourseWhere,
} from "@/modules/teaching/domain/teaching.access";
import {
	CONTENT_TITLE_MAX_LENGTH,
	SESSION_MATERIAL_MAX_PER_SESSION,
	SESSION_MATERIAL_PREFIX,
} from "./content.config";
import {
	ContentSessionMaterialsLockedError,
	ContentTooManySessionMaterialsError,
} from "./content.errors";
import {
	documentId,
	httpUrl,
	LESSON_UPLOAD_KINDS,
	LINK_HREF_MESSAGE,
	materialFileName,
	materialMimeType,
} from "./content.rules";

/** Lo que una lección puede enseñar, menos el texto y el cuestionario: eso es temario. */
export const SESSION_MATERIAL_TYPES = ["FILE", "VIDEO", "LINK"] as const;
export type SessionMaterialType = (typeof SESSION_MATERIAL_TYPES)[number];

// ── Quién lo administra ──────────────────────────────────────────────────────

export type SessionMaterialCourseWhere = {
	OR: (CourseScopeWriteWhere | TeachingCourseWhere)[];
};

/**
 * Cursos cuyo material de sesión administra el actor: los que edita y los que
 * imparte. El capacitador sube la presentación la víspera sin pasar por el alta.
 *
 * `null` si no alcanza ninguno: un `{ OR: [] }` no filtraría nada.
 */
export const sessionMaterialCourseWhere = (
	actor: Pick<AuthContext, "userId" | "role" | "dependencyId" | "isTrainer">,
): SessionMaterialCourseWhere | null => {
	const branches: SessionMaterialCourseWhere["OR"] = [];

	const write = courseScopeWriteWhere(resolveCourseScope(actor));
	if (write) branches.push(write);

	const teaching = resolveTeachingScope(actor);
	if (canTeach(teaching)) branches.push(teachingCourseWhere(teaching));

	return branches.length === 0 ? null : { OR: branches };
};

// ── Contratos de entrada ──────────────────────────────────────────────────────

/** La key la emitió este flujo o no se acepta: ver `materialKey` del temario. */
const sessionMaterialKey = v.pipe(
	v.string("Falta el archivo subido."),
	v.trim(),
	v.minLength(1, "Falta el archivo subido."),
	v.check(
		(value) =>
			value.startsWith(`${SESSION_MATERIAL_PREFIX}/`) && !value.includes(".."),
		"El archivo no corresponde al material de una sesión.",
	),
);

const materialTitle = v.pipe(
	v.string("Escribe el nombre del material."),
	v.trim(),
	v.minLength(1, "Escribe el nombre del material."),
	v.maxLength(
		CONTENT_TITLE_MAX_LENGTH,
		`El nombre del material no puede pasar de ${CONTENT_TITLE_MAX_LENGTH} caracteres.`,
	),
);

const availableFromSession = v.boolean(
	"Indica si el material se ve desde que empieza la sesión.",
);

export const findSessionMaterialsRule = v.object({ documentId });

/**
 * Sin sesión, el archivo es de una sesión que el alta todavía no guarda: se
 * sube ya y su material se crea cuando el paso se guarda.
 */
export const sessionUploadUrlRule = v.object({
	sessionDocumentId: v.optional(documentId),
	kind: v.picklist(
		LESSON_UPLOAD_KINDS,
		"Elige qué clase de archivo vas a subir.",
	),
	fileName: materialFileName,
	contentType: materialMimeType,
	size: v.pipe(
		v.number("El tamaño del archivo debe ser un número."),
		v.integer("El tamaño del archivo debe ser un número entero."),
		v.minValue(1, "El archivo está vacío."),
	),
});

const uploadedSessionMaterial = {
	sessionDocumentId: documentId,
	title: materialTitle,
	availableFromSession,
	key: sessionMaterialKey,
	fileName: materialFileName,
	mimeType: materialMimeType,
};

export const createSessionMaterialRule = v.variant(
	"type",
	[
		v.object({ type: v.literal("FILE"), ...uploadedSessionMaterial }),
		v.object({ type: v.literal("VIDEO"), ...uploadedSessionMaterial }),
		v.object({
			type: v.literal("LINK"),
			sessionDocumentId: documentId,
			title: materialTitle,
			availableFromSession,
			externalUrl: httpUrl(LINK_HREF_MESSAGE),
		}),
	],
	"Elige si el material es un documento, un video o un enlace.",
);

export const updateSessionMaterialRule = v.object({
	materialDocumentId: documentId,
	title: materialTitle,
	availableFromSession,
});

export const removeSessionMaterialRule = v.object({
	materialDocumentId: documentId,
});

export const sessionMaterialRules = {
	find: findSessionMaterialsRule,
	uploadUrl: sessionUploadUrlRule,
	create: createSessionMaterialRule,
	update: updateSessionMaterialRule,
	remove: removeSessionMaterialRule,
} as const;

// ── Reglas de negocio ─────────────────────────────────────────────────────────

/** Mientras el curso admite edición; al terminar o cancelarse queda como está. */
export const assertSessionMaterialsEditable = (status: CourseStatus): void => {
	if (!canEdit(status)) throw new ContentSessionMaterialsLockedError(status);
};

export const assertSessionMaterialLimit = (count: number): void => {
	if (count >= SESSION_MATERIAL_MAX_PER_SESSION) {
		throw new ContentTooManySessionMaterialsError(
			SESSION_MATERIAL_MAX_PER_SESSION,
		);
	}
};

/**
 * Si el participante ya puede abrirlo. Sin la casilla, desde que se publica;
 * con ella, desde que empieza la sesión —un ejercicio que no conviene adelantar—.
 */
export const isSessionMaterialAvailable = (
	material: { availableFromSession: boolean },
	sessionStartsAt: Date,
	now: Date,
): boolean => !material.availableFromSession || now >= sessionStartsAt;
