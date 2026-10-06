import { AsyncLocalStorage } from "node:async_hooks";

export type AfterCommitTask = () => Promise<void>;

/**
 * Trabajo que solo debe ocurrir si la transacción en curso se confirma, como
 * invalidar una caché: hacerlo antes del commit dejaría que otra petición
 * volviera a cachear el dato viejo, y hacerlo en un rollback no hace falta.
 */
export const createAfterCommitQueue = () => {
	const storage = new AsyncLocalStorage<AfterCommitTask[]>();

	return {
		/** Dentro de una transacción la encola; fuera de ella, la ejecuta ya. */
		async afterCommit(task: AfterCommitTask): Promise<void> {
			const queue = storage.getStore();
			if (queue) queue.push(task);
			else await task();
		},

		/**
		 * Envuelve la transacción más externa: al confirmarse ejecuta lo encolado;
		 * si lanza, lo descarta. Una anidada se suma a la cola de la de fuera.
		 */
		async track<T>(transaction: () => Promise<T>): Promise<T> {
			if (storage.getStore()) return transaction();

			const queue: AfterCommitTask[] = [];
			const result = await storage.run(queue, transaction);
			await Promise.allSettled(queue.map((task) => task()));
			return result;
		},
	};
};
