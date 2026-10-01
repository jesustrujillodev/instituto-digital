import { cn } from "cn";
import { Loader2 } from "lucide-react";

/**
 * Indicador de trabajo en curso dentro de un control. Decorativo: quien lo
 * contiene nombra lo que pasa («Guardando…») y declara `aria-busy`.
 *
 * Con movimiento reducido no gira: late, como los esqueletos.
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
	return (
		<Loader2
			data-slot="spinner"
			aria-hidden="true"
			className={cn(
				"size-4 animate-spin motion-reduce:animate-pulse",
				className,
			)}
			{...props}
		/>
	);
}

export { Spinner };
