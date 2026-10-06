/**
 * Aviso entre procesos de que una caché local quedó vieja.
 *
 * No transporta datos, solo el nombre del canal: quien lo recibe vuelve a leer
 * de su fuente. Por eso perder un aviso nunca da un dato equivocado, solo uno
 * que tarda lo que dure el TTL de esa caché.
 */
export interface InvalidationBus {
	/** Avisa a todos los procesos, incluido éste. Nunca lanza. */
	publish(channel: string): Promise<void>;
	/**
	 * Un handler por canal: suscribirse otra vez lo reemplaza, que es lo que
	 * pasa en cada recarga en caliente. También se llama tras una reconexión,
	 * porque mientras tanto pudo perderse un aviso.
	 */
	subscribe(channel: string, onInvalidate: () => void): void;
}
