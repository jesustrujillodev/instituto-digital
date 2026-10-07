import type { Prisma } from "@prisma/client";
import type { ICradle } from "../di/container.types";
import type { IJobFailureRepository } from "./job-failure.port";

/** Tope del texto del error: un stack completo no aporta y crece sin límite. */
const ERROR_MAX_LENGTH = 2_000;

export const createJobFailureRepository = ({
	prisma,
}: {
	prisma: ICradle["prisma"];
}): IJobFailureRepository => ({
	async record(failure) {
		await prisma.jobFailure.create({
			data: {
				...failure,
				payload: failure.payload as Prisma.InputJsonValue,
				error: failure.error.slice(0, ERROR_MAX_LENGTH),
			},
		});
	},

	async purgeBefore(before) {
		const { count } = await prisma.jobFailure.deleteMany({
			where: { failedAt: { lt: before } },
		});
		return count;
	},
});
