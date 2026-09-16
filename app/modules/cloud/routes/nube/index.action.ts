import { requireRole } from "@/shared/auth/require-role.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateCloudKey,
	validateCloudPath,
	validateCloudSelection,
} from "../../domain/cloud.rules";
import { CLOUD_ERROR_MESSAGES } from "../../utils/cloud-error-messages";
import { pluralize } from "../../utils/cloud-format";
import {
	CLOUD_INTENTS,
	type CloudActionData,
	INTENT_FIELD,
	readSelection,
	SELECTION_FIELDS,
} from "../../utils/cloud-intents";
import type { Route } from "./+types/index";

/**
 * Mutaciones y consultas bajo demanda del gestor. Se invocan con useFetcher: no
 * navegan, y solo `delete` revalida el listado.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<CloudActionData> => {
	// 🔒 El guard se repite: un loader protegido no protege las mutaciones.
	const auth = await requireRole(request, context, ["ADMIN"]);

	const formData = await request.formData();
	const intent = formData.get(INTENT_FIELD);
	const service = context.cloudService;

	switch (intent) {
		case CLOUD_INTENTS.download: {
			const key = parseInput(() =>
				validateCloudKey(formData.get(SELECTION_FIELDS.key)),
			);
			if (!key.success) return localizeError(key, CLOUD_ERROR_MESSAGES);

			const result = await service.downloadUrl(key.data);
			if (!result.success) return localizeError(result, CLOUD_ERROR_MESSAGES);

			return ok({ intent: CLOUD_INTENTS.download, url: result.data.url });
		}

		case CLOUD_INTENTS.zipManifest: {
			const selection = parseInput(() =>
				validateCloudSelection(readSelection(formData)),
			);
			if (!selection.success) {
				return localizeError(selection, CLOUD_ERROR_MESSAGES);
			}

			const result = await service.zipManifest(selection.data);
			if (!result.success) return localizeError(result, CLOUD_ERROR_MESSAGES);

			return ok({ intent: CLOUD_INTENTS.zipManifest, manifest: result.data });
		}

		case CLOUD_INTENTS.deletePreview: {
			const selection = parseInput(() =>
				validateCloudSelection(readSelection(formData)),
			);
			if (!selection.success) {
				return localizeError(selection, CLOUD_ERROR_MESSAGES);
			}

			const result = await service.previewDelete(selection.data);
			if (!result.success) return localizeError(result, CLOUD_ERROR_MESSAGES);

			return ok({ intent: CLOUD_INTENTS.deletePreview, impact: result.data });
		}

		case CLOUD_INTENTS.delete: {
			const selection = parseInput(() =>
				validateCloudSelection(readSelection(formData)),
			);
			if (!selection.success) {
				return localizeError(selection, CLOUD_ERROR_MESSAGES);
			}

			const result = await service.delete(selection.data, {
				userId: auth.userId,
			});
			if (!result.success) return localizeError(result, CLOUD_ERROR_MESSAGES);

			const { deleted, failed } = result.data;
			const message =
				failed.length === 0
					? `Se eliminaron ${pluralize(deleted, "archivo", "archivos")}`
					: `Se eliminaron ${pluralize(deleted, "archivo", "archivos")}; ${pluralize(failed.length, "no se pudo", "no se pudieron")} borrar y aparecerán como huérfanos`;

			return ok(
				{ intent: CLOUD_INTENTS.delete, result: result.data },
				{ message },
			);
		}

		case CLOUD_INTENTS.scanOrphans: {
			const path = parseInput(() =>
				validateCloudPath(formData.get(SELECTION_FIELDS.path) ?? ""),
			);
			if (!path.success) return localizeError(path, CLOUD_ERROR_MESSAGES);

			const result = await service.scanOrphans(path.data);
			if (!result.success) return localizeError(result, CLOUD_ERROR_MESSAGES);

			return ok({ intent: CLOUD_INTENTS.scanOrphans, scan: result.data });
		}

		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
