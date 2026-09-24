# ADR 0020 · Ruta pública de verificación del certificado

**Estado:** aceptado · 2026-09-23
**Contexto del cambio:** MVP-02 · F-10, verificación pública del folio
**Extiende:** [ADR-0019](./0019-snapshot-del-diseno-y-puerto-de-exportacion.md) (la
emisión y sus snapshots)

## 1. Contexto

Un certificado que nadie puede comprobar es una imagen bonita. Quien lo recibe en otra
institución no tiene cuenta en la plataforma, así que la comprobación tiene que ser
pública. Es la primera ruta de la plataforma que, sin sesión, responde datos de personas:
nombre, curso y dependencia.

## 2. Decisiones

### 2.1 La URL lleva el UUID de la emisión, no el folio

La ficha pedía `/verificar/:folio`. El folio es consecutivo y global (ADR-0019 §2.5): con él
en la URL, recorrer `2026-0001`, `2026-0002`… da un directorio del personal. El rate limit
solo lo haría más lento, no lo impediría.

La ruta es `/verificar/:documentId`, con el UUID v4 de la emisión, que no se puede adivinar.
El folio se muestra en la página, pero no hay búsqueda por folio: volvería a abrir la
enumeración.

### 2.2 Se responde solo lo impreso; de un revocado, casi nada

`toCertificateVerification` arma la respuesta campo por campo desde el `data_snapshot`:

- nombre;
- curso;
- dependencia;
- horas;
- fecha;
- folio.

No copia el snapshot entero, para que un campo nuevo no se publique sin decidirlo. Nunca
lleva correo ni ids internos.

Un revocado responde «no válido» con **solo el folio**. Se distingue de «no existe», como
pedía la ficha, pero no dice de quién era ni de qué curso: si se revocó, ya no acredita nada
sobre esa persona.

### 2.3 La ruta se defiende sola

- Va en la ZONA 1 de `app/routes.ts`, fuera del layout protegido. Su loader dice en el JSDoc
  que no lleva `requireAuth` a propósito.
- **Rate limit por IP** (30 por minuto) con el `rateLimiter` del cradle, **antes** de validar
  el parámetro: un UUID malformado también cuenta.
- **Un código malformado responde 404**, igual que uno inexistente. Un 400 aparte diría qué
  forma tiene un código válido.
- **`noindex`** en cabecera y en `<meta>`, y **`Cache-Control: private, no-store`**. Un
  buscador o una caché compartida no deben quedarse con nombres de personas.

El rate limiter es en memoria y por proceso. Con un solo contenedor basta; con varias
réplicas, cada una llevaría su cuenta y el límite efectivo se multiplicaría. Hará falta un
limitador compartido si se escala horizontalmente.

### 2.4 El QR va siempre y no se congela

El QR se imprime en el pie de las tres plantillas, sobre el folio, sin interruptor: un
certificado sin QR no se puede verificar. `certificateQrSvg` lo dibuja como un `<svg>` de un
solo trazo, con `QRCode.create`, que es síncrono. El renderizador sigue siendo puro, y el QR
se ve igual en la vista previa y en el PDF.

La dirección se calcula **al descargar**, con `APP_BASE_URL` y el `documentId`, y no se guarda
en el snapshot. Así la llevan también los certificados emitidos antes de esta feature, y un
cambio de dominio se arregla en una variable de entorno. Lo congelado es lo que acredita, no
dónde se comprueba.

## 3. Consecuencias

- **Rutas:** `certificateVerificationRoutes` en la ZONA 1.
- **Dominio:** `CertificateVerification`, `VerifiableIssue`, `verificationPathOf`,
  `CERTIFICATE_VERIFY_RATE_LIMIT`, `CERTIFICATE_QR_SIZE` y `certificateQrSvg`.
  `CertificateRenderData` gana `verificationUrl`, que no se congela.
- **Servicio:** `certificateService.verify(documentId)`, sin `actor`. `downloadIssue` y
  `downloadSample` pasan la dirección del QR.
- **Configuración:** `APP_BASE_URL` pasa a ser crítica en producción, porque es lo que
  imprime el QR.
- **Esquema:** sin cambios.

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Código inexistente o malformado | `CERTIFICATE_ISSUE_NOT_FOUND` (404) |
| Más de 30 consultas por minuto desde la misma IP | `CERTIFICATE_VERIFY_RATE_LIMITED` (429) |
| Certificado revocado | No es un error: responde 200 con `status: "revoked"` y solo el folio |
