import type * as v from "valibot";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	ObjectOwnerType,
	ObjectReference,
} from "@/shared/storage/object-reference.port";
import type {
	cloudListRule,
	cloudPrefixRule,
	cloudSelectionRule,
} from "./cloud.rules";

export type CloudVisibility = "public" | "private";

export interface CloudFolder {
	/** Prefijo completo acabado en `/`: es su identificador. */
	prefix: string;
	/** Último segmento, tal cual está en storage. */
	name: string;
	/** Nombre legible si algún módulo reconoce la carpeta ("Ana Ruiz"). */
	label: string | null;
	href: string | null;
	visibility: CloudVisibility;
}

export interface CloudObject {
	key: string;
	name: string;
	size: number;
	lastModified: Date | null;
	contentType: string;
	visibility: CloudVisibility;
	/** URL para `<img>`; `null` si el tipo no se previsualiza. */
	previewUrl: string | null;
	/** `null` = ninguna fila de la base lo usa. */
	reference: ObjectReference | null;
}

/** Un escalón de las migas: la carpeta y su nombre legible si se conoce. */
export interface CloudCrumb {
	prefix: string;
	name: string;
	label: string | null;
}

export interface CloudListing {
	path: string;
	/** De la raíz a `path`, sin incluir la raíz. */
	trail: CloudCrumb[];
	folders: CloudFolder[];
	objects: CloudObject[];
	/** Opaco. `null` si no hay más. */
	nextCursor: string | null;
}

export interface DeleteImpactOwner {
	owner: ObjectOwnerType;
	label: string;
	href?: string;
	/** Archivos de ese dueño dentro de la selección. */
	count: number;
}

/** Lo que se va a borrar, para enseñarlo ANTES de confirmar. */
export interface DeleteImpact {
	objectCount: number;
	totalBytes: number;
	/** Archivos que están en uso, agrupados por dueño. */
	owners: DeleteImpactOwner[];
}

export interface CloudDeleteResult {
	deleted: number;
	/** Keys que el proveedor no pudo borrar: quedan como huérfanas. */
	failed: string[];
	/** Referencias soltadas en la base. */
	released: number;
}

export interface ZipEntry {
	/** Ruta dentro del ZIP, relativa a la carpeta común de la selección. */
	path: string;
	url: string;
	size: number;
}

export interface ZipManifest {
	fileName: string;
	totalBytes: number;
	entries: ZipEntry[];
}

export interface OrphanScan {
	prefix: string;
	scanned: number;
	/** El prefijo tenía más objetos de los que se recorrieron. */
	truncated: boolean;
	orphans: CloudObject[];
}

export type CloudListInput = v.InferOutput<typeof cloudListRule>;
export type CloudSelection = v.InferOutput<typeof cloudSelectionRule>;
export type CloudPrefix = v.InferOutput<typeof cloudPrefixRule>;

export type CloudListingResponse = AppResponse<CloudListing>;
export type CloudDownloadResponse = AppResponse<{ url: string }>;
export type ZipManifestResponse = AppResponse<ZipManifest>;
export type DeleteImpactResponse = AppResponse<DeleteImpact>;
export type CloudDeleteResponse = AppResponse<CloudDeleteResult>;
export type OrphanScanResponse = AppResponse<OrphanScan>;
