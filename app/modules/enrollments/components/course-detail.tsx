import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParticipantSessionMaterials } from "@/modules/content/domain/session-material.types";
import {
	requiresSessions,
	requiresTrainer,
} from "@/modules/courses/domain/course.rules";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { EnrollmentCourse } from "../domain/enrollment.types";
import { personNameOf } from "../utils/enrollment-labels";
import { CourseCover } from "./course-cover";
import { CourseSessionsList } from "./course-sessions-list";

export interface CourseDetailFact {
	label: string;
	value: string;
}

/**
 * Cabecera de las dos fichas del curso —catálogo y «Mis cursos»—: la portada
 * en miniatura, los datos clave y, en `children`, dónde está la persona.
 */
export function CourseDetailSummary({
	course,
	facts,
	children,
}: {
	course: Pick<
		EnrollmentCourse,
		"documentId" | "title" | "modality" | "coverUrl"
	>;
	facts: CourseDetailFact[];
	children: React.ReactNode;
}) {
	return (
		<Card>
			{/* En móvil la miniatura acompaña al estado y los datos bajan a todo el
			    ancho; desde `md` la miniatura ocupa las dos filas de la izquierda. */}
			<CardContent className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-5 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-x-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
				{/* 16:9, la proporción a la que se recortó al subirla. */}
				<div className="aspect-video self-start overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/5 md:row-span-2">
					<CourseCover
						documentId={course.documentId}
						title={course.title}
						modality={course.modality}
						src={course.coverUrl}
						eager
					/>
				</div>

				<div className="col-start-2 row-start-1 self-center md:row-start-2 md:self-end">
					{children}
				</div>

				<dl className="col-span-2 row-start-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:col-span-1 md:col-start-2 md:row-start-1">
					{facts.map((fact) => (
						<div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
							<dt className="text-muted-foreground text-xs">{fact.label}</dt>
							<dd className="font-medium text-sm">{fact.value}</dd>
						</div>
					))}
				</dl>
			</CardContent>
		</Card>
	);
}

type StatusTone = "success" | "neutral" | "muted";

const TONE_CLASSES: Record<StatusTone, string> = {
	success: "text-success-foreground",
	neutral: "text-foreground",
	muted: "text-muted-foreground",
};

/** Dónde está la persona respecto al curso: una frase y lo que la explica. */
export function CourseDetailStatus({
	icon: Icon,
	tone = "neutral",
	title,
	children,
}: {
	icon?: LucideIcon;
	tone?: StatusTone;
	title: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<p
				className={cn(
					"flex items-center gap-2 font-medium text-sm md:text-base",
					TONE_CLASSES[tone],
				)}
			>
				{Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
				{title}
			</p>
			{children && (
				<div className="flex flex-col gap-2 text-muted-foreground text-sm">
					{children}
				</div>
			)}
		</div>
	);
}

/** Sesiones y la descripción con quién lo imparte; cada bloque solo si aplica. */
export function CourseDetailBody({
	course,
	sessionMaterials,
}: {
	/** El material de cada sesión, para quien está inscrito. */
	sessionMaterials?: readonly ParticipantSessionMaterials[];
	course: Pick<
		EnrollmentCourse,
		"sessions" | "description" | "format" | "modality" | "trainers"
	>;
}) {
	// Las del híbrido autogestivo son opcionales: sin ninguna, no hay bloque.
	const showsSessions =
		requiresSessions(course.format) || course.sessions.length > 0;
	const showsTrainers = requiresTrainer(course);
	const showsAbout = Boolean(course.description) || showsTrainers;

	if (!showsSessions && !showsAbout) return null;

	return (
		<div
			className={cn(
				"grid items-start gap-4",
				showsSessions && showsAbout && "lg:grid-cols-2",
			)}
		>
			{showsSessions && (
				<Card>
					<CardContent className="flex flex-col gap-2">
						<h2 className="font-medium text-base">Sesiones</h2>
						<CourseSessionsList
							sessions={course.sessions}
							materials={sessionMaterials}
						/>
					</CardContent>
				</Card>
			)}

			{showsAbout && (
				<Card>
					<CardContent className="flex flex-col gap-5">
						{course.description && (
							<section className="flex flex-col gap-2">
								<h2 className="font-medium text-base">
									Acerca de la capacitación
								</h2>
								<p className="max-w-prose whitespace-pre-line text-sm leading-relaxed">
									{course.description}
								</p>
							</section>
						)}
						{showsTrainers && (
							<section className="flex flex-col gap-2">
								<h2 className="font-medium text-base">Capacitadores</h2>
								{course.trainers.length === 0 ? (
									<p className="text-muted-foreground text-sm">Sin asignar.</p>
								) : (
									<ul className="flex flex-col gap-1 text-sm">
										{course.trainers.map((trainer) => (
											<li key={trainer.email}>{personNameOf(trainer)}</li>
										))}
									</ul>
								)}
							</section>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
