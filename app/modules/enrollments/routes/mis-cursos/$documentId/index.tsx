export { action } from "./index.action";
export { loader } from "./index.loader";

import type { LucideIcon } from "lucide-react";
import {
	Check,
	CircleCheck,
	CircleMinus,
	CircleX,
	Info,
	LogOut,
	Mail,
	RotateCcw,
	UserX,
	X,
} from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { formatSessionRange, formatZonedDate } from "@/lib/date-utils";
import { MyCertificateMenu } from "@/modules/certificates/components/my-certificate-menu";
import { modalityLabelOf } from "@/modules/courses/components/course-card-frame";
import {
	countsContent,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import { formatHours } from "@/modules/courses/utils/course-labels";
import { RateCourseDialog } from "@/modules/ratings/components/rate-course-dialog";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	CourseDetailBody,
	type CourseDetailFact,
	CourseDetailStatus,
	CourseDetailSummary,
} from "../../../components/course-detail";
import {
	ClassroomLink,
	ContentProgress,
	isOverFor,
	OutcomeDetail,
} from "../../../components/my-course-parts";
import type { MyCourseDetail } from "../../../domain/enrollment.types";
import {
	ENROLLMENT_ORIGIN_LABELS,
	ENROLLMENT_RESULT_LABELS,
	sessionCountOf,
	withdrawalLabelOf,
} from "../../../utils/enrollment-labels";
import {
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	INTENT_FIELD,
} from "../../../utils/parse-enrollment-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/mis-cursos";

interface Status {
	icon: LucideIcon;
	tone: "success" | "neutral" | "muted";
	title: string;
}

/** Cómo va el curso para quien lo cursa, con lo que tiene que saber para seguir. */
function OwnStatus({ entry }: { entry: MyCourseDetail }) {
	const { course, enrollment, outcome, can, timeline } = entry;

	if (course.status === "CANCELLED") {
		return (
			<CourseDetailStatus icon={CircleX} tone="muted" title="Curso cancelado">
				<p>Lo canceló quien lo organiza. No requiere ninguna acción.</p>
			</CourseDetailStatus>
		);
	}

	if (enrollment.status === "WITHDRAWN") {
		return (
			<CourseDetailStatus
				icon={UserX}
				tone="muted"
				title={withdrawalLabelOf(enrollment)}
			>
				<p>
					Ya no participas en este curso.
					{enrollment.removed &&
						" Si quieres volver, pídeselo a quien lo organiza."}
					{can.enroll &&
						outcome.progressPercent > 0 &&
						" Si vuelves a inscribirte, retomas tu avance donde lo dejaste."}
				</p>
			</CourseDetailStatus>
		);
	}

	if (enrollment.status === "DECLINED") {
		return (
			<CourseDetailStatus
				icon={CircleX}
				tone="muted"
				title="Rechazaste la invitación"
			/>
		);
	}

	if (enrollment.status === "INVITED") {
		return (
			<CourseDetailStatus
				icon={Mail}
				tone="neutral"
				title="Te invitaron a este curso"
			>
				<p>
					{course.enrollmentDeadline
						? `Responde antes del ${formatZonedDate(new Date(course.enrollmentDeadline))}.`
						: "Aceptar ocupa un lugar si queda."}
				</p>
			</CourseDetailStatus>
		);
	}

	if (isOverFor(entry)) {
		// Las sesiones ya pasaron pero nadie ha cerrado el curso: el completado
		// todavía no se calcula.
		const closing: Status = outcome.completed
			? { icon: CircleCheck, tone: "success", title: "Completado · 1 crédito" }
			: course.status === "PUBLISHED" && requiresSessions(course.format)
				? { icon: Info, tone: "neutral", title: "Resultado pendiente" }
				: { icon: CircleMinus, tone: "muted", title: "No completado" };

		return (
			<CourseDetailStatus {...closing}>
				<OutcomeDetail entry={entry} />
				{!entry.canRate && outcome.myRating !== null && (
					<p className="text-xs">Lo valoraste con {outcome.myRating} de 5.</p>
				)}
			</CourseDetailStatus>
		);
	}

	const next = timeline.nextSession;
	return (
		<CourseDetailStatus
			icon={CircleCheck}
			tone="success"
			title="Estás inscrito"
		>
			{countsContent(course.completionRule) ? (
				<ContentProgress entry={entry} />
			) : (
				<OutcomeDetail entry={entry} />
			)}
			{next && (
				<p>
					Próxima sesión:{" "}
					<span className="font-medium text-foreground">
						{formatSessionRange(new Date(next.startsAt), new Date(next.endsAt))}
					</span>
				</p>
			)}
		</CourseDetailStatus>
	);
}

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

	const facts: CourseDetailFact[] = [
		{ label: "Modalidad", value: modalityLabelOf(course) },
		...(requiresSessions(course.format) || course.sessions.length > 0
			? [{ label: "Sesiones", value: sessionCountOf(course.sessions.length) }]
			: []),
		...(course.hours !== null
			? [{ label: "Duración", value: formatHours(course.hours) }]
			: []),
		{
			label: "Inscripción",
			value: ENROLLMENT_ORIGIN_LABELS[enrollment.origin],
		},
		...(isEnrolled && enrollment.result !== "PENDING"
			? [
					{
						label: "Resultado",
						value: ENROLLMENT_RESULT_LABELS[enrollment.result],
					},
				]
			: []),
	];

	return (
		<div className="flex flex-col gap-6 pb-8">
			<PageHeader
				title={course.title}
				description={`Organiza ${course.dependencyName}.`}
				goBack={LIST_PATH}
				actions={actions}
			/>

			<CourseDetailSummary course={course} facts={facts}>
				<OwnStatus entry={entry} />
			</CourseDetailSummary>

			<CourseDetailBody
				course={course}
				sessionMaterials={entry.sessionMaterials}
			/>

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
