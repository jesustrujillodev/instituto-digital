import { TIME_INPUT_PATTERN } from "@/lib/date-utils";

const minutesOf = (time: string): number => {
	const [hours, minutes] = time.split(":").map(Number);
	return hours * 60 + minutes;
};

/**
 * Minutos entre dos horas de pared del mismo día, o `null` si falta alguna o
 * el fin no queda después del inicio. Las sesiones no cruzan la medianoche.
 */
export const sessionMinutes = (
	startTime: string,
	endTime: string,
): number | null => {
	if (
		!TIME_INPUT_PATTERN.test(startTime) ||
		!TIME_INPUT_PATTERN.test(endTime)
	) {
		return null;
	}

	const minutes = minutesOf(endTime) - minutesOf(startTime);
	return minutes > 0 ? minutes : null;
};

/** "45 min", "2 h", "1 h 30 min". */
export const formatDuration = (minutes: number): string => {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;

	if (hours === 0) return `${rest} min`;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};
