import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import type { SafeUser } from "../../../../domain/user.types";
import {
	INTENT_FIELD,
	PHOTO_FIELD,
	USER_INTENTS,
} from "../../../../utils/parse-user-form-data";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
// Otra cuenta: el admin del contexto es el userId 7.
const user = { id: 9, documentId: DOCUMENT_ID } as SafeUser;

const formRequest = (fields: Record<string, string>, photo?: File) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	if (photo) body.append(PHOTO_FIELD, photo);
	return new Request(`https://app.example.com/usuarios/${DOCUMENT_ID}/editar`, {
		method: "POST",
		body,
	});
};

const pngFile = (name = "foto.png") =>
	new File(["binario"], name, { type: "image/png" });

const createHarness = (
	options: {
		role?: Role | null;
		updateFails?: string;
		resetFails?: string;
		resetUser?: SafeUser;
		revokeFails?: boolean;
		photoFails?: boolean;
		changeFails?: string;
	} = {},
) => {
	const calls = {
		changeDependency: [] as { documentId: string; dependency: string }[],
		update: [] as { documentId: string; dto: unknown }[],
		resetPassword: [] as { documentId: string; password: string }[],
		updatePhoto: [] as string[],
		revokeAllForUser: [] as number[],
	};

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

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: DOCUMENT_ID,
						userId: 7,
						email: "ana@empresa.com",
						role: options.role ?? "SUPERADMIN",
						iat: 1_800_000_000,
					},
		userService: {
			update: async (documentId: string, dto: unknown) => {
				calls.update.push({ documentId, dto });
				return options.updateFails ? failOf(options.updateFails) : okOf(user);
			},
			resetPassword: async (documentId: string, password: string) => {
				calls.resetPassword.push({ documentId, password });
				return options.resetFails
					? failOf(options.resetFails)
					: okOf(options.resetUser ?? user);
			},
			changeDependency: async (documentId: string, dependency: string) => {
				calls.changeDependency.push({ documentId, dependency });
				return options.changeFails ? failOf(options.changeFails) : okOf(user);
			},
			updatePhoto: async (documentId: string) => {
				calls.updatePhoto.push(documentId);
				return options.photoFails ? failOf("INVALID_UPLOAD") : okOf(user);
			},
		},
		sessionMonitorService: {
			revokeAllForUser: async (userId: number) => {
				calls.revokeAllForUser.push(userId);
				return options.revokeFails ? failOf("INTERNAL_ERROR") : okOf(null);
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (
	request: Request,
	context: ActionArgs["context"],
	documentId = DOCUMENT_ID,
) =>
	action({
		request,
		context,
		params: { documentId },
	} as unknown as ActionArgs);

describe("usuarios/editar action — guard", () => {
	test("corta con 403 para un rol insuficiente sin mutar nada", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(formRequest({ firstName: "Ana" }), context).catch(
			(e) => e,
		);

		expect(thrown.init.status).toBe(403);
		expect(calls.update).toEqual([]);
	});
});

describe("usuarios/editar action — actualizar perfil", () => {
	test("actualiza y lo anuncia", async () => {
		const { context, calls } = createHarness();

		const result = await run(formRequest({ firstName: "Ana" }), context);

		expect(result.success && result.message).toBe("Cambios guardados");
		expect(calls.update).toEqual([
			{ documentId: DOCUMENT_ID, dto: { firstName: "Ana" } },
		]);
	});

	// Los campos vacíos se descartan: un `<input>` sin rellenar manda "", y para un
	// campo opcional del dominio "" no es un valor sino su ausencia.
	test("descarta los campos vacíos en vez de mandarlos como cadena", async () => {
		const { context, calls } = createHarness();

		await run(formRequest({ firstName: "Ana", employeeNumber: "" }), context);

		expect(calls.update[0].dto).toEqual({ firstName: "Ana" });
	});

	test("nombre, apellido, teléfono y puesto vacíos llegan como null", async () => {
		const { context, calls } = createHarness();

		await run(
			formRequest({ firstName: "", lastName: "", phone: "", jobTitle: "" }),
			context,
		);

		expect(calls.update[0].dto).toEqual({
			firstName: null,
			lastName: null,
			phone: null,
			jobTitle: null,
		});
	});

	test("un documentId malformado no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(formRequest({ firstName: "Ana" }), context, "1");

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.update).toEqual([]);
	});

	test("localiza el fallo del servicio conservando el código", async () => {
		const { context } = createHarness({ updateFails: "DUPLICATE_EMAIL" });

		const result = await run(
			formRequest({ email: "otra@empresa.com" }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("DUPLICATE_EMAIL");
			expect(result.error.fieldErrors).toEqual({
				email: "Ese correo ya está registrado",
			});
		}
	});

	// Best-effort, igual que al crear: los datos del perfil ya se guardaron y
	// obligar a repetirlos por una foto sería peor.
	test("si falla la foto los cambios se dan por buenos y se avisa", async () => {
		const { context, calls } = createHarness({ photoFails: true });

		const result = await run(
			formRequest({ firstName: "Ana" }, pngFile()),
			context,
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.message).toContain("Cambios guardados");
			expect(result.message).toContain("no se pudo actualizar la foto");
		}
		expect(calls.update).toHaveLength(1);
	});

	test("si falla la actualización no se intenta subir la foto", async () => {
		const { context, calls } = createHarness({ updateFails: "USER_NOT_FOUND" });

		await run(formRequest({ firstName: "Ana" }, pngFile()), context);

		expect(calls.updatePhoto).toEqual([]);
	});

	test("sin foto no se llama a updatePhoto", async () => {
		const { context, calls } = createHarness();

		await run(formRequest({ firstName: "Ana" }), context);

		expect(calls.updatePhoto).toEqual([]);
	});
});

describe("usuarios/editar action — restablecer contraseña", () => {
	const RESET_FIELDS = {
		[INTENT_FIELD]: USER_INTENTS.resetPassword,
		newPassword: "contrasena1",
	};

	// Dos operaciones en un mismo action, separadas por el `intent` del envío y NO
	// por el conjunto de campos recibidos: el diálogo se abre también desde el
	// listado y no debe poder disparar un guardado de perfil.
	test("el intent decide la operación, no los campos", async () => {
		const { context, calls } = createHarness();

		const result = await run(formRequest(RESET_FIELDS), context);

		expect(result.success).toBe(true);
		expect(calls.resetPassword).toEqual([
			{ documentId: DOCUMENT_ID, password: "contrasena1" },
		]);
		expect(calls.update).toEqual([]);
	});

	// Quien administra no conoce la anterior, y ve (o genera) la nueva.
	test("no pide confirmación ni la contraseña actual", async () => {
		const { context, calls } = createHarness();

		await run(formRequest(RESET_FIELDS), context);

		expect(calls.resetPassword).toHaveLength(1);
	});

	test("aplica la política de contraseñas", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ ...RESET_FIELDS, newPassword: "corta" }),
			context,
		);

		expect(result.success).toBe(false);
		expect(calls.resetPassword).toEqual([]);
	});

	// Una cuenta olvidada o comprometida no debe conservar las sesiones abiertas
	// con la contraseña anterior.
	test("cierra las sesiones de la cuenta y lo anuncia", async () => {
		const { context, calls } = createHarness();

		const result = await run(formRequest(RESET_FIELDS), context);

		expect(calls.revokeAllForUser).toEqual([9]);
		expect(result.success && result.message).toBe(
			"Contraseña restablecida. Se cerraron sus sesiones abiertas.",
		);
	});

	test("no desconecta al admin cuando restablece su propia cuenta", async () => {
		const { context, calls } = createHarness({
			resetUser: { id: 7, documentId: DOCUMENT_ID } as SafeUser,
		});

		const result = await run(formRequest(RESET_FIELDS), context);

		expect(calls.revokeAllForUser).toEqual([]);
		expect(result.success && result.message).toBe("Contraseña restablecida");
	});

	// Best-effort: la contraseña ya cambió; se da por buena y se avisa.
	test("si falla el cierre de sesiones, la contraseña cuenta y se avisa", async () => {
		const { context } = createHarness({ revokeFails: true });

		const result = await run(formRequest(RESET_FIELDS), context);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.message).toContain("Contraseña restablecida");
			expect(result.message).toContain("no se pudieron cerrar");
		}
	});

	test("localiza el fallo del servicio sin tocar las sesiones", async () => {
		const { context, calls } = createHarness({ resetFails: "USER_NOT_FOUND" });

		const result = await run(formRequest(RESET_FIELDS), context);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("USER_NOT_FOUND");
			expect(result.error.message).toBe("El usuario ya no existe.");
		}
		expect(calls.revokeAllForUser).toEqual([]);
	});
});

describe("usuarios/editar action — cambiar dependencia", () => {
	const DEPENDENCY_ID = "22222222-2222-4222-8222-222222222222";
	const CHANGE_FIELDS = {
		[INTENT_FIELD]: USER_INTENTS.changeDependency,
		dependency: DEPENDENCY_ID,
	};

	test("traslada la cuenta de la URL al destino elegido", async () => {
		const { context, calls } = createHarness({ role: "SUPERADMIN" });

		const result = await run(formRequest(CHANGE_FIELDS), context);

		expect(result.success && result.message).toBe("Dependencia actualizada");
		expect(calls.changeDependency).toEqual([
			{ documentId: DOCUMENT_ID, dependency: DEPENDENCY_ID },
		]);
		expect(calls.update).toEqual([]);
	});

	test("un destino que no es uuid falla sin llegar al servicio", async () => {
		const { context, calls } = createHarness({ role: "SUPERADMIN" });

		const result = await run(
			formRequest({ ...CHANGE_FIELDS, dependency: "5" }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.changeDependency).toEqual([]);
	});

	// Criterio de aceptación 9: el motivo se dice, no se oculta.
	test("sobre un titular responde el motivo", async () => {
		const { context } = createHarness({
			role: "SUPERADMIN",
			changeFails: "HEAD_CANNOT_LEAVE_DEPENDENCY",
		});

		const result = await run(formRequest(CHANGE_FIELDS), context);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("HEAD_CANNOT_LEAVE_DEPENDENCY");
		}
	});

	test("sin permiso sobre la cuenta responde FORBIDDEN_SCOPE", async () => {
		const { context } = createHarness({ changeFails: "FORBIDDEN_SCOPE" });

		const result = await run(formRequest(CHANGE_FIELDS), context);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("FORBIDDEN_SCOPE");
	});
});
