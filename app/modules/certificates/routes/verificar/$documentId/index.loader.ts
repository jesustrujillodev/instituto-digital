import { getClientIp } from "@/shared/http/client-ip";
import { toRouteError } from "@/shared/http/route-error";
import {
	ok,
	parseInput,
	toResponseError,
} from "@/shared/response/response.helpers";
import { CERTIFICATE_VERIFY_RATE_LIMIT } from "../../../domain/certificate.config";
import {
	CertificateIssueNotFoundError,
	CertificateVerifyRateLimitedError,
} from "../../../domain/certificate.errors";
import { validateVerifyCertificate } from "../../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../../utils/certificate-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /verificar/:documentId — la verificación pública de un certificado.
 *
 * SIN `requireAuth`, a propósito: la abre quien tiene el papel en la mano, que
 * casi nunca tiene cuenta en la plataforma (docs/adr/0020). Lo que la hace
 * segura es lo que responde, no quién pregunta: solo lo impreso, y nada de un
 * certificado revocado.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	// Antes que nada, también antes de validar: un UUID malformado cuenta igual.
	const decision = context.rateLimiter.consume(
		`certificate-verify:${getClientIp(request) ?? "unknown"}`,
		CERTIFICATE_VERIFY_RATE_LIMIT,
	);
	if (!decision.allowed) {
		throw toRouteError(
			toResponseError(
				new CertificateVerifyRateLimitedError(decision.retryAfterMs),
			),
			CERTIFICATE_ERROR_MESSAGES,
		);
	}

	// Malformado = inexistente: un 400 aparte diría qué forma tiene un código válido.
	const input = parseInput(() =>
		validateVerifyCertificate({ documentId: params.documentId }),
	);
	if (!input.success) {
		throw toRouteError(
			toResponseError(new CertificateIssueNotFoundError()),
			CERTIFICATE_ERROR_MESSAGES,
		);
	}

	const result = await context.certificateService.verify(input.data.documentId);
	if (!result.success) {
		throw toRouteError(result.error, CERTIFICATE_ERROR_MESSAGES);
	}

	return ok(result.data);
};
