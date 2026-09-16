import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import { createUserPhotoReferenceSource } from "../user-photo.references.server";

const KEY = "profile-photos/ana-1700000000.webp";

describe("createUserPhotoReferenceSource", () => {
	test("busca por la referencia del proxy, que es lo que persiste User", async () => {
		const asked: string[][] = [];
		const source = createUserPhotoReferenceSource({
			prisma: {
				user: {
					findMany: async (args: { where: { photoUrl: { in: string[] } } }) => {
						asked.push(args.where.photoUrl.in);
						return [
							{
								documentId: "doc-ana",
								email: "ana@test.com",
								firstName: "Ana",
								lastName: "López",
								photoUrl: toProxyRef(KEY),
							},
							{
								documentId: "doc-sin-nombre",
								email: "anon@test.com",
								firstName: null,
								lastName: null,
								photoUrl: toProxyRef("profile-photos/anon.png"),
							},
						];
					},
				},
			} as unknown as ICradle["prisma"],
		});

		const references = await source.findByKeys([
			KEY,
			"profile-photos/anon.png",
		]);

		expect(asked).toEqual([
			[toProxyRef(KEY), toProxyRef("profile-photos/anon.png")],
		]);
		expect(references).toEqual([
			{
				key: KEY,
				owner: "user",
				label: "Ana López",
				detail: "Foto de perfil",
				href: "/dashboard/usuarios/doc-ana/editar",
			},
			{
				key: "profile-photos/anon.png",
				owner: "user",
				label: "anon@test.com",
				detail: "Foto de perfil",
				href: "/dashboard/usuarios/doc-sin-nombre/editar",
			},
		]);
	});

	test("release deja la foto del usuario vacía", async () => {
		const writes: unknown[] = [];
		const source = createUserPhotoReferenceSource({
			prisma: {
				user: {
					updateMany: async (args: unknown) => {
						writes.push(args);
						return { count: 1 };
					},
				},
			} as unknown as ICradle["prisma"],
		});

		expect(await source.release([KEY])).toBe(1);
		expect(writes).toEqual([
			{
				where: { photoUrl: { in: [toProxyRef(KEY)] } },
				data: { photoUrl: null },
			},
		]);
	});

	test("solo reconoce su carpeta raíz", async () => {
		const source = createUserPhotoReferenceSource({
			prisma: {} as ICradle["prisma"],
		});

		expect(await source.describeFolders(["media/", "profile-photos/"])).toEqual(
			[{ prefix: "profile-photos/", label: "Fotos de perfil" }],
		);
	});
});
