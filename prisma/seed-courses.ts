import type { Prisma, PrismaClient } from "@prisma/client";
import { endOfZonedDay, zonedInputToUtc } from "@/lib/date-utils";

/**
 * Cursos (PRD-03).
 *
 * Se apoya en las cuentas y grupos de `seed-organization` y `seed-trainers`,
 * buscados por correo y por nombre por el mismo motivo que allí: que los
 * archivos sigan siendo independientes.
 *
 * Lo que la semilla tiene que dejar demostrado:
 * - Un borrador COMPLETO, listo para probar "Publicar" (paso 4 del recorrido
 *   de §9: híbrido, restringido a dos dependencias, 3 sesiones, cupo 20).
 * - Un borrador INCOMPLETO, para ver cada error de publicación.
 * - Un curso creado por un capacitador con rol USER: su alcance de autor.
 * - Los cuatro estados en el listado, incluido uno cancelado con audiencia de
 *   grupo que conserva sus registros.
 * - Un curso AUTOGESTIVO publicado, sin sesiones y con temario, para recorrer
 *   el aula y completarlo por contenido: dos obligatorias, una opcional y un
 *   cuestionario de práctica (docs/adr/0014, 0015).
 * - Un curso presencial EVALUADO CON EXAMEN en línea, con su examen armado
 *   (docs/adr/0015).
 *
 * Las horas se escriben como hora de Tijuana y se convierten con el mismo
 * helper que usa la aplicación.
 */

type Seeded = { courses: number };

/** Preguntas de opción única: la primera opción de cada una es la correcta. */
const singleChoice = (
	questions: readonly { statement: string; options: readonly string[] }[],
) =>
	questions.map((question, index) => ({
		statement: question.statement,
		type: "SINGLE_CHOICE" as const,
		points: 1,
		order: index + 1,
		options: {
			create: question.options.map((text, position) => ({
				text,
				isCorrect: position === 0,
				order: position + 1,
			})),
		},
	}));

/** Una lección de texto con su cuerpo ya en el árbol JSON que guarda el editor. */
const textLesson = (
	order: number,
	title: string,
	paragraphs: string[],
	options: { isRequired?: boolean } = {},
) =>
	({
		title,
		type: "TEXT",
		order,
		isRequired: options.isRequired ?? true,
		estimatedMinutes: 10,
		content: {
			create: {
				body: {
					type: "doc",
					content: paragraphs.map((text) => ({
						type: "paragraph",
						content: [{ type: "text", text }],
					})),
				},
			},
		},
	}) satisfies Prisma.LessonCreateWithoutModuleInput;

const byEmail = async (prisma: PrismaClient, email: string) => {
	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, dependencyId: true },
	});

	if (!user) throw new Error(`La semilla esperaba la cuenta ${email}`);

	return user;
};

const dependencyOf = (user: { dependencyId: number | null }, email: string) => {
	if (user.dependencyId === null) {
		throw new Error(`La semilla esperaba a ${email} con dependencia`);
	}
	return user.dependencyId;
};

const session = (
	date: string,
	startTime: string,
	endTime: string,
	place: { venue?: string; link?: string },
): Prisma.CourseSessionCreateWithoutCourseInput => ({
	startsAt: zonedInputToUtc(date, startTime),
	endsAt: zonedInputToUtc(date, endTime),
	venue: place.venue ?? null,
	link: place.link ?? null,
});

export async function seedCourses(prisma: PrismaClient): Promise<Seeded> {
	const headSop = await byEmail(prisma, "laura.sop@instituto.gob.mx");
	const deputySop = await byEmail(prisma, "carlos.sop@instituto.gob.mx");
	const headSds = await byEmail(prisma, "laura.sds@instituto.gob.mx");
	const trainerSds = await byEmail(prisma, "diana.sds@instituto.gob.mx");
	const external = await byEmail(prisma, "elena.torres@universidad.mx");

	const sop = dependencyOf(headSop, "laura.sop@instituto.gob.mx");
	const sds = dependencyOf(headSds, "laura.sds@instituto.gob.mx");

	const group = await prisma.group.findFirst({
		where: { dependencyId: sop, name: "Mandos medios" },
		select: { id: true },
	});
	if (!group) throw new Error("La semilla esperaba el grupo Mandos medios");

	const venue = "Sala de capacitación, edificio B";
	const link = "https://meet.example.com/instituto-capacitacion";

	// Paso 4 del recorrido de demostración, en borrador y completo: publicarlo
	// tiene que funcionar a la primera.
	await prisma.course.create({
		data: {
			dependencyId: sop,
			createdById: deputySop.id,
			title: "Gestión documental en obra pública",
			description: "Integración y resguardo del expediente técnico de obra.",
			modality: "HYBRID",
			access: "RESTRICTED",
			capacity: 20,
			enrollmentDeadline: endOfZonedDay("2026-11-10"),
			requiresEvaluation: true,
			sessions: {
				create: [
					session("2026-11-17", "09:00", "13:00", { venue, link }),
					session("2026-11-18", "09:00", "13:00", { venue, link }),
					session("2026-11-19", "09:00", "13:00", { venue, link }),
				],
			},
			trainers: {
				create: [{ userId: deputySop.id }, { userId: external.id }],
			},
			dependencyAudience: {
				create: [{ dependencyId: sop }, { dependencyId: sds }],
			},
		},
	});

	// Borrador a medias: en línea, sin enlace en la segunda sesión y sin
	// capacitador. Publicarlo enseña los mensajes de error uno por uno.
	await prisma.course.create({
		data: {
			dependencyId: sop,
			createdById: headSop.id,
			title: "Seguridad en sitio de obra",
			modality: "ONLINE",
			access: "PUBLIC",
			sessions: {
				create: [
					session("2026-12-01", "10:00", "12:00", { link }),
					session("2026-12-02", "10:00", "12:00", {}),
				],
			},
		},
	});

	// Publicado y público, organizado por la otra dependencia.
	await prisma.course.create({
		data: {
			dependencyId: sds,
			createdById: headSds.id,
			title: "Atención ciudadana con enfoque de derechos",
			modality: "IN_PERSON",
			access: "PUBLIC",
			status: "PUBLISHED",
			publishedAt: new Date(),
			sessions: {
				create: [session("2026-10-20", "16:00", "19:00", { venue })],
			},
			trainers: { create: [{ userId: trainerSds.id }] },
		},
	});

	// Creado por un capacitador con rol USER: en su pantalla ve solo este.
	await prisma.course.create({
		data: {
			dependencyId: sds,
			createdById: trainerSds.id,
			title: "Taller de lenguaje claro",
			modality: "IN_PERSON",
			access: "INVITATION",
			sessions: {
				create: [session("2026-11-05", "09:00", "11:00", { venue })],
			},
			trainers: { create: [{ userId: trainerSds.id }] },
		},
	});

	// Autogestivo publicado: sin sesiones, se completa al terminar sus lecciones
	// obligatorias y otorga el crédito en ese momento.
	const selfPaced = await prisma.course.create({
		data: {
			dependencyId: sds,
			createdById: headSds.id,
			title: "Marco normativo municipal en línea",
			description:
				"Curso a ritmo propio. Se acredita al terminar sus lecciones obligatorias.",
			modality: "ONLINE",
			format: "SELF_PACED",
			completionRule: "CONTENT",
			access: "PUBLIC",
			status: "PUBLISHED",
			publishedAt: new Date(),
			trainers: { create: [{ userId: trainerSds.id }] },
			modules: {
				create: [
					{
						title: "Fundamentos",
						order: 1,
						lessons: {
							create: [
								textLesson(1, "Qué regula el municipio", [
									"El ayuntamiento regula lo que la ley le asigna: servicios públicos, uso de suelo y reglamentos de policía y buen gobierno.",
								]),
								textLesson(2, "Jerarquía de las normas", [
									"Un reglamento municipal no puede contradecir a la ley estatal, y esta no puede contradecir a la Constitución.",
								]),
							],
						},
					},
					{
						title: "Para profundizar",
						order: 2,
						lessons: {
							create: [
								textLesson(
									1,
									"Lecturas complementarias",
									[
										"Material de consulta: no hace falta para completar el curso.",
									],
									{ isRequired: false },
								),
								{
									title: "Repaso del módulo",
									type: "QUIZ",
									order: 2,
									isRequired: false,
									estimatedMinutes: 5,
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	});

	// La práctica cuelga de su lección, que tiene que existir antes.
	const practice = await prisma.lesson.findFirstOrThrow({
		where: { title: "Repaso del módulo", module: { courseId: selfPaced.id } },
		select: { id: true },
	});
	await prisma.quiz.create({
		data: {
			courseId: selfPaced.id,
			lessonId: practice.id,
			title: "Repaso del módulo",
			passingScore: 60,
			questions: {
				create: singleChoice([
					{
						statement: "¿Qué norma prevalece sobre un reglamento municipal?",
						options: ["La ley estatal", "Un acuerdo de cabildo"],
					},
					{
						statement:
							"¿Quién emite los reglamentos de policía y buen gobierno?",
						options: ["El ayuntamiento", "El congreso federal"],
					},
				]),
			},
		},
	});

	// Presencial evaluado con examen en línea: nadie captura resultados a mano.
	const examined = await prisma.course.create({
		data: {
			dependencyId: sds,
			createdById: headSds.id,
			title: "Ética en el servicio público",
			description: "Taller presencial. Se evalúa con un examen en línea.",
			modality: "IN_PERSON",
			access: "PUBLIC",
			status: "PUBLISHED",
			publishedAt: new Date(),
			requiresEvaluation: true,
			evaluationMethod: "QUIZ",
			sessions: {
				create: [session("2026-10-27", "09:00", "13:00", { venue })],
			},
			trainers: { create: [{ userId: trainerSds.id }] },
		},
		select: { id: true },
	});
	await prisma.quiz.create({
		data: {
			courseId: examined.id,
			title: "Examen final · Ética en el servicio público",
			passingScore: 70,
			questions: {
				create: singleChoice([
					{
						statement: "¿Qué hacer ante un posible conflicto de interés?",
						options: ["Declararlo y excusarse", "Resolverlo sin avisar"],
					},
					{
						statement: "¿A quién rinde cuentas un servidor público?",
						options: ["A la ciudadanía", "Solo a su jefe inmediato"],
					},
					{
						statement: "¿Se pueden aceptar regalos por un trámite?",
						options: ["No", "Sí, si son pequeños"],
					},
				]),
			},
		},
	});

	// Cancelado con audiencia de grupo: cancelar no borra nada.
	await prisma.course.create({
		data: {
			dependencyId: sop,
			createdById: headSop.id,
			title: "Liderazgo para mandos medios",
			modality: "IN_PERSON",
			access: "RESTRICTED",
			status: "CANCELLED",
			cancelledAt: new Date(),
			sessions: {
				create: [session("2026-10-08", "09:00", "14:00", { venue })],
			},
			trainers: { create: [{ userId: external.id }] },
			groupAudience: { create: [{ groupId: group.id }] },
		},
	});

	return { courses: 7 };
}
