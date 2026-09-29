import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { isThemeMode, resolveThemeMode } from "../domain/theme.rules";
import type { IThemeService } from "../domain/theme.service";

type Dependencies = {
	themeRepository: ICradle["themeRepository"];
	logger: ICradle["logger"];
};

export const createThemeService = ({
	themeRepository,
	logger,
}: Dependencies): IThemeService => {
	const log = logger.child({ module: "theme" });
	const run = createOperationRunner(log);

	return {
		resolveMode({ cookieMode, userId }) {
			return run("resolveMode", async () => {
				// La cookie decide sola en el caso normal. Solo se baja a la base
				// cuando hay sesión y NO hay cookie —dispositivo nuevo o cookies
				// borradas—, así que esto no es una consulta por petición.
				let userMode: unknown = null;

				if (userId !== null && !isThemeMode(cookieMode)) {
					try {
						userMode = await themeRepository.findModeByUserId(userId);
					} catch (error) {
						// El modo NO es una decisión de seguridad: si la base no responde
						// se sirve el modo por defecto, no se tumba la página entera.
						log.warn("theme preference read failed — falling back", {
							message: error instanceof Error ? error.message : String(error),
						});
					}
				}

				return ok(resolveThemeMode(cookieMode, userMode));
			});
		},

		setMode({ userId, mode }) {
			return run("setMode", async () => {
				// Anónimo: la cookie del adaptador ES la persistencia. No hay cuenta.
				if (userId !== null) {
					await themeRepository.saveMode(userId, mode);
				}

				return ok(null);
			});
		},
	};
};
