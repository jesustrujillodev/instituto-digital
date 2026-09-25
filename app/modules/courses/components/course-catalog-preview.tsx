import { Clock, ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useWatch } from "react-hook-form";
import { CourseCover } from "@/modules/enrollments/components/course-cover";
import { requiresSessions } from "../domain/course.rules";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { formatHours } from "../utils/course-labels";
import type { CourseCoverControl } from "./course-identity-fields";

/** La portada nueva mientras se edita: el object URL se suelta al cambiarla. */
function useObjectUrl(file: File | null) {
	const [url, setUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!file) {
			setUrl(null);
			return;
		}
		const next = URL.createObjectURL(file);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [file]);

	return url;
}

const durationOf = (hours: string, scheduled: boolean) => {
	const value = Number(hours);
	if (hours.trim() !== "" && Number.isInteger(value) && value > 0) {
		return formatHours(value);
	}
	return scheduled ? "Duración según sus sesiones" : "Duración por definir";
};

/**
 * Lo que el paso General pone en el catálogo, mientras se escribe. Sin portada
 * propia, un curso guardado enseña la portada generada que verá el personal;
 * uno que aún no existe no tiene con qué generarla.
 */
export function CourseCatalogPreview({
	documentId,
	cover,
}: {
	/** `null` en el primer paso del alta: el borrador todavía no existe. */
	documentId: string | null;
	cover: CourseCoverControl;
}) {
	const [title, description, hours, format, modality] = useWatch<
		CourseFormValues,
		["title", "description", "hours", "format", "modality"]
	>({ name: ["title", "description", "hours", "format", "modality"] });
	const newCover = useObjectUrl(cover.value);
	const src = newCover ?? (cover.removed ? null : cover.existingUrl);
	const shownTitle = title.trim() || "Título del curso";

	return (
		<figure className="flex flex-col gap-2">
			<figcaption className="text-muted-foreground text-xs">
				Así se verá en el catálogo
			</figcaption>
			<div className="overflow-hidden rounded-xl border border-border bg-card">
				<div className="relative aspect-video bg-muted">
					{src || documentId ? (
						<CourseCover
							documentId={documentId ?? ""}
							title={shownTitle}
							modality={modality}
							src={src}
							eager
						/>
					) : (
						<span className="flex size-full items-center justify-center text-muted-foreground">
							<ImageIcon className="size-6" aria-hidden="true" />
						</span>
					)}
				</div>
				<div className="flex flex-col gap-1.5 p-4">
					<p className="line-clamp-2 font-bold text-base">{shownTitle}</p>
					<p className="line-clamp-2 text-muted-foreground text-sm">
						{description.trim() || "Aquí aparecerá la descripción."}
					</p>
					<p className="mt-1 flex items-center gap-1.5 text-muted-foreground text-xs">
						<Clock className="size-3.5" aria-hidden="true" />
						{durationOf(hours, requiresSessions(format))}
					</p>
				</div>
			</div>
		</figure>
	);
}
