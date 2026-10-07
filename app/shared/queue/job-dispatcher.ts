import type { DispatchableJob, JobName } from "./queue.config";
import type { JobPayloads } from "./queue.payloads";

/** Lo que cada trabajo hace; los arma la composición desde el cradle. */
export type JobHandlers = {
	[N in JobName]: (payload: JobPayloads[N]) => Promise<void>;
};

/**
 * Encola trabajo de fondo para después del commit.
 *
 * Sin cola, o si encolar falla, cada trabajo sigue su política de respaldo
 * (`job-policies.ts`). Solo lanza cuando el trabajo corre en línea con
 * `await` y falla: es el mismo error que lanzaría hoy dentro del caso de uso.
 */
export interface JobDispatcher {
	dispatch<N extends DispatchableJob>(
		name: N,
		payload: JobPayloads[N],
	): Promise<void>;
}

/** Lo único que un dispatcher necesita de BullMQ. */
export interface JobQueues {
	add<N extends DispatchableJob>(
		name: N,
		payload: JobPayloads[N],
	): Promise<void>;
}
