import type {
	CreateDependencyDto,
	Dependency,
	DependencyMember,
	HeadCandidate,
	ListDependenciesDto,
	UpdateDependencyDto,
} from "./dependency.types";

export interface IDependencyRepository {
	findAll(filters: ListDependenciesDto): Promise<Dependency[]>;
	/** Total que cumple los mismos filtros, sin paginar — para la meta del listado. */
	count(filters: ListDependenciesDto): Promise<number>;
	findById(documentId: string): Promise<Dependency | null>;
	/**
	 * Búsqueda por PK interna. La usa `users` para comprobar que la dependencia
	 * destino de un alta existe y está activa: el alcance y la columna `User`
	 * hablan en ids internos, no en documentId.
	 */
	findByInternalId(id: number): Promise<Dependency | null>;
	/** Catálogo de activas, sin paginar — alimenta los selectores de formulario. */
	findActive(): Promise<Dependency[]>;
	/**
	 * Catálogo COMPLETO, incluidas las desactivadas.
	 *
	 * Distinto de `findActive` porque sirve a otra pregunta: `findActive` responde
	 * "¿a dónde puedo asignar a alguien?" y este "¿cómo se llama la dependencia de
	 * esta fila?". Una desactivada no es destino válido pero sigue teniendo
	 * personal adscrito y nombre que mostrar.
	 */
	findCatalog(): Promise<Dependency[]>;
	create(dto: CreateDependencyDto): Promise<Dependency>;
	update(documentId: string, dto: UpdateDependencyDto): Promise<Dependency>;
	/** Soft-delete: marca `archivedAt` con el instante actual. */
	archive(documentId: string): Promise<Dependency>;
	/** Revierte el soft-delete dejando `archivedAt` en null. */
	unarchive(documentId: string): Promise<Dependency>;
	/** Titular activo, si lo hay. Es a quien hay que degradar antes de promover. */
	findHead(dependencyId: number): Promise<DependencyMember | null>;
	/**
	 * Cuentas activas de la dependencia, para el selector de titular.
	 *
	 * Lee `auth.users` desde este módulo, igual que `findHead` y `findMember`: la
	 * alternativa —pedírselas al servicio de `users`— obligaría a que `users`
	 * expusiera un filtro por dependencia antes de que su propio alcance exista, y
	 * a que este módulo dependiera de la forma de dominio de otro.
	 */
	findHeadCandidates(dependencyId: number): Promise<HeadCandidate[]>;
	/**
	 * La cuenta, solo si está adscrita a esta dependencia. Devolver null cuando
	 * pertenece a otra —en vez de la cuenta con su dependencia— evita que quien
	 * llama tenga que acordarse de comparar.
	 */
	findMember(
		dependencyId: number,
		userDocumentId: string,
	): Promise<DependencyMember | null>;
	/**
	 * Designación de titular en una sola transacción: degrada al actual y promueve
	 * al candidato.
	 *
	 * Escribe en `auth.users`, que es tabla del módulo `users`. Es una excepción
	 * deliberada y la única del módulo: una transacción no puede repartirse entre
	 * dos repositorios, y `docs/reglas.md` §8.1 exige frontera transaccional para
	 * una escritura compuesta. Sin ella, un fallo entre las dos sentencias deja la
	 * dependencia sin titular o con dos.
	 *
	 * Lanza `DependencyAlreadyHasHeadError` si el índice único parcial la rechaza.
	 */
	assignHead(params: {
		dependencyId: number;
		candidateUserId: number;
		currentHeadUserId: number | null;
	}): Promise<void>;
}
