import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { resolveEmbed } from "../domain/content.rules";
import { LessonEmbedView } from "./lesson-material-view";

/** El enlace externo y su vista previa, si el proveedor se reconoce. */
export function LessonLinkField({
	id,
	value,
	onChange,
	disabled,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}) {
	const embed = value.trim() === "" ? null : resolveEmbed(value.trim());

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-2">
				<Label htmlFor={id}>Dirección del recurso</Label>
				<Input
					id={id}
					type="url"
					inputMode="url"
					placeholder="https://"
					value={value}
					disabled={disabled}
					onChange={(event) => onChange(event.target.value)}
				/>
				<p className="text-muted-foreground text-xs">
					YouTube, Vimeo y Drive se ven dentro de la lección. Cualquier otra
					dirección se enseña como enlace.
				</p>
			</div>

			{embed ? (
				<LessonEmbedView embed={embed} title="Vista previa del recurso" />
			) : null}
		</div>
	);
}
