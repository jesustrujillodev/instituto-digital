// Formato de presentación del gestor de nube — funciones puras.

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Bytes legibles en base 1024: `1536` → `1.5 KB`.
 *
 * Un decimal por encima de KB y ninguno en bytes: "312 B" es exacto y
 * "4.0 MB" añadiría ruido.
 */
export const formatBytes = (bytes: number): string => {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

	const exponent = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		UNITS.length - 1,
	);
	const value = bytes / 1024 ** exponent;

	return exponent === 0
		? `${bytes} B`
		: `${value.toFixed(value >= 100 ? 0 : 1)} ${UNITS[exponent]}`;
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
	dateStyle: "medium",
	timeStyle: "short",
});

/** Fecha y hora cortas; `—` si el proveedor no la informó. */
export const formatModified = (value: Date | string | null): string =>
	value ? dateFormatter.format(new Date(value)) : "—";

/** "1 archivo" / "3 archivos". */
export const pluralize = (count: number, singular: string, plural: string) =>
	`${count.toLocaleString("es-MX")} ${count === 1 ? singular : plural}`;
