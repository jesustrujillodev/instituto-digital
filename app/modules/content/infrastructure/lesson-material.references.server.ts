import type { ICradle } from "@/shared/di/container.types";
import type { IObjectReferenceSource } from "@/shared/storage/object-reference.port";
import { toProxyRef } from "@/shared/storage/public-url";
import { LESSON_MATERIAL_PREFIX } from "../domain/content.config";

// ===============================================================
// Material de lecciones como referencias de storage
// ===============================================================
// `LessonContent` no guarda la key sino la referencia del proxy
// (`/api/storage?key=…`), así que se compara contra `toProxyRef(key)`: produce
// exactamente lo que se persistió al confirmar la subida.

type Dependencies = { prisma: ICradle["prisma"] };

const ROOT_PREFIX = `${LESSON_MATERIAL_PREFIX}/`;

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
						href: `/dashboard/cursos/${row.lesson.module.course.documentId}/contenido`,
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
			return prefixes.includes(ROOT_PREFIX)
				? [{ prefix: ROOT_PREFIX, label: "Material de lecciones" }]
				: [];
		},
	};
};
