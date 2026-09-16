# Modo oscuro — referencia de lo implementado (Fase A)

**Última actualización:** 2026-08-03 · **Estado: implementado.**

Primera mitad de la feature de temas. Documenta el modo oscuro tal como quedó
construido: quién decide el esquema de color, cómo se sirve sin flash y por qué
los valores de los tokens ya no viven en `app/app.css`.

La segunda mitad —el theme builder de `/dashboard/personalizacion`— está
implementada y documentada en [01-theme-builder.md](./01-theme-builder.md), que
da por hecho todo lo de aquí. Donde este documento diga "en la fase B", ese es el
sitio al que ir.

---

## 1. Semántica

La regla que gobierna el resto: **el tema es de la plataforma; el modo es de la
persona.**

En la fase A solo existe un tema (el neutro de siempre), así que lo único que
elige el usuario es entre sus dos variantes —o delegar en el sistema operativo.

| Modo | Qué significa |
|---|---|
| `light` | Elección explícita. Ignora el ajuste del sistema. |
| `dark` | Elección explícita. Ignora el ajuste del sistema. |
| `system` | **Por defecto.** Sigue a `prefers-color-scheme`, en vivo. |

## 2. Dónde vive la preferencia

Dos almacenes con papeles distintos, y el orden entre ellos importa:

| Almacén | Alcance | Para qué |
|---|---|---|
| Cookie `__theme_mode` | Este navegador | Que el **servidor** conozca el modo antes de renderizar. Es lo que elimina el flash. |
| Columna `User.themeMode` | La cuenta | Que la preferencia siga al usuario a **otro dispositivo**. |

`resolveThemeMode` (en `theme.rules.ts`) resuelve **cookie → columna → `system`**.

La cookie gana a propósito: es lo único disponible en una petición anónima, así
que si la columna tuviera precedencia la misma persona vería un tema en la
landing y otro tras iniciar sesión. La columna solo entra en juego cuando no hay
cookie —dispositivo nuevo, cookies borradas—, y por eso **la base de datos no se
consulta en la petición normal**: solo cuando hay sesión y la cookie viene vacía.

Un valor que la allowlist no reconoce (cookie manipulada, columna de una versión
anterior) se ignora en vez de fallar. El peor desenlace admisible aquí es pintar
el tema por defecto.

> **Requisito de esquema.** Esta fase añade la columna `User.themeMode`
> (`prisma/schema.prisma`). No se generó carpeta de migración: el proyecto sigue
> en construcción de plantilla y la base es local, así que el cambio se aplica
> con `bunx prisma db push` — decisión explícita del dueño del repositorio, por
> encima de lo que indica `AGENTS.md` §"Flujo de migraciones". El cliente ya está
> regenerado (`bunx prisma generate`), de modo que el typecheck y la suite pasan
> aunque la base todavía no tenga la columna. **Sin el `db push`, guardar la
> preferencia en la cuenta falla en runtime** (la cookie sigue funcionando).

### 2.1 Atributos de la cookie

`HttpOnly`, `SameSite=Lax`, `Path=/`, un año de `Max-Age`, y **sin firma**.

`HttpOnly` puede sorprender en una cookie de tema —lo habitual es abrirla al
cliente—, pero aquí nada la lee desde el navegador: el modo llega a los
componentes por el loader raíz, que es quien lo resolvió y quien emitió el CSS.
Un hook que la leyera del navegador además desincronizaría el marcado del
servidor con el de la hidratación.

Sin `secrets` porque no es material secreto ni una credencial: su peor abuso es
que alguien fuerce su propio esquema de color, y el valor se valida contra la
allowlist al leerlo.

## 3. Cómo se sirve sin flash

El loader de `app/root.tsx` resuelve el modo y devuelve el CSS ya serializado.
`Layout` pinta la clase en `<html>` y el bloque de tokens en el `<head>`:

```tsx
<html lang="es" className={themeHtmlClass(theme.mode)}>
  <head>
    <style dangerouslySetInnerHTML={{ __html: theme.css }} />
    <Links />
```

`serializeThemeCss` emite una forma distinta según el modo, y ahí está el truco:

| Modo | Clase en `<html>` | CSS emitido |
|---|---|---|
| `light` | — | `:root{color-scheme:light; …claro}` |
| `dark` | `dark` | `:root{color-scheme:dark; …oscuro}` |
| `system` | `theme-system` | `:root{color-scheme:light dark; …claro}` + `@media (prefers-color-scheme:dark){:root{…oscuro}}` |

**Cero JavaScript y cero flash.** El servidor no puede conocer el ajuste del
sistema operativo del cliente, pero el motor de CSS sí —y además responde a un
cambio del sistema **en vivo, sin recargar**. La alternativa habitual (script
bloqueante en el `<head>` que pone la clase antes del primer pintado, estilo
`next-themes`) sobra: el servidor ya tiene la cookie.

### 3.1 El custom variant de dos ramas

Consecuencia del punto anterior: con `system` **no hay clase `.dark` en el DOM**,
así que las utilidades `dark:` de los componentes shadcn se quedarían inertes
justo en el modo por defecto. Por eso `app/app.css` redefine el variant:

```css
@custom-variant dark {
  &:where(.dark, .dark *) { @slot; }
  @media (prefers-color-scheme: dark) {
    &:where(.theme-system, .theme-system *) { @slot; }
  }
}
```

**La rama del `@media` es load-bearing.** Si se borra, el modo `system` sigue
pintando los colores correctos pero pierde todos los ajustes `dark:` —bordes de
inputs, `mix-blend` del avatar, rings de `destructive`— sin romper ninguna
prueba. Se ve mal y nada avisa.

## 4. Dónde viven los valores de los tokens

En `app/modules/theme/domain/theme.config.ts` (`DEFAULT_THEME_TOKENS`), **no** en
`app/app.css`.

Los bloques `:root` y `.dark` de la hoja de estilos se eliminaron. Dejar allí una
copia "por si acaso" es exactamente lo que había que evitar: el respaldo para
cuando el loader no puede resolver existe —lo aplica `Layout`— pero sale de la
**misma** constante.

> Desde la fase B, los tokens que se sirven salen del **tema activo en base de
> datos**; `DEFAULT_THEME_TOKENS` pasa a ser el respaldo real —lo que se sirve
> cuando no hay tema activo, cuando la base no responde con la caché fría, o
> cuando una fila `Json` resulta ilegible. La decisión de no duplicarlos en CSS
> es justo lo que hace que ese cambio no dejara una copia muerta detrás
> ([01-theme-builder.md](./01-theme-builder.md) §2 y §4).

`app/app.css` conserva el bloque `@theme inline`, que es cosa distinta: mapea los
nombres de token a las utilidades de Tailwind en tiempo de compilación y no
necesita conocer ningún valor.

### 4.1 Tokens añadidos

| Token | Por qué |
|---|---|
| `--destructive-foreground` | No existía en ninguna variante. tweakcn y el generador de shadcn lo dan por hecho: sin él, un tema pegado desde fuera llega incompleto (fase B). |
| `--success` / `--success-foreground` | Destino de los `bg-green-*` que estaban hardcodeados en los badges de la tabla. |
| `--warning` / `--warning-foreground` | Ídem con los `bg-yellow-*`. |

Los valores reproducen los de la paleta de Tailwind que ya se usaba, así que el
aspecto en modo claro no cambia. En la variante oscura el alfa que antes venía
del sufijo `/20` vive ahora **dentro del token**, para que el builder de la fase
B pueda redefinir estos colores igual que redefine `primary`.

### 4.2 Saneamiento

`serializeThemeCss` filtra nombres y valores contra una allowlist antes de
componer el CSS. En la fase A los tokens salían de una constante del repositorio
y el riesgo era teórico; desde la fase B salen de una columna `Json`, y un valor
con `</style>` cerraría la etiqueta y convertiría el tema en un vector de XSS. Se
puso desde el principio porque añadirlo después obliga a acordarse.

## 5. Superficie de UI

| Dónde | Qué |
|---|---|
| Menú de usuario del sidebar | Submenú **Tema** con Claro / Oscuro / Sistema |
| Landing y login | El mismo desplegable, suelto en la esquina |
| `Toaster` de Sileo | Recibe el modo resuelto para elegir el relleno de la píldora, que va invertida (oscura en claro, clara en oscuro). Los colores de estado toman tono y croma de los tokens (`--success-foreground`, `--warning-foreground`, `--destructive`) con luminosidad fija para cada píldora: ver el bloque de Sileo en `app/app.css` |

El cambio va por `POST` a `/preferencia-tema`, una ruta **pública** —el toggle se
ofrece sin sesión, así que colgarla del layout del dashboard obligaría a estar
dentro para poder cambiar de tema.

`useThemeMode` refleja de inmediato el envío en vuelo (`fetcher.formData`), así
que el check del menú se mueve al instante aunque los colores lleguen con la
revalidación. **No se manipula la clase de `<html>` a mano**: el servidor envía
solo los tokens de la variante activa, de modo que cambiar la clase sin cambiar
el CSS no pintaría nada distinto.

## 6. Modos de fallo

| Qué falla | Qué pasa |
|---|---|
| La base no responde al leer la preferencia | Se usa el modo de la cookie o `system`. El tema **no** es una decisión de seguridad: degradar es correcto, denegar no. |
| La base no responde al leer el tema activo | Se sirve el último tema activo conocido: memoria, snapshot en disco o, como último recurso, el que guardó el navegador (docs/theme/01-theme-builder.md §4.1). |
| El loader raíz falla entero | `Layout` usa `DEFAULT_THEME_TOKENS` marcado como `fallback`, y el navegador pinta encima el último tema activo que guardó. La página se pinta. |
| No se pudo guardar en la cuenta | La cookie **sí** se emitió: el usuario tiene el tema que pidió en este navegador. La respuesta lo dice con esa copia (`THEME_PREFERENCE_NOT_SAVED`). |
| Llega un modo inventado | Muere en la frontera con 400 y **sin** emitir cookie. Persistir un valor que la allowlist rechaza lo dejaría fallando en silencio en cada petición posterior. |

## 7. Advertencia de caché

**El loader raíz varía por cookie.** Hoy no hay CDN delante y no supone nada,
pero el día que se ponga uno necesita `Vary: Cookie` — sin él, una caché
compartida serviría el tema de un usuario a otro. Desde la fase B son **dos**
cookies (`__theme_mode` y `__theme_preview`), y el peor caso empeora: serviría el
borrador de un admin a todo el mundo.

## 8. Mapa de archivos

| Archivo | Papel |
|---|---|
| `app/modules/theme/domain/theme.rules.ts` | `resolveThemeMode`, `serializeThemeCss`, `themeHtmlClass`, allowlist de saneamiento |
| `app/modules/theme/domain/theme.config.ts` | `DEFAULT_THEME_TOKENS` — el tema base y el respaldo |
| `app/modules/theme/domain/theme.mapper.ts` | `themeCss` — punto único de tokens a hoja de estilos (fase B) |
| `app/modules/theme/application/theme.service.server.ts` | `resolve` y `setMode`, envueltos en el runner |
| `app/modules/theme/infrastructure/theme.repository.server.ts` | Lee y escribe `User.themeMode` |
| `app/modules/theme/routes/preferencia-tema/index.action.ts` | Cookie + persistencia |
| `app/modules/theme/hooks/use-theme-mode.ts` | Modo actual y `setMode` para la UI |
| `app/modules/theme/components/theme-mode-toggle.tsx` | Desplegable suelto y submenú |
| `app/core/cookies.server.ts` | `themeModeCookie` |
| `app/root.tsx` | Loader que resuelve y `Layout` que inyecta |
| `app/app.css` | `@custom-variant dark` de dos ramas y `@theme inline` |
