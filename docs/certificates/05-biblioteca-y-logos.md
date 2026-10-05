# Biblioteca de plantillas y logos institucionales — Referencia

Las decisiones están en [ADR 0030](../adr/0030-biblioteca-de-plantillas-y-logos.md).

## 1. Biblioteca

| Ruta | Quién | Qué |
| --- | --- | --- |
| `/dashboard/plantillas-de-certificado` | Quien administra cursos | Las institucionales y las de su dependencia; crear, archivar y restaurar las propias |
| `/dashboard/plantillas-de-certificado/:id/editor` | Igual | El editor libre a pantalla completa, sin publicar; de solo lectura si no la administra |
| «Plantillas» en el editor del curso | Quien edita el certificado | Diseños de partida y biblioteca; aplicar es un cambio que se puede deshacer |
| «Guardar como plantilla» en el editor del curso | SUPERADMIN, titular y auxiliar | Guarda lo que está en pantalla, sin firmas |

| Rechazo | Código | Status |
| --- | --- | --- |
| Plantilla inexistente, ajena o archivada al aplicar | `CERTIFICATE_TEMPLATE_NOT_FOUND` | 404 |
| La ve pero no la administra, o no puede crear | `CERTIFICATE_FORBIDDEN` | 403 |
| El diseño trae recursos de otra carpeta | `CERTIFICATE_ASSET_NOT_OWNED` | 400 |
| Un recurso que estrena o copia ya no está en storage | `CERTIFICATE_ASSET_MISSING` | 400 |
| Logo inexistente o archivado en una plantilla | `CERTIFICATE_LOGO_NOT_FOUND` / `_ARCHIVED` | 400 |

- Una plantilla nueva nace con el diseño institucional en el alcance de quien la crea:
  institucional para SUPERADMIN, de su dependencia para titular y auxiliar.
- Aplicar copia sus recursos a `documentos/certificados/<curso>/`; guardar como plantilla
  copia los del curso a `documentos/plantillas-certificado/<plantilla>/`. La copia lleva
  la huella de los bytes en el nombre: aplicar dos veces la misma plantilla no duplica.
- La fuente de referencias `certificate-template` nombra esas carpetas con el nombre de la
  plantilla; soltar una imagen la quita del diseño de la plantilla.

## 2. Logos institucionales

`/dashboard/logos-institucionales`, solo SUPERADMIN.

| Acción | Qué hace |
| --- | --- |
| Subir | PNG, WEBP o SVG ≤ 2 MB a `media/logos/`, con sus medidas |
| Reemplazar | Fila nueva con el mismo nombre; la anterior se archiva |
| Archivar / restaurar | Deja de ofrecerse en el editor; lo emitido lo sigue pintando |

- No hay borrado: el gestor de nube responde `STORAGE_OBJECT_LOCKED` sobre un logo con fila.
- El «Logo blanco» (`ayto-blanco`) es del código y no se archiva.
- Rechazos: `CERTIFICATE_LOGO_INVALID` (con el motivo), `CERTIFICATE_LOGO_NOT_FOUND`,
  `CERTIFICATE_FORBIDDEN`.

## 3. Lo que imprime una emisión

`certificate_issues.asset_refs` se llena al emitir con lo que el certificado imprime: las
referencias de sus imágenes, firmas y fondo, y `logo:<id>` por cada logo subido. Con eso el
gestor de nube bloquea su borrado sin leer los snapshots. Para emisiones anteriores:

```bash
bun scripts/backfill-certificate-asset-refs.ts
```

Es idempotente: solo escribe las filas que cambian.
