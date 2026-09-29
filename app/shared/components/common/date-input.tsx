import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	DISPLAY_DATE_FORMAT,
	displayDateToInput,
	inputDateToDisplay,
	maskDisplayDate,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/shared/components/ui/input-group";

/**
 * Lo que recibe el formulario: la fecha de transporte si lo escrito es un día
 * real, vacío si no hay nada, y el texto tal cual si está a medias. Así la
 * validación del formulario sigue siendo la que decide y nombra el problema.
 */
const formValueOf = (text: string): string =>
	text === "" ? "" : (displayDateToInput(text) ?? text);

interface DateInputProps
	extends Omit<
		React.ComponentProps<"input">,
		"value" | "defaultValue" | "onChange" | "type"
	> {
	/** `YYYY-MM-DD`, o lo que la persona dejó a medias. */
	value: string;
	onChange: (value: string) => void;
}

/**
 * Una fecha, siempre en `dd-mm-aaaa`.
 *
 * `<input type="date">` pinta el formato del navegador —`mm/dd/yyyy` en uno en
 * inglés— y la plataforma no puede cambiarlo. Aquí se escribe en texto con el
 * formato del sistema, y el calendario del navegador queda detrás de un botón:
 * ayuda a elegir, pero no decide cómo se lee.
 */
export function DateInput({
	value,
	onChange,
	onBlur,
	disabled,
	className,
	"aria-label": ariaLabel,
	...props
}: DateInputProps) {
	const [text, setText] = useState(() => inputDateToDisplay(value));
	const picker = useRef<HTMLInputElement>(null);
	const emitted = useRef(value);

	// Un valor puesto desde fuera —otra sesión copiada, un reinicio del
	// formulario— se adopta; el que acaba de emitir este mismo campo, no.
	useEffect(() => {
		if (value === emitted.current) return;
		emitted.current = value;
		setText(inputDateToDisplay(value));
	}, [value]);

	const commit = (next: string) => {
		setText(next);
		const emittedValue = formValueOf(next);
		emitted.current = emittedValue;
		onChange(emittedValue);
	};

	const openPicker = () => {
		try {
			picker.current?.showPicker();
		} catch {
			picker.current?.focus();
		}
	};

	return (
		<InputGroup className={cn(disabled && "opacity-50", className)}>
			<InputGroupInput
				{...props}
				type="text"
				inputMode="numeric"
				autoComplete="off"
				placeholder={DISPLAY_DATE_FORMAT}
				maxLength={10}
				value={text}
				disabled={disabled}
				aria-label={ariaLabel}
				onChange={(event) => commit(maskDisplayDate(event.target.value))}
				onBlur={onBlur}
				className="tabular-nums"
			/>
			<InputGroupAddon align="inline-end">
				<InputGroupButton
					size="icon-xs"
					disabled={disabled}
					aria-label={
						ariaLabel
							? `Elegir ${ariaLabel.toLowerCase()} en el calendario`
							: "Elegir en el calendario"
					}
					onClick={openPicker}
				>
					<CalendarDays aria-hidden="true" />
				</InputGroupButton>
			</InputGroupAddon>
			{/* Solo abre el calendario del navegador; lo que se ve es el campo de texto. */}
			<input
				ref={picker}
				type="date"
				tabIndex={-1}
				aria-hidden="true"
				className="pointer-events-none absolute right-0 bottom-0 size-0 opacity-0"
				value={displayDateToInput(text) ?? ""}
				onChange={(event) => commit(inputDateToDisplay(event.target.value))}
			/>
		</InputGroup>
	);
}
