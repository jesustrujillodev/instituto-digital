import { describe, expect, test } from "vitest";
import {
	type ClientIpPolicy,
	clientIpPolicyOf,
	getClientIp,
	trustedProxyHopsOf,
} from "../client-ip";

const requestOf = (headers: Record<string, string>) =>
	new Request("https://app.example.com/x", { headers });

const ONE_PROXY: ClientIpPolicy = { source: "proxy", trustedHops: 1 };
const TWO_PROXIES: ClientIpPolicy = { source: "proxy", trustedHops: 2 };
const CLOUDFLARE: ClientIpPolicy = { source: "cloudflare" };
const NONE: ClientIpPolicy = { source: "none" };

describe("getClientIp — detrás de proxies propios", () => {
	test("con un solo valor, es la IP que escribió el proxy", () => {
		expect(
			getClientIp(requestOf({ "X-Forwarded-For": "203.0.113.7" }), ONE_PROXY),
		).toBe("203.0.113.7");
	});

	// El hallazgo: el cliente escribe lo que quiere a la izquierda y el proxy
	// agrega a la derecha. Rotar el primer elemento no cambia la clave.
	test("ignora lo que el cliente antepone a la cadena", () => {
		expect(
			getClientIp(
				requestOf({ "X-Forwarded-For": "198.51.100.1, 203.0.113.9" }),
				ONE_PROXY,
			),
		).toBe("203.0.113.9");
		expect(
			getClientIp(
				requestOf({ "X-Forwarded-For": "192.0.2.50, 203.0.113.9" }),
				ONE_PROXY,
			),
		).toBe("203.0.113.9");
	});

	test("con dos proxies propios, toma el segundo desde la derecha", () => {
		expect(
			getClientIp(
				requestOf({
					"X-Forwarded-For": "198.51.100.1, 203.0.113.7, 10.0.0.2",
				}),
				TWO_PROXIES,
			),
		).toBe("203.0.113.7");
	});

	test("una cadena más corta que los saltos declarados no da IP", () => {
		expect(
			getClientIp(requestOf({ "X-Forwarded-For": "203.0.113.7" }), TWO_PROXIES),
		).toBeUndefined();
	});

	test("recorta espacios y acepta IPv6", () => {
		expect(
			getClientIp(
				requestOf({ "X-Forwarded-For": "198.51.100.1 ,  2001:db8::1 " }),
				ONE_PROXY,
			),
		).toBe("2001:db8::1");
	});

	// Validar el formato es lo que impide persistir un valor arbitrario en la
	// tabla de sesiones.
	test("un valor que no es IP no da IP", () => {
		expect(
			getClientIp(
				requestOf({ "X-Forwarded-For": "<script>alert(1)</script>" }),
				ONE_PROXY,
			),
		).toBeUndefined();
	});

	test("no recurre a CF-Connecting-IP", () => {
		expect(
			getClientIp(requestOf({ "CF-Connecting-IP": "198.51.100.4" }), ONE_PROXY),
		).toBeUndefined();
	});

	test("sin cabecera no hay IP", () => {
		expect(getClientIp(requestOf({}), ONE_PROXY)).toBeUndefined();
		expect(
			getClientIp(requestOf({ "X-Forwarded-For": "" }), ONE_PROXY),
		).toBeUndefined();
	});
});

describe("getClientIp — detrás de Cloudflare", () => {
	// Cloudflare anexa a X-Forwarded-For: el valor del cliente sigue a la
	// izquierda. Su cabecera propia es la que no se puede falsificar a través de él.
	test("usa CF-Connecting-IP aunque X-Forwarded-For traiga otra cosa", () => {
		expect(
			getClientIp(
				requestOf({
					"X-Forwarded-For": "198.51.100.1, 203.0.113.9",
					"CF-Connecting-IP": "203.0.113.9",
				}),
				CLOUDFLARE,
			),
		).toBe("203.0.113.9");
	});

	test("sin CF-Connecting-IP válida no hay IP", () => {
		expect(
			getClientIp(requestOf({ "X-Forwarded-For": "203.0.113.9" }), CLOUDFLARE),
		).toBeUndefined();
		expect(
			getClientIp(requestOf({ "CF-Connecting-IP": "basura" }), CLOUDFLARE),
		).toBeUndefined();
	});
});

describe("getClientIp — sin fuente declarada", () => {
	test("no lee ninguna cabecera", () => {
		expect(
			getClientIp(
				requestOf({
					"X-Forwarded-For": "203.0.113.7",
					"CF-Connecting-IP": "203.0.113.7",
				}),
				NONE,
			),
		).toBeUndefined();
	});
});

describe("clientIpPolicyOf", () => {
	test("traduce las variables del entorno", () => {
		expect(
			clientIpPolicyOf({ CLIENT_IP_SOURCE: "proxy", TRUSTED_PROXY_HOPS: 2 }),
		).toEqual({ source: "proxy", trustedHops: 2 });
		expect(
			clientIpPolicyOf({
				CLIENT_IP_SOURCE: "cloudflare",
				TRUSTED_PROXY_HOPS: 1,
			}),
		).toEqual({ source: "cloudflare" });
		expect(clientIpPolicyOf({ TRUSTED_PROXY_HOPS: 1 })).toEqual({
			source: "none",
		});
	});
});

// Express confía en X-Forwarded-Proto solo con estos saltos: sin ellos,
// detrás de un borde TLS React Router rechaza todo action con 400.
describe("trustedProxyHopsOf", () => {
	test("confía en los mismos proxies que la IP del cliente", () => {
		expect(trustedProxyHopsOf(ONE_PROXY)).toBe(1);
		expect(trustedProxyHopsOf(TWO_PROXIES)).toBe(2);
		expect(trustedProxyHopsOf(CLOUDFLARE)).toBe(1);
	});

	test("sin fuente declarada no confía en ninguno", () => {
		expect(trustedProxyHopsOf(NONE)).toBe(0);
	});
});
