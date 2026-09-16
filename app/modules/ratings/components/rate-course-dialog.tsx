import { cn } from "cn";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import {
	RATING_COMMENT_MAX_LENGTH,
	RATING_SCORE_RANGE,
} from "../domain/rating.config";
import {
	COMMENT_FIELD,
	type RatingActionData,
	ratePath,
	SCORE_FIELD,
} from "../utils/rating-form";

const SCORES = Array.from(
	{ length: RATING_SCORE_RANGE.max - RATING_SCORE_RANGE.min + 1 },
	(_, index) => RATING_SCORE_RANGE.min + index,
);

export function RateCourseDialog({
	courseDocumentId,
	courseTitle,
}: {
	courseDocumentId: string;
	courseTitle: string;
}) {
	const fetcher = useFetcher<RatingActionData>();
	useFetcherToast(fetcher);

	const [open, setOpen] = useState(false);
	const [score, setScore] = useState<number | null>(null);
	const [comment, setComment] = useState("");

	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data?.success) setOpen(false);
	}, [fetcher.state, fetcher.data]);

	const submit = () => {
		if (score === null) return;
		fetcher.submit(
			{ [SCORE_FIELD]: String(score), [COMMENT_FIELD]: comment },
			{ method: "post", action: ratePath(courseDocumentId) },
		);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Star className="h-4 w-4" />
					Valorar curso
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Valorar «{courseTitle}»</DialogTitle>
					<DialogDescription>
						Tu comentario se muestra sin tu nombre. La valoración no se puede
						editar después.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<fieldset className="flex gap-1">
						<legend className="sr-only">Puntuación</legend>
						{SCORES.map((value) => (
							<button
								key={value}
								type="button"
								aria-pressed={score === value}
								aria-label={`${value} de ${RATING_SCORE_RANGE.max}`}
								onClick={() => setScore(value)}
								className="rounded-md p-1 hover:bg-accent"
							>
								<Star
									className={cn(
										"h-7 w-7 text-muted-foreground",
										score !== null &&
											value <= score &&
											"fill-primary text-primary",
									)}
								/>
							</button>
						))}
					</fieldset>

					<div className="flex flex-col gap-2">
						<Label htmlFor={`rating-comment-${courseDocumentId}`}>
							Comentario (opcional)
						</Label>
						<Textarea
							id={`rating-comment-${courseDocumentId}`}
							value={comment}
							maxLength={RATING_COMMENT_MAX_LENGTH}
							onChange={(event) => setComment(event.target.value)}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						onClick={submit}
						disabled={score === null || fetcher.state !== "idle"}
					>
						Enviar valoración
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
