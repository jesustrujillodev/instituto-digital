export { action } from "./index.action";
export { loader } from "./index.loader";

import type { LucideIcon } from "lucide-react";
import {
	BookOpen,
	Check,
	CircleCheck,
	CircleX,
	LogOut,
	Mail,
	Users,
	UserX,
	X,
} from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { pendingIntentOf } from "@/lib/form-data";
import type { CourseDetailFact } from "@/modules/courses/components/course-detail-layout";
import { requiresSessions } from "@/modules/courses/domain/course.rules";
import { formatHours } from "@/modules/courses/utils/course-labels";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	CourseDetailStatus,
	ParticipantCourseDetail,
} from "../../../components/course-detail";
import type { EnrollmentStatus } from "../../../domain/enrollment.config";
import type { CourseWithAvailability } from "../../../domain/enrollment.types";
import {
	ENROLLMENT_ORIGIN_LABELS,
	seatsLabelOf,
	sessionCountOf,
	withdrawalLabelOf,
} from "../../../utils/enrollment-labels";
import {
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	INTENT_FIELD,
} from "../../../utils/parse-enrollment-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/catalogo-de-capacitaciones";

const OWN_STATUS: Record<
	EnrollmentStatus,
	{ icon: LucideIcon; tone: "success" | "neutral" | "muted"; title: string }
> = {
	ENROLLED: { icon: CircleCheck, tone: "success", title: "Estás inscrito" },
	INVITED: {
		icon: Mail,
		tone: "neutral",
		title: "Te invitaron a esta capacitación",
	},
	WITHDRAWN: { icon: UserX, tone: "muted", title: "Te diste de baja" },
	DECLINED: { icon: CircleX, tone: "muted", title: "Rechazaste la invitación" },
};

/** Tu lugar en el curso, si tienes uno; si no, si todavía se puede entrar. */
function AvailabilityStatus({
	course,
	enrollmentStatus,
	removed,
}: {
	course: Pick<CourseWithAvailability, "closesAt" | "isOpen" | "seatsLeft">;
	enrollmentStatus: EnrollmentStatus | null;
	removed: boolean;
}) {
	const deadline =
		course.closesAt === null
			? "Esta capacitación todavía no tiene sesiones."
			: course.isOpen
				? `La inscripción cierra el ${formatZonedDate(new Date(course.closesAt))}.`
				: `La inscripción cerró el ${formatZonedDate(new Date(course.closesAt))}.`;

	const own = enrollmentStatus && OWN_STATUS[enrollmentStatus];
	const title =
		(removed ? withdrawalLabelOf({ removed }) : own?.title) ??
		(course.isOpen
			? course.seatsLeft === 0
				? "Cupo lleno"
				: "Inscripción abierta"
			: "Inscripción cerrada");

	return (
		<CourseDetailStatus
			icon={own?.icon}
			tone={own?.tone ?? (course.isOpen ? "neutral" : "muted")}
			title={title}
		>
			<p>{deadline}</p>
		</CourseDetailStatus>
	);
}

export const handle = {
	breadcrumb: () => [
		{ label: "Catálogo de capacitaciones", path: LIST_PATH },
		{ label: "Capacitación" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Capacitación" }];
}

export default function CursoDisponiblePage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { course, enrollment, can, hasClassroom, now },
	} = loaderData;

	const fetcher = useFetcher<EnrollmentActionData>();
	useFetcherToast(fetcher);

	const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
	const isSubmitting = fetcher.state !== "idle";
	const pendingIntent = pendingIntentOf(fetcher, INTENT_FIELD);

	const submit = (intent: string) =>
		fetcher.submit({ [INTENT_FIELD]: intent }, { method: "post" });

	const facts: CourseDetailFact[] = [
		{ term: "Cupo", value: seatsLabelOf(course.capacity, course.seatsLeft) },
		...(requiresSessions(course.format) || course.sessions.length > 0
			? [{ term: "Sesiones", value: sessionCountOf(course.sessions.length) }]
			: []),
		...(course.hours !== null
			? [{ term: "Duración", value: formatHours(course.hours) }]
			: []),
		...(enrollment
			? [
					{
						term: "Inscripción",
						value: ENROLLMENT_ORIGIN_LABELS[enrollment.origin],
					},
				]
			: []),
	];

	const actions = (
		<div className="flex flex-wrap gap-2">
			{can.assign && (
				<Button variant="outline" asChild>
					<Link
						to={`/dashboard/capacitaciones/${course.documentId}/inscripciones`}
					>
						<Users className="h-4 w-4" />
						Inscribir a mi personal
					</Link>
				</Button>
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
			{hasClassroom && (
				<Button asChild>
					<Link to={`/dashboard/mis-capacitaciones/${course.documentId}/aula`}>
						<BookOpen className="h-4 w-4" />
						Entrar al aula
					</Link>
				</Button>
			)}
			{can.enroll && (
				<Button
					disabled={isSubmitting}
					pending={pendingIntent === ENROLLMENT_INTENTS.enroll}
					onClick={() => submit(ENROLLMENT_INTENTS.enroll)}
				>
					<Check className="h-4 w-4" />
					Inscribirme
				</Button>
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
			/>

			<ParticipantCourseDetail
				course={course}
				now={now}
				facts={facts}
				status={
					<AvailabilityStatus
						course={course}
						enrollmentStatus={enrollment?.status ?? null}
						removed={enrollment?.removed ?? false}
					/>
				}
			/>

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
