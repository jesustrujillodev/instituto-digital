import { describe, expect, test } from "vitest";
import type { LogData, Logger } from "@/shared/logging/logger";
import { loader } from "../storage.route";

type LoaderArgs = Parameters<typeof loader>[0];

const BUCKET = "mi-bucket";
const PUBLIC_KEY = "profile-photos/ana-1700000000.png";
const PRIVATE_KEY = "documents/contrato-1700000000.pdf";

type Entry = { level: string; message: string; data?: LogData };

const createSpyLogger = () => {
	const entries: Entry[] = [];
	const logger: Logger = {
		debug: (message, data) => entries.push({ level: "debug", message, data }),
		info: (message, data) => entries.push({ level: "info", message, data }),
		warn: (message, data) => entries.push({ level: "warn", message, data }),
		error: (message, data) => entries.push({ level: "error", message, data }),
		child: () => logger,
	};
	return { logger, entries };
};

const requestOf = (query: string) =>
	new Request(`https://app.example.com/api/storage${query}`);

const createHarness = (
	options: {
		authenticated?: boolean;
		storageBucket?: string | null;
		storagePublicBucket?: string | null;
		fileBytes?: number;
		getFileFails?: boolean;
		presignFails?: boolean;
	} = {},
) => {
	const calls = {
		getFile: [] as string[],
		presigned: [] as string[],
		buckets: [] as string[],
	};
	const { logger, entries } = createSpyLogger();

	const context = {
		logger,
		storageBucket:
			options.storageBucket === undefined ? BUCKET : options.storageBucket,
		storagePublicBucket: options.storagePublicBucket ?? null,
		authPayload:
			options.authenticated === false
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "ana@empresa.com",
						role: "USER",
						iat: 1_800_000_000,
					},
		storageProvider: {
			getFile: async (bucket: string, key: string) => {
				calls.buckets.push(bucket);
				calls.getFile.push(key);
				if (options.getFileFails) throw new Error("el proveedor está caído");
				return Buffer.alloc(options.fileBytes ?? 10, 1);
			},
			getPresignedUrl: async (bucket: string, key: string) => {
				calls.buckets.push(bucket);
				calls.presigned.push(key);
				if (options.presignFails) throw new Error("credenciales inválidas");
				return `https://s3.example.com/${key}?X-Amz-Signature=abc`;
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls, entries };
};

const run = (request: Request, context: LoaderArgs["context"]) =>
	loader({ request, context } as LoaderArgs);

describe("storage proxy — resolución de la key", () => {
	test("sirve la key que llega en ?key=", async () => {
		const { context, calls } = createHarness();

		await run(requestOf(`?key=${encodeURIComponent(PUBLIC_KEY)}`), context);

		expect(calls.presigned).toEqual([PUBLIC_KEY]);
	});

	test("acepta el formato proxy legado en ?url=", async () => {
		const { context, calls } = createHarness();

		await run(
			requestOf(`?url=${encodeURIComponent(`/api/storage?key=${PUBLIC_KEY}`)}`),
			context,
		);

		expect(calls.presigned).toEqual([PUBLIC_KEY]);
	});

	test("sin key devuelve 404", async () => {
		const { context } = createHarness();

		const response = await run(requestOf(""), context);

		expect(response.status).toBe(404);
	});

	test("una key que no se puede resolver devuelve 404", async () => {
		const { context } = createHarness();

		const response = await run(
			requestOf(
				`?key=${encodeURIComponent("https://bucket.s3.amazonaws.com/x")}`,
			),
			context,
		);

		expect(response.status).toBe(404);
	});
});

describe("storage proxy — configuración", () => {
	// Error de configuración, no de negocio: se registra con su mensaje real para
	// quien opera y se responde genérico.
	test("sin bucket configurado responde 500 y lo registra", async () => {
		const { context, entries } = createHarness({ storageBucket: null });

		const response = await run(requestOf(`?key=${PUBLIC_KEY}`), context);

		expect(response.status).toBe(500);
		expect(entries[0].level).toBe("error");
	});
});

describe("storage proxy — autorización por prefijo", () => {
	// Los objetos públicos se sirven SIN sesión: es lo que permite pintar un
	// avatar en una pantalla que aún no autenticó.
	test("una key pública se sirve sin sesión", async () => {
		const { context, calls } = createHarness({ authenticated: false });

		await run(requestOf(`?key=${encodeURIComponent(PUBLIC_KEY)}`), context);

		expect(calls.presigned).toEqual([PUBLIC_KEY]);
	});

	// Fail-closed: todo lo que NO empiece por un prefijo público exige sesión.
	test("una key privada sin sesión redirige a login y no toca el proveedor", async () => {
		const { context, calls } = createHarness({ authenticated: false });

		const thrown = await run(
			requestOf(`?key=${encodeURIComponent(PRIVATE_KEY)}`),
			context,
		).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
		expect(calls.presigned).toEqual([]);
	});

	test("una key privada con sesión sí se sirve", async () => {
		const { context, calls } = createHarness();

		await run(requestOf(`?key=${encodeURIComponent(PRIVATE_KEY)}`), context);

		expect(calls.presigned).toEqual([PRIVATE_KEY]);
	});
});

describe("storage proxy — modo por defecto (URL firmada)", () => {
	// Por defecto el archivo NO pasa por nuestro servidor: se redirige a una URL
	// firmada temporal y el navegador descarga directo del proveedor.
	test("redirige a la URL firmada sin leer el archivo", async () => {
		const { context, calls } = createHarness();

		const response = await run(
			requestOf(`?key=${encodeURIComponent(PUBLIC_KEY)}`),
			context,
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toContain("X-Amz-Signature");
		expect(calls.getFile).toEqual([]);
	});
});

describe("storage proxy — modo inline", () => {
	test("sirve el archivo con el content-type inferido de la key", async () => {
		const { context, calls } = createHarness({ fileBytes: 42 });

		const response = await run(
			requestOf(`?key=${encodeURIComponent(PUBLIC_KEY)}&inline=true`),
			context,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect(response.headers.get("Content-Disposition")).toBe("inline");
		expect(response.headers.get("Content-Length")).toBe("42");
		expect(calls.getFile).toEqual([PUBLIC_KEY]);
	});

	// Red de seguridad para no cargar en RAM un objeto inesperadamente grande: la
	// defensa principal es la validación de tamaño en la subida.
	test("un objeto por encima del cap inline responde 413 y lo registra", async () => {
		const { context, entries } = createHarness({
			fileBytes: 15 * 1024 * 1024 + 1,
		});

		const response = await run(
			requestOf(`?key=${encodeURIComponent(PUBLIC_KEY)}&inline=true`),
			context,
		);

		expect(response.status).toBe(413);
		expect(entries[0].level).toBe("warn");
	});

	test("un objeto justo en el cap sí se sirve", async () => {
		const { context } = createHarness({ fileBytes: 15 * 1024 * 1024 });

		const response = await run(
			requestOf(`?key=${encodeURIComponent(PUBLIC_KEY)}&inline=true`),
			context,
		);

		expect(response.status).toBe(200);
	});

	// Solo el literal "true" activa el modo: cualquier otra cosa cae al redirect.
	test("inline distinto de 'true' cae al modo por defecto", async () => {
		const { context, calls } = createHarness();

		await run(
			requestOf(`?key=${encodeURIComponent(PUBLIC_KEY)}&inline=1`),
			context,
		);

		expect(calls.getFile).toEqual([]);
		expect(calls.presigned).toEqual([PUBLIC_KEY]);
	});

	// Un tipo desconocido se sirve como binario opaco: con Content-Disposition
	// inline, adivinar text/html sobre un archivo subido sería un XSS almacenado.
	test("un tipo desconocido se sirve como binario opaco", async () => {
		const { context } = createHarness();

		const response = await run(
			requestOf(`?key=${encodeURIComponent("media/raro.xyz")}&inline=true`),
			context,
		);

		expect(response.headers.get("Content-Type")).toBe(
			"application/octet-stream",
		);
	});
});

describe("storage proxy — fallos del proveedor", () => {
	test("un fallo al leer responde 500 genérico y registra la causa", async () => {
		const { context, entries } = createHarness({ getFileFails: true });

		const response = await run(
			requestOf(`?key=${encodeURIComponent(PUBLIC_KEY)}&inline=true`),
			context,
		);

		expect(response.status).toBe(500);
		expect(await response.text()).toBe("Internal Server Error");
		expect(entries[0].level).toBe("error");
	});

	// El mensaje del proveedor puede traer el bucket, la región o una credencial:
	// se registra, no se responde.
	test("el mensaje del proveedor no viaja al cliente", async () => {
		const { context } = createHarness({ presignFails: true });

		const response = await run(
			requestOf(`?key=${encodeURIComponent(PUBLIC_KEY)}`),
			context,
		);

		expect(await response.text()).not.toContain("credenciales inválidas");
	});

	// Un redirect lanzado por requireAuth es un Response: hay que re-lanzarlo tal
	// cual y no tratarlo como un error del proveedor.
	test("el redirect de requireAuth no se traga como error 500", async () => {
		const { context } = createHarness({ authenticated: false });

		const thrown = await run(
			requestOf(`?key=${encodeURIComponent(PRIVATE_KEY)}`),
			context,
		).catch((e) => e);

		expect(thrown.status).toBe(302);
	});
});

/**
 * El bucket lo decide la key, igual que la visibilidad.
 *
 * El proxy sigue siendo la vía de acceso a TODO —incluido `media/` cuando vive
 * en el bucket público—: en entornos sin dominio configurado es la única, y las
 * referencias proxy persistidas en BD siguen siendo válidas con el CDN activo.
 */
describe("storage proxy — resolución del bucket", () => {
	const CDN_KEY = "media/foto-1700000000.jpg";
	const PUBLIC_BUCKET = "mi-bucket-publico";

	test("una key del catálogo se lee del bucket público", async () => {
		const { context, calls } = createHarness({
			storagePublicBucket: PUBLIC_BUCKET,
		});

		await run(requestOf(`?key=${encodeURIComponent(CDN_KEY)}`), context);

		expect(calls.buckets).toEqual([PUBLIC_BUCKET]);
	});

	test("una key privada se lee del bucket por defecto", async () => {
		const { context, calls } = createHarness({
			storagePublicBucket: PUBLIC_BUCKET,
		});

		await run(requestOf(`?key=${encodeURIComponent(PRIVATE_KEY)}`), context);

		expect(calls.buckets).toEqual([BUCKET]);
	});

	// profile-photos/ es público para el proxy pero NO va al CDN: se queda en el
	// bucket privado. Es la distinción entre las dos listas de storage.policy.
	test("las fotos de perfil siguen en el bucket por defecto", async () => {
		const { context, calls } = createHarness({
			storagePublicBucket: PUBLIC_BUCKET,
		});

		await run(requestOf(`?key=${encodeURIComponent(PUBLIC_KEY)}`), context);

		expect(calls.buckets).toEqual([BUCKET]);
	});

	// REGRESIÓN del modo por defecto: sin bucket público, todo sale del de
	// siempre y el proxy se comporta exactamente como antes del CDN.
	test("sin bucket público todo se lee del de por defecto", async () => {
		const { context, calls } = createHarness();

		await run(requestOf(`?key=${encodeURIComponent(CDN_KEY)}`), context);
		await run(requestOf(`?key=${encodeURIComponent(PRIVATE_KEY)}`), context);

		expect(calls.buckets).toEqual([BUCKET, BUCKET]);
	});

	test("el modo inline también resuelve el bucket por la key", async () => {
		const { context, calls } = createHarness({
			storagePublicBucket: PUBLIC_BUCKET,
		});

		await run(
			requestOf(`?key=${encodeURIComponent(CDN_KEY)}&inline=true`),
			context,
		);

		expect(calls.getFile).toEqual([CDN_KEY]);
		expect(calls.buckets).toEqual([PUBLIC_BUCKET]);
	});
});
