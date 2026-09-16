import { CalendarPlus } from "lucide-react";
import { useCallback } from "react";
import { useFieldArray, useWatch } from "react-hook-form";
import { INSTITUTE_TIME_ZONE } from "@/lib/date-utils";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { COURSE_MAX_SESSIONS } from "../domain/course.config";
import {
	type CourseFormValues,
	emptySessionValues,
} from "../utils/build-course-form-defaults";
import { CourseSessionRow } from "./course-session-row";

export function CourseSessionsManager({ id }: { id: string }) {
	const { fields, append, remove } = useFieldArray<
		CourseFormValues,
		"sessions"
	>({ name: "sessions" });
	const modality = useWatch<CourseFormValues, "modality">({ name: "modality" });

	const addSession = useCallback(() => append(emptySessionValues()), [append]);
	const canAdd = fields.length < COURSE_MAX_SESSIONS;

	return (
		<Card id={id}>
			<CardContent className="flex flex-col gap-4">
				<header className="flex items-start justify-between gap-4">
					<div>
						<h3 className="font-medium">Sesiones ({fields.length})</h3>
						<p className="text-muted-foreground text-sm">
							Horario de Tijuana ({INSTITUTE_TIME_ZONE}). Puedes guardar el
							borrador sin sesiones; para publicar hace falta al menos una.
						</p>
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={addSession}
						disabled={!canAdd}
					>
						<CalendarPlus className="h-4 w-4" />
						Agregar
					</Button>
				</header>

				{fields.length === 0 ? (
					<div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-6 text-center">
						<p className="text-muted-foreground text-sm">
							El curso todavía no tiene sesiones.
						</p>
						<Button type="button" variant="secondary" onClick={addSession}>
							Agregar la primera sesión
						</Button>
					</div>
				) : (
					fields.map((field, index) => (
						<CourseSessionRow
							key={field.id}
							index={index}
							modality={modality}
							onRemove={remove}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}
