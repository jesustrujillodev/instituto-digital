import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST = new Request("https://app.example.com/dashboard/perfil");

const okOf = <T>(data: T) => ({
	success: true as const,
	data,
	timestamp: new Date().toISOString(),
});

const failOf = (code: string) => ({
	success: false as const,
	error: { code, message: "técnico" },
	timestamp: new Date().toISOString(),
});

const createHarness = (
	options: {
		role?: Role | null;
		dependencyId?: number | null;
		findFails?: string;
		dependencyFails?: boolean;
	} = {},
) => {
	const calls = { findById: [] as unknown[], byInternalId: [] as number[] };

	// `??` colapsaría null con "no provisto", y null es justo el caso que se prueba:
	// una cuenta sin dependencia.
	const dependencyId =
		options.dependencyId === undefined ? 3 : options.dependencyId;

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: DOCUMENT_ID,
						userId: 7,
						email: "ana@instituto.gob.mx",
						role: options.role ?? "USER",
						dependencyId,
						iat: 1_800_000_000,
					},
		userService: {
			findById: async (documentId: string, scope: unknown) => {
				calls.findById.push({ documentId, scope });
				return options.findFails
					? failOf(options.findFails)
					: okOf({
							documentId,
							email: "ana@instituto.gob.mx",
							firstName: "Ana",
							lastName: "Ruiz",
							role: options.role ?? "USER",
							employeeNumber: "EMP-0007",
							jobTitle: "Coordinadora",
							dependencyId,
						});
			},
			listDependencyHistory: async () => okOf([]),
		},
		dependencyService: {
			findByInternalId: async (id: number) => {
				calls.byInternalId.push(id);
				return options.dependencyFails
					? failOf("DEPENDENCY_NOT_FOUND")
					: okOf({ id, name: "Obras Públicas" });
			},
			listActive: async () => okOf([]),
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"]) =>
	loader({ request: REQUEST, context } as LoaderArgs);

describe("perfil loader — acceso", () => {
	// Único punto del dashboard con `requireAuth` y sin rol: exigir uno dejaría
	// fuera precisamente a los participantes, que son quienes más lo usan.
	test("un participante entra", async () => {
		const result = await run(createHarness({ role: "USER" }).context);

		expect(result.success).toBe(true);
	});

	test("cualquier rol entra a su propio perfil", async () => {
		for (const role of [
			"USER",
			"ADMIN",
			"SUPERADMIN",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			const result = await run(createHarness({ role }).context);

			expect(result.success).toBe(true);
		}
	});

	test("sin sesión redirige a login", async () => {
		const thrown = await run(createHarness({ role: null }).context).catch(
			(e) => e,
		);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});

	// El sujeto sale del token, nunca de la petición: si viniera del cliente, esta
	// pantalla —que no tiene guard de rol— serviría para leer cuentas ajenas.
	test("consulta su propia cuenta, tomada del token", async () => {
		const { context, calls } = createHarness();

		await run(context);

		expect(calls.findById).toEqual([
			{ documentId: DOCUMENT_ID, scope: { kind: "self", userId: 7 } },
		]);
	});
});

describe("perfil loader — datos", () => {
	// Se resuelve por id interno y no buscándola en el catálogo de activas: si
	// estuviera desactivada, el catálogo no la traería y el perfil diría "sin
	// dependencia" de alguien que sí la tiene.
	test("resuelve el nombre de la dependencia por su id interno", async () => {
		const { context, calls } = createHarness({ dependencyId: 42 });

		const result = await run(context);

		expect(calls.byInternalId).toEqual([42]);
		expect(result.success && result.data.dependencyName).toBe("Obras Públicas");
	});

	test("sin dependencia no consulta el catálogo por id", async () => {
		const { context, calls } = createHarness({ dependencyId: null });

		const result = await run(context);

		expect(calls.byInternalId).toEqual([]);
		expect(result.success && result.data.dependencyName).toBeNull();
	});

	// Criterio de aceptación 9: el titular no puede cambiarse mientras lo sea. La
	// pantalla lo explica en vez de esconder el control.
	test("el titular no puede cambiar de dependencia", async () => {
		const result = await run(
			createHarness({ role: "DEPENDENCY_HEAD" }).context,
		);

		expect(result.success && result.data.canChangeDependency).toBe(false);
	});

	test("el auxiliar sí puede", async () => {
		const result = await run(
			createHarness({ role: "DEPENDENCY_DEPUTY" }).context,
		);

		expect(result.success && result.data.canChangeDependency).toBe(true);
	});

	test("una cuenta que no se alcanza corta con 404", async () => {
		const thrown = await run(
			createHarness({ findFails: "USER_NOT_FOUND" }).context,
		).catch((e) => e);

		expect(thrown.init.status).toBe(404);
	});

	// El nombre es informativo: si falla resolverlo, el perfil sigue sirviendo.
	test("un fallo al resolver la dependencia no tumba la pantalla", async () => {
		const result = await run(createHarness({ dependencyFails: true }).context);

		expect(result.success).toBe(true);
		expect(result.success && result.data.dependencyName).toBeNull();
	});
});
