# ADR 0028 · Editor libre: documento de elementos v2 y maquetado de texto determinista

**Estado:** aceptado · 2026-10-02
**Extiende:** [ADR 0017](./0017-certificado-html-y-un-solo-renderizador.md) (un solo
renderizador) · **Supera:** [ADR 0018](./0018-diseno-del-certificado-borrador-y-publicado.md)
§2.7 (editor dentro del dashboard)

## 1. Contexto

El certificado se diseñaba con un gestor de plantillas: tres maquetas fijas
(institucional, mínima, marco) a las que se les cambiaba el acento y unos textos. Hacía
falta un editor libre, tipo Canva básico: textos, formas, imágenes, logos y campos
dinámicos colocados por coordenadas, con un PNG y un PDF idénticos a lo que se ve.

## 2. Decisiones

### 2.1 Un documento de elementos, versionado junto al anterior

`CertificateDesign = DesignV1 | DesignV2`, discriminado por `version` (un blob sin
`version` es v1). El v2 (`domain/design/design-v2.schema.ts`) es una página en **puntos
PDF**, un fondo (color o PDF) y una lista de elementos cuyo orden es el apilado:

| Elemento | Qué lleva |
| --- | --- |
| `text` | Contenido con campos `{participante}`, `{capacitacion}`, `{descripcion}`, `{dependencia}`, `{horas}`, `{fecha}`, `{folio}`; tipografía del catálogo; ajuste `wrap` o `shrink` |
| `folio` | Estilo de texto y una etiqueta; siempre imprime el folio |
| `shape` | Rectángulo (con esquinas), elipse o línea; relleno y borde |
| `image` | Un logo (`logoId`) o una imagen subida (`ref`, con rol `image` o `signature`) |
| `qr` | El QR de verificación |

Invariantes del esquema: exactamente un QR y un folio, ni ocultos ni fuera de la página;
QR cuadrado, de al menos 2 cm, en ángulos rectos y opaco; ids únicos; colores `#rrggbb`;
caras del catálogo; campos conocidos; como mucho 150 elementos.

Los puntos hacen exacto el tamaño de página (A4 841.89 × 595.28, Carta 792 × 612) y la
superposición sobre un PDF (ADR 0029). El 1100 × 780 px del v1 no era A4 real.

### 2.2 El v1 queda congelado

- `design-v1.schema.ts` es el esquema anterior copiado sin cambios, con sus topes como
  literales: si validara distinto, un snapshot emitido caería al diseño de reserva.
- `renderCertificate` despacha por versión; la rama v1 no se toca. Pruebas golden
  (`certificate.renderer.golden.test.ts`) congelan su HTML con y sin recursos.
- La reserva de un snapshot ilegible es `LEGACY_DEFAULT_DESIGN_V1`, no el diseño por
  defecto del editor, que ahora es el preset v2 institucional.
- Un curso con v1 publicado **sigue emitiendo v1** hasta que alguien publique. El editor
  abre el borrador v1 convertido (`migrateV1ToV2`) y lo avisa.

### 2.3 Texto: el corte de renglones lo decide el dominio

Chromium exporta sin JavaScript y el dominio no tiene DOM. `layoutText`
(`domain/design/text-layout.ts`) corta los renglones y, con `shrink`, baja el cuerpo de
medio en medio punto hasta caber; en el mínimo recorta con «…». Mide con tablas de avance
por cara (`font-metrics.generated.ts`, de `scripts/generate-font-metrics.ts`). El
renderizador pinta cada renglón con `white-space: pre`: el navegador nunca decide un corte,
así que editor y archivo parten igual.

El kerning queda activo: medido en Chromium contra ~1 500 nombres reales, una línea mide
hasta ~2 % más que la suma de sus avances; el margen de seguridad es del 3 %. Con kerning
apagado la medida es exacta, pero «AVATAR» o «To» se ven mal.

### 2.4 Catálogo de fuentes inmutable

Avant Garde (5 pesos) y cinco OFL auto-hospedadas en `public/font/cert/`: EB Garamond,
Playfair Display, Cinzel, Great Vibes y Source Sans 3, recortadas a Latin-1 y Latin
Extended-A (`scripts/build-certificate-fonts.py`). Un archivo publicado no se reescribe:
cambiar una fuente es otro nombre de archivo y otro id. Una prueba compara el hash de cada
archivo con sus métricas. El v2 no nombra fuentes del sistema.

### 2.5 El editor dibuja con el mismo HTML

Konva o Fabric serían un segundo motor y el texto no mediría como en Chromium. El lienzo
es el documento real en un `iframe` (`sandbox="allow-same-origin"`, sin scripts) que se
reescribe solo si cambian página, fondo, fuentes u orden; lo demás se parchea por
`data-el-id`. Encima, una capa en el documento padre recibe el puntero y dibuja selección,
tiradores, giro, guías y marquesina con las cajas del modelo, nunca leyendo el `iframe`.

La lógica es pura y probada (`utils/editor/`): historial con gestos coalescidos,
geometría rotada, imán, alinear y repartir, comandos y atajos.

### 2.6 Pantalla completa

El editor vive en `/dashboard/capacitaciones/:id/certificado/editor`, en una zona nueva de
`app/routes.ts` con su propio layout (`fullscreen.layout.tsx`): mismo gate de sesión,
sin barra lateral. La ficha `/certificado` queda como resumen.

### 2.7 Navegadores

Las líneas y los cuerpos son los mismos en cualquier navegador (2.3). Fuera de Chromium
el editor avisa que la precisión exacta es en Chrome o Edge: el suavizado y el kerning de
Firefox y Safari difieren por fracciones de píxel.

## 3. Consecuencias

- `DEFAULT_CERTIFICATE_DESIGN` pasa a `design.presets.ts` y es v2; los cursos que nunca
  publicaron emiten v2.
- La frontera del editor solo acepta v2; el v1 se lee, no se escribe.
- `ICertificateExporter.export(html, profile)` y `ICertificateAssetSource.load(manifest,
  logos)`: el perfil v1 reproduce la exportación de siempre; el v2 exporta a su tamaño y
  el PNG a 300 ppp.
- Dependencias: `fontkit` (dev, métricas), `pixelmatch` (dev, comparaciones de paridad).

## 4. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| Canvas (Konva, Fabric) | Segundo motor de dibujo: la vista previa y el PDF divergirían |
| Medir el texto en el DOM al exportar | Ata el resultado al navegador de cada quien y no se prueba sin DOM |
| Kerning apagado para medir exacto | Peor tipografía en mayúsculas y caligráficas |
| Migrar todos los v1 a v2 | Cambiaría en silencio lo que se emite; se convierte solo al abrir el editor |
