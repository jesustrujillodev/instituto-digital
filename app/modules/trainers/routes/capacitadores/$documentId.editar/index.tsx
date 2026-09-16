export { action } from "./index.action";
export { loader } from "./index.loader";

import { BookOpen, Star } from "lucide-react";
import { useFetcher } from "react-router";
import {
	FormActions,
	FormFooter,
} from "@/shared/components/common/form-actions";
import { PageHeader } from "@/shared/components/common/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	TrainerStatusBadge,
	TrainerTypeBadge,
} from "../../../components/trainer-badges";
import { TrainerForm } from "../../../components/trainer-form";
import { useTrainerFormIds } from "../../../hooks/use-trainer-form-ids";
import type { TrainerActionData } from "../../../utils/parse-trainer-form-data";
import { fullNameOf, originOf } from "../../../utils/to-trainer-rows";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/capacitadores";

export const handle = {
	breadcrumb: () => [
		{ label: "Capacitadores", path: LIST_PATH },
		{ label: "Ficha" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Ficha del capacitador" }];
}

/** Cursos finalizados que imparte y su valoración promedio (§6.3). */
function TrainerStats({
	coursesTaught,
	averageRating,
}: {
	coursesTaught: number;
	averageRating: number | null;
}) {
	return (
		<Card>
			<CardContent className="grid gap-6 sm:grid-cols-2">
				<div className="flex items-start gap-3">
					<BookOpen className="mt-0.5 h-5 w-5 text-muted-foreground" />
					<div>
						<p className="font-medium text-sm">Cursos impartidos</p>
						<p className="text-muted-foreground text-sm">
							{coursesTaught === 0
								? "Aún no imparte cursos."
								: `${coursesTaught} curso(s) impartido(s).`}
						</p>
					</div>
				</div>

				<div className="flex items-start gap-3">
					<Star className="mt-0.5 h-5 w-5 text-muted-foreground" />
					<div>
						<p className="font-medium text-sm">Valoración promedio</p>
						<p className="text-muted-foreground text-sm">
							{averageRating === null
								? "Sin valoraciones."
								: `${averageRating.toFixed(1)} de 5.`}
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export default function CapacitadorEditarPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { trainer },
	} = loaderData;
	const ids = useTrainerFormIds();

	const fetcher = useFetcher<TrainerActionData>();
	const isSubmitting = fetcher.state !== "idle";

	useFetcherToast(fetcher, {
		errorMessage: "No se pudo actualizar el perfil",
	});

	const actions = (
		<FormActions
			formId={ids.form}
			isSubmitting={isSubmitting}
			submitLabel="Guardar cambios"
			submittingLabel="Guardando…"
			cancelTo={LIST_PATH}
		/>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title={fullNameOf(trainer)}
				description={`${originOf(trainer)} · ${trainer.email}`}
				goBack={LIST_PATH}
				actions={actions}
				collapseActionsOnMobile
			/>

			<div className="mb-4 flex gap-2">
				<TrainerTypeBadge type={trainer.type} />
				<TrainerStatusBadge archivedAt={trainer.archivedAt} />
			</div>

			<div className="flex flex-col gap-4">
				<TrainerForm ids={ids} fetcher={fetcher} trainer={trainer} />

				<TrainerStats
					coursesTaught={trainer.coursesTaught}
					averageRating={trainer.averageRating}
				/>
			</div>

			<FormFooter>{actions}</FormFooter>
		</div>
	);
}
