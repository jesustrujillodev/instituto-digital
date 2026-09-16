import type { Logger } from "@/shared/logging/logger";
import { fail, isUnexpected, toResponseError } from "./response.helpers";
import type { AppResponse } from "./response.types";

/**
 * Ejecuta un caso de uso y garantiza que devuelve el envelope pase lo que pase.
 *
 * Es la pieza que permite a los servicios seguir escribiéndose con `throw`
 * (los repositorios lanzan errores de dominio, valibot lanza ValiError) sin que
 * ese `throw` escape a la capa de rutas: aquí se captura, se tipa y se convierte
 * en `FailResponse`.
 *
 * También centraliza el logging que antes se copiaba en cada action: lo
 * inesperado se registra a nivel `error` con su mensaje real, y lo conocido a
 * `debug` solo con el código —el mensaje ya viaja en la respuesta.
 */
export type OperationRunner = <T>(
	operation: string,
	execute: () => Promise<AppResponse<T>>,
) => Promise<AppResponse<T>>;

/**
 * @param logger Logger del contenedor; conviene pasarlo ya derivado
 *   (`logger.child({ module: "users" })`) para que las entradas lleven el módulo.
 *
 * @example
 * const run = createOperationRunner(logger.child({ module: "users" }));
 * // ...
 * async archive(documentId) {
 *   return run("archive", async () => ok(await userRepository.archive(documentId)));
 * }
 */
export const createOperationRunner =
	(logger: Logger): OperationRunner =>
	async (operation, execute) => {
		try {
			return await execute();
		} catch (error) {
			const responseError = toResponseError(error);

			if (isUnexpected(responseError)) {
				logger.error(`unexpected error in ${operation}`, {
					message: error instanceof Error ? error.message : String(error),
					...(error instanceof Error && error.stack
						? { stack: error.stack }
						: {}),
				});
			} else {
				logger.debug(`${operation} failed`, { code: responseError.code });
			}

			return fail(responseError);
		}
	};
