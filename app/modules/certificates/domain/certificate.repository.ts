import type { CourseScopeWriteWhere } from "@/modules/courses/domain/course.access";
import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type {
	CertificateCourse,
	CertificateDesign,
	CertificateIssueRecord,
	CertificateRecord,
	NewCertificateIssue,
	StoredIssue,
} from "./certificate.types";

/** El diseño guardado de un curso, para la fuente de referencias de firmas. */
export interface CertificateOwner {
	courseDocumentId: string;
	courseTitle: string;
	record: CertificateRecord;
	/** Las firmas que imprimen sus certificados ya emitidos. */
	issuedSignatureRefs: string[];
}

export interface ICertificateRepository {
	/** El curso si el alcance lo administra; `null` si no. */
	findCourse(
		courseDocumentId: string,
		where: CourseScopeWriteWhere,
	): Promise<CertificateCourse | null>;

	/** El curso sin guarda de alcance: solo para la emisión, que ya lo tiene bloqueado. */
	findCourseById(courseId: number): Promise<CertificateCourse>;

	/**
	 * El diseño guardado, leído con tolerancia: un blob que no valida cae al
	 * diseño por defecto. Sin fila, el diseño por defecto y `exists: false`.
	 */
	findRecord(courseId: number): Promise<CertificateRecord>;

	/** Crea la fila en el primer guardado. */
	saveDraft(courseId: number, design: CertificateDesign): Promise<void>;
	publish(courseId: number, design: CertificateDesign, at: Date): Promise<void>;

	findByCourseDocumentIds(
		courseDocumentIds: readonly string[],
	): Promise<CertificateOwner[]>;

	/**
	 * Quita estas firmas del borrador y del publicado del curso, en una sola
	 * transacción. Es lo que suelta el gestor de nube antes de borrar el objeto.
	 *
	 * @returns Cuántas firmas se quitaron.
	 */
	removeSignatureRefs(
		courseDocumentId: string,
		refs: readonly string[],
	): Promise<number>;

	findIssuesByCourse(courseId: number): Promise<StoredIssue[]>;

	/**
	 * Reserva `count` consecutivos del folio y devuelve el primero. Bloquea la
	 * fila del contador hasta el fin de la transacción: dos emisiones a la vez
	 * nunca reciben el mismo número.
	 */
	reserveFolios(count: number): Promise<number>;

	createIssues(
		courseId: number,
		issues: readonly NewCertificateIssue[],
		at: Date,
	): Promise<void>;
	restoreIssues(courseId: number, userIds: readonly number[]): Promise<void>;
	revokeIssues(
		courseId: number,
		userIds: readonly number[],
		at: Date,
	): Promise<void>;

	/**
	 * Una emisión leída de sus snapshots, si su curso se imparte dentro de `where`.
	 * El diseño se lee con tolerancia; los datos, no: sin ellos no se sabe a
	 * quién se otorgó.
	 */
	findIssue(
		issueDocumentId: string,
		where: TeachingCourseWhere,
	): Promise<CertificateIssueRecord | null>;
}
