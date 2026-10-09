import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { allInOrder } from "@/shared/concurrency/all-in-order";
import type { ICradle } from "@/shared/di/container.types";
import { JOB_NAMES } from "@/shared/queue/queue.config";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { buildObjectKey } from "@/shared/storage/object-key";
import { toProxyRef } from "@/shared/storage/public-url";
import {
	LESSON_MATERIAL_PREFIX,
	LESSON_UPLOAD_TTL_S,
} from "../domain/content.config";
import {
	ContentLessonNotFoundError,
	ContentModuleNotFoundError,
} from "../domain/content.errors";
import {
	toContentSummary,
	toCourseContentTree,
	toLessonMaterial,
} from "../domain/content.mapper";
import {
	assertContentDeletable,
	assertLessonLimit,
	assertMaterialMatchesLesson,
	assertModuleDeletable,
	assertModuleLimit,
	assertUploadAllowed,
	type LessonUploadKind,
	nextOrderOf,
	requireUploadedObject,
	resolveContentOrder,
	resolveDeleteOrder,
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
import { createContentCourseGate } from "./content-course.gate.server";
import { createMaterialStorage } from "./material-storage.server";

type Dependencies = {
	contentRepository: ICradle["contentRepository"];
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
	storageProvider: ICradle["storageProvider"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
	lessonMaterialReader: ICradle["lessonMaterialReader"];
	jobDispatcher: ICradle["jobDispatcher"];
};

export const createContentService = ({
	contentRepository,
	runInTransaction,
	clock,
	logger,
	storageProvider,
	storageBucket,
	storagePublicBucket,
	lessonMaterialReader,
	jobDispatcher,
}: Dependencies): IContentService => {
	const log = logger.child({ module: "content" });
	const run = createOperationRunner(log);

	const { requireBucketOf, discardObject } = createMaterialStorage({
		jobDispatcher,
		storageBucket,
		storagePublicBucket,
	});

	const { requireCourse, requireEditableCourse } =
		createContentCourseGate(contentRepository);

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

	/**
	 * Un cambio en qué lecciones cuentan mueve el porcentaje de todo inscrito.
	 * Con cola se recalcula tras el commit, unos segundos después; sin ella, en
	 * la misma transacción (docs/adr/0033). Solo en un curso publicado, que es
	 * el único que tiene avance en curso.
	 */
	const recalculateProgress = async (
		course: ContentCourseRef,
		actor: AuthContext,
		at: Date,
	) => {
		if (course.status !== "PUBLISHED") return;
		await jobDispatcher.dispatch(JOB_NAMES.recalculateProgress, {
			courseId: course.id,
			actorId: actor.userId,
			at: at.toISOString(),
		});
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

				const created = await contentRepository.createModule(course.id, {
					title: dto.title,
					description: dto.description,
					order: nextOrderOf(siblings),
				});

				return ok(created);
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
		async deleteModule(
			courseDocumentId: string,
			moduleDocumentId: string,
			actor: AuthContext,
		) {
			return run("deleteModule", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				assertContentDeletable(course.status);
				// Los hermanos solo dependen del curso: viajan con el módulo.
				const [module, siblings] = await allInOrder([
					requireModule(course.id, moduleDocumentId),
					contentRepository.findModuleSiblings(course.id),
				]);
				assertModuleDeletable(module);

				await runInTransaction(() =>
					contentRepository.deleteModule(
						module.id,
						resolveDeleteOrder(moduleDocumentId, siblings),
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

				const created = await runInTransaction(async () => {
					const lesson = await contentRepository.createLesson(module.id, {
						title: dto.title,
						type: dto.type,
						isRequired: dto.isRequired,
						estimatedMinutes: dto.estimatedMinutes,
						order: nextOrderOf(siblings),
					});
					await recalculateProgress(course, actor, clock.now());

					return lesson;
				});

				return ok(created);
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

				await runInTransaction(async () => {
					await contentRepository.updateLesson(lesson.id, {
						title: dto.title,
						type: dto.type,
						isRequired: dto.isRequired,
						estimatedMinutes: dto.estimatedMinutes,
					});
					if (lesson.isRequired !== dto.isRequired) {
						await recalculateProgress(course, actor, clock.now());
					}
				});

				return ok(null);
			});
		},
		async deleteLesson(
			courseDocumentId: string,
			lessonDocumentId: string,
			actor: AuthContext,
		) {
			return run("deleteLesson", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				assertContentDeletable(course.status);
				const lesson = await requireLesson(course.id, lessonDocumentId);
				const [siblings, material] = await Promise.all([
					contentRepository.findLessonSiblings(lesson.moduleId),
					contentRepository.findMaterialFileUrl(lesson.id),
				]);

				await runInTransaction(() =>
					contentRepository.deleteLesson(
						lesson.id,
						resolveDeleteOrder(lessonDocumentId, siblings),
					),
				);

				await discardObject(material);

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

				return ok(await lessonMaterialReader.sign(toLessonMaterial(raw)));
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

				// La fila anterior y el objeto subido no dependen uno del otro.
				const [previous, write] = await allInOrder([
					contentRepository.findMaterialFileUrl(lesson.id),
					resolveMaterialWrite(dto),
				]);

				await contentRepository.saveMaterial(lesson.id, write);
				if (previous !== write.fileUrl) await discardObject(previous);

				return ok(null);
			});
		},
	};
};
