import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { Role } from "@/shared/rules/atoms.rules";
import {
	type CourseScope,
	canChooseOrganizer,
	canManageCourses,
	canOpenTeaching,
	courseScopeWhere,
	courseScopeWriteWhere,
	courseVisibilityWhere,
	dependencyVisibilityWhere,
	resolveCourseScope,
	resolveOrganizerDependency,
	toAudienceScope,
	VIEWABLE_STATUSES,
} from "../course.access";
import { COURSE_ERROR_CODES } from "../course.errors";

type Actor = Pick<
	AuthContext,
	"userId" | "role" | "dependencyId" | "isTrainer"
>;

const actorOf = (overrides: Partial<Actor> = {}): Actor => ({
	userId: 1,
	role: "USER" as Role,
	dependencyId: 10,
	isTrainer: false,
	...overrides,
});

describe("resolveCourseScope", () => {
	test.each([["SUPERADMIN" as Role]])(
		"%s administra cursos de cualquier dependencia",
		(role) => {
			expect(resolveCourseScope(actorOf({ role }))).toEqual({ kind: "global" });
		},
	);

	test.each([["DEPENDENCY_HEAD" as Role], ["DEPENDENCY_DEPUTY" as Role]])(
		"%s administra los de su dependencia",
		(role) => {
			expect(resolveCourseScope(actorOf({ role }))).toEqual({
				kind: "dependency",
				dependencyId: 10,
			});
		},
	);

	// La razón de que este módulo tenga alcance propio: `AccessScope` traduce a
	// un capacitador interno como `self`, que para cursos significaría "ninguno".
	test("un capacitador interno administra los cursos que creó", () => {
		expect(resolveCourseScope(actorOf({ isTrainer: true }))).toEqual({
			kind: "creator",
			dependencyId: 10,
			userId: 1,
		});
	});

	test("un capacitador externo no administra nada: solo imparte", () => {
		expect(
			resolveCourseScope(actorOf({ isTrainer: true, dependencyId: null })),
		).toEqual({ kind: "none" });
	});

	test("un participante sin perfil no administra nada", () => {
		expect(resolveCourseScope(actorOf())).toEqual({ kind: "none" });
	});

	test("un titular que además imparte conserva el alcance más amplio", () => {
		expect(
			resolveCourseScope(actorOf({ role: "DEPENDENCY_HEAD", isTrainer: true })),
		).toEqual({ kind: "dependency", dependencyId: 10 });
	});

	test("un titular sin dependencia no alcanza nada", () => {
		expect(
			resolveCourseScope(
				actorOf({ role: "DEPENDENCY_HEAD", dependencyId: null }),
			),
		).toEqual({ kind: "none" });
	});
});

describe("canManageCourses", () => {
	test("deja entrar al capacitador interno, que ningún rol expresa", () => {
		expect(canManageCourses(actorOf({ isTrainer: true }))).toBe(true);
	});

	test("deja fuera al participante y al externo", () => {
		expect(canManageCourses(actorOf())).toBe(false);
		expect(
			canManageCourses(actorOf({ isTrainer: true, dependencyId: null })),
		).toBe(false);
	});
});

describe("courseScopeWhere", () => {
	test("global no filtra", () => {
		expect(courseScopeWhere({ kind: "global" })).toEqual({});
	});

	test("dependency filtra por la unidad", () => {
		expect(courseScopeWhere({ kind: "dependency", dependencyId: 7 })).toEqual({
			dependencyId: 7,
		});
	});

	test("creator suma el autor al filtro de unidad", () => {
		expect(
			courseScopeWhere({ kind: "creator", dependencyId: 7, userId: 3 }),
		).toEqual({ dependencyId: 7, createdById: 3 });
	});

	// La prueba que de verdad importa: un alcance vacío NO puede convertirse en
	// `{}`, que significaría "todos los cursos".
	test("none devuelve un predicado imposible, nunca un filtro vacío", () => {
		const where = courseScopeWhere({ kind: "none" });

		expect(where).toEqual({ id: { in: [] } });
		expect(where).not.toEqual({});
	});
});

describe("courseScopeWriteWhere", () => {
	test("none corta antes de llegar a la base", () => {
		expect(courseScopeWriteWhere({ kind: "none" })).toBeNull();
	});

	test("creator solo escribe sobre lo que él creó", () => {
		expect(
			courseScopeWriteWhere({ kind: "creator", dependencyId: 7, userId: 3 }),
		).toEqual({ dependencyId: 7, createdById: 3 });
	});
});

describe("resolveOrganizerDependency", () => {
	test("el alcance global elige la organizadora", () => {
		expect(resolveOrganizerDependency({ kind: "global" }, 4)).toBe(4);
		expect(canChooseOrganizer({ kind: "global" })).toBe(true);
	});

	test("sin elegirla, el alcance global falla con su código", () => {
		expect(() =>
			resolveOrganizerDependency({ kind: "global" }, undefined),
		).toThrowError(
			expect.objectContaining({ code: COURSE_ERROR_CODES.ORGANIZER_REQUIRED }),
		);
	});

	// Lo que impide crear un curso en otra unidad enviando el formulario a mano.
	test.each<[string, CourseScope]>([
		["dependency", { kind: "dependency", dependencyId: 10 }],
		["creator", { kind: "creator", dependencyId: 10, userId: 1 }],
	])("el alcance %s la hereda e ignora la del formulario", (_kind, scope) => {
		expect(resolveOrganizerDependency(scope, 999)).toBe(10);
		expect(canChooseOrganizer(scope)).toBe(false);
	});

	test("sin alcance no se organiza nada", () => {
		expect(() => resolveOrganizerDependency({ kind: "none" }, 4)).toThrowError(
			expect.objectContaining({ code: COURSE_ERROR_CODES.FORBIDDEN_SCOPE }),
		);
	});
});

describe("toAudienceScope", () => {
	test("un capacitador interno ve los grupos de su dependencia", () => {
		expect(
			toAudienceScope({ kind: "creator", dependencyId: 10, userId: 1 }),
		).toEqual({ kind: "dependency", dependencyId: 10 });
	});

	test("sin alcance de cursos no se leen grupos", () => {
		expect(toAudienceScope({ kind: "none" })).toEqual({ kind: "none" });
	});
});

describe("courseVisibilityWhere", () => {
	const viewerOf = (
		overrides: Partial<Parameters<typeof courseVisibilityWhere>[0]> = {},
	) => ({
		userId: 1,
		role: "USER" as Role,
		dependencyId: 10,
		isTrainer: false,
		groupIds: [] as readonly number[],
		...overrides,
	});

	test("el superadministrador ve todo", () => {
		expect(
			courseVisibilityWhere(viewerOf({ role: "SUPERADMIN" })).OR,
		).toContainEqual({});
	});

	test("un interno ve lo público publicado", () => {
		expect(courseVisibilityWhere(viewerOf()).OR).toContainEqual({
			status: { in: VIEWABLE_STATUSES },
			access: "PUBLIC",
		});
	});

	test("un interno alcanza lo restringido a su dependencia", () => {
		expect(courseVisibilityWhere(viewerOf()).OR).toContainEqual({
			status: { in: VIEWABLE_STATUSES },
			access: "RESTRICTED",
			OR: [{ dependencyAudience: { some: { dependencyId: 10 } } }],
		});
	});

	test("pertenecer a un grupo añade su rama, no la sustituye", () => {
		const { OR } = courseVisibilityWhere(viewerOf({ groupIds: [5, 6] }));

		expect(OR).toContainEqual({
			status: { in: VIEWABLE_STATUSES },
			access: "RESTRICTED",
			OR: [
				{ dependencyAudience: { some: { dependencyId: 10 } } },
				{ groupAudience: { some: { groupId: { in: [5, 6] } } } },
			],
		});
	});

	test("quien imparte ve su curso aunque no sea de su audiencia", () => {
		expect(
			courseVisibilityWhere(viewerOf({ isTrainer: true })).OR,
		).toContainEqual({ trainers: { some: { userId: 1 } } });
	});

	// Un externo no pertenece a ninguna dependencia: lo único que alcanza es lo
	// que imparte, y su rama de administración es el predicado imposible.
	test("un externo no ve nada más que lo que imparte", () => {
		const { OR } = courseVisibilityWhere(
			viewerOf({ dependencyId: null, isTrainer: true }),
		);

		expect(OR).toEqual([
			{ id: { in: [] } },
			{ trainers: { some: { userId: 1 } } },
		]);
	});

	// Criterio 3 de §7: un curso por invitación solo se abre por la rama de
	// inscripciones, nunca por su tipo de acceso.
	test("ninguna rama abre los cursos por su acceso de invitación", () => {
		const branches = JSON.stringify(courseVisibilityWhere(viewerOf()).OR);

		expect(branches).not.toContain("INVITATION");
	});

	test("una invitación pendiente o una inscripción activa abren el curso", () => {
		expect(courseVisibilityWhere(viewerOf()).OR).toContainEqual({
			enrollments: {
				some: { userId: 1, status: { in: ["INVITED", "ENROLLED"] } },
			},
		});
	});

	test("un externo no tiene rama de inscripciones", () => {
		const branches = JSON.stringify(
			courseVisibilityWhere(viewerOf({ dependencyId: null })).OR,
		);

		expect(branches).not.toContain("enrollments");
	});

	test("los borradores y los cancelados quedan fuera de la audiencia", () => {
		expect(VIEWABLE_STATUSES).toEqual(["PUBLISHED", "FINISHED"]);
	});
});

describe("dependencyVisibilityWhere", () => {
	test("alcanza lo que organiza, lo público y lo restringido a ella o a sus grupos", () => {
		expect(dependencyVisibilityWhere(10).OR).toEqual([
			{ dependencyId: 10 },
			{ status: { in: VIEWABLE_STATUSES }, access: "PUBLIC" },
			{
				status: { in: VIEWABLE_STATUSES },
				access: "RESTRICTED",
				OR: [
					{ dependencyAudience: { some: { dependencyId: 10 } } },
					{ groupAudience: { some: { group: { dependencyId: 10 } } } },
				],
			},
		]);
	});

	test("no abre cursos por invitación de otras dependencias", () => {
		expect(JSON.stringify(dependencyVisibilityWhere(10))).not.toContain(
			"INVITATION",
		);
	});
});

describe("canOpenTeaching", () => {
	const ACTOR = "actor-document-id";
	const courseOf = (
		status: "DRAFT" | "PUBLISHED" | "FINISHED" | "CANCELLED",
		trainerIds: string[] = [],
	) => ({
		status,
		trainers: trainerIds.map((userDocumentId) => ({ userDocumentId })),
	});
	const creator: CourseScope = { kind: "creator", dependencyId: 10, userId: 1 };

	test("un borrador o un cancelado no se imparten", () => {
		expect(canOpenTeaching({ kind: "global" }, courseOf("DRAFT"), ACTOR)).toBe(
			false,
		);
		expect(
			canOpenTeaching({ kind: "global" }, courseOf("CANCELLED"), ACTOR),
		).toBe(false);
	});

	test("organizar basta para abrir la impartición", () => {
		expect(
			canOpenTeaching(
				{ kind: "dependency", dependencyId: 10 },
				courseOf("PUBLISHED"),
				ACTOR,
			),
		).toBe(true);
	});

	test("el capacitador interno solo la abre si imparte el curso", () => {
		expect(canOpenTeaching(creator, courseOf("FINISHED"), ACTOR)).toBe(false);
		expect(canOpenTeaching(creator, courseOf("FINISHED", [ACTOR]), ACTOR)).toBe(
			true,
		);
	});
});
