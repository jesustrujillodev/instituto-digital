import { type ReactNode, useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

/** Una fila de propiedad: etiqueta corta a la izquierda o arriba. */
export function PropertyRow({
	label,
	htmlFor,
	children,
	className,
}: {
	label: string;
	htmlFor?: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-1", className)}>
			<Label htmlFor={htmlFor} className="text-muted-foreground text-xs">
				{label}
			</Label>
			{children}
		</div>
	);
}

export function PropertySection({
	title,
	children,
	action,
}: {
	title: string;
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0">
			<div className="flex items-center justify-between gap-2">
				<h3 className="font-medium text-xs uppercase tracking-wide">{title}</h3>
				{action}
			</div>
			{children}
		</section>
	);
}

interface NumberFieldProps {
	label: string;
	value: number;
	onChange: (value: number) => void;
	onCommitEnd?: () => void;
	min?: number;
	max?: number;
	step?: number;
	suffix?: string;
	disabled?: boolean;
}

/**
 * Un número que se aplica mientras se escribe, si es válido. Al salir del
 * campo vuelve a mostrar el valor real (por ejemplo, tras ajustarse al mínimo).
 */
export function NumberField({
	label,
	value,
	onChange,
	onCommitEnd,
	min,
	max,
	step = 1,
	suffix,
	disabled,
}: NumberFieldProps) {
	const id = useId();
	const [text, setText] = useState(String(value));
	const [focused, setFocused] = useState(false);
	useEffect(() => {
		if (!focused) setText(String(value));
	}, [value, focused]);

	return (
		<PropertyRow label={label} htmlFor={id}>
			<div className="relative">
				<Input
					id={id}
					type="number"
					inputMode="decimal"
					value={text}
					min={min}
					max={max}
					step={step}
					disabled={disabled}
					className={cn("h-8 text-xs tabular-nums", suffix && "pr-7")}
					onFocus={() => setFocused(true)}
					onBlur={() => {
						setFocused(false);
						setText(String(value));
						onCommitEnd?.();
					}}
					onChange={(event) => {
						setText(event.target.value);
						const next = Number(event.target.value);
						if (event.target.value === "" || !Number.isFinite(next)) return;
						const clamped = Math.min(max ?? next, Math.max(min ?? next, next));
						onChange(Math.round(clamped * 100) / 100);
					}}
				/>
				{suffix && (
					<span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground text-xs">
						{suffix}
					</span>
				)}
			</div>
		</PropertyRow>
	);
}

/** Botones de una sola elección, compactos (alineación, ajuste…). */
export function SegmentedControl<T extends string>({
	label,
	value,
	options,
	onChange,
	disabled,
}: {
	label: string;
	value: T;
	options: readonly { value: T; label: string; icon?: ReactNode }[];
	onChange: (value: T) => void;
	disabled?: boolean;
}) {
	return (
		<PropertyRow label={label}>
			<fieldset aria-label={label} className="m-0 flex rounded-md border p-0.5">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						aria-pressed={value === option.value}
						title={option.label}
						disabled={disabled}
						className={cn(
							"flex h-7 flex-1 items-center justify-center gap-1 rounded-sm text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
							value === option.value
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-muted",
						)}
						onClick={() => onChange(option.value)}
					>
						{option.icon ?? option.label}
						{option.icon && <span className="sr-only">{option.label}</span>}
					</button>
				))}
			</fieldset>
		</PropertyRow>
	);
}
