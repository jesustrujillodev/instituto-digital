# Plan: cambiar sonner por Sileo

## Contexto

`checklist.md:16` pide cambiar los toasts de sonner por [Sileo](https://sileo.aaryan.design/docs/api). Además, la auditoría (`AUDITORIA-IMPECCABLE.md`, punto 14) marca los toasts como la única superficie que ignora los tokens del tema. Resultado buscado: todos los toasts pasan por Sileo, conservan su forma de píldora nativa y usan los colores de estado del tema publicado. sonner sale del proyecto.

## Hallazgos que condicionan el diseño

- **No hay CSS que importar**: el build de Sileo lleva `'use client'` e inyecta `styles.css` en `<head>` en tiempo de ejecución, con guarda para `document`. Es seguro con SSR.
- **La API recibe objetos, no strings**: `sileo.success({ title, description })`, además de `error`, `warning`, `info`, `action`, `show`, `promise`, `dismiss(id)` y `clear(position?)`. No existe un `toast()` neutro; `sileo.show` usa por defecto el estado success.
- **El título es una píldora de una sola línea**: 40px de alto, `white-space: nowrap`, 350px de ancho. Los mensajes largos deben ir en `description`, que se despliega al expandirse.
- **`[data-sileo-title]` aplica `text-transform: capitalize`**: "Revisa el campo marcado" se vería como "Revisa El Campo Marcado". Hay que neutralizarlo.
- **`Toaster`**:
  - Props: `position`, `offset`, `options` y `theme: "light" | "dark" | "system"`. Es el mismo tipo que `ThemeMode`, así que `mode` de `useThemeMode` encaja tal cual.
  - Con `theme`, el relleno se invierte a propósito: píldora `#1a1a1a` en modo claro y `#f2f2f2` en oscuro.
  - Se renderiza en línea, sin portal, y no necesita envolver a los hijos.
- **El viewport de Sileo usa `z-index: 50`**, igual que Sheet y Dialog, así que un toast lanzado desde `cloud-object-sheet.tsx` quedaría debajo del overlay.

## Cambios

### 1. Dependencias
- `bun remove sonner`.

### 2. Toaster: `app/shared/layout/routes/dashboard.layout.tsx`
- Cambiar `import { Toaster } from "sonner"` por `import { Toaster } from "sileo"`.
- Dejar `<Toaster theme={mode} position="top-center" options={{ styles: { title: "normal-case!" } }} />`. Si `normal-case!` no gana en especificidad, la regla va en el CSS del paso 3.
- Actualizar el comentario de las líneas 65-69: ya no es un portal de sonner, pero sigue necesitando el modo explícito para elegir el relleno.
- Se mantiene el alcance solo en el dashboard (comentario de las líneas 28-30).

### 3. Tokens: `app/app.css`
Un bloque sobre `[data-sileo-viewport]`. Las variables se heredan desde el viewport y ganan al `:root` que Sileo inyecta después, sin pelear por especificidad:
```css
[data-sileo-viewport] {
  --sileo-state-success: var(--success);
  --sileo-state-error: var(--destructive);
  --sileo-state-warning: var(--warning);
  --sileo-state-info: var(--primary);
  --sileo-state-action: var(--primary);
}
body [data-sileo-viewport] { z-index: 100; } /* por encima de Sheet y Dialog (z-50) */
[data-sileo-title] { text-transform: none; } /* solo si el paso 2 no alcanza */
```
**Riesgo de contraste**: la píldora va invertida respecto a la página, pero los tokens están pensados para el fondo de la página. Si el pase de `/impeccable` detecta contraste bajo, se toma solo el tono del token y se conserva la luminosidad de Sileo: `oklch(from var(--success) 0.72 c h)`.

### 4. Migrar las llamadas
Cambiar `import { toast } from "sonner"` por `import { sileo } from "sileo"`. Criterio: título corto que quepa en la píldora y el detalle variable en `description`.

| Archivo | Antes | Después |
|---|---|---|
| `app/shared/hooks/use-fetcher-toast.ts` | `toast.success(message)` / `toast.error(message)` | `sileo.success({ title: message })`. Error: `sileo.error({ title: "No se pudo completar", description: message })`, porque los mensajes de `localizeError` pueden ser largos ("Publica el tema antes: …"). |
| `users/components/user-form.tsx`, `inventory/components/vehicle-form.tsx` | `toast.error("Revisa los N campos…")` | `sileo.error({ title: "Formulario incompleto", description: … })` |
| `cloud/components/cloud-object-sheet.tsx` | `"Ruta copiada"` / `"No se pudo copiar la ruta"` | `sileo.success({ title: "Ruta copiada" })` / `sileo.error({ title: "No se pudo copiar la ruta" })` |
| `cloud/hooks/use-zip-download.ts` | `` `${fileName} descargado` ``, `toast("Descarga cancelada")`, `toast.error(...)` | `sileo.success({ title: "Descarga lista", description: fileName })`, `sileo.info({ title: "Descarga cancelada" })`, `sileo.error({ title: "La descarga falló", description: … })` |
| `inventory/components/sections/media-section.tsx`, `documents-section.tsx` | `toast.error(error.message)` | `sileo.error({ title: "Archivo rechazado", description: error.message })` |
| `theme/components/theme-toolbar.tsx` | `toast.success("CSS del tema copiado")` | `sileo.success({ title: "CSS del tema copiado" })` |

La interfaz pública de `useFetcherToast` no cambia, así que sus 8 consumidores no se tocan.

### 5. Documentación
- `docs/theme/00-modo-oscuro.md:168`: la fila "`Toaster` de sonner" pasa a Sileo. Explicar que recibe el modo para elegir el relleno invertido y que los colores de estado salen de los tokens.
- `checklist.md:16`: marcar la tarea como hecha.
- `AUDITORIA-IMPECCABLE.md`, punto 14: anotar que queda resuelto con este cambio.

### 6. UI (regla del proyecto)
- Correr `/impeccable` al empezar el paso 2 para revisar la dirección visual, y hacer un pase final de pulido: contraste de los tokens sobre la píldora en ambos modos, títulos en español sin capitalizar y descripciones legibles.

## Verificación
1. `grep -r "sonner" app package.json bun.lock` sin resultados.
2. `bun run typecheck` y `bunx biome check` limpios. `bun run test` (vitest) en verde: ningún test depende de sonner.
3. `bun run dev` y en el navegador, en modo claro y oscuro:
   - Crear y editar un usuario: toast de éxito con el título sin capitalizar.
   - Enviar un formulario de vehículo inválido: toast "Formulario incompleto" que al expandirse muestra la descripción.
   - En `/nube`, abrir el Sheet de un objeto y copiar la ruta: el toast queda por encima del overlay y responde a hover y clic.
   - Descargar un ZIP y cancelarlo: toast de info.
   - Subir un archivo rechazado en la ficha de un vehículo.
   - Cambiar el modo de tema con un toast visible: el relleno se invierte al vuelo.
4. Comparar los colores de estado con los tokens publicados en `/personalizacion`: al cambiar `--success` en el tema, el toast lo refleja.
