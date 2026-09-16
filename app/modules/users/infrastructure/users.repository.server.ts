import { Prisma } from "@prisma/client";
import type { AccessScope } from "@/shared/auth/scope.rules";
import type { ICradle } from "@/shared/di/container.types";
import { scopeWhere, scopeWriteWhere } from "../domain/user.access.rules";
import { USER_LIST_DEFAULTS } from "../domain/user.config";
import {
	DuplicateEmailError,
	DuplicateEmployeeNumberError,
	UserHasRelatedRecordsError,
	UserNotFoundError,
} from "../domain/user.errors";
import { toDomain, toDomainWithPassword } from "../domain/user.mapper";
import type { IUserRepository } from "../domain/user.repository";
import type {
	CreateUserData,
	ListUsersDto,
	UpdateUserDto,
} from "../domain/user.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

// Campos de texto sobre los que aplica la búsqueda libre. Todos se comparan sin
// distinguir mayúsculas: el usuario teclea "GARCIA" o "garcía" indistintamente.
const SEARCHABLE_FIELDS = [
	"email",
	"firstName",
	"lastName",
	"phone",
	"employeeNumber",
] as const;

// `isTrainer` se deriva de esta relación en el mapper: toda lectura que termine
// en `toDomain` tiene que traerla, o el parseo falla por campo ausente.
const WITH_TRAINER_PROFILE = {
	trainerProfile: { select: { archivedAt: true } },
} as const;

// ── Traducción de errores de Prisma ───────────────────────────────────────────
// Esta es la ÚNICA capa que puede importar tipos del ORM, así que es también la
// única que puede convertir sus códigos en errores de dominio. Aguas arriba
// nadie vuelve a ver un PrismaClientKnownRequestError.
const translatePrismaError = (error: unknown): never => {
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		if (error.code === "P2002") {
			// La tabla tiene TRES índices únicos que una escritura puede romper, y
			// Prisma los reporta con el mismo código. Se distinguen por `meta.target`
			// porque el mensaje al usuario es distinto en cada caso: sin esto, dar de
			// alta a alguien con un número de empleado repetido respondía "ese correo
			// ya está registrado", que manda a corregir el campo equivocado.
			const target = String(error.meta?.target ?? "");

			if (target.includes("employee_number")) {
				throw new DuplicateEmployeeNumberError();
			}
			// El índice único parcial del titular. Desde este módulo no debería
			// alcanzarse —la titularidad se designa en `dependencies` y
			// `ASSIGNABLE_ROLES` no ofrece DEPENDENCY_HEAD—, pero si una escritura
			// futura lo rompe, es mejor un error honesto que uno sobre el correo.
			if (target.includes("one_head_per_dependency")) {
				throw new UserHasRelatedRecordsError();
			}

			throw new DuplicateEmailError();
		}
		// P2025: el registro sobre el que se opera no existe —o cae fuera del
		// alcance, que para quien pregunta es lo mismo.
		if (error.code === "P2025") throw new UserNotFoundError();
		// P2003: clave foránea — algún registro de otro modelo sigue apuntando aquí.
		if (error.code === "P2003") throw new UserHasRelatedRecordsError();
	}
	throw error;
};

/**
 * Filtros del listado, con el alcance dentro.
 *
 * El alcance se funde con los filtros del usuario y no se aplica aparte: así
 * `findAll` y `count` comparten literalmente el mismo `where` y el total no puede
 * describir un conjunto distinto del que se muestra.
 */
const toFilters = (dto: ListUsersDto, scope: AccessScope) => {
	// Sin `status` explícito se listan solo las cuentas activas: es lo que espera
	// quien abre la pantalla, y evita mostrar archivados por olvido.
	const archivedFilter =
		dto.status === "all"
			? {}
			: dto.status === "archived"
				? { archivedAt: { not: null } }
				: { archivedAt: null };

	return {
		// Va PRIMERO para que ninguna clave de abajo pueda sobrescribirlo por
		// accidente al añadir un filtro nuevo.
		...scopeWhere(scope),
		...(dto.role && { role: dto.role }),
		...(dto.type && { type: dto.type }),
		// "no" es ausencia O perfil archivado, así que se expresa negando la única
		// condición que define al capacitador activo, y no con un `isNot` cuya
		// semántica frente a una relación nula depende de la versión del ORM.
		...(dto.trainer === "yes" && {
			trainerProfile: { is: { archivedAt: null } },
		}),
		...(dto.trainer === "no" && {
			NOT: { trainerProfile: { is: { archivedAt: null } } },
		}),
		// El filtro por dependencia usa el identificador público y se resuelve con la
		// relación, sin una consulta previa. Se SUMA al alcance: si se pide una
		// distinta de la propia, el `dependencyId` del alcance no casa y no sale nada.
		...(dto.dependency && { dependency: { documentId: dto.dependency } }),
		...archivedFilter,
		...(dto.search && {
			OR: SEARCHABLE_FIELDS.map((field) => ({
				[field]: { contains: dto.search, mode: Prisma.QueryMode.insensitive },
			})),
		}),
	};
};

// El campo ya viene restringido por la allowlist de listUsersRule, así que aquí
// solo queda elegir el valor por defecto: lo más reciente primero.
const toOrderBy = (dto: ListUsersDto) => ({
	[dto.sortBy ?? "createdAt"]: dto.sortDir ?? "desc",
});

/**
 * `where` de una escritura: la clave única MÁS el alcance.
 *
 * El filtro va junto al documentId y no en una comprobación previa, así que si la
 * cuenta existe pero cae fuera, Prisma lanza P2025 y se traduce a
 * `UserNotFoundError`: fuera de alcance responde igual que inexistente, sin
 * confirmar que el registro exista.
 *
 * Un alcance vacío se corta aquí, antes de tocar la base, con ese mismo error.
 */
const writeWhere = (documentId: string, scope: AccessScope) => {
	const extra = scopeWriteWhere(scope);
	if (extra === null) throw new UserNotFoundError();

	return { documentId, ...extra };
};

export const createUserRepository = ({
	prisma,
}: Dependencies): IUserRepository => {
	return {
		async findAll(filters: ListUsersDto, scope: AccessScope) {
			// Los defaults salen de user.config.ts y no de literales aquí: el servicio
			// usa los mismos para construir la `pagination` de la respuesta, y dos
			// valores distintos describirían una página que no es la consultada.
			const page = filters.page ?? USER_LIST_DEFAULTS.page;
			const pageSize = filters.pageSize ?? USER_LIST_DEFAULTS.pageSize;

			const users = await prisma.user.findMany({
				where: toFilters(filters, scope),
				orderBy: toOrderBy(filters),
				skip: (page - 1) * pageSize,
				take: pageSize,
				include: WITH_TRAINER_PROFILE,
			});
			return users.map(toDomain);
		},
		async count(filters: ListUsersDto, scope: AccessScope) {
			return prisma.user.count({ where: toFilters(filters, scope) });
		},
		async findById(documentId: string, scope: AccessScope) {
			// `findFirst` y no `findUnique`: hace falta combinar la clave única con el
			// filtro del alcance, y fuera de alcance tiene que devolver null igual que
			// un documentId inexistente.
			const user = await prisma.user.findFirst({
				where: { documentId, ...scopeWhere(scope) },
				include: WITH_TRAINER_PROFILE,
			});
			return user ? toDomain(user) : null;
		},
		async findByInternalId(userId: number) {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				include: WITH_TRAINER_PROFILE,
			});
			return user ? toDomain(user) : null;
		},
		async findByEmail(email: string) {
			const user = await prisma.user.findUnique({
				where: { email },
				include: WITH_TRAINER_PROFILE,
			});
			// Único método que conserva la contraseña: lo consume el login de `auth`
			// para compararla. Pasa por el mapper igual que el resto.
			return user ? toDomainWithPassword(user) : null;
		},
		async create(data: CreateUserData) {
			try {
				const user = await prisma.user.create({
					data,
					include: WITH_TRAINER_PROFILE,
				});
				return toDomain(user);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async update(documentId: string, dto: UpdateUserDto, scope: AccessScope) {
			try {
				// El filtro del alcance viaja JUNTO a la clave única. Si la cuenta existe
				// pero cae fuera, Prisma lanza P2025 y se traduce a UserNotFoundError:
				// fuera de alcance responde igual que inexistente.
				const user = await prisma.user.update({
					where: writeWhere(documentId, scope),
					data: dto,
					include: WITH_TRAINER_PROFILE,
				});
				return toDomain(user);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async updatePhoto(
			documentId: string,
			photoUrl: string,
			scope: AccessScope,
		) {
			try {
				const user = await prisma.user.update({
					where: writeWhere(documentId, scope),
					data: { photoUrl },
					include: WITH_TRAINER_PROFILE,
				});
				return toDomain(user);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async updatePassword(
			documentId: string,
			hashedPassword: string,
			scope: AccessScope,
		) {
			try {
				await prisma.user.update({
					where: writeWhere(documentId, scope),
					data: { password: hashedPassword },
				});
			} catch (error) {
				translatePrismaError(error);
			}
		},
		async archive(documentId: string, scope: AccessScope) {
			try {
				const user = await prisma.user.update({
					where: writeWhere(documentId, scope),
					data: { archivedAt: new Date() },
					include: WITH_TRAINER_PROFILE,
				});
				return toDomain(user);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async unarchive(documentId: string, scope: AccessScope) {
			try {
				const user = await prisma.user.update({
					where: writeWhere(documentId, scope),
					data: { archivedAt: null },
					include: WITH_TRAINER_PROFILE,
				});
				return toDomain(user);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async delete(documentId: string, scope: AccessScope) {
			try {
				await prisma.user.delete({
					where: writeWhere(documentId, scope),
				});
			} catch (error) {
				translatePrismaError(error);
			}
		},
		async changeDependency({
			documentId,
			toDependencyId,
			changedById,
			nextRole,
			scope,
		}) {
			try {
				// Transacción explícita (docs/reglas.md §8.1): mover la cuenta y dejar
				// constancia de quién la movió son dos escrituras de la misma decisión.
				// Un fallo entre ellas dejaría a la persona en otra dependencia sin
				// rastro, que es justo lo que la bitácora existe para evitar.
				//
				// Nivel de aislamiento: el default de Postgres (read committed). Basta
				// porque no hay invariante de unicidad en juego —la degradación del rol la
				// resuelve `roleAfterDependencyChange` antes de entrar aquí—.
				return await prisma.$transaction(async (tx) => {
					// La lectura va DENTRO de la transacción y con el alcance aplicado: es
					// lo que da a la vez la dependencia de origen para la bitácora y la
					// comprobación de que la cuenta es alcanzable.
					const current = await tx.user.findFirst({
						where: { documentId, ...scopeWhere(scope) },
						select: { id: true, dependencyId: true },
					});
					if (!current) throw new UserNotFoundError();

					const user = await tx.user.update({
						where: { id: current.id },
						data: { dependencyId: toDependencyId, role: nextRole },
						include: WITH_TRAINER_PROFILE,
					});

					await tx.dependencyChange.create({
						data: {
							userId: current.id,
							fromDependencyId: current.dependencyId,
							toDependencyId,
							changedById,
						},
					});

					return toDomain(user);
				});
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async listDependencyHistory(documentId: string, scope: AccessScope) {
			// El alcance se aplica sobre la CUENTA, no sobre la bitácora: no se puede
			// leer el historial de alguien que no se alcanza.
			const user = await prisma.user.findFirst({
				where: { documentId, ...scopeWhere(scope) },
				select: { id: true },
			});
			if (!user) return [];

			const changes = await prisma.dependencyChange.findMany({
				where: { userId: user.id },
				orderBy: { createdAt: "desc" },
			});
			if (changes.length === 0) return [];

			// `dependency_changes` guarda ids escalares sin relación declarada —es
			// bitácora, y declararla obligaría a cuatro relaciones inversas—, así que
			// los nombres se resuelven en una segunda consulta y no en un join.
			const ids = [
				...new Set(
					changes.flatMap((change) =>
						change.fromDependencyId === null
							? [change.toDependencyId]
							: [change.fromDependencyId, change.toDependencyId],
					),
				),
			];

			const dependencies = await prisma.dependency.findMany({
				where: { id: { in: ids } },
				select: { id: true, name: true },
			});
			const nameById = new Map(dependencies.map((d) => [d.id, d.name]));

			return changes.map((change) => ({
				id: change.id,
				fromDependencyName:
					change.fromDependencyId === null
						? null
						: (nameById.get(change.fromDependencyId) ?? null),
				// Una dependencia borrada dejaría el nombre sin resolver. No puede
				// pasar —la FK es RESTRICT— pero la bitácora no debe reventar por eso.
				toDependencyName: nameById.get(change.toDependencyId) ?? "Desconocida",
				bySelf: change.changedById === change.userId,
				createdAt: change.createdAt,
			}));
		},
	};
};
