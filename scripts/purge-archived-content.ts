/**
 * Borra las lecciones, evaluaciones de módulo y módulos que quedaron archivados
 * en capacitaciones en borrador, con la misma regla que el borrado del temario
 * (docs/adr/0031): un borrador nunca tuvo avance ni intentos, así que la cascada
 * no se lleva nada de nadie. Lo archivado en cursos ya publicados se queda.
 *
 * Sin `--apply` solo cuenta. Idempotente: una segunda corrida no encuentra nada.
 *
 * Uso:
 *   bun scripts/purge-archived-content.ts
 *   bun scripts/purge-archived-content.ts --apply
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "@/core/env.server";

const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

const apply = process.argv.includes("--apply");

const ARCHIVED = { archivedAt: { not: null } };
const DRAFT = { status: "DRAFT" } as const;
const NOT_DRAFT = { status: { not: "DRAFT" } } as const;
const MODULE_QUIZ = { ...ARCHIVED, moduleId: { not: null } };

const lessonsInDraft = { ...ARCHIVED, module: { course: DRAFT } };
const quizzesInDraft = { ...MODULE_QUIZ, course: DRAFT };
const modulesInDraft = { ...ARCHIVED, course: DRAFT };

const [lessons, quizzes, modules, keptLessons, keptQuizzes, keptModules] =
	await Promise.all([
		prisma.lesson.count({ where: lessonsInDraft }),
		prisma.quiz.count({ where: quizzesInDraft }),
		prisma.courseModule.count({ where: modulesInDraft }),
		prisma.lesson.count({
			where: { ...ARCHIVED, module: { course: NOT_DRAFT } },
		}),
		prisma.quiz.count({ where: { ...MODULE_QUIZ, course: NOT_DRAFT } }),
		prisma.courseModule.count({ where: { ...ARCHIVED, course: NOT_DRAFT } }),
	]);

console.log(
	`En borrador: ${lessons} lecciones, ${quizzes} evaluaciones de módulo y ${modules} módulos archivados · ` +
		`fuera de borrador se conservan ${keptLessons}, ${keptQuizzes} y ${keptModules}`,
);

if (!apply) {
	console.log("Sin --apply no se borra nada.");
} else {
	// Los módulos al final: así nada cae en su cascada y cada conteo sale de su
	// propia tabla.
	const [deletedLessons, deletedQuizzes, deletedModules] =
		await prisma.$transaction([
			prisma.lesson.deleteMany({ where: lessonsInDraft }),
			prisma.quiz.deleteMany({ where: quizzesInDraft }),
			prisma.courseModule.deleteMany({ where: modulesInDraft }),
		]);
	console.log(
		`Borradas ${deletedLessons.count} lecciones, ${deletedQuizzes.count} evaluaciones de módulo y ${deletedModules.count} módulos`,
	);
}

await prisma.$disconnect();
