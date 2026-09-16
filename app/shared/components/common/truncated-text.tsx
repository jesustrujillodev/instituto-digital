import { InfoIcon } from "lucide-react";
import { smartTruncate } from "@/lib/string-utils";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";

interface TruncatedTextProps {
	text: string | null | undefined;
	maxLength?: number;
	/**
	 * Si es true, muestra un tooltip con el texto completo al hacer hover
	 * @default true
	 */
	showTooltip?: boolean;
	/**
	 * Clase CSS personalizada
	 */
	className?: string;
	/**
	 * Si es true, usa truncamiento inteligente (respeta palabras completas)
	 * @default true
	 */
	smartTruncate?: boolean;
	/**
	 * Si es true, muestra un ícono indicador junto al texto
	 * @default true
	 */
	showIcon?: boolean;
}

export function TruncatedText({
	text,
	maxLength = 50,
	showTooltip = true,
	className = "",
	smartTruncate: useSmart = true,
	showIcon = true,
}: TruncatedTextProps) {
	if (!text) return <span className={className}>—</span>;

	const isTruncated = text.length > maxLength;
	const displayText = useSmart
		? smartTruncate(text, maxLength)
		: text.slice(0, maxLength) + (isTruncated ? "..." : "");

	if (!isTruncated || !showTooltip) {
		return <span className={className}>{displayText}</span>;
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						className={`inline-flex items-center gap-1 cursor-help ${className}`}
					>
						<span>{displayText}</span>
						{showIcon && (
							<InfoIcon className="h-4 w-4 text-muted-foreground shrink-0" />
						)}
					</span>
				</TooltipTrigger>
				<TooltipContent className="max-w-sm">
					<p className="whitespace-pre-wrap wrap-break-words">{text}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
