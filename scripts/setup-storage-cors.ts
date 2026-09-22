/**
 * Abre el CORS de los buckets para la subida firmada de material de lecciones.
 *
 * El navegador escribe directo en el bucket con una URL firmada de `PUT`
 * (docs/storage §5.5). Eso dispara un preflight `OPTIONS` que el bucket rechaza
 * si no tiene una regla que permita `PUT` y la cabecera `Content-Type`; el
 * síntoma en pantalla es «No se pudo conectar con el almacenamiento».
 *
 *   bun run storage:cors            aplica
 *   bun run storage:cors --dry-run  enseña lo que haría y no toca nada
 *
 * Se corre una vez por bucket, no en cada despliegue.
 *
 * El cliente se arma aquí en vez de reutilizar el adaptador del proyecto para no
 * arrastrar el contenedor ni el resto de la app a un script de mantenimiento.
 */
import { writeFileSync } from "node:fs";
import {
	type CORSRule,
	GetBucketCorsCommand,
	PutBucketCorsCommand,
	S3Client,
	type S3ClientConfig,
} from "@aws-sdk/client-s3";

const DRY_RUN = process.argv.includes("--dry-run");

const {
	STORAGE_PROVIDER,
	STORAGE_BUCKET_NAME,
	STORAGE_PUBLIC_BUCKET_NAME,
	STORAGE_REGION,
	STORAGE_ENDPOINT,
	STORAGE_ACCESS_KEY_ID,
	STORAGE_SECRET_ACCESS_KEY,
	STORAGE_FORCE_PATH_STYLE,
	CORS_ALLOWED_ORIGINS,
	APP_URL,
} = process.env;

/**
 * El CORS es una operación de BUCKET, no de objeto.
 *
 * Las credenciales de la aplicación suelen ser de objeto —en R2, un token
 * «Object Read & Write»— y responden 403 a `GetBucketCors`. Si existen, se usan
 * las de administración solo para este script; si no, se intenta con las de la
 * app y el error explica qué falta.
 */
const ACCESS_KEY =
	process.env.STORAGE_ADMIN_ACCESS_KEY_ID ?? STORAGE_ACCESS_KEY_ID;
const SECRET_KEY =
	process.env.STORAGE_ADMIN_SECRET_ACCESS_KEY ?? STORAGE_SECRET_ACCESS_KEY;

if (STORAGE_PROVIDER === "gcs") {
	console.error(
		"Este script es para S3. En GCS: gcloud storage buckets update gs://<bucket> --cors-file=cors.json\n" +
			'con [{"origin":[…],"method":["GET","HEAD","PUT"],"responseHeader":["content-type"],"maxAgeSeconds":3600}]',
	);
	process.exit(1);
}

if (
	!STORAGE_BUCKET_NAME ||
	!STORAGE_ACCESS_KEY_ID ||
	!STORAGE_SECRET_ACCESS_KEY
) {
	console.error(
		"Falta configuración de storage. Revisa STORAGE_BUCKET_NAME, STORAGE_ACCESS_KEY_ID y STORAGE_SECRET_ACCESS_KEY.",
	);
	process.exit(1);
}

/**
 * Orígenes autorizados. `CORS_ALLOWED_ORIGINS` (separados por comas) manda; si
 * no, se deduce de `APP_URL` y siempre se añade el dev local.
 */
const resolveOrigins = (): string[] => {
	if (CORS_ALLOWED_ORIGINS) {
		return CORS_ALLOWED_ORIGINS.split(",")
			.map((origin) => origin.trim())
			.filter(Boolean);
	}

	const origins = ["http://localhost:5173", "http://localhost:3000"];
	if (APP_URL && !APP_URL.includes("localhost")) {
		origins.push(APP_URL.replace(/\/+$/, ""));
	}

	return origins;
};

const ORIGINS = resolveOrigins();

/** La regla que este script gestiona. Se reconoce por su `ID` para poder reemplazarla. */
const RULE_ID = "instituto-browser-access";

const desiredRule: CORSRule = {
	ID: RULE_ID,
	AllowedOrigins: ORIGINS,
	// `PUT` para la subida firmada; `GET`/`HEAD` para el ZIP del gestor de nube y
	// para los rangos que pide el reproductor de video.
	AllowedMethods: ["GET", "HEAD", "PUT"],
	// `Content-Type` va firmado en el `PUT`, así que el preflight lo pregunta.
	AllowedHeaders: ["*"],
	// Sin `Content-Range` y `Accept-Ranges` visibles, el reproductor concluye que
	// el bucket no admite rangos y no puede saltar dentro del video.
	ExposeHeaders: [
		"Content-Range",
		"Content-Length",
		"Accept-Ranges",
		"Content-Type",
		"ETag",
	],
	MaxAgeSeconds: 3600,
};

const client = new S3Client({
	region: STORAGE_REGION ?? "auto",
	credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } as {
		accessKeyId: string;
		secretAccessKey: string;
	},
	...(STORAGE_ENDPOINT
		? {
				endpoint: STORAGE_ENDPOINT,
				forcePathStyle: STORAGE_FORCE_PATH_STYLE !== "false",
			}
		: {}),
} satisfies S3ClientConfig);

/** Lo que el bucket tiene hoy, o `null` si nunca se le puso CORS. */
const readCurrent = async (bucket: string): Promise<CORSRule[] | null> => {
	try {
		const current = await client.send(
			new GetBucketCorsCommand({ Bucket: bucket }),
		);
		return current.CORSRules ?? [];
	} catch (error) {
		const name = (error as { name?: string }).name;
		if (name === "NoSuchCORSConfiguration" || name === "NotImplemented") {
			return null;
		}
		throw error;
	}
};

/**
 * Aplica la regla sin perder lo que ya hubiera.
 *
 * `PutBucketCors` **reemplaza la configuración entera**, así que sobrescribir a
 * ciegas se llevaría por delante cualquier regla que alguien pusiera a mano. Se
 * conservan todas menos la que este script gestiona, que se sustituye.
 */
const apply = async (bucket: string, label: string) => {
	console.info(`\n── ${label}: ${bucket} ──`);

	const current = await readCurrent(bucket);

	if (current === null) {
		console.info("Sin CORS configurado (o el proveedor no lo implementa).");
	} else {
		console.info(`Reglas actuales: ${current.length}`);
		for (const rule of current) {
			console.info(
				`  · ${rule.ID ?? "(sin id)"} — ${rule.AllowedMethods?.join(", ")} desde ${rule.AllowedOrigins?.join(", ")}`,
			);
		}
	}

	const preserved = (current ?? []).filter((rule) => rule.ID !== RULE_ID);
	const next = [...preserved, desiredRule];

	if (current !== null && preserved.length < (current?.length ?? 0)) {
		console.info(`Se reemplaza la regla "${RULE_ID}" que ya existía.`);
	}

	if (DRY_RUN) {
		console.info("\n--dry-run: esto es lo que se escribiría:");
		console.info(JSON.stringify(next, null, 2));
		return;
	}

	// Copia de seguridad antes de escribir: `PutBucketCors` no se deshace y esta
	// es la única forma de volver a lo que había.
	if (current !== null && current.length > 0) {
		const backup = `cors-backup-${bucket}-${Date.now()}.json`;
		writeFileSync(backup, JSON.stringify(current, null, 2));
		console.info(`Respaldo de lo anterior en ${backup}`);
	}

	await client.send(
		new PutBucketCorsCommand({
			Bucket: bucket,
			CORSConfiguration: { CORSRules: next },
		}),
	);

	console.info(`CORS aplicado. Orígenes: ${ORIGINS.join(", ")}`);
};

const buckets: [string, string][] = [[STORAGE_BUCKET_NAME, "Bucket privado"]];
if (
	STORAGE_PUBLIC_BUCKET_NAME &&
	STORAGE_PUBLIC_BUCKET_NAME !== STORAGE_BUCKET_NAME
) {
	buckets.push([STORAGE_PUBLIC_BUCKET_NAME, "Bucket público"]);
}

try {
	for (const [bucket, label] of buckets) {
		await apply(bucket, label);
	}
	console.info("\nListo.");
} catch (error) {
	const name = (error as { name?: string }).name;

	// MinIO acepta cualquier origen y en algunas versiones no implementa
	// PutBucketCors: en local no hay nada que arreglar.
	if (name === "NotImplemented") {
		console.info(
			"\nEl proveedor no implementa PutBucketCors (MinIO). No hace falta: ya permite cualquier origen.",
		);
	} else if (name === "AccessDenied") {
		console.error(
			[
				"",
				"Acceso denegado. El CORS es una operación de BUCKET y las credenciales",
				"de la aplicación son de objeto: no alcanzan.",
				"",
				"Dos salidas:",
				"",
				"  a) Un token de administración, solo para este script:",
				"",
				"       STORAGE_ADMIN_ACCESS_KEY_ID=… STORAGE_ADMIN_SECRET_ACCESS_KEY=… bun run storage:cors",
				"",
				"     En Cloudflare R2: R2 → API → Create API Token → Admin Read & Write.",
				"",
				"  b) Pegarlo a mano en el panel (R2 → el bucket → Settings → CORS Policy):",
				"",
				JSON.stringify([desiredRule], null, 2),
			].join("\n"),
		);
		process.exit(1);
	} else {
		console.error("\nNo se pudo aplicar el CORS:", error);
		process.exit(1);
	}
}
