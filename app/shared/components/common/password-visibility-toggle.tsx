import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
	visible: boolean;
	onToggle: () => void;
	/** `id` del campo que revela, para que el lector de pantalla los relacione. */
	controls?: string;
	disabled?: boolean;
	invalid?: boolean;
	className?: string;
}

/** Botón de ver/ocultar contraseña, alineado al extremo derecho del campo. */
export function PasswordVisibilityToggle({
	visible,
	onToggle,
	controls,
	disabled,
	invalid,
	className,
}: Props) {
	// El aviso se mantiene vacío hasta la primera pulsación: una región viva con
	// texto desde el montaje la anuncian algunos lectores al cargar la página.
	const [announce, setAnnounce] = useState(false);

	const label = visible ? "Ocultar contraseña" : "Mostrar contraseña";

	return (
		<>
			<button
				type="button"
				onClick={() => {
					setAnnounce(true);
					onToggle();
				}}
				disabled={disabled}
				aria-label={label}
				aria-controls={controls}
				title={label}
				className={cn(
					"absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-3xl outline-none transition-colors",
					"focus-visible:ring-3 focus-visible:ring-ring/30",
					"disabled:pointer-events-none disabled:opacity-50",
					invalid
						? "text-destructive hover:text-destructive/80"
						: "text-muted-foreground hover:text-foreground",
					className,
				)}
			>
				{visible ? (
					<EyeOff className="size-4" aria-hidden="true" />
				) : (
					<Eye className="size-4" aria-hidden="true" />
				)}
			</button>
			<span role="status" aria-live="polite" className="sr-only">
				{announce
					? visible
						? "Tu contraseña está visible."
						: "Tu contraseña está oculta."
					: ""}
			</span>
		</>
	);
}
