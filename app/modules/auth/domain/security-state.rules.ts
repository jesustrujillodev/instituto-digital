import type { Role } from "@/shared/rules/atoms.rules";
import type { VerifiedAccessTokenPayload } from "./auth.types";
import type {
	LockdownScope,
	SecuritySnapshot,
} from "./security-state.repository";

/**
 * Veredicto sobre un access token ya verificado criptográficamente.
 *
 * El motivo NO viaja al cliente: es para logs y métricas. Quien queda fuera ve
 * la pantalla de login normal (docs/auth/01 §8.4).
 */
export type TokenVerdict =
	| { allowed: true }
	| { allowed: false; reason: "GLOBAL_EPOCH" | "USER_EPOCH" | "LOCKDOWN" };

/** Lo mínimo que la regla necesita del payload — nada de `sub` ni `email`. */
type EvaluableClaims = Pick<
	VerifiedAccessTokenPayload,
	"userId" | "role" | "iat"
>;

/**
 * Roles exentos de cada alcance de lockdown.
 *
 * `all`: nadie — si se sospecha de las cuentas con privilegios, exceptuar una es
 * exceptuar la que podría estar comprometida.
 * `except-admin`: quien administra la plataforma sigue operando, porque es quien
 * necesita el panel para levantar el cierre o investigar.
 *
 * El nombre del alcance es historia: es un valor PERSISTIDO en
 * `SecurityState.lockdownScope` y renombrarlo exigiría migrar datos sin ganar
 * nada. Lo que exime hoy es ADMIN y SUPERADMIN.
 *
 * Tipado contra `Role` y no contra `string`: un rol mal escrito debe fallar en
 * compilación, no descubrirse el día de un incidente dejando fuera de la
 * plataforma a quien tiene que levantar el cierre.
 */
const EXEMPT_ROLES: Record<LockdownScope, readonly Role[]> = {
	all: [],
	"except-admin": ["ADMIN", "SUPERADMIN"],
};

/**
 * Los roles que un alcance deja operar.
 *
 * Existe para que la purga de sesiones del repositorio no vuelva a escribir la
 * lista en su propio SQL: eran dos literales independientes que tenían que
 * coincidir y nada lo garantizaba en compilación.
 */
export const exemptRolesFor = (scope: LockdownScope): readonly Role[] =>
	EXEMPT_ROLES[scope];

/**
 * ¿Bloquea el lockdown actual a este rol?
 *
 * Compartida entre `evaluateToken` (para tokens ya emitidos) y el servicio de
 * auth (para login/refresh, donde no hay `iat` que comparar): es la MISMA
 * decisión en los dos sitios, y solo se declara una vez.
 */
export const isLockedOutForRole = (
	snapshot: Pick<SecuritySnapshot, "lockdownAt" | "lockdownScope">,
	role: string,
): boolean =>
	snapshot.lockdownAt !== null &&
	// `role` llega como el texto libre que guarda la base, no como `Role`: la
	// tupla se ensancha para compararlo sin castear el dato de entrada.
	!(
		EXEMPT_ROLES[snapshot.lockdownScope ?? "all"] as readonly string[]
	).includes(role);

/**
 * ¿Sigue siendo válido este token frente al estado de seguridad?
 *
 * Función pura: la firma ya se comprobó antes y aquí solo se aplica la política
 * de revocación. Es *not-before* del lado del verificador — la misma idea que el
 * claim `nbf`, pero como política del servidor en vez de dentro del token, que
 * es lo que permite cambiarla sin reemitir nada.
 *
 * `iat` viene en SEGUNDOS y el epoch en milisegundos: la comparación trunca, así
 * que un token acuñado microsegundos DESPUÉS del corte puede rechazarse. Es el
 * sentido correcto del error —falla hacia cerrado y se autocorrige vía silent
 * refresh— y NO debe "arreglarse" con un margen de tolerancia: un margen es
 * exactamente una ventana por la que se cuela lo que se quería cortar.
 */
export const evaluateToken = (
	payload: EvaluableClaims,
	snapshot: SecuritySnapshot,
): TokenVerdict => {
	// El lockdown tiene PRECEDENCIA sobre los epochs: se comprueba primero y
	// gana aunque el token sea posterior a cualquiera de ellos. Es lo que
	// impide que un token acuñado durante el propio cierre (p. ej. por un rol
	// exento en otro alcance previo) se cuele por llevar un `iat` reciente.
	if (isLockedOutForRole(snapshot, payload.role)) {
		return { allowed: false, reason: "LOCKDOWN" };
	}

	const issuedAtMs = payload.iat * 1000;

	if (issuedAtMs < snapshot.tokensValidAfter.getTime()) {
		return { allowed: false, reason: "GLOBAL_EPOCH" };
	}

	// El mapa solo contiene epochs vigentes; un usuario ausente es el caso
	// normal y no significa "sin revocar nunca", sino "nada que comparar".
	const userEpoch = snapshot.userTokensValidAfter.get(payload.userId);
	if (userEpoch && issuedAtMs < userEpoch.getTime()) {
		return { allowed: false, reason: "USER_EPOCH" };
	}

	return { allowed: true };
};
