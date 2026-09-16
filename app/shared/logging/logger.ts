// Puerto agnóstico de logging con niveles y contexto encadenable.
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogData = Record<string, unknown>;

export interface Logger {
	debug(message: string, data?: LogData): void;
	info(message: string, data?: LogData): void;
	warn(message: string, data?: LogData): void;
	error(message: string, data?: LogData): void;
	/** Logger derivado que adjunta bindings a cada entrada. */
	child(bindings: LogData): Logger;
}
