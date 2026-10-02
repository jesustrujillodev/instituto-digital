import { canEditCertificate } from "@/modules/certificates/domain/certificate.rules";
import { CERTIFICATE_ERROR_MESSAGES } from "@/modules/certificates/utils/certificate-error-messages";
import { acceptsEnrollmentQr } from "@/modules/enrollment-qr/domain/enrollment-qr.rules";
import { ENROLLMENT_QR_ERROR_MESSAGES } from "@/modules/enrollment-qr/utils/enrollment-qr-error-messages";
import { ENROLLMENT_ERROR_MESSAGES } from "@/modules/enrollments/utils/enrollment-error-messages";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { canOpenTeaching } from "../../../domain/course.access";
import {
	canCancel,
	canEdit,
	canPublish,
	publishChecklist,
} from "../../../domain/course.rules";
import { validateFindCourse } from "../../../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import { toEnrollmentSummary } from "../../../utils/to-enrollment-summary";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/capacitaciones/:documentId — ficha del curso.
 *
 * Fuera de alcance responde 404 igual que inexistente: un capacitador no
 * confirma por URL que exista un curso que no creó.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { auth, scope } = await requireCourseScope(request, context);

	const { documentId } = validateFindCourse({ documentId: params.documentId });

	const [course, roster] = await Promise.all([
		context.courseService.findById(documentId, scope),
		context.enrollmentService.listRoster(documentId, auth),
	]);

	if (!course.success) throw toRouteError(course.error, COURSE_ERROR_MESSAGES);
	if (!roster.success)
		throw toRouteError(roster.error, ENROLLMENT_ERROR_MESSAGES);

	const { status } = course.data;

	// Todo depende solo del curso: va en paralelo. Cada lectura se pide solo
	// cuando aplica: los conteos solo alimentan el pendiente de publicación, y un
	// curso cancelado ya no tiene certificado que publicar.
	const [facts, certificate, enrollmentQr] = await Promise.all([
		canPublish(status)
			? context.courseService.findContentFacts(course.data)
			: null,
		canEditCertificate(status)
			? context.certificateService.getEditor(documentId, auth)
			: null,
		acceptsEnrollmentQr(course.data)
			? context.enrollmentQrService.find(documentId, auth)
			: null,
	]);

	if (facts && !facts.success)
		throw toRouteError(facts.error, COURSE_ERROR_MESSAGES);
	if (certificate && !certificate.success)
		throw toRouteError(certificate.error, CERTIFICATE_ERROR_MESSAGES);
	if (enrollmentQr && !enrollmentQr.success)
		throw toRouteError(enrollmentQr.error, ENROLLMENT_QR_ERROR_MESSAGES);

	return ok({
		course: course.data,
		coverUrl: roster.data.course.coverUrl,
		enrollment: toEnrollmentSummary(roster.data),
		certificateState: certificate?.data.state ?? null,
		enrollmentQr: enrollmentQr?.data ?? null,
		publishChecklist: facts ? publishChecklist(course.data, facts.data) : null,
		now: context.clock.now(),
		can: {
			edit: canEdit(status),
			certificate: canEditCertificate(status),
			publish: canPublish(status),
			cancel: canCancel(status),
			teach: canOpenTeaching(scope, course.data, auth.documentId),
		},
	});
};
