import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { formatSessionRange } from "@/lib/date-utils";
import { personNameOf } from "@/modules/enrollments/utils/enrollment-labels";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { TeachingDetail } from "../domain/teaching.types";
import {
	INTENT_FIELD,
	PAYLOAD_FIELD,
	TEACHING_INTENTS,
	type TeachingActionData,
} from "../utils/parse-teaching-form-data";

/** Sesión abierta más reciente: es la que casi siempre toca pasar. */
const defaultSession = (sessions: TeachingDetail["sessions"]) =>
	sessions.filter((session) => session.isOpen).at(-1)?.documentId ??
	sessions.at(0)?.documentId ??
	"";

/**
 * La asistencia por sesión. Con `manual`, una lista con casillas que se guarda;
 * sin él, solo lo que registró el QR.
 */
export function AttendancePanel({
	detail,
	manual,
}: {
	detail: Pick<TeachingDetail, "sessions" | "participants" | "can">;
	manual: boolean;
}) {
	const { sessions, participants, can } = detail;
	const fetcher = useFetcher<TeachingActionData>();
	useFetcherToast(fetcher);

	const [sessionId, setSessionId] = useState(() => defaultSession(sessions));
	const session = sessions.find((row) => row.documentId === sessionId);

	const marksOf = (documentId: string) =>
		Object.fromEntries(
			participants.map((participant) => [
				participant.userDocumentId,
				participant.marks[documentId] ?? false,
			]),
		);

	const [marks, setMarks] = useState<Record<string, boolean>>(() =>
		marksOf(sessionId),
	);

	// Al cambiar de sesión o al recargar tras guardar, la lista vuelve a lo guardado.
	// biome-ignore lint/correctness/useExhaustiveDependencies: marksOf se deriva de participants.
	useEffect(() => {
		setMarks(marksOf(sessionId));
	}, [sessionId, participants]);

	if (sessions.length === 0 || participants.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				{sessions.length === 0
					? "El curso no tiene sesiones."
					: "Nadie está inscrito en este curso."}
			</p>
		);
	}

	const editable = manual && can.recordAttendance && Boolean(session?.isOpen);
	const checkedIn = participants.filter(
		(participant) => participant.marks[sessionId] === true,
	).length;

	const save = () =>
		fetcher.submit(
			{
				[INTENT_FIELD]: TEACHING_INTENTS.attendance,
				[PAYLOAD_FIELD]: JSON.stringify({
					sessionDocumentId: sessionId,
					marks: Object.entries(marks).map(([userDocumentId, attended]) => ({
						userDocumentId,
						attended,
					})),
				}),
			},
			{ method: "post" },
		);

	return (
		<Card>
			<CardContent className="flex flex-col gap-4">
				{!manual && (
					<div className="flex flex-col gap-1">
						<h3 className="font-medium text-sm">Registro por sesión</h3>
						<p className="text-muted-foreground text-xs">
							Se llena solo: cada persona queda registrada al escanear el código
							QR del curso.
						</p>
					</div>
				)}

				<div className="flex flex-wrap items-center justify-between gap-3">
					<Select value={sessionId} onValueChange={setSessionId}>
						<SelectTrigger className="w-full sm:w-80">
							<SelectValue placeholder="Sesión" />
						</SelectTrigger>
						<SelectContent>
							{sessions.map((row, index) => (
								<SelectItem key={row.documentId} value={row.documentId}>
									Sesión {index + 1} ·{" "}
									{formatSessionRange(
										new Date(row.startsAt),
										new Date(row.endsAt),
									)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{session && (
						<Badge variant="outline">
							{manual
								? `Lista pasada a ${session.recorded} de ${participants.length}`
								: `Asistieron ${checkedIn} de ${participants.length}`}
						</Badge>
					)}
				</div>

				{session && !session.isOpen && (
					<p className="text-muted-foreground text-sm">
						{manual
							? "La lista de esta sesión se abre el día de la sesión."
							: "Esta sesión todavía no llega: aquí aparecerá quién escanee el código."}
					</p>
				)}

				<ul className="flex flex-col divide-y divide-border">
					{participants.map((participant) => {
						const summary = (
							<>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm">
										{personNameOf(participant)}
									</span>
									<span className="block truncate text-muted-foreground text-xs">
										{participant.email}
									</span>
								</span>
								<span className="text-muted-foreground text-xs">
									{participant.attendedSessions}/{sessions.length} ·{" "}
									{participant.attendancePercent} %
								</span>
							</>
						);

						return (
							<li key={participant.userDocumentId} className="py-2">
								{manual ? (
									<Label className="flex cursor-pointer items-center gap-3">
										<Checkbox
											checked={marks[participant.userDocumentId] ?? false}
											disabled={!editable}
											onCheckedChange={(checked) =>
												setMarks((previous) => ({
													...previous,
													[participant.userDocumentId]: checked === true,
												}))
											}
										/>
										{summary}
									</Label>
								) : (
									<div className="flex items-center gap-3">
										{summary}
										<Badge
											variant={
												participant.marks[sessionId] === true
													? "default"
													: "outline"
											}
										>
											{participant.marks[sessionId] === true
												? "Asistió"
												: "Sin registro"}
										</Badge>
									</div>
								)}
							</li>
						);
					})}
				</ul>

				{editable && (
					<div className="flex justify-end">
						<Button onClick={save} disabled={fetcher.state !== "idle"}>
							<Save className="h-4 w-4" />
							Guardar lista
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
