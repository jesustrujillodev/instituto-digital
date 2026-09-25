export { action } from "./index.action";
export { loader } from "./index.loader";

import { BookOpen, Check, LogOut, Users, X } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import {
	CourseAccessBadge,
	CourseModalityBadge,
} from "@/modules/courses/components/course-badges";
import { formatHours } from "@/modules/courses/utils/course-labels";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	CourseDetailCards,
	CourseDetailCover,
} from "../../../components/course-detail";
import {
	EnrollmentOriginBadge,
	EnrollmentStatusBadge,
	SeatsBadge,
} from "../../../components/enrollment-badges";
import {
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	INTENT_FIELD,
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
		data: { course, enrollment, can, hasClassroom },
	} = loaderData;

	const fetcher = useFetcher<EnrollmentActionData>();
	useFetcherToast(fetcher);

	const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
	const isSubmitting = fetcher.state !== "idle";

	const submit = (intent: string) =>
		fetcher.submit({ [INTENT_FIELD]: intent }, { method: "post" });

	const actions = (
		<div className="flex flex-wrap gap-2">
			{can.assign && (
				<Button variant="outline" asChild>
					<Link to={`/dashboard/cursos/${course.documentId}/inscripciones`}>
						<Users className="h-4 w-4" />
						Inscribir a mi personal
					</Link>
				</Button>
			)}
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
			{hasClassroom && (
				<Button asChild>
					<Link to={`/dashboard/mis-cursos/${course.documentId}/aula`}>
						<BookOpen className="h-4 w-4" />
						Entrar al aula
					</Link>
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

			<CourseDetailCover course={course} />

			<div className="flex flex-wrap gap-2">
				<CourseModalityBadge modality={course.modality} />
				<CourseAccessBadge access={course.access} />
				<SeatsBadge capacity={course.capacity} seatsLeft={course.seatsLeft} />
				{course.hours !== null && (
					<Badge variant="outline">{formatHours(course.hours)}</Badge>
				)}
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

			<CourseDetailCards course={course} />

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
