import type { LogData, Logger, LogLevel } from "./logger";

const LEVEL_ORDER: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

// Claves cuyo valor NUNCA debe llegar a un log — se redactan siempre.
const SENSITIVE_KEY = /token|cookie|password|secret|authorization/i;

const redact = (data: LogData): LogData => {
	const out: LogData = {};
	for (const [key, value] of Object.entries(data)) {
		if (SENSITIVE_KEY.test(key)) {
			out[key] = "[REDACTED]";
		} else if (value && typeof value === "object" && !Array.isArray(value)) {
			out[key] = redact(value as LogData);
		} else {
			out[key] = value;
		}
	}
	return out;
};

// Adaptador de consola con redacción de sensibles. En producción, sustituir
// por un adaptador estructurado (pino/otel) implementando el mismo puerto.
export const createConsoleLogger = (options: {
	level: LogLevel;
	bindings?: LogData;
}): Logger => {
	const { level, bindings = {} } = options;
	const threshold = LEVEL_ORDER[level];

	const log = (entryLevel: LogLevel, message: string, data?: LogData) => {
		if (LEVEL_ORDER[entryLevel] < threshold) return;
		const merged = { ...bindings, ...(data ?? {}) };
		const suffix = Object.keys(merged).length
			? ` ${JSON.stringify(redact(merged))}`
			: "";
		// eslint-disable-next-line no-console
		console[entryLevel === "debug" ? "log" : entryLevel](
			`[${entryLevel}] ${message}${suffix}`,
		);
	};

	return {
		debug: (message, data) => log("debug", message, data),
		info: (message, data) => log("info", message, data),
		warn: (message, data) => log("warn", message, data),
		error: (message, data) => log("error", message, data),
		child: (childBindings) =>
			createConsoleLogger({
				level,
				bindings: { ...bindings, ...childBindings },
			}),
	};
};
