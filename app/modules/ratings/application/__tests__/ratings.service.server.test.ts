import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import {
	RATING_ERROR_CODES,
	RatingAlreadyRatedError,
} from "../../domain/rating.errors";
import type { RatingEligibility, RatingWrite } from "../../domain/rating.types";
import { createRatingService } from "../ratings.service.server";

const COURSE_DOC = "11111111-1111-4111-8111-111111111111";

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
	email: "diana.sop@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	...overrides,
});

const eligibilityOf = (
	overrides: Partial<RatingEligibility> = {},
): RatingEligibility => ({
	courseId: 10,
	courseStatus: "FINISHED",
	enrollmentStatus: "ENROLLED",
	attendedSessions: 2,
	alreadyRated: false,
	...overrides,
});

const createHarness = (
	eligibility: RatingEligibility | null = eligibilityOf(),
	options: { createFails?: Error } = {},
) => {
	const calls = {
		created: [] as RatingWrite[],
		wheres: [] as unknown[],
	};

	const ratingRepository = {
		findEligibility: async () => eligibility,
		create: async (data: RatingWrite) => {
			if (options.createFails) throw options.createFails;
			calls.created.push(data);
		},
		findCourseId: async (_documentId: string, where: object) => {
			calls.wheres.push(where);
			return "id" in where ? null : 10;
		},
		summarizeCourse: async () => ({ average: 4, count: 1, comments: [] }),
	} as unknown as ICradle["ratingRepository"];

	const service = createRatingService({
		ratingRepository,
		logger: silentLogger,
	});

	return { service, calls };
};

describe("ratingService.rate", () => {
	test("guarda la valoración de quien asistió a un curso finalizado", async () => {
		const { service, calls } = createHarness();

		const result = await service.rate(
			COURSE_DOC,
			{ score: 5, comment: "Muy útil" },
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.created).toEqual([
			{ courseId: 10, userId: 50, score: 5, comment: "Muy útil" },
		]);
	});

	test("sin asistencia no puede valorar", async () => {
		const { service, calls } = createHarness(
			eligibilityOf({ attendedSessions: 0 }),
		);

		const result = await service.rate(
			COURSE_DOC,
			{ score: 3, comment: null },
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: RATING_ERROR_CODES.NOT_ELIGIBLE },
		});
		expect(calls.created).toEqual([]);
	});

	test("una segunda valoración se rechaza aunque llegue a la vez", async () => {
		const leido = createHarness(eligibilityOf({ alreadyRated: true }));
		const carrera = createHarness(eligibilityOf(), {
			createFails: new RatingAlreadyRatedError(),
		});

		for (const { service } of [leido, carrera]) {
			const result = await service.rate(
				COURSE_DOC,
				{ score: 4, comment: null },
				actorOf(),
			);

			expect(result).toMatchObject({
				success: false,
				error: { code: RATING_ERROR_CODES.ALREADY_RATED },
			});
		}
	});

	test("un curso inexistente responde su código", async () => {
		const { service } = createHarness(null);

		const result = await service.rate(
			COURSE_DOC,
			{ score: 4, comment: null },
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: RATING_ERROR_CODES.COURSE_NOT_FOUND },
		});
	});

	test("un capacitador externo no valora", async () => {
		const { service } = createHarness();

		const result = await service.rate(
			COURSE_DOC,
			{ score: 4, comment: null },
			actorOf({ dependencyId: null, isTrainer: true }),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: RATING_ERROR_CODES.NOT_ELIGIBLE },
		});
	});
});

describe("ratingService.findCourseSummary", () => {
	test("la dependencia organizadora ve el resumen", async () => {
		const { service, calls } = createHarness();

		const result = await service.findCourseSummary(
			COURSE_DOC,
			actorOf({ role: "DEPENDENCY_HEAD" }),
		);

		expect(result).toMatchObject({ success: true, data: { average: 4 } });
		expect(calls.wheres).toEqual([{ OR: [{ dependencyId: 3 }] }]);
	});

	test("un participante no consulta valoraciones ajenas", async () => {
		const { service, calls } = createHarness();

		const result = await service.findCourseSummary(COURSE_DOC, actorOf());

		expect(result).toMatchObject({
			success: false,
			error: { code: RATING_ERROR_CODES.COURSE_NOT_FOUND },
		});
		expect(calls.wheres).toEqual([]);
	});
});
