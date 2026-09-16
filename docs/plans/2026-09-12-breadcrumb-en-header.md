# Breadcrumb en el header del dashboard

> **Nota (2026-09-15).** Plan histórico. Las rutas de `modules/inventory` que
> aparecen como ejemplo ya no existen: ese módulo se eliminó al reconvertir el
> repo en el Instituto Digital de Capacitación. El mecanismo de breadcrumb que
> describe sigue vigente.

## Contexto

Hoy cada pantalla del dashboard pinta su propio `<Breadcrumb>`
(`app/shared/components/common/breadcrumb.tsx`) debajo del `PageHeader`. Son 9
pantallas en 4 módulos, y cada una repite el crumb padre y su `LIST_PATH`. El
breadcrumb se mueve al `<header>` de
`app/shared/layout/routes/dashboard.layout.tsx`, junto al `SidebarTrigger`. Así
las rutas solo **declaran** su rastro y el layout lo **pinta**.

### Decisiones tomadas (con el usuario)

1. **Mecanismo:** cada ruta exporta `export const handle = { breadcrumb }` y el
   layout lo lee con `useMatches()`. Es el patrón nativo de React Router, funciona
   en SSR y no necesita estado ni portal.
2. **Edición:** el último crumb muestra el nombre de la entidad, como hoy, sacado
   de los datos del loader.
3. **Componente visual:** se reutiliza `common/breadcrumb.tsx`, adaptado al
   header. No se usan las primitivas de `ui/breadcrumb.tsx`.
4. **Raíz:** en `/dashboard` no hay breadcrumb. En las subpáginas se mantiene el
   enlace raíz "Dashboard" que ya incluye el componente.

### Hechos que condicionan el diseño

- **Las rutas son planas.** `usuarios`, `usuarios/nuevo` y
  `usuarios/:documentId/editar` son hermanas bajo `prefix("dashboard")`.
  `useMatches()` devuelve `[root, dashboard-layout, boundary, hoja]`, así que la
  **hoja declara el rastro completo**, padre incluido. No se concatenan crumbs de
  varios matches.
- **`loaderData` puede llegar `undefined`.** En React Router 7.12 se usa
  `UIMatch.loaderData` (`data` está deprecado). Vale `undefined` cuando el loader
  lanza y se muestra el `ErrorBoundary` de `dashboard.boundary.tsx`. El header
  sigue montado en ese caso, porque el boundary vive debajo del shell. Por eso la
  función del handle **tiene que aceptar `undefined`**.
- **El espaciado va a cambiar.** `PageHeader` es `sticky top-0 ... py-4` y el
  breadcrumb actual lleva `mb-6`. Al quitarlo de la página cambia el espacio
  entre cabecera y contenido, y hay que revisarlo en el navegador.
- **El separador se estira por defecto.** `ui/separator.tsx` aplica
  `data-vertical:self-stretch`. En un header `items-center` de `h-16` ocuparía
  todo el alto, así que hace falta acotarlo (ver §2).

## Cambios

### 0. Persistir el plan

✅ Hecho: el plan ya está copiado en `docs/plans/2026-09-12-breadcrumb-en-header.md`.
Si este plan cambia antes de implementarlo, hay que sincronizar esa copia.
Todavía no se ha tocado ningún archivo de código.

### 1. Tipo del handle y resolución (shared/layout)

**Nuevo `app/shared/layout/breadcrumb.types.ts`**

```ts
import type { BreadcrumbItem } from "@/shared/components/common/breadcrumb";

/** Lo que exporta una ruta en `handle` para pintar su rastro en el header. */
export interface BreadcrumbHandle<TLoaderData = unknown> {
  /** Rastro completo SIN la raíz "Dashboard" (la pone el componente).
   *  `loaderData` es `undefined` si el loader lanzó y se ve el ErrorBoundary. */
  breadcrumb: (loaderData: TLoaderData | undefined) => BreadcrumbItem[];
}
```

**Nuevo `app/shared/layout/breadcrumb.utils.ts`**: función pura
`resolveBreadcrumb(matches: UIMatch[]): BreadcrumbItem[]`.
- Recorre los matches **desde el final** y se queda con el primero cuyo `handle`
  tenga una función `breadcrumb`. La llama con `match.loaderData`.
- Si no encuentra ninguno, devuelve `[]`. Así `/dashboard` no necesita un caso
  especial.
- Comprueba `handle: unknown` con un type guard en lugar de hacer un cast ciego.
- Sigue el patrón de `navigation.utils.ts`: función pura que solo importa tipos,
  testeable de forma aislada.

**Nuevo test `app/shared/layout/__tests__/breadcrumb.utils.test.ts`** (vitest,
no `bun:test`). Casos:
- sin handles → `[]`
- la hoja gana sobre un handle de un ancestro
- se pasa `loaderData` a la función
- con `loaderData` `undefined`, la función recibe `undefined`
- se ignora un `handle` sin `breadcrumb` o con otra forma

### 2. Componente del header

**Nuevo `app/shared/layout/components/dashboard-breadcrumb.tsx`**
- Calcula `const items = resolveBreadcrumb(useMatches())` y devuelve `null` si
  `items.length === 0`.
- Si hay items, pinta primero
  `<Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />`
  y después `<Breadcrumb items={items} className="min-w-0 flex-1" />`.
- El separador va dentro del componente para que no quede suelto en
  `/dashboard`.

**`app/shared/components/common/breadcrumb.tsx`**: se adapta para ocupar una sola
línea en el header.
- Quitar `mb-6` del contenedor; ahora su único consumidor es el header.
- Cambiar `flex-wrap` por `flex-nowrap` en el `div` y en el `ol`. Con altura fija
  el salto de línea desbordaría. El último item ya trunca con
  `min-w-0 flex-1 truncate`.
- Sin cambios en la API (`items`, `className`, `maxLabelLength`) ni en el tipo
  `BreadcrumbItem`.

**`app/shared/layout/routes/dashboard.layout.tsx`**: dentro del `<header>`,
añadir `<DashboardBreadcrumb />` justo después de
`<SidebarTrigger className="-ml-1" />`.

### 3. Rutas: de `<Breadcrumb>` a `handle`

Patrón para cada pantalla:
- Quitar el JSX `<Breadcrumb …/>` y su import.
- Añadir `export const handle = { breadcrumb: … } satisfies BreadcrumbHandle<…>`,
  colocado **después** de `const LIST_PATH` en las pantallas que lo tienen.
- Las pantallas de edición usan el genérico `Route.ComponentProps["loaderData"]`.
  Las demás usan `BreadcrumbHandle` sin genérico y no leen el argumento.

| Ruta | Rastro |
|---|---|
| `modules/users/routes/usuarios/index.tsx` | `Usuarios` |
| `modules/users/routes/usuarios/nuevo/index.tsx` | `Usuarios›` → `Nuevo usuario` |
| `modules/users/routes/usuarios/$documentId.editar/index.tsx` | `Usuarios›` → `fullNameOf(user) \|\| user.email` |
| `modules/inventory/routes/inventario/index.tsx` | `Inventario` |
| `modules/inventory/routes/inventario/nuevo/index.tsx` | `Inventario›` → `Nuevo vehículo` |
| `modules/inventory/routes/inventario/catalogos/index.tsx` | `Inventario›` → `Catálogos` |
| `modules/inventory/routes/inventario/$documentId.editar/index.tsx` | `Inventario›` → `vehicleTitle(vehicle)` |
| `modules/auth/routes/sesiones/index.tsx` | `Sesiones` |
| `modules/theme/routes/personalizacion/index.tsx` | `Personalización` |

(`X›` indica un enlace a `LIST_PATH`.)

Ejemplo de edición. Si no hay datos porque el loader falló, se usa una etiqueta
genérica:

```ts
export const handle = {
  breadcrumb: (loaderData) => [
    { label: "Usuarios", path: LIST_PATH },
    {
      label: loaderData
        ? fullNameOf(loaderData.data.user) || loaderData.data.user.email
        : "Editar usuario",
    },
  ],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;
```

- Se reutilizan `fullNameOf` (`modules/users/utils/to-user-rows.ts`) y
  `vehicleTitle` (`modules/inventory/utils/to-vehicle-rows.ts`). Ambas ya están
  importadas en esas pantallas.
- `displayName` y `title` se quedan en los componentes de edición porque
  `PageHeader` los sigue usando.
- En inventario el fallback es `"Editar vehículo"`.

### 4. Limpieza

- `rg "common/breadcrumb" app/modules` debe devolver 0 resultados. Los únicos
  imports que quedan están en `dashboard-breadcrumb.tsx` y
  `breadcrumb.types.ts`.
- Revisar el espaciado de cada pantalla sin el `mb-6`. Si el contenido queda
  pegado al `PageHeader`, corregirlo con `gap-*` en el contenedor de la página,
  no devolviendo el margen al breadcrumb.

## Verificación

1. `bun run typecheck` (`react-router typegen` + `tsc`): confirma que
   `satisfies BreadcrumbHandle<…>` tipa bien `loaderData`.
2. `bun run test`: el test nuevo y la suite existente de `shared/layout`.
3. `bun run lint` (Biome).
4. Revisión manual en el navegador con un usuario ADMIN:
   - `/dashboard`: el header muestra solo el trigger, sin separador.
   - `/dashboard/usuarios`, `/nuevo` y `/:id/editar`: el rastro es correcto,
     "Usuarios" enlaza a la lista y el nombre aparece en el último crumb.
   - Mismo recorrido en inventario (listado, nuevo, editar, catálogos), sesiones
     y personalización.
   - Con un `:documentId` inexistente, el ErrorBoundary se pinta dentro del shell
     y el header muestra `Usuarios › Editar usuario` sin romperse.
   - Con un nombre largo o una pantalla estrecha, el último crumb trunca en una
     línea y el header no crece.
   - Tras una recarga dura (SSR) en edición, el breadcrumb aparece en el primer
     render, sin parpadeo.
