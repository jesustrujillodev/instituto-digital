import { type DispatchableJob, JOB_NAMES } from "./queue.config";

/**
 * Qué pasa con un trabajo cuando no hay cola o no se pudo encolar.
 *
 * - `skip`: otro mecanismo lo recoge (el correo sigue en el outbox).
 * - `await`: corre ya, y su error es el del caso de uso, como antes de la cola.
 * - `background`: corre ya sin esperarlo; un fallo solo se registra.
 */
export type FallbackPolicy = "skip" | "await" | "background";

export const FALLBACK_POLICY: Record<DispatchableJob, FallbackPolicy> = {
	[JOB_NAMES.deliverEmail]: "skip",
	[JOB_NAMES.recalculateProgress]: "await",
	[JOB_NAMES.deleteObject]: "background",
};
