import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { AuthConfig } from "../domain/auth.config";
import type {
	AccessTokenPayload,
	VerifiedAccessTokenPayload,
} from "../domain/auth.types";
import { validateVerifiedAccessTokenPayload } from "../domain/auth.validators";
import type { TokenService } from "../domain/token.service";

type Dependencies = {
	authConfig: AuthConfig;
};

export const createTokenService = ({
	authConfig,
}: Dependencies): TokenService => {
	const secretKey = new TextEncoder().encode(authConfig.jwtSecret);

	const signAccessToken = async (
		payload: AccessTokenPayload,
	): Promise<string> => {
		return new SignJWT({ ...payload })
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setIssuer(authConfig.issuer)
			.setAudience(authConfig.audience)
			.setExpirationTime(`${authConfig.accessTokenTtlS}s`)
			.sign(secretKey);
	};

	const verifyAccessToken = async (
		token: string,
	): Promise<VerifiedAccessTokenPayload | null> => {
		try {
			// Algoritmo, issuer y audience fijados — un token firmado con otro alg
			// o emitido para otra app/entorno se rechaza aunque comparta secreto.
			const { payload } = await jwtVerify(token, secretKey, {
				algorithms: ["HS256"],
				issuer: authConfig.issuer,
				audience: authConfig.audience,
			});
			// Valida contra el esquema del VERIFICADOR: exige `iat`. Un token sin
			// él lanza aquí y sale como null — inevaluable frente al epoch se
			// trata como inválido, nunca como válido.
			return validateVerifiedAccessTokenPayload(payload);
		} catch {
			// Token expired or invalid — return null, let middleware decide
			return null;
		}
	};

	// Refresh token carries NO data — it's just a secure random ID
	// The session data lives entirely in the database (hashed, see below)
	const generateRefreshToken = (): string => {
		return randomBytes(64).toString("hex");
	};

	const hashRefreshToken = (rawToken: string): string => {
		return createHash("sha256").update(rawToken).digest("hex");
	};

	const getRefreshTokenExpiry = (): Date => {
		return new Date(Date.now() + authConfig.refreshTokenTtlS * 1000);
	};

	return {
		signAccessToken,
		verifyAccessToken,
		generateRefreshToken,
		hashRefreshToken,
		getRefreshTokenExpiry,
	};
};
