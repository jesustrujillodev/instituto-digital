import type { LucideIcon } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import type { CourseFormValues } from "../utils/build-course-form-defaults";

export interface ChoiceOption {
	value: string;
	label: string;
	description: string;
	icon?: LucideIcon;
	/** Una opción que no aplica: se enseña, con su motivo en la descripción. */
	disabled?: boolean;
}

/**
 * Centro de la tarjeta `index` en una fila de `count` columnas separadas por el
 * `gap-3` de la cuadrícula: es a donde apunta la flecha del detalle.
 */
const arrowLeftOf = (index: number, count: number) =>
	`calc(${(2 * index + 1) / (2 * count)} * 100% + ${(2 * index + 1 - count) / count} * 0.375rem)`;

interface CourseChoiceFieldProps {
	id: string;
	name: "format" | "modality" | "access" | "plan";
	legend: string;
	options: readonly ChoiceOption[];
	required?: boolean;
	disabled?: boolean;
	helperText?: string;
	/** Se llama después de guardar el valor, para los campos que arrastran otros. */
	onChanged?: (value: string) => void;
	/**
	 * Lo que la opción elegida pregunta después. Se pinta bajo las tarjetas con
	 * una flecha hacia la elegida, para leerse como continuación de esa
	 * respuesta y no como una pregunta nueva.
	 */
	detail?: React.ReactNode;
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
	detail,
}: CourseChoiceFieldProps) {
	const { control } = useFormContext<CourseFormValues>();
	const legendId = `${id}-legend`;

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => {
				const selectedIndex = options.findIndex(
					(option) => option.value === field.value,
				);

				return (
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
											selected
												? "border-primary bg-primary/5"
												: "border-border",
											disabled || option.disabled
												? "cursor-not-allowed"
												: "cursor-pointer hover:border-foreground/25",
											(disabled || option.disabled) &&
												!selected &&
												"opacity-50",
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
											<span className="flex items-center gap-2 font-medium text-sm">
												{option.icon && (
													<option.icon
														className="size-4 shrink-0 text-muted-foreground"
														aria-hidden="true"
													/>
												)}
												{option.label}
											</span>
											<span className="text-muted-foreground text-xs">
												{option.description}
											</span>
										</span>
									</label>
								);
							})}
						</RadioGroup>

						{detail && selectedIndex >= 0 && (
							<div className="relative mt-1 rounded-xl border border-border bg-card p-4 sm:p-5">
								{/* En una columna la flecha no tendría a qué tarjeta apuntar sin
							    cruzar las de abajo: el título del panel ya nombra la opción. */}
								<span
									aria-hidden="true"
									className="absolute -top-[7px] hidden size-3 -translate-x-1/2 rotate-45 rounded-tl-[3px] border-border border-t border-l bg-card sm:block"
									style={{ left: arrowLeftOf(selectedIndex, options.length) }}
								/>
								{detail}
							</div>
						)}

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
				);
			}}
		/>
	);
}
