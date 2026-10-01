import { redirect } from "react-router";
import { CONTENT_ERROR_MESSAGES } from "@/modules/content/utils/content-error-messages";
import { requireAuth } from "@/shared/auth/require-auth.server";
import { getClientIp } from "@/shared/http/client-ip";
import { toRouteError } from "@/shared/http/route-error";
import {
	ok,
	parseInput,
	toResponseError,
} from "@/shared/response/response.helpers";
import {
	CHECK_IN_RATE_LIMIT,
	checkInPathOf,
} from "../../../domain/check-in.config";
import {
	CheckInInvalidTokenError,
	CheckInRateLimitedError,
} from "../../../domain/check-in.errors";
import { validateCheckInToken } from "../../../domain/check-in.validators";
import { CHECK_IN_ERROR_MESSAGES } from "../../../utils/check-in-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /asistencia/:token — valida el escaneo sin escribir nada, y trae las
 * evaluaciones de seguimiento de la sesión (docs/adr/0027).
 *
 * La escritura vive en el action: un GET lo dispara cualquier prefetch o vista
 * previa de enlace, y registraría asistencias que nadie pidió.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const decision = context.rateLimiter.consume(
		`check-in:${getClientIp(request) ?? "unknown"}`,
		CHECK_IN_RATE_LIMIT,
	);
	if (!decision.allowed) {
		throw toRouteError(
			toResponseError(new CheckInRateLimitedError(decision.retryAfterMs)),
			CHECK_IN_ERROR_MESSAGES,
		);
	}

	// Se valida ANTES de construir el redirectTo: solo un token con la forma
	// esperada llega a la URL del login, que es lo que hace seguro el parámetro.
	const input = parseInput(() => validateCheckInToken(params.token));
	if (!input.success) {
		throw toRouteError(
			toResponseError(new CheckInInvalidTokenError()),
			CHECK_IN_ERROR_MESSAGES,
		);
	}
	const token = input.data;

	// Esta ruta se impone la sesión ella misma para conservar el token:
	// `requireAuth` redirige a `/iniciar-sesion` pelado y lo perdería.
	if (!context.authPayload) {
		throw redirect(
			`/iniciar-sesion?redirectTo=${encodeURIComponent(checkInPathOf(token))}`,
		);
	}

	const auth = await requireAuth(request, context);

	const result = await context.checkInService.preview(token, auth);
	if (!result.success)
		throw toRouteError(result.error, CHECK_IN_ERROR_MESSAGES);

	// Tras registrar la asistencia el loader se vuelve a ejecutar: ahí ya se
	// pueden presentar.
	const followUps = await context.quizService.findParticipantFollowUps(
		result.data.course.documentId,
		auth,
		result.data.session.documentId,
	);
	if (!followUps.success)
		throw toRouteError(followUps.error, CONTENT_ERROR_MESSAGES);

	return ok({ ...result.data, followUps: followUps.data });
};
