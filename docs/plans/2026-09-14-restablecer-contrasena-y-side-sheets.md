# Restablecer contraseña, botones al pie y side sheets con acciones

Fecha: 2026-09-14 · Rama: `dev`

## Obligatorio: impeccable

- Al inicio: `/impeccable distill` sobre el flujo de restablecer contraseña (hecho
  en la sesión que escribió este plan: contexto cargado con `context.mjs`,
  PRODUCT.md vigente, sin DESIGN.md → se usa la implementación como referencia).
- Al final: `/impeccable polish` + `detect.mjs --json` sobre los archivos de UI
  tocados. Sin slop: nada de kickers, tarjetas anidadas ni modales innecesarios.

## Decisiones tomadas con el usuario

1. **Diálogo compartido** `ResetPasswordDialog`, que se abre desde la acción de
   fila de la tabla, desde el side sheet y desde "Editar usuario". En la edición
   la tarjeta inline desaparece y queda una fila "Contraseña · Restablecer…"
   dentro de la tarjeta **Acceso** (patrón Google Workspace / GitHub admin). La
   pantalla de edición queda con un solo formulario.
2. **Un solo campo** con mostrar/ocultar y generador. Se elimina
   `confirmPassword` de `adminResetPasswordRule` (y de sus ids y tests). Tras el
   éxito, el diálogo muestra la contraseña asignada con botón **Copiar**: quien
   administra tiene que entregarla.
3. **Cerrar sesiones** del usuario al restablecer. Se reutiliza
   `sessionMonitorService.revokeAllForUser(userId)`. Excepción: si el admin se
   restablece a sí mismo no se revocan (lo sacaría de su propia sesión).
   Best-effort, igual que la foto: si la revocación falla, la contraseña ya
   cambió y se avisa en el mensaje.
4. **Botones Cancelar/Guardar al pie** en: Editar usuario, Nuevo usuario y
   Editar vehículo (Nuevo vehículo ya los tiene).

## Decisiones de diseño propias

- **Ancho del side sheet**: la base de `sheet.tsx` pasa, para `side="right"`,
  de `w-3/4 sm:max-w-sm` (384px) a `w-full sm:max-w-lg` (512px). Motivo técnico:
  las clases base llevan el variante `data-[side=right]:`, que tiene más
  especificidad que un `sm:max-w-md` suelto; por eso los overrides de
  `catalog-form-sheet` (`sm:max-w-md`) y `cloud-orphans-sheet` (`sm:max-w-lg`)
  nunca aplicaban. Se retiran esos overrides muertos. El sidebar móvil fija su
  propio ancho con `w-(--sidebar-width)` y no se ve afectado (es más estrecho
  que el máximo).
- **Acciones en el sheet** = las mismas `DataTableAction` de la fila salvo
  "Ver detalles". Componente compartido `SheetRowActions<T>`
  (`app/shared/components/common/sheet-row-actions.tsx`) que respeta `show`,
  `disabled`, `getIcon` y `variant`. La primera acción es la principal (botón
  lleno, ancho completo); el resto, outline en dos columnas; `danger` usa la
  variante destructiva. Cada ruta define `rowActions` (sin ver) y la tabla recibe
  `[view, ...rowActions]`, así que tabla y sheet no pueden divergir.
- **El sheet sigue al dato**: las rutas guardan el `documentId` abierto y derivan
  la fila de `rows`. Archivar desde el sheet actualiza sus insignias al
  revalidar; si la fila desaparece (borrado), el sheet se cierra solo.
- **Nube**: su sheet ya tiene Descargar/Eliminar, que coinciden con sus acciones
  de fila (sin contar Abrir/Ver detalles). Solo gana el ancho.
- **Catálogos**: su sheet es un formulario de alta/edición, no un detalle. Solo
  gana el ancho.
- **Usuarios, borrado definitivo**: `window.confirm` → `ConfirmDialog`, igual que
  Inventario (el sheet ahora expone el borrado).
- `VehicleFormActions` se generaliza a `FormActions`
  (`app/shared/components/common/form-actions.tsx`) y lo usan usuarios y
  vehículos.

## Cambios por archivo

### Servidor
- `app/modules/users/domain/user.rules.ts`: `adminResetPasswordRule` =
  `v.object({ newPassword: atoms.newPassword })`.
- `app/modules/users/domain/user.service.ts` + `application/users.service.server.ts`:
  `resetPassword` devuelve `UserResponse` (el usuario) para que el action tenga
  el `id` numérico; lanza `UserNotFoundError` si no existe.
- `app/modules/users/routes/usuarios/$documentId.editar/index.action.ts`: tras el
  reset, `revokeAllForUser(user.id)` salvo que `user.documentId === auth.sub`.
  Mensajes: "Contraseña restablecida. Se cerraron sus sesiones abiertas." / "…
  pero no se pudieron cerrar sus sesiones." / "Contraseña restablecida" (propia).
- Tests vitest: `user.rules.test.ts`, `user.validators.test.ts`,
  `users.service.server.test.ts`, `$documentId.editar/__tests__/index.action.test.ts`.

### UI
- `app/modules/users/components/reset-password-dialog.tsx` (nuevo): usa su
  propio `useFetcher` montado solo mientras el diálogo está abierto (sus datos
  se descartan al cerrar), envía a `/dashboard/usuarios/:documentId/editar` con
  `intent=reset-password`. Error del servidor inline; éxito → vista con la
  contraseña y Copiar.
- `app/modules/users/components/reset-password-form.tsx`: se elimina.
- `app/modules/users/hooks/use-user-form-ids.ts`: ids del reset solo `newPassword`.
- `app/modules/users/components/user-form.tsx`: prop `onResetPassword`; en
  edición pinta la fila "Contraseña" en la tarjeta Acceso.
- `app/modules/users/routes/usuarios/$documentId.editar/index.tsx` y
  `nuevo/index.tsx`: `FormActions` en cabecera y pie.
- `app/modules/users/routes/usuarios/index.tsx`: acción "Restablecer contraseña",
  `rowActions`, sheet derivado de `rows`, `ConfirmDialog`.
- `app/modules/users/components/user-details-sheet.tsx` y
  `app/modules/inventory/components/vehicle-details-sheet.tsx`: prop `actions`
  → `SheetRowActions` en el pie (sustituye "Abrir ficha completa").
- `app/modules/inventory/routes/inventario/index.tsx`: `rowActions`, sheet derivado.
- `app/modules/inventory/routes/inventario/$documentId.editar/index.tsx`:
  `FormActions` en cabecera y pie. `nuevo/index.tsx`: import de `FormActions`.
- `app/shared/components/ui/sheet.tsx`, `catalog-form-sheet.tsx`,
  `cloud-orphans-sheet.tsx`: ancho.

## Verificación

- `bun run typecheck`, `bun run test` (users + auth), `bun run lint` si existe.
- `detect.mjs --json` sobre los archivos de UI tocados y pase de polish.
