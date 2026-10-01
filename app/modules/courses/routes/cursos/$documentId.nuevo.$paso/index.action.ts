import { saveCourseStep } from "../../course-wizard.server";
import type { Route } from "./+types/index";

/** POST /dashboard/capacitaciones/:documentId/nuevo/:paso — guardar el paso o publicar. */
export const action = (args: Route.ActionArgs) => saveCourseStep(args);
