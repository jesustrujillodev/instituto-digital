import { requireScope } from "@/shared/auth/require-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import {
	canManageGroups,
	GROUP_ACCESS_ROLES,
} from "../../../domain/group.access";
import {
	validateFindGroup,
	validateListCandidates,
} from "../../../domain/group.validators";
import { GROUP_ERROR_MESSAGES } from "../../../utils/group-error-messages";
import type { Route } from "./+types/index";

export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { scope } = await requireScope(request, context, GROUP_ACCESS_ROLES);

	// La validación de frontera también aplica al parámetro de la URL: un
	// documentId que no es un uuid no llega al servicio.
	const { documentId } = validateFindGroup({ documentId: params.documentId });

	const { search } = validateListCandidates({
		documentId,
		search: new URL(request.url).searchParams.get("miembro") || undefined,
	});

	// En paralelo: el grupo, sus miembros y los candidatos son consultas
	// independientes, y encadenarlas triplicaría la latencia de abrir la
	// pantalla.
	const [group, members, candidates] = await Promise.all([
		context.groupService.findById(documentId, scope),
		context.groupService.listMembers(documentId, scope),
		context.groupService.listCandidates(documentId, search, scope),
	]);

	if (!group.success) throw toRouteError(group.error, GROUP_ERROR_MESSAGES);
	if (!members.success) throw toRouteError(members.error, GROUP_ERROR_MESSAGES);
	if (!candidates.success) {
		throw toRouteError(candidates.error, GROUP_ERROR_MESSAGES);
	}

	return ok({
		group: group.data,
		members: members.data,
		candidates: candidates.data,
		canManage: canManageGroups(scope),
		memberSearch: search ?? "",
	});
};
