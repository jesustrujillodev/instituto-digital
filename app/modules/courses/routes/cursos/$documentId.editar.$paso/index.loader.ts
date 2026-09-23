import { loadCourseWizard } from "../../course-wizard.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/cursos/:documentId/editar/:paso? — un paso de la edición de un
 * curso publicado. Sin paso, empieza por el primero.
 */
export const loader = (args: Route.LoaderArgs) =>
	loadCourseWizard(args, "edit");
