import { sileo } from "sileo";
import type { AppResponse } from "@/shared/response/response.types";

/**
 * El aviso de un guardado fallido: un problema detectado aquí, o la respuesta
 * del servidor. Sin respuesta, el envío no llegó.
 */
export const reportSaveFailure = (
	title: string,
	cause: string | AppResponse<unknown> | undefined,
) => {
	sileo.error({
		title,
		description:
			typeof cause === "string"
				? cause
				: cause && !cause.success
					? cause.error.message
					: "No hubo respuesta del servidor. Inténtalo de nuevo.",
	});
};
