import type { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import { isDocumentIdSegment } from "@/shared/storage/object-key";
import type { IObjectReferenceSource } from "@/shared/storage/object-reference.port";
import { toProxyRef } from "@/shared/storage/public-url";
import { sessionMaterialReadWhere } from "../domain/content.access";
import { SESSION_MATERIAL_PREFIX } from "../domain/content.config";

// `SessionMaterial` guarda la referencia del proxy, como `LessonContent`: se
// compara contra `toProxyRef(key)`.

type Dependencies = { prisma: ICradle["prisma"]; clock: ICradle["clock"] };

const ROOT_PREFIX = `${SESSION_MATERIAL_PREFIX}/`;

/** El curso de la carpeta `<raíz>/<curso>/`, o null si no es de ese nivel. */
const courseOfFolder = (prefix: string): string | null => {
	if (!prefix.startsWith(ROOT_PREFIX)) return null;
	const [course, rest, ...more] = prefix.slice(ROOT_PREFIX.length).split("/");
	return isDocumentIdSegment(course) && rest === "" && more.length === 0
		? course
		: null;
};

const courseHrefOf = (courseDocumentId: string) =>
	`/dashboard/capacitaciones/${courseDocumentId}`;

export const createSessionMaterialReferenceSource = ({
	prisma,
	clock,
}: Dependencies): IObjectReferenceSource => {
	/** Referencia persistida → key. */
	const refsFor = (keys: readonly string[]) =>
		new Map(keys.map((key) => [toProxyRef(key), key]));

	return {
		async findByKeys(keys) {
			if (keys.length === 0) return [];

			const refs = refsFor(keys);
			const rows = await prisma.sessionMaterial.findMany({
				where: { fileUrl: { in: [...refs.keys()] } },
				select: {
					fileUrl: true,
					title: true,
					session: { select: { course: { select: { documentId: true } } } },
				},
			});

			return rows.flatMap((row) => {
				const key = row.fileUrl ? refs.get(row.fileUrl) : undefined;
				if (!key) return [];

				return [
					{
						key,
						owner: "session" as const,
						label: row.title,
						detail: "Material de una sesión",
						href: courseHrefOf(row.session.course.documentId),
					},
				];
			});
		},

		// Sin el archivo, la fila no enseña nada: se borra entera, no se vacía.
		async release(keys) {
			if (keys.length === 0) return 0;

			const { count } = await prisma.sessionMaterial.deleteMany({
				where: { fileUrl: { in: [...refsFor(keys).keys()] } },
			});

			return count;
		},

		async describeFolders(prefixes) {
			const roots = prefixes.includes(ROOT_PREFIX)
				? [{ prefix: ROOT_PREFIX, label: "Material de sesiones" }]
				: [];
			const folders = prefixes.flatMap((prefix) => {
				const course = courseOfFolder(prefix);
				return course ? [{ prefix, course }] : [];
			});
			if (folders.length === 0) return roots;

			const courses = await prisma.course.findMany({
				where: {
					documentId: { in: [...new Set(folders.map((f) => f.course))] },
				},
				select: { documentId: true, title: true },
			});
			const titles = new Map(
				courses.map((course) => [course.documentId, course.title]),
			);

			return [
				...roots,
				...folders.flatMap((folder) => {
					const label = titles.get(folder.course);
					return label
						? [
								{
									prefix: folder.prefix,
									label,
									href: courseHrefOf(folder.course),
								},
							]
						: [];
				}),
			];
		},

		async canRead(key, reader) {
			if (!key.startsWith(ROOT_PREFIX)) return false;

			const row = await prisma.sessionMaterial.findFirst({
				where: {
					AND: [
						{ fileUrl: toProxyRef(key) },
						sessionMaterialReadWhere(
							reader,
							clock.now(),
						) as Prisma.SessionMaterialWhereInput,
					],
				},
				select: { id: true },
			});

			return row !== null;
		},
	};
};
