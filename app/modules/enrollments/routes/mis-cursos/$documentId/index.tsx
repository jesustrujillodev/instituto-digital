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
import { pendingIntentOf } from "@/lib/form-data";
import { MyCertificateMenu } from "@/modules/certificates/components/my-certificate-menu";
import { ParticipantFollowUps } from "@/modules/content/components/participant-follow-ups";
import { SessionMaterialList } from "@/modules/content/components/session-material-list";
import {
	type CourseDetailFact,
	CourseDetailSection,
} from "@/modules/courses/components/course-detail-layout";
import { formatHours } from "@/modules/courses/domain/course.labels";
import {
	countsContent,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import { RateCourseDialog } from "@/modules/ratings/components/rate-course-dialog";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	CourseDetailStatus,
	ParticipantCourseDetail,
} from "../../../components/course-detail";
import {
	ClassroomLink,
	ContentProgress,
	isOverFor,
	OutcomeDetail,
} from "../../../components/my-course-parts";
import type { MyCourseDetail } from "../../../domain/enrollment.types";
import { ownGapReasonOf } from "../../../utils/accreditation-reasons";
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

const LIST_PATH = "/dashboard/mis-capacitaciones";

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
			<CourseDetailStatus
				icon={CircleX}
				tone="muted"
				title="Capacitación cancelada"
			>
				<p>La canceló quien la organiza. No requiere ninguna acción.</p>
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
					Ya no participas en esta capacitación.
					{enrollment.removed &&
						" Si quieres volver, pídeselo a quien la organiza."}
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
				title="Te invitaron a esta capacitación"
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
		// Las sesiones ya pasaron pero nadie ha cerrado el curso: la acreditación
		// todavía no se calcula.
		const pending =
			course.status === "PUBLISHED" && requiresSessions(course.format);
		const closing: Status = outcome.completed
			? { icon: CircleCheck, tone: "success", title: "Acreditada · 1 crédito" }
			: pending
				? { icon: Info, tone: "neutral", title: "Resultado pendiente" }
				: { icon: CircleMinus, tone: "muted", title: "No acreditada" };

		return (
			<CourseDetailStatus {...closing}>
				<OutcomeDetail entry={entry} />
				{!outcome.completed && !pending && entry.gaps.length > 0 && (
					<ul className="flex flex-col gap-1 text-foreground">
						{entry.gaps.map((gap) => (
							<li key={gap.kind}>{ownGapReasonOf(gap)}</li>
						))}
					</ul>
				)}
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
		{ label: "Mis capacitaciones", path: LIST_PATH },
		{ label: loaderData?.data.course.title ?? "Capacitación" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	return [{ title: data?.data.course.title ?? "Capacitación" }];
}

export default function MiCursoPage({ loaderData }: Route.ComponentProps) {
	const { data: entry } = loaderData;
	const { course, enrollment, outcome, can } = entry;

	const fetcher = useFetcher<EnrollmentActionData>();
	useFetcherToast(fetcher);

	const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
	const isSubmitting = fetcher.state !== "idle";
	const pendingIntent = pendingIntentOf(fetcher, INTENT_FIELD);

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
					pending={pendingIntent === ENROLLMENT_INTENTS.decline}
					onClick={() => submit(ENROLLMENT_INTENTS.decline)}
				>
					<X className="h-4 w-4" />
					Rechazar invitación
				</Button>
			)}
			{can.accept && (
				<Button
					disabled={isSubmitting}
					pending={pendingIntent === ENROLLMENT_INTENTS.accept}
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
					pending={pendingIntent === ENROLLMENT_INTENTS.withdraw}
					onClick={() => setConfirmingWithdraw(true)}
				>
					<LogOut className="h-4 w-4" />
					Darme de baja
				</Button>
			)}
			{can.enroll && (
				<Button
					disabled={isSubmitting}
					pending={pendingIntent === ENROLLMENT_INTENTS.enroll}
					onClick={() => submit(ENROLLMENT_INTENTS.enroll)}
				>
					<RotateCcw className="h-4 w-4" />
					Volver a inscribirme
				</Button>
			)}
		</div>
	);

	const facts: CourseDetailFact[] = [
		...(requiresSessions(course.format) || course.sessions.length > 0
			? [{ term: "Sesiones", value: sessionCountOf(course.sessions.length) }]
			: []),
		...(course.hours !== null
			? [{ term: "Duración", value: formatHours(course.hours) }]
			: []),
		{
			term: "Inscripción",
			value: ENROLLMENT_ORIGIN_LABELS[enrollment.origin],
		},
		...(isEnrolled && enrollment.result !== "PENDING"
			? [
					{
						term: "Resultado",
						value: ENROLLMENT_RESULT_LABELS[enrollment.result],
					},
				]
			: []),
	];

	return (
		<div className="flex flex-col">
			<PageHeader
				title={course.title}
				description={`Organiza ${course.dependencyName}.`}
				goBack={LIST_PATH}
				actions={actions}
			/>

			<ParticipantCourseDetail
				course={course}
				now={entry.now}
				facts={facts}
				status={<OwnStatus entry={entry} />}
				renderSessionExtra={(session) => (
					<SessionMaterialList
						materials={
							entry.sessionMaterials.find(
								(item) => item.sessionDocumentId === session.documentId,
							)?.materials ?? []
						}
					/>
				)}
			>
				{entry.followUps.length > 0 && (
					<CourseDetailSection title="Evaluaciones de seguimiento">
						<ParticipantFollowUps
							courseDocumentId={course.documentId}
							followUps={entry.followUps}
							sessions={course.sessions}
						/>
					</CourseDetailSection>
				)}
			</ParticipantCourseDetail>

			<ConfirmDialog
				open={confirmingWithdraw}
				onOpenChange={setConfirmingWithdraw}
				title="¿Darte de baja de la capacitación?"
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
