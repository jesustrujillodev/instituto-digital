# Editor libre del certificado — Referencia

## 1. Qué es

`/dashboard/capacitaciones/:documentId/certificado/editor` es el editor del certificado a
pantalla completa: lienzo, insertar, capas, página, plantillas y propiedades. Las
decisiones están en [ADR 0028](../adr/0028-editor-libre-documento-v2.md) y
[ADR 0029](../adr/0029-fondo-pdf-vectorial.md); la biblioteca y los logos, en
[05-biblioteca-y-logos.md](./05-biblioteca-y-logos.md).

```
app/modules/certificates/
├── domain/design/           # esquema v1 (congelado) y v2, renderizador v2, presets,
│                            # tokens, catálogo de fuentes, métricas, maquetado de texto
├── domain/certificate-assets.rules.ts   # carpetas, propiedad, tipo por bytes, SVG, raster
├── components/editor/       # el editor: lienzo, capa de selección, paneles
├── hooks/                   # iframe del lienzo, gestos, atajos, subidas, pdf.js
├── utils/editor/            # lógica pura: historial, geometría, imán, alinear, comandos
└── routes/cursos/$documentId.certificado.editor/
```

## 2. Lo que se puede hacer

Si la capacitación aún no tiene certificado (sin fila en `course_certificates`), el editor
abre preguntando cómo empezar: **documento en blanco** (Carta o A4, horizontal o vertical,
solo con el QR y el folio), uno de los **diseños de partida** o una plantilla de la
**biblioteca**. Cerrar el diálogo deja el diseño institucional. Con un certificado ya
guardado no hay diálogo: las mismas tres opciones están en la pestaña **Plantillas**. En
ambos casos lo elegido es un cambio sin guardar, que se puede deshacer.

| Herramienta | Detalle |
| --- | --- |
| Insertar | Texto, campo dinámico, rectángulo, elipse, línea, imagen (PNG, JPG, WEBP o SVG ≤ 2 MB), firma (PNG o WEBP) y logos institucionales. Todo entra centrado |
| Texto en el lienzo | Doble clic para escribir sobre el lienzo con su fuente; la caja crece al escribir (`Crecer caja`) o la letra baja hasta caber (`Reducir letra`) |
| Mover y transformar | Arrastrar, 8 tiradores, giro (Shift: de 15 en 15), proporción con Shift (siempre en imágenes y QR) |
| Guías | Imán al centro, bordes y margen de seguridad (18 pt) de la página y a bordes y centros de otros elementos; Alt al arrastrar lo apaga |
| Selección | Clic, Shift-clic, marquesina, Ctrl+A; varios se mueven y escalan juntos |
| Alinear | Con uno, contra la página; con varios, contra su caja; repartir con tres o más |
| Capas | De arriba hacia abajo; arrastrar para reordenar; bloquear, ocultar, renombrar |
| Página | A4 o Carta, horizontal o vertical; fondo de color o PDF |
| Navegar | Sin barras de desplazamiento: rueda (Shift para el eje horizontal), Espacio + arrastrar o botón central; zoom de 10 % a 400 % y «ajustar» |
| Plantillas | Documento en blanco, los tres diseños de partida y la biblioteca; aplicar se puede deshacer |

QR y folio son obligatorios: se mueven, se redimensionan y se estilizan, pero no se ocultan,
duplican ni eliminan.

### Atajos

| Tecla | Acción |
| --- | --- |
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Deshacer / rehacer (un arrastre es un paso) |
| Supr, Retroceso | Eliminar |
| Ctrl+D · Ctrl+C · Ctrl+V | Duplicar · copiar · pegar |
| Flechas · Shift+flechas | Mover 1 pt · 10 pt |
| Ctrl+] · Ctrl+[ (con Shift: al frente / al fondo) | Orden de apilado |
| Ctrl+A · Esc | Seleccionar todo · quitar selección |
| Ctrl+S | Guardar |
| Espacio + arrastrar | Desplazar el lienzo |

Dentro de un campo de texto, solo Ctrl+S es del editor.

## 3. Guardar y publicar

Mismas intenciones y reglas que siempre ([01-editor.md](./01-editor.md) §4): `save-draft`
y `publish` reciben el diseño en pantalla. El servidor comprueba, además del esquema:

| Comprobación | Rechazo |
| --- | --- |
| Toda imagen y fondo es del propio curso (`isOwnCertificateAssetRef`) | `CERTIFICATE_ASSET_NOT_OWNED` |
| Los logos subidos existen | `CERTIFICATE_LOGO_NOT_FOUND` |
| No se elige un logo archivado (sí se conserva uno que ya estaba) | `CERTIFICATE_LOGO_ARCHIVED` |

Un borrador v1 abre convertido al editor libre con un aviso y se puede guardar tal cual.

## 4. Imágenes y fondos

| Intención | Qué hace |
| --- | --- |
| `upload-image` | El navegador reduce lo grande (2400 px; firmas 1200 px en PNG). El servidor reconoce el tipo por sus bytes, guarda con esa extensión y mide la imagen |
| `upload-background` | Ver [ADR 0029](../adr/0029-fondo-pdf-vectorial.md). La página adopta el tamaño del PDF; «Quitar formas y logos» deja ver su diseño |

Rechazos de imagen (`CERTIFICATE_ASSET_INVALID`, con el motivo): vacía, más de 2 MB, tipo
no admitido, SVG de más de 512 KB o con scripts, manejadores, `javascript:`,
`foreignObject`, entidades, `@import` o recursos externos, o sin medidas.

Los SVG solo se pintan por `<img>`. El proxy de storage los sirve en línea con
`Content-Security-Policy: sandbox` y por URL firmada como adjunto; todo lo servido en línea
lleva `X-Content-Type-Options: nosniff`.

## 5. Pixel perfect

- El lienzo es el HTML del certificado en un `iframe`; el PDF y el PNG salen del mismo HTML
  en Chromium ([02-emision.md](./02-emision.md) §6).
- Los renglones los corta el dominio (`layoutText`): el navegador nunca decide un corte.
- Fuera de Chrome o Edge el editor avisa que la precisión exacta es en Chromium.

## 6. Muestras

`bun run certificates:samples` escribe cada plantilla v1 y su diseño de partida v2 con los
mismos cinco casos (normal, textos largos, una palabra, sin firmas, nombre malicioso).
