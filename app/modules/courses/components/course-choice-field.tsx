import { Controller, useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import type { CourseFormValues } from "../utils/build-course-form-defaults";

export interface ChoiceOption {
	value: string;
	label: string;
	description: string;
	/** Una opción que no aplica: se enseña, con su motivo en la descripción. */
	disabled?: boolean;
}

interface CourseChoiceFieldProps {
	id: string;
	name: "format" | "modality" | "evaluationMethod" | "access" | "plan";
	legend: string;
	options: readonly ChoiceOption[];
	required?: boolean;
	disabled?: boolean;
	helperText?: string;
	/** Se llama después de guardar el valor, para los campos que arrastran otros. */
	onChanged?: (value: string) => void;
}

/**
 * Una elección excluyente entre pocas opciones, cada una con lo que implica.
 *
 * Tarjetas y no un select: son dos o tres opciones que cambian el resto del
 * paso, y la consecuencia tiene que leerse antes de elegir.
 */
export function CourseChoiceField({
	id,
	name,
	legend,
	options,
	required,
	disabled,
	helperText,
	onChanged,
}: CourseChoiceFieldProps) {
	const { control } = useFormContext<CourseFormValues>();
	const legendId = `${id}-legend`;

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<div className="flex flex-col gap-2">
					<span id={legendId} className="font-medium text-sm">
						{legend}
						{required && <span className="text-destructive">*</span>}
					</span>

					<RadioGroup
						id={id}
						aria-labelledby={legendId}
						aria-invalid={Boolean(fieldState.error)}
						value={field.value}
						disabled={disabled}
						onValueChange={(value) => {
							field.onChange(value);
							onChanged?.(value);
						}}
						className={cn(
							"grid gap-3",
							options.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3",
						)}
					>
						{options.map((option) => {
							const itemId = `${id}-${option.value}`;
							const selected = field.value === option.value;

							return (
								<label
									key={option.value}
									htmlFor={itemId}
									className={cn(
										"flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors duration-150",
										"has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30",
										selected ? "border-primary bg-primary/5" : "border-border",
										disabled || option.disabled
											? "cursor-not-allowed"
											: "cursor-pointer hover:border-foreground/25",
										(disabled || option.disabled) && !selected && "opacity-50",
									)}
								>
									<RadioGroupItem
										id={itemId}
										value={option.value}
										disabled={option.disabled}
										onBlur={field.onBlur}
										className="mt-0.5"
									/>
									<span className="flex min-w-0 flex-col gap-0.5">
										<span className="font-medium text-sm">{option.label}</span>
										<span className="text-muted-foreground text-xs">
											{option.description}
										</span>
									</span>
								</label>
							);
						})}
					</RadioGroup>

					{fieldState.error ? (
						<span role="alert" className="text-destructive text-sm">
							{fieldState.error.message}
						</span>
					) : (
						helperText && (
							<span className="text-muted-foreground text-sm">
								{helperText}
							</span>
						)
					)}
				</div>
			)}
		/>
	);
}
