import type { JobsOptions } from "bullmq";
import {
	type DispatchableJob,
	JOB_NAMES,
	PROGRESS_RECALC_DELAY_MS,
} from "./queue.config";
import type { JobPayloads } from "./queue.payloads";

/**
 * Determinista por fila e intento: un barrido repetido no duplica el envío, y
 * el siguiente intento de la misma fila sí entra. Sin `:`, que BullMQ usa como
 * separador de sus claves.
 */
export const outboxJobId = (outboxId: number, attempt: number) =>
	`outbox-${outboxId}-${attempt}`;

/**
 * Opciones de `queue.add` por trabajo.
 *
 * El recálculo se agrupa por curso: mientras espera, una edición nueva lo
 * reemplaza y reinicia la espera; mientras corre, la siguiente se guarda y
 * corre al terminar. Nunca hay dos recálculos del mismo curso a la vez, y
 * ninguna edición se queda sin recalcular.
 */
export const jobAddOptions = <N extends DispatchableJob>(
	name: N,
	payload: JobPayloads[N],
): JobsOptions => {
	switch (name) {
		case JOB_NAMES.deliverEmail: {
			const { outboxId, attempt } =
				payload as JobPayloads[typeof JOB_NAMES.deliverEmail];
			return { jobId: outboxJobId(outboxId, attempt) };
		}
		case JOB_NAMES.recalculateProgress: {
			const { courseId } =
				payload as JobPayloads[typeof JOB_NAMES.recalculateProgress];
			return {
				delay: PROGRESS_RECALC_DELAY_MS,
				deduplication: {
					id: `course-${courseId}`,
					replace: true,
					keepLastIfActive: true,
				},
			};
		}
		default:
			return {};
	}
};
