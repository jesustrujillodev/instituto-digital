import type { LogData, Logger } from "./logger";

export interface ThrottledLog {
	warn(key: string, message: string, data?: LogData): void;
	error(key: string, message: string, data?: LogData): void;
}

/**
 * Escribe como máximo una entrada por clave en cada intervalo y cuenta las que
 * calla. Para fallos que se repiten en cada petición, como una caída de Redis.
 */
export const createThrottledLog = (
	logger: Logger,
	{ intervalMs, now = Date.now }: { intervalMs: number; now?: () => number },
): ThrottledLog => {
	const last = new Map<string, { at: number; suppressed: number }>();

	const emit =
		(level: "warn" | "error") =>
		(key: string, message: string, data?: LogData) => {
			const at = now();
			const previous = last.get(key);
			if (previous && at - previous.at < intervalMs) {
				previous.suppressed += 1;
				return;
			}
			logger[level](
				message,
				previous?.suppressed
					? { ...data, suppressed: previous.suppressed }
					: data,
			);
			last.set(key, { at, suppressed: 0 });
		};

	return { warn: emit("warn"), error: emit("error") };
};
