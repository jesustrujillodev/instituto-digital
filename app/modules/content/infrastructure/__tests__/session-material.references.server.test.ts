import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import { sessionMaterialReadWhere } from "../../domain/content.access";
import { SESSION_MATERIAL_PREFIX } from "../../domain/content.config";
import { createSessionMaterialReferenceSource } from "../session-material.references.server";

const KEY = `${SESSION_MATERIAL_PREFIX}/presentacion-1700000000.pdf`;
const OTHER = `${SESSION_MATERIAL_PREFIX}/grabacion-1700000001.mp4`;
const COURSE_DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-10-10T18:00:00.000Z");
const clock = { now: () => NOW };

describe("material de sesiones como referencias de storage", () => {
	test("busca por la referencia del proxy y nombra al material", async () => {
		let asked: unknown;
		const prisma = {
			sessionMaterial: {
				findMany: async (args: { where: { fileUrl: { in: string[] } } }) => {
					asked = args.where.fileUrl.in;
					return [
						{
							fileUrl: toProxyRef(KEY),
							title: "Presentación",
							session: { course: { documentId: COURSE_DOC } },
						},
					];
				},
			},
		} as unknown as ICradle["prisma"];

		const source = createSessionMaterialReferenceSource({ prisma, clock });

		expect(await source.findByKeys([KEY, OTHER])).toEqual([
			{
				key: KEY,
				owner: "session",
				label: "Presentación",
				detail: "Material de una sesión",
				href: `/dashboard/capacitaciones/${COURSE_DOC}`,
			},
		]);
		expect(asked).toEqual([toProxyRef(KEY), toProxyRef(OTHER)]);
	});

	// Sin su archivo la fila no enseña nada: se borra, no se vacía.
	test("soltar una key borra el material que la usaba", async () => {
		let where: unknown;
		const prisma = {
			sessionMaterial: {
				deleteMany: async (args: { where: unknown }) => {
					where = args.where;
					return { count: 1 };
				},
			},
		} as unknown as ICradle["prisma"];

		const source = createSessionMaterialReferenceSource({ prisma, clock });

		expect(await source.release([KEY])).toBe(1);
		expect(where).toEqual({ fileUrl: { in: [toProxyRef(KEY)] } });
	});

	test("reconoce su carpeta", async () => {
		const source = createSessionMaterialReferenceSource({
			clock,
			prisma: {} as ICradle["prisma"],
		});

		expect(
			await source.describeFolders([`${SESSION_MATERIAL_PREFIX}/`, "otra/"]),
		).toEqual([
			{ prefix: `${SESSION_MATERIAL_PREFIX}/`, label: "Material de sesiones" },
		]);
	});

	test("nombra la carpeta de cada curso con su título", async () => {
		let asked: unknown;
		const folder = `${SESSION_MATERIAL_PREFIX}/${COURSE_DOC}/`;
		const source = createSessionMaterialReferenceSource({
			clock,
			prisma: {
				course: {
					findMany: async (args: { where: unknown }) => {
						asked = args.where;
						return [{ documentId: COURSE_DOC, title: "Transparencia" }];
					},
				},
			} as unknown as ICradle["prisma"],
		});

		expect(
			await source.describeFolders([
				folder,
				`${SESSION_MATERIAL_PREFIX}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/`,
			]),
		).toEqual([
			{
				prefix: folder,
				label: "Transparencia",
				href: `/dashboard/capacitaciones/${COURSE_DOC}`,
			},
		]);
		expect(asked).toEqual({
			documentId: {
				in: [COURSE_DOC, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
			},
		});
	});

	test("una carpeta que no emitió la subida no consulta la base", async () => {
		const source = createSessionMaterialReferenceSource({
			clock,
			prisma: {} as unknown as ICradle["prisma"],
		});

		expect(
			await source.describeFolders([
				`${SESSION_MATERIAL_PREFIX}/viejos/`,
				`${SESSION_MATERIAL_PREFIX}/${COURSE_DOC}/otra/`,
			]),
		).toEqual([]);
	});

	// C06: el proxy pregunta aquí si quien pide puede leer el material.
	describe("canRead", () => {
		const READER = {
			userId: 9,
			role: "USER" as const,
			dependencyId: 3,
			isTrainer: false,
		};

		test("busca la fila con el alcance de quien pide y la hora del reloj", async () => {
			let where: unknown;
			const source = createSessionMaterialReferenceSource({
				clock,
				prisma: {
					sessionMaterial: {
						findFirst: async (args: { where: unknown }) => {
							where = args.where;
							return null;
						},
					},
				} as unknown as ICradle["prisma"],
			});

			expect(await source.canRead(KEY, READER)).toBe(false);
			expect(where).toEqual({
				AND: [
					{ fileUrl: toProxyRef(KEY) },
					sessionMaterialReadWhere(READER, NOW),
				],
			});
		});

		test("con la fila al alcance, sí", async () => {
			const source = createSessionMaterialReferenceSource({
				clock,
				prisma: {
					sessionMaterial: { findFirst: async () => ({ id: 1 }) },
				} as unknown as ICradle["prisma"],
			});

			expect(await source.canRead(KEY, READER)).toBe(true);
		});

		test("una key de otra carpeta no consulta la base", async () => {
			const source = createSessionMaterialReferenceSource({
				clock,
				prisma: {} as unknown as ICradle["prisma"],
			});

			expect(
				await source.canRead("documentos/lecciones/manual-1.pdf", READER),
			).toBe(false);
		});
	});
});
