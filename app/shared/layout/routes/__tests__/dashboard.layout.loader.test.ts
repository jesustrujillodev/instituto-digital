import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { loader } from "../dashboard.layout.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const REQUEST = new Request("https://app.example.com/dashboard");

const createHarness = (
	options: { role?: Role | null; stateFails?: boolean } = {},
) => {
	const calls = { getState: 0 };

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "ana@empresa.com",
						role: options.role ?? "USER",
						iat: 1_800_000_000,
					},
		securityStateService: {
			getState: async () => {
				calls.getState += 1;
				if (options.stateFails) {
					return {
						success: false as const,
						error: { code: "UNEXPECTED_ERROR", message: "db caída" },
						timestamp: new Date().toISOString(),
					};
				}
				return {
					success: true as const,
					data: { lockdownAt: null, lockdownScope: null },
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"]) =>
	loader({ request: REQUEST, context } as LoaderArgs);

describe("dashboard layout loader", () => {
	// Gate ESTRUCTURAL: al colgar del layout que envuelve la zona protegida, una
	// ruta nueva dentro de /dashboard queda protegida por construcción, sin
	// depender de que su loader se acuerde de llamar requireAuth.
	test("redirige a login a quien no tiene sesión", async () => {
		const { context, calls } = createHarness({ role: null });

		const thrown = await run(context).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
		expect(calls.getState).toBe(0);
	});

	test("devuelve la identidad dentro del envelope estándar", async () => {
		const { context } = createHarness({ role: "SUPERADMIN" });

		const result = await run(context);

		expect(result.success).toBe(true);
		expect(result.data.user).toEqual({
			documentId: "11111111-1111-4111-8111-111111111111",
			email: "ana@empresa.com",
			role: "SUPERADMIN",
		});
	});

	// La proyección expuesta al cliente NO incluye el `userId` interno: fuera del
	// servidor el usuario se identifica siempre por documentId, y todo lo que se
	// ponga aquí viaja serializado en el HTML.
	test("no expone la PK interna al cliente", async () => {
		const { context } = createHarness();

		const result = await run(context);

		expect(result.data.user).not.toHaveProperty("userId");
		expect(JSON.stringify(result.data.user)).not.toContain('"7"');
	});

	test("adjunta el estado de seguridad cuando se puede leer", async () => {
		const { context, calls } = createHarness();

		const result = await run(context);

		expect(calls.getState).toBe(1);
		expect(result.data.securityState).toEqual({
			lockdownAt: null,
			lockdownScope: null,
		});
	});

	// El estado de seguridad es informativo para el shell: si no se puede leer, la
	// pantalla se pinta igual con `null` en vez de tumbar todo /dashboard.
	test("degrada a null si el estado de seguridad no se puede leer", async () => {
		const { context } = createHarness({ stateFails: true });

		const result = await run(context);

		expect(result.success).toBe(true);
		expect(result.data.securityState).toBeNull();
	});

	test("no filtra el mensaje del fallo al cliente", async () => {
		const { context } = createHarness({ stateFails: true });

		const result = await run(context);

		expect(JSON.stringify(result)).not.toContain("db caída");
	});
});
