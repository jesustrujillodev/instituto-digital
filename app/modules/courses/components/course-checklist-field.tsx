import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";
import { TextInput } from "@/shared/components/common/text-input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import type { CourseFormValues } from "../utils/build-course-form-defaults";

export interface ChecklistOption {
	value: string;
	label: string;
	description?: string;
}

interface CourseChecklistFieldProps {
	id: string;
	name: "trainers" | "audienceDependencies" | "audienceGroups";
	legend: string;
	options: readonly ChecklistOption[];
	emptyText: string;
	searchPlaceholder?: string;
	/** Personas: las iniciales ayudan a encontrar a alguien de un vistazo. */
	withInitials?: boolean;
}

/** Con tan pocas opciones, el buscador estorba más de lo que ayuda. */
const SEARCH_THRESHOLD = 3;

const initialsOf = (label: string) =>
	label
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word.at(0))
		.join("")
		.toUpperCase();

const selectedLabel = (count: number) =>
	count === 1 ? "1 seleccionado" : `${count} seleccionados`;

/**
 * Selección múltiple sobre un catálogo corto, con filtro local.
 *
 * Una lista de casillas y no un combobox: se elige a mano de entre decenas, y
 * ver lo ya marcado sin abrir nada es lo que evita asignar dos veces.
 */
export function CourseChecklistField({
	id,
	name,
	legend,
	options,
	emptyText,
	searchPlaceholder = "Buscar",
	withInitials = false,
}: CourseChecklistFieldProps) {
	const { control } = useFormContext<CourseFormValues>();
	const prefix = useId();
	const [filter, setFilter] = useState("");

	const term = filter.trim().toLowerCase();
	const visible = useMemo(() => {
		if (term === "") return options;

		return options.filter((option) =>
			`${option.label} ${option.description ?? ""}`
				.toLowerCase()
				.includes(term),
		);
	}, [options, term]);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => {
				const selected = new Set(field.value);

				const toggle = (value: string, checked: boolean) => {
					const next = new Set(selected);
					if (checked) next.add(value);
					else next.delete(value);
					field.onChange([...next]);
				};

				return (
					<fieldset id={id} className="flex min-w-0 flex-col gap-3">
						<legend className="mb-3 flex w-full items-baseline justify-between gap-3">
							<span className="font-medium text-sm">{legend}</span>
							<span className="text-muted-foreground text-xs tabular-nums">
								{selectedLabel(selected.size)}
							</span>
						</legend>

						{options.length > SEARCH_THRESHOLD && (
							<TextInput
								type="search"
								name={`${name}-filter`}
								aria-label={`${searchPlaceholder} en ${legend.toLowerCase()}`}
								placeholder={searchPlaceholder}
								icon={<Search className="size-4" aria-hidden="true" />}
								value={filter}
								onChange={(event) => setFilter(event.target.value)}
							/>
						)}

						<div className="max-h-80 overflow-y-auto rounded-xl border border-border bg-card">
							{options.length === 0 ? (
								<p className="p-4 text-muted-foreground text-sm">{emptyText}</p>
							) : visible.length === 0 ? (
								<p className="p-4 text-muted-foreground text-sm">
									Nada coincide con «{filter.trim()}».
								</p>
							) : (
								<ul>
									{visible.map((option) => {
										const checkboxId = `${prefix}${option.value}`;
										const isSelected = selected.has(option.value);

										return (
											<li
												key={option.value}
												className="border-border border-b last:border-b-0"
											>
												<label
													htmlFor={checkboxId}
													className={cn(
														"flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-150",
														isSelected ? "bg-primary/5" : "hover:bg-muted/60",
													)}
												>
													<Checkbox
														id={checkboxId}
														checked={isSelected}
														onCheckedChange={(checked) =>
															toggle(option.value, checked === true)
														}
														onBlur={field.onBlur}
													/>
													{withInitials && (
														<span
															aria-hidden="true"
															className={cn(
																"flex size-9 shrink-0 items-center justify-center rounded-full font-medium text-xs transition-colors duration-150",
																isSelected
																	? "bg-primary/15 text-foreground"
																	: "bg-muted text-muted-foreground",
															)}
														>
															{initialsOf(option.label)}
														</span>
													)}
													<span className="flex min-w-0 flex-col gap-0.5">
														<span className="truncate font-medium text-sm">
															{option.label}
														</span>
														{option.description && (
															<span className="truncate text-muted-foreground text-xs">
																{option.description}
															</span>
														)}
													</span>
												</label>
											</li>
										);
									})}
								</ul>
							)}
						</div>

						{fieldState.error && (
							<span role="alert" className="text-destructive text-sm">
								{fieldState.error.message}
							</span>
						)}
					</fieldset>
				);
			}}
		/>
	);
}
