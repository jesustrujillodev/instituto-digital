# Editor de certificados — Referencia

## 1. Qué es

`/dashboard/cursos/:documentId/certificado` es la pantalla donde quien administra un
curso diseña su certificado, lo guarda y lo publica. La emisión usa el diseño
**publicado** ([02-emision.md](./02-emision.md)). Se entra desde el botón «Certificado» de la ficha del curso, que aparece
en todo estado menos cancelado. Las decisiones de fondo están en
[ADR 0018](../adr/0018-diseno-del-certificado-borrador-y-publicado.md); el renderizador,
en [00-certificados.md](./00-certificados.md).

```
app/modules/certificates/
├── domain/          # reglas, mapper, puertos, errores (+ el renderizador de F-07)
├── application/     # certificates.service.server.ts
├── infrastructure/  # repositorio y fuente de referencias de firmas
├── routes/          # cursos/$documentId.certificado (loader, action, pantalla)
├── components/      # vista previa y los cuatro paneles
├── hooks/           # use-certificate-draft
└── utils/           # intents, mensajes, etiquetas, reescalado de firma
```

## 2. Modelo

| Tabla | Qué guarda |
| --- | --- |
| `org.course_certificates` | Una fila por curso, con `draft_design`, `published_design` (nulo hasta publicar), `published_at`, `is_downloadable` y `email_message` (estos dos para F-11) |

La fila nace al primer guardado. Los dos blobs se leen con `toCertificateDesign`: uno
que no valida cae a `DEFAULT_CERTIFICATE_DESIGN` y queda en el log.

## 3. Quién y cuándo

| Actor | Resultado |
| --- | --- |
| Participante, o capacitador externo | 403 (`requireCourseScope`) |
| Titular o auxiliar de otra dependencia | 404, igual que un curso inexistente |
| Titular o auxiliar de la dependencia organizadora | Edita |
| Capacitador interno que **creó** el curso | Edita |
| Capacitador asignado que no lo creó | 404 |

| Estado del curso | Certificado |
| --- | --- |
| Borrador, publicado o finalizado | Se edita, guarda y publica |
| Cancelado | Solo lectura (`CERTIFICATE_NOT_EDITABLE`) |

## 4. Guardar, publicar, descartar

| Acción | Qué hace | Lleva diseño |
| --- | --- | --- |
| Guardar (`save-draft`) | Valida con `certificateDesignSchema`, comprueba las firmas y escribe el borrador | Sí |
| Publicar (`publish`) | Copia el borrador **guardado** al publicado y sella `published_at` | No |
| Descartar (`discard`) | El borrador vuelve a ser el publicado | No |
| Subir firma (`upload-signature`) | Sube la imagen y devuelve su referencia; no toca la base | El archivo |

La cabecera enseña «Sin publicar», «Publicado» o «Cambios sin publicar»
(`certificateStateOf`). Con cambios locales enseña «Sin guardar»; en ese estado
«Publicar» se desactiva y `UnsavedChangesDialog` avisa al salir.

## 5. Firmas

- Viven en `documentos/firmas/<courseDocumentId>/`, **privadas**: el proxy exige
  sesión.
- En el navegador se reducen a 800 px de ancho y se convierten a PNG sin recortar,
  para conservar la transparencia (`resize-signature-image.ts`). El servidor acepta
  PNG o WEBP de hasta 1 MB.
- Al guardar, `isOwnSignatureRef` exige la referencia del proxy de una key del propio
  curso. Nada de `blob:`, `data:`, URLs externas ni firmas de otro curso.
- Reemplazar o quitar una firma no borra el objeto. Si ya no la usa ni el borrador
  ni el publicado, el gestor de nube la marca como huérfana tras su ventana de
  gracia. La fuente de referencias nombra cada carpeta de curso con su título.

## 6. Vista previa

`CertificatePreview` pinta `renderCertificateDocument` en un `iframe`:

- `sandbox="allow-same-origin"`, sin scripts;
- escalado con `ResizeObserver` al ancho del contenedor;
- documento derivado de `useDeferredValue(design)`.

Los datos de muestra salen de `toSampleRenderData`:

- el curso real, con título, descripción, dependencia y horas de `courseHoursOf`;
- «Nombre del participante» como quien recibe;
- la fecha de hoy, que calcula el servidor para no romper la hidratación;
- el primer folio del formato elegido.

## 7. Paneles

| Panel | Controles |
| --- | --- |
| Plantilla | Una miniatura CSS por plantilla, con el acento elegido |
| Contenido | Subtítulo, descripción (vacía usa la del curso), formato del folio con su ejemplo en vivo |
| Color | Los cinco acentos del manual, selector y campo hex, y aviso si el logo blanco no contrasta (menos de 3:1) |
| Firmas | Dos tarjetas: aparece o no, nombre, cargo e imagen |

Debajo de las pestañas, «Exportar muestra» baja en PDF o PNG lo **guardado** y, si existe,
lo publicado, con datos de muestra y el mismo exportador que la emisión. Con cambios sin
guardar, lo guardado no se exporta.

El formato del folio debe incluir `{seq}` (ver [02-emision.md](./02-emision.md) §4).
