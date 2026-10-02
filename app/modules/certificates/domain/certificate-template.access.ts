import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { resolveCourseScope } from "@/modules/courses/domain/course.access";
import type { CertificateTemplateScope } from "./certificate.types";

// ===============================================================
// Quién ve y quién administra las plantillas de certificado (ADR 0030)
// ===============================================================
// La biblioteca sigue al alcance de cursos: quien no administra cursos no
// edita certificados y no tiene para qué ver plantillas.

type Actor = Pick<
	AuthContext,
	"userId" | "role" | "dependencyId" | "isTrainer"
>;

export type TemplateVisibility =
	| { kind: "all" }
	/** Las institucionales y las de su dependencia. */
	| { kind: "dependency"; dependencyId: number }
	| { kind: "none" };

export const templateVisibilityOf = (actor: Actor): TemplateVisibility => {
	const scope = resolveCourseScope(actor);
	switch (scope.kind) {
		case "global":
			return { kind: "all" };
		case "dependency":
		case "creator":
			return { kind: "dependency", dependencyId: scope.dependencyId };
		case "none":
			return { kind: "none" };
		default: {
			const unreachable: never = scope;
			return unreachable;
		}
	}
};

export interface TemplateOwnership {
	scope: CertificateTemplateScope;
	dependencyId: number | null;
}

export const canSeeTemplate = (actor: Actor, template: TemplateOwnership) => {
	const visibility = templateVisibilityOf(actor);
	switch (visibility.kind) {
		case "all":
			return true;
		case "dependency":
			return (
				template.scope === "INSTITUTIONAL" ||
				template.dependencyId === visibility.dependencyId
			);
		case "none":
			return false;
		default: {
			const unreachable: never = visibility;
			return unreachable;
		}
	}
};

/**
 * Las institucionales, solo la plataforma; las de una dependencia, su titular
 * y su auxiliar (o la plataforma). Un capacitador interno las aplica, no las
 * cambia.
 */
export const canWriteTemplate = (actor: Actor, template: TemplateOwnership) => {
	const scope = resolveCourseScope(actor);
	if (scope.kind === "global") return true;
	return (
		scope.kind === "dependency" &&
		template.scope === "DEPENDENCY" &&
		template.dependencyId === scope.dependencyId
	);
};

/** Dónde nace una plantilla nueva de quien la crea, o null si no puede crear. */
export const ownershipForNew = (actor: Actor): TemplateOwnership | null => {
	const scope = resolveCourseScope(actor);
	if (scope.kind === "global")
		return { scope: "INSTITUTIONAL", dependencyId: null };
	if (scope.kind === "dependency") {
		return { scope: "DEPENDENCY", dependencyId: scope.dependencyId };
	}
	return null;
};
