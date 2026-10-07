import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { ENROLLMENT_ERROR_CODES } from "../../domain/enrollment.errors";
import type { MyCourseRecord } from "../../domain/enrollment.types";
import type { OpenEnrollmentRecord } from "../../domain/enrollment-summary.types";
import { createEnrollmentSummaryService } from "../enrollment-summary.service.server";

const NOW = new Date("2026-09-16T18:00:00.000Z");
const LIMITS = { invitations: 5, inProgress: 5, upcoming: 3, toRate: 3 };

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const actorOf = (overrides: Partial<AuthContext> = {}): AuthContext => ({
	userId: 50,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "miguel.sds@instituto.gob.mx",
	role: "USER",
	dependencyId: 4,
	isTrainer: false,
	...overrides,
});

const invitationOf = (title: string): MyCourseRecord => ({
	enrollment: {
		documentId: `e-${title}`,
		origin: "INVITATION",
		status: "INVITED",
		result: "PENDING",
		removed: false,
		withdrawnAt: null,
	},
	course: {
		id: 7,
		documentId: `c-${title}`,
		dependencyName: "SEDESOL",
		title,
		description: null,
		hours: null,
		coverUrl: null,
		modality: "IN_PERSON",
		format: "SCHEDULED",
		completionRule: "ATTENDANCE",
		minAttendance: 80,
		requiresEvaluation: false,
		minPassingGrade: 70,
		access: "INVITATION",
		status: "PUBLISHED",
		capacity: null,
		enrolledCount: 0,
		enrollmentDeadline: null,
		enrollmentClosedAt: null,
		finishedAt: null,
		sessions: [],
		trainers: [],
		firstSessionAt: new Date("2026-09-20T16:00:00.000Z"),
		lastSessionEndsAt: null,
	},
	outcome: {
		grade: null,
		completed: false,
		progressPercent: 0,
		contentCompletedAt: null,
		attendedSessions: 0,
		myRating: null,
		certificate: null,
	},
});

const openOf = (
	documentId: string,
): OpenEnrollmentRecord & { invited: number } => ({
	id: 1,
	documentId,
	title: "Excel básico",
	format: "SCHEDULED",
	capacity: 20,
	enrollmentDeadline: null,
	firstSessionAt: new Date("2026-10-16T18:00:00.000Z"),
	enrolled: 12,
	invited: 0,
});

const createHarness = (
	options: {
		mine?: MyCourseRecord[] | Error;
		open?: (OpenEnrollmentRecord & { invited: number })[];
	} = {},
) => {
	const calls = {
		mine: [] as number[],
		open: [] as Record<string, unknown>[],
	};

	const enrollmentRepository = {
		findMine: async (userId: number) => {
			calls.mine.push(userId);
			if (options.mine instanceof Error) throw options.mine;
			return options.mine ?? [];
		},
	} as unknown as ICradle["enrollmentRepository"];

	const enrollmentSummaryRepository = {
		findOpenCourses: async (params: Record<string, unknown>) => {
			calls.open.push(params);
			return options.open ?? [];
		},
	} as unknown as ICradle["enrollmentSummaryRepository"];

	const service = createEnrollmentSummaryService({
		enrollmentRepository,
		enrollmentSummaryRepository,
		clock: { now: () => NOW },
		logger: silentLogger,
	});

	return { service, calls };
};

describe("summarizeMine", () => {
	test("resume las inscripciones de quien consulta", async () => {
		const { service, calls } = createHarness({
			mine: [invitationOf("Ética pública")],
		});

		const result = await service.summarizeMine(actorOf(), LIMITS);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(calls.mine).toEqual([50]);
		expect(result.data.invitations).toEqual([
			expect.objectContaining({ title: "Ética pública", closesSoon: true }),
		]);
		expect(result.data.counts.invitations).toBe(1);
	});

	test("quien no puede cursar recibe NOT_ELIGIBLE sin tocar la base", async () => {
		const { service, calls } = createHarness();

		const result = await service.summarizeMine(
			actorOf({ role: "SUPERADMIN", dependencyId: null }),
			LIMITS,
		);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(ENROLLMENT_ERROR_CODES.NOT_ELIGIBLE);
		expect(calls.mine).toEqual([]);
	});

	test("un fallo del repositorio llega como error inesperado", async () => {
		const { service } = createHarness({
			mine: new Error("connection refused"),
		});

		const result = await service.summarizeMine(actorOf(), LIMITS);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(RESPONSE_ERROR_CODES.UNEXPECTED);
	});
});

describe("summarizeOpen", () => {
	test("el titular lee los cursos de su dependencia", async () => {
		const { service, calls } = createHarness({
			open: [openOf("a"), openOf("b"), openOf("c")],
		});

		const result = await service.summarizeOpen(
			actorOf({ role: "DEPENDENCY_HEAD", dependencyId: 3 }),
			{ limit: 2 },
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(calls.open[0]).toMatchObject({
			filter: { dependencyId: 3 },
			now: NOW,
		});
		expect(result.data.courses).toHaveLength(2);
		expect(result.data.total).toBe(3);
	});

	test("el capacitador interno solo lee los cursos que creó", async () => {
		const { service, calls } = createHarness();

		await service.summarizeOpen(actorOf({ isTrainer: true }), { limit: 5 });

		expect(calls.open[0]).toMatchObject({
			filter: { dependencyId: 4, createdById: 50 },
		});
	});

	test("quien no organiza recibe FORBIDDEN_SCOPE sin tocar la base", async () => {
		const { service, calls } = createHarness();

		const result = await service.summarizeOpen(actorOf(), { limit: 5 });

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(ENROLLMENT_ERROR_CODES.FORBIDDEN_SCOPE);
		expect(calls.open).toEqual([]);
	});
});
