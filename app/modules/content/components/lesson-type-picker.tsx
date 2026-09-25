import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";
import { LESSON_TYPES, type LessonType } from "../domain/content.rules";
import { LESSON_TYPE_LABELS } from "../utils/content-labels";
import { LessonTypeIcon } from "./lesson-type-icon";

const VARIANTS = {
	/** En la barra del editor de dos paneles, junto a minutos y obligatoria. */
	inline: {
		root: "flex flex-wrap gap-0.5 rounded-xl border border-border bg-muted/40 p-1",
		item: "h-8 gap-1.5 rounded-lg px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm",
	},
	/** A todo lo ancho del panel lateral: cada tipo es un botón grande. */
	grid: {
		root: "grid grid-cols-3 gap-1.5 sm:grid-cols-5",
		item: "h-auto flex-col gap-1 rounded-lg border border-border bg-card px-1.5 py-2.5 data-[state=on]:border-primary data-[state=on]:bg-primary/5",
	},
} as const;

export function LessonTypePicker({
	value,
	onChange,
	disabled,
	variant = "inline",
	labelledBy,
}: {
	value: LessonType;
	onChange: (type: LessonType) => void;
	disabled?: boolean;
	variant?: keyof typeof VARIANTS;
	/** El id de la etiqueta visible; sin ella se nombra por `aria-label`. */
	labelledBy?: string;
}) {
	const styles = VARIANTS[variant];

	return (
		<ToggleGroup.Root
			type="single"
			aria-label={labelledBy ? undefined : "Tipo de material"}
			aria-labelledby={labelledBy}
			value={value}
			disabled={disabled}
			onValueChange={(next) => {
				// Radix deja deseleccionar el activo; un tipo siempre tiene que haber.
				if (next) onChange(next as LessonType);
			}}
			className={styles.root}
		>
			{LESSON_TYPES.map((type) => (
				<ToggleGroup.Item
					key={type}
					value={type}
					className={cn(
						"flex items-center justify-center font-medium text-muted-foreground text-xs transition-colors duration-150",
						"hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50",
						"data-[state=on]:text-foreground",
						styles.item,
					)}
				>
					<LessonTypeIcon
						type={type}
						className={variant === "grid" ? "size-4" : "size-3.5"}
					/>
					{LESSON_TYPE_LABELS[type]}
				</ToggleGroup.Item>
			))}
		</ToggleGroup.Root>
	);
}
