/**
 * Ventana deslizante atómica sobre un ZSET de marcas de tiempo.
 *
 * KEYS[1] la ventana · ARGV[1] windowMs · ARGV[2] limit · ARGV[3] nonce.
 * Devuelve `{allowed, retryAfterMs}`.
 *
 * La hora es la de Redis (`TIME`), no la del proceso: con varios nodos, un reloj
 * desfasado no estira ni acorta la ventana. Un intento rechazado no se registra,
 * así que el ZSET nunca pasa de `limit` miembros y todo bloqueo termina.
 */
export const SLIDING_WINDOW_LUA = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)

if redis.call('ZCARD', KEYS[1]) < limit then
  redis.call('ZADD', KEYS[1], now, now .. '-' .. ARGV[3])
  redis.call('PEXPIRE', KEYS[1], window)
  return {1, 0}
end

local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
local retry = window
if oldest[2] then
  retry = tonumber(oldest[2]) + window - now
end
if retry < 1 then
  retry = 1
end
return {0, retry}
`;
