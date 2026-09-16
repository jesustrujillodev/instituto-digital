import { cn } from "cn";

/**
 * Logotipo completo del XXV Ayuntamiento. La pieza es blanca: solo se coloca
 * sobre la superficie guinda (`bg-sidebar`), que es guinda en los dos modos.
 */
export function InstitutionalLogo({ className }: { className?: string }) {
	return (
		<img
			src="/assets/aytoBco.png"
			alt="XXV Ayuntamiento de Tijuana"
			width={245}
			height={80}
			className={cn(
				"h-16 w-auto max-w-full self-start object-contain",
				className,
			)}
		/>
	);
}
