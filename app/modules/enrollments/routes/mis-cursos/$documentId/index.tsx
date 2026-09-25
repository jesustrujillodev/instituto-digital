export { action } from "./index.action";
export { loader } from "./index.loader";

import { Check, LogOut, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { MyCertificateMenu } from "@/modules/certificates/components/my-certificate-menu";
import {
	CourseModalityBadge,
	CourseStatusBadge,
} from "@/modules/courses/components/course-badges";
import { countsContent } from "@/modules/courses/domain/course.rules";
import { formatHours } from "@/modules/courses/utils/course-labels";
import { RateCourseDialog } from "@/modules/ratings/components/rate-course-dialog";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	CourseDetailCards,
	CourseDetailCover,
} from "../../../components/course-detail";
import {
	EnrollmentOriginBadge,
	EnrollmentResultBadge,
	EnrollmentStatusBadge,
} from "../../../components/enrollment-badges";
import {
	ClassroomLink,
	ContentProgress,
	isOverFor,
	OutcomeDetail,
} from "../../../components/my-course-parts";
import {
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	INTENT_FIELD,
} from "../../../utils/parse-enrollment-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/mis-cursos";

export const handle = {
	breadcrumb: (loaderData) => [
		{ label: "Mis cursos", path: LIST_PATH },
		{ label: loaderData?.data.course.title ?? "Curso" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	return [{ title: data?.data.course.title ?? "Curso" }];
}

export default function MiCursoPage({ loaderData }: Route.ComponentProps) {
	const { data: entry } = loaderData;
	const { course, enrollment, outcome, can } = entry;

	const fetcher = useFetcher<EnrollmentActionData>();
	useFetcherToast(fetcher);

	const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
	const isSubmitting = fetcher.state !== "idle";

	const submit = (intent: string) =>
		fetcher.submit({ [INTENT_FIELD]: intent }, { method: "post" });

	const isEnrolled = enrollment.status === "ENROLLED";
	const isFinished = isEnrolled && isOverFor(entry);

	const actions = (
		<div className="flex flex-wrap gap-2">
			{isEnrolled && entry.hasClassroom && (
				<ClassroomLink entry={entry} size="default" />
			)}
			{isFinished && outcome.certificate && (
				<MyCertificateMenu
					documentId={outcome.certificate.documentId}
					downloadable={outcome.certificate.downloadable}
				/>
			)}
			{entry.canRate && (
				<RateCourseDialog
					courseDocumentId={course.documentId}
					courseTitle={course.title}
				/>
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
			{can.enroll && (
				<Button
					disabled={isSubmitting}
					onClick={() => submit(ENROLLMENT_INTENTS.enroll)}
				>
					<RotateCcw className="h-4 w-4" />
					Volver a inscribirme
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
				{course.status !== "PUBLISHED" && (
					<CourseStatusBadge status={course.status} />
				)}
				<EnrollmentStatusBadge status={enrollment.status} />
				<EnrollmentOriginBadge origin={enrollment.origin} />
				{isEnrolled && enrollment.result !== "PENDING" && (
					<EnrollmentResultBadge result={enrollment.result} />
				)}
				{course.hours !== null && (
					<Badge variant="outline">{formatHours(course.hours)}</Badge>
				)}
			</div>

			{enrollment.status === "WITHDRAWN" && (
				<Alert>
					<AlertDescription>
						{enrollment.withdrawnAt
							? `Te diste de baja el ${formatZonedDate(new Date(enrollment.withdrawnAt))}.`
							: "Te diste de baja."}{" "}
						Ya no participas en este curso.
						{can.enroll &&
							outcome.progressPercent > 0 &&
							" Si vuelves a inscribirte, retomas tu avance donde lo dejaste."}
					</AlertDescription>
				</Alert>
			)}

			{enrollment.status === "INVITED" && (
				<Alert>
					<AlertDescription>
						{course.enrollmentDeadline
							? `Responde antes del ${formatZonedDate(new Date(course.enrollmentDeadline))}.`
							: "Aceptar ocupa un lugar si queda."}
					</AlertDescription>
				</Alert>
			)}

			{isEnrolled && (
				<Card>
					<CardContent className="flex flex-col gap-3">
						<h3 className="font-medium text-sm">Tu avance</h3>
						{isFinished ? (
							<>
								<Badge
									variant={outcome.completed ? "default" : "outline"}
									className="self-start"
								>
									{outcome.completed
										? "Completado · 1 crédito"
										: "No completado"}
								</Badge>
								<OutcomeDetail entry={entry} />
								{!entry.canRate && outcome.myRating !== null && (
									<p className="text-muted-foreground text-xs">
										Lo valoraste con {outcome.myRating} de 5
									</p>
								)}
							</>
						) : countsContent(course.completionRule) ? (
							<ContentProgress entry={entry} />
						) : (
							<OutcomeDetail entry={entry} />
						)}
					</CardContent>
				</Card>
			)}

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
