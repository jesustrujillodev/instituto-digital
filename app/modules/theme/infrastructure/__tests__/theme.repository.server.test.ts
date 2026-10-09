import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { THEME_ERROR_CODES } from "../../domain/theme.errors";
import { createThemeRepository } from "../theme.repository.server";

const repositoryWith = (user: {
	findUnique?: () => Promise<unknown>;
	update?: (args: unknown) => Promise<unknown>;
}) =>
	createThemeRepository({
		prisma: { user } as unknown as ICradle["prisma"],
	});

describe("themeRepository.findModeByUserId", () => {
	test("devuelve el modo guardado si el dominio lo reconoce", async () => {
		const repository = repositoryWith({
			findUnique: async () => ({ themeMode: "dark" }),
		});

		expect(await repository.findModeByUserId(7)).toBe("dark");
	});

	test("un valor desconocido o una cuenta inexistente cuentan como sin preferencia", async () => {
		const unknown = repositoryWith({
			findUnique: async () => ({ themeMode: "sepia" }),
		});
		const missing = repositoryWith({ findUnique: async () => null });

		expect(await unknown.findModeByUserId(7)).toBeNull();
		expect(await missing.findModeByUserId(7)).toBeNull();
	});
});

describe("themeRepository.saveMode", () => {
	test("escribe el modo en la cuenta", async () => {
		const calls: unknown[] = [];
		const repository = repositoryWith({
			update: async (args) => {
				calls.push(args);
				return {};
			},
		});

		await repository.saveMode(7, "light");

		expect(calls).toEqual([{ where: { id: 7 }, data: { themeMode: "light" } }]);
	});

	test("si la cuenta ya no existe, lanza PREFERENCE_NOT_SAVED", async () => {
		const repository = repositoryWith({
			update: async () => {
				throw new Prisma.PrismaClientKnownRequestError("no existe", {
					code: "P2025",
					clientVersion: "7.9.0",
				});
			},
		});

		await expect(repository.saveMode(7, "light")).rejects.toMatchObject({
			code: THEME_ERROR_CODES.PREFERENCE_NOT_SAVED,
		});
	});
});
