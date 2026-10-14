import { afterAll, describe, expect, test } from "vitest";
import {
	createDbFixtures,
	raceTransactions,
} from "@/core/__tests__/db.fixtures";
import { prisma, runInTransaction } from "@/core/db.server";
import { createUserRepository } from "../users.repository.server";

const repository = createUserRepository({ prisma });
const fixtures = createDbFixtures();

describe("bloqueo de los superadministradores activos contra Postgres", () => {
	afterAll(() => fixtures.cleanup());

	test("devuelve los superadministradores activos y deja fuera a los archivados", async () => {
		const active = await fixtures.user({ role: "SUPERADMIN" });
		const archived = await fixtures.user({ role: "SUPERADMIN" });
		await prisma.user.update({
			where: { id: archived.id },
			data: { archivedAt: new Date() },
		});

		const ids = await runInTransaction(() =>
			repository.lockActiveSuperadminIds(),
		);

		expect(ids).toContain(active.id);
		expect(ids).not.toContain(archived.id);
	});

	test("quien espera el bloqueo ya no ve al que la otra transacción archivó", async () => {
		const first = await fixtures.user({ role: "SUPERADMIN" });
		let seenBySecond: number[] = [];

		const order = await raceTransactions(
			(hold) =>
				runInTransaction(async () => {
					await repository.lockActiveSuperadminIds();
					await prisma.user.update({
						where: { id: first.id },
						data: { archivedAt: new Date() },
					});
					await hold();
				}),
			async () => {
				seenBySecond = await runInTransaction(() =>
					repository.lockActiveSuperadminIds(),
				);
			},
		);

		expect(order).toEqual(["released", "first", "second"]);
		expect(seenBySecond).not.toContain(first.id);
	});
});
