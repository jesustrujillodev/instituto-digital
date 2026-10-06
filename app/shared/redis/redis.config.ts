/**
 * Tiempos del cliente de Redis. Son cortos a propósito: todo uso de Redis tiene
 * un camino sin él, así que esperar a un Redis lento cuesta más que no usarlo.
 */
export const REDIS_CONNECT_TIMEOUT_MS = 2_000;
export const REDIS_COMMAND_TIMEOUT_MS = 250;
export const REDIS_MAX_RETRIES_PER_REQUEST = 1;

export const REDIS_RECONNECT_BASE_MS = 100;
export const REDIS_RECONNECT_CAP_MS = 5_000;

/** Una caída se anuncia una vez por intervalo, no una vez por petición. */
export const REDIS_ERROR_LOG_INTERVAL_MS = 10_000;
