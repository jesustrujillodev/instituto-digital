import type { AppResponse } from "@/shared/response/response.types";
import type {
	CreateDependencyDto,
	DependencyListResponse,
	DependencyResponse,
	HeadCandidate,
	ListDependenciesDto,
	UpdateDependencyDto,
} from "./dependency.types";

/**
 * Casos de uso del módulo.
 *
 * Todos devuelven el envelope estándar y NINGUNO lanza para los fallos
 * esperados: una dependencia inexistente o un nombre repetido son respuestas, no
 * excepciones. Así el loader/action no necesita conocer la lista de errores del
 * módulo para no romperse — le basta con comprobar `success`.
 *
 * Lo verdaderamente inesperado (base caída, bug) tampoco escapa: el runner lo
 * registra y lo devuelve como `UNEXPECTED_ERROR`, sin su mensaje real.
 */
export interface IDependencyService {
	/** Página de resultados; el total y el número de páginas van en `pagination`. */
	list(filters: ListDependenciesDto): Promise<DependencyListResponse>;
	/**
	 * Catálogo de activas para los selectores de alta de usuarios. Sin paginar y
	 * sin filtros: una desactivada no puede ser destino, así que no se ofrece.
	 */
	listActive(): Promise<DependencyListResponse>;
	/**
	 * Catálogo completo, para poner nombre a una adscripción existente y para
	 * filtrar por una dependencia ya desactivada que todavía tiene personal.
	 */
	listCatalog(): Promise<DependencyListResponse>;
	/** Falla con `DEPENDENCY_NOT_FOUND` si no existe — no devuelve un dato nulo. */
	findById(documentId: string): Promise<DependencyResponse>;
	/**
	 * Por id interno. La consume el perfil para poner nombre a la adscripción que
	 * la cuenta ya tiene: `User.dependencyId` habla en ids internos, y buscarla en
	 * el catálogo de activas fallaría si está desactivada.
	 */
	findByInternalId(id: number): Promise<DependencyResponse>;
	/**
	 * Cuentas que pueden ser titular de esta dependencia. Falla con
	 * `DEPENDENCY_NOT_FOUND` si la dependencia no existe, en vez de devolver una
	 * lista vacía que se leería como "no tiene personal".
	 */
	listHeadCandidates(documentId: string): Promise<AppResponse<HeadCandidate[]>>;
	create(dto: CreateDependencyDto): Promise<DependencyResponse>;
	update(
		documentId: string,
		dto: UpdateDependencyDto,
	): Promise<DependencyResponse>;
	/** Desactiva sin borrar: conserva el historial y deja de admitir personal. */
	archive(documentId: string): Promise<DependencyResponse>;
	unarchive(documentId: string): Promise<DependencyResponse>;
	/**
	 * Designa titular: degrada al anterior y promueve al candidato en una
	 * transacción, y revoca los tokens de AMBOS al terminar para que el cambio de
	 * rol corte en el acto y no al expirar su access token.
	 */
	assignHead(
		documentId: string,
		userDocumentId: string,
	): Promise<DependencyResponse>;
}
