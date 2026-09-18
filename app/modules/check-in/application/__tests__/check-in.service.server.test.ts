import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { QrCourse } from "@/modules/courses/domain/course.types";
import type { EnrollmentStatus } from "@/modules/enrollments/domain/enrollment.config";
import type { StoredEnrollment } from "@/modules/enrollments/domain/enrollment.types";
import { courseOf as teachingCourseOf } from "@/modules/teaching/domain/__tests__/teaching.fixtures";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { QR_TOKEN_PATTERN } from "../../domain/check-in.config";
import { CHECK_IN_ERROR_CODES } from "../../domain/check-in.errors";
import { createCheckInService } from "../check-in.service.server";

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const COURSE_DOC = "11111111-1111-4111-8111-111111111111";

/** Sesión única: 1 de septiembre de 2026, 09:00–11:00 en Tijuana. */
const NOW_INSIDE = zonedInputToUtc("2026-09-01", "10:00");
const NOW_BEFORE = zonedInputToUtc("2026-08-30", "10:00");
const NOW_AFTER = zonedInputToUtc("2026-09-05", "10:00");

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const actorOf = (overrides: Partial<AuthContext> = {}): AuthContext => ({
	userId: 7,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "ana@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	...overrides,
});

const qrCourseOf = (overrides: Partial<QrCourse> = {}): QrCourse => ({
	id: 10,
	documentId: COURSE_DOC,
	title: "Seguridad en obra",
	status: "PUBLISHED",
	dependencyName: "Obras Públicas",
	qrOpensBeforeMinutes: 15,
	qrClosesAfterMinutes: 15,
	sessions: [
		{
			id: 1,
			documentId: "session-0",
			startsAt: zonedInputToUtc("2026-09-01", "09:00"),
			endsAt: zonedInputToUtc("2026-09-01", "11:00"),
			venue: "Aula 2",
		},
	],
	...overrides,
});

interface HarnessOptions {
	course?: QrCourse | null;
	status?: EnrollmentStatus | null;
	/** Lo que `checkIn` devuelve: `false` = ya estaba marcada por QR. */
	written?: boolean;
	now?: Date;
}

const createHarness = (options: HarnessOptions = {}) => {
	const log = {
		checkIns: [] as { sessionId: number; userId: number; at: Date }[],
		rotations: [] as { courseId: number; token: string; at: Date }[],
	};

	const courseRepository = {
		findByQrToken: async (token: string) =>
			token === TOKEN ? (options.course ?? qrCourseOf()) : null,
		rotateQrToken: async (courseId: number, token: string, at: Date) => {
			log.rotations.push({ courseId, token, at });
		},
	} as unknown as ICradle["courseRepository"];

	const enrollmentRepository = {
		findEnrollment: async (): Promise<StoredEnrollment | null> => {
			const status = options.status === undefined ? "ENROLLED" : options.status;
			return status === null
				? null
				: ({
						userId: 7,
						documentId: "e",
						origin: "SELF",
						status,
						result: "PENDING",
					} as StoredEnrollment);
		},
	} as unknown as ICradle["enrollmentRepository"];

	const teachingRepository = {
		checkIn: async (sessionId: number, userId: number, at: Date) => {
			log.checkIns.push({ sessionId, userId, at });
			return options.written ?? true;
		},
		findCourse: async () => teachingCourseOf(),
	} as unknown as ICradle["teachingRepository"];

	const service = createCheckInService({
		courseRepository,
		enrollmentRepository,
		teachingRepository,
		clock: { now: () => options.now ?? NOW_INSIDE },
		logger: silentLogger,
	});

	return { service, log };
};

const errorCodeOf = (result: {
	success: boolean;
	error?: { code: string };
}) => {
	expect(result.success).toBe(false);
	return result.error?.code;
};

describe("register", () => {
	test("registra la asistencia de quien escanea, en la sesión activa", async () => {
		const { service, log } = createHarness();

		const result = await service.register(TOKEN, actorOf());

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.status).toBe("RECORDED");
		expect(result.data.course.title).toBe("Seguridad en obra");
		expect(result.data.session).toMatchObject({ ordinal: 1, total: 1 });
		expect(log.checkIns).toEqual([{ sessionId: 1, userId: 7, at: NOW_INSIDE }]);
	});

	test("volver a escanear no reescribe: la marca conserva su primer instante", async () => {
		const { service, log } = createHarness({ written: false });

		const result = await service.register(TOKEN, actorOf());

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.status).toBe("ALREADY_RECORDED");
		expect(log.checkIns).toHaveLength(1);
	});

	test("un token desconocido no dice si el curso existe", async () => {
		const { service, log } = createHarness();

		const result = await service.register("B".repeat(32), actorOf());

		expect(errorCodeOf(result)).toBe(CHECK_IN_ERROR_CODES.INVALID_TOKEN);
		expect(log.checkIns).toHaveLength(0);
	});

	test.each(["DRAFT", "FINISHED", "CANCELLED"] as const)(
		"un curso %s no admite escaneos",
		async (status) => {
			const { service, log } = createHarness({
				course: qrCourseOf({ status }),
			});

			const result = await service.register(TOKEN, actorOf());

			expect(errorCodeOf(result)).toBe(CHECK_IN_ERROR_CODES.COURSE_NOT_OPEN);
			expect(log.checkIns).toHaveLength(0);
		},
	);

	test("el invitado no se inscribe al escanear", async () => {
		const { service, log } = createHarness({ status: "INVITED" });

		const result = await service.register(TOKEN, actorOf());

		expect(errorCodeOf(result)).toBe(CHECK_IN_ERROR_CODES.INVITATION_PENDING);
		expect(log.checkIns).toHaveLength(0);
	});

	test("quien no está inscrito se rechaza", async () => {
		const { service, log } = createHarness({ status: null });

		const result = await service.register(TOKEN, actorOf());

		expect(errorCodeOf(result)).toBe(CHECK_IN_ERROR_CODES.NOT_ENROLLED);
		expect(log.checkIns).toHaveLength(0);
	});

	test("antes de la ventana se rechaza y se dice cuándo abre", async () => {
		const { service, log } = createHarness({ now: NOW_BEFORE });

		const result = await service.register(TOKEN, actorOf());

		expect(errorCodeOf(result)).toBe(CHECK_IN_ERROR_CODES.SESSION_NOT_OPEN);
		expect(log.checkIns).toHaveLength(0);
	});

	test("después de la ventana se rechaza", async () => {
		const { service, log } = createHarness({ now: NOW_AFTER });

		const result = await service.register(TOKEN, actorOf());

		expect(errorCodeOf(result)).toBe(CHECK_IN_ERROR_CODES.SESSION_CLOSED);
		expect(log.checkIns).toHaveLength(0);
	});

	test("un curso sin sesiones no tiene dónde registrar", async () => {
		const { service } = createHarness({ course: qrCourseOf({ sessions: [] }) });

		const result = await service.register(TOKEN, actorOf());

		expect(errorCodeOf(result)).toBe(CHECK_IN_ERROR_CODES.WITHOUT_SESSIONS);
	});
});

describe("preview", () => {
	test("aplica las mismas guardas sin escribir nada", async () => {
		const { service, log } = createHarness();

		const result = await service.preview(TOKEN, actorOf());

		expect(result.success).toBe(true);
		if (result.success) expect(result.data.canRegister).toBe(true);
		expect(log.checkIns).toHaveLength(0);
	});

	test("un rechazo del preview no escribe", async () => {
		const { service, log } = createHarness({ status: null });

		const result = await service.preview(TOKEN, actorOf());

		expect(errorCodeOf(result)).toBe(CHECK_IN_ERROR_CODES.NOT_ENROLLED);
		expect(log.checkIns).toHaveLength(0);
	});
});

describe("rotateToken", () => {
	// El doble de `teachingRepository.findCourse` ya aplica el alcance, así que
	// aquí se prueba el camino feliz y el corte por rol sin alcance alguno.
	test("genera un token opaco del formato esperado", async () => {
		const { service, log } = createHarness();

		const result = await service.rotateToken(
			COURSE_DOC,
			actorOf({ role: "SUPERADMIN", dependencyId: null }),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.token).toMatch(QR_TOKEN_PATTERN);
		expect(log.rotations).toHaveLength(1);
		expect(log.rotations[0]?.token).toBe(result.data.token);
	});

	test("dos rotaciones no devuelven el mismo token", async () => {
		const { service } = createHarness();
		const actor = actorOf({ role: "SUPERADMIN", dependencyId: null });

		const first = await service.rotateToken(COURSE_DOC, actor);
		const second = await service.rotateToken(COURSE_DOC, actor);

		expect(first.success && second.success).toBe(true);
		if (!first.success || !second.success) return;
		expect(first.data.token).not.toBe(second.data.token);
	});

	test("quien ni imparte ni organiza no administra el QR", async () => {
		const { service, log } = createHarness();

		const result = await service.rotateToken(
			COURSE_DOC,
			actorOf({ role: "USER", dependencyId: null, isTrainer: false }),
		);

		expect(errorCodeOf(result)).toBe(CHECK_IN_ERROR_CODES.FORBIDDEN_SCOPE);
		expect(log.rotations).toHaveLength(0);
	});
});
