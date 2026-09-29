import { randomBytes } from "node:crypto";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	courseScopeWriteWhere,
	courseVisibilityWhere,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import { isEnrollmentOpen } from "@/modules/enrollments/domain/enrollment.rules";
import type { EnrollmentCourse } from "@/modules/enrollments/domain/enrollment.types";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { ENROLLMENT_QR_TOKEN_BYTES } from "../domain/enrollment-qr.config";
import {
	EnrollmentQrForbiddenScopeError,
	EnrollmentQrInvalidTokenError,
	EnrollmentQrNotInAudienceError,
} from "../domain/enrollment-qr.errors";
import { assertAcceptsEnrollmentQr } from "../domain/enrollment-qr.rules";
import type { IEnrollmentQrService } from "../domain/enrollment-qr.service";

type Dependencies = {
	courseRepository: ICradle["courseRepository"];
	enrollmentRepository: ICradle["enrollmentRepository"];
	groupRepository: ICradle["groupRepository"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

const generateToken = (): string =>
	randomBytes(ENROLLMENT_QR_TOKEN_BYTES).toString("base64url");

export const createEnrollmentQrService = ({
	courseRepository,
	enrollmentRepository,
	groupRepository,
	clock,
	logger,
}: Dependencies): IEnrollmentQrService => {
	const run = createOperationRunner(logger.child({ module: "enrollment-qr" }));

	/** El QR es de quien organiza las inscripciones: el mismo alcance que asignar. */
	const requireOrganizer = async (
		documentId: string,
		actor: AuthContext,
	): Promise<EnrollmentCourse> => {
		const write = courseScopeWriteWhere(resolveCourseScope(actor));
		if (write === null) throw new EnrollmentQrForbiddenScopeError();

		const course = await enrollmentRepository.findCourse(documentId, write);
		if (!course) throw new EnrollmentQrForbiddenScopeError();

		return course;
	};

	return {
		async resolve(token, actor) {
			return run("resolve", async () => {
				const course = await courseRepository.findByEnrollmentQrToken(token);
				if (!course) throw new EnrollmentQrInvalidTokenError();

				assertAcceptsEnrollmentQr(course);

				const visible = await enrollmentRepository.findCourse(
					course.documentId,
					courseVisibilityWhere({
						userId: actor.userId,
						role: actor.role,
						dependencyId: actor.dependencyId,
						isTrainer: actor.isTrainer,
						groupIds: await groupRepository.findGroupIdsOfUser(actor.userId),
					}),
				);
				if (!visible) throw new EnrollmentQrNotInAudienceError();

				return ok({ courseDocumentId: course.documentId });
			});
		},

		async find(documentId, actor) {
			return run("find", async () => {
				const course = await requireOrganizer(documentId, actor);
				assertAcceptsEnrollmentQr(course);

				const state = await courseRepository.findEnrollmentQrState(course.id);

				return ok({
					...state,
					enrollmentOpen: isEnrollmentOpen(course, clock.now()),
				});
			});
		},

		async rotateToken(documentId, actor) {
			return run("rotateToken", async () => {
				const course = await requireOrganizer(documentId, actor);
				assertAcceptsEnrollmentQr(course);

				const now = clock.now();
				const token = generateToken();
				await courseRepository.rotateEnrollmentQrToken(course.id, token, now);

				return ok({ token, rotatedAt: now });
			});
		},
	};
};
