/**
 * Base ÚNICA de los errores de negocio de la aplicación.
 *
 * Existe para que `toResponseError` pueda decidir con una sola comprobación si
 * un error es "conocido" (y por tanto su `code` y su `message` pueden viajar al
 * exterior) o desconocido (y hay que responder genérico). Sin esta base habría
 * que olfatear `typeof error.code === "string"`, que también acierta con errores
 * de Node (`ENOENT`, `ECONNREFUSED`) y filtraría detalles de infraestructura.
 *
 * Los errores concretos NO viven aquí: cada módulo declara los suyos en
 * `<modulo>/domain/<modulo>.errors.ts` extendiendo esta clase.
 */
export abstract class DomainError extends Error {
	/** Código estable, en MAYÚSCULAS_CON_GUION_BAJO. Es parte del contrato. */
	abstract readonly code: string;

	/**
	 * Datos que el adaptador de entrada necesita para redactar el mensaje de
	 * usuario (por ejemplo, los segundos que faltan tras un rate limit).
	 *
	 * Deben ser serializables: viajan dentro del envelope hasta el cliente.
	 */
	readonly details?: Record<string, unknown>;

	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export const isDomainError = (error: unknown): error is DomainError =>
	error instanceof DomainError;
