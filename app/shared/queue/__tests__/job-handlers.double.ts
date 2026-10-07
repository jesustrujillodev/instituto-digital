import type { JobHandlers } from "../job-dispatcher";
import { JOB_NAMES } from "../queue.config";

/** Handlers que solo anotan qué corrió; con `fails`, todos lanzan. */
export const createHandlersDouble = (options: { fails?: boolean } = {}) => {
	const ran: string[] = [];
	const handler = (name: string) => async () => {
		ran.push(name);
		if (options.fails) throw new Error(`${name} falló`);
	};
	const handlers = Object.fromEntries(
		Object.values(JOB_NAMES).map((name) => [name, handler(name)]),
	) as unknown as JobHandlers;
	return { handlers, ran };
};
