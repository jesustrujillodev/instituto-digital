import { useId, useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
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
}

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
}: CourseChecklistFieldProps) {
	const { control } = useFormContext<CourseFormValues>();
	const prefix = useId();
	const [filter, setFilter] = useState("");

	const visible = useMemo(() => {
		const term = filter.trim().toLowerCase();
		if (term === "") return options;

		return options.filter((option) =>
			`${option.label} ${option.description ?? ""}`
				.toLowerCase()
				.includes(term),
		);
	}, [options, filter]);

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
					<fieldset id={id} className="flex flex-col gap-2">
						<legend className="mb-1 text-sm font-medium">
							{legend}{" "}
							<span className="text-muted-foreground">({selected.size})</span>
						</legend>

						{options.length > 6 && (
							<TextInput
								name={`${name}-filter`}
								placeholder="Filtrar"
								value={filter}
								onChange={(event) => setFilter(event.target.value)}
							/>
						)}

						<div className="max-h-60 overflow-y-auto rounded-md border border-border">
							{visible.length === 0 ? (
								<p className="text-muted-foreground p-3 text-sm">{emptyText}</p>
							) : (
								visible.map((option) => {
									const checkboxId = `${prefix}${option.value}`;

									return (
										<div
											key={option.value}
											className="flex items-start gap-3 border-b border-border p-3 last:border-b-0"
										>
											<Checkbox
												id={checkboxId}
												checked={selected.has(option.value)}
												onCheckedChange={(checked) =>
													toggle(option.value, checked === true)
												}
												onBlur={field.onBlur}
											/>
											<Label
												htmlFor={checkboxId}
												className="flex flex-col items-start gap-0.5 font-normal"
											>
												<span>{option.label}</span>
												{option.description && (
													<span className="text-muted-foreground text-xs">
														{option.description}
													</span>
												)}
											</Label>
										</div>
									);
								})
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
