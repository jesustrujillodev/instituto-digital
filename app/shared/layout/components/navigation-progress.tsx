import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { useNavigation } from "react-router";
import {
	PENDING_MIN_VISIBLE_MS,
	PENDING_SHOW_DELAY_MS,
} from "@/shared/hooks/use-delayed-flag";

/** Lo que tarda en completarse y desvanecerse al terminar. */
const FINISH_MS = 320;

type Phase = "hidden" | "running" | "finishing";

/**
 * Barra fina sobre el área de trabajo mientras se carga otra página.
 *
 * No hay avance real que medir: corre deprisa al principio y se frena antes del
 * final, y al llegar la página se completa y se desvanece. Con movimiento
 * reducido el recorrido desaparece (lo quita la regla global de `app.css`) y la
 * barra late a todo lo ancho.
 */
export function NavigationProgress() {
	const navigation = useNavigation();
	const active = navigation.state !== "idle";
	const [phase, setPhase] = useState<Phase>("hidden");
	const [advancing, setAdvancing] = useState(false);
	const shownAt = useRef(0);

	useEffect(() => {
		if (active) {
			if (phase === "running") return;
			// Una navegación nueva mientras la anterior se desvanece la retoma sin
			// esperar: la barra ya está a la vista.
			const timer = setTimeout(
				() => {
					shownAt.current = performance.now();
					setAdvancing(false);
					setPhase("running");
				},
				phase === "hidden" ? PENDING_SHOW_DELAY_MS : 0,
			);
			return () => clearTimeout(timer);
		}

		if (phase === "running") {
			const elapsed = performance.now() - shownAt.current;
			const timer = setTimeout(
				() => setPhase("finishing"),
				Math.max(0, PENDING_MIN_VISIBLE_MS - elapsed),
			);
			return () => clearTimeout(timer);
		}

		if (phase === "finishing") {
			const timer = setTimeout(() => setPhase("hidden"), FINISH_MS);
			return () => clearTimeout(timer);
		}
	}, [active, phase]);

	// La barra nace vacía y en el cuadro siguiente empieza a avanzar: sin ese
	// cuadro de por medio no hay transición que animar.
	useEffect(() => {
		if (phase !== "running" || advancing) return;
		const frame = requestAnimationFrame(() => setAdvancing(true));
		return () => cancelAnimationFrame(frame);
	}, [phase, advancing]);

	if (phase === "hidden") return null;

	const finishing = phase === "finishing";

	return (
		<div
			role="progressbar"
			aria-label="Cargando la página"
			className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden"
		>
			<div
				className={cn(
					"h-full origin-left bg-primary",
					finishing
						? "transition-[transform,opacity] duration-200 ease-out [transition-delay:0ms,120ms]"
						: "transition-transform duration-[8000ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-pulse",
				)}
				style={{
					transform: `scaleX(${finishing ? 1 : advancing ? 0.9 : 0})`,
					opacity: finishing ? 0 : 1,
				}}
			/>
		</div>
	);
}
