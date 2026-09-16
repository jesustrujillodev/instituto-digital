import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AccessScope } from "@/shared/auth/scope.rules";
import type { AppResponse } from "@/shared/response/response.types";
import type { UploadInput } from "@/shared/storage/upload-validation";
import type {
	ChangePasswordDto,
	CreateUserDto,
	DependencyChangeEntry,
	ListUsersDto,
	UpdateUserDto,
	UserListResponse,
	UserResponse,
	UserVoidResponse,
} from "./user.types";

/**
 * Casos de uso del módulo.
 *
 * Todos devuelven el envelope estándar y NINGUNO lanza para los fallos
 * esperados: un usuario inexistente o un email duplicado son respuestas, no
 * excepciones. Así el loader/action no necesita conocer la lista de errores del
 * módulo para no romperse — le basta con comprobar `success`.
 *
 * Lo verdaderamente inesperado (base de datos caída, bug) tampoco escapa: el
 * runner del servicio lo registra y lo devuelve como `UNEXPECTED_ERROR`, sin su
 * mensaje real.
 *
 * ── Alcance ──────────────────────────────────────────────────────────────────
 *
 * Las LECTURAS reciben `scope`, que es todo lo que necesitan: recortar el
 * conjunto de filas.
 *
 * Las MUTACIONES reciben el `AuthContext` completo, porque tienen que cumplir DOS
 * condiciones y el alcance solo cubre una. La otra es el rango: un auxiliar y su
 * titular comparten dependencia, así que el alcance por sí solo dejaría al
 * auxiliar archivar a quien lo administra. Con el contexto, el servicio deriva el
 * alcance y además compara rangos con `canManageUser`.
 *
 * En los dos casos es un parámetro EXPLÍCITO y obligatorio, no un valor del
 * contenedor: así TypeScript falla en cada punto que lo olvide y el hook
 * `pre-commit` lo caza.
 */
export interface IUserService {
	/** Página de resultados; el total y el número de páginas van en `pagination`. */
	list(filters: ListUsersDto, scope: AccessScope): Promise<UserListResponse>;
	/** Falla con `USER_NOT_FOUND` si no existe O si cae fuera del alcance. */
	findById(documentId: string, scope: AccessScope): Promise<UserResponse>;
	/** Bitácora de adscripción, para la hoja de detalle. */
	listDependencyHistory(
		documentId: string,
		scope: AccessScope,
	): Promise<AppResponse<DependencyChangeEntry[]>>;
	/**
	 * Alta. Comprueba que el actor pueda otorgar el rol pedido y que la dependencia
	 * destino exista y esté activa; para un titular o un auxiliar, la dependencia
	 * es forzosamente la suya.
	 */
	create(dto: CreateUserDto, actor: AuthContext): Promise<UserResponse>;
	update(
		documentId: string,
		dto: UpdateUserDto,
		actor: AuthContext,
	): Promise<UserResponse>;
	/**
	 * Valida, sube la imagen al proveedor de almacenamiento y persiste la
	 * referencia del proxy. Vive en el servicio y no en el repositorio porque
	 * necesita el storage además de la base de datos.
	 */
	updatePhoto(
		documentId: string,
		file: UploadInput,
		actor: AuthContext,
	): Promise<UserResponse>;
	/**
	 * Reseteo administrativo: no exige la contraseña anterior. Devuelve la cuenta
	 * para que quien orquesta pueda cerrar sus sesiones por su id numérico.
	 */
	resetPassword(
		documentId: string,
		newPassword: string,
		actor: AuthContext,
	): Promise<UserResponse>;
	/**
	 * Soft-delete. Revoca además el epoch y las sesiones de la cuenta: sin eso,
	 * "un usuario inactivo no puede iniciar sesión" solo se cumpliría al expirar su
	 * access token vigente.
	 */
	archive(documentId: string, actor: AuthContext): Promise<UserResponse>;
	unarchive(documentId: string, actor: AuthContext): Promise<UserResponse>;
	/** Borrado permanente: exige que la cuenta esté archivada y sin relaciones. */
	delete(documentId: string, actor: AuthContext): Promise<UserVoidResponse>;
	/**
	 * Cambio de contraseña de AUTOSERVICIO: exige la actual.
	 *
	 * Es una operación distinta de `resetPassword`, no una variante opcional suya.
	 * Mezclarlas dejaría la puerta abierta a cambiar la propia contraseña sin
	 * demostrar que se conoce la anterior, que es justo lo que protege de una sesión
	 * ajena abierta en un equipo compartido.
	 *
	 * No revoca sesiones: quien la cambia conoce la nueva y echarlo de la suya justo
	 * después sería gratuito. Para una cuenta comprometida el camino es el reseteo
	 * administrativo, que sí las cierra.
	 */
	changeOwnPassword(
		dto: ChangePasswordDto,
		actor: AuthContext,
	): Promise<UserVoidResponse>;
	/**
	 * Cambio de adscripción, inmediato y sin aprobación.
	 *
	 * Sirve a los dos caminos: alguien cambiándose por su cuenta desde su perfil, y
	 * un administrador moviendo a otra persona. Los distingue comparando la cuenta
	 * con el actor, porque las reglas no son las mismas: un titular no puede
	 * cambiarse mientras lo sea, y nadie puede mover a alguien de rango superior.
	 *
	 * Queda en la bitácora con fecha y autor, degrada el rol de auxiliar y revoca
	 * los tokens para que el alcance nuevo valga desde la siguiente petición.
	 */
	changeDependency(
		documentId: string,
		toDependencyDocumentId: string,
		actor: AuthContext,
	): Promise<UserResponse>;
}
