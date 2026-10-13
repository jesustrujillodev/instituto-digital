import { readFileSync } from "node:fs";
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
	"SMTP_HOST",
	"MAIL_FROM",
	"APP_BASE_URL",
	"RAILWAY_PUBLIC_DOMAIN",
	"EMAIL_WORKER_ENABLED",
	"CHROMIUM_PATH",
	"CHROMIUM_NO_SANDBOX",
	"CLIENT_IP_SOURCE",
	"TRUSTED_PROXY_HOPS",
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

/**
 * El marcador se lee de la plantilla versionada, no se copia: si alguien lo
 * cambia por un texto sin `change-me`, la guarda deja de cubrirlo y estas
 * pruebas lo hacen visible.
 */
const examplePlaceholderOf = (name: string): string => {
	const line = readFileSync(".env.example", "utf8")
		.split("\n")
		.find((l) => l.startsWith(`${name}=`));
	if (!line) throw new Error(`${name} no está en .env.example`);
	return line
		.slice(name.length + 1)
		.trim()
		.replace(/^"|"$/g, "");
};

describe("env.server — secretos en producción", () => {
	const JWT = "jwt-secreto-propio-de-al-menos-32-caracteres";
	const COOKIE = "cookie-secreto-propio-de-al-menos-32-chars";

	test("rechaza los secretos tal como vienen en .env.example", async () => {
		const error = await importEnv({
			NODE_ENV: "production",
			JWT_SECRET: examplePlaceholderOf("JWT_SECRET"),
			COOKIE_SECRET: examplePlaceholderOf("COOKIE_SECRET"),
		}).catch((e) => e);

		expect(error.message).toContain("JWT_SECRET");
		expect(error.message).toContain("COOKIE_SECRET");
	});

	test("rechaza cualquier secreto que conserve «change-me»", async () => {
		await expect(
			importEnv({
				NODE_ENV: "production",
				JWT_SECRET: "CHANGE-ME-pero-con-otro-texto-largo-de-relleno",
				COOKIE_SECRET: COOKIE,
			}),
		).rejects.toThrow("JWT_SECRET");
	});

	test("rechaza el mismo valor para los dos secretos", async () => {
		await expect(
			importEnv({
				NODE_ENV: "production",
				JWT_SECRET: JWT,
				COOKIE_SECRET: JWT,
			}),
		).rejects.toThrow("JWT_SECRET y COOKIE_SECRET deben ser distintos");
	});

	test("arranca con dos secretos propios y distintos", async () => {
		const { env } = await importEnv({
			NODE_ENV: "production",
			JWT_SECRET: JWT,
			COOKIE_SECRET: COOKIE,
			CLIENT_IP_SOURCE: "proxy",
			APP_BASE_URL: "https://capacitacion.gob.mx",
		});

		expect(env.JWT_SECRET).toBe(JWT);
		expect(env.COOKIE_SECRET).toBe(COOKIE);
	});

	// Quien copió .env.example para desarrollar sigue arrancando: la guarda es
	// del despliegue, no del entorno local.
	test("fuera de producción admite el marcador de la plantilla", async () => {
		const placeholder = examplePlaceholderOf("JWT_SECRET");
		const { env } = await importEnv({
			NODE_ENV: "development",
			JWT_SECRET: placeholder,
			COOKIE_SECRET: placeholder,
		});

		expect(env.JWT_SECRET).toBe(placeholder);
	});
});

describe("env.server — IP del cliente", () => {
	const PRODUCTION = {
		NODE_ENV: "production",
		JWT_SECRET: "jwt-secreto-propio-de-al-menos-32-caracteres",
		COOKIE_SECRET: "cookie-secreto-propio-de-al-menos-32-chars",
		APP_BASE_URL: "https://capacitacion.gob.mx",
	};

	// Sin declararla, el despliegue confiaría en una cabecera que no sabe quién
	// escribió: la fuente la elige quien conoce el proxy.
	test("en producción no arranca sin CLIENT_IP_SOURCE", async () => {
		await expect(importEnv(PRODUCTION)).rejects.toThrow(
			"CLIENT_IP_SOURCE es obligatoria en producción",
		);
	});

	test("en producción arranca con la fuente declarada", async () => {
		const { env } = await importEnv({
			...PRODUCTION,
			CLIENT_IP_SOURCE: "proxy",
			TRUSTED_PROXY_HOPS: "2",
		});

		expect(env.CLIENT_IP_SOURCE).toBe("proxy");
		expect(env.TRUSTED_PROXY_HOPS).toBe(2);
	});

	test("fuera de producción es opcional y los saltos valen 1", async () => {
		const { env } = await importEnv({ NODE_ENV: "development" });

		expect(env.CLIENT_IP_SOURCE).toBeUndefined();
		expect(env.TRUSTED_PROXY_HOPS).toBe(1);
	});

	test("rechaza una fuente desconocida", async () => {
		await expect(importEnv({ CLIENT_IP_SOURCE: "xff" })).rejects.toThrow(
			"CLIENT_IP_SOURCE",
		);
	});
});

// Remediación (Fase C): de ella salen los enlaces y el `Secure` de las cookies.
describe("env.server — origen público en producción", () => {
	const PRODUCTION = {
		NODE_ENV: "production",
		JWT_SECRET: "jwt-secreto-propio-de-al-menos-32-caracteres",
		COOKIE_SECRET: "cookie-secreto-propio-de-al-menos-32-chars",
		CLIENT_IP_SOURCE: "proxy",
	};

	test("no arranca sin APP_BASE_URL", async () => {
		await expect(importEnv(PRODUCTION)).rejects.toThrow(
			"APP_BASE_URL es obligatoria en producción",
		);
	});

	test("en Railway la deriva del dominio público", async () => {
		const { env } = await importEnv({
			...PRODUCTION,
			RAILWAY_PUBLIC_DOMAIN: "instituto-qa.up.railway.app",
		});

		expect(env.APP_BASE_URL).toBe("https://instituto-qa.up.railway.app");
	});

	test("fuera de producción sigue siendo opcional", async () => {
		const { env } = await importEnv({ NODE_ENV: "development" });

		expect(env.APP_BASE_URL).toBeUndefined();
	});
});

describe("env.server — buckets", () => {
	test("el público no puede ser el mismo que el privado", async () => {
		await expect(
			importEnv({
				STORAGE_BUCKET_NAME: "instituto",
				STORAGE_PUBLIC_BUCKET_NAME: "instituto",
			}),
		).rejects.toThrow("STORAGE_PUBLIC_BUCKET_NAME debe ser distinto");
	});

	test("dos buckets distintos arrancan", async () => {
		const { env } = await importEnv({
			STORAGE_BUCKET_NAME: "instituto-privado",
			STORAGE_PUBLIC_BUCKET_NAME: "instituto-publico",
		});

		expect(env.STORAGE_PUBLIC_BUCKET_NAME).toBe("instituto-publico");
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

	test("el pool de la base conserva el tope de pg y la espera de Prisma", async () => {
		const { env } = await importEnv({
			DATABASE_POOL_MAX: undefined,
			DATABASE_POOL_WAIT_MS: undefined,
		});

		expect(env.DATABASE_POOL_MAX).toBe(10);
		expect(env.DATABASE_POOL_WAIT_MS).toBe(2000);
	});

	test("lanza con un tope de pool que no es un entero positivo", async () => {
		await expect(importEnv({ DATABASE_POOL_MAX: "0" })).rejects.toThrow(
			"Invalid environment configuration",
		);
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

describe("env.server — correo", () => {
	test("SMTP_HOST sin remitente ni origen no arranca", async () => {
		await expect(importEnv({ SMTP_HOST: "smtp.example.com" })).rejects.toThrow(
			"SMTP_HOST requiere MAIL_FROM y APP_BASE_URL",
		);
	});

	test("APP_BASE_URL es un origen absoluto sin barra final", async () => {
		await expect(
			importEnv({ APP_BASE_URL: "http://localhost:5173/" }),
		).rejects.toThrow("APP_BASE_URL debe ser un origen absoluto");
	});

	test("sin APP_BASE_URL, el dominio público de Railway es el origen", async () => {
		const { env } = await importEnv({
			RAILWAY_PUBLIC_DOMAIN: "instituto.up.railway.app",
		});

		expect(env.APP_BASE_URL).toBe("https://instituto.up.railway.app");
	});

	test("APP_BASE_URL gana al dominio de Railway", async () => {
		const { env } = await importEnv({
			RAILWAY_PUBLIC_DOMAIN: "instituto.up.railway.app",
			APP_BASE_URL: "https://capacitacion.gob.mx",
		});

		expect(env.APP_BASE_URL).toBe("https://capacitacion.gob.mx");
	});

	test("con SMTP completo arranca", async () => {
		const { env } = await importEnv({
			SMTP_HOST: "localhost",
			SMTP_PORT: "1025",
			MAIL_FROM: "Instituto <no-responder@instituto.gob.mx>",
			APP_BASE_URL: "http://localhost:5173",
		});

		expect(env.SMTP_PORT).toBe(1025);
	});

	test("el worker no arranca en pruebas salvo que se pida", async () => {
		const { isEmailWorkerEnabled } = await importEnv({});

		expect(isEmailWorkerEnabled({ NODE_ENV: "test" })).toBe(false);
		expect(isEmailWorkerEnabled({ NODE_ENV: "production" })).toBe(true);
		expect(
			isEmailWorkerEnabled({
				NODE_ENV: "production",
				EMAIL_WORKER_ENABLED: "false",
			}),
		).toBe(false);
	});
});
