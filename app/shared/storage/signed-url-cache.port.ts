import type { SignedUrl } from "./signed-url.policy";

/** Firmas ya emitidas, por clave. Puede lanzar: quien la usa firma de nuevo. */
export interface SignedUrlCache {
	/** En el mismo orden que `keys`, `null` donde no hay. */
	getMany(keys: readonly string[]): Promise<(SignedUrl | null)[]>;
	setMany(
		entries: readonly { key: string; value: SignedUrl; ttlMs: number }[],
	): Promise<void>;
}
