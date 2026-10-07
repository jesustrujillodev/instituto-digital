import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { createOperationsService } from "../operations.service.server";

const NOW = new Date("2026-10-07T18:00:00.000Z");

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const createHarness = (options: { failing?: boolean } = {}) => {
	const calls = {
		stuckBefore: [] as Date[],
		since: [] as Date[],
		emailPages: [] as unknown[],
		jobPages: [] as unknown[],
	};

	const notificationRepository = {
		countFailed: async () => {
			if (options.failing) throw new Error("connection refused");
			return 3;
		},
		countStuck: async (before: Date) => {
			calls.stuckBefore.push(before);
			return 1;
		},
		findFailed: async (page: unknown) => {
			calls.emailPages.push(page);
			return [
				{
					id: 41,
					template: "ENROLLMENT_CONFIRMED",
					recipient: "ana@instituto.gob.mx",
					attempts: 5,
					lastError: "SMTP 550",
					createdAt: NOW,
				},
			];
		},
	} as unknown as ICradle["notificationRepository"];

	const jobFailureRepository = {
		countSince: async (since: Date) => {
			calls.since.push(since);
			return 2;
		},
		count: async () => 1,
		findPage: async (page: unknown) => {
			calls.jobPages.push(page);
			return [
				{
					id: 7,
					queue: "certificates",
					name: "issue",
					jobId: "j-7",
					attempts: 3,
					error: "timeout",
					failedAt: NOW,
				},
			];
		},
	} as unknown as ICradle["jobFailureRepository"];

	const service = createOperationsService({
		notificationRepository,
		jobFailureRepository,
		clock: { now: () => NOW },
		logger: silentLogger,
	});

	return { service, calls };
};

describe("summarizeHealth", () => {
	test("cuenta fallidos, atascados y trabajos de la última semana", async () => {
		const { service, calls } = createHarness();

		const result = await service.summarizeHealth();

		expect(result).toMatchObject({
			success: true,
			data: {
				failedEmails: 3,
				stuckEmails: 1,
				recentJobFailures: 2,
				windowDays: 7,
			},
		});
		expect(calls.stuckBefore).toEqual([new Date("2026-10-07T17:30:00.000Z")]);
		expect(calls.since).toEqual([new Date("2026-09-30T18:00:00.000Z")]);
	});

	test("un fallo de la base llega como error inesperado", async () => {
		const { service } = createHarness({ failing: true });

		const result = await service.summarizeHealth();

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(RESPONSE_ERROR_CODES.UNEXPECTED);
	});
});

describe("listFailedEmails", () => {
	test("lee la página pedida y la pagina con el total", async () => {
		const { service, calls } = createHarness();

		const result = await service.listFailedEmails({ page: 2, pageSize: 10 });

		expect(calls.emailPages).toEqual([{ skip: 10, take: 10 }]);
		expect(result).toMatchObject({
			success: true,
			data: [{ id: "41", recipient: "ana@instituto.gob.mx" }],
			pagination: { page: 2, pageSize: 10, total: 3, totalPages: 1 },
		});
	});
});

describe("listJobFailures", () => {
	test("lee la página pedida y la pagina con el total", async () => {
		const { service, calls } = createHarness();

		const result = await service.listJobFailures({ page: 1, pageSize: 20 });

		expect(calls.jobPages).toEqual([{ skip: 0, take: 20 }]);
		expect(result).toMatchObject({
			success: true,
			data: [{ id: "7", queue: "certificates" }],
			pagination: { total: 1 },
		});
	});
});
