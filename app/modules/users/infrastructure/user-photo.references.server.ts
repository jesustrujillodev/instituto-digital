import type { ICradle } from "@/shared/di/container.types";
import type { IObjectReferenceSource } from "@/shared/storage/object-reference.port";
import { toProxyRef } from "@/shared/storage/public-url";
import { USER_PHOTO } from "../domain/user.config";

// ===============================================================
// Fotos de perfil como referencias de storage
// ===============================================================
// `User` no guarda la key sino la referencia del proxy (`/api/storage?key=…`),
// así que se compara contra `toProxyRef(key)`: produce exactamente lo que
// persistió `getPublicUrl` al subir la foto.

type Dependencies = {
	prisma: ICradle["prisma"];
};

const ROOT_PREFIX = `${USER_PHOTO.prefix}/`;

export const createUserPhotoReferenceSource = ({
	prisma,
}: Dependencies): IObjectReferenceSource => {
	/** Referencia persistida → key. */
	const refsFor = (keys: readonly string[]) =>
		new Map(keys.map((key) => [toProxyRef(key), key]));

	return {
		async findByKeys(keys) {
			if (keys.length === 0) return [];

			const refs = refsFor(keys);
			const users = await prisma.user.findMany({
				where: { photoUrl: { in: [...refs.keys()] } },
				select: {
					documentId: true,
					email: true,
					firstName: true,
					lastName: true,
					photoUrl: true,
				},
			});

			return users.flatMap((user) => {
				const key = user.photoUrl ? refs.get(user.photoUrl) : undefined;
				if (!key) return [];

				const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

				return [
					{
						key,
						owner: "user" as const,
						label: name || user.email,
						detail: "Foto de perfil",
						href: `/dashboard/usuarios/${user.documentId}/editar`,
					},
				];
			});
		},

		async release(keys) {
			if (keys.length === 0) return 0;

			// Sin transacción explícita: es UNA sentencia y cada usuario solo tiene
			// una foto, así que no hay nada que dejar a medias.
			const { count } = await prisma.user.updateMany({
				where: { photoUrl: { in: [...refsFor(keys).keys()] } },
				data: { photoUrl: null },
			});

			return count;
		},

		async describeFolders(prefixes) {
			return prefixes.includes(ROOT_PREFIX)
				? [{ prefix: ROOT_PREFIX, label: "Fotos de perfil" }]
				: [];
		},
	};
};
