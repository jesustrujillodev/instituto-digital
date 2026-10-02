import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CourseDetailBadges } from "@/modules/courses/components/course-badges";
import {
	type CourseDetailFact,
	CourseDetailLayout,
	CourseDetailSection,
	CourseDetailStatusCard,
	CourseDetailsCard,
} from "@/modules/courses/components/course-detail-layout";
import {
	CourseProgram,
	programAsideOf,
} from "@/modules/courses/components/course-program";
import { CourseTrainers } from "@/modules/courses/components/course-trainers";
import {
	requiresSessions,
	requiresTrainer,
} from "@/modules/courses/domain/course.rules";
import type {
	EnrollmentCourse,
	EnrollmentCourseSession,
} from "../domain/enrollment.types";
import { CourseCover } from "./course-cover";

/**
 * La ficha del curso que ve el participante —catálogo y «Mis capacitaciones»—,
 * sobre el mismo esqueleto que la de administración: misma portada, mismo
 * Programa, mismas secciones en el mismo orden.
 */
export function ParticipantCourseDetail({
	course,
	now,
	status,
	facts,
	renderSessionExtra,
	children,
}: {
	course: Pick<
		EnrollmentCourse,
		| "documentId"
		| "title"
		| "description"
		| "coverUrl"
		| "status"
		| "modality"
		| "format"
		| "access"
		| "sessions"
		| "trainers"
	>;
	now: Date | string;
	/** Dónde está la persona respecto al curso. */
	status: React.ReactNode;
	facts: readonly CourseDetailFact[];
	/** Lo que cuelga de cada sesión del Programa, como su material. */
	renderSessionExtra?: (session: EnrollmentCourseSession) => React.ReactNode;
	/** Secciones propias de la vista, después del Programa. */
	children?: React.ReactNode;
}) {
	// Las del híbrido autogestivo son opcionales: sin ninguna, no hay Programa.
	const showsProgram =
		requiresSessions(course.format) || course.sessions.length > 0;

	return (
		<>
			<CourseDetailBadges course={course} hidePublished />

			<CourseDetailLayout
				cover={
					<CourseCover
						documentId={course.documentId}
						title={course.title}
						modality={course.modality}
						src={course.coverUrl}
						eager
					/>
				}
				status={<CourseDetailStatusCard>{status}</CourseDetailStatusCard>}
				details={facts.length > 0 && <CourseDetailsCard facts={facts} />}
			>
				{course.description && (
					<CourseDetailSection title="Descripción">
						<p className="max-w-prose whitespace-pre-line text-sm leading-relaxed">
							{course.description}
						</p>
					</CourseDetailSection>
				)}

				{showsProgram && (
					<CourseDetailSection
						title="Programa"
						aside={programAsideOf(course.sessions.length)}
					>
						<CourseProgram
							sessions={course.sessions}
							modality={course.modality}
							now={now}
							renderSessionExtra={renderSessionExtra}
							emptyMessage="Sin sesiones programadas."
						/>
					</CourseDetailSection>
				)}

				{children}

				{requiresTrainer(course) && (
					<CourseDetailSection title="Capacitadores">
						<CourseTrainers trainers={course.trainers} />
					</CourseDetailSection>
				)}
			</CourseDetailLayout>
		</>
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
					"flex items-center gap-2 font-medium text-base",
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
