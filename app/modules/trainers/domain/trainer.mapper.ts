import * as v from "valibot";
import { trainerDetailSchema, trainerSummarySchema } from "./trainer.rules";
import type {
	TrainerDetail,
	TrainerStats,
	TrainerSummary,
} from "./trainer.types";

/**
 * Fila del perfil con su cuenta unida → fila del catálogo.
 *
 * Aplana la relación en la frontera para que ninguna capa de arriba conozca la
 * forma del join.
 */
export const toSummary = (raw: {
	specialty: string;
	institution: string | null;
	archivedAt: Date | null;
	user: {
		documentId: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		type: string;
		dependency: { name: string } | null;
	};
}): TrainerSummary =>
	v.parse(trainerSummarySchema, {
		userDocumentId: raw.user.documentId,
		firstName: raw.user.firstName,
		lastName: raw.user.lastName,
		email: raw.user.email,
		type: raw.user.type,
		specialty: raw.specialty,
		institution: raw.institution,
		dependencyName: raw.user.dependency?.name ?? null,
		archivedAt: raw.archivedAt,
	});

/**
 * Lo mismo, con los campos de la ficha. Las estadísticas se calculan en el
 * repositorio y llegan aparte porque no son columnas del perfil.
 */
export const toDetail = (
	raw: {
		specialty: string;
		institution: string | null;
		bio: string | null;
		archivedAt: Date | null;
		createdAt: Date;
		updatedAt: Date;
		user: {
			documentId: string;
			firstName: string | null;
			lastName: string | null;
			email: string;
			phone: string | null;
			type: string;
			dependency: { name: string } | null;
		};
	},
	stats: TrainerStats,
): TrainerDetail =>
	v.parse(trainerDetailSchema, {
		...toSummary(raw),
		phone: raw.user.phone,
		bio: raw.bio,
		createdAt: raw.createdAt,
		updatedAt: raw.updatedAt,
		...stats,
	});

export const EMPTY_STATS: TrainerStats = {
	coursesTaught: 0,
	averageRating: null,
};

/**
 * Asignaciones a cursos finalizados y valoraciones agregadas por curso →
 * estadísticas por persona.
 *
 * El promedio es el de todas las valoraciones de sus cursos, no el promedio de
 * los promedios: un curso con 40 valoraciones pesa más que uno con 2.
 */
export const toStatsByUser = (
	assignments: readonly { userId: number; courseId: number }[],
	ratings: readonly { courseId: number; scoreSum: number; count: number }[],
): Map<number, TrainerStats> => {
	const ratingsByCourse = new Map(ratings.map((row) => [row.courseId, row]));
	const totals = new Map<
		number,
		{ courses: number; scoreSum: number; count: number }
	>();

	for (const { userId, courseId } of assignments) {
		const total = totals.get(userId) ?? { courses: 0, scoreSum: 0, count: 0 };
		const rating = ratingsByCourse.get(courseId);

		totals.set(userId, {
			courses: total.courses + 1,
			scoreSum: total.scoreSum + (rating?.scoreSum ?? 0),
			count: total.count + (rating?.count ?? 0),
		});
	}

	return new Map(
		[...totals].map(([userId, total]) => [
			userId,
			{
				coursesTaught: total.courses,
				averageRating: total.count === 0 ? null : total.scoreSum / total.count,
			},
		]),
	);
};
