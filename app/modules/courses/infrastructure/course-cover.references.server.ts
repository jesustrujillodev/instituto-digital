import type { ICradle } from "@/shared/di/container.types";
import type { IObjectReferenceSource } from "@/shared/storage/object-reference.port";
import { toProxyRef } from "@/shared/storage/public-url";
import { COURSE_COVER } from "../domain/course.config";

// ===============================================================
// Portadas de cursos como referencias de storage
// ===============================================================
// `Course` no guarda la key sino la referencia del proxy (`/api/storage?key=…`),
// así que se compara contra `toProxyRef(key)`: produce exactamente lo que
// persistió `getPublicUrl` al subir la portada.

type Dependencies = {
	prisma: ICradle["prisma"];
};

const ROOT_PREFIX = `${COURSE_COVER.prefix}/`;

export const createCourseCoverReferenceSource = ({
	prisma,
}: Dependencies): IObjectReferenceSource => {
	/** Referencia persistida → key. */
	const refsFor = (keys: readonly string[]) =>
		new Map(keys.map((key) => [toProxyRef(key), key]));

	return {
		async findByKeys(keys) {
			if (keys.length === 0) return [];

			const refs = refsFor(keys);
			const courses = await prisma.course.findMany({
				where: { coverImageUrl: { in: [...refs.keys()] } },
				select: { documentId: true, title: true, coverImageUrl: true },
			});

			return courses.flatMap((course) => {
				const key = course.coverImageUrl
					? refs.get(course.coverImageUrl)
					: undefined;
				if (!key) return [];

				return [
					{
						key,
						owner: "course" as const,
						label: course.title,
						detail: "Portada del curso",
						href: `/dashboard/cursos/${course.documentId}/editar`,
					},
				];
			});
		},

		async release(keys) {
			if (keys.length === 0) return 0;

			// Sin transacción explícita: es UNA sentencia y cada curso solo tiene una
			// portada, así que no hay nada que dejar a medias.
			const { count } = await prisma.course.updateMany({
				where: { coverImageUrl: { in: [...refsFor(keys).keys()] } },
				data: { coverImageUrl: null },
			});

			return count;
		},

		async describeFolders(prefixes) {
			return prefixes.includes(ROOT_PREFIX)
				? [{ prefix: ROOT_PREFIX, label: "Portadas de cursos" }]
				: [];
		},
	};
};
