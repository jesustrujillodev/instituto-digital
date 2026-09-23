import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	ACTIVE_ENROLLMENT_STATUSES,
	type EnrollmentStatus,
} from "@/modules/enrollments/domain/enrollment.config";
import { TEACHABLE_STATUSES } from "@/modules/teaching/domain/teaching.config";
import { type AccessScope, resolveScope } from "@/shared/auth/scope.rules";
import type { Role } from "@/shared/rules/atoms.rules";
import {
	CourseForbiddenScopeError,
	CourseOrganizerRequiredError,
} from "./course.errors";
import type { CourseStatus } from "./course.rules";

/**
 * Quién ENTRA a la pantalla de cursos por su rol.
 *
 * La lista está incompleta a propósito y no puede completarse: la matriz de §3
 * deja crear cursos también al capacitador interno, que suele tener rol `USER`.
 * Esa condición no es un rol, así que el guard es `canManageCourses` y esta
 * tupla solo sirve para redactar el 403 — igual que en el catálogo de PRD-02.
 */
export const COURSE_MANAGER_ROLES: readonly Role[] = [
	"SUPERADMIN",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];

/** Lo que un actor alcanza de la administración de cursos. */
export type CourseScope =
	| { kind: "global" }
	| { kind: "dependency"; dependencyId: number }
	/** Capacitador interno: solo los cursos que él creó, dentro de su unidad. */
	| { kind: "creator"; dependencyId: number; userId: number }
	| { kind: "none" };

type CourseActor = Pick<
	AuthContext,
	"userId" | "role" | "dependencyId" | "isTrainer"
>;

/**
 * El alcance compartido no alcanza, y por eso este módulo tiene el suyo.
 *
 * `AccessScope` traduce un capacitador interno a `self`, que para cursos
 * significaría "ninguno": la matriz de §3 le da "editar, publicar y cancelar los
 * que creó", una condición que ninguna de sus cuatro variantes expresa.
 *
 * El externo cae en `none` porque no tiene dependencia, que es justo lo que §4
 * del alcance quiere: solo imparte, no crea.
 */
export const resolveCourseScope = (auth: CourseActor): CourseScope => {
	const scope = resolveScope(auth);

	switch (scope.kind) {
		case "global":
			return { kind: "global" };
		case "dependency":
			return { kind: "dependency", dependencyId: scope.dependencyId };
		case "self":
		case "none":
			return auth.isTrainer && auth.dependencyId !== null
				? {
						kind: "creator",
						dependencyId: auth.dependencyId,
						userId: auth.userId,
					}
				: { kind: "none" };
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

export const canManageCourses = (auth: CourseActor): boolean =>
	resolveCourseScope(auth).kind !== "none";

/**
 * ¿La ficha puede mandar a la impartición de este curso?
 *
 * Refleja `resolveTeachingScope`: organizar basta, pero el capacitador interno
 * administra lo que creó y solo pasa lista en lo que imparte.
 */
export const canOpenTeaching = (
	scope: CourseScope,
	course: {
		status: CourseStatus;
		trainers: readonly { userDocumentId: string }[];
	},
	actorDocumentId: string,
): boolean => {
	if (
		!(TEACHABLE_STATUSES as readonly CourseStatus[]).includes(course.status)
	) {
		return false;
	}
	if (scope.kind === "global" || scope.kind === "dependency") return true;

	return course.trainers.some(
		(trainer) => trainer.userDocumentId === actorDocumentId,
	);
};

/** Fragmento de `where` que restringe una LECTURA de cursos al alcance. */
export type CourseScopeWhere = {
	id?: { in: number[] };
	dependencyId?: number;
	createdById?: number;
};

/**
 * Traducción del alcance a un filtro.
 *
 * El `switch` es exhaustivo con comprobación `never`: una variante nueva rompe
 * en compilación en vez de caer en una rama por defecto que devolvería `{}` —es
 * decir, acceso a todo—.
 */
export const courseScopeWhere = (scope: CourseScope): CourseScopeWhere => {
	switch (scope.kind) {
		case "global":
			return {};
		case "dependency":
			return { dependencyId: scope.dependencyId };
		case "creator":
			return { dependencyId: scope.dependencyId, createdById: scope.userId };
		case "none":
			// `IN ()` no puede casar con ninguna fila.
			return { id: { in: [] } };
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

/**
 * Lo mismo para una ESCRITURA: solo igualdades.
 *
 * Devuelve `null` cuando el alcance no alcanza nada, para que quien escribe
 * corte ANTES de llegar a la base. Lo que no puede pasar es que se convierta en
 * `{}`, que sería "alcanza todo".
 */
export type CourseScopeWriteWhere = {
	dependencyId?: number;
	createdById?: number;
};

export const courseScopeWriteWhere = (
	scope: CourseScope,
): CourseScopeWriteWhere | null => {
	switch (scope.kind) {
		case "global":
			return {};
		case "dependency":
			return { dependencyId: scope.dependencyId };
		case "creator":
			return { dependencyId: scope.dependencyId, createdById: scope.userId };
		case "none":
			return null;
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

/** ¿Este alcance elige la dependencia organizadora, o la hereda? */
export const canChooseOrganizer = (scope: CourseScope): boolean =>
	scope.kind === "global";

/**
 * La dependencia que organiza el curso.
 *
 * Solo el alcance global la elige. Los demás la heredan y **se ignora lo que
 * venga del formulario**: aceptarla permitiría crear un curso en otra unidad.
 * Es la misma regla que la dependencia de un grupo en PRD-02.
 */
export const resolveOrganizerDependency = (
	scope: CourseScope,
	requestedId: number | undefined,
): number => {
	switch (scope.kind) {
		case "global":
			if (requestedId === undefined) throw new CourseOrganizerRequiredError();
			return requestedId;
		case "dependency":
		case "creator":
			return scope.dependencyId;
		case "none":
			throw new CourseForbiddenScopeError();
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

/**
 * El alcance con el que este actor consulta grupos para elegir audiencia.
 *
 * Un capacitador interno ve los de su dependencia, como su titular: si no, no
 * podría restringir el curso que sí puede crear.
 */
export const toAudienceScope = (scope: CourseScope): AccessScope => {
	switch (scope.kind) {
		case "global":
			return { kind: "global" };
		case "dependency":
		case "creator":
			return { kind: "dependency", dependencyId: scope.dependencyId };
		case "none":
			return { kind: "none" };
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

// ── Visibilidad ───────────────────────────────────────────────────────────────

/**
 * Estados que una audiencia ajena al organizador puede ver.
 *
 * Un borrador solo existe para quien lo organiza o lo imparte, y un cancelado
 * deja de ofrecerse.
 */
export const VIEWABLE_STATUSES: readonly CourseStatus[] = [
	"PUBLISHED",
	"FINISHED",
];

export interface CourseViewer {
	userId: number;
	role: Role;
	dependencyId: number | null;
	isTrainer: boolean;
	/**
	 * Grupos a los que pertenece AHORA. §6.4 evalúa la pertenencia al usarla,
	 * nunca antes: quien salió de un grupo deja de alcanzar sus cursos.
	 */
	groupIds: readonly number[];
}

type VisibilityBranch =
	| CourseScopeWhere
	| { trainers: { some: { userId: number } } }
	| { status: { in: readonly CourseStatus[] }; access: "PUBLIC" }
	| {
			status: { in: readonly CourseStatus[] };
			access: "RESTRICTED";
			OR: AudienceBranch[];
	  }
	| {
			enrollments: {
				some: { userId: number; status: { in: readonly EnrollmentStatus[] } };
			};
	  };

type AudienceBranch =
	| { dependencyAudience: { some: { dependencyId: number } } }
	| { groupAudience: { some: { groupId: { in: number[] } } } };

/**
 * `where` de "los cursos que esta persona puede ver" — el criterio 3 de §7.
 *
 * Es la unión de lo que administra, lo que imparte, lo publicado que le toca por
 * audiencia y aquello en lo que tiene una invitación pendiente o una inscripción
 * activa. Para quien no lo administra ni lo imparte, esa última rama es la
 * única que abre un curso por invitación, y también mantiene visible un curso
 * para quien salió de su audiencia después de inscribirse (§6.4).
 *
 * Ver no es poder inscribirse: el catálogo y `enroll` exigen además la
 * invitación pendiente en un curso por invitación (`canSelfEnroll`).
 */
export const courseVisibilityWhere = (
	viewer: CourseViewer,
): { OR: VisibilityBranch[] } => {
	const branches: VisibilityBranch[] = [
		courseScopeWhere(resolveCourseScope(viewer)),
	];

	if (viewer.isTrainer) {
		branches.push({ trainers: { some: { userId: viewer.userId } } });
	}

	// Un externo no pertenece a ninguna dependencia y §6.6 dice que no se
	// inscribe: lo único que alcanza es lo que imparte.
	if (viewer.dependencyId !== null) {
		branches.push({ status: { in: VIEWABLE_STATUSES }, access: "PUBLIC" });

		const audience: AudienceBranch[] = [
			{ dependencyAudience: { some: { dependencyId: viewer.dependencyId } } },
		];

		if (viewer.groupIds.length > 0) {
			audience.push({
				groupAudience: { some: { groupId: { in: [...viewer.groupIds] } } },
			});
		}

		branches.push({
			status: { in: VIEWABLE_STATUSES },
			access: "RESTRICTED",
			OR: audience,
		});

		branches.push({
			enrollments: {
				some: {
					userId: viewer.userId,
					status: { in: ACTIVE_ENROLLMENT_STATUSES },
				},
			},
		});
	}

	return { OR: branches };
};

type DependencyVisibilityBranch =
	| { dependencyId: number }
	| { status: { in: readonly CourseStatus[] }; access: "PUBLIC" }
	| {
			status: { in: readonly CourseStatus[] };
			access: "RESTRICTED";
			OR: [
				{ dependencyAudience: { some: { dependencyId: number } } },
				{ groupAudience: { some: { group: { dependencyId: number } } } },
			];
	  };

/**
 * Cursos que una dependencia completa puede ver: los que organiza, los públicos
 * y los restringidos a ella o a alguno de sus grupos.
 *
 * Es el alcance de la asignación de §6.6, que habla de lo que ve la dependencia
 * y no de lo que ve una persona concreta.
 */
export const dependencyVisibilityWhere = (
	dependencyId: number,
): { OR: DependencyVisibilityBranch[] } => ({
	OR: [
		{ dependencyId },
		{ status: { in: VIEWABLE_STATUSES }, access: "PUBLIC" },
		{
			status: { in: VIEWABLE_STATUSES },
			access: "RESTRICTED",
			OR: [
				{ dependencyAudience: { some: { dependencyId } } },
				{ groupAudience: { some: { group: { dependencyId } } } },
			],
		},
	],
});
