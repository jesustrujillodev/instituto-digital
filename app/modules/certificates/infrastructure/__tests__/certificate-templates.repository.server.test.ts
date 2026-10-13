import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { createCertificateTemplateRepository } from "../certificate-templates.repository.server";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

describe("findOwnership", () => {
	// Para el proxy: decide quién ve la plantilla sin leer su diseño.
	test("lee solo el alcance y la dependencia", async () => {
		const asked: unknown[] = [];
		const repository = createCertificateTemplateRepository({
			prisma: {
				certificateTemplate: {
					findUnique: async (args: unknown) => {
						asked.push(args);
						return { scope: "DEPENDENCY", dependencyId: 3 };
					},
				},
			} as unknown as ICradle["prisma"],
			logger: silentLogger,
		});

		expect(await repository.findOwnership("plantilla-1")).toEqual({
			scope: "DEPENDENCY",
			dependencyId: 3,
		});
		expect(asked).toEqual([
			{
				where: { documentId: "plantilla-1" },
				select: { scope: true, dependencyId: true },
			},
		]);
	});
});
