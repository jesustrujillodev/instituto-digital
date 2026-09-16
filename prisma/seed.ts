import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { env } from "@/core/env.server";
import { THEME_PRESETS } from "@/modules/theme/domain/theme.config";
import { seedCalendar } from "./seed-calendar";
import { seedCourses } from "./seed-courses";
import { seedEnrollments } from "./seed-enrollments";
import { seedOrganization } from "./seed-organization";
import { seedTeaching } from "./seed-teaching";
import { seedTrainers } from "./seed-trainers";

// Must use the PG adapter — plain new PrismaClient() is not valid in this project
const adapter = new PrismaPg({
	connectionString: env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
	console.log("🌱 Seeding database...");

	// Clean existing test data (idempotent on re-runs). El orden lo fijan dos FK
	// ON DELETE RESTRICT: users.dependency_id y groups.dependency_id. Las
	// dependencias no se pueden borrar mientras quede alguien adscrito ni ningún
	// grupo colgando.
	// Los cursos primero: su dependencia organizadora, su autor y sus grupos de
	// audiencia son FK RESTRICT. Sesiones, capacitadores y audiencia caen en
	// cascada con el curso.
	// Los créditos antes que el curso: su FK hacia él es RESTRICT.
	await prisma.credit.deleteMany({});
	await prisma.enrollment.deleteMany({});
	await prisma.course.deleteMany({});
	await prisma.groupMember.deleteMany({});
	await prisma.group.deleteMany({});
	await prisma.trainerProfile.deleteMany({});
	await prisma.session.deleteMany({});
	await prisma.user.deleteMany({});
	await prisma.dependencyChange.deleteMany({});
	await prisma.dependency.deleteMany({});

	const password = await bcrypt.hash("Password123!", 12);

	// La estructura organizativa va PRIMERO: el CHECK users_type_coherence exige
	// dependencia y número de empleado a todo interno que no sea
	// superadministrador, así que no puede existir una cuenta antes que la
	// dependencia que la acoge.
	const organization = await seedOrganization(prisma, password);

	const admin = await prisma.user.create({
		data: {
			email: "admin@test.com",
			password,
			firstName: "Admin",
			lastName: "Test",
			role: "ADMIN",
			employeeNumber: "EMP-0001",
			jobTitle: "Administrador de la plataforma",
			dependencyId: organization.unassignedId,
		},
	});

	const user = await prisma.user.create({
		data: {
			email: "user@test.com",
			password,
			firstName: "Usuario",
			lastName: "Test",
			role: "USER",
			employeeNumber: "EMP-0002",
			jobTitle: "Participante",
			dependencyId: organization.unassignedId,
		},
	});

	// Va DESPUÉS de la organización: los perfiles y los grupos cuelgan de cuentas
	// y dependencias que tienen que existir antes.
	const trainers = await seedTrainers(prisma, password);

	// Después de capacitadores y grupos: un curso los asigna y los usa de audiencia.
	const courses = await seedCourses(prisma);

	const enrollments = await seedEnrollments(prisma);

	const calendar = await seedCalendar(prisma);

	const teaching = await seedTeaching(prisma);

	// Fila única del estado de seguridad. El adaptador LANZA si no existe —
	// preferimos que un entorno mal sembrado falle a que se comporte como si
	// nunca se hubiera revocado nada. `update: {}` la deja intacta en re-runs:
	// un seed no debe reabrir un corte ya aplicado.
	await prisma.securityState.upsert({
		where: { id: 1 },
		update: {},
		create: { id: 1 },
	});

	// Presets de fábrica. Son la red de seguridad de la feature de temas: lo que
	// queda para volver cuando un tema publicado sale mal, así que se siembran
	// YA publicados —un tema sin publicar no se puede activar—.
	//
	// Idempotente por nombre y NO destructivo: un re-run del seed actualiza los
	// presets pero no toca los temas que haya creado el admin ni cuál está
	// activo. Un seed que borrara `themes` se llevaría por delante el tema en
	// producción de cualquier entorno donde alguien lo ejecutara por error.
	// Un preset retirado del config no se puede borrar desde el builder (la
	// invariante lo impide) y sus tokens pueden dejar de validar. Es de fábrica,
	// no del admin, así que el seed lo retira. Si estaba activo, la FK con
	// `SetNull` deja la plataforma en el tema base.
	await prisma.theme.deleteMany({
		where: {
			isPreset: true,
			name: { notIn: THEME_PRESETS.map((preset) => preset.name) },
		},
	});

	for (const preset of THEME_PRESETS) {
		const existing = await prisma.theme.findFirst({
			where: { name: preset.name, isPreset: true },
			select: { id: true },
		});

		const tokens = preset.tokens as unknown as Prisma.InputJsonValue;
		const data = {
			name: preset.name,
			isPreset: true,
			draftTokens: tokens,
			publishedTokens: tokens,
			publishedAt: new Date(),
		};

		if (existing) {
			await prisma.theme.update({ where: { id: existing.id }, data });
		} else {
			await prisma.theme.create({ data });
		}
	}

	// La fila de apariencia existe desde el principio, aunque sin tema activo:
	// así el repositorio lee `null` (que significa "sirve el tema base") en vez
	// de no encontrar la fila. Sin `update`, activar un tema y re-sembrar no
	// desactiva lo que ya estaba puesto.
	await prisma.appearanceState.upsert({
		where: { id: 1 },
		update: {},
		create: { id: 1 },
	});

	console.log("✅ Organización:");
	console.log(
		`   • ${organization.dependencies} dependencias (2 activas, 1 desactivada, 1 de acogida)`,
	);
	console.log(
		`   • ${organization.users} cuentas del instituto — password: Password123!`,
	);
	console.log("     super@instituto.gob.mx (SUPERADMIN, sin dependencia)");
	console.log(
		"     laura.sop@instituto.gob.mx / laura.sds@instituto.gob.mx (titulares)",
	);
	console.log(
		"     carlos.sop@instituto.gob.mx / carlos.sds@instituto.gob.mx (auxiliares)",
	);
	console.log("✅ Capacitadores y grupos:");
	console.log(
		`   • ${trainers.profiles} perfiles internos (uno desactivado) y ${trainers.externals} externos`,
	);
	console.log(
		"     carlos.sop@instituto.gob.mx (auxiliar Y capacitador — los roles se acumulan)",
	);
	console.log(
		"     elena.torres@universidad.mx (externa, sin dependencia ni número de empleado)",
	);
	console.log(
		`   • ${trainers.groups} grupos en Obras Públicas (uno con miembros, uno vacío)`,
	);
	console.log("✅ Cursos:");
	console.log(
		`   • ${courses.courses} cursos (2 borradores en Obras Públicas, 1 publicado, 1 por invitación, 1 cancelado)`,
	);
	console.log(
		"     diana.sds@instituto.gob.mx (USER + capacitadora) solo administra el que creó",
	);
	console.log("✅ Inscripciones:");
	console.log(
		`   • ${enrollments.courses} cursos publicados más, ${enrollments.enrollments} inscripciones y ${enrollments.groups} grupo en Desarrollo Social`,
	);
	console.log(
		"     Protección civil básica (por invitación, 1/2), Redacción de oficios (llena), Ética pública (cerrada), Inducción institucional (empezada)",
	);
	console.log("✅ Calendario:");
	console.log(
		`   • ${calendar.courses} curso por invitación en Desarrollo Social: Archivo y transparencia`,
	);
	console.log(
		"     diana.sop inscrita (personal de SOP en otra dependencia), miguel.sop con invitación pendiente",
	);
	console.log("✅ Impartición:");
	console.log(
		`   • ${teaching.courses} cursos de Obras Públicas, ${teaching.credits} crédito y ${teaching.ratings} valoraciones`,
	);
	console.log(
		"     Seguridad en obra (lista pasada, falta el resultado de miguel.sop), Primeros auxilios (finalizado)",
	);
	console.log("✅ Cuentas de la plantilla:");
	console.log(`   • ${admin.email} (ADMIN)  — password: Password123!`);
	console.log(`   • ${user.email}  (USER)   — password: Password123!`);
	console.log("✅ Security state row ready (id = 1)");
	console.log(
		`✅ Theme presets ready: ${THEME_PRESETS.map((p) => p.name).join(", ")}`,
	);
}

main()
	.catch((e) => {
		console.error("❌ Seed failed:", e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
