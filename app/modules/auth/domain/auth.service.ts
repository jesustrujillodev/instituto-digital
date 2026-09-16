import type { AppResponse } from "@/shared/response/response.types";
import type {
	AuthTokens,
	LoginDto,
	RefreshResult,
	VerifiedAccessTokenPayload,
} from "./auth.types";

export interface AuthService {
	// ── Consumidos por actions: devuelven el envelope estándar ──────────────────
	login(
		dto: LoginDto,
		meta: { userAgent?: string; ipAddress?: string },
	): Promise<AppResponse<AuthTokens>>;
	logout(refreshToken: string): Promise<AppResponse<null>>;
	logoutAll(userId: number): Promise<AppResponse<null>>;

	// ── Consumidos por el middleware: siguen lanzando ───────────────────────────
	// Excepción DELIBERADA a la regla del envelope. `configureContainer` no es un
	// adaptador de entrada: corre antes que cualquier loader y necesita
	// distinguir "sesión inválida" de "la base de datos no responde" para decidir
	// entre redirigir a login o degradar. Envolver estos dos en el envelope
	// obligaría a desempaquetar en el punto más caliente del request sin ganar
	// nada — no hay pantalla al otro lado que muestre el error.

	// Idempotente para peticiones concurrentes/rezagadas dentro de la ventana
	// de gracia (docs/auth/00-sistema-autenticacion.md §6.2).
	refresh(incomingRefreshToken: string): Promise<RefreshResult>;
	verifyAccessToken(token: string): Promise<VerifiedAccessTokenPayload | null>;
}
