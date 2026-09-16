import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * Variables de storage que se limpian ANTES de cada caso.
 *
 * `env.server` importa `dotenv/config`, así que el `.env` del desarrollador
 * llegaría hasta aquí y un proyecto con S3 configurado haría pasar (o fallar)
 * tests por motivos que no tienen que ver con el código. Se parte siempre de una
 * base conocida.
 */
const STORAGE_VARS = [
	"STORAGE_PROVIDER",
	"STORAGE_BUCKET_NAME",
	"STORAGE_REGION",
	"STORAGE_ENDPOINT",
	"STORAGE_ACCESS_KEY_ID",
	"STORAGE_SECRET_ACCESS_KEY",
	"STORAGE_FORCE_PATH_STYLE",
	"STORAGE_PUBLIC_DOMAIN",
	"STORAGE_PUBLIC_BUCKET_NAME",
	"GCS_CREDENTIALS_PATH",
	"GCS_CREDENTIALS_BASE64",
	"USE_GCS_EMULATOR",
	"GCS_EMULATOR_HOST",
];

/**
 * `env.server` valida y LANZA al importarse, así que cada caso necesita un
 * módulo fresco con su propio `process.env`. `vi.resetModules()` es lo que
 * permite reimportarlo y observar el fallo de arranque.
 */
const importEnv = async (overrides: Record<string, string | undefined>) => {
	vi.resetModules();
	for (const key of STORAGE_VARS) vi.stubEnv(key, undefined);
	for (const [key, value] of Object.entries(overrides)) {
		vi.stubEnv(key, value);
	}
	return import("../env.server");
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("env.server — fail-fast", () => {
	// El proceso NUNCA debe arrancar con un secreto ausente o débil: descubrirlo
	// con un 500 en runtime es mucho peor que no arrancar.
	test("lanza cuando falta DATABASE_URL", async () => {
		await expect(importEnv({ DATABASE_URL: "" })).rejects.toThrow(
			"Invalid environment configuration",
		);
	});

	test("lanza cuando un secreto no llega al mínimo de 32 caracteres", async () => {
		await expect(importEnv({ JWT_SECRET: "corto" })).rejects.toThrow(
			"JWT_SECRET must be at least 32 characters long",
		);
	});

	// El mensaje nombra CADA variable que falla, no solo la primera: quien
	// despliega corrige todas de una vez en lugar de a base de reintentos.
	test("el mensaje enumera todas las variables incumplidas", async () => {
		const error = await importEnv({
			JWT_SECRET: "corto",
			COOKIE_SECRET: "tambien-corto",
		}).catch((e) => e);

		expect(error.message).toContain("JWT_SECRET");
		expect(error.message).toContain("COOKIE_SECRET");
	});

	test("lanza cuando un TTL no es un entero positivo", async () => {
		await expect(importEnv({ AUTH_ACCESS_TOKEN_TTL_S: "0" })).rejects.toThrow(
			"must be >= 1",
		);
		await expect(
			importEnv({ AUTH_REFRESH_TOKEN_TTL_S: "1.5" }),
		).rejects.toThrow("must be an integer");
	});

	test("lanza con un NODE_ENV fuera de la picklist", async () => {
		await expect(importEnv({ NODE_ENV: "staging" })).rejects.toThrow(
			"Invalid environment configuration",
		);
	});
});

describe("env.server — validación condicional al proveedor de storage", () => {
	// Fail-fast al boot si el proveedor está seleccionado pero le faltan
	// variables, en lugar de descubrirlo con un 500 al primer archivo que se suba.
	test("s3 exige región, credenciales y bucket", async () => {
		await expect(
			importEnv({ STORAGE_PROVIDER: "s3", STORAGE_REGION: "eu-west-1" }),
		).rejects.toThrow("STORAGE_PROVIDER=s3 requiere");
	});

	test("s3 arranca con todas sus variables", async () => {
		const { env } = await importEnv({
			STORAGE_PROVIDER: "s3",
			STORAGE_REGION: "eu-west-1",
			STORAGE_ACCESS_KEY_ID: "AKIA",
			STORAGE_SECRET_ACCESS_KEY: "secreto",
			STORAGE_BUCKET_NAME: "mi-bucket",
		});

		expect(env.STORAGE_PROVIDER).toBe("s3");
		expect(env.STORAGE_BUCKET_NAME).toBe("mi-bucket");
	});

	test("gcs exige bucket y una fuente de credenciales", async () => {
		await expect(
			importEnv({ STORAGE_PROVIDER: "gcs", STORAGE_BUCKET_NAME: "mi-bucket" }),
		).rejects.toThrow("STORAGE_PROVIDER=gcs requiere");
	});

	test("gcs acepta el emulador como fuente de credenciales", async () => {
		const { env } = await importEnv({
			STORAGE_PROVIDER: "gcs",
			STORAGE_BUCKET_NAME: "mi-bucket",
			USE_GCS_EMULATOR: "true",
		});

		expect(env.STORAGE_PROVIDER).toBe("gcs");
	});

	// Sin STORAGE_PROVIDER la feature de storage queda inactiva y la app arranca
	// igual: no es una dependencia obligatoria del sistema.
	test("sin proveedor declarado la app arranca sin storage", async () => {
		const { env } = await importEnv({});

		expect(env.STORAGE_PROVIDER).toBeUndefined();
	});
});

describe("env.server — defaults", () => {
	test("aplica los TTL y claims por defecto cuando no se declaran", async () => {
		const { env } = await importEnv({});

		expect(env.AUTH_ACCESS_TOKEN_TTL_S).toBe(300);
		expect(env.AUTH_REFRESH_TOKEN_TTL_S).toBe(7 * 24 * 60 * 60);
		expect(env.AUTH_REFRESH_GRACE_S).toBe(60);
		expect(env.AUTH_JWT_ISSUER).toBe("instituto-digital");
		expect(env.AUTH_MAX_SESSIONS_PER_USER).toBe(5);
		expect(env.AUTH_SECURITY_STATE_CACHE_TTL_S).toBe(5);
	});

	// Las variables numéricas llegan como string del entorno y se transforman:
	// si no, `accessTokenTtlS * 1000` haría concatenación de strings.
	test("transforma los numéricos declarados a number", async () => {
		const { env } = await importEnv({ AUTH_ACCESS_TOKEN_TTL_S: "900" });

		expect(env.AUTH_ACCESS_TOKEN_TTL_S).toBe(900);
	});
});

/**
 * CDN del catálogo público.
 *
 * Las dos variables van juntas porque el bucket separado ES la garantía de que
 * el dominio abierto no sirve también los prefijos privados: un Custom Domain de
 * R2 se monta sobre el bucket entero, no sobre un prefijo. Definir solo el
 * dominio expondría `documentos/`, así que el proceso no debe arrancar.
 */
describe("env.server — CDN del catálogo", () => {
	const S3 = {
		STORAGE_PROVIDER: "s3",
		STORAGE_REGION: "auto",
		STORAGE_ACCESS_KEY_ID: "AKIA",
		STORAGE_SECRET_ACCESS_KEY: "secreto",
		STORAGE_BUCKET_NAME: "mi-bucket",
	};

	// La dirección PELIGROSA: un dominio sobre el bucket único publicaría el
	// expediente documental. El proceso no debe arrancar.
	test("lanza con el dominio pero sin bucket público", async () => {
		await expect(
			importEnv({ ...S3, STORAGE_PUBLIC_DOMAIN: "https://cdn.ejemplo.com" }),
		).rejects.toThrow("exige STORAGE_PUBLIC_BUCKET_NAME");
	});

	// La dirección SEGURA: separar los buckets sin dominio todavía. Los objetos
	// de catálogo ya viven aparte y se sirven por el proxy; cuando el dominio
	// exista basta con añadirlo, sin mover nada.
	test("el bucket público sin dominio es una configuración válida", async () => {
		const { env } = await importEnv({
			...S3,
			STORAGE_PUBLIC_BUCKET_NAME: "mi-bucket-publico",
		});

		expect(env.STORAGE_PUBLIC_BUCKET_NAME).toBe("mi-bucket-publico");
		expect(env.STORAGE_PUBLIC_DOMAIN).toBeUndefined();
	});

	test("arranca con las dos declaradas", async () => {
		const { env } = await importEnv({
			...S3,
			STORAGE_PUBLIC_BUCKET_NAME: "mi-bucket-publico",
			STORAGE_PUBLIC_DOMAIN: "https://cdn.ejemplo.com",
		});

		expect(env.STORAGE_PUBLIC_BUCKET_NAME).toBe("mi-bucket-publico");
		expect(env.STORAGE_PUBLIC_DOMAIN).toBe("https://cdn.ejemplo.com");
	});

	// El resolutor concatena el dominio con la key tal cual: un valor relativo
	// produciría URLs rotas en todas las fotos del catálogo.
	test("lanza si el dominio no es un origen absoluto", async () => {
		await expect(
			importEnv({
				...S3,
				STORAGE_PUBLIC_BUCKET_NAME: "mi-bucket-publico",
				STORAGE_PUBLIC_DOMAIN: "cdn.ejemplo.com",
			}),
		).rejects.toThrow("origen absoluto");
	});

	// En desarrollo se admite http para poder probar el modo CDN contra MinIO;
	// en producción se exige https.
	test("admite http fuera de producción y lo rechaza dentro", async () => {
		const { env } = await importEnv({
			...S3,
			NODE_ENV: "development",
			STORAGE_PUBLIC_BUCKET_NAME: "mi-bucket-publico",
			STORAGE_PUBLIC_DOMAIN: "http://localhost:9000/publico",
		});
		expect(env.STORAGE_PUBLIC_DOMAIN).toBe("http://localhost:9000/publico");

		await expect(
			importEnv({
				...S3,
				NODE_ENV: "production",
				STORAGE_PUBLIC_BUCKET_NAME: "mi-bucket-publico",
				STORAGE_PUBLIC_DOMAIN: "http://cdn.ejemplo.com",
			}),
		).rejects.toThrow("origen absoluto");
	});

	// El modo por defecto: sin ninguna de las dos, un solo bucket y todo por el
	// proxy. Es lo que corre en local y lo que no requiere Cloudflare.
	test("sin ninguna de las dos arranca en modo un bucket", async () => {
		const { env } = await importEnv(S3);

		expect(env.STORAGE_PUBLIC_BUCKET_NAME).toBeUndefined();
		expect(env.STORAGE_PUBLIC_DOMAIN).toBeUndefined();
	});
});
