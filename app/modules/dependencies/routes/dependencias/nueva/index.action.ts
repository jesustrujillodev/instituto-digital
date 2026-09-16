import { requireRole } from "@/shared/auth/require-role.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { DEPENDENCY_ADMIN_ROLES } from "../../../domain/dependency.access";
import { validateCreateDependency } from "../../../domain/dependency.validators";
import { DEPENDENCY_ERROR_MESSAGES } from "../../../utils/dependency-error-messages";
import {
	type DependencyActionData,
	parseDependencyFormData,
} from "../../../utils/parse-dependency-form-data";
import type { Route } from "./+types/index";

export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<DependencyActionData> => {
	await requireRole(request, context, DEPENDENCY_ADMIN_ROLES);

	const { fields } = parseDependencyFormData(await request.formData());

	const input = parseInput(() => validateCreateDependency(fields));
	if (!input.success) return localizeError(input, DEPENDENCY_ERROR_MESSAGES);

	const created = await context.dependencyService.create(input.data);
	if (!created.success) {
		return localizeError(created, DEPENDENCY_ERROR_MESSAGES);
	}

	// El titular se designa desde la edición y no aquí: al crearla todavía no hay
	// nadie adscrito a quien designar.
	return ok(null, { message: "Dependencia creada" });
};
