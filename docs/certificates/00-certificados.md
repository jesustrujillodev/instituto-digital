# Certificados — Referencia

## 1. Qué es

El núcleo que dibuja el certificado de un curso. Recibe un diseño y los datos de una
emisión y devuelve HTML+CSS. De esa misma salida tienen que salir la vista previa del
editor (F-08), el PDF y el PNG (F-09) y lo que enseña la verificación pública (F-10).
Las decisiones de fondo están en
[ADR 0017](../adr/0017-certificado-html-y-un-solo-renderizador.md).

En esta etapa el módulo es solo `domain/`: sin base de datos, sin rutas y sin cradle.

```
app/modules/certificates/domain/
├── certificate.types.ts      # contratos
├── certificate.config.ts     # lienzo, acentos, logo, topes de texto, diseño por defecto
├── certificate.rules.ts      # plantillas, esquema del diseño, safeAccent, safeImageUrl
├── certificate.renderer.ts   # renderCertificate y renderCertificateDocument
└── templates/
    ├── shared.ts             # estilos base, fuentes, pie, cuerpo común
    ├── qr.ts                 # el QR de verificación como SVG puro (F-10)
    ├── institucional.ts
    ├── minima.ts
    └── marco.ts
```

## 2. Contratos

| Tipo | Quién lo pone | Qué lleva |
| --- | --- | --- |
| `CertificateDesign` | El capacitador; se persistirá por curso | Plantilla, acento `#rrggbb`, subtítulo, descripción (vacía cae a la del curso), dos firmantes (`name`, `role`, `enabled`, `signatureUrl`) y el formato del folio |
| `CertificateRenderData` | El sistema, al emitir | Nombre de quien recibe, título y descripción del curso, dependencia, horas, fecha y folio, **ya formateados** |
| `CertificateRenderOptions` | Quien llama | `assetBaseUrl`, la base contra la que se resuelven fuentes y logo; y, al exportar, `assets`: fuentes, logo y firmas como data URIs para un documento autocontenido ([02-emision.md](./02-emision.md)) |

- `hours` es `null` cuando el curso no tiene horas (`courseHoursOf`, F-02), y entonces
  la línea «Con una duración de…» no se pinta.
- Los tokens del folio (`{seq}`, `{year}`, `{month}`) los resuelve la emisión (F-09): el
  renderer recibe el folio ya armado.

## 3. Salidas

| Función | Devuelve | Para |
| --- | --- | --- |
| `renderCertificate` | `{ html, styles }`, con el CSS aparte | Exportadores que inyectan el CSS por separado |
| `renderCertificateDocument` | Un solo documento, con el `<style>` en el `<head>` | La vista previa en `iframe` y las muestras |

El CSS siempre lleva los `@font-face` de la Avant Garde, los estilos base (lienzo de
1100 × 780, `print-color-adjust: exact` y `@page` sin márgenes) y los de la
plantilla.

## 4. Reglas

1. **Todo texto interpolado pasa por `escapeHtml`** (`app/shared/html/escape-html.ts`).
   Es la misma función que usan los correos.
2. **El acento se valida, no se escapa.** `safeAccent` solo acepta `#rrggbb`; cualquier
   otra cosa se sustituye por el acento por defecto antes de llegar a la plantilla.
3. **Las imágenes de firma pasan por `safeImageUrl`.** Acepta `https:` o el proxy
   `/api/storage?`. Una URL rechazada deja la firma sin imagen, pero con nombre y cargo.
4. **CSS bajo `.t-<id>`.** La raíz de toda plantilla es `<div class="cert t-<id>">`.
5. **El pie tiene cuatro celdas siempre**: una firma apagada deja la suya vacía. Las
   celdas se alinean arriba y el hueco de la firma mide 52 px con imagen o sin ella.
   Con `data.verificationUrl`, el QR de verificación se posiciona sobre el folio sin mover
   las celdas ([03-verificacion.md](./03-verificacion.md)).
6. **Textos largos**: el nombre y el título bajan de cuerpo por largo con las clases
   `is-long`/`is-longer` (`lengthClass`), la descripción se corta a tres líneas (dos en
   `marco`) y los nombres y cargos de firma a dos.
7. **Una plantilla desconocida se dibuja con `institucional`.**
8. **El logo es blanco**, así que va siempre sobre una superficie del color de acento.

## 5. Revisarlo a ojo

```bash
bun run certificates:samples
```

El script escribe en `.cache/certificados/` (ignorado por git) cinco casos por
plantilla:

- normal
- textos largos
- una palabra
- sin firmas
- nombre malicioso

Después los sirve en `http://localhost:4400/`, junto con `public/`. No se abren como
`file://` porque el navegador bloquea las fuentes cargadas desde archivo, y la muestra
saldría con tipografías sustitutas.

## 6. Añadir una plantilla

1. Añadir el id a `CERTIFICATE_TEMPLATE_IDS`.
2. Crear `templates/<id>.ts` con una función `TemplateRenderer`. La raíz es
   `cert t-<id>`, todo selector cuelga de `.t-<id>`, y la plantilla reutiliza
   `renderStatement`, `renderFooter` y `footerStyles`.
3. Registrarla en `TEMPLATE_RENDERERS`. El `Record` no compila hasta hacerlo.
4. Las pruebas de `certificate.renderer.test.ts` la recorren solas, porque iteran
   `CERTIFICATE_TEMPLATE_IDS`.
5. Revisar sus cinco muestras.
