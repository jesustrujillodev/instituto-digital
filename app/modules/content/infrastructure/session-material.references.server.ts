import type { ICradle } from "@/shared/di/container.types";
import type { IObjectReferenceSource } from "@/shared/storage/object-reference.port";
import { toProxyRef } from "@/shared/storage/public-url";
import { SESSION_MATERIAL_PREFIX } from "../domain/content.config";

// `SessionMaterial` guarda la referencia del proxy, como `LessonContent`: se
// compara contra `toProxyRef(key)`.

type Dependencies = { prisma: ICradle["prisma"] };

const ROOT_PREFIX = `${SESSION_MATERIAL_PREFIX}/`;

export const createSessionMaterialReferenceSource = ({
	prisma,
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
						href: `/dashboard/capacitaciones/${row.session.course.documentId}`,
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
			return prefixes.includes(ROOT_PREFIX)
				? [{ prefix: ROOT_PREFIX, label: "Material de sesiones" }]
				: [];
		},
	};
};
