import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createGroupRepository } from "../groups.repository.server";

const membership = (
	groupId: number,
	groupDependencyId: number,
	userDependencyId: number | null,
) => ({
	groupId,
	group: { dependencyId: groupDependencyId },
	user: { dependencyId: userDependencyId },
});

describe("findGroupIdsOfUser", () => {
	// §6.4: quien se traslada sigue en la lista del grupo de su dependencia
	// anterior, pero ese grupo ya no le abre cursos restringidos.
	test("omite los grupos de una dependencia que ya no es la suya", async () => {
		const calls: Record<string, unknown>[] = [];
		const repository = createGroupRepository({
			prisma: {
				groupMember: {
					findMany: async (args: Record<string, unknown>) => {
						calls.push(args);
						return [membership(1, 4, 4), membership(2, 3, 4)];
					},
				},
			} as unknown as ICradle["prisma"],
		});

		await expect(repository.findGroupIdsOfUser(50)).resolves.toEqual([1]);
		expect(calls[0]?.where).toEqual({
			userId: 50,
			group: { archivedAt: null },
		});
	});
});
