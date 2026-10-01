import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import { SESSION_MATERIAL_PREFIX } from "../../domain/content.config";
import { createSessionMaterialReferenceSource } from "../session-material.references.server";

const KEY = `${SESSION_MATERIAL_PREFIX}/presentacion-1700000000.pdf`;
const OTHER = `${SESSION_MATERIAL_PREFIX}/grabacion-1700000001.mp4`;
const COURSE_DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

		const source = createSessionMaterialReferenceSource({ prisma });

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

		const source = createSessionMaterialReferenceSource({ prisma });

		expect(await source.release([KEY])).toBe(1);
		expect(where).toEqual({ fileUrl: { in: [toProxyRef(KEY)] } });
	});

	test("reconoce su carpeta", async () => {
		const source = createSessionMaterialReferenceSource({
			prisma: {} as ICradle["prisma"],
		});

		expect(
			await source.describeFolders([`${SESSION_MATERIAL_PREFIX}/`, "otra/"]),
		).toEqual([
			{ prefix: `${SESSION_MATERIAL_PREFIX}/`, label: "Material de sesiones" },
		]);
	});
});
