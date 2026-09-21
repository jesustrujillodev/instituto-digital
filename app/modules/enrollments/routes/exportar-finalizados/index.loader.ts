import { toRouteError } from "@/shared/http/route-error";
import { XLSX_CONTENT_TYPE } from "@/shared/spreadsheet/spreadsheet.port";
import { ENROLLMENT_ERROR_MESSAGES } from "../../utils/enrollment-error-messages";
import {
	finishedCoursesFileName,
	toFinishedCoursesSheets,
} from "../../utils/finished-courses-export";
import { requireParticipant } from "../require-participant.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/mis-cursos/finalizados.xlsx
 *
 * Ruta de recurso: responde el archivo, no el envelope. El envelope solo se
 * consume aquí dentro, y un fallo sale por `toRouteError` como en cualquier loader.
 */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);

	const result = await context.enrollmentService.listMine(auth);
	if (!result.success) {
		throw toRouteError(result.error, ENROLLMENT_ERROR_MESSAGES);
	}

	const file = await context.spreadsheetWriter.toXlsx(
		toFinishedCoursesSheets(result.data.finished.map(({ course }) => course)),
	);

	return new Response(file, {
		headers: {
			"Content-Type": XLSX_CONTENT_TYPE,
			"Content-Disposition": `attachment; filename="${finishedCoursesFileName(context.clock.now())}"`,
			"Cache-Control": "private, no-store",
		},
	});
};
