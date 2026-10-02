import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { contentTypeForKey } from "@/shared/storage/mime";
import { buildObjectKey } from "@/shared/storage/object-key";
import { resolveAssetRef, toProxyRef } from "@/shared/storage/public-url";
import { bucketForKey } from "@/shared/storage/storage.policy";
import type { UploadInput } from "@/shared/storage/upload-validation";
import {
	CertificateForbiddenError,
	CertificateLogoInvalidError,
	CertificateLogoNotFoundError,
} from "../domain/certificate.errors";
import type {
	InstitutionalLogo,
	LogoOption,
} from "../domain/certificate.types";
import { assetFileNameOf } from "../domain/certificate-assets.rules";
import {
	canManageLogos,
	INSTITUTIONAL_LOGO,
} from "../domain/certificate-logo.rules";
import type { ICertificateLogoService } from "../domain/certificate-logo.service";
import { BUILTIN_LOGOS } from "../domain/design/logos";
import { inspectImage } from "./inspect-image.server";

type Dependencies = {
	certificateLogoRepository: ICradle["certificateLogoRepository"];
	storageProvider: ICradle["storageProvider"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
	assetUrlResolver: ICradle["assetUrlResolver"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

const BUILTIN_OPTIONS: LogoOption[] = BUILTIN_LOGOS.map((logo) => ({
	id: logo.id,
	name: logo.name,
	url: logo.path,
	widthPx: logo.widthPx,
	heightPx: logo.heightPx,
	builtin: true,
	archived: false,
}));

export const createCertificateLogoService = ({
	certificateLogoRepository,
	storageProvider,
	storageBucket,
	storagePublicBucket,
	assetUrlResolver,
	clock,
	logger,
}: Dependencies): ICertificateLogoService => {
	const run = createOperationRunner(
		logger.child({ module: "certificates", feature: "logos" }),
	);

	const toOption = (logo: InstitutionalLogo): LogoOption => ({
		id: logo.documentId,
		name: logo.name,
		url:
			resolveAssetRef(assetUrlResolver, toProxyRef(logo.storageKey)) ??
			toProxyRef(logo.storageKey),
		widthPx: logo.widthPx,
		heightPx: logo.heightPx,
		builtin: false,
		archived: logo.archivedAt !== null,
	});

	const requireManager = (actor: AuthContext) => {
		if (!canManageLogos(actor)) throw new CertificateForbiddenError();
	};

	/** Valida, guarda en `media/logos/` y devuelve lo que la fila necesita. */
	const store = async (file: UploadInput, name: string, actor: AuthContext) => {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const inspected = inspectImage(bytes, INSTITUTIONAL_LOGO);
		if ("rejection" in inspected) {
			throw new CertificateLogoInvalidError(inspected.rejection);
		}
		// Error de configuración, no de negocio: sale como UNEXPECTED.
		if (!storageBucket) throw new Error("STORAGE_BUCKET_NAME no configurado");

		const key = buildObjectKey(
			INSTITUTIONAL_LOGO.prefix,
			assetFileNameOf(file.name, inspected.type),
		);
		await storageProvider.uploadFile(
			bucketForKey(key, {
				defaultBucket: storageBucket,
				publicBucket: storagePublicBucket,
			}),
			key,
			bytes,
			contentTypeForKey(key),
		);
		return {
			name,
			storageKey: key,
			contentType: contentTypeForKey(key),
			widthPx: inspected.widthPx,
			heightPx: inspected.heightPx,
			createdById: actor.userId,
		};
	};

	return {
		async list(actor) {
			return run("list", async () => {
				requireManager(actor);
				const logos = await certificateLogoRepository.list();
				return ok([...BUILTIN_OPTIONS, ...logos.map(toOption)]);
			});
		},

		async listForEditor() {
			return run("listForEditor", async () => {
				const logos = await certificateLogoRepository.list();
				return ok([...BUILTIN_OPTIONS, ...logos.map(toOption)]);
			});
		},

		async upload(name, file, actor) {
			return run("upload", async () => {
				requireManager(actor);
				const logo = await certificateLogoRepository.create(
					await store(file, name, actor),
				);
				return ok(toOption(logo));
			});
		},

		/**
		 * El sustituto es una fila nueva: los certificados emitidos siguen
		 * nombrando al anterior y lo siguen pintando.
		 */
		async replace(documentId, file, actor) {
			return run("replace", async () => {
				requireManager(actor);
				const [previous] = await certificateLogoRepository.findByDocumentIds([
					documentId,
				]);
				if (!previous) throw new CertificateLogoNotFoundError();

				const logo = await certificateLogoRepository.replace(
					documentId,
					await store(file, previous.name, actor),
					clock.now(),
				);
				return ok(toOption(logo));
			});
		},

		async setArchived(documentId, archived, actor) {
			return run("setArchived", async () => {
				requireManager(actor);
				const [logo] = await certificateLogoRepository.findByDocumentIds([
					documentId,
				]);
				if (!logo) throw new CertificateLogoNotFoundError();

				await certificateLogoRepository.setArchived(
					documentId,
					archived ? clock.now() : null,
				);
				return ok(null);
			});
		},
	};
};
