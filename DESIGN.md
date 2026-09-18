---
name: Instituto Digital de Capacitación
description: Plataforma de capacitación del XXV Ayuntamiento de Tijuana, con la identidad institucional guinda y oro.
colors:
  guinda-cabildo: "oklch(0.367 0.136 9.47)"
  guinda-sello: "oklch(0.441 0.147 10)"
  guinda-profundo: "oklch(0.3 0.11 9.47)"
  guinda-borde: "oklch(0.25 0.09 9.47)"
  guinda-rosado: "oklch(0.66 0.13 9.47)"
  oro-corporativo: "oklch(0.689 0.087 76.2)"
  oro-claro: "oklch(0.861 0.057 84.49)"
  rojo-institucional: "oklch(0.467 0.16 12.76)"
  verde-servicio: "oklch(0.43 0.063 177)"
  verde-servicio-suave: "oklch(0.923 0.015 175.7)"
  oro-aviso-texto: "oklch(0.5 0.08 76.2)"
  oro-aviso-suave: "oklch(0.943 0.022 80.69)"
  papel: "oklch(0.961 0 0)"
  hoja: "oklch(1 0 0)"
  grafito: "oklch(0.341 0 0)"
  grafito-profundo: "oklch(0.26 0 0)"
  gris-secundario: "oklch(0.5 0 0)"
  gris-apagado: "oklch(0.922 0 0)"
  gris-separador: "oklch(0.88 0 0)"
  gris-campo: "oklch(0.6 0 0)"
  noche: "oklch(0.16 0 0)"
  noche-tarjeta: "oklch(0.2 0 0)"
  claro-texto: "oklch(0.95 0 0)"
typography:
  display:
    fontFamily: "\"ITC Avant Garde Std\", Arial, ui-sans-serif, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "\"ITC Avant Garde Std\", Arial, ui-sans-serif, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "\"ITC Avant Garde Std\", Arial, ui-sans-serif, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "\"ITC Avant Garde Std\", Arial, ui-sans-serif, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "\"ITC Avant Garde Std\", Arial, ui-sans-serif, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  base: "4px"
  menu: "5.6px"
  field: "8.8px"
  surface: "10.4px"
spacing:
  unit: "4px"
  control-x: "12px"
  card-sm: "16px"
  card: "24px"
components:
  button-primary:
    backgroundColor: "{colors.guinda-cabildo}"
    textColor: "{colors.papel}"
    rounded: "{rounded.surface}"
    padding: "0 12px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.oro-claro}"
    textColor: "{colors.grafito}"
    rounded: "{rounded.surface}"
    padding: "0 12px"
    height: "36px"
  button-destructive:
    textColor: "{colors.rojo-institucional}"
    rounded: "{rounded.surface}"
    padding: "0 12px"
    height: "36px"
  button-on-guinda:
    backgroundColor: "{colors.oro-corporativo}"
    textColor: "{colors.guinda-borde}"
    rounded: "{rounded.surface}"
    padding: "0 16px"
    height: "40px"
  input:
    rounded: "{rounded.field}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.hoja}"
    textColor: "{colors.grafito}"
    rounded: "{rounded.surface}"
    padding: "{spacing.card}"
  badge-success:
    backgroundColor: "{colors.verde-servicio-suave}"
    textColor: "{colors.verde-servicio}"
    rounded: "{rounded.field}"
    padding: "2px 8px"
    height: "20px"
  badge-warning:
    backgroundColor: "{colors.oro-aviso-suave}"
    textColor: "{colors.oro-aviso-texto}"
    rounded: "{rounded.field}"
    padding: "2px 8px"
    height: "20px"
  sidebar:
    backgroundColor: "{colors.guinda-profundo}"
    textColor: "{colors.claro-texto}"
  sidebar-item-active:
    backgroundColor: "{colors.guinda-cabildo}"
    textColor: "{colors.claro-texto}"
    rounded: "{rounded.menu}"
    height: "36px"
---

# Design System: Instituto Digital de Capacitación

## Overview

**Creative North Star: "La Oficina del Cabildo"**

La plataforma es la oficina donde el personal del Ayuntamiento organiza, imparte y acredita su capacitación. Como una buena oficina municipal, es ordenada, sobria y reconocible: el guinda funciona como sello de autoridad y marca el territorio institucional (la barra lateral, la portada, el acceso), y el oro distingue lo que importa en ese momento. Todo lo demás es papel neutro donde vive el trabajo: tablas, formularios y calendarios en gris grafito sobre blanco roto.

Los componentes son **cercanos y claros**. Quien la usa es un servidor público cualquiera, a veces en una PC de oficina durante una jornada administrativa y a veces desde el celular revisando una invitación. Las formas son suavemente redondeadas, los objetivos táctiles cómodos y la jerarquía se entiende sin leer. La tipografía ITC Avant Garde, geométrica y abierta, da el tono institucional sin rigidez.

Los valores de este documento son los del tema **Institucional**, que es a la vez el tema base (`DEFAULT_THEME_TOKENS` en `app/modules/theme/domain/theme.config.ts`) y el único preset de fábrica. El superadministrador puede publicar otro tema desde el builder, así que el código **nunca** escribe colores literales: consume los tokens (`bg-primary`, `text-muted-foreground`, `bg-sidebar`…) y este archivo describe lo que esos tokens valen por defecto.

**Key Characteristics:**
- Guinda como superficie de marca; papel neutro como superficie de trabajo.
- Oro escaso: distinción, nunca relleno.
- Una sola familia tipográfica (ITC Avant Garde) para toda la interfaz.
- Contraste WCAG 2.1 AA comprobado por prueba en claro y oscuro.
- Profundidad por anillo tenue y sombra corta, sin bordes gruesos.

## Colors

Paleta del manual de identidad del Ayuntamiento: guinda y oro sobre neutros cálidos de oficina, con un verde y un rojo institucionales para estado.

### Primary
- **Guinda Cabildo** (#750D2F): acción principal (botón primario), enlaces y texto de marca, elemento activo y hover de la barra lateral. Es el color del sello.
- **Guinda Sello** (#912240): anillo de foco en modo claro.
- **Guinda Profundo**: fondo de la barra lateral y de las superficies de marca en portada y acceso. En oscuro baja a `oklch(0.25 0.09 9.47)` y sigue siendo guinda.
- **Guinda Borde**: borde de la barra lateral y texto sobre el oro en superficies guinda.
- **Guinda Rosado**: primario del modo oscuro, con texto casi negro teñido de guinda (`oklch(0.16 0.02 9.47)`).

### Secondary
- **Oro Corporativo** (#BA945C): elemento activo de la navegación sobre guinda, botón de acción sobre guinda, filete de marca y anillo de foco en la barra lateral. Hoy también es el token `accent` (ver Do's and Don'ts).
- **Oro Claro** (#E3CFA7): botón secundario.

### Tertiary
- **Rojo Institucional** (#9F2240): acciones destructivas y errores, siempre como texto sobre un velo del 10% de sí mismo, no como relleno sólido.
- **Verde Servicio** (#225B4F) sobre **Verde Servicio Suave**: distintivos de éxito y estados activos.
- **Oro Aviso** (texto) sobre **Oro Aviso Suave**: distintivos de advertencia. El oro corporativo no se usa como texto: no llega a AA sobre su fondo suave.

### Neutral
- **Papel** (#F2F2F2): fondo de página y texto sobre guinda.
- **Hoja** (blanco): tarjetas, menús y diálogos.
- **Grafito** (#383838): texto principal.
- **Grafito Profundo**: texto sobre el oro corporativo, donde el grafito del manual se queda en 4,2:1.
- **Gris Secundario**: descripciones y texto de apoyo (5,4:1 sobre papel).
- **Gris Apagado**: superficies atenuadas.
- **Gris Separador**: bordes y divisores, que separan pero no identifican.
- **Gris Campo**: contorno de campos y controles (3,5:1, WCAG 1.4.11).
- **Noche**, **Noche Tarjeta**, **Claro Texto**: fondo, tarjeta y texto del modo oscuro.

### Named Rules
**The Sello Rule.** El guinda ocupa superficies solo donde se declara la institución: barra lateral, portada, panel de acceso y la **portada generada** de un curso sin imagen (ver Components). Dentro del área de trabajo, el guinda es acción, enlace o foco; nunca un fondo de sección. Una superficie de medios —el rectángulo donde iría una fotografía— no es una sección: sustituye a una imagen, no enmarca contenido.

**The Oro Escaso Rule.** El oro corporativo distingue un elemento a la vez: el activo, la acción sobre guinda o un filete de marca. Nunca es una superficie grande ni el color de un estado repetido en listas. La trama de la portada generada es la excepción acotada: vive **dentro** de la superficie guinda, al 18% de opacidad, y desaparece en cuanto el curso tiene imagen propia — no señala estado ni compite con la acción.

**The Token Rule.** Ningún componente escribe un color literal. Todo sale de los tokens del tema, porque el tema publicado puede cambiar sin tocar el código.

## Typography

**Display Font:** ITC Avant Garde Std (con Arial)
**Body Font:** ITC Avant Garde Std (con Arial)
**Label/Mono Font:** pila monoespaciada del sistema, solo para código y datos técnicos

**Character:** Una geométrica humanista de los setenta, la tipografía del manual. Sus círculos abiertos y su gran ojo medio la hacen legible en tamaños de interfaz y amable en titulares, así que una sola familia basta para todo.

### Hierarchy
- **Display** (Bold 700, 3rem, 1): nombre de la plataforma en la portada; 1.875rem–2.25rem en el panel de acceso. Tracking ajustado (-0.025em).
- **Headline** (Bold 700, 1.25rem en móvil → 1.875rem en escritorio, 1.2): el `<h1>` de cada página del panel.
- **Title** (Medium 500, 1rem): títulos de tarjeta, diálogo y panel lateral.
- **Body** (Book 400, 0.875rem, 1.43): texto de la interfaz, celdas de tabla, descripciones. El tamaño base del documento es 1rem y la escala se deriva de él, así que el tema puede moverla entera.
- **Label** (Medium 500, 0.75rem): distintivos, subtítulos pequeños, ayudas de campo.

### Named Rules
**The Una Familia Rule.** Toda la interfaz usa ITC Avant Garde. La jerarquía se construye con peso y tamaño, nunca con una segunda fuente decorativa.

**The Book Es Regular Rule.** Book se declara en 400. Declararlo en 300 hace que el texto normal caiga a Medium y la interfaz entera se engruese.

## Layout

El panel usa una barra lateral flotante a la izquierda (se separa del borde con margen y esquinas redondeadas), colapsable a una columna de iconos en escritorio y convertida en hoja superpuesta en móvil; el contenido ocupa el resto con su propio encabezado de página. La unidad de espaciado es 4px (`--spacing`, editable por el tema) y los componentes trabajan en múltiplos: 12px de margen horizontal en controles, 16px o 24px de relleno en tarjetas.

Portada y acceso son composiciones de marca: la portada es una superficie guinda completa con el logo arriba y el mensaje centrado verticalmente a la izquierda; el acceso divide la pantalla en 5/12 guinda y 7/12 papel en escritorio, y apila la franja guinda sobre el formulario en móvil. El formulario de acceso no pasa de 384px de ancho.

El diseño responde primero a móvil para los participantes. Las acciones de un encabezado de página pueden plegarse en un menú de tres puntos en pantallas pequeñas para no restar alto útil.

## Elevation & Depth

Sistema de profundidad mínima. Las superficies flotantes (tarjetas, menús, diálogos) se separan con un **anillo de 1px del color del texto al 5%** (10% en oscuro) más una sombra corta y difusa. No hay bordes gruesos ni sombras de color. El velo detrás de diálogos y paneles es negro al 10% en claro y al 30% en oscuro: un velo atenúa, no es superficie de marca. La escala de sombras se deriva de seis parámetros del tema.

### Shadow Vocabulary
- **Tarjeta** (`box-shadow: 0px 1.5px 4.5px 0px oklch(0 0 0 / 10%), 0px 0.75px 2.25px 0px oklch(0 0 0 / 10%)`): tarjetas de contenido.
- **Diálogo** (`box-shadow: 0px 4px 12px 0px oklch(0 0 0 / 10%), 0px 2px 6px 0px oklch(0 0 0 / 10%)`): diálogos y elementos modales.

### Named Rules
**The Anillo Antes Que Borde Rule.** La separación de una superficie es un anillo tenue más una sombra corta. Nunca un borde de color ni un filete lateral grueso.

## Shapes

El radio base del tema es 4px y todo lo demás se deriva multiplicándolo. Las superficies grandes (tarjetas, diálogos, botones) usan la curva más amplia (10.4px); campos y distintivos, una intermedia (8.8px); los elementos de navegación lateral, una más contenida (5.6px). El resultado es una forma suave pero no infantil: esquinas amables sin llegar a píldora. Los logotipos institucionales nunca se recortan ni se enmarcan.

## Components

### Buttons
Cercanos y claros: altura cómoda, color sólido solo en la acción principal.
- **Shape:** esquinas suaves (10.4px), 36px de alto (40px en tamaño grande).
- **Primary:** guinda cabildo con texto papel; al pasar el cursor baja al 80% de opacidad.
- **Hover / Focus:** anillo de foco de 3px en el color del anillo al 30%; al presionar baja 1px.
- **Secondary:** oro claro con texto grafito.
- **Outline / Ghost:** sin relleno; el hover usa el gris apagado.
- **Destructive:** texto rojo institucional sobre un velo del 10% del mismo rojo, nunca relleno sólido.
- **Sobre guinda:** en portada y acceso, la acción usa oro corporativo con texto guinda borde.

### Chips
- **Style:** distintivos de 20px de alto, esquina de 8.8px, texto 0.75rem medium. Éxito en verde servicio sobre verde suave; aviso en oro aviso sobre oro suave; error en rojo sobre velo rojo.
- **State:** el color comunica el estado, y el texto siempre lo nombra.

### Cards / Containers
- **Corner Style:** 10.4px.
- **Background:** hoja (blanco) sobre papel; noche tarjeta en oscuro.
- **Shadow Strategy:** sombra de tarjeta y anillo tenue (ver Elevation & Depth).
- **Border:** ninguno.
- **Internal Padding:** 24px (16px en la variante compacta).

### Portada generada
Cuando un curso no tiene imagen de portada, su hueco no se deja gris: se pinta una placa de marca. `app/modules/enrollments/components/course-cover.tsx`.
- **Superficie:** el guinda profundo de la barra lateral, con un velo radial del guinda cabildo al 70% desde la esquina superior izquierda — un campo plano se ve impreso.
- **Trama:** una de seis geometrías vectoriales (retícula, diagonales, puntos, galón, anillos, ladrillos) en oro corporativo al 18%, con giro y escala propios. **Determinista:** las tres variantes salen de un hash FNV-1a del `documentId`, así que el mismo curso se ve siempre igual —el servidor y el cliente pintan lo mismo— y dos tarjetas vecinas no se repiten.
- **Marca de agua:** el icono de la modalidad, al 25%, saliendo por la esquina inferior derecha.
- **Regla:** es geometría exacta, nunca ilustración. Ninguna forma se dibuja a mano alzada ni imita una fotografía.

### Tarjeta de curso
La unidad del catálogo de cursos disponibles, la única pantalla del panel donde se elige en vez de administrar. `app/modules/enrollments/components/course-card.tsx`.
- **Anatomía:** portada 16:9 al ras del borde superior (`pt-0` sobre la tarjeta), título a dos líneas, resumen a dos líneas, fila de datos y pie con el cupo y la acción.
- **Distintivos sobre la portada:** los de contorno del proyecto no se leen sobre una fotografía cualquiera. Sobre la portada van dos píldoras sólidas: la modalidad en fondo esmerilado neutro, y el estado propio —solo cuando existe— en guinda sólido.
- **Una parada de tabulación:** el enlace al detalle se estira con `after:absolute after:inset-0`; nada interactivo se anida dentro.
- **Foco:** el mismo anillo de 3px al 30% que el resto de controles. La tarjeta no inventa el suyo.

### Inputs / Fields
- **Style:** 36px de alto, esquina de 8.8px, sin borde visible en reposo. El relleno es apenas perceptible: la superficie apagada (gris apagado) en claro y el gris campo al 30% en oscuro. Aplica a campos de texto, áreas de texto, selects, grupos de campo, buscador de comandos y buscador de la barra lateral.
- **Focus:** el borde toma el color del anillo y aparece un halo de 3px al 30%.
- **Error / Disabled:** en error, borde y halo rojo institucional; deshabilitado al 50% de opacidad.

### Navigation
- **Style:** barra lateral guinda profundo con texto claro, ítems de 36px y esquina de 5.6px.
- **States:** hover y activo en guinda cabildo; el activo además en peso medio. Los grupos se despliegan con un chevron que gira 90°.
- **Header:** icono del escudo (32px) con "Instituto Digital / de Capacitación".
- **Mobile:** hoja superpuesta que se cierra al elegir destino.

### Superficie de marca
Portada y panel de acceso usan la superficie guinda de la barra lateral con el logotipo completo del Ayuntamiento, que es blanco y solo se lee sobre guinda (64px de alto en escritorio, 48px en móvil). El nombre de la plataforma va en Display y un filete oro de 64×4px puede anteceder al titular de la portada.

## Do's and Don'ts

### Do:
- **Do** consumir siempre los tokens del tema (`bg-primary`, `bg-sidebar`, `text-muted-foreground`); el superadmin puede publicar otro tema.
- **Do** colocar el logotipo completo solo sobre la superficie guinda, y el icono del escudo en la barra lateral y como favicon.
- **Do** mantener AA en todo par de color nuevo; `theme.config.test.ts` falla si un token de fábrica baja de su mínimo.
- **Do** usar texto oscuro sobre el primario en modo oscuro; ningún guinda con texto claro cumple a la vez como botón y como enlace sobre fondo negro.
- **Do** separar superficies con anillo tenue y sombra corta.

### Don't:
- **Don't** usar el oro corporativo como superficie grande ni como estado repetido. Pendiente: hoy el token `accent` es oro corporativo y pinta el foco de los elementos de menús desplegables y selects; conviene moverlo a un oro suave para cumplir la regla del oro escaso.
- **Don't** usar el token `input` como relleno de campos de texto: es el contorno de checkboxes y radios, calibrado a 3:1, y como relleno deja el campo pesado y el placeholder en 3:1.
- **Don't** usar el guinda como fondo de secciones dentro del área de trabajo. La portada generada es superficie de medios, no sección: es la única excepción.
- **Don't** usar oro corporativo como color de texto sobre fondos claros.
- **Don't** añadir una segunda familia tipográfica ni declarar Book en 300.
- **Don't** poner filetes laterales gruesos de color en tarjetas o paneles.
- **Don't** recortar, recolorear ni poner el logotipo blanco sobre fondos claros.
