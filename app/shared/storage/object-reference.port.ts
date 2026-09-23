// Puerto: ¿quién usa este objeto de storage?
//
// Storage no tiene tablas propias: son los módulos los que guardan la key (o la
// referencia del proxy) en SUS modelos. Por eso la respuesta a "¿a quién
// pertenece este archivo?" y "¿qué hay que soltar en la base si se borra?" solo
// la puede dar cada módulo. Cada uno publica una fuente con esta forma y el
// composition root las junta; quien gestiona la nube depende solo del puerto y
// no conoce los módulos que guardan archivos.
//
// Vive en shared/storage —y no en el módulo que lo consume— para que los
// módulos que lo implementan no dependan de ese consumidor.

// Union cerrada: añadir un módulo que guarde keys = añadir su literal aquí y
// registrar su fuente en el composition root.
export type ObjectOwnerType = "user" | "course" | "lesson" | "certificate";

/** Uso de un objeto por una fila de la base. */
export interface ObjectReference {
	key: string;
	owner: ObjectOwnerType;
	/** Nombre legible del DUEÑO: "Ana Ruiz". */
	label: string;
	/** Papel del archivo para ese dueño: "Foto de perfil". */
	detail?: string;
	/**
	 * Pantalla del panel donde se gestiona ese dueño. Identifica al dueño: dos
	 * referencias con el mismo `href` son del mismo dueño.
	 */
	href?: string;
}

/** Nombre legible de una carpeta que la fuente reconoce como suya. */
export interface FolderDescription {
	/** Prefijo completo acabado en `/`. */
	prefix: string;
	label: string;
	href?: string;
}

export interface IObjectReferenceSource {
	/** Referencias de las keys dadas que esta fuente conoce. El resto se ignora. */
	findByKeys(keys: readonly string[]): Promise<ObjectReference[]>;

	/**
	 * Suelta en la base las referencias a estas keys (borrado en cascada).
	 *
	 * Se llama ANTES de borrar los objetos: si el borrado de storage falla
	 * después, queda un huérfano detectable y no una ficha con imágenes rotas.
	 * Debe ser transaccional por dueño.
	 *
	 * @returns Número de referencias soltadas.
	 */
	release(keys: readonly string[]): Promise<number>;

	/** Nombres legibles para las carpetas que esta fuente reconoce. */
	describeFolders(prefixes: readonly string[]): Promise<FolderDescription[]>;
}
