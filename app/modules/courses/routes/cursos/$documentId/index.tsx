export { action } from "./index.action";
export { loader } from "./index.loader";

import { Award, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { CertificateStatusNotice } from "@/modules/certificates/components/certificate-status-notice";
import { EnrollmentQrPanel } from "@/modules/enrollment-qr/components/enrollment-qr-panel";
import { CourseCover } from "@/modules/enrollments/components/course-cover";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseAudience } from "../../../components/course-audience";
import { CourseDetailBadges } from "../../../components/course-badges";
import {
	CourseDetailLayout,
	CourseDetailSection,
} from "../../../components/course-detail-layout";
import { CourseFacts } from "../../../components/course-facts";
import {
	CourseProgram,
	programAsideOf,
} from "../../../components/course-program";
import { CourseStatusPanel } from "../../../components/course-status-panel";
import { CourseTrainers } from "../../../components/course-trainers";
import {
	requiresSessions,
	requiresTrainer,
} from "../../../domain/course.rules";
import {
	COURSE_INTENTS,
	type CourseActionData,
	INTENT_FIELD,
} from "../../../utils/parse-course-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/capacitaciones";

export const handle = {
	breadcrumb: (loaderData) => [
		{ label: "Capacitaciones", path: LIST_PATH },
		{ label: loaderData?.data.course.title ?? "Capacitación" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	return [{ title: data?.data.course.title ?? "Capacitación" }];
}

export default function CursoPage({ loaderData }: Route.ComponentProps) {
	const {
		data: {
			course,
			coverUrl,
			enrollment,
			publishChecklist,
			certificateState,
			now,
			enrollmentQr,
			can,
		},
	} = loaderData;
	const [confirmingCancel, setConfirmingCancel] = useState(false);

	const statusFetcher = useFetcher<CourseActionData>();
	useFetcherToast(statusFetcher);
	const isChangingStatus = statusFetcher.state !== "idle";
	const isPublishing =
		isChangingStatus &&
		statusFetcher.formData?.get(INTENT_FIELD) === COURSE_INTENTS.publish;

	const submitStatus = (intent: string) =>
		statusFetcher.submit({ [INTENT_FIELD]: intent }, { method: "post" });

	// Publicar vive en el panel de estado, junto a la lista de pendientes que lo
	// habilita: separarlos dejaba el botón apagado sin decir por qué.
	const actions = (can.edit || can.certificate) && (
		<>
			{can.certificate && (
				<Button asChild variant="outline">
					<Link
						to={`/dashboard/capacitaciones/${course.documentId}/certificado`}
					>
						<Award aria-hidden="true" />
						Certificado
					</Link>
				</Button>
			)}
			{can.edit && (
				<Button asChild variant="outline">
					<Link to={`/dashboard/capacitaciones/${course.documentId}/editar/1`}>
						<Pencil aria-hidden="true" />
						Editar
					</Link>
				</Button>
			)}
		</>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title={course.title}
				description={`Organiza ${course.dependencyName}.`}
				goBack={LIST_PATH}
				actions={actions || undefined}
			/>

			<CourseDetailBadges course={course} />

			<CourseDetailLayout
				cover={
					<CourseCover
						documentId={course.documentId}
						title={course.title}
						modality={course.modality}
						src={coverUrl}
						eager
					/>
				}
				status={
					<CourseStatusPanel
						documentId={course.documentId}
						status={course.status}
						modality={course.modality}
						format={course.format}
						completionRule={course.completionRule}
						cancelledAt={course.cancelledAt}
						checklist={publishChecklist}
						enrollment={enrollment}
						canTeach={can.teach}
						canCancel={can.cancel}
						isChangingStatus={isChangingStatus}
						isPublishing={isPublishing}
						onCancel={() => setConfirmingCancel(true)}
						onPublish={() => submitStatus(COURSE_INTENTS.publish)}
					/>
				}
				aside={
					<>
						{enrollmentQr && (
							<EnrollmentQrPanel title={course.title} qr={enrollmentQr} />
						)}
						{certificateState && (
							<CertificateStatusNotice
								courseDocumentId={course.documentId}
								state={certificateState}
							/>
						)}
					</>
				}
				details={<CourseFacts course={course} />}
			>
				<CourseDetailSection title="Descripción">
					{course.description ? (
						<p className="max-w-prose whitespace-pre-line text-sm leading-relaxed">
							{course.description}
						</p>
					) : (
						<p className="text-muted-foreground text-sm">
							{can.edit
								? "Sin descripción. Agrégala desde Editar: es lo primero que lee el personal en el catálogo."
								: "Sin descripción."}
						</p>
					)}
				</CourseDetailSection>

				{(requiresSessions(course.format) || course.sessions.length > 0) && (
					<CourseDetailSection
						title="Programa"
						aside={programAsideOf(course.sessions.length)}
					>
						<CourseProgram
							sessions={course.sessions}
							modality={course.modality}
							now={now}
						/>
					</CourseDetailSection>
				)}

				{requiresTrainer(course) && (
					<CourseDetailSection title="Capacitadores">
						<CourseTrainers trainers={course.trainers} showContact />
					</CourseDetailSection>
				)}

				<CourseDetailSection title="Audiencia">
					<CourseAudience access={course.access} audience={course.audience} />
				</CourseDetailSection>
			</CourseDetailLayout>

			<ConfirmDialog
				open={confirmingCancel}
				onOpenChange={setConfirmingCancel}
				title="¿Cancelar la capacitación?"
				description="Dejará de ofrecerse y no podrá volver a publicarse. Sus sesiones, capacitadores y audiencia se conservan."
				confirmLabel="Cancelar capacitación"
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
