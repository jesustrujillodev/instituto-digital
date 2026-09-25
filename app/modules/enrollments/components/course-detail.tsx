import { requiresTrainer } from "@/modules/courses/domain/course.rules";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { EnrollmentCourse } from "../domain/enrollment.types";
import { personNameOf } from "../utils/enrollment-labels";
import { CourseCover } from "./course-cover";
import { CourseSessionsList } from "./course-sessions-list";

/** Lo que pintan las dos fichas del curso: la del catálogo y la de «Mis cursos». */
export function CourseDetailCover({
	course,
}: {
	course: Pick<
		EnrollmentCourse,
		"documentId" | "title" | "modality" | "coverUrl"
	>;
}) {
	return (
		// 16:9, la misma proporción a la que se recortó al subirla: a 21:9 el
		// `object-cover` se comía casi una cuarta parte de la imagen y quien
		// llegó desde la cuadrícula no reconocía del todo la que acaba de tocar.
		<div className="aspect-video w-full overflow-hidden rounded-4xl bg-muted ring-1 ring-foreground/5">
			<CourseCover
				documentId={course.documentId}
				title={course.title}
				modality={course.modality}
				src={course.coverUrl}
				eager
			/>
		</div>
	);
}

export function CourseDetailCards({
	course,
}: {
	course: Pick<
		EnrollmentCourse,
		"sessions" | "description" | "format" | "trainers"
	>;
}) {
	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<Card>
				<CardContent className="flex flex-col gap-3">
					<h3 className="font-medium text-sm">Sesiones</h3>
					<CourseSessionsList sessions={course.sessions} />
				</CardContent>
			</Card>

			{(course.description || requiresTrainer(course.format)) && (
				<Card>
					<CardContent className="flex flex-col gap-3">
						{course.description && (
							<p className="text-sm whitespace-pre-line">
								{course.description}
							</p>
						)}
						{requiresTrainer(course.format) && (
							<>
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
							</>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
