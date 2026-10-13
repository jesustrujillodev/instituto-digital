import type { PrismaClient } from "@prisma/client";
import { describe, expect, test } from "vitest";
import { createSessionRepository } from "../session.repository.server";

describe("deleteOthersOfUser", () => {
	// Remediación (Fase C): al cambiar la contraseña se cierran las demás
	// sesiones de la cuenta, nunca las de otra ni la de quien la cambió.
	test("borra las sesiones del usuario salvo la indicada", async () => {
		const wheres: unknown[] = [];
		const repository = createSessionRepository({
			prisma: {
				session: {
					deleteMany: async (args: { where: unknown }) => {
						wheres.push(args.where);
						return { count: 2 };
					},
				},
			} as unknown as PrismaClient,
		});

		await repository.deleteOthersOfUser(7, "sesion-actual");

		expect(wheres).toEqual([{ userId: 7, id: { not: "sesion-actual" } }]);
	});
});
