import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { canEdit } from "@/modules/courses/domain/course.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { buildObjectKey } from "@/shared/storage/object-key";
import { toProxyRef } from "@/shared/storage/public-url";
import {
	LESSON_UPLOAD_TTL_S,
	SESSION_MATERIAL_PREFIX,
} from "../domain/content.config";
import {
	ContentCourseNotFoundError,
	ContentSessionMaterialNotFoundError,
	ContentSessionNotFoundError,
} from "../domain/content.errors";
import {
	assertUploadAllowed,
	requireUploadedObject,
} from "../domain/content.rules";
import {
	assertSessionMaterialLimit,
	assertSessionMaterialsEditable,
	isSessionMaterialAvailable,
	sessionMaterialCourseWhere,
} from "../domain/session-material.rules";
import type { ISessionMaterialService } from "../domain/session-material.service";
import type {
	CreateSessionMaterialDto,
	ParticipantSessionMaterial,
	SessionMaterial,
	SessionMaterialCourseRef,
	SessionMaterialRaw,
	SessionMaterialWrite,
} from "../domain/session-material.types";
import { createMaterialStorage } from "./material-storage.server";

type Dependencies = {
	sessionMaterialRepository: ICradle["sessionMaterialRepository"];
	lessonMaterialReader: ICradle["lessonMaterialReader"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
	storageProvider: ICradle["storageProvider"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
};

export const createSessionMaterialService = ({
	sessionMaterialRepository,
	lessonMaterialReader,
	clock,
	logger,
	storageProvider,
	storageBucket,
	storagePublicBucket,
}: Dependencies): ISessionMaterialService => {
	const log = logger.child({ module: "content" });
	const run = createOperationRunner(log);
	const { requireBucketOf, discardObject } = createMaterialStorage({
		storageProvider,
		storageBucket,
		storagePublicBucket,
		log,
	});

	/**
	 * Fuera de alcance responde igual que inexistente: quien no administra ni
	 * imparte el curso no confirma por URL que exista.
	 */
	const requireCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<SessionMaterialCourseRef> => {
		const where = sessionMaterialCourseWhere(actor);
		if (!where) throw new ContentCourseNotFoundError();

		const course = await sessionMaterialRepository.findCourse(
			courseDocumentId,
			where,
		);
		if (!course) throw new ContentCourseNotFoundError();
		return course;
	};

	const requireEditableCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	) => {
		const course = await requireCourse(courseDocumentId, actor);
		assertSessionMaterialsEditable(course.status);
		return course;
	};

	const sign = async (raw: SessionMaterialRaw): Promise<SessionMaterial> => {
		const signed = raw.fileUrl
			? await lessonMaterialReader.signReference(raw.fileUrl)
			: null;

		return signed
			? { ...raw, ...signed }
			: { ...raw, fileUrl: null, downloadUrl: null };
	};

	/** Cada tipo deja en `null` las columnas de los otros. */
	const resolveWrite = async (
		dto: CreateSessionMaterialDto,
	): Promise<SessionMaterialWrite> => {
		const common = {
			type: dto.type,
			title: dto.title,
			availableFromSession: dto.availableFromSession,
			fileUrl: null,
			fileName: null,
			fileSize: null,
			mimeType: null,
			externalUrl: null,
		};
		if (dto.type === "LINK") return { ...common, externalUrl: dto.externalUrl };

		// El objeto ya está en el bucket: aquí se confirma que llegó y que cabe,
		// que es el tope que la firma de subida no puede imponer.
		const object = requireUploadedObject(
			dto.type,
			await storageProvider.statObject(requireBucketOf(dto.key), dto.key),
		);

		return {
			...common,
			fileUrl: toProxyRef(dto.key),
			fileName: dto.fileName,
			fileSize: object.size,
			mimeType: dto.mimeType,
		};
	};

	return {
		async findBoard(courseDocumentId, actor) {
			return run("findBoard", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				const sessions = await sessionMaterialRepository.findSessions(
					course.id,
				);

				return ok({
					editable: canEdit(course.status),
					sessions: await Promise.all(
						sessions.map(async (session) => ({
							documentId: session.documentId,
							startsAt: session.startsAt,
							endsAt: session.endsAt,
							materials: await Promise.all(session.materials.map(sign)),
						})),
					),
				});
			});
		},

		async findForParticipant(courseDocumentId, actor) {
			return run("findForParticipant", async () => {
				const sessions =
					await sessionMaterialRepository.findSessionsForParticipant(
						courseDocumentId,
						actor.userId,
					);
				if (!sessions) return ok([]);

				const now = clock.now();

				return ok(
					await Promise.all(
						sessions.map(async (session) => ({
							sessionDocumentId: session.documentId,
							materials: await Promise.all(
								session.materials.map(
									async (raw): Promise<ParticipantSessionMaterial> =>
										isSessionMaterialAvailable(raw, session.startsAt, now)
											? { state: "available", ...(await sign(raw)) }
											: {
													state: "locked",
													documentId: raw.documentId,
													type: raw.type,
													title: raw.title,
													availableAt: session.startsAt,
												},
								),
							),
						})),
					),
				);
			});
		},

		async createUploadUrl(courseDocumentId, dto, actor) {
			return run("createUploadUrl", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				if (
					dto.sessionDocumentId &&
					!(await sessionMaterialRepository.findSession(
						course.id,
						dto.sessionDocumentId,
					))
				) {
					throw new ContentSessionNotFoundError();
				}
				assertUploadAllowed(dto.kind, {
					name: dto.fileName,
					type: dto.contentType,
					size: dto.size,
				});

				// La key la genera el servidor: nada de lo que mande el cliente
				// decide dónde cae el objeto.
				const key = buildObjectKey(SESSION_MATERIAL_PREFIX, dto.fileName);
				const uploadUrl = await storageProvider.getUploadUrl(
					requireBucketOf(key),
					key,
					{
						contentType: dto.contentType,
						expiresInSeconds: LESSON_UPLOAD_TTL_S,
					},
				);

				return ok({ key, uploadUrl, expiresInSeconds: LESSON_UPLOAD_TTL_S });
			});
		},

		async create(courseDocumentId, dto, actor) {
			return run("create", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const session = await sessionMaterialRepository.findSession(
					course.id,
					dto.sessionDocumentId,
				);
				if (!session) throw new ContentSessionNotFoundError();
				assertSessionMaterialLimit(session.materialCount);

				const created = await sessionMaterialRepository.create(
					session.id,
					await resolveWrite(dto),
				);

				return ok(created);
			});
		},

		async update(courseDocumentId, dto, actor) {
			return run("update", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const material = await sessionMaterialRepository.findMaterial(
					course.id,
					dto.materialDocumentId,
				);
				if (!material) throw new ContentSessionMaterialNotFoundError();

				await sessionMaterialRepository.update(material.id, {
					title: dto.title,
					availableFromSession: dto.availableFromSession,
				});

				return ok(null);
			});
		},

		async remove(courseDocumentId, dto, actor) {
			return run("remove", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const material = await sessionMaterialRepository.findMaterial(
					course.id,
					dto.materialDocumentId,
				);
				if (!material) throw new ContentSessionMaterialNotFoundError();

				await sessionMaterialRepository.remove(material.id);
				discardObject(material.fileUrl);

				return ok(null);
			});
		},
	};
};
