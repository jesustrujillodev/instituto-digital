import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import { COURSE_COVER } from "../../domain/course.config";
import { createCourseCoverReferenceSource } from "../course-cover.references.server";

const KEY = `${COURSE_COVER.prefix}/induccion-1700000000.webp`;
const OTHER = `${COURSE_COVER.prefix}/proteccion-1700000001.webp`;

describe("createCourseCoverReferenceSource", () => {
	test("busca por la referencia del proxy, que es lo que persiste Course", async () => {
		const asked: string[][] = [];
		const source = createCourseCoverReferenceSource({
			prisma: {
				course: {
					findMany: async (args: {
						where: { coverImageUrl: { in: string[] } };
					}) => {
						asked.push(args.where.coverImageUrl.in);
						return [
							{
								documentId: "doc-induccion",
								title: "Inducción al servicio público",
								coverImageUrl: toProxyRef(KEY),
							},
						];
					},
				},
			} as unknown as ICradle["prisma"],
		});

		const references = await source.findByKeys([KEY, OTHER]);

		expect(asked).toEqual([[toProxyRef(KEY), toProxyRef(OTHER)]]);
		expect(references).toEqual([
			{
				key: KEY,
				owner: "course",
				label: "Inducción al servicio público",
				detail: "Portada del curso",
				href: "/dashboard/cursos/doc-induccion/editar",
			},
		]);
	});

	test("una fila sin portada no produce referencia", async () => {
		// Defensa del `flatMap`: si la consulta devolviera algo que no casa con
		// ninguna key pedida, inventar una referencia marcaría como usado un
		// objeto que nadie usa.
		const source = createCourseCoverReferenceSource({
			prisma: {
				course: {
					findMany: async () => [
						{ documentId: "doc", title: "Curso", coverImageUrl: null },
					],
				},
			} as unknown as ICradle["prisma"],
		});

		expect(await source.findByKeys([KEY])).toEqual([]);
	});

	test("sin keys no consulta la base", async () => {
		let queried = false;
		const source = createCourseCoverReferenceSource({
			prisma: {
				course: {
					findMany: async () => {
						queried = true;
						return [];
					},
				},
			} as unknown as ICradle["prisma"],
		});

		expect(await source.findByKeys([])).toEqual([]);
		expect(queried).toBe(false);
	});

	test("release suelta la portada del curso y cuenta las filas", async () => {
		const writes: unknown[] = [];
		const source = createCourseCoverReferenceSource({
			prisma: {
				course: {
					updateMany: async (args: unknown) => {
						writes.push(args);
						return { count: 2 };
					},
				},
			} as unknown as ICradle["prisma"],
		});

		expect(await source.release([KEY, OTHER])).toBe(2);
		expect(writes).toEqual([
			{
				where: { coverImageUrl: { in: [toProxyRef(KEY), toProxyRef(OTHER)] } },
				data: { coverImageUrl: null },
			},
		]);
	});

	test("release sin keys no escribe nada", async () => {
		let wrote = false;
		const source = createCourseCoverReferenceSource({
			prisma: {
				course: {
					updateMany: async () => {
						wrote = true;
						return { count: 0 };
					},
				},
			} as unknown as ICradle["prisma"],
		});

		expect(await source.release([])).toBe(0);
		expect(wrote).toBe(false);
	});

	test("solo reconoce su carpeta, no `media/` entera", async () => {
		const source = createCourseCoverReferenceSource({
			prisma: {} as ICradle["prisma"],
		});

		expect(
			await source.describeFolders([
				"media/",
				"profile-photos/",
				`${COURSE_COVER.prefix}/`,
			]),
		).toEqual([
			{ prefix: `${COURSE_COVER.prefix}/`, label: "Portadas de cursos" },
		]);
	});
});
