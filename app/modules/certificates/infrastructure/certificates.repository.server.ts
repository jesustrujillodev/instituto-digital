import type { Prisma } from "@prisma/client";
import { courseHoursOf } from "@/modules/courses/domain/course.rules";
import type { ICradle } from "@/shared/di/container.types";
import {
	CERTIFICATE_FOLIO_COUNTER_ID,
	DEFAULT_CERTIFICATE_DESIGN,
} from "../domain/certificate.config";
import {
	toCertificateDesign,
	toCertificateRenderData,
} from "../domain/certificate.mapper";
import type { ICertificateRepository } from "../domain/certificate.repository";
import type {
	CertificateCourse,
	CertificateDesign,
	CertificateRecord,
	CertificateRenderData,
} from "../domain/certificate.types";

type Dependencies = {
	prisma: ICradle["prisma"];
	logger: ICradle["logger"];
};

/** El tipo que Prisma acepta para una columna `Json`. */
const asJson = (value: CertificateDesign | CertificateRenderData) =>
	value as unknown as Prisma.InputJsonValue;

const asCourseWhere = (where: unknown) => where as Prisma.CourseWhereInput;

const COURSE_SELECT = {
	id: true,
	documentId: true,
	status: true,
	title: true,
	description: true,
	hours: true,
	dependency: { select: { name: true } },
	sessions: { select: { startsAt: true, endsAt: true } },
} satisfies Prisma.CourseSelect;

const toCourse = (
	course: Prisma.CourseGetPayload<{ select: typeof COURSE_SELECT }>,
): CertificateCourse => ({
	id: course.id,
	documentId: course.documentId,
	status: course.status,
	title: course.title,
	description: course.description,
	dependencyName: course.dependency.name,
	hours: courseHoursOf(course),
});

const RECORD_SELECT = {
	draftDesign: true,
	publishedDesign: true,
	publishedAt: true,
} satisfies Prisma.CourseCertificateSelect;

type StoredRecord = Prisma.CourseCertificateGetPayload<{
	select: typeof RECORD_SELECT;
}>;

const withoutSignatures = (
	design: CertificateDesign,
	refs: ReadonlySet<string>,
): { design: CertificateDesign; removed: number } => {
	let removed = 0;
	const signatories = design.signatories.map((signatory) => {
		if (!signatory.signatureUrl || !refs.has(signatory.signatureUrl)) {
			return signatory;
		}
		removed++;
		return { ...signatory, signatureUrl: null };
	}) as CertificateDesign["signatories"];

	return { design: { ...design, signatories }, removed };
};

const signatureRefsOf = (designs: readonly CertificateDesign[]): string[] => [
	...new Set(
		designs.flatMap((design) =>
			design.signatories.flatMap((signatory) =>
				signatory.signatureUrl ? [signatory.signatureUrl] : [],
			),
		),
	),
];

export const createCertificateRepository = ({
	prisma,
	logger,
}: Dependencies): ICertificateRepository => {
	const log = logger.child({ module: "certificates", layer: "repository" });

	/**
	 * Un diseño de una columna `Json`, o el de por defecto si no es legible.
	 *
	 * Una fila de un esquema anterior no puede tumbar el editor ni la emisión:
	 * se registra y se sigue con el diseño por defecto.
	 */
	const readDesign = (value: unknown, courseId: number): CertificateDesign => {
		const design = toCertificateDesign(value);
		if (design) return design;

		log.error("certificate design is unreadable — falling back to default", {
			courseId,
		});
		return DEFAULT_CERTIFICATE_DESIGN;
	};

	const toRecord = (
		row: StoredRecord | null,
		courseId: number,
	): CertificateRecord =>
		row
			? {
					draft: readDesign(row.draftDesign, courseId),
					published:
						row.publishedDesign === null
							? null
							: readDesign(row.publishedDesign, courseId),
					publishedAt: row.publishedAt,
					exists: true,
				}
			: {
					draft: DEFAULT_CERTIFICATE_DESIGN,
					published: null,
					publishedAt: null,
					exists: false,
				};

	return {
		async findCourse(courseDocumentId, where) {
			const course = await prisma.course.findFirst({
				where: {
					AND: [{ documentId: courseDocumentId }, asCourseWhere(where)],
				},
				select: COURSE_SELECT,
			});
			return course ? toCourse(course) : null;
		},

		async findCourseById(courseId) {
			return toCourse(
				await prisma.course.findUniqueOrThrow({
					where: { id: courseId },
					select: COURSE_SELECT,
				}),
			);
		},

		async findRecord(courseId) {
			const row = await prisma.courseCertificate.findUnique({
				where: { courseId },
				select: RECORD_SELECT,
			});
			return toRecord(row, courseId);
		},

		async saveDraft(courseId, design) {
			await prisma.courseCertificate.upsert({
				where: { courseId },
				create: { courseId, draftDesign: asJson(design) },
				update: { draftDesign: asJson(design) },
			});
		},

		async publish(courseId, design, at) {
			await prisma.courseCertificate.upsert({
				where: { courseId },
				create: {
					courseId,
					draftDesign: asJson(design),
					publishedDesign: asJson(design),
					publishedAt: at,
				},
				update: { publishedDesign: asJson(design), publishedAt: at },
			});
		},

		async findByCourseDocumentIds(courseDocumentIds) {
			if (courseDocumentIds.length === 0) return [];

			const rows = await prisma.courseCertificate.findMany({
				where: { course: { documentId: { in: [...courseDocumentIds] } } },
				select: {
					...RECORD_SELECT,
					courseId: true,
					course: {
						select: {
							documentId: true,
							title: true,
							certificateIssues: { select: { designSnapshot: true } },
						},
					},
				},
			});

			return rows.map((row) => ({
				courseDocumentId: row.course.documentId,
				courseTitle: row.course.title,
				record: toRecord(row, row.courseId),
				issuedSignatureRefs: signatureRefsOf(
					row.course.certificateIssues.flatMap(({ designSnapshot }) => {
						const design = toCertificateDesign(designSnapshot);
						return design ? [design] : [];
					}),
				),
			}));
		},

		async removeSignatureRefs(courseDocumentId, refs) {
			if (refs.length === 0) return 0;

			const row = await prisma.courseCertificate.findFirst({
				where: { course: { documentId: courseDocumentId } },
				select: { ...RECORD_SELECT, courseId: true },
			});
			if (!row) return 0;

			const wanted = new Set(refs);
			const record = toRecord(row, row.courseId);
			const draft = withoutSignatures(record.draft, wanted);
			const published = record.published
				? withoutSignatures(record.published, wanted)
				: null;
			const removed = draft.removed + (published?.removed ?? 0);
			if (removed === 0) return 0;

			// Una sola sentencia sobre una sola fila: el borrador y el publicado
			// se sueltan juntos o no se suelta ninguno.
			await prisma.courseCertificate.update({
				where: { courseId: row.courseId },
				data: {
					draftDesign: asJson(draft.design),
					...(published && { publishedDesign: asJson(published.design) }),
				},
			});
			return removed;
		},

		async findIssuesByCourse(courseId) {
			return prisma.certificateIssue.findMany({
				where: { courseId },
				select: { userId: true, revokedAt: true },
			});
		},

		async reserveFolios(count) {
			// El UPDATE bloquea la fila hasta el fin de la transacción: quien emita a
			// la vez espera, y un rollback devuelve los números sin dejar huecos.
			const counter = await prisma.certificateFolioCounter.upsert({
				where: { id: CERTIFICATE_FOLIO_COUNTER_ID },
				create: { id: CERTIFICATE_FOLIO_COUNTER_ID, value: count },
				update: { value: { increment: count } },
				select: { value: true },
			});
			return counter.value - count + 1;
		},

		async createIssues(courseId, issues, at) {
			if (issues.length === 0) return;

			await prisma.certificateIssue.createMany({
				data: issues.map((issue) => ({
					courseId,
					userId: issue.userId,
					folio: issue.folio,
					issuedAt: at,
					designSnapshot: asJson(issue.design),
					dataSnapshot: asJson(issue.data),
				})),
			});
		},

		async restoreIssues(courseId, userIds) {
			if (userIds.length === 0) return;

			await prisma.certificateIssue.updateMany({
				where: {
					courseId,
					userId: { in: [...userIds] },
					revokedAt: { not: null },
				},
				data: { revokedAt: null },
			});
		},

		async revokeIssues(courseId, userIds, at) {
			if (userIds.length === 0) return;

			await prisma.certificateIssue.updateMany({
				where: { courseId, userId: { in: [...userIds] }, revokedAt: null },
				data: { revokedAt: at },
			});
		},

		async findIssue(issueDocumentId, where) {
			const row = await prisma.certificateIssue.findFirst({
				where: { documentId: issueDocumentId, course: asCourseWhere(where) },
				select: {
					documentId: true,
					courseId: true,
					folio: true,
					revokedAt: true,
					designSnapshot: true,
					dataSnapshot: true,
				},
			});
			if (!row) return null;

			const data = toCertificateRenderData(row.dataSnapshot);
			// A diferencia del diseño, no hay con qué sustituirlos: son a quién y
			// por qué se otorgó.
			if (!data) {
				throw new Error(
					`certificate issue ${row.documentId} has an unreadable data snapshot`,
				);
			}

			return {
				documentId: row.documentId,
				courseId: row.courseId,
				folio: row.folio,
				revokedAt: row.revokedAt,
				design: readDesign(row.designSnapshot, row.courseId),
				data,
			};
		},
	};
};
