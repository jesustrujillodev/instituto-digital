# ADR 0023 · Publicar el certificado en un paso

**Estado:** aceptado · 2026-09-28
**Contexto del cambio:** MVP-02 · cursos que emitían el diseño por defecto
**Enmienda:** [ADR-0018](./0018-diseno-del-certificado-borrador-y-publicado.md) §2.3 (qué
publica «Publicar»)

## 1. Contexto

Según ADR-0018 §2.3, «Publicar» copiaba el borrador **guardado**, y la pantalla lo
desactivaba mientras hubiera cambios sin guardar. La emisión usa el publicado, o
`DEFAULT_CERTIFICATE_DESIGN` si nunca se publicó.

En la base de desarrollo, los cinco cursos con certificado tenían un borrador
personalizado y ninguno publicado, y sus siete emisiones salieron con el diseño por
defecto. Guardar se leía como terminar. El estado «Sin publicar» decía «Se emitirá
con el diseño que publiques», cuando en realidad se emitía el de por defecto.

## 2. Decisiones

### 2.1 Publicar guarda y publica

`publish` recibe el diseño de la pantalla, pasa por las mismas guardas que guardar
(validación y firmas del propio curso) y lo escribe **a la vez** como borrador y como
publicado. Deja de exigir que se guarde antes. Borrador y publicado quedan iguales,
así que el editor dice «Publicado» y no «Cambios sin publicar».

«Publicar» es el botón principal y «Guardar borrador» el secundario. Se conservan los
dos estados de ADR-0018: preparar un cambio sin que se emita y «Descartar cambios»
siguen existiendo.

### 2.2 Sin publicar se avisa

- El estado «Sin publicar» dice lo que pasa: se emite el diseño por defecto.
- El editor muestra un aviso mientras el curso nunca haya publicado.
- La ficha del curso muestra `CertificateStatusNotice` si hay algo sin publicar, con
  un enlace al editor. Publicado no enseña nada.

### 2.3 Lo emitido no cambia

Las emisiones siguen congelando su diseño (ADR-0019). Publicar solo alcanza a lo que
se emita después.

## 3. Alternativas descartadas

- **Un solo estado, guardar es publicar.** Pierde preparar un cambio sin emitirlo y
  «Descartar cambios».
- **Emitir con el borrador si nunca se publicó.** Emitiría diseños a medio hacer, y
  el editor dejaría de decir con qué se emite.
- **Actualizar las emisiones ya hechas al publicar.** Cambiaría un papel que la
  persona quizá ya descargó; enmendar ADR-0019 no compensa.
