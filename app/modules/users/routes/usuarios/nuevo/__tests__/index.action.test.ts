import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import type { SafeUser } from "../../../../domain/user.types";
import { PHOTO_FIELD } from "../../../../utils/parse-user-form-data";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

const createdUser = { documentId: DOCUMENT_ID } as SafeUser;

const formRequest = (fields: Record<string, string>, photo?: File) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	if (photo) body.append(PHOTO_FIELD, photo);
	return new Request("https://app.example.com/usuarios/nuevo", {
		method: "POST",
		body,
	});
};

const pngFile = (name = "foto.png", content = "binario") =>
	new File([content], name, { type: "image/png" });

const createHarness = (
	options: {
		role?: Role | null;
		createFails?: string;
		photoFails?: boolean;
	} = {},
) => {
	const calls = {
		create: [] as unknown[],
		updatePhoto: [] as { documentId: string; name: string }[],
	};

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: DOCUMENT_ID,
						userId: 7,
						email: "ana@empresa.com",
						role: options.role ?? "ADMIN",
						dependencyId: null,
						iat: 1_800_000_000,
					},
		userService: {
			create: async (dto: unknown) => {
				calls.create.push(dto);
				if (options.createFails) {
					return {
						success: false as const,
						error: { code: options.createFails, message: "técnico" },
						timestamp: new Date().toISOString(),
					};
				}
				return {
					success: true as const,
					data: createdUser,
					timestamp: new Date().toISOString(),
				};
			},
			updatePhoto: async (documentId: string, file: File) => {
				calls.updatePhoto.push({ documentId, name: file.name });
				if (options.photoFails) {
					return {
						success: false as const,
						error: { code: "INVALID_UPLOAD", message: "técnico" },
						timestamp: new Date().toISOString(),
					};
				}
				return {
					success: true as const,
					data: createdUser,
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

// Un alta interna mínima ya incluye número de empleado y dependencia: sin ellos
// la regla falla antes de llegar al servicio, igual que haría el CHECK de la base.
const VALID_FIELDS = {
	email: "ana@empresa.com",
	password: "contrasena1",
	employeeNumber: "EMP-0007",
	dependency: "33333333-3333-4333-8333-333333333333",
};

describe("usuarios/nuevo action — guard", () => {
	test("corta con 403 para un rol insuficiente sin crear nada", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(formRequest(VALID_FIELDS), context).catch(
			(e) => e,
		);

		expect(thrown.init.status).toBe(403);
		expect(calls.create).toEqual([]);
	});
});

describe("usuarios/nuevo action — alta", () => {
	test("crea el usuario y lo anuncia", async () => {
		const { context, calls } = createHarness();

		const result = await run(formRequest(VALID_FIELDS), context);

		expect(result.success && result.message).toBe("Usuario creado");
		expect(calls.create).toHaveLength(1);
	});

	// La foto se separa ANTES de validar: valibot recibe solo campos de texto, y
	// un File entre ellos haría fallar el DTO.
	test("el archivo no viaja entre los campos de texto", async () => {
		const { context, calls } = createHarness();

		await run(formRequest(VALID_FIELDS, pngFile()), context);

		expect(calls.create[0]).not.toHaveProperty(PHOTO_FIELD);
		expect(calls.create[0]).toMatchObject({ email: "ana@empresa.com" });
	});

	test("sin foto no se llama a updatePhoto", async () => {
		const { context, calls } = createHarness();

		await run(formRequest(VALID_FIELDS), context);

		expect(calls.updatePhoto).toEqual([]);
	});

	// La foto se sube DESPUÉS de crear, contra el documentId recién obtenido: no
	// existe antes de que exista la cuenta.
	test("con foto la sube contra el usuario recién creado", async () => {
		const { context, calls } = createHarness();

		await run(formRequest(VALID_FIELDS, pngFile("ana.png")), context);

		expect(calls.updatePhoto).toEqual([
			{ documentId: DOCUMENT_ID, name: "ana.png" },
		]);
	});

	// Un input de archivo enviado sin selección llega como File de 0 bytes: es
	// ausencia de foto, no una foto vacía que subir.
	test("un archivo vacío se trata como ausencia de foto", async () => {
		const { context, calls } = createHarness();

		await run(formRequest(VALID_FIELDS, new File([], "vacio.png")), context);

		expect(calls.updatePhoto).toEqual([]);
	});
});

describe("usuarios/nuevo action — errores", () => {
	test("un input inválido no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ email: "ana", password: "corta" }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.create).toEqual([]);
	});

	// Lo que el cliente no puede saber por su cuenta se pinta en SU campo, no en
	// un toast genérico.
	test("un correo duplicado cuelga el error del campo email", async () => {
		const { context } = createHarness({ createFails: "DUPLICATE_EMAIL" });

		const result = await run(formRequest(VALID_FIELDS), context);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("DUPLICATE_EMAIL");
			expect(result.error.fieldErrors).toEqual({
				email: "Ese correo ya está registrado",
			});
		}
	});

	// Best-effort deliberado: la cuenta ya existe y es utilizable. Devolver un
	// fallo aquí dejaría al admin repitiendo el alta con un email ya registrado.
	test("si falla la foto el alta se da por buena y se avisa", async () => {
		const { context, calls } = createHarness({ photoFails: true });

		const result = await run(formRequest(VALID_FIELDS, pngFile()), context);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.message).toContain("Usuario creado");
			expect(result.message).toContain("no se pudo guardar la foto");
		}
		expect(calls.create).toHaveLength(1);
	});

	test("si falla el alta no se intenta subir la foto", async () => {
		const { context, calls } = createHarness({
			createFails: "DUPLICATE_EMAIL",
		});

		await run(formRequest(VALID_FIELDS, pngFile()), context);

		expect(calls.updatePhoto).toEqual([]);
	});
});
