import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { catalogAccessWhere } from "../../domain/enrollment.access";
import { ENROLLMENT_ERROR_CODES } from "../../domain/enrollment.errors";
import type { CatalogFilter } from "../../domain/enrollment.repository";
import { createEnrollmentRepository } from "../enrollments.repository.server";

const AT = new Date("2026-09-03T17:00:00.000Z");

const createHarness = () => {
	const calls: Record<string, unknown>[] = [];

	const repository = createEnrollmentRepository({
		prisma: {
			enrollment: {
				updateMany: async (args: Record<string, unknown>) => {
					calls.push(args);
					return { count: 1 };
				},
			},
		} as unknown as ICradle["prisma"],
		assetUrlResolver: (key: string) => `/api/storage?key=${key}`,
	});

	return { repository, calls };
};

describe("saveResults", () => {
	test("escribe resultado y nota solo en inscritos, con quién y cuándo", async () => {
		const { repository, calls } = createHarness();

		await repository.saveResults(
			10,
			[{ userId: 50, result: "PASSED", grade: 92 }],
			9,
			AT,
		);

		expect(calls).toEqual([
			{
				where: { courseId: 10, userId: { in: [50] }, status: "ENROLLED" },
				data: {
					result: "PASSED",
					grade: 92,
					resultRecordedById: 9,
					resultRecordedAt: AT,
				},
			},
		]);
	});

	test("una sentencia por resultado y nota, y gana la última entrada de cada quien", async () => {
		const { repository, calls } = createHarness();

		await repository.saveResults(
			10,
			[
				{ userId: 50, result: "PASSED", grade: 92 },
				{ userId: 51, result: "FAILED", grade: 40 },
				{ userId: 52, result: "PASSED", grade: 92 },
				{ userId: 53, result: "PASSED", grade: null },
				{ userId: 51, result: "PASSED", grade: 92 },
			],
			9,
			AT,
		);

		expect(
			calls.map((call) => ({
				userIds: (call.where as { userId: { in: number[] } }).userId.in,
				result: (call.data as { result: string }).result,
				grade: (call.data as { grade: number | null }).grade,
			})),
		).toEqual([
			{ userIds: [50, 51, 52], result: "PASSED", grade: 92 },
			{ userIds: [53], result: "PASSED", grade: null },
		]);
	});
});

describe("saveProgress", () => {
	test("agrupa por porcentaje y fija la fecha de término solo donde falta", async () => {
		const { repository, calls } = createHarness();
		const DONE = new Date("2026-09-04T17:00:00.000Z");

		await repository.saveProgress(10, [
			{ userId: 50, percent: 100, completedAt: DONE },
			{ userId: 51, percent: 40, completedAt: null },
			{ userId: 52, percent: 100, completedAt: DONE },
		]);

		expect(calls).toEqual([
			{
				where: { courseId: 10, userId: { in: [50, 52] }, status: "ENROLLED" },
				data: { progressPercent: 100 },
			},
			{
				where: { courseId: 10, userId: { in: [51] }, status: "ENROLLED" },
				data: { progressPercent: 40 },
			},
			{
				where: {
					courseId: 10,
					userId: { in: [50, 52] },
					status: "ENROLLED",
					contentCompletedAt: null,
				},
				data: { contentCompletedAt: DONE },
			},
		]);
	});

	test("sin escrituras no consulta", async () => {
		const { repository, calls } = createHarness();

		await repository.saveProgress(10, []);

		expect(calls).toEqual([]);
	});
});

describe("setCompletion", () => {
	test("marca a quien completó y desmarca al resto de inscritos", async () => {
		const { repository, calls } = createHarness();

		await repository.setCompletion(10, [50]);

		expect(calls).toEqual([
			{
				where: { courseId: 10, status: "ENROLLED", userId: { in: [50] } },
				data: { completed: true },
			},
			{
				where: { courseId: 10, status: "ENROLLED", userId: { notIn: [50] } },
				data: { completed: false },
			},
		]);
	});
});

describe("catálogo", () => {
	const NOW = new Date("2026-09-22T17:00:00.000Z");
	const CATALOG_FILTER = {
		AND: [{ OR: [] }, catalogAccessWhere(50)],
	} as unknown as CatalogFilter;

	// Quien administra o imparte un curso por invitación lo ve, pero el
	// catálogo no se lo ofrece si no está invitado (docs/adr/0004). La regla
	// viaja en el filtro; lo que no puede pasar es que una consulta lo suelte.
	test("las tres consultas aplican el filtro del catálogo completo", async () => {
		const wheres: unknown[] = [];
		const record = async (args: { where: unknown }) => {
			wheres.push(args.where);
			return [];
		};
		const repository = createEnrollmentRepository({
			prisma: {
				course: {
					findMany: record,
					count: async (args: { where: unknown }) => {
						wheres.push(args.where);
						return 0;
					},
				},
				enrollment: { findMany: async () => [] },
			} as unknown as ICradle["prisma"],
			assetUrlResolver: (key: string) => `/api/storage?key=${key}`,
		});
		const params = { filters: {}, filter: CATALOG_FILTER, now: NOW };

		await repository.findAvailable({ ...params, userId: 50 });
		await repository.countAvailable(params);
		await repository.findAvailableOrganizers(params);

		expect(wheres).toHaveLength(3);
		for (const where of wheres) {
			expect((where as { AND: unknown[] }).AND).toContainEqual(CATALOG_FILTER);
		}
	});
});

describe("markPendingAsFailed", () => {
	// «No presentó»: al cerrar un curso evaluado por examen (docs/adr/0015).
	test("solo toca a los inscritos que siguen pendientes, y les quita la nota", async () => {
		const { repository, calls } = createHarness();

		await repository.markPendingAsFailed(7, 2, AT);

		expect(calls).toEqual([
			{
				where: { courseId: 7, status: "ENROLLED", result: "PENDING" },
				data: {
					result: "FAILED",
					grade: null,
					resultRecordedById: 2,
					resultRecordedAt: AT,
				},
			},
		]);
	});
});

describe("countInvited", () => {
	const countWith = async (dependencyId: number | null) => {
		const queries: unknown[] = [];
		const repository = createEnrollmentRepository({
			prisma: {
				enrollment: {
					count: async (args: unknown) => {
						queries.push(args);
						return 4;
					},
				},
			} as unknown as ICradle["prisma"],
			assetUrlResolver: (key: string) => `/api/storage?key=${key}`,
		});

		return { total: await repository.countInvited(7, dependencyId), queries };
	};

	test("cuenta las invitaciones sin responder del curso", async () => {
		const { total, queries } = await countWith(null);

		expect(total).toBe(4);
		expect(queries).toEqual([{ where: { courseId: 7, status: "INVITED" } }]);
	});

	test("con dependencia, solo las de su personal", async () => {
		const { queries } = await countWith(3);

		expect(queries).toEqual([
			{ where: { courseId: 7, status: "INVITED", dependencyId: 3 } },
		]);
	});
});

describe("pertenencia a grupos", () => {
	const person = (id: number, dependencyId: number) => ({
		id,
		documentId: `doc-${id}`,
		dependencyId,
		email: `p${id}@instituto.gob.mx`,
		firstName: "Ana",
		lastName: "López",
	});

	const repositoryWith = (rows: unknown[]) =>
		createEnrollmentRepository({
			prisma: {
				groupMember: { findMany: async () => rows },
			} as unknown as ICradle["prisma"],
			assetUrlResolver: (key: string) => `/api/storage?key=${key}`,
		});

	// §6.4: invitar o asignar un grupo no alcanza a quien se trasladó a otra
	// dependencia después de entrar.
	test("findGroupParticipants omite a los trasladados y cuenta una vez a cada persona", async () => {
		const repository = repositoryWith([
			{ group: { dependencyId: 3 }, user: person(50, 3) },
			{ group: { dependencyId: 3 }, user: person(51, 4) },
			{ group: { dependencyId: 3 }, user: person(50, 3) },
		]);

		const participants = await repository.findGroupParticipants([1, 2]);

		expect(participants.map((participant) => participant.id)).toEqual([50]);
	});

	test("findGroupEnrollable omite a los trasladados", async () => {
		const repository = repositoryWith([
			{
				groupId: 1,
				group: { dependencyId: 3 },
				user: { documentId: "doc-50", dependencyId: 3 },
			},
			{
				groupId: 1,
				group: { dependencyId: 3 },
				user: { documentId: "doc-51", dependencyId: 4 },
			},
		]);

		await expect(
			repository.findGroupEnrollable({
				courseId: 7,
				groupIds: [1],
				dependencyId: null,
			}),
		).resolves.toEqual([{ groupId: 1, userDocumentId: "doc-50" }]);
	});
});

describe("findMine", () => {
	test("lee inscripciones y asistencia a la vez, acotadas por la misma inscripción", async () => {
		const started: string[] = [];
		const attendanceCalls: Record<string, unknown>[] = [];
		let releaseEnrollments: (rows: unknown[]) => void = () => {};

		const repository = createEnrollmentRepository({
			prisma: {
				enrollment: {
					findMany: () => {
						started.push("enrollments");
						return new Promise((resolve) => {
							releaseEnrollments = resolve;
						});
					},
				},
				courseAttendance: {
					findMany: async (args: Record<string, unknown>) => {
						started.push("attendance");
						attendanceCalls.push(args);
						return [];
					},
				},
			} as unknown as ICradle["prisma"],
			assetUrlResolver: (key: string) => `/api/storage?key=${key}`,
		});

		const pending = repository.findMine(50);
		// La asistencia ya salió aunque las inscripciones no hayan respondido.
		expect(started).toEqual(["enrollments", "attendance"]);
		releaseEnrollments([]);

		await expect(pending).resolves.toEqual([]);
		expect(attendanceCalls[0]).toMatchObject({
			where: {
				userId: 50,
				attended: true,
				session: {
					course: {
						enrollments: {
							some: {
								userId: 50,
								status: { in: ["INVITED", "ENROLLED", "WITHDRAWN"] },
							},
						},
					},
				},
			},
		});
	});
});

describe("findEnrollmentByCourseDocumentId", () => {
	test("la busca por el documentId del curso y la proyecta como findEnrollment", async () => {
		const row = {
			userId: 50,
			actedById: 50,
			documentId: "e1",
			origin: "SELF",
			status: "ENROLLED",
			result: "PENDING",
			completed: false,
		};
		const calls: Record<string, unknown>[] = [];
		const repository = createEnrollmentRepository({
			prisma: {
				enrollment: {
					findFirst: async (args: Record<string, unknown>) => {
						calls.push(args);
						return row;
					},
					findUnique: async () => row,
				},
			} as unknown as ICradle["prisma"],
			assetUrlResolver: (key: string) => key,
		});

		const byDocument = await repository.findEnrollmentByCourseDocumentId(
			"c-doc",
			50,
		);

		expect(calls[0]).toMatchObject({
			where: { userId: 50, course: { documentId: "c-doc" } },
		});
		expect(byDocument).toEqual(await repository.findEnrollment(10, 50));
	});
});

describe("bloqueo del curso", () => {
	const createLockHarness = () => {
		const ops: string[] = [];
		const repository = createEnrollmentRepository({
			prisma: {
				$queryRaw: async (strings: TemplateStringsArray) => {
					ops.push(strings.join("?").replace(/\s+/g, " "));
					return [];
				},
				course: {
					findUniqueOrThrow: async () => {
						ops.push("capacity");
						return { capacity: 20 };
					},
				},
				enrollment: {
					count: async () => {
						ops.push("count");
						return 3;
					},
				},
			} as unknown as ICradle["prisma"],
			assetUrlResolver: (key: string) => key,
		});
		return { repository, ops };
	};

	test("lockCourse solo bloquea la fila, sin leer cupo ni inscritos", async () => {
		const { repository, ops } = createLockHarness();

		await repository.lockCourse(10);

		expect(ops).toEqual([
			'SELECT id FROM "org"."courses" WHERE id = ? FOR UPDATE',
		]);
	});

	test("lockCourseSeats bloquea primero y lee cupo e inscritos después", async () => {
		const { repository, ops } = createLockHarness();

		expect(await repository.lockCourseSeats(10)).toEqual({
			capacity: 20,
			enrolled: 3,
		});
		expect(ops[0]).toBe(
			'SELECT id FROM "org"."courses" WHERE id = ? FOR UPDATE',
		);
		expect([...ops.slice(1)].sort()).toEqual(["capacity", "count"]);
	});
});

describe("saveMany", () => {
	const writeOf = (
		userId: number,
		dependencyId: number,
		expected: "WITHDRAWN" | "DECLINED" | null,
	) => ({
		data: {
			courseId: 10,
			userId,
			dependencyId,
			origin: "ASSIGNED" as const,
			status: "ENROLLED" as const,
			actedById: 9,
			at: AT,
		},
		expected,
	});
	const fields = (dependencyId: number) => ({
		dependencyId,
		origin: "ASSIGNED",
		status: "ENROLLED",
		actedById: 9,
		enrolledAt: AT,
		withdrawnAt: null,
	});
	const createBatchHarness = (
		options: { createError?: Error; updated?: number } = {},
	) => {
		const calls: Record<string, unknown>[] = [];
		const repository = createEnrollmentRepository({
			prisma: {
				enrollment: {
					createMany: async (args: Record<string, unknown>) => {
						if (options.createError) throw options.createError;
						calls.push({ createMany: args });
					},
					updateMany: async (args: { where: { userId: { in: number[] } } }) => {
						calls.push({ updateMany: args });
						return { count: options.updated ?? args.where.userId.in.length };
					},
				},
			} as unknown as ICradle["prisma"],
			assetUrlResolver: (key: string) => key,
		});
		return { repository, calls };
	};

	test("crea los nuevos juntos y actualiza por estado esperado y campos", async () => {
		const { repository, calls } = createBatchHarness();

		await repository.saveMany([
			writeOf(50, 3, null),
			writeOf(51, 3, "WITHDRAWN"),
			writeOf(52, 3, "WITHDRAWN"),
			writeOf(53, 4, "WITHDRAWN"),
			writeOf(54, 3, null),
		]);

		expect(calls).toEqual([
			{
				createMany: {
					data: [
						{ courseId: 10, userId: 50, ...fields(3) },
						{ courseId: 10, userId: 54, ...fields(3) },
					],
				},
			},
			{
				updateMany: {
					where: {
						courseId: 10,
						userId: { in: [51, 52] },
						status: "WITHDRAWN",
					},
					data: fields(3),
				},
			},
			{
				updateMany: {
					where: { courseId: 10, userId: { in: [53] }, status: "WITHDRAWN" },
					data: fields(4),
				},
			},
		]);
	});

	test("si se actualizan menos filas de las esperadas, STATE_CHANGED como save", async () => {
		const { repository } = createBatchHarness({ updated: 1 });

		await expect(
			repository.saveMany([
				writeOf(51, 3, "WITHDRAWN"),
				writeOf(52, 3, "WITHDRAWN"),
			]),
		).rejects.toMatchObject({ code: ENROLLMENT_ERROR_CODES.STATE_CHANGED });
	});

	test("una alta que choca con la unicidad es STATE_CHANGED, no un error suelto", async () => {
		const { repository } = createBatchHarness({
			createError: new Prisma.PrismaClientKnownRequestError("duplicado", {
				code: "P2002",
				clientVersion: "7.9.0",
			}),
		});

		await expect(
			repository.saveMany([writeOf(50, 3, null)]),
		).rejects.toMatchObject({ code: ENROLLMENT_ERROR_CODES.STATE_CHANGED });
	});

	test("sin escrituras no consulta", async () => {
		const { repository, calls } = createBatchHarness();

		await repository.saveMany([]);

		expect(calls).toEqual([]);
	});
});
