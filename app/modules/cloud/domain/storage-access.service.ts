import type { AppResponse } from "@/shared/response/response.types";
import type { ObjectReader } from "@/shared/storage/object-reference.port";

/** Quién puede leer un objeto privado por el proxy `/api/storage`. */
export interface IStorageAccessService {
	/**
	 * `true` si alguna fuente de referencias se lo concede, o si quien pide es
	 * SUPERADMIN, que abre cualquier objeto desde el gestor de nube (huérfanos
	 * incluidos). Lo que nadie concede se niega.
	 */
	canRead(key: string, reader: ObjectReader): Promise<AppResponse<boolean>>;
}
