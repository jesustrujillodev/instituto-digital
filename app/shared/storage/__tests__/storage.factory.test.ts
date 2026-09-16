import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Env } from "@/core/env.server";
import type { Logger } from "@/shared/logging/logger";
import type { StorageConfig } from "../storage.port";

// Los adaptadores construyen un cliente del SDK (S3Client / Storage) en cuanto se
// invocan, así que se sustituyen por dobles: lo que se prueba aquí es el ARMADO
// del config y la seleccion de proveedor, no el SDK.
vi.mock("../s3.adapter", () => ({
	createS3StorageProvider: vi.fn((config: StorageConfig) => ({
		__provider: "s3",
		config,
	})),
}));
vi.mock("../gcs.adapter", () => ({
	createGcsStorageProvider: vi.fn((config: StorageConfig) => ({
		__provider: "gcs",
		config,
	})),
}));

const { createGcsStorageProvider } = await import("../gcs.adapter");
const { createS3StorageProvider } = await import("../s3.adapter");
const { createStorageProvider, createStorageProviderFromEnv } = await import(
	"../storage.factory"
);

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const envOf = (overrides: Partial<Env> = {}): Env =>
	({
		STORAGE_BUCKET_NAME: "mi-bucket",
		...overrides,
	}) as Env;

/** Config con el que se llamó al adaptador en la última invocación. */
const configPassedTo = (adapter: unknown): StorageConfig =>
	(adapter as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as StorageConfig;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("createStorageProvider", () => {
	test("dispatches to the GCS adapter when the provider is gcs", () => {
		createStorageProvider({ provider: "gcs" }, silentLogger);

		expect(createGcsStorageProvider).toHaveBeenCalledTimes(1);
		expect(createS3StorageProvider).not.toHaveBeenCalled();
	});

	// S3 es el default: cualquier valor que no sea "gcs" —incluido ninguno— cae al
	// adaptador de S3 y compatibles (MinIO, R2, Spaces).
	test("falls back to the S3 adapter for anything else", () => {
		createStorageProvider({ provider: "s3" }, silentLogger);
		createStorageProvider({}, silentLogger);

		expect(createS3StorageProvider).toHaveBeenCalledTimes(2);
		expect(createGcsStorageProvider).not.toHaveBeenCalled();
	});

	test("passes the logger through to the adapter", () => {
		createStorageProvider({ provider: "s3" }, silentLogger);

		expect(createS3StorageProvider).toHaveBeenCalledWith(
			expect.anything(),
			silentLogger,
		);
	});
});

describe("createStorageProviderFromEnv — S3", () => {
	test("is the default when STORAGE_PROVIDER is not set", () => {
		createStorageProviderFromEnv(envOf(), silentLogger);

		expect(createS3StorageProvider).toHaveBeenCalledTimes(1);
	});

	test("maps every S3 variable into the config", () => {
		createStorageProviderFromEnv(
			envOf({
				STORAGE_PROVIDER: "s3",
				STORAGE_REGION: "eu-west-1",
				STORAGE_ACCESS_KEY_ID: "AKIA",
				STORAGE_SECRET_ACCESS_KEY: "secreto",
			}),
			silentLogger,
		);

		expect(configPassedTo(createS3StorageProvider)).toMatchObject({
			provider: "s3",
			region: "eu-west-1",
			accessKeyId: "AKIA",
			secretAccessKey: "secreto",
			defaultBucket: "mi-bucket",
		});
	});

	// Las variables booleanas llegan como string del entorno: solo el literal
	// "true" activa el flag, y cualquier otra cosa lo deja en false.
	test("derives forcePathStyle from the literal string true", () => {
		createStorageProviderFromEnv(
			envOf({ STORAGE_FORCE_PATH_STYLE: "true" }),
			silentLogger,
		);
		expect(configPassedTo(createS3StorageProvider).forcePathStyle).toBe(true);

		createStorageProviderFromEnv(
			envOf({ STORAGE_FORCE_PATH_STYLE: "1" }),
			silentLogger,
		);
		expect(configPassedTo(createS3StorageProvider).forcePathStyle).toBe(false);
	});

	// Solo se añaden si están presentes: forzar un endpoint vacío contra AWS real
	// rompería la resolución del host del bucket.
	test("omits endpoint when it is not configured", () => {
		createStorageProviderFromEnv(envOf(), silentLogger);

		expect("endpoint" in configPassedTo(createS3StorageProvider)).toBe(false);
	});

	test("includes endpoint when it is configured", () => {
		createStorageProviderFromEnv(
			envOf({ STORAGE_ENDPOINT: "http://localhost:9000" }),
			silentLogger,
		);

		expect(configPassedTo(createS3StorageProvider)).toMatchObject({
			endpoint: "http://localhost:9000",
		});
	});

	// El dominio público no es asunto del adaptador: decide cómo se PINTA una
	// URL, no cómo se habla con el proveedor. Lo consume el resolutor del
	// contenedor, así que no debe colarse en el StorageConfig.
	test("never leaks the public domain into the adapter config", () => {
		createStorageProviderFromEnv(
			envOf({ STORAGE_PUBLIC_DOMAIN: "https://cdn.example.com" }),
			silentLogger,
		);

		expect("publicDomain" in configPassedTo(createS3StorageProvider)).toBe(
			false,
		);
	});

	// El adaptador espera strings: las credenciales ausentes viajan como "" y no
	// como undefined, para que el SDK falle con un mensaje suyo y no con un
	// TypeError.
	test("normalises missing credentials to empty strings", () => {
		createStorageProviderFromEnv(envOf(), silentLogger);

		expect(configPassedTo(createS3StorageProvider)).toMatchObject({
			region: "",
			accessKeyId: "",
			secretAccessKey: "",
		});
	});
});

describe("createStorageProviderFromEnv — GCS", () => {
	test("selects the GCS adapter when STORAGE_PROVIDER is gcs", () => {
		createStorageProviderFromEnv(
			envOf({ STORAGE_PROVIDER: "gcs" }),
			silentLogger,
		);

		expect(createGcsStorageProvider).toHaveBeenCalledTimes(1);
		expect(createS3StorageProvider).not.toHaveBeenCalled();
	});

	test("maps the credential sources into the config", () => {
		createStorageProviderFromEnv(
			envOf({
				STORAGE_PROVIDER: "gcs",
				GCS_CREDENTIALS_PATH: "/keys/sa.json",
				GCS_CREDENTIALS_BASE64: "YmFzZTY0",
			}),
			silentLogger,
		);

		expect(configPassedTo(createGcsStorageProvider)).toMatchObject({
			provider: "gcs",
			credentialsPath: "/keys/sa.json",
			credentialsBase64: "YmFzZTY0",
			defaultBucket: "mi-bucket",
		});
	});

	test("derives useEmulator from the literal string true", () => {
		createStorageProviderFromEnv(
			envOf({
				STORAGE_PROVIDER: "gcs",
				USE_GCS_EMULATOR: "true",
				GCS_EMULATOR_HOST: "http://localhost:4443",
			}),
			silentLogger,
		);

		expect(configPassedTo(createGcsStorageProvider)).toMatchObject({
			useEmulator: true,
			emulatorHost: "http://localhost:4443",
		});
	});

	test("useEmulator is false for any other value", () => {
		createStorageProviderFromEnv(
			envOf({ STORAGE_PROVIDER: "gcs", USE_GCS_EMULATOR: "yes" }),
			silentLogger,
		);

		expect(configPassedTo(createGcsStorageProvider).useEmulator).toBe(false);
	});
});
