/**
 * Arranque de una base de producción: crea la fila del estado de seguridad y el
 * primer superadministrador. A diferencia del seed (solo desarrollo), no borra
 * nada y no trae contraseñas escritas en el repositorio.
 *
 *   BOOTSTRAP_SUPERADMIN_EMAIL=… BOOTSTRAP_SUPERADMIN_PASSWORD=… bun run bootstrap
 *
 * Opcionales: BOOTSTRAP_SUPERADMIN_EMPLOYEE_NUMBER (por defecto ADMIN-0001),
 * BOOTSTRAP_SUPERADMIN_FIRST_NAME y BOOTSTRAP_SUPERADMIN_LAST_NAME.
 *
 * Se puede repetir: si ya hay un superadministrador activo no crea ni toca
 * nada. El que crea tiene que cambiar su contraseña en el primer acceso.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as v from "valibot";
import { env } from "@/core/env.server";
import { createPasswordService } from "@/modules/auth/application/password.service.server";
import {
	bootstrapPlanOf,
	bootstrapSuperadminRule,
} from "@/modules/users/domain/user.bootstrap.rules";

const input = v.safeParse(bootstrapSuperadminRule, {
	email: process.env.BOOTSTRAP_SUPERADMIN_EMAIL,
	password: process.env.BOOTSTRAP_SUPERADMIN_PASSWORD,
	employeeNumber:
		process.env.BOOTSTRAP_SUPERADMIN_EMPLOYEE_NUMBER ?? "ADMIN-0001",
	firstName: process.env.BOOTSTRAP_SUPERADMIN_FIRST_NAME,
	lastName: process.env.BOOTSTRAP_SUPERADMIN_LAST_NAME,
});

if (!input.success) {
	const details = input.issues
		.map((issue) => {
			const field = issue.path?.map((p) => String(p.key)).join(".") ?? "?";
			return `  - ${field}: ${issue.message}`;
		})
		.join("\n");
	console.error(
		`❌ Variables del bootstrap incompletas o inválidas:\n${details}\n\nRevisa BOOTSTRAP_SUPERADMIN_EMAIL y BOOTSTRAP_SUPERADMIN_PASSWORD.`,
	);
	process.exit(1);
}

const admin = input.output;
const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

try {
	const hashedPassword = await createPasswordService().hash(admin.password);

	// Contar, decidir y crear en la misma transacción: dos arranques a la vez
	// no dejan dos superadministradores.
	const outcome = await prisma.$transaction(
		async (tx) => {
			// El adaptador del estado de seguridad LANZA si la fila no existe:
			// sin ella, la app no evalúa ningún token.
			await tx.securityState.upsert({
				where: { id: 1 },
				update: {},
				create: { id: 1 },
			});

			const [activeSuperadmins, emailTaken] = await Promise.all([
				tx.user.count({
					where: { role: "SUPERADMIN", archivedAt: null },
				}),
				tx.user.count({ where: { email: admin.email } }),
			]);
			const plan = bootstrapPlanOf({
				activeSuperadmins,
				emailTaken: emailTaken > 0,
			});

			if (plan === "create") {
				await tx.user.create({
					data: {
						email: admin.email,
						password: hashedPassword,
						firstName: admin.firstName || null,
						lastName: admin.lastName || null,
						role: "SUPERADMIN",
						type: "INTERNAL",
						employeeNumber: admin.employeeNumber,
						dependencyId: null,
						mustChangePassword: true,
					},
				});
			}
			return plan;
		},
		{ isolationLevel: "Serializable" },
	);

	switch (outcome) {
		case "skip":
			console.log(
				"✅ Ya hay un superadministrador activo: no se creó ni se cambió nada.",
			);
			break;
		case "conflict":
			console.error(
				`❌ ${admin.email} ya es de otra cuenta y no hay superadministrador activo. No se promueve una cuenta existente: usa otro correo.`,
			);
			process.exitCode = 1;
			break;
		case "create":
			console.log(
				`✅ Superadministrador ${admin.email} creado. Tendrá que cambiar la contraseña en su primer acceso.`,
			);
			break;
	}
} finally {
	await prisma.$disconnect();
}
