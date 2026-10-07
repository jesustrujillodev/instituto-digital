export interface JobFailureRecord {
	queue: string;
	name: string;
	jobId: string;
	payload: unknown;
	error: string;
	attempts: number;
}

/** Trabajos que agotaron sus intentos, guardados en la base. */
export interface IJobFailureRepository {
	record(failure: JobFailureRecord): Promise<void>;
	/** Borra los anteriores a `before`; devuelve cuántos. */
	purgeBefore(before: Date): Promise<number>;
}
