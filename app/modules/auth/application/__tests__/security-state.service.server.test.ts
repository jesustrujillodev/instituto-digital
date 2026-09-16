import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type { SecuritySnapshot } from "../../domain/security-state.repository";
import { createSecurityStateService } from "../security-state.service.server";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const snapshotOf = (
	overrides: Partial<SecuritySnapshot> = {},
): SecuritySnapshot => ({
	tokensValidAfter: new Date(0),
	lockdownAt: null,
	lockdownScope: null,
	lockdownReason: "secreto interno",
	lockdownBy: null,
	userTokensValidAfter: new Map(),
	readAt: new Date(),
	...overrides,
});

const createHarness = () => {
	const calls = { lockdown: 0, lift: 0, tokensValidAfterTouched: false };

	const securityStateRepository = {
		get: async () => snapshotOf(),
		lockdown: async (input: { scope: string }) => {
			calls.lockdown += 1;
			return {
				snapshot: snapshotOf({
					lockdownAt: new Date(),
					lockdownScope: input.scope as never,
				}),
				purgedSessions: 3,
			};
		},
		lift: async () => {
			calls.lift += 1;
			return snapshotOf();
		},
	} as unknown as ICradle["securityStateRepository"];

	const service = createSecurityStateService({
		securityStateRepository,
		logger: silentLogger,
	});

	return { service, calls };
};

describe("createSecurityStateService", () => {
	test("lockdown invokes the transactional repository method ONCE and returns the count", async () => {
		const { service, calls } = createHarness();

		const result = await service.lockdown(
			{ scope: "all", confirmation: "CERRAR" },
			1,
		);

		expect(result.success).toBe(true);
		if (result.success) expect(result.data.purgedSessions).toBe(3);
		expect(calls.lockdown).toBe(1);
	});

	test("lift calls the repository's lift and nothing else", async () => {
		const { service, calls } = createHarness();

		const result = await service.lift();

		expect(result.success).toBe(true);
		expect(calls.lift).toBe(1);
		expect(calls.lockdown).toBe(0);
	});

	test("getState never exposes lockdownReason", async () => {
		const { service } = createHarness();

		const result = await service.getState();

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).not.toHaveProperty("lockdownReason");
		}
	});
});
