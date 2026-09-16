import "dotenv/config";
import * as v from "valibot";

// ── Environment validation (fail-fast) ─────────────────────────────────────────
// Parsed ONCE at module load. If a required variable is missing or malformed the
// process throws immediately with a clear message — the app never runs with a
// missing/empty secret (see docs/auth/00-sistema-autenticacion.md §4).

const positiveInt = (defaultValue: number) =>
	v.pipe(
		v.optional(v.string(), String(defaultValue)),
		v.transform(Number),
		v.integer("must be an integer"),
		v.minValue(1, "must be >= 1"),
	);

const secret = (name: string) =>
	v.pipe(
		v.string(`${name} is required`),
		v.minLength(32, `${name} must be at least 32 characters long`),
	);

const baseEnvSchema = v.object({
	DATABASE_URL: v.pipe(v.string("DATABASE_URL is required"), v.minLength(1)),
	JWT_SECRET: secret("JWT_SECRET"),
	COOKIE_SECRET: secret("COOKIE_SECRET"),
	NODE_ENV: v.optional(
		v.picklist(["development", "test", "production"]),
		"development",
	),

	// ── Auth TTLs — single source of truth for tokens AND cookie maxAge ────────
	// Este TTL es también la LATENCIA MÁXIMA DE UNA REVOCACIÓN: el middleware
	// confía en el access token sin consultar la base de datos, así que una
	// sesión revocada sigue navegando hasta que el suyo expira. Subirlo ahorra
	// refreshes; bajarlo acorta esa ventana (ver docs/auth §6.5).
	AUTH_ACCESS_TOKEN_TTL_S: positiveInt(5 * 60), // 5 min
	AUTH_REFRESH_TOKEN_TTL_S: positiveInt(7 * 24 * 60 * 60), // 7 días
	AUTH_REFRESH_GRACE_S: positiveInt(60), // ventana de gracia del refresh

	// ── JWT claims ──────────────────────────────────────────────────────────────
	AUTH_JWT_ISSUER: v.optional(v.string(), "instituto-digital"),
	AUTH_JWT_AUDIENCE: v.optional(v.string(), "instituto-digital"),

	// ── Login rate limiting ─────────────────────────────────────────────────────
	AUTH_LOGIN_MAX_PER_EMAIL: positiveInt(5),
	AUTH_LOGIN_MAX_PER_IP: positiveInt(20),
	AUTH_LOGIN_WINDOW_S: positiveInt(60),

	// ── Sesiones ────────────────────────────────────────────────────────────────
	// Cap de sesiones activas por usuario; al exceder se elimina la más antigua.
	AUTH_MAX_SESSIONS_PER_USER: positiveInt(5),

	// ── Estado de seguridad (epoch de revocación) ───────────────────────────────
	// El TTL de esta caché ES la ventana de propagación del corte entre nodos.
	// 0 sería inmediato pero costaría una lectura por petición; 5 s deja el corte
	// 60 veces más rápido que AUTH_ACCESS_TOKEN_TTL_S manteniendo el coste del
	// caso normal en cero (docs/auth/02-revocacion-inmediata-epoch.md).
	AUTH_SECURITY_STATE_CACHE_TTL_S: positiveInt(5),

	// ── Storage (almacenamiento de objetos) ──────────────────────────────────────
	// Todas opcionales a nivel de campo; la exigencia real es CONDICIONAL al
	// proveedor (ver los v.check de abajo). Si STORAGE_PROVIDER no se define, la
	// feature de storage simplemente queda inactiva y la app arranca igual.
	STORAGE_PROVIDER: v.optional(v.picklist(["s3", "gcs"])),
	STORAGE_BUCKET_NAME: v.optional(v.string()),
	// S3 / compatibles (MinIO, R2, Spaces)
	STORAGE_REGION: v.optional(v.string()),
	STORAGE_ENDPOINT: v.optional(v.string()),
	STORAGE_ACCESS_KEY_ID: v.optional(v.string()),
	STORAGE_SECRET_ACCESS_KEY: v.optional(v.string()),
	STORAGE_FORCE_PATH_STYLE: v.optional(v.string()),
	STORAGE_PUBLIC_DOMAIN: v.optional(v.string()),
	STORAGE_PUBLIC_BUCKET_NAME: v.optional(v.string()),
	// GCS
	GCS_CREDENTIALS_PATH: v.optional(v.string()),
	GCS_CREDENTIALS_BASE64: v.optional(v.string()),
	USE_GCS_EMULATOR: v.optional(v.string()),
	GCS_EMULATOR_HOST: v.optional(v.string()),

	// ── Tema ────────────────────────────────────────────────────────────────────
	/**
	 * Archivo donde se guarda la última copia del tema activo, para que un
	 * proceso que arranca con la base caída siga sirviendo la marca en vez del
	 * tema base. Relativa al directorio de trabajo. En un contenedor, montar un
	 * volumen en esa ruta hace que la copia sobreviva también a un redeploy.
	 */
	THEME_SNAPSHOT_PATH: v.optional(
		v.pipe(v.string(), v.minLength(1)),
		".cache/theme/active-theme.json",
	),
});

// Validación condicional al proveedor: fail-fast al boot si el proveedor está
// seleccionado pero le faltan variables, en lugar de descubrirlo con un 500 en
// runtime (coherente con la filosofía fail-fast del resto del env).
const envSchema = v.pipe(
	baseEnvSchema,
	v.forward(
		v.check(
			(input) =>
				input.STORAGE_PROVIDER !== "s3" ||
				Boolean(
					input.STORAGE_REGION &&
						input.STORAGE_ACCESS_KEY_ID &&
						input.STORAGE_SECRET_ACCESS_KEY &&
						input.STORAGE_BUCKET_NAME,
				),
			"STORAGE_PROVIDER=s3 requiere STORAGE_REGION, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY y STORAGE_BUCKET_NAME",
		),
		["STORAGE_PROVIDER"],
	),
	v.forward(
		v.check(
			(input) =>
				input.STORAGE_PROVIDER !== "gcs" ||
				Boolean(
					input.STORAGE_BUCKET_NAME &&
						(input.GCS_CREDENTIALS_BASE64 ||
							input.GCS_CREDENTIALS_PATH ||
							input.USE_GCS_EMULATOR === "true"),
				),
			"STORAGE_PROVIDER=gcs requiere STORAGE_BUCKET_NAME y una fuente de credenciales (GCS_CREDENTIALS_BASE64, GCS_CREDENTIALS_PATH o USE_GCS_EMULATOR=true)",
		),
		["STORAGE_PROVIDER"],
	),
	// La dependencia es de UNA sola dirección: el dominio exige el bucket, no al
	// revés.
	//
	// Un Custom Domain se monta sobre el bucket ENTERO, no sobre un prefijo, así
	// que un dominio sobre el bucket único publicaría también lo privado
	// (`documentos/`). Eso no debe arrancar.
	//
	// El bucket público SIN dominio, en cambio, es seguro y útil: los objetos de
	// `media/` ya viven separados y se sirven por el proxy como siempre. Es el
	// paso previo natural — cuando el dominio exista, basta con añadirlo y no hay
	// nada que mover.
	v.forward(
		v.check(
			(input) =>
				!input.STORAGE_PUBLIC_DOMAIN ||
				Boolean(input.STORAGE_PUBLIC_BUCKET_NAME),
			"STORAGE_PUBLIC_DOMAIN exige STORAGE_PUBLIC_BUCKET_NAME: un dominio público sobre el bucket único expondría los prefijos privados",
		),
		["STORAGE_PUBLIC_DOMAIN"],
	),
	// Origen absoluto: el resolutor lo concatena con la key tal cual. En
	// producción se exige https; en desarrollo se admite http para poder probar
	// el modo CDN contra MinIO.
	v.forward(
		v.check(
			(input) =>
				!input.STORAGE_PUBLIC_DOMAIN ||
				(input.NODE_ENV === "production"
					? /^https:\/\/[^/]+/
					: /^https?:\/\/[^/]+/
				).test(input.STORAGE_PUBLIC_DOMAIN),
			"STORAGE_PUBLIC_DOMAIN debe ser un origen absoluto (https:// en producción), p. ej. https://cdn.tudominio.com",
		),
		["STORAGE_PUBLIC_DOMAIN"],
	),
);

export type Env = v.InferOutput<typeof envSchema>;

const result = v.safeParse(envSchema, {
	DATABASE_URL: process.env.DATABASE_URL,
	JWT_SECRET: process.env.JWT_SECRET,
	COOKIE_SECRET: process.env.COOKIE_SECRET,
	NODE_ENV: process.env.NODE_ENV,
	AUTH_ACCESS_TOKEN_TTL_S: process.env.AUTH_ACCESS_TOKEN_TTL_S,
	AUTH_REFRESH_TOKEN_TTL_S: process.env.AUTH_REFRESH_TOKEN_TTL_S,
	AUTH_REFRESH_GRACE_S: process.env.AUTH_REFRESH_GRACE_S,
	AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER,
	AUTH_JWT_AUDIENCE: process.env.AUTH_JWT_AUDIENCE,
	AUTH_LOGIN_MAX_PER_EMAIL: process.env.AUTH_LOGIN_MAX_PER_EMAIL,
	AUTH_LOGIN_MAX_PER_IP: process.env.AUTH_LOGIN_MAX_PER_IP,
	AUTH_LOGIN_WINDOW_S: process.env.AUTH_LOGIN_WINDOW_S,
	AUTH_MAX_SESSIONS_PER_USER: process.env.AUTH_MAX_SESSIONS_PER_USER,
	AUTH_SECURITY_STATE_CACHE_TTL_S: process.env.AUTH_SECURITY_STATE_CACHE_TTL_S,

	STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
	STORAGE_BUCKET_NAME: process.env.STORAGE_BUCKET_NAME,
	STORAGE_REGION: process.env.STORAGE_REGION,
	STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
	STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
	STORAGE_SECRET_ACCESS_KEY: process.env.STORAGE_SECRET_ACCESS_KEY,
	STORAGE_FORCE_PATH_STYLE: process.env.STORAGE_FORCE_PATH_STYLE,
	STORAGE_PUBLIC_DOMAIN: process.env.STORAGE_PUBLIC_DOMAIN,
	STORAGE_PUBLIC_BUCKET_NAME: process.env.STORAGE_PUBLIC_BUCKET_NAME,
	GCS_CREDENTIALS_PATH: process.env.GCS_CREDENTIALS_PATH,
	GCS_CREDENTIALS_BASE64: process.env.GCS_CREDENTIALS_BASE64,
	USE_GCS_EMULATOR: process.env.USE_GCS_EMULATOR,
	GCS_EMULATOR_HOST: process.env.GCS_EMULATOR_HOST,

	THEME_SNAPSHOT_PATH: process.env.THEME_SNAPSHOT_PATH,
});

if (!result.success) {
	const details = result.issues
		.map((issue) => {
			const path = issue.path?.map((p) => String(p.key)).join(".") ?? "?";
			return `  - ${path}: ${issue.message}`;
		})
		.join("\n");
	throw new Error(`❌ Invalid environment configuration:\n${details}`);
}

export const env: Env = result.output;
