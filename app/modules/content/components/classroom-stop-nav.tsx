import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/shared/components/ui/button";
import type { ClassroomStop } from "../domain/classroom.types";
import { stopPath } from "../utils/content-form";

/** Anterior y Siguiente en el recorrido del aula: lecciones y evaluaciones de módulo. */
export function ClassroomStopNav({
	courseDocumentId,
	previous,
	next,
}: {
	courseDocumentId: string;
	previous: ClassroomStop | null;
	next: ClassroomStop | null;
}) {
	return (
		<div className="flex gap-2">
			{previous && (
				<Button asChild variant="outline">
					<Link to={stopPath(courseDocumentId, previous)}>
						<ChevronLeft />
						Anterior
					</Link>
				</Button>
			)}
			{next && (
				<Button asChild variant="outline">
					<Link to={stopPath(courseDocumentId, next)}>
						Siguiente
						<ChevronRight />
					</Link>
				</Button>
			)}
		</div>
	);
}
