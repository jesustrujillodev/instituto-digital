export { action } from "./index.action";
export { loader } from "./index.loader";

import { Ban, CalendarRange, Send, Users } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import {
	FormActions,
	FormFooter,
} from "@/shared/components/common/form-actions";
import { PageHeader } from "@/shared/components/common/page-header";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	CourseAccessBadge,
	CourseModalityBadge,
	CourseStatusBadge,
} from "../../../components/course-badges";
import { CourseForm } from "../../../components/course-form";
import { useCourseFormIds } from "../../../hooks/use-course-form-ids";
import {
	COURSE_INTENTS,
	type CourseActionData,
	INTENT_FIELD,
} from "../../../utils/parse-course-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/cursos";

export const handle = {
	breadcrumb: () => [{ label: "Cursos", path: LIST_PATH }, { label: "Curso" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Curso" }];
}

export default function CursoEditarPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { course, options, canEdit, canPublish, canCancel },
	} = loaderData;
	const ids = useCourseFormIds();
	const [confirmingCancel, setConfirmingCancel] = useState(false);

	const formFetcher = useFetcher<CourseActionData>();
	// Publicar y cancelar van por su propio fetcher: su respuesta no debe
	// confundirse con la del guardado ni volver a pintar errores en el formulario.
	const statusFetcher = useFetcher<CourseActionData>();

	useFetcherToast(formFetcher, { errorMessage: "No se pudo guardar el curso" });
	useFetcherToast(statusFetcher);

	const submitStatus = (intent: string) =>
		statusFetcher.submit({ [INTENT_FIELD]: intent }, { method: "post" });

	const isChangingStatus = statusFetcher.state !== "idle";

	const actions = (
		<div className="flex flex-wrap gap-2">
			<Button asChild variant="outline">
				<Link to={`/dashboard/cursos/${course.documentId}/inscripciones`}>
					<Users className="h-4 w-4" />
					Inscripciones
				</Link>
			</Button>
			{canCancel && (
				<Button
					type="button"
					variant="outline"
					disabled={isChangingStatus}
					onClick={() => setConfirmingCancel(true)}
				>
					<Ban className="h-4 w-4" />
					Cancelar curso
				</Button>
			)}
			{canPublish && (
				<Button
					type="button"
					variant="secondary"
					disabled={isChangingStatus}
					onClick={() => submitStatus(COURSE_INTENTS.publish)}
				>
					<Send className="h-4 w-4" />
					Publicar
				</Button>
			)}
			{canEdit && (
				<FormActions
					formId={ids.form}
					isSubmitting={formFetcher.state !== "idle"}
					submitLabel="Guardar cambios"
					submittingLabel="Guardando…"
					cancelTo={LIST_PATH}
				/>
			)}
		</div>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title={course.title}
				description={`Organiza ${course.dependencyName}.`}
				goBack={LIST_PATH}
				actions={actions}
				collapseActionsOnMobile
			/>

			<div className="mb-4 flex flex-wrap gap-2">
				<CourseStatusBadge status={course.status} />
				<CourseModalityBadge modality={course.modality} />
				<CourseAccessBadge access={course.access} />
				{course.planLine && (
					<Link
						to={`/dashboard/plan-anual/${course.planLine.planDocumentId}`}
						className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:underline"
					>
						<CalendarRange className="h-3.5 w-3.5" />
						Plan anual · {course.planLine.title}
					</Link>
				)}
			</div>

			{canPublish && (
				<Alert className="mb-4">
					<AlertDescription>
						Publicar usa lo último que guardaste: guarda tus cambios antes de
						publicar.
					</AlertDescription>
				</Alert>
			)}

			{canEdit ? (
				<CourseForm
					mode="edit"
					ids={ids}
					fetcher={formFetcher}
					options={options}
					course={course}
				/>
			) : (
				<Alert>
					<AlertDescription>
						Un curso finalizado o cancelado se conserva tal como quedó y ya no
						se puede modificar.
					</AlertDescription>
				</Alert>
			)}

			<FormFooter>{actions}</FormFooter>

			<ConfirmDialog
				open={confirmingCancel}
				onOpenChange={setConfirmingCancel}
				title="¿Cancelar el curso?"
				description="Dejará de ofrecerse y no podrá volver a publicarse. Sus sesiones, capacitadores y audiencia se conservan."
				confirmLabel="Cancelar curso"
				cancelLabel="Volver"
				destructive
				onConfirm={() => {
					submitStatus(COURSE_INTENTS.cancel);
					setConfirmingCancel(false);
				}}
			/>
		</div>
	);
}
