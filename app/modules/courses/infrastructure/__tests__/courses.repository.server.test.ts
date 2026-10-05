import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { CourseScope } from "../../domain/course.access";
import { COURSE_ERROR_CODES } from "../../domain/course.errors";
import type { UpdateCourseData } from "../../domain/course.types";
import { createCourseRepository } from "../courses.repository.server";

const AT = new Date("2026-09-03T17:00:00.000Z");
const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const OWN_SCOPE: CourseScope = { kind: "dependency", dependencyId: 3 };

const STARTS = new Date("2026-10-05T16:00:00.000Z");
const ENDS = new Date("2026-10-05T20:00:00.000Z");

const DETAIL_ROW = {
	id: 7,
	documentId: COURSE_ID,
	dependencyId: 3,
	title: "Ofimática básica",
	coverImageUrl: null,
	modality: "IN_PERSON",
	format: "SCHEDULED",
	access: "PUBLIC",
	status: "DRAFT",
	capacity: null,
	createdAt: AT,
	updatedAt: AT,
	dependency: { name: "Obras Públicas" },
	createdBy: { firstName: "Ana", lastName: "López" },
	_count: { sessions: 0, trainers: 0 },
	completionRule: "ATTENDANCE",
	description: null,
	hours: null,
	enrollmentDeadline: null,
	minAttendance: 80,
	requiresEvaluation: false,
	minPassingGrade: 70,
	qrOpensBeforeMinutes: 15,
	qrClosesAfterMinutes: 15,
	planLine: null,
	publishedAt: null,
	cancelledAt: null,
	sessions: [],
	trainers: [],
	dependencyAudience: [],
	groupAudience: [],
};

/** Lo que el `update` del curso devuelve para diferenciar las colecciones. */
const STORED = {
	id: 7,
	sessions: [
		{
			id: 1,
			documentId: SESSION_ID,
			startsAt: STARTS,
			endsAt: ENDS,
			venue: "Sala A",
			link: null,
		},
	],
	trainers: [{ userId: 11 }],
	dependencyAudience: [{ dependencyId: 21 }],
	groupAudience: [] as { groupId: number }[],
};

const missingRow = () =>
	new Prisma.PrismaClientKnownRequestError("Record not found", {
		code: "P2025",
		clientVersion: "test",
	});

const writeOf = (
	overrides: Partial<UpdateCourseData> = {},
): UpdateCourseData => ({
	title: "Ofimática básica",
	description: null,
	hours: null,
	modality: "IN_PERSON",
	format: "SCHEDULED",
	completionRule: "ATTENDANCE",
	access: "PUBLIC",
	capacity: null,
	enrollmentDeadline: null,
	minAttendance: 80,
	requiresEvaluation: false,
	minPassingGrade: 70,
	qrOpensBeforeMinutes: 15,
	qrClosesAfterMinutes: 15,
	sessions: [
		{
			documentId: SESSION_ID,
			startsAt: STARTS,
			endsAt: ENDS,
			venue: "Sala A",
			link: null,
		},
	],
	trainerIds: [11],
	audienceDependencyIds: [21],
	audienceGroupIds: [],
	...overrides,
});

type Call = { op: string; args: unknown };

const createHarness = (
	options: { missing?: boolean; finished?: number } = {},
) => {
	const calls: Call[] = [];
	const record =
		(op: string, result: (args: unknown) => unknown = () => undefined) =>
		async (args: unknown) => {
			calls.push({ op, args });
			return result(args);
		};
	const conditional = (op: string, result: (args: unknown) => unknown) =>
		record(op, (args) => {
			if (options.missing) throw missingRow();
			return result(args);
		});

	const repository = createCourseRepository({
		prisma: {
			$queryRaw: async (
				strings: TemplateStringsArray,
				...values: unknown[]
			) => {
				calls.push({
					op: "$queryRaw",
					args: { sql: strings.join("?"), values },
				});
				return [];
			},
			course: {
				create: record("course.create", () => DETAIL_ROW),
				// Las transiciones piden el curso entero; la edición, sus colecciones.
				update: conditional("course.update", (args) =>
					(args as { select?: { title?: boolean } }).select?.title
						? DETAIL_ROW
						: STORED,
				),
				updateMany: record("course.updateMany", () => ({
					count: options.finished ?? 1,
				})),
				findUniqueOrThrow: record("course.findUniqueOrThrow", () => DETAIL_ROW),
			},
			courseSession: {
				deleteMany: record("courseSession.deleteMany"),
				update: record("courseSession.update"),
				createMany: record("courseSession.createMany"),
				findMany: record("courseSession.findMany", () => [
					{ documentId: SESSION_ID },
				]),
			},
			courseTrainer: {
				deleteMany: record("courseTrainer.deleteMany"),
				createMany: record("courseTrainer.createMany"),
			},
			courseDependencyAudience: {
				deleteMany: record("courseDependencyAudience.deleteMany"),
				createMany: record("courseDependencyAudience.createMany"),
			},
			courseGroupAudience: {
				deleteMany: record("courseGroupAudience.deleteMany"),
				createMany: record("courseGroupAudience.createMany"),
			},
		} as unknown as ICradle["prisma"],
	});

	const ops = () => calls.map((call) => call.op);
	const argsOf = (op: string) => calls.find((call) => call.op === op)?.args;

	return { repository, calls, ops, argsOf };
};

describe("finish", () => {
	test("solo pasa a FINISHED un curso que sigue publicado", async () => {
		const { repository, argsOf } = createHarness({ finished: 1 });

		expect(await repository.finish(10, AT)).toBe(true);
		expect(argsOf("course.updateMany")).toEqual({
			where: { id: 10, status: "PUBLISHED" },
			data: { status: "FINISHED", finishedAt: AT },
		});
	});

	test("si otra petición se adelantó, devuelve false", async () => {
		const { repository } = createHarness({ finished: 0 });

		expect(await repository.finish(10, AT)).toBe(false);
	});
});

describe("create", () => {
	test("escribe el curso y sus colecciones en una sola llamada", async () => {
		const { repository, ops, argsOf } = createHarness();

		const created = await repository.create({
			...writeOf({ audienceGroupIds: [31] }),
			coverImageUrl: null,
			dependencyId: 3,
			createdById: 99,
			planLineId: null,
		});

		expect(created.documentId).toBe(COURSE_ID);
		expect(ops()).toEqual(["course.create"]);
		expect(argsOf("course.create")).toMatchObject({
			data: {
				dependencyId: 3,
				createdById: 99,
				sessions: {
					createMany: {
						data: [{ startsAt: STARTS, endsAt: ENDS, venue: "Sala A" }],
					},
				},
				trainers: { createMany: { data: [{ userId: 11 }] } },
				dependencyAudience: { createMany: { data: [{ dependencyId: 21 }] } },
				groupAudience: { createMany: { data: [{ groupId: 31 }] } },
			},
		});
	});

	test("una colección vacía no se manda", async () => {
		const { repository, argsOf } = createHarness();

		await repository.create({
			...writeOf({ sessions: [], trainerIds: [], audienceDependencyIds: [] }),
			coverImageUrl: null,
			dependencyId: 3,
			createdById: 99,
			planLineId: null,
		});

		const { data } = argsOf("course.create") as { data: object };
		expect(Object.keys(data)).not.toContain("sessions");
		expect(Object.keys(data)).not.toContain("trainers");
		expect(Object.keys(data)).not.toContain("dependencyAudience");
		expect(Object.keys(data)).not.toContain("groupAudience");
	});
});

describe("update", () => {
	test("escribe con el alcance y solo si el curso sigue en el estado esperado", async () => {
		const { repository, argsOf } = createHarness();

		await repository.update(COURSE_ID, writeOf(), OWN_SCOPE, "PUBLISHED");

		expect(argsOf("course.update")).toMatchObject({
			where: { documentId: COURSE_ID, dependencyId: 3, status: "PUBLISHED" },
		});
	});

	test("sin cambios en las colecciones no toca sesiones ni uniones", async () => {
		const { repository, ops } = createHarness();

		const updated = await repository.update(
			COURSE_ID,
			writeOf(),
			OWN_SCOPE,
			"DRAFT",
		);

		expect(updated?.documentId).toBe(COURSE_ID);
		expect(ops()).toEqual(["course.update", "course.findUniqueOrThrow"]);
	});

	test("actualiza la sesión que cambió, crea las nuevas en lote y borra las quitadas", async () => {
		const { repository, ops, argsOf } = createHarness();
		const later = new Date("2026-10-05T21:00:00.000Z");

		await repository.update(
			COURSE_ID,
			writeOf({
				sessions: [
					{
						documentId: SESSION_ID,
						startsAt: STARTS,
						endsAt: later,
						venue: "Sala A",
						link: null,
					},
					{ startsAt: STARTS, endsAt: ENDS, venue: "Sala B", link: null },
				],
			}),
			OWN_SCOPE,
			"DRAFT",
		);

		expect(argsOf("courseSession.update")).toEqual({
			where: { id: 1 },
			data: { startsAt: STARTS, endsAt: later, venue: "Sala A", link: null },
		});
		expect(argsOf("courseSession.createMany")).toEqual({
			data: [
				{
					courseId: 7,
					startsAt: STARTS,
					endsAt: ENDS,
					venue: "Sala B",
					link: null,
				},
			],
		});
		expect(ops()).not.toContain("courseSession.deleteMany");
	});

	test("una sesión que ya no viene se borra", async () => {
		const { repository, argsOf } = createHarness();

		await repository.update(
			COURSE_ID,
			writeOf({ sessions: [] }),
			OWN_SCOPE,
			"DRAFT",
		);

		expect(argsOf("courseSession.deleteMany")).toEqual({
			where: { id: { in: [1] } },
		});
	});

	test("un documentId ajeno se trata como sesión nueva", async () => {
		const { repository, ops, argsOf } = createHarness();

		await repository.update(
			COURSE_ID,
			writeOf({
				sessions: [
					{
						documentId: "99999999-9999-4999-8999-999999999999",
						startsAt: STARTS,
						endsAt: ENDS,
						venue: "Sala A",
						link: null,
					},
				],
			}),
			OWN_SCOPE,
			"DRAFT",
		);

		expect(ops()).not.toContain("courseSession.update");
		expect(argsOf("courseSession.deleteMany")).toEqual({
			where: { id: { in: [1] } },
		});
		expect(argsOf("courseSession.createMany")).toMatchObject({
			data: [{ courseId: 7, venue: "Sala A" }],
		});
	});

	test("en las uniones borra lo quitado y crea lo añadido, sin tocar lo que sigue", async () => {
		const { repository, ops, argsOf } = createHarness();

		await repository.update(
			COURSE_ID,
			writeOf({
				trainerIds: [11, 12],
				audienceDependencyIds: [],
				audienceGroupIds: [31],
			}),
			OWN_SCOPE,
			"DRAFT",
		);

		expect(ops()).not.toContain("courseTrainer.deleteMany");
		expect(argsOf("courseTrainer.createMany")).toEqual({
			data: [{ courseId: 7, userId: 12 }],
		});
		expect(argsOf("courseDependencyAudience.deleteMany")).toEqual({
			where: { courseId: 7, dependencyId: { in: [21] } },
		});
		expect(ops()).not.toContain("courseDependencyAudience.createMany");
		expect(argsOf("courseGroupAudience.createMany")).toEqual({
			data: [{ courseId: 7, groupId: 31 }],
		});
	});

	test("si el curso ya no está en el estado esperado, devuelve null sin tocar nada más", async () => {
		const { repository, ops } = createHarness({ missing: true });

		const updated = await repository.update(
			COURSE_ID,
			writeOf({ sessions: [] }),
			OWN_SCOPE,
			"PUBLISHED",
		);

		expect(updated).toBeNull();
		expect(ops()).toEqual(["course.update"]);
	});

	test("sin alcance corta antes de tocar la base", async () => {
		const { repository, calls } = createHarness();

		await expect(
			repository.update(COURSE_ID, writeOf(), { kind: "none" }, "DRAFT"),
		).rejects.toMatchObject({ code: COURSE_ERROR_CODES.NOT_FOUND });
		expect(calls).toEqual([]);
	});
});

describe("publish", () => {
	test("solo publica un borrador, con el alcance de quien lo pide", async () => {
		const { repository, argsOf } = createHarness();

		const published = await repository.publish(COURSE_ID, OWN_SCOPE);

		expect(published?.documentId).toBe(COURSE_ID);
		expect(argsOf("course.update")).toMatchObject({
			where: { documentId: COURSE_ID, dependencyId: 3, status: "DRAFT" },
			data: { status: "PUBLISHED" },
		});
	});

	test("si ya no era borrador, devuelve null", async () => {
		const { repository } = createHarness({ missing: true });

		expect(await repository.publish(COURSE_ID, OWN_SCOPE)).toBeNull();
	});
});

describe("cancel", () => {
	test("solo cancela si el curso sigue en el estado esperado", async () => {
		const { repository, argsOf } = createHarness();

		await repository.cancel(COURSE_ID, OWN_SCOPE, "PUBLISHED");

		expect(argsOf("course.update")).toMatchObject({
			where: { documentId: COURSE_ID, dependencyId: 3, status: "PUBLISHED" },
			data: { status: "CANCELLED" },
		});
	});

	test("si otra petición cambió el estado, devuelve null", async () => {
		const { repository } = createHarness({ missing: true });

		expect(
			await repository.cancel(COURSE_ID, OWN_SCOPE, "PUBLISHED"),
		).toBeNull();
	});
});

describe("lock", () => {
	test("bloquea la fila del curso por su documentId", async () => {
		const { repository, argsOf } = createHarness();

		await repository.lock(COURSE_ID);

		expect(argsOf("$queryRaw")).toMatchObject({
			sql: expect.stringContaining("FOR UPDATE"),
			values: [COURSE_ID],
		});
	});
});

describe("findSessionsWithAttendance", () => {
	test("sin sesiones no consulta", async () => {
		const { repository, calls } = createHarness();

		expect(await repository.findSessionsWithAttendance([])).toEqual([]);
		expect(calls).toEqual([]);
	});

	test("devuelve las sesiones pedidas que tienen asistencia", async () => {
		const { repository, argsOf } = createHarness();

		expect(await repository.findSessionsWithAttendance([SESSION_ID])).toEqual([
			SESSION_ID,
		]);
		expect(argsOf("courseSession.findMany")).toMatchObject({
			where: { documentId: { in: [SESSION_ID] }, attendance: { some: {} } },
		});
	});
});

describe("tokens de QR", () => {
	test("rotar el de asistencia fija el token y el instante", async () => {
		const { repository, argsOf } = createHarness();

		await repository.rotateQrToken(7, "token-asistencia", AT);

		expect(argsOf("course.update")).toEqual({
			where: { id: 7 },
			data: { qrToken: "token-asistencia", qrTokenRotatedAt: AT },
		});
	});

	test("rotar el de inscripción no toca el de asistencia", async () => {
		const { repository, argsOf } = createHarness();

		await repository.rotateEnrollmentQrToken(7, "token-inscripcion", AT);

		expect(argsOf("course.update")).toEqual({
			where: { id: 7 },
			data: {
				enrollmentQrToken: "token-inscripcion",
				enrollmentQrTokenRotatedAt: AT,
			},
		});
	});
});

describe("setEnrollmentClosed", () => {
	test.each([AT, null])("fija el cierre de inscripciones a %s", async (at) => {
		const { repository, argsOf } = createHarness();

		await repository.setEnrollmentClosed(7, at);

		expect(argsOf("course.update")).toEqual({
			where: { id: 7 },
			data: { enrollmentClosedAt: at },
		});
	});
});
