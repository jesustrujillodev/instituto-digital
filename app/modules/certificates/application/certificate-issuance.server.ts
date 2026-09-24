import type { ICradle } from "@/shared/di/container.types";
import { DEFAULT_CERTIFICATE_DESIGN } from "../domain/certificate.config";
import { folioPartsOf, toIssueRenderData } from "../domain/certificate.mapper";
import { diffIssues, resolveFolio } from "../domain/certificate.rules";
import type { ICertificateIssuance } from "../domain/certificate.service";

type Dependencies = {
	certificateRepository: ICradle["certificateRepository"];
	notificationService: ICradle["notificationService"];
};

export const createCertificateIssuance = ({
	certificateRepository,
	notificationService,
}: Dependencies): ICertificateIssuance => ({
	/**
	 * Emite con el diseño PUBLICADO, o con el de por defecto si nunca se publicó:
	 * nadie se queda sin certificado porque el capacitador no llegó a diseñarlo.
	 */
	async sync(courseId, completed, at) {
		const diff = diffIssues(
			await certificateRepository.findIssuesByCourse(courseId),
			completed,
		);

		if (diff.issue.length > 0) {
			// Secuencial: la transacción interactiva de Prisma no admite consultas en paralelo.
			const course = await certificateRepository.findCourseById(courseId);
			const record = await certificateRepository.findRecord(courseId);
			const design = record.published ?? DEFAULT_CERTIFICATE_DESIGN;
			const firstSeq = await certificateRepository.reserveFolios(
				diff.issue.length,
			);
			const parts = folioPartsOf(at);
			const issues = diff.issue.map((candidate, index) => {
				const folio = resolveFolio(design.folioFormat, {
					seq: firstSeq + index,
					...parts,
				});
				return {
					userId: candidate.userId,
					folio,
					design,
					data: toIssueRenderData(course, candidate.recipientName, folio, at),
				};
			});

			await certificateRepository.createIssues(courseId, issues, at);

			// En la misma transacción que la emisión (docs/adr/0008): si la emisión
			// revierte, el correo no sale. Solo la primera vez; restaurar no avisa.
			const delivery = await certificateRepository.findDelivery(courseId);
			await notificationService.notify(
				diff.issue.map((candidate, index) => ({
					template: "CERTIFICATE_ISSUED",
					to: {
						email: candidate.email,
						firstName: candidate.firstName,
						lastName: candidate.lastName,
					},
					course: {
						title: course.title,
						dependencyName: course.dependencyName,
					},
					folio: issues[index].folio,
					downloadable: delivery.isDownloadable,
					message: delivery.emailMessage,
				})),
			);
		}

		await certificateRepository.restoreIssues(courseId, diff.restore);
		await certificateRepository.revokeIssues(courseId, diff.revoke, at);

		return {
			issued: diff.issue.length,
			restored: diff.restore.length,
			revoked: diff.revoke.length,
		};
	},
});
