import type { Logger } from "@/shared/logging/logger";
import { tokensEqual } from "../domain/theme.mapper";
import type {
	IActiveThemeSnapshot,
	IThemeRepository,
} from "../domain/theme.repository";
import type { ActiveTheme } from "../domain/theme.types";

type Dependencies = {
	inner: IThemeRepository;
	/** Ventana de propagación de una publicación entre nodos. Ver theme.config.ts. */
	ttlMs: number;
	/** Cada cuánto se reintenta la base mientras no responde. Ver theme.config.ts. */
	retryMs: number;
	/** Copia fuera de la base para arrancar en frío con la base caída. */
	snapshot: IActiveThemeSnapshot;
	logger: Logger;
};

const sameActiveTheme = (
	a: ActiveTheme | null,
	b: ActiveTheme | null,
): boolean => {
	if (a === null || b === null) return a === b;
	return (
		a.documentId === b.documentId &&
		a.name === b.name &&
		tokensEqual(a.tokens, b.tokens)
	);
};

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Decorador con caché sobre el mismo puerto.
 *
 * Solo retiene `findActiveTheme`, que es el único método que corre en TODA
 * petición: el loader raíz lo consulta para pintar cualquier página, incluidas
 * la landing y el login. Sin caché eso sería una consulta por request para un
 * dato que cambia cuando un admin pulsa "activar", o sea casi nunca.
 *
 * IMPORTANTE: registrar como singleton de MÓDULO (vive entre peticiones), nunca
 * con `asSingleton` del contenedor — ese contenedor es POR PETICIÓN y daría una
 * instancia nueva en cada request, que no cachearía nada. Misma forma que
 * `createCachedSecurityStateRepository`.
 *
 * Si la base no responde, la plataforma sigue con el ÚLTIMO tema activo
 * conocido: primero el de memoria y, en frío, el snapshot en disco. Solo si no
 * hay ninguno de los dos se propaga el error y el servicio sirve el tema base
 * (docs/theme/01-theme-builder.md §4.1). Es la diferencia deliberada con la caché
 * del estado de seguridad, que en frío DENIEGA: el tema no es una decisión de
 * seguridad, y servir uno viejo es mejor que perder la marca.
 */
export const createCachedThemeRepository = ({
	inner,
	ttlMs,
	retryMs,
	snapshot,
	logger,
}: Dependencies): IThemeRepository => {
	let cached: ActiveTheme | null = null;
	let loaded = false;
	let loadedAt = 0;
	let expiresAt = 0;
	// Colapsa las lecturas concurrentes: al expirar el TTL bajo carga, mil
	// peticiones simultáneas deben producir UNA consulta, no mil.
	let inFlight: Promise<ActiveTheme | null> | null = null;
	// Lo último que se escribió en el snapshot. `undefined` = nada todavía en
	// este proceso, así que la primera lectura con éxito siempre lo refresca.
	let persisted: ActiveTheme | null | undefined;

	// Solo EXPIRA: el valor se conserva como respaldo por si la relectura que
	// fuerza la escritura coincide con una caída de la base.
	const invalidate = () => {
		expiresAt = 0;
	};

	/**
	 * Toda escritura invalida la caché LOCAL, para que el proceso que publica o
	 * activa responda ya con el tema nuevo aunque los demás nodos tarden el TTL.
	 */
	const writing = async <T>(operation: () => Promise<T>): Promise<T> => {
		const result = await operation();
		invalidate();
		return result;
	};

	/**
	 * Solo escribe si cambió: el caso normal es una lectura por TTL que devuelve
	 * lo mismo, y eso no debe tocar el disco cada minuto. No se espera: la
	 * respuesta no depende del disco, y un fallo al escribir no es un fallo de
	 * lectura.
	 */
	const persist = (theme: ActiveTheme | null) => {
		if (persisted !== undefined && sameActiveTheme(persisted, theme)) return;

		persisted = theme;
		snapshot.write(theme).catch((error: unknown) => {
			// Se olvida lo "escrito" para reintentarlo en la próxima lectura.
			persisted = undefined;
			logger.warn("active theme snapshot write failed", {
				message: messageOf(error),
			});
		});
	};

	const serveStale = (theme: ActiveTheme | null) => {
		cached = theme;
		loaded = true;
		// Ni un TTL entero ni cero: se vuelve a probar la base pronto, pero no en
		// cada petición esperando el timeout de conexión.
		expiresAt = Date.now() + retryMs;
		return theme;
	};

	return {
		// La preferencia de modo por usuario NO se cachea: es por cuenta y solo se
		// lee en el caso de dispositivo nuevo. Pasa de largo.
		findModeByUserId: (userId) => inner.findModeByUserId(userId),
		saveMode: (userId, mode) => inner.saveMode(userId, mode),

		async findActiveTheme() {
			if (expiresAt > Date.now()) return cached;

			inFlight ??= inner
				.findActiveTheme()
				.then((fresh) => {
					cached = fresh;
					loaded = true;
					loadedAt = Date.now();
					expiresAt = loadedAt + ttlMs;
					persist(fresh);
					return fresh;
				})
				.catch(async (error: unknown) => {
					// 1. Último valor conocido de este proceso.
					if (loaded) {
						logger.error("active theme read failed — serving last known", {
							message: messageOf(error),
							source: "memory",
							staleForMs: loadedAt > 0 ? Date.now() - loadedAt : null,
						});
						return serveStale(cached);
					}

					// 2. En frío: la copia en disco de la última lectura con éxito.
					const stored = await snapshot.read();
					if (stored !== undefined) {
						logger.error("active theme read failed — serving last known", {
							message: messageOf(error),
							source: "snapshot",
						});
						return serveStale(stored);
					}

					// 3. Nunca se conoció ninguno: decide el SERVICIO, y lo que hace es
					// servir el tema base en vez de una página en blanco.
					throw error;
				})
				.finally(() => {
					inFlight = null;
				});

			return inFlight;
		},

		listThemes: () => inner.listThemes(),
		findTheme: (documentId) => inner.findTheme(documentId),

		createTheme: (input) => writing(() => inner.createTheme(input)),
		renameTheme: (documentId, name) =>
			writing(() => inner.renameTheme(documentId, name)),
		saveDraft: (documentId, tokens) =>
			writing(() => inner.saveDraft(documentId, tokens)),
		publishTheme: (documentId, tokens) =>
			writing(() => inner.publishTheme(documentId, tokens)),
		activateTheme: (documentId) =>
			writing(() => inner.activateTheme(documentId)),
		deleteTheme: (documentId) => writing(() => inner.deleteTheme(documentId)),
	};
};
