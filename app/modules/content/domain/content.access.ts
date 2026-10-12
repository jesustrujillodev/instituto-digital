import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	type CourseScopeWriteWhere,
	courseScopeWriteWhere,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import {
	type SessionMaterialCourseWhere,
	sessionMaterialCourseWhere,
} from "./session-material.rules";

// ===============================================================
// Quién lee el material subido fuera de su pantalla (el proxy de storage)
// ===============================================================
// El mismo alcance que las pantallas que lo sirven: quien administra el temario,
// quien administra o imparte las sesiones y quien está inscrito. Un `{}` sería
// "todos": por eso cada rama sale de una función que nunca lo devuelve para un
// alcance vacío.

type Reader = Pick<
	AuthContext,
	"userId" | "role" | "dependencyId" | "isTrainer"
>;

const ACTIVE = { archivedAt: null } as const;

/** La inscripción que abre el material: activa, como pide el aula. */
const enrolledWhere = (userId: number) => ({
	enrollments: { some: { userId, status: "ENROLLED" as const } },
});

/** Cursos cuyo aula está abierta para el participante (`assertClassroomReadable`). */
const classroomCourseWhere = (userId: number) => ({
	status: { in: ["PUBLISHED", "FINISHED"] as CourseStatus[] },
	...enrolledWhere(userId),
});

export type LessonMaterialReadWhere = {
	OR: (
		| { lesson: { module: { course: CourseScopeWriteWhere } } }
		| {
				lesson: {
					archivedAt: null;
					module: {
						archivedAt: null;
						course: ReturnType<typeof classroomCourseWhere>;
					};
				};
		  }
	)[];
};

/**
 * Filas de `LessonContent` cuyo material puede leer quien pide: el temario que
 * administra (`createContentCourseGate`) y las lecciones activas del aula en
 * la que está inscrito.
 */
export const lessonMaterialReadWhere = (
	reader: Reader,
): LessonMaterialReadWhere => {
	const branches: LessonMaterialReadWhere["OR"] = [
		{
			lesson: {
				...ACTIVE,
				module: { ...ACTIVE, course: classroomCourseWhere(reader.userId) },
			},
		},
	];
	const write = courseScopeWriteWhere(resolveCourseScope(reader));
	if (write) branches.push({ lesson: { module: { course: write } } });

	return { OR: branches };
};

export type SessionMaterialReadWhere = {
	OR: (
		| { session: { course: SessionMaterialCourseWhere } }
		| {
				session: { course: ReturnType<typeof enrolledWhere> };
				OR: [
					{ availableFromSession: false },
					{ session: { startsAt: { lte: Date } } },
				];
		  }
	)[];
};

/**
 * Filas de `SessionMaterial` que puede leer quien pide: las de los cursos que
 * administra o imparte, y las de los cursos en que está inscrito una vez
 * disponibles (`isSessionMaterialAvailable`, evaluado en la consulta).
 */
export const sessionMaterialReadWhere = (
	reader: Reader,
	now: Date,
): SessionMaterialReadWhere => {
	const branches: SessionMaterialReadWhere["OR"] = [
		{
			session: { course: enrolledWhere(reader.userId) },
			OR: [
				{ availableFromSession: false },
				{ session: { startsAt: { lte: now } } },
			],
		},
	];
	const managed = sessionMaterialCourseWhere(reader);
	if (managed) branches.push({ session: { course: managed } });

	return { OR: branches };
};
