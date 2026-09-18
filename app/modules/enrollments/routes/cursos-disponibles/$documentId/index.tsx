export { action } from "./index.action";
export { loader } from "./index.loader";

import { Check, LogOut, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import {
	CourseAccessBadge,
	CourseModalityBadge,
} from "@/modules/courses/components/course-badges";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseCover } from "../../../components/course-cover";
import { CourseSessionsList } from "../../../components/course-sessions-list";
import {
	EnrollmentOriginBadge,
	EnrollmentStatusBadge,
	SeatsBadge,
} from "../../../components/enrollment-badges";
import { ParticipantPicker } from "../../../components/participant-picker";
import { personNameOf } from "../../../utils/enrollment-labels";
import {
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	INTENT_FIELD,
	USERS_FIELD,
} from "../../../utils/parse-enrollment-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/cursos-disponibles";

export const handle = {
	breadcrumb: () => [
		{ label: "Cursos disponibles", path: LIST_PATH },
		{ label: "Curso" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Curso" }];
}

export default function CursoDisponiblePage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { course, enrollment, can, candidates, personSearch },
	} = loaderData;

	const fetcher = useFetcher<EnrollmentActionData>();
	const assignFetcher = useFetcher<EnrollmentActionData>();
	useFetcherToast(fetcher);
	useFetcherToast(assignFetcher);

	const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
	const isSubmitting = fetcher.state !== "idle";

	const submit = (intent: string) =>
		fetcher.submit({ [INTENT_FIELD]: intent }, { method: "post" });

	const assign = (selected: readonly string[]) => {
		const body = new FormData();
		for (const documentId of selected) body.append(USERS_FIELD, documentId);
		body.append(INTENT_FIELD, ENROLLMENT_INTENTS.assign);
		assignFetcher.submit(body, { method: "post" });
	};

	const actions = (
		<div className="flex flex-wrap gap-2">
			{can.decline && (
				<Button
					variant="outline"
					disabled={isSubmitting}
					onClick={() => submit(ENROLLMENT_INTENTS.decline)}
				>
					<X className="h-4 w-4" />
					Rechazar invitación
				</Button>
			)}
			{can.accept && (
				<Button
					disabled={isSubmitting}
					onClick={() => submit(ENROLLMENT_INTENTS.accept)}
				>
					<Check className="h-4 w-4" />
					Aceptar invitación
				</Button>
			)}
			{can.withdraw && (
				<Button
					variant="outline"
					disabled={isSubmitting}
					onClick={() => setConfirmingWithdraw(true)}
				>
					<LogOut className="h-4 w-4" />
					Darme de baja
				</Button>
			)}
			{can.enroll && (
				<Button
					disabled={isSubmitting}
					onClick={() => submit(ENROLLMENT_INTENTS.enroll)}
				>
					<Check className="h-4 w-4" />
					Inscribirme
				</Button>
			)}
		</div>
	);

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={course.title}
				description={`Organiza ${course.dependencyName}.`}
				goBack={LIST_PATH}
				actions={actions}
			/>

			{/* 16:9, la misma proporción a la que se recortó al subirla: a 21:9 el
			    `object-cover` se comía casi una cuarta parte de la imagen y quien
			    llegó desde la cuadrícula no reconocía del todo la que acaba de tocar. */}
			<div className="aspect-video w-full overflow-hidden rounded-4xl bg-muted ring-1 ring-foreground/5">
				<CourseCover
					documentId={course.documentId}
					title={course.title}
					modality={course.modality}
					src={course.coverUrl}
					eager
				/>
			</div>

			<div className="flex flex-wrap gap-2">
				<CourseModalityBadge modality={course.modality} />
				<CourseAccessBadge access={course.access} />
				<SeatsBadge capacity={course.capacity} seatsLeft={course.seatsLeft} />
				{enrollment && (
					<>
						<EnrollmentStatusBadge status={enrollment.status} />
						<EnrollmentOriginBadge origin={enrollment.origin} />
					</>
				)}
			</div>

			<Alert>
				<AlertDescription>
					{course.closesAt === null
						? "Este curso todavía no tiene sesiones."
						: course.isOpen
							? `La inscripción cierra el ${formatZonedDate(new Date(course.closesAt))}.`
							: `La inscripción cerró el ${formatZonedDate(new Date(course.closesAt))}.`}
				</AlertDescription>
			</Alert>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardContent className="flex flex-col gap-3">
						<h3 className="font-medium text-sm">Sesiones</h3>
						<CourseSessionsList sessions={course.sessions} />
					</CardContent>
				</Card>

				<Card>
					<CardContent className="flex flex-col gap-3">
						{course.description && (
							<p className="text-sm whitespace-pre-line">
								{course.description}
							</p>
						)}
						<h3 className="font-medium text-sm">Capacitadores</h3>
						{course.trainers.length === 0 ? (
							<p className="text-muted-foreground text-sm">Sin asignar.</p>
						) : (
							<ul className="text-sm">
								{course.trainers.map((trainer) => (
									<li key={trainer.email}>{personNameOf(trainer)}</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>

			{can.assign && (
				<Card>
					<CardContent className="flex flex-col gap-3">
						<div>
							<h3 className="font-medium text-sm">Asignar personal</h3>
							<p className="text-muted-foreground text-xs">
								Personal de tu dependencia. Asignar ocupa lugar en el curso.
							</p>
						</div>
						<ParticipantPicker
							candidates={candidates}
							search={personSearch}
							resetKey={assignFetcher.data?.success ? assignFetcher.data : null}
							actions={(selected) => (
								<Button
									onClick={() => assign(selected)}
									disabled={
										assignFetcher.state !== "idle" || selected.length === 0
									}
								>
									<UserPlus className="h-4 w-4" />
									{selected.length <= 1
										? "Asignar al curso"
										: `Asignar ${selected.length} al curso`}
								</Button>
							)}
						/>
					</CardContent>
				</Card>
			)}

			<ConfirmDialog
				open={confirmingWithdraw}
				onOpenChange={setConfirmingWithdraw}
				title="¿Darte de baja del curso?"
				description="Liberarás tu lugar. Podrás volver a inscribirte mientras la inscripción siga abierta."
				confirmLabel="Darme de baja"
				cancelLabel="Volver"
				destructive
				onConfirm={() => {
					submit(ENROLLMENT_INTENTS.withdraw);
					setConfirmingWithdraw(false);
				}}
			/>
		</div>
	);
}
