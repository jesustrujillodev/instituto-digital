import { Star } from "lucide-react";
import { formatZonedDate } from "@/lib/date-utils";
import type { CourseRatingSummary } from "@/modules/ratings/domain/rating.types";
import { Card, CardContent } from "@/shared/components/ui/card";

/** Promedio y comentarios, siempre sin nombre (§6.10). */
export function RatingsPanel({ summary }: { summary: CourseRatingSummary }) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-4">
				<div className="flex items-center gap-3">
					<Star className="h-5 w-5 text-muted-foreground" />
					<p className="text-sm">
						{summary.average === null
							? "Todavía nadie ha valorado el curso."
							: `${summary.average.toFixed(1)} de 5 · ${summary.count} ${summary.count === 1 ? "valoración" : "valoraciones"}`}
					</p>
				</div>

				{summary.comments.length > 0 && (
					<ul className="flex flex-col divide-y divide-border">
						{summary.comments.map((comment, index) => (
							<li
								// Sin id a propósito: nada en la proyección identifica al autor.
								// biome-ignore lint/suspicious/noArrayIndexKey: la lista no se reordena.
								key={index}
								className="flex flex-col gap-1 py-2"
							>
								<span className="text-muted-foreground text-xs">
									{comment.score} de 5 ·{" "}
									{formatZonedDate(new Date(comment.createdAt))}
								</span>
								<p className="text-sm">{comment.comment}</p>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
