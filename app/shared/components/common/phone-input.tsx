import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

interface PhoneInputProps
	extends Omit<
		React.ComponentProps<"input">,
		"type" | "maxLength" | "pattern"
	> {
	label?: string;
	error?: string;
	icon?: ReactNode;
	iconPosition?: "start" | "end";
}

export function PhoneInput({
	label,
	error,
	icon,
	iconPosition = "start",
	className,
	onChange,
	...props
}: PhoneInputProps) {
	const hasError = Boolean(error);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		// Se muta el valor del evento original en vez de clonarlo: al clonar el
		// target se pierden `name` y `ref`, y el onChange de react-hook-form
		// (register) no sabría a qué campo pertenece el cambio.
		e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
		onChange?.(e);
	};

	return (
		<div className="grid w-full items-center gap-1.5">
			{label && (
				<Label
					htmlFor={props.id ?? props.name}
					className={cn(
						"text-sm font-medium text-foreground",
						hasError && "text-destructive",
					)}
				>
					{label}
					{props.required && <span className="text-destructive">*</span>}
				</Label>
			)}
			<div className="relative">
				{icon && iconPosition === "start" && (
					<div
						className={cn(
							"absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none",
							hasError ? "text-destructive" : "text-muted-foreground",
						)}
					>
						{icon}
					</div>
				)}
				<Input
					type="tel"
					inputMode="numeric"
					pattern="[0-9]*"
					maxLength={10}
					placeholder="1234567890"
					className={cn(
						icon && iconPosition === "start" ? "pl-10" : "",
						icon && iconPosition === "end" ? "pr-10" : "",
						hasError &&
							"border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
						className,
					)}
					aria-invalid={hasError}
					aria-describedby={error ? `${props.name}-error` : undefined}
					onChange={handleChange}
					{...props}
				/>
				{icon && iconPosition === "end" && (
					<div
						className={cn(
							"absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none",
							hasError ? "text-destructive" : "text-muted-foreground",
						)}
					>
						{icon}
					</div>
				)}
			</div>
			{error && (
				<span
					id={`${props.name}-error`}
					className="text-sm text-destructive"
					role="alert"
				>
					{error}
				</span>
			)}
		</div>
	);
}
