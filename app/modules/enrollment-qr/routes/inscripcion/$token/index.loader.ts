import { redirect } from "react-router";
import { requireAuth } from "@/shared/auth/require-auth.server";
import { getClientIp } from "@/shared/http/client-ip";
import { toRouteError } from "@/shared/http/route-error";
import {
	parseInput,
	toResponseError,
} from "@/shared/response/response.helpers";
import {
	ENROLLMENT_QR_RATE_LIMIT,
	enrollmentLandingPathOf,
	enrollmentQrPathOf,
	enrollmentQrRateKeyOf,
	enrollmentQrUserRateKeyOf,
} from "../../../domain/enrollment-qr.config";
import {
	EnrollmentQrInvalidTokenError,
	EnrollmentQrRateLimitedError,
} from "../../../domain/enrollment-qr.errors";
import { validateEnrollmentQrToken } from "../../../domain/enrollment-qr.validators";
import { ENROLLMENT_QR_ERROR_MESSAGES } from "../../../utils/enrollment-qr-error-messages";
import type { Route } from "./+types/index";

const throwIfLimited = (decision: {
	allowed: boolean;
	retryAfterMs: number;
}): void => {
	if (!decision.allowed) {
		throw toRouteError(
			toResponseError(new EnrollmentQrRateLimitedError(decision.retryAfterMs)),
			ENROLLMENT_QR_ERROR_MESSAGES,
		);
	}
};

/**
 * GET /inscripcion/:token — resuelve el curso y redirige a su ficha del
 * catálogo. No inscribe: ahí la persona ve el curso y confirma, y el action de
 * la ficha aplica cupo, cierre y bajas.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const ip = getClientIp(request, context.clientIpPolicy);
	if (ip) {
		throwIfLimited(
			await context.rateLimiter.consume(
				enrollmentQrRateKeyOf(ip),
				ENROLLMENT_QR_RATE_LIMIT,
			),
		);
	}

	// Se valida ANTES de construir el redirectTo: solo un token con la forma
	// esperada llega a la URL del login, que es lo que hace seguro el parámetro.
	const input = parseInput(() => validateEnrollmentQrToken(params.token));
	if (!input.success) {
		throw toRouteError(
			toResponseError(new EnrollmentQrInvalidTokenError()),
			ENROLLMENT_QR_ERROR_MESSAGES,
		);
	}
	const token = input.data;

	// `requireAuth` redirige a `/iniciar-sesion` pelado y perdería el token.
	if (!context.authPayload) {
		throw redirect(
			`/iniciar-sesion?redirectTo=${encodeURIComponent(enrollmentQrPathOf(token))}`,
		);
	}

	const auth = await requireAuth(request, context);
	throwIfLimited(
		await context.rateLimiter.consume(
			enrollmentQrUserRateKeyOf(auth.userId),
			ENROLLMENT_QR_RATE_LIMIT,
		),
	);

	const result = await context.enrollmentQrService.resolve(token, auth);
	if (!result.success)
		throw toRouteError(result.error, ENROLLMENT_QR_ERROR_MESSAGES);

	throw redirect(enrollmentLandingPathOf(result.data.courseDocumentId));
};
