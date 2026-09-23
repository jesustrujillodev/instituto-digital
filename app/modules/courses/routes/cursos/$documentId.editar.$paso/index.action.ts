import { saveCourseStep } from "../../course-wizard.server";
import type { Route } from "./+types/index";

/** POST /dashboard/cursos/:documentId/editar/:paso — guardar el paso. */
export const action = (args: Route.ActionArgs) => saveCourseStep(args);
