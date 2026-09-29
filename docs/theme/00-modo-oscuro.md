# Modo oscuro — referencia de lo implementado

**Última actualización:** 2026-09-29 · **Estado: implementado.**

Documenta el modo claro/oscuro tal como está construido: quién decide el esquema
de color, dónde viven los valores de los tokens y cómo se sirve sin flash.

La plataforma tiene **un solo tema, fijo**: el institucional, declarado en
`app/app.css`. No hay forma de personalizarlo desde la aplicación; el antiguo
theme builder de `/dashboard/personalizacion` se retiró junto con sus tablas
(`themes`, `appearance_state`). Cambiar un color es cambiar `app.css`.

---

## 1. Semántica

La regla que gobierna el resto: **el tema es de la plataforma; el modo es de la
persona.** Cada usuario elige entre las dos variantes del tema —o delega en el
sistema operativo.

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
que si la columna tuviera precedencia la misma persona vería un modo en la
landing y otro tras iniciar sesión. La columna solo entra en juego cuando no hay
cookie —dispositivo nuevo, cookies borradas—, y por eso **la base de datos no se
consulta en la petición normal**: solo cuando hay sesión y la cookie viene vacía.

Un valor que la allowlist no reconoce (cookie manipulada, columna de una versión
anterior) se ignora en vez de fallar. El peor desenlace admisible aquí es pintar
el modo por defecto.

### 2.1 Atributos de la cookie

`HttpOnly`, `SameSite=Lax`, `Path=/`, un año de `Max-Age`, y **sin firma**.

`HttpOnly` puede sorprender en una cookie de tema —lo habitual es abrirla al
cliente—, pero aquí nada la lee desde el navegador: el modo llega a los
componentes por el loader raíz, que es quien lo resolvió y quien puso la clase
de `<html>`. Un hook que la leyera del navegador además desincronizaría el
marcado del servidor con el de la hidratación.

Sin `secrets` porque no es material secreto ni una credencial: su peor abuso es
que alguien fuerce su propio esquema de color, y el valor se valida contra la
allowlist al leerlo.

## 3. Cómo se sirve sin flash

El loader de `app/root.tsx` resuelve el modo y `Layout` lo convierte en la clase
de `<html>` con `themeHtmlClass`. Las dos variantes de los tokens ya están en
`app/app.css`, y la clase elige cuál aplica:

| Modo | Clase en `<html>` | Qué aplica de `app.css` |
|---|---|---|
| `light` | — | `:root` (claro) |
| `dark` | `dark` | `:root.dark` (oscuro) |
| `system` | `theme-system` | `:root`, y `:root.theme-system` dentro de `@media (prefers-color-scheme: dark)` |

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

En `app/app.css`, en cuatro bloques: `:root` (compartidos y variante clara),
`:root.dark`, `:root.theme-system` (solo `color-scheme`) y el `@media` que aplica
la variante oscura a `theme-system`. Los colores oscuros están escritos dos veces
—en `:root.dark` y en el `@media`— porque CSS no permite unir un selector y una
media query en una sola regla; al cambiar uno hay que cambiar el otro.

El bloque `@theme inline` de la misma hoja mapea los nombres de token a las
utilidades de Tailwind. Los que no son colores llevan el prefijo `--theme-*`
(`--theme-font-sans`, `--theme-spacing`, `--theme-shadow-*`…) para no chocar con
las claves del tema de Tailwind.

`--success`, `--warning` y `--destructive-foreground` son tokens propios: son el
destino de los `bg-green-*` / `bg-yellow-*` que estaban hardcodeados en los
badges de la tabla. En la variante oscura el alfa vive **dentro del token**.

## 5. Superficie de UI

| Dónde | Qué |
|---|---|
| Header del dashboard | Desplegable Claro / Oscuro / Sistema junto al menú de cuenta |
| Landing, login, verificación de certificado y asistencia por QR | El mismo desplegable, suelto en la esquina |
| `Toaster` de Sileo | Recibe el modo resuelto para elegir el relleno de la píldora, que va invertida (oscura en claro, clara en oscuro). Los colores de estado toman tono y croma de los tokens (`--success-foreground`, `--warning-foreground`, `--destructive`) con luminosidad fija para cada píldora: ver el bloque de Sileo en `app/app.css` |

El cambio va por `POST` a `/preferencia-tema`, una ruta **pública** —el toggle se
ofrece sin sesión, así que colgarla del layout del dashboard obligaría a estar
dentro para poder cambiar de modo.

`useThemeMode` refleja de inmediato el envío en vuelo (`fetcher.formData`), así
que el check del menú se mueve al instante; la clase de `<html>` cambia con la
revalidación del loader raíz.

## 6. Modos de fallo

| Qué falla | Qué pasa |
|---|---|
| La base no responde al leer la preferencia | Se usa el modo de la cookie o `system`. El modo **no** es una decisión de seguridad: degradar es correcto, denegar no. |
| El loader raíz falla entero | `Layout` pinta `system`. La página se pinta. |
| No se pudo guardar en la cuenta | La cookie **sí** se emitió: el usuario tiene el modo que pidió en este navegador. La respuesta lo dice con esa copia (`THEME_PREFERENCE_NOT_SAVED`). |
| Llega un modo inventado | Muere en la frontera con 400 y **sin** emitir cookie. Persistir un valor que la allowlist rechaza lo dejaría fallando en silencio en cada petición posterior. |

## 7. Advertencia de caché

**El loader raíz varía por cookie.** Hoy no hay CDN delante y no supone nada,
pero el día que se ponga uno necesita `Vary: Cookie` — sin él, una caché
compartida serviría el modo de un usuario a otro.

## 8. Mapa de archivos

| Archivo | Papel |
|---|---|
| `app/app.css` | Valores de los tokens en sus dos variantes, `@custom-variant dark` de dos ramas y `@theme inline` |
| `app/modules/theme/domain/theme.rules.ts` | `resolveThemeMode`, `themeHtmlClass` y el esquema del modo |
| `app/modules/theme/application/theme.service.server.ts` | `resolveMode` y `setMode`, envueltos en el runner |
| `app/modules/theme/infrastructure/theme.repository.server.ts` | Lee y escribe `User.themeMode` |
| `app/modules/theme/routes/preferencia-tema/index.action.ts` | Cookie + persistencia |
| `app/modules/theme/hooks/use-theme-mode.ts` | Modo actual y `setMode` para la UI |
| `app/modules/theme/components/theme-mode-toggle.tsx` | El desplegable |
| `app/core/cookies.server.ts` | `themeModeCookie` |
| `app/root.tsx` | Loader que resuelve el modo y `Layout` que pone la clase |
