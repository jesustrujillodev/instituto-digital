import { describe, expect, test } from "vitest";
import {
	type ActorOptions,
	authPayloadOf,
	COURSE_ID,
	GROUP_ID,
	getRequest,
	okReply,
	postRequest,
} from "../../__tests__/route-harness";
import { action } from "../index.action";
import { loader } from "../index.loader";

type ActionArgs = Parameters<typeof action>[0];
type LoaderArgs = Parameters<typeof loader>[0];

const PATH = `/dashboard/cursos/${COURSE_ID}/inscripciones`;

const createHarness = (options: ActorOptions & { isOpen?: boolean } = {}) => {
	const calls: { method: string; args: unknown[] }[] = [];
	const context = {
		authPayload: authPayloadOf({ role: "DEPENDENCY_HEAD", ...options }),
		enrollmentService: {
			listRoster: async () =>
				okReply({
					course: { documentId: COURSE_ID, isOpen: options.isOpen ?? true },
					entries: [],
				}),
			listRosterOptions: async (...args: unknown[]) => {
				calls.push({ method: "listRosterOptions", args });
				return okReply({ candidates: [], groups: [] });
			},
			invite: async (...args: unknown[]) => {
				calls.push({ method: "invite", args });
				return okReply({ affected: 2, skipped: 1 });
			},
			assign: async (...args: unknown[]) => {
				calls.push({ method: "assign", args });
				return okReply({ affected: 1, skipped: 0 });
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

describe("inscripciones loader", () => {
	test("un participante sin perfil recibe 403", async () => {
		const { context } = createHarness({ role: "USER" });

		const thrown = await loader({
			request: getRequest(PATH),
			context,
			params: { documentId: COURSE_ID },
		} as unknown as LoaderArgs).catch((error) => error);

		expect(thrown.init.status).toBe(403);
	});

	test("con la inscripción cerrada no ofrece invitar ni asignar", async () => {
		const { context, calls } = createHarness({ isOpen: false });

		const { data } = await loader({
			request: getRequest(PATH),
			context,
			params: { documentId: COURSE_ID },
		} as unknown as LoaderArgs);

		expect(data.options).toBeNull();
		expect(calls).toHaveLength(0);
	});

	test("un capacitador interno entra a los cursos que creó", async () => {
		const { context, calls } = createHarness({ role: "USER", isTrainer: true });

		const { data } = await loader({
			request: getRequest(`${PATH}?persona=ana`),
			context,
			params: { documentId: COURSE_ID },
		} as unknown as LoaderArgs);

		expect(data.options).toEqual({ candidates: [], groups: [] });
		expect(calls[0]?.args[1]).toBe("ana");
	});
});

describe("inscripciones action", () => {
	test("invitar a un grupo resume invitados y omitidos", async () => {
		const { context, calls } = createHarness();

		const result = await action({
			request: postRequest(PATH, {
				intent: "invite",
				groupDocumentIds: GROUP_ID,
			}),
			context,
			params: { documentId: COURSE_ID },
		} as unknown as ActionArgs);

		expect(result).toMatchObject({
			success: true,
			message: "2 invitados, 1 omitido",
		});
		expect(calls[0]?.args[1]).toEqual({
			userDocumentIds: [],
			groupDocumentIds: [GROUP_ID],
		});
	});

	test("invitar sin personas ni grupos falla en la validación", async () => {
		const { context, calls } = createHarness();

		const result = await action({
			request: postRequest(PATH, { intent: "invite" }),
			context,
			params: { documentId: COURSE_ID },
		} as unknown as ActionArgs);

		expect(result).toMatchObject({ success: false });
		expect(calls).toHaveLength(0);
	});

	test("una intención desconocida no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await action({
			request: postRequest(PATH, { intent: "enroll" }),
			context,
			params: { documentId: COURSE_ID },
		} as unknown as ActionArgs);

		expect(result).toMatchObject({ success: false });
		expect(calls).toHaveLength(0);
	});
});
