import type {
	CreditCandidate,
	CreditDependency,
	CreditWriteContext,
	DependencyCreditRow,
	MyCredit,
	StaffCreditRow,
	StaffQuery,
	StoredCredit,
} from "./credit.types";

/**
 * Las escrituras no tienen caso de uso propio: las hace `teaching` al finalizar
 * o corregir un curso, dentro de su `runInTransaction` (docs/adr/0006).
 */
export interface ICreditRepository {
	/** Incluye los retirados. */
	findByCourse(courseId: number): Promise<StoredCredit[]>;
	grant(
		candidates: readonly CreditCandidate[],
		context: CreditWriteContext,
	): Promise<void>;
	/** Quita la marca de retiro y registra quién vuelve a otorgarlo. */
	restore(
		userIds: readonly number[],
		context: CreditWriteContext,
	): Promise<void>;
	/** Marca `revokedAt` y `revokedById`; nunca borra la fila. */
	revoke(
		userIds: readonly number[],
		context: Omit<CreditWriteContext, "fiscalYear">,
	): Promise<void>;

	/** Créditos vigentes de la persona, del más reciente al más antiguo. */
	findMine(userId: number): Promise<MyCredit[]>;

	/**
	 * Personal de la dependencia y quien obtuvo créditos PARA ella en el
	 * ejercicio aunque ya se haya ido. Cuenta solo los de esa dependencia.
	 */
	findStaff(query: StaffQuery): Promise<StaffCreditRow[]>;
	countStaff(query: Omit<StaffQuery, "page" | "pageSize">): Promise<number>;
	summarizeByDependency(fiscalYear: number): Promise<DependencyCreditRow[]>;
	findDependency(documentId: string): Promise<CreditDependency | null>;
	findDependencyById(id: number): Promise<CreditDependency | null>;
}
