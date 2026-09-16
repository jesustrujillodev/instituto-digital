import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import {
	ENROLLMENT_RESULTS,
	type EnrollmentResult,
} from "@/modules/enrollments/domain/enrollment.config";
import {
	ENROLLMENT_RESULT_LABELS,
	personNameOf,
} from "@/modules/enrollments/utils/enrollment-labels";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { GRADE_RANGE } from "../domain/teaching.rules";
import type { TeachingDetail } from "../domain/teaching.types";
import {
	INTENT_FIELD,
	PAYLOAD_FIELD,
	TEACHING_INTENTS,
	type TeachingActionData,
} from "../utils/parse-teaching-form-data";

type Draft = Record<string, { result: EnrollmentResult; grade: string }>;

const draftOf = (participants: TeachingDetail["participants"]): Draft =>
	Object.fromEntries(
		participants.map((participant) => [
			participant.userDocumentId,
			{
				result: participant.result,
				grade: participant.grade === null ? "" : String(participant.grade),
			},
		]),
	);

export function ResultsPanel({
	detail,
}: {
	detail: Pick<TeachingDetail, "participants" | "can" | "course">;
}) {
	const { participants, can, course } = detail;
	const fetcher = useFetcher<TeachingActionData>();
	useFetcherToast(fetcher);

	const [draft, setDraft] = useState<Draft>(() => draftOf(participants));
	useEffect(() => setDraft(draftOf(participants)), [participants]);

	if (participants.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Nadie está inscrito en este curso.
			</p>
		);
	}

	// En un curso finalizado ya no se puede volver a "Pendiente".
	const results =
		course.status === "FINISHED"
			? ENROLLMENT_RESULTS.filter((result) => result !== "PENDING")
			: ENROLLMENT_RESULTS;

	const update = (userDocumentId: string, patch: Partial<Draft[string]>) =>
		setDraft((previous) => {
			const next = { ...previous[userDocumentId], ...patch };
			if (next.result === "PENDING") next.grade = "";
			return { ...previous, [userDocumentId]: next };
		});

	const save = () =>
		fetcher.submit(
			{
				[INTENT_FIELD]: TEACHING_INTENTS.results,
				[PAYLOAD_FIELD]: JSON.stringify({
					entries: Object.entries(draft).map(([userDocumentId, entry]) => ({
						userDocumentId,
						result: entry.result,
						grade: entry.grade === "" ? null : Number(entry.grade),
					})),
				}),
			},
			{ method: "post" },
		);

	return (
		<Card>
			<CardContent className="flex flex-col gap-4">
				<p className="text-muted-foreground text-sm">
					Aprobado o no aprobado, con una nota opcional de {GRADE_RANGE.min} a{" "}
					{GRADE_RANGE.max}.
				</p>

				<ul className="flex flex-col divide-y divide-border">
					{participants.map((participant) => {
						const entry = draft[participant.userDocumentId];
						if (!entry) return null;

						return (
							<li
								key={participant.userDocumentId}
								className="flex flex-wrap items-center gap-3 py-2"
							>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm">
										{personNameOf(participant)}
									</span>
									<span className="block truncate text-muted-foreground text-xs">
										Asistencia {participant.attendancePercent} %
									</span>
								</span>
								<Select
									value={entry.result}
									disabled={!can.recordResults}
									onValueChange={(value) =>
										update(participant.userDocumentId, {
											result: value as EnrollmentResult,
										})
									}
								>
									<SelectTrigger className="w-40">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{results.map((result) => (
											<SelectItem key={result} value={result}>
												{ENROLLMENT_RESULT_LABELS[result]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Input
									type="number"
									inputMode="numeric"
									min={GRADE_RANGE.min}
									max={GRADE_RANGE.max}
									placeholder="Nota"
									aria-label={`Nota de ${personNameOf(participant)}`}
									className="w-24"
									value={entry.grade}
									disabled={!can.recordResults || entry.result === "PENDING"}
									onChange={(event) =>
										update(participant.userDocumentId, {
											grade: event.target.value,
										})
									}
								/>
							</li>
						);
					})}
				</ul>

				{can.recordResults && (
					<div className="flex justify-end">
						<Button onClick={save} disabled={fetcher.state !== "idle"}>
							<Save className="h-4 w-4" />
							Guardar resultados
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
