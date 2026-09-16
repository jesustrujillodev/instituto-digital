# Tema activo resiliente a la caída de la base

**Estado:** implementado · 2026-09-12 — capas 1 y 2 aprobadas. Suite vitest completa en verde (2146 pruebas) con cobertura sobre los umbrales. La capa 1 se verificó con el dev server apuntando a una base inalcanzable: sirvió el tema del snapshot. En la capa 2 se verificó que el servidor emite el script en `fallback`; **falta la prueba en navegador** (que pinte el tema guardado y que la hidratación no se queje del `<style>` insertado).

**Desviaciones respecto al diseño:** el navegador guarda **CSS por modo** con una huella (`themeFingerprint`), no tokens, porque el script inline corre antes de hidratar y no puede serializar. Además, `Layout` sin datos del loader (el middleware lanzó) también cuenta como `fallback`.
**Origen:** petición directa — *"si no hay internet o se pierde la conexión a la bdd, toda la plataforma vuelve al tema por defecto; siempre debe mostrar el último tema activo"*.

## Contexto: qué pasa hoy

El tema activo se resuelve en **cada** petición desde el loader raíz
(`app/root.tsx:79-107`) → `themeService.resolve`
(`app/modules/theme/application/theme.service.server.ts:44-94`) →
`themeRepository.findActiveTheme`, decorado con la caché de proceso
`app/modules/theme/infrastructure/theme.cache.server.ts`.

Esa caché **ya** sirve el último valor conocido si la base falla… pero solo
mientras el proceso lo tenga en memoria (`theme.cache.server.ts:76-88`). En frío
relanza el error y el servicio degrada a `DEFAULT_THEME_TOKENS`
(`theme.service.server.ts:84-90`). Casos en los que la plataforma pierde el tema:

| # | Escenario | Hoy |
|---|---|---|
| 1 | Proceso caliente, la base se cae | ✅ sirve el último conocido (memoria) |
| 2 | **Reinicio / deploy / nuevo nodo con la base caída** | ❌ tema base |
| 3 | **Dev: HMR re-evalúa `container.server.ts`** (se pierde la memoria) con la base caída | ❌ tema base |
| 4 | Varios nodos: uno que nunca leyó el tema arranca con la base caída | ❌ tema base |
| 5 | Contenedor efímero recién creado (sin disco previo) con la base caída | ❌ tema base |
| 6 | El navegador del usuario no tiene internet | La página no llega en absoluto — no es un problema de tema (fuera de alcance: requeriría PWA/service worker) |

La decisión documentada en `docs/theme/01-theme-builder.md` §4.1 y
`docs/theme/00-modo-oscuro.md` §6 era *"degradar al tema base"*. Este plan la
cambia: **degradar al último tema activo conocido; el tema base solo si nunca se
conoció ninguno.**

## Diseño

### Capa 1 — Snapshot en disco del servidor (cubre 2, 3 y parte de 4)

Nuevo puerto `IActiveThemeSnapshot` en `domain/theme.repository.ts`:

```ts
interface IActiveThemeSnapshot {
  /** undefined = no hay snapshot; null = se sabe que no hay tema activo. */
  read(): Promise<ActiveTheme | null | undefined>;
  write(theme: ActiveTheme | null): Promise<void>;
}
```

Adaptador `infrastructure/theme.snapshot.server.ts` (archivo JSON):

- Ruta configurable `THEME_SNAPSHOT_PATH` en `app/core/env.server.ts`, por
  defecto `.cache/theme/active-theme.json` (añadir `/.cache/` a `.gitignore`).
  En Docker se monta un volumen si se quiere que sobreviva a un redeploy.
- Escritura **atómica**: `tmp` + `rename`, para que un corte a mitad no deje un
  JSON truncado.
- Lectura **desconfiada**: el contenido pasa por `toThemeTokens` (mismo
  validador que la columna `Json`). Snapshot ilegible ⇒ `undefined` + log, nunca
  lanza.
- Formato versionado `{ v: 1, savedAt, theme }` para poder cambiarlo sin romper.

Cambios en `theme.cache.server.ts` (recibe `snapshot` como dependencia):

- Lectura fresca con éxito ⇒ si difiere de lo último escrito (`tokensEqual` +
  `documentId`), `snapshot.write(fresh)` **sin bloquear** la respuesta (error ⇒
  log `warn`, no se propaga).
- Fallo en frío ⇒ `snapshot.read()`. Si hay valor (incluido `null` legítimo) se
  sirve, se loguea `error` con `source: "snapshot"`, y se cachea con un TTL corto
  de reintento (p. ej. 5 s) para no martillar la base caída en cada petición.
  Si no hay snapshot, se relanza como hoy.
- Se precarga el snapshot al construir el decorador (lectura perezosa en la
  primera petición, no en el import — el import no puede fallar).

Registro en `app/shared/di/container.server.ts:90-94`.

### Capa 2 — Último tema en el navegador (cubre 4 y 5)

Si el nodo no tiene snapshot (contenedor nuevo, otro nodo), el servidor no puede
saber el tema. El navegador de quien ya visitó la plataforma sí.

- `ResolvedTheme` (`domain/theme.types.ts:114`) gana
  `origin: "active" | "preview" | "fallback"`. `fallback` = el servidor no
  conoce el tema activo (ni base ni snapshot) y sirve el base.
- `Layout` (`app/root.tsx:109-147`):
  - `origin === "active"` ⇒ efecto que guarda los **tokens** (no el CSS) en
    `localStorage` bajo `theme:last-active`. Los preview **nunca** se guardan.
  - `origin === "fallback"` ⇒ script inline mínimo en `<head>`, justo después del
    `<style>`, que lee `theme:last-active` y añade un `<style id="theme-last-known">`
    antes del primer pintado. El CSS lo genera la misma `serializeThemeCss`
    (inyectada serializada en el script), con el modo que ya resolvió el
    servidor desde la cookie — no hay segunda implementación.
  - Cuando llegue una respuesta `active`, el efecto elimina `#theme-last-known`.
- Seguridad: lo leído de `localStorage` se valida contra la misma allowlist de
  `serializeThemeCss` antes de inyectarse; se asigna con `textContent`, nunca
  `innerHTML`.

**Coste de esta capa:** introduce un script bloqueante en `<head>`, que
`theme.rules.ts:890-892` evitó a propósito. Solo se emite en modo `fallback`
(es decir, nunca en operación normal).

### Fuera de alcance

- Navegador sin internet (escenario 6).
- Loader raíz que no llega a correr porque el **middleware** lanza (403 CSRF): el
  `Layout` sigue cayendo a `DEFAULT_THEME_TOKENS` (`root.tsx:115-119`). La capa 2
  lo cubriría si se decide tratar ese caso también como `fallback`.

## Pruebas (vitest)

- `infrastructure/__tests__/theme.snapshot.server.test.ts`: ida y vuelta, archivo
  inexistente ⇒ `undefined`, JSON corrupto / tokens inválidos ⇒ `undefined` sin
  lanzar, `null` legítimo se conserva, escritura atómica.
- `theme.cache.server.test.ts`: reemplazar *"propagates a cold failure"* por
  *"fallo en frío sirve el snapshot"* + *"sin snapshot sigue propagando"*;
  escribe el snapshot solo cuando cambia; un fallo al escribir no rompe la
  lectura.
- `theme.service.server.test.ts`: `origin` correcto en los tres casos.
- Capa 2: prueba de la función pura que valida lo guardado y genera el CSS.

## Documentación

- `docs/theme/01-theme-builder.md` §4.1 y `docs/theme/00-modo-oscuro.md` §6:
  nueva tabla de modos de fallo.
- `.env.example`: `THEME_SNAPSHOT_PATH`.

## Orden

1. Capa 1 + pruebas → `bun run typecheck`, biome, vitest.
2. Verificación manual: activar un tema, parar Postgres, reiniciar el dev server
   ⇒ se sigue viendo el tema.
3. Capa 2 + pruebas (si se aprueba).
4. Docs.
