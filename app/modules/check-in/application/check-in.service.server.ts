import { randomBytes } from "node:crypto";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	canTeach,
	resolveTeachingScope,
	teachingCourseWhere,
} from "@/modules/teaching/domain/teaching.access";
import { canWrite } from "@/modules/teaching/domain/teaching.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { QR_TOKEN_BYTES } from "../domain/check-in.config";
import {
	CheckInForbiddenScopeError,
	CheckInInvalidTokenError,
} from "../domain/check-in.errors";
import { toCheckInPreview, toCheckInResult } from "../domain/check-in.mapper";
import {
	assertActiveSession,
	assertCheckInOpen,
	assertEnrolled,
	resolveSessionOutcome,
	windowOfCourse,
} from "../domain/check-in.rules";
import type { ICheckInService } from "../domain/check-in.service";
import type { CheckInCourse, CheckInSession } from "../domain/check-in.types";

type Dependencies = {
	courseRepository: ICradle["courseRepository"];
	enrollmentRepository: ICradle["enrollmentRepository"];
	teachingRepository: ICradle["teachingRepository"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

/** base64url: 24 bytes son 32 caracteres sin relleno ni escapes en la URL. */
const generateQrToken = (): string =>
	randomBytes(QR_TOKEN_BYTES).toString("base64url");

export const createCheckInService = ({
	courseRepository,
	enrollmentRepository,
	teachingRepository,
	clock,
	logger,
}: Dependencies): ICheckInService => {
	const run = createOperationRunner(logger.child({ module: "check-in" }));

	/**
	 * Las guardas que comparten `preview` y `register`, en el mismo orden: el
	 * preview no puede ser más permisivo que la escritura o la pantalla
	 * prometería un registro que luego falla.
	 */
	const resolve = async (
		token: string,
		actor: AuthContext,
		now: Date,
	): Promise<{ course: CheckInCourse; session: CheckInSession }> => {
		const course = await courseRepository.findByQrToken(token);
		if (!course) throw new CheckInInvalidTokenError();

		assertCheckInOpen(course);

		const enrollment = await enrollmentRepository.findEnrollment(
			course.id,
			actor.userId,
		);
		assertEnrolled(enrollment, course.documentId);

		const outcome = resolveSessionOutcome(
			course.sessions,
			windowOfCourse(course),
			now,
		);
		assertActiveSession(outcome);

		return { course, session: outcome.session };
	};

	return {
		async preview(token, actor) {
			return run("preview", async () => {
				const { course, session } = await resolve(token, actor, clock.now());
				return ok(toCheckInPreview(course, session));
			});
		},

		/**
		 * Sin `runInTransaction` ni bloqueo del curso, a diferencia de
		 * `teachingService.saveAttendance`: se escribe UNA fila con clave primaria
		 * `(sessionId, userId)`, el upsert ya es atómico y el curso está publicado,
		 * así que no hay créditos que recalcular. Bloquear el curso serializaría a
		 * las cuarenta personas que escanean al entrar al aula.
		 */
		async register(token, actor) {
			return run("register", async () => {
				const now = clock.now();
				const { course, session } = await resolve(token, actor, now);

				const written = await teachingRepository.checkIn(
					session.id,
					actor.userId,
					now,
				);

				return ok(toCheckInResult(course, session, written, now));
			});
		},

		async rotateToken(documentId, actor) {
			return run("rotateToken", async () => {
				const scope = resolveTeachingScope(actor);
				if (!canTeach(scope)) throw new CheckInForbiddenScopeError();

				const course = await teachingRepository.findCourse(
					documentId,
					teachingCourseWhere(scope),
				);
				if (!course || !canWrite(course, scope)) {
					throw new CheckInForbiddenScopeError();
				}

				const now = clock.now();
				const token = generateQrToken();
				await courseRepository.rotateQrToken(course.id, token, now);

				return ok({ token, rotatedAt: now });
			});
		},
	};
};
