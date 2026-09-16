import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { env } from "@/core/env.server";
import { THEME_PRESETS } from "@/modules/theme/domain/theme.config";
import { seedOrganization } from "./seed-organization";

// Must use the PG adapter — plain new PrismaClient() is not valid in this project
const adapter = new PrismaPg({
	connectionString: env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
	console.log("🌱 Seeding database...");

	// Clean existing test data (idempotent on re-runs). El orden lo fija la FK
	// users.dependency_id, que es ON DELETE RESTRICT: las dependencias no se
	// pueden borrar mientras quede alguien adscrito.
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
