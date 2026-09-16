import type { Role } from "@/shared/rules/atoms.rules";

export const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export interface ActorOptions {
	/** `null` = petición anónima. */
	role?: Role | null;
	isTrainer?: boolean;
	dependencyId?: number | null;
}

/** Payload verificado tal como lo deja el middleware en el contexto. */
export const authPayloadOf = (options: ActorOptions = {}) =>
	options.role === null
		? null
		: {
				sub: "99999999-9999-4999-8999-999999999999",
				userId: 7,
				email: "titular@instituto.gob.mx",
				role: options.role ?? "DEPENDENCY_HEAD",
				dependencyId:
					options.dependencyId === undefined ? 3 : options.dependencyId,
				isTrainer: options.isTrainer ?? false,
				iat: 1_800_000_000,
			};

export const okReply = <T>(data: T) => ({
	success: true as const,
	data,
	timestamp: new Date().toISOString(),
});

export const failReply = (code: string) => ({
	success: false as const,
	error: { code, message: "técnico" },
	timestamp: new Date().toISOString(),
});

export const postRequest = (path: string, fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);

	return new Request(`https://app.example.com${path}`, {
		method: "POST",
		body,
	});
};
