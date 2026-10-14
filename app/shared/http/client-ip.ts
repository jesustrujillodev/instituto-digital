import * as v from "valibot";

/**
 * De qué cabecera sale la IP del cliente. La declara el despliegue
 * (`CLIENT_IP_SOURCE`), porque solo él sabe qué proxy tiene delante; ver
 * docs/http/00-ip-del-cliente.md.
 */
export type ClientIpPolicy =
	| { source: "proxy"; trustedHops: number }
	| { source: "cloudflare" }
	| { source: "none" };

const ipSchema = v.pipe(v.string(), v.trim(), v.ip());

const parseIp = (value: string | undefined | null): string | undefined => {
	if (!value) return undefined;
	const result = v.safeParse(ipSchema, value);
	return result.success ? result.output : undefined;
};

/** Variables ya validadas por `env.server`; sin fuente declarada no hay IP. */
export const clientIpPolicyOf = (config: {
	CLIENT_IP_SOURCE?: "proxy" | "cloudflare" | "none";
	TRUSTED_PROXY_HOPS: number;
}): ClientIpPolicy => {
	switch (config.CLIENT_IP_SOURCE) {
		case "proxy":
			return { source: "proxy", trustedHops: config.TRUSTED_PROXY_HOPS };
		case "cloudflare":
			return { source: "cloudflare" };
		default:
			return { source: "none" };
	}
};

/**
 * Los saltos de proxy en los que confía Express (`trust proxy`): los mismos que
 * `getClientIp`. Detrás de un borde TLS (Railway, Cloudflare) el esquema real
 * solo llega en X-Forwarded-Proto, y React Router arma `request.url` con él:
 * sin confiar en el proxy, la URL queda en `http://` y su protección CSRF
 * rechaza todo action que el navegador manda con `Origin: https://…`.
 */
export const trustedProxyHopsOf = (policy: ClientIpPolicy): number => {
	switch (policy.source) {
		case "proxy":
			return policy.trustedHops;
		case "cloudflare":
			return 1;
		case "none":
			return 0;
	}
};

/**
 * La IP es la clave de los límites por IP y se guarda en la sesión, así que
 * solo se lee de donde la escribe un proxy de confianza. Cada proxy AGREGA al
 * final de X-Forwarded-For la IP que vio: lo de la izquierda lo escribió el
 * cliente y no vale nada; el elemento N desde la derecha lo escribió el N-ésimo
 * proxy propio.
 */
export const getClientIp = (
	request: Request,
	policy: ClientIpPolicy,
): string | undefined => {
	switch (policy.source) {
		case "proxy":
			return parseIp(
				request.headers
					.get("X-Forwarded-For")
					?.split(",")
					.at(-policy.trustedHops),
			);
		case "cloudflare":
			return parseIp(request.headers.get("CF-Connecting-IP"));
		case "none":
			return undefined;
	}
};
