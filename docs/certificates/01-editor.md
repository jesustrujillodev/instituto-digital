# Editor de certificados — Referencia

## 1. Qué es

`/dashboard/capacitaciones/:documentId/certificado` es la ficha del certificado de un curso:
vista previa de lo guardado, estado, publicar lo guardado, descartar cambios, exportar
muestra y entrega. El diseño se hace en el editor libre a pantalla completa
(`…/certificado/editor`, [04-editor-libre.md](./04-editor-libre.md)), que reemplazó a los
paneles de plantilla, contenido, color y firmas de esta pantalla. La emisión usa el diseño
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
| Guardar borrador (`save-draft`) | Valida con `certificateDesignSchema`, comprueba las firmas y escribe el borrador | Sí |
| Publicar (`publish`) | Lo mismo que guardar, y escribe ese diseño **también** como publicado, sellando `published_at`. Borrador y publicado quedan iguales | Sí |
| Descartar (`discard`) | El borrador vuelve a ser el publicado | No |
| Subir imagen o firma (`upload-image`) | Sube la imagen y devuelve su referencia y medidas; no toca la base | El archivo |
| Subir fondo (`upload-background`) | Reconstruye el PDF, comprueba su raster y guarda ambos ([ADR 0029](../adr/0029-fondo-pdf-vectorial.md)) | PDF y raster |
| Aplicar plantilla / guardar como plantilla | Ver [05-biblioteca-y-logos.md](./05-biblioteca-y-logos.md) | Id o diseño |

La cabecera enseña «Sin publicar», «Publicado» o «Cambios sin publicar»
(`certificateStateOf`). Con cambios locales enseña «Sin guardar»; «Publicar» sigue
disponible y publica lo que está en pantalla, y `UnsavedChangesDialog` avisa al salir.

Mientras el curso **nunca haya publicado**, la emisión usa `DEFAULT_CERTIFICATE_DESIGN`
(ver [02-emision](./02-emision.md)). Por eso ese estado se avisa dos veces: un aviso
en el editor y `CertificateStatusNotice` en la ficha del curso, que también marca
«Cambios sin publicar». Publicado no enseña nada en la ficha (docs/adr/0023).

## 5. Firmas

> Desde el editor libre, firmas e imágenes viven en
> `documentos/certificados/<curso>/imagenes/` y la regla de propiedad es
> `isOwnCertificateAssetRef`, que también acepta las firmas heredadas de abajo
> ([04-editor-libre.md](./04-editor-libre.md) §4). Esta sección describe el gestor anterior.

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

La tarjeta «Entrega» guarda con su propio intent (`save-delivery`), aparte del diseño:
- si el participante puede descargarlo (`is_downloadable`);
- el mensaje opcional del correo (`email_message`, hasta 500 caracteres).

Rige desde que se guarda, también para lo ya emitido
([02-emision.md](./02-emision.md) §9).
