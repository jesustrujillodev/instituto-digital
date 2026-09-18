import { requireAuth } from "@/shared/auth/require-auth.server";
import { getClientIp } from "@/shared/http/client-ip";
import {
	fail,
	ok,
	parseInput,
	toResponseError,
} from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import type { AppResponse } from "@/shared/response/response.types";
import { CHECK_IN_RATE_LIMIT } from "../../../domain/check-in.config";
import {
	CheckInInvalidTokenError,
	CheckInRateLimitedError,
} from "../../../domain/check-in.errors";
import type { CheckInResult } from "../../../domain/check-in.types";
import { validateCheckInToken } from "../../../domain/check-in.validators";
import { CHECK_IN_ERROR_MESSAGES } from "../../../utils/check-in-error-messages";
import type { Route } from "./+types/index";

export type CheckInActionData = AppResponse<CheckInResult>;

const rejected = (error: unknown): CheckInActionData =>
	localizeError(fail(toResponseError(error)), CHECK_IN_ERROR_MESSAGES);

/**
 * POST /asistencia/:token — registra la asistencia de quien escanea.
 *
 * Devuelve el envelope en lugar de cortar: la pantalla sigue en pie y pinta el
 * motivo, que es todo lo que quien está en la puerta del aula necesita leer.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<CheckInActionData> => {
	const decision = context.rateLimiter.consume(
		`check-in:${getClientIp(request) ?? "unknown"}`,
		CHECK_IN_RATE_LIMIT,
	);
	if (!decision.allowed) {
		return rejected(new CheckInRateLimitedError(decision.retryAfterMs));
	}

	const input = parseInput(() => validateCheckInToken(params.token));
	if (!input.success) return rejected(new CheckInInvalidTokenError());

	const auth = await requireAuth(request, context);

	const result = await context.checkInService.register(input.data, auth);
	if (!result.success) return localizeError(result, CHECK_IN_ERROR_MESSAGES);

	return ok(result.data, {
		message:
			result.data.status === "ALREADY_RECORDED"
				? "Tu asistencia ya estaba registrada."
				: "Asistencia registrada.",
	});
};
