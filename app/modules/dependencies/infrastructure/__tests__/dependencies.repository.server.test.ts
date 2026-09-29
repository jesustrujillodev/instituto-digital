import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createDependencyRepository } from "../dependencies.repository.server";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

const prismaErrorOf = (code: string, target?: string | string[]) =>
	new Prisma.PrismaClientKnownRequestError("técnico", {
		code,
		clientVersion: "7.9.0",
		meta: target === undefined ? undefined : { target },
	});

/**
 * Doble de Prisma que solo sabe fallar: lo que se prueba aquí es la TRADUCCIÓN de
 * sus códigos a errores de dominio, no la consulta.
 *
 * Es la única parte del repositorio con lógica propia — el resto es delegación —,
 * y la que rompería de forma más silenciosa: un P2002 mal traducido no falla, solo
 * muestra el mensaje equivocado.
 */
const repositoryThatThrows = (error: unknown) =>
	createDependencyRepository({
		prisma: {
			dependency: {
				create: async () => {
					throw error;
				},
				update: async () => {
					throw error;
				},
			},
			$transaction: async () => {
				throw error;
			},
		} as unknown as ICradle["prisma"],
	});

describe("translatePrismaError — unicidad (P2002)", () => {
	// El nombre es el índice único de `dependencies`: es el P2002 esperable al
	// crear o renombrar.
	test("un P2002 sobre el nombre es DUPLICATE_DEPENDENCY_NAME", async () => {
		const repository = repositoryThatThrows(prismaErrorOf("P2002", ["name"]));

		await expect(
			repository.create({ name: "Obras Públicas" }),
		).rejects.toMatchObject({ code: "DUPLICATE_DEPENDENCY_NAME" });
	});

	// ESTE es el caso que el PRD pedía no confundir: `assignHead` escribe en
	// auth.users y choca con el índice único parcial del titular. Sin distinguirlo
	// por meta.target, designar un segundo titular respondía "ese nombre ya existe".
	test("un P2002 del índice del titular es DEPENDENCY_ALREADY_HAS_HEAD", async () => {
		const repository = repositoryThatThrows(
			prismaErrorOf("P2002", "users_one_head_per_dependency"),
		);

		await expect(
			repository.assignHead({
				dependencyId: 5,
				candidateUserId: 9,
				currentHeadUserId: null,
			}),
		).rejects.toMatchObject({ code: "DEPENDENCY_ALREADY_HAS_HEAD" });
	});

	test("reconoce el índice del titular llegue como array o como texto", async () => {
		const repository = repositoryThatThrows(
			prismaErrorOf("P2002", ["users_one_head_per_dependency"]),
		);

		await expect(
			repository.assignHead({
				dependencyId: 5,
				candidateUserId: 9,
				currentHeadUserId: 4,
			}),
		).rejects.toMatchObject({ code: "DEPENDENCY_ALREADY_HAS_HEAD" });
	});

	// Sin meta no hay forma de distinguir: se cae al caso mayoritario del modelo en
	// vez de propagar un error sin código, que llegaría como UNEXPECTED_ERROR.
	test("un P2002 sin meta cae en el nombre duplicado", async () => {
		const repository = repositoryThatThrows(prismaErrorOf("P2002"));

		await expect(
			repository.create({ name: "Obras Públicas" }),
		).rejects.toMatchObject({ code: "DUPLICATE_DEPENDENCY_NAME" });
	});
});

describe("translatePrismaError — resto de códigos", () => {
	// P2025 es lo que devuelve Prisma al actualizar una fila que no existe: es un
	// 404 de dominio, no un fallo inesperado.
	test("un P2025 es DEPENDENCY_NOT_FOUND", async () => {
		const repository = repositoryThatThrows(prismaErrorOf("P2025"));

		await expect(
			repository.update(DOCUMENT_ID, { acronym: "SOP" }),
		).rejects.toMatchObject({ code: "DEPENDENCY_NOT_FOUND" });
	});

	// Lo que no se sabe traducir se propaga tal cual: inventarle un código de
	// dominio ocultaría un fallo real detrás de una copia tranquilizadora.
	test("un código desconocido de Prisma se propaga sin traducir", async () => {
		const original = prismaErrorOf("P2034");
		const repository = repositoryThatThrows(original);

		await expect(repository.create({ name: "Obras" })).rejects.toBe(original);
	});

	test("un error que no es de Prisma se propaga sin traducir", async () => {
		const original = new Error("se cayó la red");
		const repository = repositoryThatThrows(original);

		await expect(repository.create({ name: "Obras" })).rejects.toBe(original);
	});
});

describe("assignHead — candidato no elegible", () => {
	/** Transacción real en forma: ejecuta el callback con un `tx` de doble. */
	const repositoryWithTransaction = (promotedCount: number) => {
		const writes: string[] = [];
		const tx = {
			user: {
				update: async () => {
					writes.push("demote");
				},
				updateMany: async (args: { where: unknown }) => {
					writes.push("promote");
					expect(args.where).toMatchObject({
						role: { notIn: ["SUPERADMIN"] },
					});
					return { count: promotedCount };
				},
			},
		};
		const repository = createDependencyRepository({
			prisma: {
				$transaction: async (callback: (client: typeof tx) => unknown) =>
					callback(tx),
			} as unknown as ICradle["prisma"],
		});
		return { repository, writes };
	};

	// El servicio ya lo comprueba, pero sobre una lectura previa: si el candidato
	// pasó a superadministrador entretanto, la promoción no debe tocarlo.
	test("si la promoción no alcanza al candidato, lanza dentro de la transacción", async () => {
		const { repository, writes } = repositoryWithTransaction(0);

		await expect(
			repository.assignHead({
				dependencyId: 5,
				candidateUserId: 9,
				currentHeadUserId: 4,
			}),
		).rejects.toMatchObject({ code: "HEAD_MUST_NOT_BE_SUPERADMIN" });
		expect(writes).toEqual(["demote", "promote"]);
	});

	test("con un candidato elegible promueve sin error", async () => {
		const { repository } = repositoryWithTransaction(1);

		await expect(
			repository.assignHead({
				dependencyId: 5,
				candidateUserId: 9,
				currentHeadUserId: null,
			}),
		).resolves.toBeUndefined();
	});
});
