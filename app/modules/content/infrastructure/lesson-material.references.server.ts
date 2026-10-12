import type { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import { isDocumentIdSegment } from "@/shared/storage/object-key";
import type { IObjectReferenceSource } from "@/shared/storage/object-reference.port";
import { toProxyRef } from "@/shared/storage/public-url";
import { lessonMaterialReadWhere } from "../domain/content.access";
import { LESSON_MATERIAL_PREFIX } from "../domain/content.config";

// ===============================================================
// Material de lecciones como referencias de storage
// ===============================================================
// `LessonContent` no guarda la key sino la referencia del proxy
// (`/api/storage?key=…`), así que se compara contra `toProxyRef(key)`: produce
// exactamente lo que se persistió al confirmar la subida.

type Dependencies = { prisma: ICradle["prisma"] };

const ROOT_PREFIX = `${LESSON_MATERIAL_PREFIX}/`;

/**
 * La carpeta `<raíz>/<curso>/` o `<raíz>/<curso>/<lección>/`. Cualquier otro
 * nombre no lo emitió la subida, y en una columna uuid haría fallar la consulta.
 */
const folderOf = (prefix: string) => {
	if (!prefix.startsWith(ROOT_PREFIX)) return null;
	const [course, second, third, ...rest] = prefix
		.slice(ROOT_PREFIX.length)
		.split("/");
	if (rest.length > 0 || !isDocumentIdSegment(course)) return null;
	if (second === "" && third === undefined) return { course, lesson: null };
	return isDocumentIdSegment(second) && third === ""
		? { course, lesson: second }
		: null;
};

const contentHrefOf = (courseDocumentId: string) =>
	`/dashboard/capacitaciones/${courseDocumentId}/contenido`;

export const createLessonMaterialReferenceSource = ({
	prisma,
}: Dependencies): IObjectReferenceSource => {
	/** Referencia persistida → key. */
	const refsFor = (keys: readonly string[]) =>
		new Map(keys.map((key) => [toProxyRef(key), key]));

	return {
		async findByKeys(keys) {
			if (keys.length === 0) return [];

			const refs = refsFor(keys);
			const rows = await prisma.lessonContent.findMany({
				where: { fileUrl: { in: [...refs.keys()] } },
				select: {
					fileUrl: true,
					lesson: {
						select: {
							title: true,
							module: { select: { course: { select: { documentId: true } } } },
						},
					},
				},
			});

			return rows.flatMap((row) => {
				const key = row.fileUrl ? refs.get(row.fileUrl) : undefined;
				if (!key) return [];

				return [
					{
						key,
						owner: "lesson" as const,
						label: row.lesson.title,
						detail: "Material de la lección",
						href: contentHrefOf(row.lesson.module.course.documentId),
					},
				];
			});
		},

		async release(keys) {
			if (keys.length === 0) return 0;

			// Sin transacción explícita: es UNA sentencia y cada lección tiene un
			// solo material, así que no hay nada que dejar a medias.
			const { count } = await prisma.lessonContent.updateMany({
				where: { fileUrl: { in: [...refsFor(keys).keys()] } },
				data: {
					fileUrl: null,
					fileName: null,
					fileSize: null,
					mimeType: null,
				},
			});

			return count;
		},

		async describeFolders(prefixes) {
			const roots = prefixes.includes(ROOT_PREFIX)
				? [{ prefix: ROOT_PREFIX, label: "Material de lecciones" }]
				: [];
			const folders = prefixes.flatMap((prefix) => {
				const folder = folderOf(prefix);
				return folder ? [{ prefix, ...folder }] : [];
			});
			if (folders.length === 0) return roots;

			const courseIds = [
				...new Set(folders.filter((f) => !f.lesson).map((f) => f.course)),
			];
			const lessonIds = [
				...new Set(folders.flatMap((f) => (f.lesson ? [f.lesson] : []))),
			];
			const [courses, lessons] = await Promise.all([
				courseIds.length === 0
					? []
					: prisma.course.findMany({
							where: { documentId: { in: courseIds } },
							select: { documentId: true, title: true },
						}),
				lessonIds.length === 0
					? []
					: prisma.lesson.findMany({
							where: { documentId: { in: lessonIds } },
							select: {
								documentId: true,
								title: true,
								module: {
									select: { course: { select: { documentId: true } } },
								},
							},
						}),
			]);

			const courseTitles = new Map(
				courses.map((course) => [course.documentId, course.title]),
			);
			// La lección cuenta solo dentro de la carpeta de SU curso.
			const lessonTitles = new Map(
				lessons.map((lesson) => [
					`${lesson.module.course.documentId}/${lesson.documentId}`,
					lesson.title,
				]),
			);

			return [
				...roots,
				...folders.flatMap((folder) => {
					const label = folder.lesson
						? lessonTitles.get(`${folder.course}/${folder.lesson}`)
						: courseTitles.get(folder.course);
					return label
						? [
								{
									prefix: folder.prefix,
									label,
									href: contentHrefOf(folder.course),
								},
							]
						: [];
				}),
			];
		},

		async canRead(key, reader) {
			if (!key.startsWith(ROOT_PREFIX)) return false;

			const row = await prisma.lessonContent.findFirst({
				where: {
					AND: [
						{ fileUrl: toProxyRef(key) },
						lessonMaterialReadWhere(reader) as Prisma.LessonContentWhereInput,
					],
				},
				select: { id: true },
			});

			return row !== null;
		},
	};
};
