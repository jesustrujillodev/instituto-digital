import type { ComponentProps } from "react";
import { forwardRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

interface NumberInputProps
	extends Omit<ComponentProps<"input">, "type" | "value" | "onChange"> {
	label?: string;
	error?: string;
	icon?: React.ReactNode;
	value?: number | string;
	onChange?: (value: number | undefined) => void;
	allowDecimals?: boolean;
	allowNegative?: boolean;
	min?: number;
	max?: number;
	placeholder?: string;
}

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
	(
		{
			className,
			label,
			error,
			icon,
			value,
			onChange,
			allowDecimals = true,
			allowNegative = true,
			min,
			max,
			placeholder,
			...props
		},
		ref,
	) => {
		const [displayValue, setDisplayValue] = useState<string>(
			value !== undefined && value !== null ? String(value) : "",
		);

		// Sincronizar el valor interno cuando cambia el prop value
		useEffect(() => {
			if (value !== undefined && value !== null) {
				setDisplayValue(String(value));
			} else {
				setDisplayValue("");
			}
		}, [value]);

		const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
			const inputValue = e.target.value;

			// Permitir string vacío
			if (inputValue === "") {
				setDisplayValue("");
				onChange?.(undefined);
				return;
			}

			// Regex para validar números - updated to respect allowNegative
			const numberRegex = allowDecimals
				? allowNegative
					? /^-?\d*\.?\d*$/ // Permite decimales y negativos
					: /^\d*\.?\d*$/ // Permite decimales, no negativos
				: allowNegative
					? /^-?\d*$/ // Solo enteros, permite negativos
					: /^\d*$/; // Solo enteros positivos

			// Validar formato
			if (!numberRegex.test(inputValue)) {
				return; // No actualizar si el formato es inválido
			}

			// Evitar múltiples puntos decimales
			if (allowDecimals && (inputValue.match(/\./g) || []).length > 1) {
				return;
			}

			// Evitar que empiece con múltiples ceros (excepto 0.x)
			// Pero permitir reemplazar un 0 inicial cuando se escribe un nuevo número
			if (
				inputValue.match(/^0\d/) &&
				!inputValue.startsWith("0.") &&
				displayValue !== "0"
			) {
				return;
			}

			// Si el valor actual es "0" y se está escribiendo un dígito, reemplazar el 0
			if (
				displayValue === "0" &&
				inputValue.match(/^0\d/) &&
				!inputValue.startsWith(".")
			) {
				const newValue = inputValue.substring(1); // Remover el 0 inicial
				setDisplayValue(newValue);
				const numericValue = parseFloat(newValue);
				if (!Number.isNaN(numericValue)) {
					onChange?.(numericValue);
				}
				return;
			}

			setDisplayValue(inputValue);

			// Convertir a número para validaciones y callback
			const numericValue = parseFloat(inputValue);

			// Validar si es un número válido
			if (Number.isNaN(numericValue)) {
				// Si termina en punto decimal, no llamar onChange aún
				if (allowDecimals && inputValue.endsWith(".")) {
					return;
				}
				onChange?.(undefined);
				return;
			}

			// Validar si es negativo cuando no se permite
			if (!allowNegative && numericValue < 0) {
				return;
			}

			// Validar rango
			if (min !== undefined && numericValue < min) {
				return;
			}
			if (max !== undefined && numericValue > max) {
				return;
			}

			onChange?.(numericValue);
		};

		const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
			// Limpiar formato al perder el foco
			if (displayValue && !Number.isNaN(parseFloat(displayValue))) {
				const numericValue = parseFloat(displayValue);
				setDisplayValue(String(numericValue));
			}
			props.onBlur?.(e);
		};

		const hasError = Boolean(error);

		return (
			<div className="space-y-2">
				{label && (
					<Label
						htmlFor={props.id}
						className={cn(
							"text-sm font-medium text-foreground",
							hasError && "text-destructive",
						)}
					>
						{label}
					</Label>
				)}
				<div className="relative">
					{icon && (
						<div
							className={cn(
								"absolute left-3 top-1/2 transform -translate-y-1/2",
								hasError ? "text-destructive" : "text-muted-foreground",
							)}
						>
							{icon}
						</div>
					)}
					<Input
						{...props}
						ref={ref}
						type="text"
						inputMode="numeric"
						value={displayValue}
						onChange={handleInputChange}
						onBlur={handleBlur}
						placeholder={placeholder}
						aria-invalid={hasError}
						aria-describedby={error ? `${props.id}-error` : undefined}
						className={cn(
							icon && "pl-10",
							hasError &&
								"border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
							className,
						)}
					/>
				</div>
				{error && (
					<p
						id={`${props.id}-error`}
						className="text-sm text-destructive"
						role="alert"
					>
						{error}
					</p>
				)}
			</div>
		);
	},
);

NumberInput.displayName = "NumberInput";

export type { NumberInputProps };
export { NumberInput };
