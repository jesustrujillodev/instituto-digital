import { Controller, type FieldPath, useFormContext } from "react-hook-form";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { CourseFormValues } from "../utils/build-course-form-defaults";

interface CourseSelectFieldProps {
	id: string;
	name: FieldPath<CourseFormValues>;
	label: string;
	options: readonly { value: string; label: string }[];
	placeholder?: string;
	helperText?: string;
	required?: boolean;
	disabled?: boolean;
	/** Se llama después de guardar el valor, para los campos que arrastran otros. */
	onChanged?: (value: string) => void;
}

/**
 * Un `Select` de Radix atado al formulario.
 *
 * `Controller` y no `register`: el Select tiene API propia (`onValueChange`) y
 * no expone un input nativo que registrar.
 */
export function CourseSelectField({
	id,
	name,
	label,
	options,
	placeholder,
	helperText,
	required,
	disabled,
	onChanged,
}: CourseSelectFieldProps) {
	const { control } = useFormContext<CourseFormValues>();

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<div className="grid w-full gap-1.5">
					<Label htmlFor={id}>
						{label}
						{required && <span className="text-destructive">*</span>}
					</Label>
					<Select
						value={typeof field.value === "string" ? field.value : ""}
						disabled={disabled}
						onValueChange={(value) => {
							field.onChange(value);
							onChanged?.(value);
						}}
					>
						<SelectTrigger
							id={id}
							className="w-full"
							onBlur={field.onBlur}
							aria-invalid={Boolean(fieldState.error)}
						>
							<SelectValue placeholder={placeholder} />
						</SelectTrigger>
						<SelectContent>
							{options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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
