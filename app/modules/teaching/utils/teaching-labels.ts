import { formatZonedDate } from "@/lib/date-utils";
import type { FinishBlocker } from "../domain/teaching.config";

export const finishBlockerMessage = (
	blocker: FinishBlocker,
	context: { opensAt: Date | null },
): string => {
	switch (blocker) {
		case "NOT_PUBLISHED":
			return "Solo se finaliza una capacitación publicada.";
		case "SELF_PACED":
			return "Una capacitación autogestiva no se finaliza: cada participante la completa al terminarla.";
		case "WITHOUT_SESSIONS":
			return "La capacitación no tiene sesiones.";
		case "TOO_EARLY":
			return context.opensAt
				? `Se podrá finalizar a partir del ${formatZonedDate(context.opensAt)}.`
				: "Todavía no se puede finalizar.";
		default: {
			const exhaustive: never = blocker;
			return exhaustive;
		}
	}
};

export const plural = (count: number, singular: string, many: string) =>
	`${count} ${count === 1 ? singular : many}`;
