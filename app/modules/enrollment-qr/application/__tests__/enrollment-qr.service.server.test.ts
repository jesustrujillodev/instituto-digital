import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { EnrollmentQrCourse } from "@/modules/courses/domain/course.types";
import type { EnrollmentCourse } from "@/modules/enrollments/domain/enrollment.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { ENROLLMENT_QR_TOKEN_PATTERN } from "../../domain/enrollment-qr.config";
import { ENROLLMENT_QR_ERROR_CODES } from "../../domain/enrollment-qr.errors";
import { createEnrollmentQrService } from "../enrollment-qr.service.server";

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const COURSE_DOC = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-01T18:00:00.000Z");

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

const HEAD = actorOf({ role: "DEPENDENCY_HEAD" });

const qrCourseOf = (
	overrides: Partial<EnrollmentQrCourse> = {},
): EnrollmentQrCourse => ({
	id: 10,
	documentId: COURSE_DOC,
	status: "PUBLISHED",
	access: "PUBLIC",
	...overrides,
});

const courseOf = (
	overrides: Partial<EnrollmentCourse> = {},
): EnrollmentCourse => ({
	id: 10,
	documentId: COURSE_DOC,
	dependencyName: "Obras Públicas",
	title: "Seguridad en obra",
	description: null,
	hours: null,
	coverUrl: null,
	modality: "IN_PERSON",
	format: "SCHEDULED",
	completionRule: "ATTENDANCE",
	minAttendance: 80,
	requiresEvaluation: false,
	minPassingGrade: 70,
	access: "PUBLIC",
	status: "PUBLISHED",
	capacity: null,
	enrolledCount: 0,
	enrollmentDeadline: null,
	enrollmentClosedAt: null,
	finishedAt: null,
	sessions: [],
	trainers: [],
	firstSessionAt: new Date("2026-10-20T16:00:00.000Z"),
	lastSessionEndsAt: new Date("2026-10-20T19:00:00.000Z"),
	...overrides,
});

interface HarnessOptions {
	/** Lo que resuelve el token; `null` = token inexistente. */
	qrCourse?: EnrollmentQrCourse | null;
	/** Lo que devuelve `findCourse` con el filtro recibido; `null` = fuera. */
	course?: EnrollmentCourse | null;
	state?: { token: string | null; rotatedAt: Date | null };
}

const createHarness = (options: HarnessOptions = {}) => {
	const log = {
		rotations: [] as { courseId: number; token: string; at: Date }[],
		filters: [] as unknown[],
	};

	const courseRepository = {
		findByEnrollmentQrToken: async (token: string) =>
			token === TOKEN
				? options.qrCourse === undefined
					? qrCourseOf()
					: options.qrCourse
				: null,
		findEnrollmentQrState: async () =>
			options.state ?? { token: null, rotatedAt: null },
		rotateEnrollmentQrToken: async (
			courseId: number,
			token: string,
			at: Date,
		) => {
			log.rotations.push({ courseId, token, at });
		},
	} as unknown as ICradle["courseRepository"];

	const enrollmentRepository = {
		findCourse: async (_documentId: string, filter: unknown) => {
			log.filters.push(filter);
			return options.course === undefined ? courseOf() : options.course;
		},
	} as unknown as ICradle["enrollmentRepository"];

	const groupRepository = {
		findGroupIdsOfUser: async () => [],
	} as unknown as ICradle["groupRepository"];

	const service = createEnrollmentQrService({
		courseRepository,
		enrollmentRepository,
		groupRepository,
		clock: { now: () => NOW },
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

describe("resolve", () => {
	test("lleva al curso de un token vigente", async () => {
		const { service } = createHarness();

		const result = await service.resolve(TOKEN, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: { courseDocumentId: COURSE_DOC },
		});
	});

	test("un token inexistente es un token inválido", async () => {
		const { service } = createHarness({ qrCourse: null });

		expect(errorCodeOf(await service.resolve(TOKEN, actorOf()))).toBe(
			ENROLLMENT_QR_ERROR_CODES.INVALID_TOKEN,
		);
	});

	test.each([
		["pasó a invitación", { access: "INVITATION" as const }],
		["se canceló", { status: "CANCELLED" as const }],
		["finalizó", { status: "FINISHED" as const }],
	])("un curso que %s ya no acepta el QR", async (_, overrides) => {
		const { service, log } = createHarness({ qrCourse: qrCourseOf(overrides) });

		expect(errorCodeOf(await service.resolve(TOKEN, actorOf()))).toBe(
			ENROLLMENT_QR_ERROR_CODES.UNAVAILABLE,
		);
		expect(log.filters).toEqual([]);
	});

	test("un restringido fuera de la audiencia no llega a la ficha", async () => {
		const { service } = createHarness({
			qrCourse: qrCourseOf({ access: "RESTRICTED" }),
			course: null,
		});

		expect(errorCodeOf(await service.resolve(TOKEN, actorOf()))).toBe(
			ENROLLMENT_QR_ERROR_CODES.NOT_IN_AUDIENCE,
		);
	});
});

describe("rotateToken", () => {
	test("guarda un token nuevo con la hora del reloj", async () => {
		const { service, log } = createHarness();

		const result = await service.rotateToken(COURSE_DOC, HEAD);

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.token).toMatch(ENROLLMENT_QR_TOKEN_PATTERN);
		expect(result.data.rotatedAt).toEqual(NOW);
		expect(log.rotations).toEqual([
			{ courseId: 10, token: result.data.token, at: NOW },
		]);
	});

	test("cada rotación genera un token distinto", async () => {
		const { service } = createHarness();

		const first = await service.rotateToken(COURSE_DOC, HEAD);
		const second = await service.rotateToken(COURSE_DOC, HEAD);

		expect(first.success && second.success).toBe(true);
		if (!first.success || !second.success) return;
		expect(first.data.token).not.toBe(second.data.token);
	});

	test("un participante sin alcance no lo genera", async () => {
		const { service, log } = createHarness();

		expect(errorCodeOf(await service.rotateToken(COURSE_DOC, actorOf()))).toBe(
			ENROLLMENT_QR_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(log.rotations).toEqual([]);
	});

	test("un curso fuera de su alcance tampoco", async () => {
		const { service, log } = createHarness({ course: null });

		expect(errorCodeOf(await service.rotateToken(COURSE_DOC, HEAD))).toBe(
			ENROLLMENT_QR_ERROR_CODES.FORBIDDEN_SCOPE,
		);
		expect(log.rotations).toEqual([]);
	});

	test("un curso por invitación no admite QR", async () => {
		const { service, log } = createHarness({
			course: courseOf({ access: "INVITATION" }),
		});

		expect(errorCodeOf(await service.rotateToken(COURSE_DOC, HEAD))).toBe(
			ENROLLMENT_QR_ERROR_CODES.UNAVAILABLE,
		);
		expect(log.rotations).toEqual([]);
	});
});

describe("find", () => {
	test("devuelve el token vigente y si la inscripción está abierta", async () => {
		const rotatedAt = new Date("2026-09-20T18:00:00.000Z");
		const { service } = createHarness({ state: { token: TOKEN, rotatedAt } });

		const result = await service.find(COURSE_DOC, HEAD);

		expect(result).toMatchObject({
			success: true,
			data: { token: TOKEN, rotatedAt, enrollmentOpen: true },
		});
	});

	test("avisa cuando la inscripción ya cerró", async () => {
		const { service } = createHarness({
			course: courseOf({
				enrollmentDeadline: new Date("2026-09-30T00:00:00Z"),
			}),
		});

		const result = await service.find(COURSE_DOC, HEAD);

		expect(result).toMatchObject({
			success: true,
			data: { token: null, enrollmentOpen: false },
		});
	});

	test("el token no se entrega a quien no organiza el curso", async () => {
		const { service } = createHarness();

		expect(errorCodeOf(await service.find(COURSE_DOC, actorOf()))).toBe(
			ENROLLMENT_QR_ERROR_CODES.FORBIDDEN_SCOPE,
		);
	});
});
