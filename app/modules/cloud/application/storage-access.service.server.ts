import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import type { IStorageAccessService } from "../domain/storage-access.service";

type Dependencies = {
	objectReferenceSources: ICradle["objectReferenceSources"];
	logger: ICradle["logger"];
};

export const createStorageAccessService = ({
	objectReferenceSources,
	logger,
}: Dependencies): IStorageAccessService => {
	const run = createOperationRunner(logger.child({ module: "cloud" }));

	return {
		canRead(key, reader) {
			return run("canRead", async () => {
				if (reader.role === "SUPERADMIN") return ok(true);

				// Cada fuente descarta por prefijo sin consultar: una sola fase y,
				// en la práctica, una sola consulta.
				const answers = await Promise.all(
					objectReferenceSources.map((source) => source.canRead(key, reader)),
				);

				return ok(answers.some(Boolean));
			});
		},
	};
};
