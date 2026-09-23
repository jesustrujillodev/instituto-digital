# Emisión y descarga de certificados — Referencia

## 1. Qué es

Cada persona que **completa** un curso recibe un certificado con folio único. Se emite
en el mismo cálculo que otorga los créditos (`completionSync`), con el diseño
**publicado** del curso, y se descarga en PDF o PNG. Las decisiones de fondo están en
[ADR 0019](../adr/0019-snapshot-del-diseno-y-puerto-de-exportacion.md); el diseño, en
[01-editor.md](./01-editor.md); el renderizador, en [00-certificados.md](./00-certificados.md).

```
app/modules/certificates/
├── domain/
│   ├── certificate.exporter.ts          # puertos ICertificateExporter e ICertificateAssetSource
│   └── certificate.service.ts           # ICertificateIssuance (lo llama completionSync)
├── application/
│   ├── certificate-issuance.server.ts   # diff, folios y snapshots
│   └── certificates.service.server.ts   # downloadIssue, downloadSample
├── infrastructure/
│   ├── chromium-exporter.server.ts      # puppeteer-core + Chromium del sistema (D-01)
│   └── certificate-assets.server.ts     # fuentes, logo y firmas como data URIs
└── routes/
    ├── certificados/$documentId.descargar/     # GET, emisión
    └── cursos/$documentId.certificado.muestra/ # GET, muestra del editor
```

## 2. Modelo

| Tabla | Qué guarda |
| --- | --- |
| `org.certificate_issues` | Una fila por persona y curso (`@@unique([courseId, userId])`): `folio` único, `issued_at`, `design_snapshot`, `data_snapshot` y `revoked_at` |
| `org.certificate_folio_counter` | Una sola fila (`id = "folio"`) con el último `{seq}` usado |

- **`design_snapshot`** es el diseño publicado al emitir, o el de por defecto si nunca se
  publicó.
- **`data_snapshot`** es lo que se imprime: nombre, curso, descripción, dependencia, horas,
  fecha y folio, ya formateados.

Con los dos congelados, editar la plantilla, renombrar el curso o cambiar sus horas no
cambia un certificado ya emitido.

## 3. Cuándo se emite

`completionSync.sync` recalcula quién completó, sincroniza los créditos y, en el mismo paso y
la misma transacción, llama a `certificateIssuance.sync` con **todos** los que completaron.
Los externos también reciben el suyo; el crédito sigue siendo solo de internos con
dependencia.

| Hecho | Qué pasa |
| --- | --- |
| Finalizar un curso con sesiones | Se emite a quien completó; el aviso dice cuántos |
| Completar un autogestivo (última lección, examen) | Se emite en ese momento |
| Corrección que deja a alguien sin completar | Crédito y certificado se revocan (`revoked_at`) |
| Corrección que lo devuelve | Se restauran, **con el mismo folio** |
| Volver a sincronizar sin cambios | Nada: el diff es vacío |

«Emitir certificados», en la pestaña Completado de la impartición, cubre lo completado
**antes** de F-09. Solo aparece si hay pendientes y pide el mismo permiso que corregir: en un
finalizado, el titular o un auxiliar de la dependencia. En un curso por impartir responde
`TEACHING_CERTIFICATES_NOT_ISSUABLE`.

## 4. Folio

- `{seq}` es **global y nunca se reinicia**. `reserveFolios(n)` hace un
  `UPDATE … value + n` sobre la fila del contador: bloquea hasta el fin de la transacción,
  así que dos emisiones a la vez no reciben el mismo número. Un rollback devuelve los
  números.
- `{year}` y `{month}` son los del momento de emitir, en la zona del instituto
  (`folioPartsOf`).
- El formato **debe incluir `{seq}`**, porque sin él todos los folios del curso serían
  iguales. Un diseño sin `{seq}` no se guarda.
- `folio` es `@unique`: la base es la última defensa.

## 5. Descarga

| Ruta | Quién | Qué dibuja |
| --- | --- | --- |
| `GET /dashboard/certificados/:documentId/descargar?formato=pdf\|png` | Quien ve el curso en impartición (`teachingCourseWhere`) | Los snapshots de la emisión |
| `GET /dashboard/cursos/:documentId/certificado/muestra?version=draft\|published&formato=pdf\|png` | Quien administra el curso | El diseño **guardado**, con datos de muestra |

La petición solo lleva identificador, versión y formato. **El diseño nunca viaja desde el
navegador**: el esquema de frontera ni siquiera conserva otros campos, y hay una prueba de
que un diseño en la query se ignora.

En la pantalla, `useFileDownload` pide el archivo con `fetch`. Si falla, enseña la copia del
error en un toast, cosa que un `<a download>` no puede hacer.

| Rechazo | Código | Status |
| --- | --- | --- |
| Emisión inexistente o de un curso fuera de alcance | `CERTIFICATE_ISSUE_NOT_FOUND` | 404 |
| Emisión revocada | `CERTIFICATE_ISSUE_REVOKED` | 409 |
| Muestra «publicada» de un certificado sin publicar | `CERTIFICATE_NEVER_PUBLISHED` | 409 |
| Formato o versión desconocidos | Validación de frontera | 400 |
| Sin `CHROMIUM_PATH` | `CERTIFICATE_EXPORT_UNAVAILABLE` | 503 |
| Chromium no terminó, o una firma no se pudo leer | `CERTIFICATE_EXPORT_FAILED` | 502 |

## 6. Exportación

1. `certificateAssetSource.load(firmas)`:
   - Lee la ITC Avant Garde (`.woff2`) y el logo de `public/`, o de `build/client/` dentro
     de la imagen. Los tiene en memoria mientras vive el proceso.
   - Lee cada firma **activa** del bucket con `storageProvider.getFile`. Solo acepta keys
     bajo `documentos/firmas/`.
2. `renderCertificateDocument(design, data, { assets })` produce un HTML **autocontenido**:
   fuentes, logo y firmas van como data URIs.
3. `certificateExporter.export(html, formato)`:
   - Abre una página del Chromium del proceso, que se lanza la primera vez y se reabre si
     se cae.
   - Máximo dos páginas a la vez.
   - La página corre **sin JavaScript** y aborta toda petición que no sea `data:`.
   - Espera a `document.fonts.ready` antes de capturar.
   - PDF de 1100×780 px en una página, o PNG al doble (2200×1560).

Una firma que no se puede leer detiene la exportación: nunca sale un certificado sin una de
sus firmas.

## 7. Firmas y gestor de nube

La fuente de referencias de firmas cuenta también las que imprimen los snapshots emitidos
(«Firma de certificados emitidos»), así que nunca aparecen como huérfanas. Borrar una desde
el gestor de nube responde `STORAGE_OBJECT_LOCKED` y no borra nada: un snapshot emitido no se
reescribe.

## 8. Configuración

| Variable | Uso |
| --- | --- |
| `CHROMIUM_PATH` | Ejecutable de Chromium o Chrome. Sin ella no hay descarga. La imagen de Docker trae `/usr/bin/chromium-browser` |
| `CHROMIUM_NO_SANDBOX` | `true` solo dentro del contenedor, que corre como `node` sin privilegios para el sandbox |

En desarrollo basta con apuntar `CHROMIUM_PATH` al Chrome instalado (ver `.env.example`).
`vite.config.ts` excluye `puppeteer-core` del preempaquetado: el escaneo de dependencias
recorre los `.server` y fallaría con `yargs`.
