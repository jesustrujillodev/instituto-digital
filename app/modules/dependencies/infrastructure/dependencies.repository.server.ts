import { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import { DEPENDENCY_LIST_DEFAULTS } from "../domain/dependency.config";
import {
	DependencyAlreadyHasHeadError,
	DependencyNotFoundError,
	DuplicateDependencyNameError,
} from "../domain/dependency.errors";
import { toDomain } from "../domain/dependency.mapper";
import type { IDependencyRepository } from "../domain/dependency.repository";
import type {
	CreateDependencyDto,
	ListDependenciesDto,
	UpdateDependencyDto,
} from "../domain/dependency.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

// Campos de texto sobre los que aplica la búsqueda libre, sin distinguir
// mayúsculas: se teclea "obras" o "OBRAS" indistintamente.
const SEARCHABLE_FIELDS = ["name", "acronym"] as const;

/** Rol del titular. Es el valor que el índice único parcial vigila. */
const HEAD_ROLE = "DEPENDENCY_HEAD";

/** Rol al que se degrada un titular relevado: pierde la gestión, no la cuenta. */
const DEMOTED_ROLE = "USER";

/** Lo que el módulo proyecta de una cuenta. Ver `DependencyMember`. */
const MEMBER_SELECT = {
	id: true,
	documentId: true,
	archivedAt: true,
} as const;

// ── Traducción de errores de Prisma ───────────────────────────────────────────
// Esta es la ÚNICA capa que puede importar tipos del ORM, así que es también la
// única que puede convertir sus códigos en errores de dominio. Aguas arriba
// nadie vuelve a ver un PrismaClientKnownRequestError.
const translatePrismaError = (error: unknown): never => {
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		if (error.code === "P2002") {
			// P2002 no siempre es el nombre: `assignHead` escribe en auth.users y
			// puede chocar con el índice único parcial del titular. Se distinguen por
			// `meta.target`, porque el mensaje al usuario es otro por completo —
			// "ese nombre ya existe" contra "esa dependencia ya tiene titular".
			const target = String(error.meta?.target ?? "");

			if (target.includes("one_head_per_dependency")) {
				throw new DependencyAlreadyHasHeadError();
			}

			throw new DuplicateDependencyNameError();
		}
		// P2025: el registro sobre el que se opera no existe.
		if (error.code === "P2025") throw new DependencyNotFoundError();
	}
	throw error;
};

const toFilters = (dto: ListDependenciesDto) => {
	// Sin `status` explícito se listan solo las activas: es lo que espera quien
	// abre la pantalla, y evita mostrar archivadas por olvido.
	const archivedFilter =
		dto.status === "all"
			? {}
			: dto.status === "archived"
				? { archivedAt: { not: null } }
				: { archivedAt: null };

	return {
		...archivedFilter,
		...(dto.search && {
			OR: SEARCHABLE_FIELDS.map((field) => ({
				[field]: { contains: dto.search, mode: Prisma.QueryMode.insensitive },
			})),
		}),
	};
};

// El campo ya viene restringido por la allowlist de listDependenciesRule.
const toOrderBy = (dto: ListDependenciesDto) => ({
	[dto.sortBy ?? "name"]: dto.sortDir ?? "asc",
});

export const createDependencyRepository = ({
	prisma,
}: Dependencies): IDependencyRepository => {
	return {
		async findAll(filters: ListDependenciesDto) {
			// Los defaults salen de dependency.config.ts y no de literales aquí: el
			// servicio usa los mismos para construir la `pagination` de la respuesta,
			// y dos valores distintos describirían una página que no es la consultada.
			const page = filters.page ?? DEPENDENCY_LIST_DEFAULTS.page;
			const pageSize = filters.pageSize ?? DEPENDENCY_LIST_DEFAULTS.pageSize;

			const dependencies = await prisma.dependency.findMany({
				where: toFilters(filters),
				orderBy: toOrderBy(filters),
				skip: (page - 1) * pageSize,
				take: pageSize,
			});

			return dependencies.map(toDomain);
		},
		async count(filters: ListDependenciesDto) {
			return prisma.dependency.count({ where: toFilters(filters) });
		},
		async findById(documentId: string) {
			const dependency = await prisma.dependency.findUnique({
				where: { documentId },
			});
			return dependency ? toDomain(dependency) : null;
		},
		async findByInternalId(id: number) {
			const dependency = await prisma.dependency.findUnique({ where: { id } });
			return dependency ? toDomain(dependency) : null;
		},
		async findActive() {
			const dependencies = await prisma.dependency.findMany({
				where: { archivedAt: null },
				orderBy: { name: "asc" },
			});
			return dependencies.map(toDomain);
		},
		async findCatalog() {
			const dependencies = await prisma.dependency.findMany({
				orderBy: { name: "asc" },
			});
			return dependencies.map(toDomain);
		},
		async create(dto: CreateDependencyDto) {
			try {
				const dependency = await prisma.dependency.create({ data: dto });
				return toDomain(dependency);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async update(documentId: string, dto: UpdateDependencyDto) {
			try {
				const dependency = await prisma.dependency.update({
					where: { documentId },
					data: dto,
				});
				return toDomain(dependency);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async archive(documentId: string) {
			try {
				const dependency = await prisma.dependency.update({
					where: { documentId },
					data: { archivedAt: new Date() },
				});
				return toDomain(dependency);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async unarchive(documentId: string) {
			try {
				const dependency = await prisma.dependency.update({
					where: { documentId },
					data: { archivedAt: null },
				});
				return toDomain(dependency);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async findHead(dependencyId: number) {
			// Mismo predicado que el índice único parcial: titular Y no archivado. Un
			// titular archivado no cuenta para la invariante, así que tampoco debe
			// contar aquí o se intentaría degradar a quien no ocupa el puesto.
			return prisma.user.findFirst({
				where: { dependencyId, role: HEAD_ROLE, archivedAt: null },
				select: MEMBER_SELECT,
			});
		},
		async findHeadCandidates(dependencyId: number) {
			const members = await prisma.user.findMany({
				where: { dependencyId, archivedAt: null },
				select: {
					documentId: true,
					firstName: true,
					lastName: true,
					email: true,
					role: true,
				},
				orderBy: [{ firstName: "asc" }, { email: "asc" }],
			});

			return members.map(({ role, ...member }) => ({
				...member,
				isHead: role === HEAD_ROLE,
			}));
		},
		async findMember(dependencyId: number, userDocumentId: string) {
			// La pertenencia va en el `where`, no en una comprobación posterior: así
			// una cuenta de otra dependencia sale como null y quien llama no puede
			// olvidarse de compararla.
			return prisma.user.findFirst({
				where: { documentId: userDocumentId, dependencyId },
				select: MEMBER_SELECT,
			});
		},
		async assignHead({ dependencyId, candidateUserId, currentHeadUserId }) {
			try {
				// Transacción explícita (docs/reglas.md §8.1): son dos escrituras
				// relacionadas y un fallo entre ellas dejaría la dependencia sin titular
				// o con dos. El nivel de aislamiento es el default de Postgres (read
				// committed): basta porque la unicidad no la defiende el aislamiento
				// sino el índice único parcial, que aborta la transacción entera.
				await prisma.$transaction(async (tx) => {
					// Degradar ANTES de promover. Al revés, el índice único parcial
					// dispara a mitad de transacción: durante un instante habría dos
					// titulares activos en la misma dependencia.
					if (currentHeadUserId !== null) {
						await tx.user.update({
							where: { id: currentHeadUserId },
							data: { role: DEMOTED_ROLE },
						});
					}

					await tx.user.update({
						where: { id: candidateUserId },
						data: { role: HEAD_ROLE },
					});
				});
			} catch (error) {
				translatePrismaError(error);
			}
		},
	};
};
