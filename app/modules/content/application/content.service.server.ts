import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	type CourseScope,
	courseScopeWriteWhere,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import { canEdit } from "@/modules/courses/domain/course.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { buildObjectKey } from "@/shared/storage/object-key";
import { toProxyRef } from "@/shared/storage/public-url";
import { bucketForKey } from "@/shared/storage/storage.policy";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import {
	LESSON_MATERIAL_PREFIX,
	LESSON_PLAYBACK_TTL_S,
	LESSON_UPLOAD_TTL_S,
} from "../domain/content.config";
import {
	ContentCourseNotEditableError,
	ContentCourseNotFoundError,
	ContentLessonNotFoundError,
	ContentModuleNotFoundError,
} from "../domain/content.errors";
import {
	toContentSummary,
	toCourseContentTree,
	toLessonMaterial,
} from "../domain/content.mapper";
import {
	assertLessonLimit,
	assertMaterialMatchesLesson,
	assertModuleArchivable,
	assertModuleLimit,
	assertUploadAllowed,
	type LessonUploadKind,
	nextOrderOf,
	requireUploadedObject,
	resolveArchiveOrder,
	resolveContentOrder,
} from "../domain/content.rules";
import type { IContentService } from "../domain/content.service";
import type {
	ContentCourseRef,
	CreateLessonDto,
	CreateModuleDto,
	LessonMaterialWrite,
	ReorderContentDto,
	SaveMaterialDto,
	UpdateLessonDto,
	UpdateModuleDto,
	UploadUrlDto,
} from "../domain/content.types";

type Dependencies = {
	contentRepository: ICradle["contentRepository"];
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
	storageProvider: ICradle["storageProvider"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
};

export const createContentService = ({
	contentRepository,
	runInTransaction,
	clock,
	logger,
	storageProvider,
	storageBucket,
	storagePublicBucket,
}: Dependencies): IContentService => {
	const log = logger.child({ module: "content" });
	const run = createOperationRunner(log);

	// Error de configuración, no de negocio: sale como UNEXPECTED con su mensaje
	// real, que es lo que necesita quien opera.
	const requireBucketOf = (key: string): string => {
		if (!storageBucket) throw new Error("STORAGE_BUCKET_NAME no configurado");

		return bucketForKey(key, {
			defaultBucket: storageBucket,
			publicBucket: storagePublicBucket,
		});
	};

	/**
	 * Borra el objeto anterior, best-effort y DESPUÉS de escribir.
	 *
	 * Un objeto que ya no está no puede tumbar un guardado que ya ocurrió; si el
	 * borrado falla queda un huérfano, que el gestor de nube sabe detectar.
	 */
	const discardObject = (reference: string | null) => {
		if (!reference || !storageBucket) return;

		const key = getKeyFromUrl(reference);
		if (!key) return;

		void storageProvider
			.deleteFile(requireBucketOf(key), key)
			.catch((error) => {
				log.warn("[content] material anterior no borrado", { key, error });
			});
	};

	/**
	 * Fuera de alcance responde igual que inexistente: quien no administra el
	 * curso no confirma por URL que exista.
	 */
	const requireCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ContentCourseRef> => {
		const scope: CourseScope = resolveCourseScope(actor);
		const where = courseScopeWriteWhere(scope);
		if (!where) throw new ContentCourseNotFoundError();

		const course = await contentRepository.findCourse(courseDocumentId, where);
		if (!course) throw new ContentCourseNotFoundError();
		return course;
	};

	/** El temario solo cambia mientras el curso admite edición. */
	const requireEditableCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ContentCourseRef> => {
		const course = await requireCourse(courseDocumentId, actor);
		if (!canEdit(course.status)) {
			throw new ContentCourseNotEditableError(course.status);
		}
		return course;
	};

	const requireModule = async (courseId: number, moduleDocumentId: string) => {
		const module = await contentRepository.findModule(
			courseId,
			moduleDocumentId,
		);
		if (!module) throw new ContentModuleNotFoundError();
		return module;
	};

	const requireLesson = async (courseId: number, lessonDocumentId: string) => {
		const lesson = await contentRepository.findLesson(
			courseId,
			lessonDocumentId,
		);
		if (!lesson) throw new ContentLessonNotFoundError();
		return lesson;
	};

	const readTree = async (courseId: number) =>
		toCourseContentTree(await contentRepository.findTree(courseId));

	const EMPTY_MATERIAL: LessonMaterialWrite = {
		body: null,
		fileUrl: null,
		fileName: null,
		fileSize: null,
		mimeType: null,
		externalUrl: null,
	};

	/**
	 * Lo que se escribe en la fila, por clase de material.
	 *
	 * Cada clase deja las columnas de las otras en `null`: cambiar el tipo de una
	 * lección no puede dejar colgando el material anterior.
	 */
	const resolveMaterialWrite = async (
		dto: SaveMaterialDto,
	): Promise<LessonMaterialWrite> => {
		if (dto.type === "TEXT") return { ...EMPTY_MATERIAL, body: dto.body };
		if (dto.type === "LINK") {
			return { ...EMPTY_MATERIAL, externalUrl: dto.externalUrl };
		}

		// El objeto ya está en el bucket: aquí se confirma que llegó y que cabe,
		// que es el tope que la firma de subida no puede imponer.
		const object = requireUploadedObject(
			dto.type satisfies LessonUploadKind,
			await storageProvider.statObject(requireBucketOf(dto.key), dto.key),
		);

		return {
			...EMPTY_MATERIAL,
			fileUrl: toProxyRef(dto.key),
			fileName: dto.fileName,
			fileSize: object.size,
			mimeType: dto.mimeType,
		};
	};

	return {
		async findTree(courseDocumentId: string, actor: AuthContext) {
			return run("findTree", async () => {
				const course = await requireCourse(courseDocumentId, actor);

				return ok(await readTree(course.id));
			});
		},
		async summarize(courseDocumentId: string, actor: AuthContext) {
			return run("summarize", async () => {
				const course = await requireCourse(courseDocumentId, actor);

				return ok(toContentSummary(await readTree(course.id)));
			});
		},
		async createModule(
			courseDocumentId: string,
			dto: CreateModuleDto,
			actor: AuthContext,
		) {
			return run("createModule", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const siblings = await contentRepository.findModuleSiblings(course.id);
				assertModuleLimit(siblings.length);

				await contentRepository.createModule(course.id, {
					title: dto.title,
					description: dto.description,
					order: nextOrderOf(siblings),
				});

				return ok(null);
			});
		},
		async updateModule(
			courseDocumentId: string,
			dto: UpdateModuleDto,
			actor: AuthContext,
		) {
			return run("updateModule", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const module = await requireModule(course.id, dto.moduleDocumentId);

				await contentRepository.updateModule(module.id, {
					title: dto.title,
					description: dto.description,
				});

				return ok(null);
			});
		},
		async archiveModule(
			courseDocumentId: string,
			moduleDocumentId: string,
			actor: AuthContext,
		) {
			return run("archiveModule", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const module = await requireModule(course.id, moduleDocumentId);
				assertModuleArchivable(module.activeLessons);

				const siblings = await contentRepository.findModuleSiblings(course.id);

				await runInTransaction(() =>
					contentRepository.archiveModule(
						module.id,
						clock.now(),
						resolveArchiveOrder(moduleDocumentId, siblings),
					),
				);

				return ok(null);
			});
		},
		async createLesson(
			courseDocumentId: string,
			dto: CreateLessonDto,
			actor: AuthContext,
		) {
			return run("createLesson", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const module = await requireModule(course.id, dto.moduleDocumentId);
				const siblings = await contentRepository.findLessonSiblings(module.id);
				assertLessonLimit(siblings.length);

				await contentRepository.createLesson(module.id, {
					title: dto.title,
					type: dto.type,
					isRequired: dto.isRequired,
					estimatedMinutes: dto.estimatedMinutes,
					order: nextOrderOf(siblings),
				});

				return ok(null);
			});
		},
		async updateLesson(
			courseDocumentId: string,
			dto: UpdateLessonDto,
			actor: AuthContext,
		) {
			return run("updateLesson", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const lesson = await requireLesson(course.id, dto.lessonDocumentId);

				await contentRepository.updateLesson(lesson.id, {
					title: dto.title,
					type: dto.type,
					isRequired: dto.isRequired,
					estimatedMinutes: dto.estimatedMinutes,
				});

				return ok(null);
			});
		},
		async archiveLesson(
			courseDocumentId: string,
			lessonDocumentId: string,
			actor: AuthContext,
		) {
			return run("archiveLesson", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const lesson = await requireLesson(course.id, lessonDocumentId);
				const siblings = await contentRepository.findLessonSiblings(
					lesson.moduleId,
				);
				const material = await contentRepository.findMaterialFileUrl(lesson.id);

				await runInTransaction(() =>
					contentRepository.archiveLesson(
						lesson.id,
						clock.now(),
						resolveArchiveOrder(lessonDocumentId, siblings),
					),
				);

				discardObject(material);

				return ok(null);
			});
		},
		async reorder(
			courseDocumentId: string,
			dto: ReorderContentDto,
			actor: AuthContext,
		) {
			return run("reorder", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const writes = resolveContentOrder(await readTree(course.id), dto);

				await runInTransaction(() => contentRepository.saveOrder(writes));

				return ok(null);
			});
		},
		async findMaterial(
			courseDocumentId: string,
			lessonDocumentId: string,
			actor: AuthContext,
		) {
			return run("findMaterial", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				const raw = await contentRepository.findMaterial(
					course.id,
					lessonDocumentId,
				);
				if (!raw) throw new ContentLessonNotFoundError();

				const material = toLessonMaterial(raw);
				const key = material.fileUrl ? getKeyFromUrl(material.fileUrl) : null;
				if (!key) return ok(material);

				// Se firma aquí y en cada carga: la key cruda no viaja al cliente, y
				// el reproductor recibe una URL que aguanta el video entero sin
				// volver a pasar por el servidor en cada salto.
				const bucket = requireBucketOf(key);
				const [fileUrl, downloadUrl] = await Promise.all([
					storageProvider.getPresignedUrl(bucket, key, LESSON_PLAYBACK_TTL_S),
					storageProvider.getPresignedUrl(bucket, key, LESSON_PLAYBACK_TTL_S, {
						disposition: "attachment",
					}),
				]);

				return ok({ ...material, fileUrl, downloadUrl });
			});
		},
		async createUploadUrl(
			courseDocumentId: string,
			dto: UploadUrlDto,
			actor: AuthContext,
		) {
			return run("createUploadUrl", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				await requireLesson(course.id, dto.lessonDocumentId);
				assertUploadAllowed(dto.kind, {
					name: dto.fileName,
					type: dto.contentType,
					size: dto.size,
				});

				// La key la genera el servidor: nada de lo que mande el cliente
				// decide dónde cae el objeto.
				const key = buildObjectKey(LESSON_MATERIAL_PREFIX, dto.fileName);
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
		async saveMaterial(
			courseDocumentId: string,
			dto: SaveMaterialDto,
			actor: AuthContext,
		) {
			return run("saveMaterial", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const lesson = await requireLesson(course.id, dto.lessonDocumentId);
				assertMaterialMatchesLesson(lesson.type, dto.type);

				const previous = await contentRepository.findMaterialFileUrl(lesson.id);
				const write = await resolveMaterialWrite(dto);

				await contentRepository.saveMaterial(lesson.id, write);
				if (previous !== write.fileUrl) discardObject(previous);

				return ok(null);
			});
		},
	};
};
