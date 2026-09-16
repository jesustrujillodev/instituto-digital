import type { AccessScope } from "@/shared/auth/scope.rules";
import type { Role } from "@/shared/rules/atoms.rules";
import type {
	CreateUserData,
	DependencyChangeEntry,
	ListUsersDto,
	SafeUser,
	UpdateUserDto,
	User,
} from "./user.types";

/**
 * El alcance es un PARÁMETRO de cada operación, no un valor inyectado en el
 * contenedor.
 *
 * Es deliberado y es la garantía principal del aislamiento: TypeScript falla en
 * cada punto que lo olvide, y el hook `pre-commit` corre `typecheck`. Un valor
 * ambiental no da esa garantía —compilaría— y además dejaría el servicio
 * inutilizable desde la semilla, donde no hay sesión de la que derivarlo.
 *
 * Fuera de alcance se ve igual que inexistente: las escrituras llevan el filtro
 * junto a la clave única, así que Prisma lanza P2025 y el repositorio lo traduce a
 * `UserNotFoundError`. Es el resultado correcto en seguridad — no confirma que el
 * registro exista.
 */
export interface IUserRepository {
	findAll(filters: ListUsersDto, scope: AccessScope): Promise<SafeUser[]>;
	/**
	 * Total que cumple los mismos filtros Y el mismo alcance, sin paginar.
	 *
	 * Comparte el `where` con `findAll` a propósito: si solo se filtrara el
	 * listado, el total de la paginación contaría cuentas ajenas y las delataría
	 * aunque ninguna apareciera en pantalla.
	 */
	count(filters: ListUsersDto, scope: AccessScope): Promise<number>;
	/** Sin alcance: la consume el LOGIN, que ocurre antes de que exista sesión. */
	findByEmail(email: string): Promise<User | null>;
	findById(documentId: string, scope: AccessScope): Promise<SafeUser | null>;
	/**
	 * Búsqueda por PK interna. Sin alcance: la consume el refresh de `auth` para
	 * releer al propio titular del token.
	 */
	findByInternalId(userId: number): Promise<SafeUser | null>;
	create(data: CreateUserData): Promise<SafeUser>;
	update(
		documentId: string,
		dto: UpdateUserDto,
		scope: AccessScope,
	): Promise<SafeUser>;
	// Actualiza solo la referencia de la foto de perfil (proxy de storage).
	updatePhoto(
		documentId: string,
		photoUrl: string,
		scope: AccessScope,
	): Promise<SafeUser>;
	// Recibe el hash, nunca la contraseña en claro: el hashing es del servicio.
	updatePassword(
		documentId: string,
		hashedPassword: string,
		scope: AccessScope,
	): Promise<void>;
	/** Soft-delete: marca `archivedAt` con el instante actual. */
	archive(documentId: string, scope: AccessScope): Promise<SafeUser>;
	/** Revierte el soft-delete dejando `archivedAt` en null. */
	unarchive(documentId: string, scope: AccessScope): Promise<SafeUser>;
	/**
	 * Borrado permanente. Lanza `UserHasRelatedRecordsError` si alguna clave
	 * foránea lo impide; la regla de "solo si está archivado" es del servicio.
	 */
	delete(documentId: string, scope: AccessScope): Promise<void>;
	/**
	 * Cambio de adscripción en una sola transacción: mueve la cuenta y escribe la
	 * línea de bitácora.
	 *
	 * Son dos escrituras relacionadas, así que va en transacción explícita
	 * (`docs/reglas.md` §8.1): un fallo entre ellas dejaría a la persona movida sin
	 * rastro de quién la movió, que es justo lo que la bitácora existe para evitar.
	 *
	 * `nextRole` lo decide `roleAfterDependencyChange`, no el repositorio: la
	 * degradación del auxiliar es una regla de negocio.
	 */
	changeDependency(params: {
		documentId: string;
		toDependencyId: number;
		changedById: number;
		nextRole: Role;
		scope: AccessScope;
	}): Promise<SafeUser>;
	/** Bitácora de adscripción de una cuenta, de lo más reciente a lo más antiguo. */
	listDependencyHistory(
		documentId: string,
		scope: AccessScope,
	): Promise<DependencyChangeEntry[]>;
}
