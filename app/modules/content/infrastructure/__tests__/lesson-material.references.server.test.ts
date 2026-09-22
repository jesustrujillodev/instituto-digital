import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import { LESSON_MATERIAL_PREFIX } from "../../domain/content.config";
import { createLessonMaterialReferenceSource } from "../lesson-material.references.server";

const KEY = `${LESSON_MATERIAL_PREFIX}/manual-1700000000.pdf`;
const OTHER = `${LESSON_MATERIAL_PREFIX}/clase-1700000001.mp4`;
const COURSE_DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const rowOf = (fileUrl: string | null) => ({
	fileUrl,
	lesson: {
		title: "Qué es la transparencia",
		module: { course: { documentId: COURSE_DOC } },
	},
});

describe("material de lecciones como referencias de storage", () => {
	test("busca por la referencia del proxy, que es lo que persiste la fila", async () => {
		let asked: unknown;
		const prisma = {
			lessonContent: {
				findMany: async (args: { where: { fileUrl: { in: string[] } } }) => {
					asked = args.where.fileUrl.in;
					return [rowOf(toProxyRef(KEY))];
				},
			},
		} as unknown as ICradle["prisma"];

		const source = createLessonMaterialReferenceSource({ prisma });

		expect(await source.findByKeys([KEY, OTHER])).toEqual([
			{
				key: KEY,
				owner: "lesson",
				label: "Qué es la transparencia",
				detail: "Material de la lección",
				href: `/dashboard/cursos/${COURSE_DOC}/contenido`,
			},
		]);
		expect(asked).toEqual([toProxyRef(KEY), toProxyRef(OTHER)]);
	});

	test("una fila vaciada por release no produce referencia", async () => {
		const prisma = {
			lessonContent: { findMany: async () => [rowOf(null)] },
		} as unknown as ICradle["prisma"];

		const source = createLessonMaterialReferenceSource({ prisma });

		expect(await source.findByKeys([KEY])).toEqual([]);
	});

	test("sin keys no consulta la base", async () => {
		let queried = false;
		const prisma = {
			lessonContent: {
				findMany: async () => {
					queried = true;
					return [];
				},
			},
		} as unknown as ICradle["prisma"];

		const source = createLessonMaterialReferenceSource({ prisma });

		expect(await source.findByKeys([])).toEqual([]);
		expect(queried).toBe(false);
	});

	test("release suelta el material y cuenta las filas", async () => {
		let args: unknown;
		const prisma = {
			lessonContent: {
				updateMany: async (input: unknown) => {
					args = input;
					return { count: 2 };
				},
			},
		} as unknown as ICradle["prisma"];

		const source = createLessonMaterialReferenceSource({ prisma });

		expect(await source.release([KEY, OTHER])).toBe(2);
		expect(args).toEqual({
			where: { fileUrl: { in: [toProxyRef(KEY), toProxyRef(OTHER)] } },
			data: {
				fileUrl: null,
				fileName: null,
				fileSize: null,
				mimeType: null,
			},
		});
	});

	test("release sin keys no escribe nada", async () => {
		let wrote = false;
		const prisma = {
			lessonContent: {
				updateMany: async () => {
					wrote = true;
					return { count: 0 };
				},
			},
		} as unknown as ICradle["prisma"];

		const source = createLessonMaterialReferenceSource({ prisma });

		expect(await source.release([])).toBe(0);
		expect(wrote).toBe(false);
	});

	test("solo reconoce su carpeta, no `documentos/` entera", async () => {
		const source = createLessonMaterialReferenceSource({
			prisma: {} as unknown as ICradle["prisma"],
		});

		expect(
			await source.describeFolders([
				"documentos/",
				"media/",
				`${LESSON_MATERIAL_PREFIX}/`,
			]),
		).toEqual([
			{ prefix: `${LESSON_MATERIAL_PREFIX}/`, label: "Material de lecciones" },
		]);
	});
});
