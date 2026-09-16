import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";

interface Props extends React.ComponentProps<"textarea"> {
	label?: string;
	error?: string;
	icon?: ReactNode;
	iconPosition?: "start" | "end";
	helperText?: string;
}

export function TextareaInput({
	label,
	error,
	icon,
	iconPosition = "start",
	helperText,
	className,
	...props
}: Props) {
	const hasError = Boolean(error);

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
							"absolute top-3 left-0 flex items-start pl-3 pointer-events-none",
							hasError ? "text-destructive" : "text-muted-foreground",
						)}
					>
						{icon}
					</div>
				)}
				<Textarea
					className={cn(
						icon && iconPosition === "start" ? "pl-10" : "",
						icon && iconPosition === "end" ? "pr-10" : "",
						hasError &&
							"border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
						className,
					)}
					aria-invalid={hasError}
					aria-describedby={
						error
							? `${props.name}-error`
							: helperText
								? `${props.name}-helper`
								: undefined
					}
					{...props}
				/>
				{icon && iconPosition === "end" && (
					<div
						className={cn(
							"absolute top-3 right-0 flex items-start pr-3 pointer-events-none",
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
					className="text-sm text-destructive flex items-center gap-1"
					role="alert"
				>
					<svg
						aria-hidden="true"
						role="img"
						className="w-4 h-4 shrink-0"
						fill="currentColor"
						viewBox="0 0 20 20"
					>
						<path
							fillRule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
							clipRule="evenodd"
						/>
					</svg>
					{error}
				</span>
			)}
			{!error && helperText && (
				<span
					id={`${props.name}-helper`}
					className="text-sm text-muted-foreground"
				>
					{helperText}
				</span>
			)}
		</div>
	);
}
