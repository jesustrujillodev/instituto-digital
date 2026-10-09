import { Prisma } from "@prisma/client";
import { uniqueViolationTarget } from "@/core/prisma-errors";
import type { ICradle } from "@/shared/di/container.types";
import {
	DuplicateTrainerEmailError,
	TrainerProfileAlreadyExistsError,
	TrainerProfileNotFoundError,
} from "../domain/trainer.errors";
import {
	EMPTY_STATS,
	toDetail,
	toStatsByUser,
	toSummary,
} from "../domain/trainer.mapper";
import type { ITrainerRepository } from "../domain/trainer.repository";
import type {
	CreateProfileData,
	TrainerStats,
	UpdateProfileDto,
} from "../domain/trainer.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const SUMMARY_SELECT = {
	specialty: true,
	institution: true,
	archivedAt: true,
	user: {
		select: {
			documentId: true,
			firstName: true,
			lastName: true,
			email: true,
			type: true,
			dependency: { select: { name: true } },
		},
	},
} as const;

const DETAIL_SELECT = {
	...SUMMARY_SELECT,
	userId: true,
	bio: true,
	createdAt: true,
	updatedAt: true,
	user: {
		select: { ...SUMMARY_SELECT.user.select, phone: true },
	},
} as const;

// ── Traducción de errores de Prisma ───────────────────────────────────────────
// Única capa que puede importar tipos del ORM, así que también la única que
// convierte sus códigos en errores de dominio.
const translatePrismaError = (error: unknown): never => {
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		if (error.code === "P2002") {
			// La PK de `trainer_profiles` ES la FK a la cuenta, así que un segundo
			// perfil para la misma persona llega como P2002 sobre esa clave. El
			// correo solo puede chocar cuando esta transacción crea la cuenta del
			// externo.
			const target = uniqueViolationTarget(error);

			if (target.includes("email")) throw new DuplicateTrainerEmailError();

			throw new TrainerProfileAlreadyExistsError();
		}
		if (error.code === "P2025") throw new TrainerProfileNotFoundError();
	}
	throw error;
};

export const createTrainerRepository = ({
	prisma,
}: Dependencies): ITrainerRepository => {
	/**
	 * Cursos impartidos y valoración promedio (§6.3), calculados y nunca
	 * capturados. Solo cuentan los cursos finalizados: uno publicado todavía no se
	 * ha impartido y no se puede valorar.
	 */
	const statsOf = async (userId: number): Promise<TrainerStats> => {
		const [coursesTaught, rating] = await Promise.all([
			prisma.courseTrainer.count({
				where: { userId, course: { status: "FINISHED" } },
			}),
			prisma.courseRating.aggregate({
				where: {
					course: { status: "FINISHED", trainers: { some: { userId } } },
				},
				_avg: { score: true },
			}),
		]);

		return { coursesTaught, averageRating: rating._avg.score };
	};

	const detailOf = async (
		profile: Parameters<typeof toDetail>[0] & { userId: number },
	) => toDetail(profile, await statsOf(profile.userId));

	return {
		async findActive() {
			// Activo es el perfil sin archivar Y la cuenta sin archivar: un
			// capacitador dado de baja no puede aparecer en el selector de un curso.
			const profiles = await prisma.trainerProfile.findMany({
				where: { archivedAt: null, user: { archivedAt: null } },
				orderBy: { user: { firstName: "asc" } },
				select: SUMMARY_SELECT,
			});

			return profiles.map(toSummary);
		},
		async findByUserDocumentIds(userDocumentIds: readonly string[]) {
			if (userDocumentIds.length === 0) return [];

			// Las tres lecturas parten del mismo conjunto de cuentas —las de esos
			// documentId que tienen perfil—, así que viajan juntas y no en fila. La
			// media se rehace desde sumas y conteos por curso, que es lo que
			// `statsOf` promedia rating a rating.
			const trainerUsers = {
				documentId: { in: [...userDocumentIds] },
				trainerProfile: { isNot: null },
			};
			const [profiles, assignments, ratings] = await Promise.all([
				prisma.trainerProfile.findMany({
					where: { user: { documentId: { in: [...userDocumentIds] } } },
					select: DETAIL_SELECT,
				}),
				prisma.courseTrainer.findMany({
					where: { user: trainerUsers, course: { status: "FINISHED" } },
					select: { userId: true, courseId: true },
				}),
				prisma.courseRating.groupBy({
					by: ["courseId"],
					where: {
						course: {
							status: "FINISHED",
							trainers: { some: { user: trainerUsers } },
						},
					},
					_sum: { score: true },
					_count: { _all: true },
				}),
			]);
			if (profiles.length === 0) return [];

			const stats = toStatsByUser(
				assignments,
				ratings.map((row) => ({
					courseId: row.courseId,
					scoreSum: row._sum.score ?? 0,
					count: row._count._all,
				})),
			);

			return profiles.map((profile) =>
				toDetail(profile, stats.get(profile.userId) ?? EMPTY_STATS),
			);
		},
		async existsForUser(userId: number) {
			// Cuenta también los archivados: un perfil desactivado se reactiva, no se
			// vuelve a crear, y la PK impediría crearlo de todos modos.
			const found = await prisma.trainerProfile.findUnique({
				where: { userId },
				select: { userId: true },
			});
			return found !== null;
		},
		async create(data: CreateProfileData) {
			try {
				const profile = await prisma.trainerProfile.create({
					data,
					select: DETAIL_SELECT,
				});
				return await detailOf(profile);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async update(userId: number, dto: UpdateProfileDto) {
			try {
				const profile = await prisma.trainerProfile.update({
					where: { userId },
					data: dto,
					select: DETAIL_SELECT,
				});
				return await detailOf(profile);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async archive(userId: number) {
			try {
				const profile = await prisma.trainerProfile.update({
					where: { userId },
					data: { archivedAt: new Date() },
					select: DETAIL_SELECT,
				});
				return await detailOf(profile);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async unarchive(userId: number) {
			try {
				const profile = await prisma.trainerProfile.update({
					where: { userId },
					data: { archivedAt: null },
					select: DETAIL_SELECT,
				});
				return await detailOf(profile);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
	};
};
