import type { Role } from "@/shared/rules/atoms.rules";

export const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const GROUP_ID = "22222222-2222-4222-8222-222222222222";

export interface ActorOptions {
	role?: Role;
	isTrainer?: boolean;
	dependencyId?: number | null;
}

export const authPayloadOf = (options: ActorOptions = {}) => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 7,
	email: "miguel.sds@instituto.gob.mx",
	role: options.role ?? "USER",
	dependencyId: options.dependencyId === undefined ? 4 : options.dependencyId,
	isTrainer: options.isTrainer ?? false,
	iat: 1_800_000_000,
});

export const okReply = <T>(data: T) => ({
	success: true as const,
	data,
	timestamp: new Date().toISOString(),
});

export const failReply = (code: string, details?: Record<string, unknown>) => ({
	success: false as const,
	error: { code, message: "técnico", ...(details && { details }) },
	timestamp: new Date().toISOString(),
});

export const getRequest = (path: string) =>
	new Request(`https://app.example.com${path}`);

export const postRequest = (
	path: string,
	fields: Record<string, string | string[]>,
) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		for (const entry of Array.isArray(value) ? value : [value]) {
			body.append(key, entry);
		}
	}

	return new Request(`https://app.example.com${path}`, {
		method: "POST",
		body,
	});
};
