# ADR 0017 · El certificado es HTML y un solo renderizador lo dibuja

**Estado:** aceptado · 2026-09-23
**Contexto del cambio:** MVP-02 · F-07, núcleo de render de certificados
**Referencia de diseño:** `CERTIFICATE_EDITOR.md` (anatomía del editor de ClassroomIO)

## 1. Contexto

Cada curso otorga un certificado propio, diseñado por quien lo imparte. Ese
documento tiene tres consumidores que llegan en fichas distintas: la vista previa
del editor (F-08), la exportación a PDF y PNG (F-09) y la verificación pública por
folio (F-10). Si cada uno dibujara el certificado con su propio motor, la vista previa
y el archivo descargado acabarían siendo documentos distintos.

Lo que el sistema necesitaba antes de cualquier pantalla:

- Un formato que sirva igual en un navegador y en un exportador.
- Una frontera clara entre lo que decide el capacitador y lo que pone la emisión.
- Defensas contra que un dato de una persona se convierta en marcado o en estilo.

## 2. Decisiones

### 2.1 HTML+CSS, y una sola función que lo produce

`renderCertificate(design, data, options) → { html, styles }`
(`certificates/domain/certificate.renderer.ts`) es el **único** motor de dibujo. La
vista previa usa `renderCertificateDocument`, con el CSS dentro del `<head>`, y la
exportación usa la salida con el CSS aparte. Las dos salen de la misma llamada, así que
no pueden divergir.

Es una función pura: vive en `domain/`, sin `.server`, sin cradle y sin I/O. Se
importa directamente; no se inyecta, porque no tiene estado.

### 2.2 Diseño y datos de emisión son dos contratos

- `CertificateDesign` es lo que configura el capacitador y se persistirá: plantilla,
  acento, subtítulo, descripción, **exactamente dos firmantes** que se encienden o
  apagan, y el formato del folio. El esquema de valibot vive en `certificate.rules.ts`,
  listo para la frontera de F-08.
- `CertificateRenderData` es lo que pone el sistema al emitir: quién lo recibe, el
  curso, la dependencia, las horas, la fecha y el folio. Nunca se guarda en el diseño.
  Si se guardara ahí, editar la plantilla podría reescribir a quién se otorgó un
  certificado.

Los textos de `RenderData` llegan **ya formateados**: el renderer no sabe de fechas, de
zonas horarias ni de plurales. Las horas salen de `courseHoursOf` (F-02).

### 2.3 Lienzo fijo de 1100 × 780

Es A4 horizontal, la medida de la referencia. Está en `CERTIFICATE_CANVAS`, sin media
queries, y quien muestra el certificado más pequeño lo escala con
`transform: scale()`. Pasar a carta (1100 × 850) sería cambiar la constante y revisar
las tres plantillas.

### 2.4 Tipografía auto-hospedada, sin terceros

El certificado usa la ITC Avant Garde del manual de identidad, servida desde
`public/font`, y una serif del sistema para el nombre y el título. Es la misma regla
del tema (`theme.config.ts`, catálogo curado). La referencia cargaba Google Fonts, y
eso habría hecho depender cada vista previa y cada exportación de un tercero.

Las fuentes y el logo se resuelven contra `options.assetBaseUrl`:

| Consumidor | `assetBaseUrl` |
| --- | --- |
| La app | `""` |
| El script de muestras | `""`, servido desde su propio servidor local |
| La exportación (F-09) | Una URL absoluta |

El logo del Ayuntamiento lleva texto blanco, así que las tres plantillas lo colocan
sobre una superficie del color de acento.

### 2.5 Nada de una persona entra crudo

La referencia solo escapaba el texto. Aquí se cierran otras dos puertas que ella dejaba
abiertas:

| Vector | Defensa |
| --- | --- |
| Texto interpolado en HTML | `escapeHtml` (`app/shared/html/escape-html.ts`), compartido con los correos: una sola copia de la defensa |
| El acento, que entra al CSS sin escape posible | `safeAccent`: solo acepta `#rrggbb`; cualquier otra cosa cae al acento por defecto |
| La URL de una firma, en `src` | `safeImageUrl`: acepta `https:` o el proxy `/api/storage?`, y descarta `javascript:`, `data:` y `blob:` |
| Una plantilla que ya no existe | `resolveTemplateId`: cae en `institucional` en vez de lanzar |

### 2.6 El pie no se mueve

El pie tiene cuatro columnas que existen siempre: dos firmas, la fecha y el folio. Una
firma apagada deja su **celda vacía**. La referencia devolvía `''`, lo que corría las
demás columnas. Las celdas se alinean arriba y el hueco de la imagen de firma tiene alto
fijo, así que las líneas de firma quedan a la misma altura aunque un nombre ocupe dos
líneas.

### 2.7 CSS aislado por plantilla

Todo selector de una plantilla cuelga de `.t-<id>` y la raíz es
`<div class="cert t-<id>">`. Una prueba lo verifica sobre la hoja de estilos de cada
plantilla. Añadir una plantilla es una función más en `TEMPLATE_RENDERERS`, un `Record`
que no compila si falta una.

## 3. Consecuencias

- **Módulo nuevo**: `app/modules/certificates/`, solo con `domain/` en esta ficha.
  F-08 añade la persistencia y el editor, y F-09 el puerto de exportación.
- **Cambio en notifications**: su `escapeHtml` privado pasa a `app/shared/html/`, sin
  cambio de comportamiento.
- **Herramienta**: `bun run certificates:samples` escribe quince muestras en
  `.cache/certificados/` y las sirve en `http://localhost:4400`. Las sirve en vez de
  abrirlas como `file://` porque el navegador bloquea las fuentes cargadas desde
  archivo.
- **Fuera de alcance**:
  - El QR de verificación: F-10 añadirá un campo opcional a `RenderData`.
  - La resolución de los tokens del folio: F-09.
  - La lectura tolerante del blob guardado: F-08.

## 4. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| Canvas o una librería de PDF para dibujar | Serían dos motores: la vista previa en HTML y el PDF en otro, y divergen |
| Google Fonts | Una dependencia de un tercero en cada render, contra la regla del tema |
| Variables CSS para el acento | Seguirían necesitando validar el valor; no quitan la regla de `safeAccent` |
| Firmantes variables (de uno a tres) | Cada plantilla tendría que maquetar tres pies distintos; dos que se encienden cubren el caso real |
