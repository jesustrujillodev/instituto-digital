import { GraduationCap, PencilLine, UserMinus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import type { UserType } from "@/modules/users/domain/user.rules";
import type { DataTableAction } from "@/shared/components/common/data-table";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { TrainerProfileDialogTarget } from "../components/trainer-profile-dialog";
import type { TrainerDetail } from "../domain/trainer.types";
import {
	INTENT_FIELD,
	TRAINER_INTENTS,
	type TrainerActionData,
} from "../utils/parse-trainer-form-data";
import { trainerProfileActionPath } from "../utils/trainer-profile-paths";

/** Lo mínimo que necesita una fila para ofrecer las acciones del perfil. */
export interface TrainerProfileSubject {
	documentId: string;
	type: UserType;
	/** Archivado de la CUENTA, no del perfil. */
	archivedAt: Date | string | null;
	canManageTrainer: boolean;
	trainerProfile: Pick<
		TrainerDetail,
		"specialty" | "institution" | "bio" | "archivedAt"
	> | null;
}

/**
 * Acciones del perfil de capacitador para una tabla de personas.
 *
 * Habilitar pide la especialidad en un diálogo; volver a habilitar no, porque
 * el perfil deshabilitado la conserva. Deshabilitar no se confirma: es
 * reversible y no borra nada. Una cuenta archivada no ofrece ninguna — se
 * atiende al restaurarla.
 */
export function useTrainerProfileActions<T extends TrainerProfileSubject>(
	nameOf: (item: T) => string,
) {
	const fetcher = useFetcher<TrainerActionData>();
	useFetcherToast(fetcher);

	const [dialogTarget, setDialogTarget] =
		useState<TrainerProfileDialogTarget | null>(null);

	const submit = useCallback(
		(item: T, intent: string) => {
			fetcher.submit(
				{ [INTENT_FIELD]: intent },
				{ method: "post", action: trainerProfileActionPath(item.documentId) },
			);
		},
		[fetcher],
	);

	const actions = useMemo<DataTableAction<T>[]>(() => {
		const manageable = (item: T) => item.canManageTrainer && !item.archivedAt;
		const isActive = (item: T) =>
			Boolean(item.trainerProfile && !item.trainerProfile.archivedAt);

		return [
			{
				icon: GraduationCap,
				label: (item) =>
					item.trainerProfile
						? "Volver a habilitar como capacitador"
						: "Habilitar como capacitador",
				show: (item) => manageable(item) && !isActive(item),
				onClick: (item) =>
					item.trainerProfile
						? submit(item, TRAINER_INTENTS.reactivate)
						: setDialogTarget({
								mode: "activate",
								userDocumentId: item.documentId,
								name: nameOf(item),
								type: item.type,
								profile: null,
							}),
			},
			{
				icon: PencilLine,
				label: "Editar perfil de capacitador",
				show: (item) => manageable(item) && isActive(item),
				onClick: (item) =>
					setDialogTarget({
						mode: "edit",
						userDocumentId: item.documentId,
						name: nameOf(item),
						type: item.type,
						profile: item.trainerProfile,
					}),
			},
			{
				icon: UserMinus,
				label: "Deshabilitar como capacitador",
				show: (item) => manageable(item) && isActive(item),
				onClick: (item) => submit(item, TRAINER_INTENTS.deactivate),
			},
		];
	}, [nameOf, submit]);

	const closeDialog = useCallback((open: boolean) => {
		if (!open) setDialogTarget(null);
	}, []);

	return { actions, dialogTarget, closeDialog };
}
