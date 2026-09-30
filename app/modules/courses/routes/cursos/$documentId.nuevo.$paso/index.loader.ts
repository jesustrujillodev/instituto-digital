import { loadCourseWizard } from "../../course-wizard.server";
import type { Route } from "./+types/index";

/** GET /dashboard/capacitaciones/:documentId/nuevo/:paso — un paso del alta de un borrador. */
export const loader = (args: Route.LoaderArgs) =>
	loadCourseWizard(args, "create");
