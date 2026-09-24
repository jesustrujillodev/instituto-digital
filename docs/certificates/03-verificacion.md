# Verificación pública del certificado — Referencia

## 1. Qué es

`/verificar/:documentId` es la única página de la plataforma con datos de personas que
responde **sin sesión**. La abre quien tiene un certificado en la mano, casi siempre desde
el QR impreso, y responde si el documento es auténtico. Las decisiones están en
[ADR 0020](../adr/0020-ruta-publica-de-verificacion.md); la emisión, en
[02-emision.md](./02-emision.md).

```
app/modules/certificates/
├── domain/templates/qr.ts                    # certificateQrSvg: el QR como SVG puro
├── domain/certificate.mapper.ts              # toCertificateVerification: la proyección pública
└── routes/verificar/$documentId/             # loader público y página fuera del dashboard
```

## 2. Qué responde

| Caso | Pantalla | Datos |
| --- | --- | --- |
| Válido | «Certificado válido» | Nombre, curso, dependencia, horas, fecha de emisión y folio: lo impreso, del `data_snapshot` |
| Revocado | «Certificado no válido» (200) | **Solo el folio.** Si se revocó, ya no acredita nada sobre esa persona |
| Inexistente o código malformado | «No existe este certificado» (404) | Nada |
| Más de 30 consultas por minuto desde la misma IP | «Demasiadas consultas» (429) | Nada |

- La respuesta se arma campo por campo en `toCertificateVerification`: un campo nuevo en el
  snapshot no se publica sin añadirlo ahí.
- Nunca incluye correo, `userId`, `courseId` ni ids internos. Una prueba lo comprueba sobre
  la forma de la respuesta.
- Un código con otra forma que la de un UUID responde 404, igual que uno inexistente. Un 400
  aparte diría qué forma tiene un código válido.

## 3. Por qué el UUID y no el folio

El folio es consecutivo (`2026-0001`, `2026-0002`…). Si fuera la URL, cualquiera recorrería
todos los certificados y armaría un directorio del personal del Ayuntamiento. El rate limit
solo lo haría más lento. El `documentId` de la emisión es un UUID v4: no se adivina. El folio
se sigue mostrando en la página, pero no sirve para buscar.

## 4. Defensas de la ruta

- **Sin `requireAuth`, a propósito.** Lo dice el JSDoc del loader.
- **Rate limit** por IP con el `rateLimiter` del cradle, antes de validar nada:
  `CERTIFICATE_VERIFY_RATE_LIMIT` (30 por minuto). Es en memoria y por proceso; alcanza
  mientras la app corra en un solo contenedor.
- **`X-Robots-Tag: noindex, nofollow`** y la `<meta name="robots">`: los nombres no terminan en
  un buscador.
- **`Cache-Control: private, no-store`**: ninguna caché intermedia guarda la página.

## 5. El QR del certificado

- Va en el pie de las tres plantillas, sobre el folio, siempre: un certificado sin QR no se
  puede verificar.
- Lo dibuja `certificateQrSvg(url, 80)`: un `<svg>` con un fondo y un solo `<path>`, sin
  imágenes ni scripts. `QRCode.create` es síncrono, así que el renderizador sigue siendo puro
  y entra igual en la vista previa y en el PDF.
- La dirección (`verificationUrl`) **no se congela**. `downloadIssue` la calcula al
  descargar como `APP_BASE_URL + /verificar/<documentId>`. Por eso también la llevan los
  certificados emitidos antes de F-10.
- La vista previa y la muestra del editor usan una dirección de muestra
  (`/verificar/00000000-…`), que la verificación responde como inexistente.

`APP_BASE_URL` tiene que ser el origen público de producción. En Railway se deriva de
`RAILWAY_PUBLIC_DOMAIN` si falta. Si apunta a otro lado, los QR impresos llevan a otro lado.
