# Theme builder — referencia de lo implementado (Fase B)

**Última actualización:** 2026-08-04 · **Estado: implementado.**

Segunda mitad de la feature de temas. Da por leída la
[fase A](./00-modo-oscuro.md), que documenta quién decide el esquema de color y
cómo se sirve el CSS sin flash; aquí se documenta de dónde salen ahora esos
tokens y cómo se editan.

La regla que gobierna las dos fases sigue siendo la misma: **el tema es de la
plataforma; el modo es de la persona.** La fase A dio a cada usuario el
claro/oscuro/sistema. La fase B da al ADMIN el tema.

---

## 1. Qué cambia respecto de la fase A

| | Fase A | Fase B |
|---|---|---|
| Origen de los tokens | `DEFAULT_THEME_TOKENS` | Tema **activo** en base de datos; la constante pasa a ser el respaldo |
| Tokens editables | ninguno | 36 colores × 2 variantes + tipografía, radios, bordes, sombras y espaciado |
| Lecturas por petición | 0 (constante) | 0 en caliente — el tema activo va cacheado en memoria de proceso |

Lo que **no** cambia: el CSS lo sigue emitiendo el servidor en un `<style>` del
`<head>`, sigue sin haber flash ni JavaScript en la ruta crítica, y el
`@custom-variant dark` de dos ramas de `app.css` sigue siendo load-bearing.

## 2. Modelo de datos

Dos tablas nuevas en el esquema `public`.

```
Theme            id, documentId, name, isPreset,
                 draftTokens (Json), publishedTokens (Json?), publishedAt
AppearanceState  id = 1, activeThemeId → Theme (onDelete: SetNull)
```

Tres decisiones que conviene no deshacer:

- **Borrador y publicado separados.** `draftTokens` es lo que el builder edita y
  `publishedTokens` lo que la app sirve. Es lo que permite iterar un tema sin
  tocar lo que ven los usuarios. Un tema recién creado tiene borrador y **no**
  tiene publicado — y por eso no se puede activar todavía.
- **"Un solo tema activo" por construcción.** Una fila (`id = 1`) y una FK, en
  vez de un índice único parcial sobre `themes`, que Prisma no expresa de forma
  nativa y obligaría a SQL crudo dentro de la migración. Mismo patrón que
  `SecurityState`.
- **`onDelete: SetNull` es la red, no la regla.** Borrar el tema activo no puede
  romper la app, pero tampoco debería poder hacerse por un clic:
  `theme.rules.ts` lo prohíbe antes de llegar a la base.

> **Requisito de esquema.** Esta fase añade las tablas `themes` y
> `appearance_state`. Igual que en la fase A, **no se generó carpeta de
> migración**: el proyecto sigue en construcción de plantilla y la base es local,
> así que el cambio se aplica con `bunx prisma db push` — decisión explícita del
> dueño del repositorio, por encima de lo que indica `AGENTS.md` §"Flujo de
> migraciones". El cliente ya está regenerado, de modo que el typecheck y la
> suite pasan aunque la base todavía no tenga las tablas. **Sin el `db push` y el
> `bun run seed` posterior, `/dashboard/personalizacion` falla en runtime** (el
> resto de la aplicación sigue funcionando con el tema base).

### 2.1 Los `Json` no se confían

`theme.mapper.ts` valida los tokens con valibot **al leer**. Si una fila está
corrupta o quedó de una versión anterior del esquema de tokens, el repositorio
cae a `DEFAULT_THEME_TOKENS` y lo registra por el logger. La app siempre
renderiza: un tema mal guardado no puede tumbar la plataforma entera.

## 3. El modelo de tokens

`ThemeTokens` —lo que se guarda en las dos columnas `Json`— tiene tres partes:

```
shared   radius, borderWidth, spacing, fontSans/Serif/Mono/Heading,
         fontSize, letterSpacing, shadow{color,opacity,blur,spread,offsetX,offsetY}
light    los 36 colores
dark     los 36 colores
```

Dos cosas que **no** se guardan porque se derivan:

- La **escala de sombras** `--shadow-2xs … --shadow-2xl`. El admin edita seis
  parámetros y `deriveShadowScale` abre los ocho pasos. Editar los ocho a mano
  daría más control y garantizaría escalas incoherentes.
- La **pila de `font-family`**. Se guarda la *clave* del catálogo (`"geist"`), no
  la pila. Así solo se puede elegir lo que la aplicación auto-hospeda, y el valor
  guardado no puede ser un vector de nada.

La expansión de una cosa a la otra vive en `toCssTokenSet` (`theme.mapper.ts`),
que es también la primera barrera de saneamiento: **recorre `COLOR_TOKENS`, no
las claves del objeto guardado**, así que una fila con claves inventadas no puede
meter nombres nuevos en el `<style>`. `serializeThemeCss` filtra además nombres y
valores contra una allowlist. Que las dos existan es deliberado: el fallo de una
sola no debe bastar.

### 3.1 El prefijo `--theme-*`

Los colores conservan sus nombres de shadcn (`--primary`, `--sidebar-border`).
Todo lo demás lleva prefijo: `--theme-spacing`, `--theme-font-sans`,
`--theme-shadow-md`…

El motivo es concreto: `--spacing`, `--font-sans` y la escala `--shadow-*` son
**claves del tema de Tailwind**, y declararlas también en `:root` es una carrera
de cascada que se gana o se pierde según el orden de las hojas. Con el prefijo,
`app.css` las conecta explícitamente:

```css
@theme inline {
  --spacing: var(--theme-spacing);
  --font-sans: var(--theme-font-sans);
  --shadow-md: var(--theme-shadow-md);
  /* … */
}
```

Es el mismo mecanismo con el que shadcn conecta `--color-primary` a `--primary`.

El grosor de borde va por otra vía, porque Tailwind no tiene una clave de tema
para él: se redefine la utilidad con `@utility border`. Tocar el preflight
(`* { border-width }`) le habría puesto borde a todo.

## 4. Servido del tema activo

El loader raíz de la fase A pasa a leer el tema activo por `themeRepository`,
decorado con `theme.cache.server.ts` — copia estructural de
`security-state.cache.server.ts`, registrada con **`asValue`** en
`container.server.ts`.

`asValue` y no `asSingleton`: el contenedor es **por petición**, así que
`asSingleton` daría una instancia nueva en cada request y no cachearía nada. El
tema activo se lee en toda petición —también en la landing y en el login— y
cambia cuando un admin pulsa "activar", o sea casi nunca.

**TTL:** `THEME_CACHE_TTL_S` (60 s) en `theme.config.ts`. Mismo criterio que
`AUTH_SECURITY_STATE_CACHE_TTL_S`: es la ventana de propagación de una
publicación entre nodos. El nodo que publica invalida su copia y responde ya con
el tema nuevo.

### 4.1 Una diferencia deliberada con la caché de seguridad

En `security-state.cache.server.ts`, un fallo de lectura **en frío deniega**:
abrir la plataforma por una caída de la base sería inaceptable.

Aquí la regla es la contraria: **con la base caída se sirve el último tema activo
conocido**, nunca se deniega y el tema base es solo el último recurso. Perder la
marca por una caída es un fallo visible para todos los visitantes. El respaldo
tiene tres niveles (plan: `docs/plans/2026-09-12-tema-activo-sin-base.md`):

| Nivel | Dónde | Cubre |
|---|---|---|
| 1. Memoria | `theme.cache.server.ts` | Proceso caliente |
| 2. Snapshot en disco | `theme.snapshot.server.ts`, ruta `THEME_SNAPSHOT_PATH` (por defecto `.cache/theme/active-theme.json`) | Reinicio, deploy o recarga del dev server con la base caída |
| 3. Navegador | `utils/last-known-theme.ts` + `hooks/use-last-known-theme.ts` | Nodo sin snapshot (contenedor nuevo, otro nodo) para quien ya visitó la plataforma |

- La caché escribe el snapshot tras una lectura con éxito **solo si cambió**, sin
  esperar al disco. Un fallo al escribir se registra y se reintenta.
- Mientras la base no responde, se reintenta cada `THEME_CACHE_RETRY_S` (5 s) y
  no en cada petición: si no, cada página esperaría el timeout de conexión.
- Una escritura (activar, publicar…) solo **expira** la caché; el valor en
  memoria sigue sirviendo de respaldo.
- Sin memoria ni snapshot, el error se propaga y el servicio responde con el
  tema base y `origin: "fallback"`. En ese caso, y solo en ese, el `<head>` lleva
  un script inline que pinta encima (`<style id="theme-last-known">`) el CSS que
  el navegador guardó en `localStorage` (`theme:last-active`). Con
  `origin: "active"` el navegador lo guarda; con `preview` no guarda nada.
- En Docker, montar un volumen en `THEME_SNAPSHOT_PATH` para que el snapshot
  sobreviva también a un redeploy.

La caché sí retiene el `null`: "no hay tema activo" es una respuesta legítima y
cachearla importa — si `null` se tratara como "no cargado", una plataforma sin
tema activo pagaría una consulta por petición para siempre.

## 5. Casos de uso

Todos en `application/theme.service.server.ts`, envueltos en
`createOperationRunner`, devolviendo `AppResponse<T>`.

| Operación | Invariante que impone |
|---|---|
| `listThemes` | — |
| `getTheme` | existe |
| `createTheme(name, fromDocumentId?)` | el origen existe; sin origen parte del tema base |
| `cloneTheme(documentId, name)` | única vía para partir de un preset; el clon **nunca** nace publicado |
| `renameTheme` | no es preset |
| `saveDraft` | no es preset |
| `importThemeCss` | no es preset; lo pegado tiene que componer tokens válidos |
| `publishTheme` | no es preset |
| `activateTheme` | ya se publicó alguna vez |
| `discardDraft` | no es preset **y** ya se publicó |
| `deleteTheme` | no es preset **y** no es el activo |

`createTheme` y `cloneTheme` copian el **borrador** del origen, no lo publicado:
es lo que el admin estaba viendo al pulsar, no una versión anterior.

Un preset **sí** se puede activar. Es inmutable, no inservible.

## 6. UI

`/dashboard/personalizacion`, dentro del layout del dashboard.
`requireRole(request, context, ["ADMIN"])` en el **loader y en el action** — un
loader protegido no protege las mutaciones de su propia ruta. Enlace en
`footerNavigationConfig` junto a *Sesiones*, con `roles: ["ADMIN"]`.

El tema abierto viaja en la URL (`?tema=<documentId>`): la pantalla es enlazable,
sobrevive a un refresh y el botón atrás hace lo esperado.

### 6.1 Preview en vivo

`use-theme-draft.ts` reescribe con debounce (~60 ms) un `<style id="theme-draft">`
**al final del `<head>`**, después del que emitió el servidor. No es una caja de
muestra: pisa los tokens del documento entero, así que el sidebar y la cabecera
cambian mientras se mueve el slider. La galería de la derecha existe para juzgar
de un vistazo lo que no cabe en la pantalla actual.

El estado local se readopta del servidor cuando cambia el **borrador
persistido** —cambio de tema, importar, descartar— y no cuando cambia el estado
local. Guardar no provoca ningún salto: lo que vuelve es lo que se acaba de
mandar. El `<style>` se retira al salir de la pantalla; si no, navegar a otra
ruta la dejaría con colores que nadie ha publicado.

Hay **autoguardado** (1,2 s tras el último cambio). El builder se usa moviendo
sliders, y obligar a pulsar "guardar" tras cada ajuste acabaría con cambios
perdidos. Los presets quedan excluidos: la invariante los rechaza y cada intento
sería un toast de error por cada slider movido.

### 6.2 Probar en toda la app

Guarda el borrador y setea la cookie `__theme_preview=<documentId>`.

**El gate es el rol verificado en servidor, no la cookie.** El loader raíz solo
la atiende si `context.authPayload?.role === "ADMIN"`; la cookie únicamente dice
*qué* tema, y eso puede fabricarlo cualquiera. Por sí sola no abre nada.

Se guarda **antes** de encender la cookie: el preview sirve el borrador
persistido, así que sin ese guardado se estaría probando lo anterior. Activar o
borrar un tema apaga el preview en el mismo movimiento — seguir en él daría una
pantalla que miente sobre lo que ven los demás.

La barra flotante (`ThemePreviewBar`) se pinta desde lo que devuelve el loader
raíz, no leyendo la cookie: si aparece, es porque el preview está realmente en
marcha. Vive en `root.tsx` y no en el layout del dashboard porque "toda la app"
es literal — el preview cubre también la landing y el login.

#### Atributos de la cookie

`HttpOnly`, `SameSite=Lax`, `Path=/`, **sin firma** y **de sesión** (sin
`Max-Age`). Mismo criterio que la de modo y por el mismo motivo: nadie la lee
desde el cliente. No lleva `secrets` porque no autoriza nada. Es de sesión porque
un preview es algo que se está probando ahora, no un estado que deba sobrevivir
al cierre del navegador.

### 6.3 Panel de contraste

Ratio WCAG 2.1 de cada par fondo/texto (13 pares), en la variante en edición, con
indicador AAA / AA / solo-texto-grande / no cumple. El ratio de cada par aparece
además junto a su campo de color.

**Avisa; no bloquea publicar** (decisión #11: el admin manda). El objetivo es que
nadie publique un tema ilegible sin haberlo sabido, no impedírselo — hay casos
legítimos, como un color de marca que solo se usa en piezas grandes.

El cálculo lo hace `culori`. La luminancia relativa exige linearizar sRGB con la
curva correcta, y escribirlo a mano es una fuente conocida de resultados que se
parecen a los buenos sin serlo.

### 6.4 Derivar oscuro

Invierte la luminancia OKLCH conservando croma, tono y alfa, comprimida al rango
`[0.12, 0.98]`. Invertir a secas mandaría el blanco puro a negro puro, más duro
que cualquier tema oscuro decente; el rango comprimido reproduce de cerca los
valores del tema por defecto de shadcn.

Es un **punto de partida editable**, no un resultado final, y la UI lo dice. Es
también la función que generó las variantes oscuras de los presets: lo que el
admin ve al pulsar el botón es exactamente lo que produjo los temas de fábrica.

### 6.5 El picker

Escrito a mano: ninguna librería conocida habla OKLCH de forma nativa —todas
convierten a HSL o RGB para pintar sus controles, y el color que se elige deja de
ser el que se guarda.

El área de croma × luminosidad se compone con **una franja vertical por valor de
croma**, cada una con un degradado de luminosidad `in oklch`. No hay gradientes
2D en CSS, así que hay que trocear un eje: se trocea el croma porque el escalón
entre franjas contiguas (0.012) es casi imperceptible, mientras que un escalón de
luminosidad se ve como una banda. La alternativa habitual —capas blanca y negra
con transparencia sobre el tono puro— compone en sRGB y enseña un color distinto
del que promete.

Tono y opacidad son `<input type="range">` nativos: llegan con teclado, lector de
pantalla y arrastre táctil correctos sin reimplementar nada.

## 7. Import / export

`theme.mapper.ts` concentra las cuatro direcciones.

**Parsear** un bloque `:root { … } .dark { … }` pegado desde tweakcn o el
generador de shadcn. Tolerante por diseño: ignora lo que no reconoce y completa
lo que falta **con el tema que se está editando**, no con el tema base. Lo único
que exige es `background`, `foreground` y `primary` en `:root` — sin ellos lo
pegado no es un tema, y decirlo es mejor que producir un clon del base con un
token cambiado. Sin bloque `.dark`, la variante oscura se queda como estaba.

**Serializar** para el `<style>` (nombres internos con prefijo) y **exportar**
para el portapapeles (nombres de tweakcn). Que difieran es deliberado: el destino
del CSS exportado es pegarlo en tweakcn o en otra app shadcn. La ida y la vuelta
siguen cuadrando, y hay un test de round-trip sobre el tema base y sobre los
cuatro presets.

**JSON** de ida y vuelta con `version`, que se comprueba **antes** que el
contenido: un archivo de un esquema futuro tiene que fallar por lo que es y no
por qué token le falta.

## 8. Presets de fábrica

`Neutro`, `Índigo`, `Esmeralda` y `Editorial`, definidos en `theme.config.ts` y
sembrados por `prisma/seed.ts` con `isPreset: true` y **ya publicados** — un tema
sin publicar no se puede activar.

Se clonan; no se editan ni se borran, y la invariante vive en `theme.rules.ts`
con su test, no solo en la UI. Ocultar el botón no impide un `POST` a mano, y los
presets son lo único a lo que se puede volver cuando un tema publicado sale mal.

El seed es **idempotente por nombre y no destructivo**: un re-run actualiza los
presets pero no toca los temas creados por el admin ni cuál está activo. Un seed
que borrara `themes` se llevaría por delante el tema en producción de cualquier
entorno donde alguien lo ejecutara por error.

## 9. Fuentes

Catálogo curado (`FONT_CATALOG`), en tres grupos:

| Grupo | Opciones |
|---|---|
| Sans auto-hospedadas | Inter, Geist, Roboto, Open Sans, Montserrat, Poppins, Architects Daughter |
| Serif auto-hospedadas | Playfair Display, Merriweather, Libre Baskerville |
| Mono auto-hospedadas | JetBrains Mono, Fira Code, Space Mono |
| Sin descarga | Del sistema (sans / serif / mono), Times New Roman, Courier New |

Curado y no libre porque solo se puede ofrecer lo que el bundle sirve de verdad:
una caja de texto libre acabaría con `font-family` apuntando a una fuente que
existe en la máquina del admin y en ninguna otra.

Las 13 auto-hospedadas se importan en `app.css`. Casi todas son variables
(`@fontsource-variable/*`): un archivo cubre todo el rango de pesos. Poppins,
Architects Daughter y Space Mono **no tienen versión variable**, así que se piden
los pesos uno a uno (`@fontsource/poppins/600.css`); importar el paquete a secas
declararía solo el 400 y `font-semibold` acabaría en negrita sintética.

El `@import` de las 13 familias **no** descarga 13 familias: solo declara los
`@font-face`, y el navegador baja únicamente las que el tema activo llega a usar.
**Ninguna petición a Google en runtime**, y por tanto ninguna fuga de IPs de
usuarios ni un tercero en la ruta crítica del render. El `links` de
`fonts.googleapis.com` que quedaba en `root.tsx` se eliminó: era redundante con
el `@fontsource-variable/inter` de `app.css` y contradecía esta decisión.

Las cinco entradas con `packageName: null` no descargan nada. Tres son pilas
genéricas del sistema; Times New Roman y Courier New nombran una familia concreta
que Windows y macOS traen instalada —en un Linux sin las fuentes de Microsoft se
cae a `serif` / `monospace`—. Existen para poder reproducir un tema de tweakcn
que no pedía ninguna fuente web, en vez de sustituirle la tipografía en silencio.

Al importar un CSS, la pila declarada se reconoce en dos pasadas (`readFontKey`):
primero comparando la pila COMPLETA —lo que hace exacta la ida y vuelta de
nuestro propio export, incluidas las opciones "del sistema", que no tienen nombre
que buscar—, y después buscando el nombre de la familia dentro de la pila, que es
lo que entiende un `--font-sans: Poppins, sans-serif` pegado desde fuera. Un test
recorre el catálogo entero: dos pilas que se contienen la una a la otra
(`courier-new` aparece dentro de `system-mono`) se reconocerían cruzadas.

## 10. Modos de fallo

| Qué falla | Qué pasa |
|---|---|
| No hay tema activo | Se sirve `DEFAULT_THEME_TOKENS`. Es el estado de una instalación recién sembrada. |
| La base no responde al leer el tema activo | Último valor conocido si la caché lo tiene; si está fría, el servicio degrada al tema base. |
| Una fila `Json` está corrupta | El repositorio cae al tema base **para esa fila** y lo registra a nivel `error`. |
| El tema activo perdió su publicado | Se trata como "no hay tema activo". |
| Se pega un CSS que no es un tema | 400 con `THEME_CSS_NOT_PARSEABLE` y el borrador intacto. |
| Un `USER` entra a `/dashboard/personalizacion` | 403 real, que pinta `dashboard.boundary.tsx` conservando el shell. No ve el enlace en el sidebar. |

## 11. Advertencia de caché (sigue vigente)

**El loader raíz varía por cookie** — ahora por dos: `__theme_mode` y
`__theme_preview`. Sin `Vary: Cookie`, una caché compartida serviría el tema de
un usuario a otro, y en el peor caso el **borrador** de un admin a todo el mundo.

## 12. Mapa de archivos

| Archivo | Papel |
|---|---|
| `domain/theme.rules.ts` | Tupla de tokens, color math (OKLCH, contraste, derivar oscuro), escala de sombras, invariantes, esquemas valibot |
| `domain/theme.config.ts` | `DEFAULT_THEME_TOKENS`, `FONT_CATALOG`, `THEME_PRESETS`, TTL, versión del esquema |
| `domain/theme.mapper.ts` | `toCssTokenSet`, `themeCss`, `exportThemeCss`, `parseThemeCss`, JSON, `tokensEqual` |
| `domain/theme.errors.ts` | Seis códigos estables |
| `application/theme.service.server.ts` | Los once casos de uso + `resolve` / `setMode` |
| `infrastructure/theme.repository.server.ts` | Prisma; caída al tema base ante una fila ilegible |
| `infrastructure/theme.cache.server.ts` | Decorador con caché del tema activo |
| `routes/personalizacion/` | Loader, action y pantalla del builder |
| `components/color-field.tsx` | Picker OKLCH escrito a mano |
| `components/theme-token-panel.tsx` | Acordeones de edición con tabs Claro/Oscuro |
| `components/theme-preview-gallery.tsx` | Galería de componentes shadcn reales |
| `components/contrast-panel.tsx` | Ratios WCAG de la variante en edición |
| `components/theme-preview-bar.tsx` | Barra flotante del preview global |
| `hooks/use-theme-draft.ts` | Estado del borrador y `<style id="theme-draft">` |
| `app/core/cookies.server.ts` | `themePreviewCookie` |
| `app/app.css` | `@theme inline` que conecta los `--theme-*`, `@utility border`, catálogo de fuentes |
| `prisma/seed.ts` | Siembra de presets y de la fila de apariencia |
