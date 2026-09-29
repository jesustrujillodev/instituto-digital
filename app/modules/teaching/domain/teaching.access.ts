import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { resolveCourseScope } from "@/modules/courses/domain/course.access";
import type {
	CourseFormat,
	CourseModality,
} from "@/modules/courses/domain/course.rules";

/**
 * Quién pasa lista, captura resultados y finaliza (matriz de §3).
 *
 * No es una variante de `CourseScope` porque las dos reglas se suman: un
 * auxiliar que además es capacitador imparte lo de su dependencia **y** lo que
 * le asignaron en otra. Y no coincide con administrar: el capacitador interno
 * edita los cursos que creó, pero solo pasa lista en los que imparte.
 */
export interface TeachingScope {
	global: boolean;
	/** Cursos organizados por esta dependencia: titular y auxiliar. */
	dependencyId: number | null;
	/** Cursos con esta persona entre sus capacitadores. */
	trainerId: number | null;
	/**
	 * Autogestivos sin sesiones que creó el capacitador interno. Nadie los
	 * imparte (`requiresTrainer`), así que quien los creó los opera como su
	 * dependencia: abre y cierra inscripciones y sigue el avance. No pasa lista
	 * porque no hay sesiones.
	 */
	creator: { dependencyId: number; userId: number } | null;
}

type TeachingActor = Pick<
	AuthContext,
	"userId" | "role" | "dependencyId" | "isTrainer"
>;

export const resolveTeachingScope = (actor: TeachingActor): TeachingScope => {
	const scope = resolveCourseScope(actor);

	return {
		global: scope.kind === "global",
		dependencyId: scope.kind === "dependency" ? scope.dependencyId : null,
		trainerId: actor.isTrainer ? actor.userId : null,
		creator:
			scope.kind === "creator"
				? { dependencyId: scope.dependencyId, userId: scope.userId }
				: null,
	};
};

export const canTeach = (scope: TeachingScope): boolean =>
	scope.global ||
	scope.dependencyId !== null ||
	scope.trainerId !== null ||
	scope.creator !== null;

type TeachingBranch =
	| { dependencyId: number }
	| { trainers: { some: { userId: number } } }
	| {
			dependencyId: number;
			createdById: number;
			format: Extract<CourseFormat, "SELF_PACED">;
			modality: { not: Extract<CourseModality, "HYBRID"> };
	  };

export type TeachingCourseWhere =
	| Record<string, never>
	| { id: { in: number[] } }
	| { OR: TeachingBranch[] };

/**
 * Filtro de cursos que el alcance imparte.
 *
 * Sin ninguna rama devuelve un predicado imposible, nunca `{}`: un `{}` sería
 * "todos los cursos".
 */
export const teachingCourseWhere = (
	scope: TeachingScope,
): TeachingCourseWhere => {
	if (scope.global) return {};

	const branches: TeachingBranch[] = [];
	if (scope.dependencyId !== null) {
		branches.push({ dependencyId: scope.dependencyId });
	}
	if (scope.trainerId !== null) {
		branches.push({ trainers: { some: { userId: scope.trainerId } } });
	}
	// El híbrido queda fuera: tiene sesiones y quien las imparte, y el autor que
	// no es su capacitador no pasa lista.
	if (scope.creator !== null) {
		branches.push({
			dependencyId: scope.creator.dependencyId,
			createdById: scope.creator.userId,
			format: "SELF_PACED",
			modality: { not: "HYBRID" },
		});
	}

	return branches.length === 0 ? { id: { in: [] } } : { OR: branches };
};

/**
 * ¿Puede corregir el curso ya finalizado? Solo el alcance global y la
 * dependencia organizadora; el capacitador no (§3).
 */
export const canCorrect = (
	scope: TeachingScope,
	courseDependencyId: number,
): boolean => scope.global || scope.dependencyId === courseDependencyId;
