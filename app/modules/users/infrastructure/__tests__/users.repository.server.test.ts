import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { CreateUserData } from "../../domain/user.types";
import { createUserRepository } from "../users.repository.server";

/** P2002 con la forma que devuelve `@prisma/adapter-pg`: sin `meta.target`. */
const uniqueViolationOn = (constraint: string, fields: string[]) =>
	new Prisma.PrismaClientKnownRequestError("técnico", {
		code: "P2002",
		clientVersion: "7.9.0",
		meta: {
			modelName: "User",
			driverAdapterError: {
				cause: {
					originalCode: "23505",
					originalMessage: `duplicate key value violates unique constraint "${constraint}"`,
					kind: "UniqueConstraintViolation",
					constraint: { fields },
				},
			},
		},
	});

const repositoryThatThrows = (error: unknown) =>
	createUserRepository({
		prisma: {
			user: {
				create: async () => {
					throw error;
				},
			},
		} as unknown as ICradle["prisma"],
	});

const data = {
	email: "ana@empresa.com",
	password: "hash",
	employeeNumber: "EMP-0042",
	dependencyId: 1,
} as CreateUserData;

describe("create — unicidad (P2002)", () => {
	// El caso reportado: un número de empleado repetido respondía "ese correo ya
	// está registrado" porque el adapter no llena `meta.target`.
	test("un número de empleado repetido es DUPLICATE_EMPLOYEE_NUMBER", async () => {
		const repository = repositoryThatThrows(
			uniqueViolationOn("users_employee_number_key", ["employee_number"]),
		);

		await expect(repository.create(data)).rejects.toMatchObject({
			code: "DUPLICATE_EMPLOYEE_NUMBER",
		});
	});

	test("un correo repetido es DUPLICATE_EMAIL", async () => {
		const repository = repositoryThatThrows(
			uniqueViolationOn("users_email_key", ["email"]),
		);

		await expect(repository.create(data)).rejects.toMatchObject({
			code: "DUPLICATE_EMAIL",
		});
	});
});

describe("findByInternalIds", () => {
	test("los busca juntos, con el perfil de capacitador que pide el mapper", async () => {
		const calls: unknown[] = [];
		const repository = createUserRepository({
			prisma: {
				user: {
					findMany: async (args: unknown) => {
						calls.push(args);
						return [];
					},
				},
			} as unknown as ICradle["prisma"],
		});

		expect(await repository.findByInternalIds([7, 9])).toEqual([]);
		expect(calls).toEqual([
			{
				where: { id: { in: [7, 9] } },
				include: { trainerProfile: { select: { archivedAt: true } } },
			},
		]);
	});

	test("sin ids no consulta", async () => {
		const repository = createUserRepository({
			prisma: {} as unknown as ICradle["prisma"],
		});

		expect(await repository.findByInternalIds([])).toEqual([]);
	});
});

describe("lockActiveSuperadminIds", () => {
	test("bloquea a los superadministradores activos y devuelve sus ids", async () => {
		const sql: string[] = [];
		const repository = createUserRepository({
			prisma: {
				$queryRaw: async (strings: TemplateStringsArray) => {
					sql.push(strings.join("?").replace(/\s+/g, " ").trim());
					return [{ id: 1 }, { id: 4 }];
				},
			} as unknown as ICradle["prisma"],
		});

		expect(await repository.lockActiveSuperadminIds()).toEqual([1, 4]);
		expect(sql).toEqual([
			'SELECT id FROM "auth"."users" WHERE role = \'SUPERADMIN\' AND archived_at IS NULL FOR UPDATE',
		]);
	});
});

describe("findPasswordHash", () => {
	// Remediación (Fase C): el cambio de la propia contraseña leía por correo y
	// escribía por documentId; ahora lee solo el hash, por el mismo documentId.
	test("lee solo el hash, por documentId", async () => {
		const queries: unknown[] = [];
		const repository = createUserRepository({
			prisma: {
				user: {
					findUnique: async (args: unknown) => {
						queries.push(args);
						return { password: "hash-guardado" };
					},
				},
			} as unknown as ICradle["prisma"],
		});

		await expect(repository.findPasswordHash("doc-1")).resolves.toBe(
			"hash-guardado",
		);
		expect(queries).toEqual([
			{ where: { documentId: "doc-1" }, select: { password: true } },
		]);
	});

	test("una cuenta inexistente da null", async () => {
		const repository = createUserRepository({
			prisma: {
				user: { findUnique: async () => null },
			} as unknown as ICradle["prisma"],
		});

		await expect(repository.findPasswordHash("doc-1")).resolves.toBeNull();
	});
});

describe("updatePassword", () => {
	// Remediación (Fase C): el hash y el cambio pendiente van en la misma
	// escritura.
	test("escribe el hash y si hay que cambiarla al entrar", async () => {
		const updates: unknown[] = [];
		const repository = createUserRepository({
			prisma: {
				user: {
					update: async (args: { data: unknown }) => {
						updates.push(args.data);
					},
				},
			} as unknown as ICradle["prisma"],
		});

		await repository.updatePassword("doc-1", "hash", { kind: "global" }, true);

		expect(updates).toEqual([{ password: "hash", mustChangePassword: true }]);
	});
});
