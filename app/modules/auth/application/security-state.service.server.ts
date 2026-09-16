import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import type { LockdownDto } from "../domain/auth.types";
import type {
	PublicSecurityState,
	SecurityStateService,
} from "../domain/security-state.service";

type Dependencies = {
	securityStateRepository: ICradle["securityStateRepository"];
	logger: ICradle["logger"];
};

/** Proyecta el snapshot completo a lo que puede salir del servidor. */
const toPublicState = (snapshot: {
	lockdownAt: Date | null;
	lockdownScope: PublicSecurityState["lockdownScope"];
	lockdownBy: number | null;
}): PublicSecurityState => ({
	lockdownAt: snapshot.lockdownAt,
	lockdownScope: snapshot.lockdownScope,
	lockdownBy: snapshot.lockdownBy,
});

export const createSecurityStateService = ({
	securityStateRepository,
	logger,
}: Dependencies): SecurityStateService => {
	const log = logger.child({ module: "security-state" });
	const run = createOperationRunner(log);

	return {
		getState() {
			return run("getState", async () =>
				ok(toPublicState(await securityStateRepository.get())),
			);
		},

		lockdown(dto: LockdownDto, by: number) {
			return run("lockdown", async () => {
				const { purgedSessions } = await securityStateRepository.lockdown({
					scope: dto.scope,
					reason: dto.reason,
					by,
				});

				// Es la acción más destructiva del sistema: la que explica cualquier
				// anomalía posterior (docs/auth/02 §B.4).
				log.warn("platform lockdown activated", {
					scope: dto.scope,
					by,
					purgedSessions,
				});

				return ok({ purgedSessions });
			});
		},

		lift() {
			return run("lift", async () => {
				await securityStateRepository.lift();

				log.warn("platform lockdown lifted");

				return ok(null);
			});
		},
	};
};

export type { SecurityStateService };
