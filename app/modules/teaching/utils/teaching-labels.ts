import { formatZonedDate } from "@/lib/date-utils";
import type { FinishBlocker } from "../domain/teaching.config";

export const finishBlockerMessage = (
	blocker: FinishBlocker,
	context: { opensAt: Date | null; pendingResults: number },
): string => {
	switch (blocker) {
		case "NOT_PUBLISHED":
			return "Solo se finaliza un curso publicado.";
		case "WITHOUT_SESSIONS":
			return "El curso no tiene sesiones.";
		case "TOO_EARLY":
			return context.opensAt
				? `Se podrá finalizar a partir del ${formatZonedDate(context.opensAt)}.`
				: "Todavía no se puede finalizar.";
		case "PENDING_RESULTS":
			return `Falta capturar el resultado de ${context.pendingResults} persona(s).`;
		default: {
			const exhaustive: never = blocker;
			return exhaustive;
		}
	}
};

export const plural = (count: number, singular: string, many: string) =>
	`${count} ${count === 1 ? singular : many}`;
