import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { CERTIFICATE_ERROR_CODES } from "../../domain/certificate.errors";
import type {
	InstitutionalLogo,
	NewInstitutionalLogo,
} from "../../domain/certificate.types";
import { createCertificateLogoService } from "../certificate-logos.service.server";

const NOW = new Date("2026-10-01T18:00:00.000Z");
const LOGO_DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const actorOf = (role = "SUPERADMIN"): AuthContext => ({
	userId: 1,
	documentId: "11111111-1111-4111-8111-111111111111",
	email: "admin@instituto.gob.mx",
	role: role as AuthContext["role"],
	dependencyId: null,
	isTrainer: false,
});

const logoOf = (
	overrides: Partial<InstitutionalLogo> = {},
): InstitutionalLogo => ({
	documentId: LOGO_DOC,
	name: "Logo a color",
	storageKey: "media/logos/color-1.png",
	contentType: "image/png",
	widthPx: 600,
	heightPx: 200,
	archivedAt: null,
	createdAt: NOW,
	previousDocumentId: null,
	...overrides,
});

/** Lo justo de un PNG para que se reconozca y se midan sus lados. */
const pngBytes = (width: number, height: number) => {
	const bytes = new Uint8Array(33);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
	bytes.set([0x49, 0x48, 0x44, 0x52], 12);
	new DataView(bytes.buffer).setUint32(16, width);
	new DataView(bytes.buffer).setUint32(20, height);
	return bytes;
};

const fileOf = (bytes: Uint8Array, name = "escudo.png") => ({
	name,
	type: "image/png",
	size: bytes.byteLength,
	arrayBuffer: async () => bytes.slice().buffer,
});

const createHarness = (logos: InstitutionalLogo[] = [logoOf()]) => {
	const calls = {
		created: [] as NewInstitutionalLogo[],
		replaced: [] as {
			previous: string;
			logo: NewInstitutionalLogo;
			at: Date;
		}[],
		archived: [] as { documentId: string; at: Date | null }[],
		uploaded: [] as { bucket: string; key: string; type?: string }[],
	};

	const certificateLogoRepository = {
		list: async () => logos,
		findByDocumentIds: async (ids: readonly string[]) =>
			logos.filter((logo) => ids.includes(logo.documentId)),
		create: async (logo: NewInstitutionalLogo) => {
			calls.created.push(logo);
			return logoOf({ ...logo, documentId: "nuevo" });
		},
		replace: async (previous: string, logo: NewInstitutionalLogo, at: Date) => {
			calls.replaced.push({ previous, logo, at });
			return logoOf({
				...logo,
				documentId: "sustituto",
				previousDocumentId: previous,
			});
		},
		setArchived: async (documentId: string, at: Date | null) => {
			calls.archived.push({ documentId, at });
		},
	} as unknown as ICradle["certificateLogoRepository"];

	const storageProvider = {
		uploadFile: async (
			bucket: string,
			key: string,
			_body: unknown,
			type?: string,
		) => {
			calls.uploaded.push({ bucket, key, type });
		},
	} as unknown as ICradle["storageProvider"];

	const service = createCertificateLogoService({
		certificateLogoRepository,
		storageProvider,
		storageBucket: "privado",
		storagePublicBucket: "publico",
		assetUrlResolver: (key: string) => `https://cdn.test/${key}`,
		clock: { now: () => NOW },
		logger: silentLogger,
	});
	return { service, calls };
};

describe("certificateLogoService.listForEditor", () => {
	test("los integrados primero y los subidos con su URL, archivados marcados", async () => {
		const { service } = createHarness([logoOf({ archivedAt: NOW })]);

		expect(await service.listForEditor()).toMatchObject({
			success: true,
			data: [
				{ id: "ayto-blanco", builtin: true, url: "/assets/aytoBco.png" },
				{
					id: LOGO_DOC,
					builtin: false,
					archived: true,
					url: "https://cdn.test/media/logos/color-1.png",
				},
			],
		});
	});
});

describe("certificateLogoService.upload", () => {
	test("sube al bucket público con la extensión real y crea la fila", async () => {
		const { service, calls } = createHarness();

		const result = await service.upload(
			"Escudo",
			fileOf(pngBytes(600, 200), "escudo.svg"),
			actorOf(),
		);

		expect(calls.uploaded[0]).toMatchObject({
			bucket: "publico",
			type: "image/png",
		});
		expect(calls.uploaded[0].key).toMatch(/^media\/logos\/escudo-\d+\.png$/);
		expect(calls.created[0]).toMatchObject({
			name: "Escudo",
			widthPx: 600,
			heightPx: 200,
			createdById: 1,
		});
		expect(result).toMatchObject({ success: true, data: { id: "nuevo" } });
	});

	test("rechaza lo que no es imagen sin subir", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.upload(
				"X",
				fileOf(new TextEncoder().encode("hola")),
				actorOf(),
			),
		).toMatchObject({ error: { code: CERTIFICATE_ERROR_CODES.LOGO_INVALID } });
		expect(calls.uploaded).toEqual([]);
	});

	test("solo la plataforma administra logos", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.upload(
				"X",
				fileOf(pngBytes(10, 10)),
				actorOf("DEPENDENCY_HEAD"),
			),
		).toMatchObject({ error: { code: CERTIFICATE_ERROR_CODES.FORBIDDEN } });
		expect(await service.list(actorOf("DEPENDENCY_HEAD"))).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.FORBIDDEN },
		});
		expect(calls.uploaded).toEqual([]);
	});

	test("sin bucket configurado es un error inesperado", async () => {
		const service = createCertificateLogoService({
			certificateLogoRepository: {} as ICradle["certificateLogoRepository"],
			storageProvider: {} as ICradle["storageProvider"],
			storageBucket: null,
			storagePublicBucket: null,
			assetUrlResolver: (key: string) => key,
			clock: { now: () => NOW },
			logger: silentLogger,
		});

		expect(
			await service.upload("X", fileOf(pngBytes(10, 10)), actorOf()),
		).toMatchObject({ success: false, error: { code: "UNEXPECTED_ERROR" } });
	});
});

describe("certificateLogoService.replace", () => {
	test("crea el sustituto con el mismo nombre y archiva el anterior", async () => {
		const { service, calls } = createHarness();

		const result = await service.replace(
			LOGO_DOC,
			fileOf(pngBytes(800, 300)),
			actorOf(),
		);

		expect(calls.replaced[0]).toMatchObject({
			previous: LOGO_DOC,
			logo: { name: "Logo a color", widthPx: 800 },
			at: NOW,
		});
		expect(result).toMatchObject({ success: true, data: { id: "sustituto" } });
	});

	test("un logo que no existe no se reemplaza ni se sube nada", async () => {
		const { service, calls } = createHarness([]);

		expect(
			await service.replace(LOGO_DOC, fileOf(pngBytes(10, 10)), actorOf()),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.LOGO_NOT_FOUND },
		});
		expect(calls.uploaded).toEqual([]);
	});
});

describe("certificateLogoService.setArchived", () => {
	test("archiva con la hora del reloj y restaura con null", async () => {
		const { service, calls } = createHarness();

		await service.setArchived(LOGO_DOC, true, actorOf());
		await service.setArchived(LOGO_DOC, false, actorOf());

		expect(calls.archived).toEqual([
			{ documentId: LOGO_DOC, at: NOW },
			{ documentId: LOGO_DOC, at: null },
		]);
	});

	test("un logo que no existe responde LOGO_NOT_FOUND", async () => {
		const { service } = createHarness([]);

		expect(await service.setArchived(LOGO_DOC, true, actorOf())).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.LOGO_NOT_FOUND },
		});
	});

	test("quien administra ve todos", async () => {
		const { service } = createHarness();

		expect((await service.list(actorOf())).success).toBe(true);
	});
});
