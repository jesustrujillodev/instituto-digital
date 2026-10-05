# ADR 0030 · Biblioteca de plantillas y logos institucionales inmutables

**Estado:** aceptado · 2026-10-02
**Extiende:** [ADR 0028](./0028-editor-libre-documento-v2.md)

## 1. Contexto

Con el editor libre, cada capacitación diseña su certificado. Hacía falta reutilizar
diseños entre capacitaciones, y que la plataforma administrara los logos (el único que
había era blanco y no se veía sobre fondos claros).

## 2. Decisiones

### 2.1 Biblioteca en dos niveles

`org.certificate_templates` guarda diseños v2 con alcance:

| Alcance | La ven | La administran |
| --- | --- | --- |
| `INSTITUTIONAL` | Todos los que administran cursos | SUPERADMIN |
| `DEPENDENCY` | Esa dependencia (y SUPERADMIN) | Titular y auxiliar de esa dependencia, y SUPERADMIN |

El capacitador interno las aplica, no las crea. Fuera de alcance responde 404. Las reglas
son puras (`certificate-template.access.ts`). Un CHECK de base asegura que `DEPENDENCY`
lleva dependencia y `INSTITUTIONAL` no.

### 2.2 Aplicar y guardar copian

- **Aplicar** una plantilla copia sus imágenes y su fondo a la carpeta del curso y
  devuelve el diseño reescrito, sin guardar: el editor lo recibe como cambio y se puede
  deshacer. Un certificado nunca apunta a la carpeta de una plantilla, así que archivarla o
  editarla no lo cambia.
- **Guardar como plantilla** quita las firmas (una plantilla no reparte la firma de un
  titular), verifica que cada recurso sea del propio curso antes de copiarlo y crea la
  plantilla con sus copias en `documentos/plantillas-certificado/<plantilla>/`.
- Copiar es leer y escribir (`getFile` + `uploadFile`): sirve igual con S3 y con GCS. Si la
  escritura en base falla después de copiar, quedan huérfanos que detecta el gestor de
  nube, la misma política que las firmas.
- Las subidas y las copias se nombran por la huella de sus bytes: repetir una subida o
  aplicar otra vez la misma plantilla reescribe el mismo objeto. La ventana de gracia de
  huérfanos es de 24 horas para cubrir una edición larga sin guardar, y guardar rechaza
  (`CERTIFICATE_ASSET_MISSING`) lo que el diseño estrena si ya no está en storage.

### 2.3 Logos inmutables

`org.institutional_logos`: reemplazar un logo crea otra fila que apunta a la anterior y la
archiva; no hay borrado. Un diseño nombra el logo por su `documentId`, así que lo emitido
sigue pintando el logo con el que se emitió. Uno archivado ya no se elige, pero un diseño
que ya lo tenía se puede seguir guardando. El logo blanco de siempre es una constante de
código (`BUILTIN_LOGOS`), sin fila ni storage. Los subidos viven en `media/logos/`
(público, CDN). Solo SUPERADMIN los administra.

### 2.4 Lo que imprime una emisión, en una columna

`certificate_issues.asset_refs` (índice GIN) guarda las referencias de storage que imprime
cada emisión y sus logos subidos como `logo:<id>`. La fuente de referencias bloquea el
borrado con esa columna en vez de leer todos los `design_snapshot`, que en v2 pesan decenas
de KB. `scripts/backfill-certificate-asset-refs.ts` la llena para lo emitido antes.

## 3. Consecuencias

- Esquema: `CertificateTemplate`, `CertificateTemplateScope`, `InstitutionalLogo` y
  `CertificateIssue.assetRefs`, aplicado con `prisma db push` (el repo no usa
  `prisma/migrations`, a diferencia de lo que describe AGENTS.md).
- CHECK manual:

  ```sql
  ALTER TABLE org.certificate_templates ADD CONSTRAINT certificate_templates_scope_coherence
    CHECK ((scope = 'INSTITUTIONAL' AND dependency_id IS NULL)
        OR (scope = 'DEPENDENCY' AND dependency_id IS NOT NULL));
  ```

- Cradle: `certificateTemplateRepository`, `certificateTemplateService`,
  `certificateLogoRepository`, `certificateLogoService` y dos fuentes de referencias más
  (`certificate-template`, `institutional-logo`).
- Rutas: `/dashboard/plantillas-de-certificado` (+ editor a pantalla completa) y
  `/dashboard/logos-institucionales`.
