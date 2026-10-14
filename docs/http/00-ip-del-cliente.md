# IP del cliente

De dónde sale la IP de quien hace la petición, por qué la declara el despliegue y
qué hacer al cambiar de proxy.

## 1. Para qué se usa

La IP no autoriza nada, pero sí decide quién comparte un cupo:

| Uso | Clave | Dónde |
|---|---|---|
| Límite de intentos de login por IP | `auth:login:ip:<ip>` | `auth.service.server.ts` |
| Escaneo del QR de asistencia | `check-in:<ip>` | `/asistencia/:token` (loader y action) |
| QR de inscripción | `enrollment-qr:<ip>` | `/inscripcion/:token` |
| Verificación pública de certificados | `certificate-verify:<ip>` | `/verificar/:documentId` |
| Columna IP de la sesión | `sessions.ip_address` | monitor de `/dashboard/sesiones` |

Si un cliente puede elegir su IP, puede saltarse el límite de login rotándola o
agotar el cupo de otra persona escribiendo la IP de ella.

## 2. Por qué no se toma el primer elemento de `X-Forwarded-For`

`X-Forwarded-For` es una lista. Cada proxy **agrega al final** la IP del cliente
del que recibió la petición:

```
cliente escribe:        X-Forwarded-For: 1.1.1.1            ← inventado
proxy de Railway ve 203.0.113.9 y agrega:
app recibe:             X-Forwarded-For: 1.1.1.1, 203.0.113.9
```

Lo de la izquierda lo escribió el cliente y vale lo que él quiera. El último
elemento lo escribió el proxy, que vio la conexión real. Con N proxies propios en
fila, la IP del cliente es el elemento N contado desde la derecha. Esto se cumple
tanto si el proxy conserva la cabecera que llega como si la sobrescribe.

El servidor (`app/http.server.ts`, con el adaptador de React Router para express)
no le pasa a la app la IP del socket, así que la cabecera es la única fuente. Por eso el despliegue tiene que decir cuál leer.

## 3. Configuración

| Variable | Valores | Default |
|---|---|---|
| `CLIENT_IP_SOURCE` | `proxy`, `cloudflare`, `none` | sin default en producción (**no arranca** sin ella); fuera de producción, sin declarar equivale a `none` |
| `TRUSTED_PROXY_HOPS` | entero ≥ 1 | `1` |

- **`proxy`**: elemento `TRUSTED_PROXY_HOPS` desde la derecha de
  `X-Forwarded-For`. No mira `CF-Connecting-IP`.
- **`cloudflare`**: solo `CF-Connecting-IP`, que Cloudflare escribe y el cliente
  no puede imponer a través de él. Exige que el origen **solo** sea alcanzable
  por Cloudflare; si alguien llega directo al servidor, la cabecera es suya.
- **`none`**: no hay IP. Las rutas no consumen ninguna cubeta por IP (§4) y la
  sesión se guarda sin IP.

Un valor que no sea una IPv4/IPv6 válida se descarta: no hay IP.

### Por entorno

| Entorno | Valor |
|---|---|
| Desarrollo (`bun dev`) | sin declarar (`none`): no hay proxy |
| QA en Railway, servicio web | `CLIENT_IP_SOURCE=proxy`, `TRUSTED_PROXY_HOPS=1` |
| Worker (Railway o VPS) | `none`: no atiende peticiones, pero valida el mismo entorno y no arranca sin la variable |
| VPS con nginx/Caddy delante | `proxy`, `1` (el proxy debe agregar `$remote_addr` a `X-Forwarded-For`) |
| VPS con Cloudflare → nginx | `cloudflare`, con el firewall aceptando solo los rangos de Cloudflare; o `proxy` con `2` |
| Contenedor expuesto sin proxy | `none` |

### Cómo comprobarlo

En el entorno, iniciar sesión con la cabecera `X-Forwarded-For: 198.51.100.1` y
mirar la IP de esa sesión en `/dashboard/sesiones`:

- si aparece tu IP real, la configuración es correcta;
- si aparece `198.51.100.1`, hay un salto de más (o el proxy no agrega);
- si aparece la IP de un proxy, falta un salto.

Al poner o quitar un proxy delante (Cloudflare, balanceador) hay que volver a
ajustar la variable y repetir la comprobación.

### El esquema y el host de la petición

La misma política decide en cuántos saltos confía Express (`trust proxy`, en
`app/http.server.ts`): `proxy` confía en `TRUSTED_PROXY_HOPS`, `cloudflare` en 1 y
`none` en ninguno.

De eso depende `request.url`. Detrás de un borde que termina TLS, el esquema real solo
llega en `X-Forwarded-Proto`. Sin confiar en el proxy, React Router arma la URL con
`http://`, y desde la 7.18 su protección CSRF compara el origen completo con el
`Origin` del navegador (`https://…`): **todo action responde 400**, login incluido. El
E2E (`bun run test:e2e`, que corre detrás de Caddy con TLS) lo detectó; ver
[testing/01](../testing/01-integracion-y-e2e.md).

## 4. Cuando no hay IP

Sin IP no se consume ninguna cubeta por IP. Antes todas caían en una cubeta común
(`<prefijo>:unknown`), y unas cuantas peticiones anónimas la agotaban para todos.

- **Login**: queda el límite por email.
- **QR de asistencia e inscripción**: además del límite por IP, cada persona tiene
  su cubeta (`check-in:user:<id>`, `enrollment-qr:user:<id>`) después de
  `requireAuth`, con o sin IP. Varias personas detrás de la misma IP (NAT de una
  oficina) comparten el cupo por IP, pero no el suyo propio.
- **Verificación pública**: sin límite. No requiere sesión, y el código es un
  UUID que no se puede adivinar por fuerza bruta.

## 5. Piezas

| Pieza | Qué hace |
|---|---|
| `app/core/env.server.ts` | Valida las dos variables y exige `CLIENT_IP_SOURCE` en producción. |
| `app/shared/http/client-ip.ts` | `clientIpPolicyOf(env)`, `getClientIp(request, policy)` y `trustedProxyHopsOf(policy)`, las tres puras. |
| `app/http.server.ts` | `trust proxy` de Express con `trustedProxyHopsOf`: el esquema y el host de `request.url`. |
| `clientIpPolicy` en el cradle | La política ya resuelta. Las rutas la pasan a `getClientIp` y nunca leen el entorno. |
