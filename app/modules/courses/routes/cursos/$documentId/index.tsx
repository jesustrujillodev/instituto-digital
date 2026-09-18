export { action } from "./index.action";
export { loader } from "./index.loader";

import { Pencil, Send } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { CourseCover } from "@/modules/enrollments/components/course-cover";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	CourseAccessBadge,
	CourseModalityBadge,
	CourseStatusBadge,
} from "../../../components/course-badges";
import { CourseFacts } from "../../../components/course-facts";
import { CourseProgram } from "../../../components/course-program";
import { CourseStatusPanel } from "../../../components/course-status-panel";
import type { CourseDetail } from "../../../domain/course.types";
import {
	COURSE_INTENTS,
	type CourseActionData,
	INTENT_FIELD,
} from "../../../utils/parse-course-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/cursos";

export const handle = {
	breadcrumb: (loaderData) => [
		{ label: "Cursos", path: LIST_PATH },
		{ label: loaderData?.data.course.title ?? "Curso" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	return [{ title: data?.data.course.title ?? "Curso" }];
}

const trainerNameOf = (trainer: CourseDetail["trainers"][number]) =>
	[trainer.firstName, trainer.lastName].filter(Boolean).join(" ") ||
	trainer.email;

export default function CursoPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { course, coverUrl, enrollment, publishChecklist, can },
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

	const isReady = publishChecklist?.every((entry) => entry.done) ?? false;

	const actions = (can.edit || can.publish) && (
		<>
			{can.edit && (
				<Button asChild variant="outline">
					<Link to={`/dashboard/cursos/${course.documentId}/editar`}>
						<Pencil aria-hidden="true" />
						Editar
					</Link>
				</Button>
			)}
			{can.publish && (
				<Button
					type="button"
					disabled={!isReady || isChangingStatus}
					onClick={() => submitStatus(COURSE_INTENTS.publish)}
				>
					<Send aria-hidden="true" />
					{isPublishing ? "Publicando…" : "Publicar"}
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

			<div className="mb-6 flex flex-wrap items-center gap-2">
				<CourseStatusBadge status={course.status} />
				<CourseModalityBadge modality={course.modality} />
				<CourseAccessBadge access={course.access} />
			</div>

			{/* En móvil manda la tarea: primero el estado, luego el contenido y al
			    final los detalles. En escritorio, estado y detalles van a la derecha. */}
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
				<aside className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
					<div className="hidden aspect-video overflow-hidden rounded-4xl bg-muted ring-1 ring-foreground/5 lg:block">
						<CourseCover
							documentId={course.documentId}
							title={course.title}
							modality={course.modality}
							src={coverUrl}
							eager
						/>
					</div>

					<CourseStatusPanel
						documentId={course.documentId}
						status={course.status}
						modality={course.modality}
						cancelledAt={course.cancelledAt}
						checklist={publishChecklist}
						enrollment={enrollment}
						canTeach={can.teach}
						canCancel={can.cancel}
						isChangingStatus={isChangingStatus}
						onCancel={() => setConfirmingCancel(true)}
					/>

					<CourseFacts course={course} className="hidden lg:flex" />
				</aside>

				<Card className="gap-0 py-0 lg:col-start-1 lg:row-start-1">
					<DetailSection title="Descripción">
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
					</DetailSection>

					<DetailSection
						title="Programa"
						aside={
							course.sessions.length > 0 &&
							`${course.sessions.length} ${course.sessions.length === 1 ? "sesión" : "sesiones"} · Horario de Tijuana`
						}
					>
						<CourseProgram
							sessions={course.sessions}
							modality={course.modality}
						/>
					</DetailSection>

					<DetailSection title="Capacitadores">
						{course.trainers.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								Sin capacitadores asignados.
							</p>
						) : (
							<ul className="flex flex-col gap-3">
								{course.trainers.map((trainer) => (
									<li
										key={trainer.userDocumentId}
										className="flex flex-col gap-0.5"
									>
										<p className="flex flex-wrap items-center gap-2 font-medium text-sm">
											{trainerNameOf(trainer)}
											{!trainer.isActive && (
												<Badge variant="destructive">Inactivo</Badge>
											)}
										</p>
										<p className="text-muted-foreground text-sm">
											{[trainer.specialty, trainer.email]
												.filter(Boolean)
												.join(" · ")}
										</p>
									</li>
								))}
							</ul>
						)}
					</DetailSection>

					<DetailSection title="Audiencia">
						<CourseAudience course={course} />
					</DetailSection>
				</Card>
			</div>

			<CourseFacts course={course} className="mt-4 lg:hidden" />

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

function DetailSection({
	title,
	aside,
	children,
}: {
	title: string;
	aside?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-4 border-border border-t p-6 first:border-t-0">
			<header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 className="font-medium text-base">{title}</h2>
				{aside && <p className="text-muted-foreground text-xs">{aside}</p>}
			</header>
			{children}
		</section>
	);
}

function CourseAudience({ course }: { course: CourseDetail }) {
	if (course.access === "PUBLIC") {
		return (
			<p className="text-sm">
				Cualquier persona interna puede verlo e inscribirse.
			</p>
		);
	}

	if (course.access === "INVITATION") {
		return (
			<p className="text-sm">
				Solo lo ven las personas invitadas. Las invitaciones se envían desde
				Inscripciones una vez publicado.
			</p>
		);
	}

	const { dependencies, groups } = course.audience;

	if (dependencies.length + groups.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Restringido, pero todavía sin dependencias ni grupos: nadie podría
				verlo.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{[
				{ label: "Dependencias completas", entries: dependencies },
				{ label: "Grupos", entries: groups },
			]
				.filter(({ entries }) => entries.length > 0)
				.map(({ label, entries }) => (
					<div key={label} className="flex flex-col gap-2">
						<h3 className="text-muted-foreground text-xs">{label}</h3>
						<ul className="flex flex-wrap gap-2">
							{entries.map((entry) => (
								<li key={entry.documentId}>
									<Badge variant="outline">{entry.name}</Badge>
								</li>
							))}
						</ul>
					</div>
				))}
		</div>
	);
}
