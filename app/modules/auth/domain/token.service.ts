import type {
	AccessTokenPayload,
	VerifiedAccessTokenPayload,
} from "./auth.types";

export interface TokenService {
	// Signs a new JWT access token (TTL, issuer y audience desde AuthConfig).
	signAccessToken(payload: AccessTokenPayload): Promise<string>;

	// Verifies and decodes a JWT access token (algoritmo, issuer y audience fijados).
	// Returns null if expired or invalid — never throws.
	//
	// Devuelve `VerifiedAccessTokenPayload`: incluye `iat`, que es lo que permite
	// contrastar el token contra el epoch de validez (docs/auth/02).
	verifyAccessToken(token: string): Promise<VerifiedAccessTokenPayload | null>;

	// Generates a cryptographically secure random refresh token (no payload).
	// The session data lives entirely in the database.
	generateRefreshToken(): string;

	// Hash determinístico (SHA-256 hex) de un refresh token. En reposo SOLO se
	// persiste el hash; el token crudo vive únicamente en la cookie del cliente.
	// Sin salt: la entrada ya tiene 512 bits de entropía.
	hashRefreshToken(rawToken: string): string;

	// Returns the Date at which a new refresh token should expire.
	getRefreshTokenExpiry(): Date;
}
