import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import { lessonMaterialReadWhere } from "../../domain/content.access";
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
				href: `/dashboard/capacitaciones/${COURSE_DOC}/contenido`,
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

	describe("carpetas por curso y por lección", () => {
		const LESSON_DOC = "33333333-3333-4333-8333-333333333333";
		const COURSE_FOLDER = `${LESSON_MATERIAL_PREFIX}/${COURSE_DOC}/`;
		const LESSON_FOLDER = `${COURSE_FOLDER}${LESSON_DOC}/`;

		const prismaOf = (
			lessonCourse: string,
			asked: { courses?: unknown; lessons?: unknown } = {},
		) =>
			({
				course: {
					findMany: async (args: { where: unknown }) => {
						asked.courses = args.where;
						return [{ documentId: COURSE_DOC, title: "Transparencia" }];
					},
				},
				lesson: {
					findMany: async (args: { where: unknown }) => {
						asked.lessons = args.where;
						return [
							{
								documentId: LESSON_DOC,
								title: "Marco legal",
								module: { course: { documentId: lessonCourse } },
							},
						];
					},
				},
			}) as unknown as ICradle["prisma"];

		test("nombra la del curso y la de la lección con sus títulos, en una fase", async () => {
			const asked: { courses?: unknown; lessons?: unknown } = {};
			const source = createLessonMaterialReferenceSource({
				prisma: prismaOf(COURSE_DOC, asked),
			});

			expect(
				await source.describeFolders([
					`${LESSON_MATERIAL_PREFIX}/`,
					COURSE_FOLDER,
					LESSON_FOLDER,
				]),
			).toEqual([
				{
					prefix: `${LESSON_MATERIAL_PREFIX}/`,
					label: "Material de lecciones",
				},
				{
					prefix: COURSE_FOLDER,
					label: "Transparencia",
					href: `/dashboard/capacitaciones/${COURSE_DOC}/contenido`,
				},
				{
					prefix: LESSON_FOLDER,
					label: "Marco legal",
					href: `/dashboard/capacitaciones/${COURSE_DOC}/contenido`,
				},
			]);
			expect(asked).toEqual({
				courses: { documentId: { in: [COURSE_DOC] } },
				lessons: { documentId: { in: [LESSON_DOC] } },
			});
		});

		test("una lección de otro curso no nombra la carpeta", async () => {
			const source = createLessonMaterialReferenceSource({
				prisma: prismaOf("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
			});

			expect(await source.describeFolders([LESSON_FOLDER])).toEqual([]);
		});

		// En una columna uuid, un nombre cualquiera haría fallar la consulta.
		test("una carpeta que no emitió la subida no consulta la base", async () => {
			const source = createLessonMaterialReferenceSource({
				prisma: {} as unknown as ICradle["prisma"],
			});

			expect(
				await source.describeFolders([
					`${LESSON_MATERIAL_PREFIX}/viejos/`,
					`${COURSE_FOLDER}otra/`,
					`${LESSON_FOLDER}mas/`,
				]),
			).toEqual([]);
		});
	});

	// C06: el proxy pregunta aquí si quien pide puede leer el material.
	describe("canRead", () => {
		const READER = {
			userId: 9,
			role: "USER" as const,
			dependencyId: 3,
			isTrainer: false,
		};

		test("busca la fila por su referencia y con el alcance de quien pide", async () => {
			let where: unknown;
			const source = createLessonMaterialReferenceSource({
				prisma: {
					lessonContent: {
						findFirst: async (args: { where: unknown }) => {
							where = args.where;
							return { id: 1 };
						},
					},
				} as unknown as ICradle["prisma"],
			});

			expect(await source.canRead(KEY, READER)).toBe(true);
			expect(where).toEqual({
				AND: [{ fileUrl: toProxyRef(KEY) }, lessonMaterialReadWhere(READER)],
			});
		});

		test("sin fila al alcance, no", async () => {
			const source = createLessonMaterialReferenceSource({
				prisma: {
					lessonContent: { findFirst: async () => null },
				} as unknown as ICradle["prisma"],
			});

			expect(await source.canRead(KEY, READER)).toBe(false);
		});

		test("una key de otra carpeta no consulta la base", async () => {
			const source = createLessonMaterialReferenceSource({
				prisma: {} as unknown as ICradle["prisma"],
			});

			expect(
				await source.canRead("documentos/sesiones/acta-1.pdf", READER),
			).toBe(false);
		});
	});
});
