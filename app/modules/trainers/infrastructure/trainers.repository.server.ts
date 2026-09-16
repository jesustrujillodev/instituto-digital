import { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import { TRAINER_LIST_DEFAULTS } from "../domain/trainer.config";
import {
	DuplicateTrainerEmailError,
	TrainerProfileAlreadyExistsError,
	TrainerProfileNotFoundError,
} from "../domain/trainer.errors";
import { toDetail, toSummary } from "../domain/trainer.mapper";
import type { ITrainerRepository } from "../domain/trainer.repository";
import {
	TRAINER_USER_SORT_FIELDS,
	type TrainerSortField,
} from "../domain/trainer.rules";
import type {
	CreateProfileData,
	ListTrainersDto,
	UpdateProfileDto,
} from "../domain/trainer.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

// Campos de la CUENTA sobre los que aplica la búsqueda libre, sin distinguir
// mayúsculas.
const SEARCHABLE_FIELDS = ["firstName", "lastName", "email"] as const;

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
			const target = String(error.meta?.target ?? "");

			if (target.includes("email")) throw new DuplicateTrainerEmailError();

			throw new TrainerProfileAlreadyExistsError();
		}
		if (error.code === "P2025") throw new TrainerProfileNotFoundError();
	}
	throw error;
};

const toFilters = (dto: ListTrainersDto) => {
	// Sin `status` explícito se listan solo los perfiles activos: es lo que
	// espera quien abre el catálogo para asignar a alguien.
	const archivedFilter =
		dto.status === "all"
			? {}
			: dto.status === "archived"
				? { archivedAt: { not: null } }
				: { archivedAt: null };

	// El tipo y la búsqueda libre viven los dos en la cuenta, así que se funden
	// en un solo filtro: dos claves `user` se pisarían.
	const userFilter = {
		...(dto.type && { type: dto.type }),
		...(dto.search && {
			OR: SEARCHABLE_FIELDS.map((field) => ({
				[field]: { contains: dto.search, mode: Prisma.QueryMode.insensitive },
			})),
		}),
	};

	return {
		...archivedFilter,
		...(dto.specialty && {
			specialty: {
				contains: dto.specialty,
				mode: Prisma.QueryMode.insensitive,
			},
		}),
		...(Object.keys(userFilter).length > 0 ? { user: userFilter } : {}),
	};
};

// El campo ya viene restringido por la allowlist de listTrainersRule; aquí solo
// se decide si ordena por el perfil o por la cuenta.
const toOrderBy = (dto: ListTrainersDto) => {
	const field: TrainerSortField = dto.sortBy ?? "firstName";
	const direction = dto.sortDir ?? "asc";

	return TRAINER_USER_SORT_FIELDS.includes(field)
		? { user: { [field]: direction } }
		: { [field]: direction };
};

export const createTrainerRepository = ({
	prisma,
}: Dependencies): ITrainerRepository => {
	return {
		async findAll(filters: ListTrainersDto) {
			const page = filters.page ?? TRAINER_LIST_DEFAULTS.page;
			const pageSize = filters.pageSize ?? TRAINER_LIST_DEFAULTS.pageSize;

			const profiles = await prisma.trainerProfile.findMany({
				where: toFilters(filters),
				orderBy: toOrderBy(filters),
				skip: (page - 1) * pageSize,
				take: pageSize,
				select: SUMMARY_SELECT,
			});

			return profiles.map(toSummary);
		},
		async count(filters: ListTrainersDto) {
			return prisma.trainerProfile.count({ where: toFilters(filters) });
		},
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
		async findByUserDocumentId(userDocumentId: string) {
			const profile = await prisma.trainerProfile.findFirst({
				where: { user: { documentId: userDocumentId } },
				select: DETAIL_SELECT,
			});
			return profile ? toDetail(profile) : null;
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
				return toDetail(profile);
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
				return toDetail(profile);
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
				return toDetail(profile);
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
				return toDetail(profile);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
	};
};
