/**
 * Límites del gestor de nube, en un solo lugar.
 *
 * Todos existen por la misma razón: las operaciones sobre carpetas enteras
 * cargan la lista de objetos en memoria —del servidor para borrar, del navegador
 * para el ZIP—, y un bucket no tiene un tamaño acotado.
 */
export const CLOUD_LIMITS = {
	/** Entradas por página del listado, por bucket. */
	listPageSize: 100,
	/** Objetos máximos que abarca un borrado o un ZIP. */
	folderOperationMaxObjects: 2000,
	/**
	 * Bytes máximos de un ZIP. El navegador sin `showSaveFilePicker` (Firefox,
	 * Safari) arma el archivo en memoria antes de guardarlo.
	 */
	zipMaxBytes: 2 * 1024 * 1024 * 1024,
	/** Vida de la URL firmada de una descarga suelta. */
	downloadUrlTtlS: 300,
	/**
	 * Vida de las URLs de un ZIP. Más larga porque el navegador las consume de
	 * una en una: con 300 s, las últimas de una carpeta grande caducarían antes de
	 * pedirse.
	 */
	zipUrlTtlS: 900,
	/**
	 * Antigüedad mínima para considerar huérfano un objeto sin referencia.
	 *
	 * `withStorageTransaction` sube ANTES de escribir en la base: sin esta
	 * ventana, un escaneo durante un guardado marcaría como huérfanas las fotos
	 * que se están guardando, y borrarlas rompería ese guardado.
	 */
	orphanGraceMs: 15 * 60 * 1000,
	/** Objetos máximos que recorre un escaneo de huérfanos. */
	orphanScanMaxObjects: 5000,
	/** Keys y carpetas máximas por petición. */
	maxSelection: 500,
	/** Keys por consulta al buscar referencias (`IN (...)`). */
	referenceLookupChunk: 500,
} as const;

/** Tipos que se previsualizan con `<img>`. */
export const PREVIEWABLE_IMAGE_TYPES: readonly string[] = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/avif",
	"image/gif",
];
