export interface JobFailureRecord {
	queue: string;
	name: string;
	jobId: string;
	payload: unknown;
	error: string;
	attempts: number;
}

/** Un trabajo fallido sin su `payload`, que puede llevar datos personales. */
export interface JobFailureEntry {
	id: number;
	queue: string;
	name: string;
	jobId: string;
	attempts: number;
	error: string;
	failedAt: Date;
}

/** Trabajos que agotaron sus intentos, guardados en la base. */
export interface IJobFailureRepository {
	record(failure: JobFailureRecord): Promise<void>;
	/** Borra los anteriores a `before`; devuelve cuántos. */
	purgeBefore(before: Date): Promise<number>;
	/** Del más reciente al más viejo. */
	findPage(page: { skip: number; take: number }): Promise<JobFailureEntry[]>;
	count(): Promise<number>;
	countSince(since: Date): Promise<number>;
}
