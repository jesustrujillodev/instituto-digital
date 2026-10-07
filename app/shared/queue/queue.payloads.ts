import * as v from "valibot";
import { JOB_NAMES, type JobName } from "./queue.config";

const id = v.pipe(v.number(), v.integer(), v.minValue(1));
const empty = v.object({});

/**
 * Solo identificadores: el worker relee la base, que puede haber cambiado
 * desde que se encoló. Lo que viaja también se valida al salir de la cola.
 */
export const JOB_PAYLOAD_SCHEMAS = {
	[JOB_NAMES.deliverEmail]: v.object({ outboxId: id, attempt: v.number() }),
	[JOB_NAMES.sweepOutbox]: empty,
	[JOB_NAMES.recalculateProgress]: v.object({
		courseId: id,
		actorId: id,
		at: v.pipe(v.string(), v.isoTimestamp()),
	}),
	[JOB_NAMES.deleteObject]: v.object({
		bucket: v.pipe(v.string(), v.minLength(1)),
		key: v.pipe(v.string(), v.minLength(1)),
	}),
	[JOB_NAMES.purgeExpiredSessions]: empty,
	[JOB_NAMES.purgeSentEmails]: empty,
	[JOB_NAMES.purgeJobFailures]: empty,
} satisfies Record<JobName, v.GenericSchema>;

export type JobPayloads = {
	[N in JobName]: v.InferOutput<(typeof JOB_PAYLOAD_SCHEMAS)[N]>;
};

export const parseJobPayload = <N extends JobName>(
	name: N,
	data: unknown,
): JobPayloads[N] => v.parse(JOB_PAYLOAD_SCHEMAS[name], data) as JobPayloads[N];

export const isJobName = (name: string): name is JobName =>
	Object.hasOwn(JOB_PAYLOAD_SCHEMAS, name);
