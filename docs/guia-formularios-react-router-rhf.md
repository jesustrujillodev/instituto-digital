# Guía de Formularios — React Router + React Hook Form

Guía **portable y sin dominio** para construir formularios en cualquier proyecto React Router + React Hook Form: desde tres campos hasta colecciones anidadas con subida de archivos.

**Stack asumido:** React 18+ (con notas para React 19), React Router v7 en *framework mode* (`loader`/`action`), `react-hook-form` v7, `@hookform/resolvers` y **cualquier** librería de validación con resolver oficial (Zod, Valibot, Yup, ArkType, Superstruct…). La [§3.1](#31-el-contrato-es-agnóstico-de-la-librería) traduce cada concepto entre librerías; [§15](#15-adaptación-a-otros-stacks) cubre qué cambiar si falta alguna pieza del stack.

Los ejemplos usan una entidad genérica `Entity` (`name`, `description`, `type`, `status`, `categoryIds`, una colección `items` y una colección de archivos `attachments`). Sustituye esos nombres por los tuyos.

**Cómo usar esta guía**

| Situación | Empieza por |
|---|---|
| Voy a escribir un formulario | [§1](#1-elegir-el-nivel-de-formulario) para elegir el nivel, luego las [plantillas](#14-plantillas-copiables) |
| Voy a revisar uno | [§13 checklist](#13-checklist-maestro) y [§12 antipatrones](#12-antipatrones-síntoma--causa--arreglo) |
| Tengo un síntoma concreto (foco perdido, re-renders, toast doble, un campo que no valida) | [§12](#12-antipatrones-síntoma--causa--arreglo), tabla síntoma → causa → arreglo |
| Mi componente de input "no funciona con `register`" | [§7](#7-capa-6--binding-y-la-prueba-de-compatibilidad-del-wrapper) |
| No sé si mi formulario está optimizado | [§8.7](#87-cómo-medirlo-de-verdad) |

---

## 0. Las 10 capas de un formulario robusto

Un formulario no es "un componente con inputs". Son diez decisiones independientes; fallar en cualquiera produce un síntoma distinto y localizable.

| # | Capa | Pregunta que responde | Entregable |
|---|---|---|---|
| 1 | **Ubicación** | ¿Dónde vive cada cosa? | Reglas de corte ([§2](#2-capa-1--dónde-vive-cada-cosa)) |
| 2 | **Contrato** | ¿Qué datos son válidos? | Esquema + tipos derivados, compartido cliente/servidor |
| 3 | **Identidad** | ¿Cómo se enlazan label ↔ input? | `useFormIds()` |
| 4 | **Estado inicial** | ¿Con qué valores arranca? | `buildDefaultValues()` pura y testeable |
| 5 | **Configuración** | ¿Cuándo valida y qué tipos fluyen? | `useForm<In, Ctx, Out>` con `mode`/`resolver` |
| 6 | **Binding** | ¿Cómo se conecta cada control? | `register` vs `Controller`, según la prueba del wrapper |
| 7 | **Composición** | ¿Qué se re-renderiza al teclear? | `useWatch` / `useFormState` / `memo` |
| 8 | **Colecciones** | ¿Cómo se editan listas? | `useFieldArray` con un componente por fila |
| 9 | **Serialización** | ¿Cómo viaja al servidor (con archivos)? | `toFormData` + parser espejo |
| 10 | **Ciclo de envío** | ¿Qué ve el usuario al guardar? | `fetcher` + feedback + errores de servidor + guard `isDirty` |

Las capas 2, 4, 9 y 10 son **lógica pura o de servidor**: se testean sin montar React y ahí es donde más barato sale cubrirse ([§14.3](#143-tests-mínimos)).

---

## 1. Elegir el nivel de formulario

**No todos los formularios necesitan React Hook Form.** Elegir de más cuesta archivos; elegir de menos cuesta bugs.

| Señal | Nivel | Qué usar |
|---|---|---|
| ≤ 8 campos planos, sin archivos ni listas, y quieres que funcione sin JS | **0 — nativo** | `<Form method="post">` de React Router + validación en el `action`. **Sin RHF** |
| Validación en vivo, dependencias entre campos, o feedback antes de enviar | **1 — RHF en un archivo** | `useForm` + `register` + resolver, todo en el componente de la ruta |
| ≥ 10 campos, o archivos, o secciones condicionales | **2 — RHF con extracciones** | Nivel 1 + `buildDefaultValues`, `useFormIds` y un componente de formulario reutilizable entre alta y edición |
| Colecciones dinámicas, wizard, o el formulario vive en varias pantallas | **3 — patrón completo** | Nivel 2 + `FormProvider`, subcomponentes memoizados y `useFieldArray` |

Dos matices que casi siempre se pasan por alto:

- **Progressive enhancement.** Un formulario RHF **no funciona sin JavaScript**: `handleSubmit` intercepta el submit y envía por `fetcher`. Si el formulario debe funcionar sin JS (login, checkout público, formularios institucionales), quédate en el **nivel 0**: `<Form>` nativo + validación en el `action`, y añade mejoras progresivas encima. No hay forma de tener las dos cosas con el mismo código sin duplicar la lógica de envío.
- **Sube de nivel cuando aparezca el síntoma, no antes.** Pasar de 1 a 2 es mover código a funciones puras; de 2 a 3 es envolver en `FormProvider`. Ninguno de los dos saltos exige reescribir.

---

## 2. Capa 1 — Dónde vive cada cosa

Esta guía **no impone una estructura de carpetas**: cada proyecto tiene la suya (por feature, hexagonal, por tipo). Impone **reglas de corte**, que se cumplen en cualquier estructura.

1. **El contrato de validación vive donde el servidor también pueda importarlo.** Si el esquema está dentro de un archivo `.client.ts` o de un componente, el `action` no podrá reutilizarlo y acabarás con dos validaciones que divergen.
2. **Toda transformación de datos sale del componente a una función pura.** Regla operativa: *si tiene un `.map()` con lógica, no va en el JSX ni en el `onSubmit`*. Las dos transformaciones obligatorias son `buildDefaultValues` (entidad → formulario) y `buildPayload` (formulario → API).
3. **Alta y edición son el mismo componente**, con `mode: 'create' | 'edit'` o `isEdit = !!initialData`. Dos componentes gemelos divergen en la primera semana.
4. **El orquestador no pasa de ~150 líneas.** Si crece, es que una sección se quedó inline o una transformación no se extrajo.
5. **Un bloque se extrae a subcomponente cuando cumple una de dos condiciones**: lo gobierna un `useFieldArray`, o necesita `useWatch` (para que el re-render quede acotado ahí). Extraer "para ordenar" sin ninguna de las dos solo añade indirección.
6. **Las utilidades genéricas** (`useFormIds`, `toFormData`, el parser, el hook de feedback) van a la carpeta compartida del proyecto, **nunca dentro del módulo del formulario**: son las cuatro piezas que se copian tal cual entre proyectos ([§14](#14-plantillas-copiables)).

Estructura *de ejemplo* para el nivel 3 — adáptala, no la copies literalmente:

```
<módulo>/
├── <entity>.rules.ts          # esquema base + derivados por modo (create/update)
├── hooks/
│   └── use-<entity>-form-ids.ts
├── utils/
│   ├── build-default-values.ts   # entidad → valores del formulario  (pura)
│   ├── build-payload.ts          # valores del formulario → API      (pura)
│   └── parse-<entity>-form-data.ts  # FormData → objeto              (servidor)
├── components/
│   ├── <entity>-form.tsx      # orquestador
│   ├── <bloque>-section.tsx   # bloques con useWatch o muy grandes
│   └── <coleccion>-manager.tsx  # bloques con useFieldArray
└── routes/<ruta>/{index.tsx, index.loader.ts, index.action.ts}
```

---

## 3. Capa 2 — El contrato

### 3.1 El contrato es agnóstico de la librería

Todo lo que sigue funciona igual con Zod, Valibot, Yup o ArkType. Solo cambia la sintaxis y el resolver:

| Concepto | Zod | Valibot | Yup |
|---|---|---|---|
| Objeto | `z.object({…})` | `v.object({…})` | `yup.object({…})` |
| Parcial | `.partial()` | `v.partial(schema)` | `.partial()` |
| Omitir campos | `.omit({ id: true })` | `v.omit(schema, ['id'])` | `.omit(['id'])` |
| Enum | `z.enum([...])` | `v.picklist([...])` | `yup.mixed().oneOf([...])` |
| Tipo de **entrada** | `z.input<S>` | `v.InferInput<S>` | *(no distingue)* |
| Tipo de **salida** | `z.output<S>` | `v.InferOutput<S>` | `yup.InferType<S>` |
| Coerción numérica | `z.coerce.number()` | `v.pipe(v.string(), v.transform(Number), v.number())` | `yup.number()` *(coerce por defecto)* |
| Validación cruzada | `.superRefine((d, ctx) => ctx.addIssue({ path, … }))` | `v.forward(v.partialCheck([...], fn, msg), ['campo'])` | `.test(…)` + `createError({ path })` |
| Resolver | `zodResolver(s)` | `valibotResolver(s)` | `yupResolver(s)` |

Todos vienen de `@hookform/resolvers/<librería>`. **La elección casi nunca importa para el patrón**; sí para el bundle (Valibot y ArkType tree-shakean mucho mejor que Zod) y para la ergonomía de la validación cruzada (Zod es la más directa).

Lo que **no** es negociable, uses la que uses:

- **Un solo contrato, importado por cliente y servidor.** La validación de cliente es UX; la de servidor es la que manda. Si divergen, tendrás formularios que pasan y APIs que fallan.
- **Los mensajes se redactan para el usuario final, en español y nombrando el campo.** Esa cadena se pinta tal cual bajo el input, así que se escribe en el segundo argumento de cada acción de valibot (`v.minLength(3, 'El título debe tener al menos 3 caracteres.')`) dentro del `<modulo>.rules.ts` que declara el campo. `app/shared/rules/messages.rules.ts` traduce el mensaje por defecto de valibot y es solo la red de seguridad: si en pantalla se lee uno de sus mensajes genéricos, es que falta el mensaje del campo.
- **Normaliza cadenas vacías antes de validar formatos.** Un `<select>` sin elegir manda `''`, y `''` no es un UUID ni un email:
  ```ts
  // Zod
  const optionalUuid = z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional())
  // Valibot
  const optionalUuid = v.optional(v.pipe(v.string(), v.uuid()))  // + descartar '' en el parser
  ```
- **Los límites son parte del contrato**, no del componente: máximo de filas de una colección, tamaño y tipo de archivo, longitud de texto. Si el límite solo vive en el `<input maxLength>`, no existe.

### 3.2 Los tres genéricos de `useForm`

```ts
type EntityFormInput  = z.input<typeof entitySchema>   // lo que el usuario teclea: "30"
type EntityFormOutput = z.output<typeof entitySchema>  // lo validado y coercionado: 30

const methods = useForm<EntityFormInput, unknown, EntityFormOutput>({ resolver })
//                      ^valores del form  ^context  ^lo que recibe handleSubmit
```

Ese tercer genérico es la diferencia entre `onSubmit(data: EntityFormOutput)` y el `onSubmit(data: Record<string, unknown>)` que aparece en todo formulario que no lo declara — justo en el punto donde más falta hace el tipado. Omitirlo es el error de tipos más común del ecosistema.

### 3.3 Modos que difieren: define el esquema **del formulario**, no reutilices el de la API

Aquí está la trampa más costosa del patrón, y merece detalle porque el error es sutil y aparece siempre.

Es tentador validar el formulario directamente con los esquemas de la API (`createEntitySchema` en alta, `updateEntitySchema` en edición). Pero esos dos esquemas **tienen formas distintas**: el de creación exige campos que el de actualización declara opcionales. Y el tipo del formulario es uno solo. Resultado:

```ts
// ❌ No compila: Resolver<T> es contravariante en sus valores, y el input de
//    updateSchema (todo opcional) no es asignable al de createSchema.
const resolver = valibotResolver(isEdit ? updateSchema : createSchema)
const methods = useForm<EntityFormValues>({ resolver })
```

Hay tres salidas, en orden de calidad:

**a) Recomendada — un esquema propio del formulario, y `buildPayload` para la API.**
El formulario tiene *su* forma: todos los campos presentes, todos string (es lo que el DOM produce). Los modos se diferencian en las **reglas**, no en la **forma**:

```ts
// La forma es idéntica en ambos modos; solo cambia el rigor.
const entityFormShape = {
  name: z.string(),
  email: z.string(),
  amount: z.string(),
  password: z.string(),
}

export const createFormSchema = z.object({
  ...entityFormShape,
  name: z.string().min(1, 'El nombre es requerido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

export const editFormSchema = z.object({
  ...entityFormShape,
  name: z.string().min(1, 'El nombre es requerido'),
  password: z.string(),          // presente pero sin exigir: no se edita aquí
})

export type EntityFormValues = z.input<typeof createFormSchema>
```

Ambos esquemas producen el **mismo** `EntityFormValues`, el resolver tipa sin fricción, y la conversión a los DTOs de la API vive en `buildPayload` — una función pura y testeable. Ventaja añadida: la API puede cambiar la forma de sus DTOs sin tocar el formulario.

**b) Aceptable — un cast del resolver, comentado.**
Si reutilizar los esquemas de la API pesa más que la pureza de tipos (por ejemplo, porque el proyecto exige "un solo contrato" literalmente), el cast es honesto siempre que la validación real no cambie:

```ts
// El cast expresa "resolver de un esquema que valida un SUBCONJUNTO de los
// valores del formulario". La regla que corre es la misma que en el servidor.
const resolver = useMemo(
  () => valibotResolver(isEdit ? updateRule : createRule) as unknown as Resolver<EntityFormValues>,
  [isEdit],
)
```

**c) Desaconsejada — dos componentes.** Divergen en la primera semana.

> **Memoiza siempre el resolver** si depende de algo (`isEdit`, un catálogo, un límite). Sin `useMemo` se recrea en cada render y RHF revalida de más.

### 3.4 Validación cruzada: contexto en el esquema, nunca campos fantasma

Cuando una regla depende de datos que **no son del formulario** (un ID de catálogo, el límite del plan del usuario, la fecha del servidor), la tentación es meterlo como campo oculto para poder leerlo en el refinamiento. No lo hagas: obliga a registrarlo, arrastrarlo en el estado y **borrarlo a mano antes de enviar** — y tarde o temprano se envía.

Ciérralo con un factory:

```ts
interface SchemaContext { unlimitedOptionId?: string; maxItems?: number }

export const buildEntitySchema = (ctx: SchemaContext = {}) =>
  baseSchema.superRefine((data, issues) => {
    if (data.amount > 0 && data.unitId === ctx.unlimitedOptionId) {
      issues.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Si hay cantidad, la unidad no puede ser "Ilimitado"',
        path: ['unitId'],   // ← el error se pinta en SU campo
      })
    }
  })
```

> **`path` siempre.** Un refinamiento sin `path` produce un error de raíz que ningún campo pinta: el usuario ve el submit fallar sin saber dónde. Es la causa nº 1 de "el formulario no guarda y no dice por qué".

---

## 4. Capa 3 — Identidad y accesibilidad

### 4.1 Qué problema resuelve `useFormIds`

Cada control necesita un `id` para que `<label htmlFor>` funcione: lectores de pantalla, click en la etiqueta para enfocar, y `getByLabelText` en los tests. Con ids literales (`id="name"`) aparecen tres problemas:

1. **Colisión** si el formulario se monta dos veces (página + modal, dos pasos de un wizard, edición inline en una tabla).
2. **Hydration mismatch** en SSR si se generan con `Math.random()` o un contador global.
3. **Refactor frágil**: el string está duplicado en el label y en el input.

`useId()` de React resuelve los tres. Un `useId()` por campo también funciona, pero devuelve **un objeto nuevo en cada render** y eso anula cualquier `memo()` aguas abajo. Un solo `useId` como prefijo + `useMemo`:

```ts
// shared/hooks/use-form-ids.ts
import { useId, useMemo } from 'react'

/**
 * IDs únicos y estables (SSR-safe) para enlazar labels con controles.
 *
 * `keys` debe ser una constante a nivel de módulo, no un literal inline: el memo
 * depende de su identidad y un array nuevo por render devolvería un objeto nuevo
 * cada vez.
 */
export function useFormIds<const K extends readonly string[]>(
  keys: K,
): Record<K[number] | 'form', string> {
  const prefix = useId()

  return useMemo(
    () => Object.fromEntries(['form', ...keys].map((k) => [k, `${prefix}${k}`])) as Record<K[number] | 'form', string>,
    [prefix, keys],
  )
}
```

```ts
// <módulo>/hooks/use-entity-form-ids.ts
const FIELD_KEYS = ['name', 'description', 'type', 'status'] as const
export type EntityFormIds = ReturnType<typeof useEntityFormIds>
export const useEntityFormIds = () => useFormIds(FIELD_KEYS)
```

> `const K` requiere TypeScript 5.0+. En versiones anteriores: `useFormIds<K extends string>(keys: readonly K[])` y llamada con `as const`.
>
> Si tu linter tiene la regla de dependencias exhaustivas de hooks, depender de `keys` (y no de un `keys.join('|')`) es lo que la deja contenta **y** lo correcto, siempre que respetes la constante de módulo.

### 4.2 La clave `form`: el botón de guardar fuera del `<form>`

```tsx
<form id={ids.form} onSubmit={handleSubmit(onSubmit, onInvalid)}>…</form>

{/* En un header sticky, una barra fija o el footer de un modal */}
<PageHeader actions={<Button type="submit" form={ids.form}>Guardar</Button>} />
```

`form={ids.form}` (atributo HTML estándar) conecta el botón con el formulario aunque estén en ramas distintas del árbol, **con validación incluida**. Sin un id estable no es posible, y es la razón principal por la que este hook existe.

Consecuencia de diseño: si el botón vive fuera, el estado de envío también tiene que estar fuera. Sube el `fetcher` al componente que renderiza ambos y pásalo al formulario — no lo escondas dentro.

### 4.3 Checklist de accesibilidad (barata y completa)

- Todo control con `id` y su `<label htmlFor>` apuntando **a ese id**. Un `htmlFor={name}` cuando el input no recibe `id={name}` es una etiqueta rota que parece correcta.
- `aria-invalid` en el control cuando hay error.
- `aria-describedby` apuntando al id del mensaje de error **o** del texto de ayuda (no ambos a la vez, y el error tiene prioridad).
- El mensaje de error con `role="alert"` para que se anuncie al aparecer.
- Requeridos marcados visualmente **y** con `required` / `aria-required`.
- `type="button"` en **todos** los botones que no son el submit (añadir fila, quitar, generar…). Un `<button>` sin `type` dentro de un `<form>` envía el formulario.
- Grupos de radios/checkboxes en `<fieldset>` con `<legend>`.
- Navegable con teclado de principio a fin y con foco visible.

Un wrapper de input bien hecho resuelve los cinco primeros puntos de una vez para todo el proyecto. Ese es su verdadero valor.

---

## 5. Capa 4 — Estado inicial (`defaultValues`)

### 5.1 Las cinco reglas

1. **Todo campo del formulario aparece en los defaults.** Uno ausente arranca `undefined` → el input nace *uncontrolled*, React avisa en consola cuando reciba un valor, y **`isDirty` deja de ser fiable** — lo que a su vez rompe el guard de cambios sin guardar.
2. **Nunca `undefined` como valor**: `?? ''` (texto), `?? []` (listas), `?? false` (booleanos), `?? null` solo si tu API distingue null de ausente. *Excepción deliberada:* un número opcional puede ser `undefined` para que el input salga vacío en vez de mostrar `0`.
3. **La normalización backend → formulario ocurre aquí**, no en el render ni en el submit. Si la API devuelve `owner: string | { name: string }`, el formulario debe ver siempre la misma forma.
4. **Precedencia explícita por modo.** En edición manda lo guardado; en alta, el contexto (usuario, tenant, query params). Un `contexto ?? guardado` reasigna el registro con solo abrirlo — bug clásico y difícil de ver.
5. **Función pura, fuera del componente, memoizada al usarla.**

```ts
export function buildEntityDefaults(
  initialData: Entity | null | undefined,
  { user, defaultUnitId }: BuildContext = {},
): EntityFormValues {
  const isEdit = !!initialData

  return {
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
    type: initialData?.type ?? 'A',                                   // enum: valor de negocio, nunca ''
    teamId: isEdit ? (initialData?.teamId ?? null) : (user?.teamId ?? null),  // precedencia por modo
    amount: initialData?.amount ?? undefined,                          // numérico opcional: input vacío
    isFeatured: initialData?.isFeatured ?? false,
    categoryIds: initialData?.categoryIds ?? [],
    items: (initialData?.items ?? []).map((item) => ({
      ...item,
      notes: item.notes ?? [],                                         // garantiza sub-colecciones
    })),
  }
}
```

La ventaja de la función pura es que **los casos raros del API quedan documentados como tests** en vez de como condicionales en el JSX.

### 5.2 `defaultValues` vs `values` vs `reset` vs `key`

| Situación | Qué usar |
|---|---|
| Los datos llegan por el `loader` antes de montar | `defaultValues` |
| Los datos llegan después (fetch en cliente, streaming, `Await`) | `values: data` + `resetOptions: { keepDirtyValues: true }` |
| Cambia el registro sin desmontar (drawer, edición inline en tabla) | `key={initialData?.id ?? 'new'}` en el componente del formulario |
| Volver al estado inicial tras guardar y quedarse en la pantalla | `reset(nuevosDefaults)` en el `onSuccess` |

Prefiere `key` sobre `reset` cuando puedas: remontar es más barato de razonar que sincronizar, y limpia de golpe field arrays, foco y errores.

---

## 6. Capa 5 — Configuración de `useForm`

```tsx
const methods = useForm<FormInput, unknown, FormOutput>({
  resolver,                    // memoizado si depende de algo
  defaultValues,               // memoizado
  mode: 'onTouched',
  reValidateMode: 'onChange',
  shouldFocusError: true,
  criteriaMode: 'firstError',
})
```

| Opción | Recomendación | Por qué |
|---|---|---|
| `mode` | `onTouched` | `onChange` valida el esquema **completo** (refinamientos y arrays incluidos) en cada tecla. `onBlur` no reacciona al corregir |
| `reValidateMode` | `onChange` | Una vez que el usuario ya vio el error, corregirlo debe apagarlo al instante |
| `shouldFocusError` | `true` | Enfoca el primer inválido al fallar el submit — solo campos con `ref` ([§11.2](#112-fallo-de-validación-en-el-submit)) |
| `shouldUnregister` | `false` (por defecto) | Con `true` pierdes lo escrito al ocultar una sección condicional |
| `criteriaMode` | `firstError` | `all` solo sirve si pintas listas de errores por campo |
| `delayError` | `300`–`500` ms | Solo si el formulario "se siente nervioso" al escribir |
| `disabled` | v7.42+ | Deshabilita el formulario entero (todos los campos registrados) mientras se envía, en vez de propagar `disabled` a mano |
| `resolver` | Uno solo | Las reglas asíncronas (unicidad de email) van en el `action`, no en el resolver: ahí sí hay una fuente de verdad |

---

## 7. Capa 6 — Binding y la prueba de compatibilidad del wrapper

React Hook Form es rápido porque los inputs son **no controlados**: escriben en refs, no en estado de React. `register()` conserva esa propiedad; `Controller` la sacrifica (re-renderiza ese campo en cada tecla, lo cual está perfectamente bien para un `<Select>`, no para un `<textarea>` largo).

### 7.1 Cuál usar

| Caso | Binding |
|---|---|
| `<input>`, `<textarea>`, `<select>` nativos | `{...register('field')}` |
| Wrapper propio que **pasa la prueba** de §7.2 | `{...register('field')}` |
| Componente con API propia (`onValueChange`, `onCheckedChange`, `checked`, `value` obligatorio): Select, Switch, Checkbox, MultiSelect, DatePicker, editor rico | `<Controller>` |
| Wrapper que **no pasa** la prueba y no puedes modificarlo | `<Controller>` |
| Transformar antes de guardar (string→número, máscara) | `register(name, { valueAsNumber: true })` o `<Controller>` |
| `<input type="file">` | Ver [§10.4](#104-el-caso-especial-de-los-archivos) — no es tan simple como "usa Controller" |

### 7.2 La prueba de compatibilidad (los 6 puntos)

Esta es la sección que evita la pregunta recurrente *"¿por qué mi input no valida / no marca dirty / no envía nada?"*. Un wrapper es compatible con `register()` **si y solo si** cumple los seis:

```tsx
<TextInput label="Nombre" {...register('name')} />
// register devuelve: { name, onChange, onBlur, ref }
```

1. **Acepta y reenvía `ref` al `<input>` del DOM.**
   En React 19 `ref` es una prop normal de los componentes de función: basta con tiparla y reenviarla. En React ≤18 hace falta `forwardRef`.
   *Trampa de tipos:* `React.InputHTMLAttributes<HTMLInputElement>` **no incluye `ref`**; `React.ComponentProps<'input'>` **sí**. Si tu tipo de props deriva del primero, TypeScript rechazará el spread de `register()` con un error confuso sobre `ref`.

2. **Si el wrapper ya usa un `ref` interno, lo compone — no lo sustituye.**
   Un botón "generar contraseña", un autofocus o una medición necesitan su propio ref. Si el wrapper hace `<input ref={interno} {...props} />`, el `ref` de `register` (que viaja dentro de `props`, y va después) lo pisa; si lo hace al revés, el que se pierde es el de `register`. Ninguna de las dos es aceptable:

   ```tsx
   const setRefs = (node: HTMLInputElement | null) => {
     internoRef.current = node
     if (typeof ref === 'function') ref(node)
     else if (ref) ref.current = node
   }
   <input ref={setRefs} {...props} />
   ```

3. **Si intercepta `onChange`, muta el evento original; nunca clona el target.**
   Este es el fallo más difícil de diagnosticar. Un wrapper de teléfono que filtra dígitos suele escribirse así:

   ```tsx
   // ❌ el clon pierde name y ref: RHF no sabe a qué campo pertenece el cambio
   const handleChange = (e) => onChange?.({ ...e, target: { ...e.target, value: limpio } })

   // ✅ el evento sigue siendo el mismo nodo del DOM
   const handleChange = (e) => { e.target.value = limpio; onChange?.(e) }
   ```

   Con el clon, el campo simplemente **no se registra ningún valor** y no hay ningún error visible.

4. **El orden del spread no anula los handlers.**
   `{...props}` después de `onChange={miHandler}` hace que gane el de `register` y se pierda el del wrapper; al revés, se pierde el de `register`. La forma correcta es extraer el handler de las props y llamarlo desde el propio:

   ```tsx
   function TextInput({ uppercase, onChange, ...props }: Props) {
     return <input {...props} onChange={(e) => {
       if (uppercase) e.target.value = e.target.value.toUpperCase()
       onChange?.(e)              // el de register
     }} />
   }
   ```

5. **Acepta `id` y lo usa tanto en el input como en el `htmlFor` del label** (`htmlFor={props.id ?? props.name}`).

6. **No fuerza `value` ni `defaultValue`.** En cuanto el wrapper impone `value`, el input pasa a controlado y `register` deja de gobernarlo: ahí sí toca `Controller`.

**Prueba rápida (30 segundos, sin escribir tests):** registra el campo, escribe una letra y comprueba en React DevTools que `formState.isDirty` pasa a `true` y que `getValues()` trae lo tecleado. Si no, revisa los puntos 1–4 en ese orden.

> **Arreglar el wrapper suele ser la mejor inversión.** Envolver todo en `Controller` para no tocar un componente compartido esconde el problema y lo hereda cada formulario futuro del proyecto. Los seis puntos son cambios de una o dos líneas cada uno.

### 7.3 `Controller`, bien usado

```tsx
<Controller
  control={control}
  name="type"
  render={({ field, fieldState }) => (
    <SelectInput
      id={ids.type}
      value={field.value}
      onValueChange={field.onChange}
      onBlur={field.onBlur}            // sin esto, mode:'onTouched' nunca dispara
      error={fieldState.error?.message}
    />
  )}
/>
```

Dos detalles que se olvidan siempre: **conectar `field.onBlur`** (si no, `onTouched` no valida nunca ese campo) y **leer el error de `fieldState`** en vez de bucear en `errors`.

Para un componente de campo reutilizable, `useController` es la misma API sin render prop y compone mejor:

```tsx
export function SelectField({ name, ...rest }: Props) {
  const { field, fieldState } = useController({ name })
  return <SelectInput {...rest} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
}
```

### 7.4 `setValue` no sustituye a `Controller`

`onValueChange={(v) => setValue('type', v)}` **no** marca *touched*, **no** revalida y **no** actualiza `isDirty` salvo que pases `{ shouldValidate: true, shouldDirty: true, shouldTouch: true }`. Si escribes esas tres opciones más de una vez, ya deberías estar usando `Controller`.

Peor todavía: `defaultValue={valorObservado}` en un componente controlado. Mezcla los dos modos y hace que el componente **ignore** cambios externos (un `reset()`, un `setValue` programático, la respuesta del servidor).

`setValue` es legítimo para **efectos entre campos**: "al marcar *entrega inmediata*, limpia la cantidad".

### 7.5 Campos ocultos

No uses `<input type="hidden" {...register('status')} />` para "asegurar" que un valor se envía: con RHF el `<form>` **no** se envía de forma nativa, el valor ya está en el estado y se serializa en el `onSubmit`. Los hidden inputs solo tienen sentido dentro de field arrays, para conservar los IDs de backend de cada fila ([§9](#9-capa-8--colecciones-dinámicas)).

---

## 8. Capa 7 — Composición y rendimiento

Reglas en orden de impacto real.

### 8.1 `useWatch` en la hoja, nunca `watch` en la raíz

```tsx
const type = methods.watch('type')                                 // ❌ re-renderiza TODO el formulario
const type = useWatch({ control: methods.control, name: 'type' })  // ✅ solo este componente
```

Y mejor aún: **mueve el `useWatch` al componente más pequeño que necesita el dato**. Si solo un badge depende de `status`, el `useWatch` va dentro del badge. Para leer un valor dentro de un handler (sin re-renderizar nada), `getValues()`.

### 8.2 `useFormState` para el estado, igual que `useWatch` para los valores

Menos conocido y del mismo valor: `formState` desestructurado del `useForm` raíz suscribe **al componente raíz**. Si solo un botón necesita `isDirty` y solo un bloque necesita `errors`, sepáralos:

```tsx
const { isDirty } = useFormState({ control })                 // suscripción acotada a este componente
const { errors } = useFormState({ control, name: 'items' })   // acotada además a ese subárbol
```

`formState` es un **Proxy**: solo se suscribe a lo que realmente desestructuras. Corolario: **no desestructures `isValid` "por si acaso"** — activa la validación del esquema completo en cada cambio, que es exactamente lo que `mode: 'onTouched'` intentaba evitar.

### 8.3 Contexto, no prop-drilling

```tsx
<FormProvider {...methods}>
  <form id={ids.form} onSubmit={methods.handleSubmit(onSubmit, onInvalid)}>
    <BasicInfoSection ids={ids} />
    <ItemsManager />
  </form>
</FormProvider>
```

```tsx
export const BasicInfoSection = memo(function BasicInfoSection({ ids }: Props) {
  const { register, formState: { errors } } = useFormContext<FormInput>()
  …
})
```

Pasar `control` por props funciona, pero obliga a encadenar props en cada nivel. Con **`useFormContext<T>()` tipado** la sección es autónoma y los errores anidados se leen sin castings: `errors.items?.[i]?.label?.message` compila solo.

> Si te ves escribiendo `errors as MiInterfazInventada`, es que a `useFormContext()` le falta el genérico.

### 8.4 `memo()` solo sirve si **todas** las props son estables

```tsx
<MultiSelect options={cats.map((c) => ({ value: c.id, label: c.name }))} />  // ❌ memo decorativo
const options = useMemo(() => cats.map((c) => ({ value: c.id, label: c.name })), [cats])
<MultiSelect options={options} />                                            // ✅
```

> **Regla práctica:** si una prop se escribe con `{`, `[` o `=>` directamente en el JSX y el hijo es `memo()`, el `memo()` no hace nada. Aplica igual a `ids={{ ...ids }}`, `user={{ a, b }}` y `onChange={() => …}`.

### 8.5 `useMemo` con criterio

| Caso | ¿`useMemo`? |
|---|---|
| Deriva de un catálogo y se pasa a un hijo memoizado | Sí |
| Es dependencia de otro `useMemo` / `useEffect` | Sí |
| `find()` / `filter()` sobre listas de cientos de elementos | Sí |
| Booleano barato usado en el mismo render (`const isEdit = !!initialData`) | No |

El criterio es **la identidad de la referencia**, no el coste del cálculo. Memoizar de más añade ruido; memoizar de menos rompe la cadena entera de `memo()` aguas abajo.

### 8.6 Colecciones: un componente por fila

```tsx
{fields.map((field, index) => <ItemRow key={field.id} index={index} onRemove={remove} />)}
```

Si cada fila se registra por su cuenta con `useFormContext()`, teclear en la fila 5 no re-renderiza la 1. Si en cambio el manager lee `watch('items')` y baja valores por props, **cada tecla re-renderiza la lista entera**.

### 8.7 Cómo medirlo de verdad

No optimices a ciegas; el diagnóstico es rápido:

1. **React DevTools → Profiler → "Highlight updates when components render".** Escribe una letra en un campo. Si parpadea todo el formulario, tienes un `watch()` o un `formState` en la raíz.
2. **Profiler grabando**, escribe 5 letras y mira el flamegraph: cualquier componente que aparezca y no contenga el campo tecleado es un re-render de más.
3. **Objetivo realista**: teclear en un campo debe re-renderizar **ese campo** (con `Controller`) o **nada** (con `register`). El único re-render legítimo del formulario completo es cuando cambia `isDirty` de `false` a `true`, y ocurre una sola vez.

---

## 9. Capa 8 — Colecciones dinámicas

Cada colección es un componente autónomo que **no recibe props del formulario**:

```tsx
export function ItemsManager() {
  const { fields, append, remove } = useFieldArray({ name: 'items' })

  // El objeto de alta debe traer TODAS las claves, incluidas las anidadas
  const addItem = () => append({ label: '', quantity: 0, notes: [] })

  return (
    <section>
      <header><h3>Elementos</h3><Button type="button" onClick={addItem}>Agregar</Button></header>
      {fields.length === 0
        ? <EmptyState onAdd={addItem} />
        : fields.map((field, index) => <ItemRow key={field.id} index={index} onRemove={remove} />)}
    </section>
  )
}
```

Checklist de un manager:

- [ ] **`key={field.id}`**, jamás `key={index}`. Con el índice, borrar la fila 2 hace que React reutilice el DOM de la 3: el foco y los valores saltan.
- [ ] `append()` con el objeto **completo**, sub-arrays incluidos. Un `append({})` deja inputs sin registrar y errores imposibles de leer.
- [ ] Estado vacío con CTA. Una lista vacía sin botón parece un bug.
- [ ] Botón de borrar por fila con **`type="button"`**.
- [ ] Numeración visible (`#1`, `#2`) para que los mensajes de error sean ubicables.
- [ ] IDs de backend en hidden inputs, para distinguir alta de edición al guardar: `<input type="hidden" {...register(\`items.${index}.id\`)} />`.
- [ ] **Nunca `update()` por tecleo**: desmonta y remonta la fila → pérdida de foco. Para texto, `register()`. `update()` es para cambios estructurales.
- [ ] Con `move()` / reordenamiento, el índice se pasa **siempre por props**, nunca capturado en una closure memoizada.

**Anidadas:** el `name` se compone con el índice del padre (`` `items.${itemIndex}.notes` ``). **Máximo dos niveles**: un tercero casi siempre significa que ese bloque merece su propia pantalla o modal.

**Límites:** valida el máximo de filas en el esquema (`.max(50, 'Máximo 50 elementos')`), no solo en el botón. Por encima de ~100 filas editables, virtualiza o pagina: RHF aguanta, el DOM no.

---

## 10. Capa 9 — Serialización y archivos

### 10.1 `toFormData`

Con archivos no hay alternativa: `multipart/form-data` es el único transporte, y `FormData` solo admite strings y `File`.

```ts
// shared/lib/form-data.ts
/**
 * - File            → se adjunta directo
 * - File[]          → cada archivo con la MISMA clave (leer con getAll)
 * - array / objeto  → JSON.stringify (una sola entrada)
 * - primitivos      → String(value)
 * - null/undefined  → se OMITEN
 */
export function toFormData(obj: Record<string, unknown>): FormData {
  const fd = new FormData()

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue

    if (value instanceof File) fd.append(key, value)
    else if (Array.isArray(value)) {
      if (value.length > 0 && value[0] instanceof File) for (const f of value) fd.append(key, f as File)
      else fd.append(key, JSON.stringify(value))
    }
    else if (typeof value === 'object') fd.append(key, JSON.stringify(value))
    else fd.append(key, String(value))
  }

  return fd
}
```

Consecuencias que hay que tener presentes **siempre**:

| Regla | Implicación en el servidor |
|---|---|
| `null`/`undefined` se omiten | El backend no distingue "no enviado" de "borrar" — ver §10.2 |
| Booleanos → `"true"` / `"false"` | Hay que convertirlos de vuelta |
| Números → string | Por eso el esquema coerciona |
| Arrays de objetos → **una** entrada JSON | Parsear con `JSON.parse` |
| Arrays de archivos → **N** entradas misma clave | Leer con `getAll()` |
| Array mixto (objetos con `File` dentro) | **No soportado**: hay que partirlo ([§10.5](#105-colecciones-de-archivos-metadatos--binarios)) |

### 10.2 Vaciar un campo: el centinela

`FormData` no puede transportar `null`, y una cadena vacía es ambigua: puede significar "el usuario borró el teléfono" o "este campo no aplica". Si tu parser descarta las cadenas vacías (lo habitual, porque `''` no pasa una validación de formato), **borrar un campo opcional se vuelve imposible**: el usuario vacía el input, guarda, y el valor anterior sigue ahí.

Decide explícitamente cuál de las tres semánticas quieres, y documéntala:

| Semántica | Cómo | Cuándo |
|---|---|---|
| **PATCH** — lo ausente no se toca | Descartar `''` en el parser | Formularios parciales, actualizaciones por secciones |
| **PUT** — lo ausente se borra | Mapear `''` → `null` en el parser | El formulario muestra *todos* los campos de la entidad |
| **Centinela explícito** | Enviar `'__NULL__'` y traducirlo en el parser | Cuando conviven ambas y no puedes elegir |

No hay opción "por defecto correcta": elegir sin darte cuenta es cómo aparece el bug de "no puedo borrar mi teléfono".

### 10.3 El parser del servidor es el espejo del cliente

`toFormData` no es reversible sola: el servidor necesita saber qué claves son JSON, cuáles archivos y cuáles booleanos.

```ts
// shared/lib/parse-form-data.ts
interface ParserConfig {
  fileArrays?: readonly string[]   // leer con getAll()
  files?: readonly string[]        // un solo File
  json?: readonly string[]         // JSON.parse
  booleans?: readonly string[]     // "true" / "on" / "1" → true
}

export function createFormDataParser(config: ParserConfig) {
  const { fileArrays = [], files = [], json = [], booleans = [] } = config

  return function parse(formData: FormData) {
    const data: Record<string, unknown> = {}

    // Nota: Object.fromEntries(formData) mete los File como si fueran campos.
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') data[key] = value
    }

    for (const field of files) {
      const entry = formData.get(field)
      data[field] = entry instanceof File && entry.size > 0 ? entry : null
    }
    for (const field of fileArrays) {
      data[field] = formData.getAll(field).filter((v): v is File => v instanceof File && v.size > 0)
    }
    for (const field of json) {
      const raw = data[field]
      if (typeof raw !== 'string') continue
      try { data[field] = JSON.parse(raw) }
      catch { return { success: false as const, error: `Error al parsear ${field}` } }
    }
    for (const field of booleans) {
      const raw = data[field]
      if (raw !== undefined) data[field] = raw === 'true' || raw === 'on' || raw === '1'
    }

    return { success: true as const, data }
  }
}
```

Dos avisos de campo:

- **`Object.fromEntries(formData)` es una trampa con archivos**: mete el `File` como si fuera un campo de texto y tu validador lo rechazará con un mensaje incomprensible. Filtra por `typeof value === 'string'` o extrae los archivos primero.
- **Los tipos de `FormData` mienten en algunos runtimes.** Bun, por ejemplo, declara `entries()` como `[string, string]`, así que `value instanceof File` ni siquiera compila ahí. `formData.get(key)` sí está bien tipado (`File | string | null`): úsalo para los archivos y deja `entries()` para el texto — que además es exactamente lo que quieres.

Y el `action` **revalida con el mismo contrato**:

```ts
export async function action({ request }: Route.ActionArgs) {
  try {
    const parsed = parseEntityFormData(await request.formData())
    if (!parsed.success) return { success: false, error: parsed.error }

    const { attachmentFiles, ...entityData } = parsed.data
    const dto = entitySchema.parse(entityData)          // el MISMO esquema del cliente
    await service.update(dto, attachmentFiles)

    return { success: true, message: 'Guardado exitosamente' }
  } catch (error) {
    if (error instanceof Response) throw error          // redirects y 401 pasan de largo
    if (isValidationError(error)) {
      return {
        success: false,
        error: 'Revisa los datos del formulario.',
        fieldErrors: toFieldErrors(error),              // { 'items.0.label': 'Requerido' }
      }
    }
    logger.error('unexpected error', { error })
    return { success: false, error: 'Ha ocurrido un error inesperado.' }
  }
}
```

> **El parser es la pieza más frágil del patrón** — listas de claves mantenidas a mano que se desincronizan del esquema en cuanto alguien añade un campo — y la más barata de cubrir: un test que construya un `FormData` real y compare la salida.

### 10.4 El caso especial de los archivos

"Los archivos van con `Controller`" es una simplificación. Hay dos estrategias y la elección importa:

| Estrategia | Cuándo | Coste |
|---|---|---|
| **`File` dentro de RHF** (`Controller` sobre el campo) | El archivo es **obligatorio** o participa en validaciones cruzadas; o es parte de una colección (`useFieldArray`) | El esquema tiene que declarar un `File`, que en el servidor no es el mismo tipo. Suele obligar a esquemas distintos cliente/servidor — justo lo que queremos evitar |
| **`File` en `useState`, fuera de RHF** | El archivo es **opcional** e independiente de los demás campos | Ninguno relevante: el contrato de validación queda limpio de tipos del navegador, y el archivo se añade al `FormData` en el `onSubmit` |

Regla práctica: **si el archivo no participa en ninguna regla del esquema, no lo metas en el esquema.** Un `useState<File | null>` más una validación explícita de tipo y tamaño es más simple y no contamina el contrato compartido.

En ambos casos:

- **Valida tipo y tamaño en cliente y en servidor, con la misma función y las mismas constantes.** Un módulo con `{ allowedTypes, maxBytes }` importado por los dos lados es todo lo que hace falta; dos listas separadas se desincronizan.
- **Muestra siempre el nombre del archivo actual** y un botón "Cambiar archivo". Un `<input type="file">` **no se puede pre-cargar** por seguridad del navegador: el estado "ya hay archivo" es tuyo, no del DOM.
- **Revoca los object URLs** de las previsualizaciones: `URL.createObjectURL` en un efecto y `URL.revokeObjectURL` en su cleanup. Sin eso, el blob se retiene toda la sesión.

### 10.5 Colecciones de archivos: metadatos + binarios

Un `File` no sobrevive a `JSON.stringify`. Por eso una **colección** de archivos se parte en dos claves, correlacionadas por orden:

```ts
const onSubmit: SubmitHandler<FormOutput> = (data) => {
  const attachments = data.attachments ?? []
  fetcher.submit(
    toFormData({
      ...data,
      attachments: attachments.map(({ file: _f, ...meta }) => meta),                 // sin binarios
      attachmentFiles: attachments.flatMap((a) => (a.file instanceof File ? [a.file] : [])),
    }),
    { method: 'POST', encType: 'multipart/form-data' },
  )
}
```

**Truco clave para la edición:** guarda el nombre del archivo ya subido en un campo (`originalName`) y **valida ese campo** como requerido, no el `File`. Así, al editar un registro que ya tiene archivo, la validación pasa sin obligar a volver a subirlo.

---

## 11. Capa 10 — Ciclo de envío y feedback

### 11.1 `useFetcher`, no `<Form>`

```tsx
const fetcher = useFetcher<ActionResponse>()
const isSubmitting = fetcher.state !== 'idle'
```

`useFetcher` no navega: el formulario mantiene su estado, su scroll y sus field arrays mientras guarda, y puedes decidir tú qué pasa después. Con `<Form>`/`useSubmit` la respuesta se maneja como navegación y pierdes ese control.

Usa `fetcher.state !== 'idle'` (no `=== 'submitting'`) para `isSubmitting`: cubre también la fase `loading` en la que el action ya terminó pero los loaders se están revalidando — durante la cual el botón todavía no debe reactivarse.

### 11.2 Fallo de validación en el submit

```tsx
const onInvalid: SubmitErrorHandler<FormInput> = (errors) => {
  const keys = Object.keys(errors)
  toast.error(keys.length === 1
    ? 'Revisa el campo marcado en el formulario'
    : `Revisa los ${keys.length} campos marcados en el formulario`)

  // shouldFocusError solo alcanza campos con ref; los controlados van a mano
  document.getElementById(ids[keys[0] as keyof typeof ids])
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
```

Si el formulario tiene secciones colapsables o pestañas, **ábrelas antes de hacer scroll**: un error dentro de una sección cerrada es un formulario que "no guarda y no dice por qué".

### 11.3 Varias acciones de envío

Con "Guardar" y "Guardar y publicar", pasa la intención **como argumento**, nunca mutando un `ref` ni con un `setValue` previo:

```tsx
const submitWith = (intent: Intent) => handleSubmit((data) => onSubmit(data, intent), onInvalid)()

const onSubmit = (data: FormOutput, intent: Intent = 'save') =>
  fetcher.submit(toFormData({ ...buildPayload(data), intent }), { method: 'POST', encType: 'multipart/form-data' })
```

La alternativa (`useRef` mutable + `setValue('status', …)` antes de enviar) deja el estado modificado aunque la validación falle, y hace que el comportamiento dependa del orden de los efectos.

### 11.4 Feedback sin duplicados

Un `useEffect` ingenuo sobre `fetcher.data` dispara el aviso **dos veces** cuando las callbacks cambian de referencia entre renders. Hook genérico:

```ts
// shared/hooks/use-fetcher-toast.ts
export function useFetcherToast<T extends { success: boolean; message?: string; error?: string }>(
  fetcher: ReturnType<typeof useFetcher<T>>,
  options: { onSuccess?: () => void; onError?: () => void; successMessage?: string; errorMessage?: string } = {},
) {
  const { onSuccess, onError, successMessage, errorMessage } = options

  // refs a las callbacks más recientes: no son dependencias del efecto
  const onSuccessRef = useRef(onSuccess); onSuccessRef.current = onSuccess
  const onErrorRef = useRef(onError);     onErrorRef.current = onError

  // último dato YA procesado: evita el aviso duplicado
  const processedRef = useRef<T | null | undefined>(undefined)

  useEffect(() => {
    if (!fetcher.data || fetcher.data === processedRef.current) return
    processedRef.current = fetcher.data

    if (fetcher.data.success) {
      const msg = fetcher.data.message ?? successMessage
      if (msg) toast.success(msg)
      onSuccessRef.current?.()
    } else {
      const msg = fetcher.data.error ?? errorMessage
      if (msg) toast.error(msg)
      onErrorRef.current?.()
    }
  }, [fetcher.data, successMessage, errorMessage])
}
```

### 11.5 Errores del servidor, en su campo

```tsx
useEffect(() => {
  const fieldErrors = fetcher.data?.fieldErrors
  if (!fieldErrors) return
  for (const [name, message] of Object.entries(fieldErrors)) {
    setError(name as Path<FormInput>, { type: 'server', message })
  }
}, [fetcher.data, setError])
```

Cubre exactamente lo que el cliente **no puede** saber: unicidad, permisos, conflictos de concurrencia. Un toast genérico de "ese correo ya existe" obliga al usuario a buscar el campo; `setError` lo señala.

Para que las claves encajen, el servidor debe emitir las rutas con la misma notación de RHF (`items.0.label`): une el `path` de la incidencia con puntos.

### 11.6 Cambios sin guardar — y el bug que casi siempre trae

```tsx
export function useUnsavedChanges(when: boolean) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    when && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('Tienes cambios sin guardar. ¿Seguro que quieres salir?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  useEffect(() => {
    if (!when) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [when])
}
```

`useBlocker` cubre la navegación interna del router; `beforeunload` cubre cerrar la pestaña o recargar. Hacen falta los dos.

> **El bug:** `useUnsavedChanges(isDirty && !isSubmitting)` parece correcto y no lo es. Al guardar con éxito, el formulario **sigue marcado como sucio** (nadie lo ha reseteado) y `isSubmitting` ya volvió a `false`, así que la navegación posterior al guardado dispara el diálogo de "cambios sin guardar" **justo después de un guardado correcto**.
>
> El arreglo tiene que evaluarse **en render**, no en un efecto, para que el blocker ya esté desactivado cuando llegue el `navigate`:
>
> ```tsx
> const isSaved = fetcher.data?.success === true
> useUnsavedChanges(isDirty && !isSubmitting && !isSaved)
> ```
>
> Un `reset()` dentro de un `useEffect` **no** basta: el efecto que navega puede ejecutarse en el mismo flush, antes de que React re-renderice con `isDirty` en `false`.

### 11.7 Doble envío y comportamiento post-guardado

- `disabled={isSubmitting}` en todos los botones de acción. Si el `action` no es idempotente, añade una clave de idempotencia al payload.
- **Decide y documenta qué pasa al guardar**: navegar al listado, resetear para crear otro, o quedarse. No decidirlo es cómo aparecen los formularios que "parece que no hicieron nada".

---

## 12. Antipatrones (síntoma → causa → arreglo)

| Síntoma | Causa | Arreglo |
|---|---|---|
| Todo el formulario se re-renderiza al teclear | `watch()` o `formState` en la raíz | `useWatch` / `useFormState` en la hoja ([§8.1](#81-usewatch-en-la-hoja-nunca-watch-en-la-raíz), [§8.2](#82-useformstate-para-el-estado-igual-que-usewatch-para-los-valores)) |
| Un campo no registra nada y no da error | El wrapper clona el evento de cambio | Mutar el evento original ([§7.2](#72-la-prueba-de-compatibilidad-los-6-puntos), punto 3) |
| TypeScript rechaza `{...register('x')}` por `ref` | Props derivadas de `InputHTMLAttributes` | Derivar de `ComponentProps<'input'>` ([§7.2](#72-la-prueba-de-compatibilidad-los-6-puntos), punto 1) |
| Un botón interno del wrapper deja de funcionar al registrar el campo | El `ref` de `register` pisó el interno | Componer los refs ([§7.2](#72-la-prueba-de-compatibilidad-los-6-puntos), punto 2) |
| Al hacer click en la etiqueta no se enfoca el input | `htmlFor` apunta a un id que nadie pone | `htmlFor={props.id ?? props.name}` + pasar `id` ([§4.3](#43-checklist-de-accesibilidad-barata-y-completa)) |
| Las secciones `memo()` se re-renderizan igual | Props no primitivas creadas inline | `useMemo`/`useCallback` ([§8.4](#84-memo-solo-sirve-si-todas-las-props-son-estables)) |
| Se pierde el foco al escribir en una lista | `update()` por tecleo, o `key={index}` | `register()` + `key={field.id}` ([§9](#9-capa-8--colecciones-dinámicas)) |
| Warning "controlled/uncontrolled input" | Campo ausente en `defaultValues` | Todos los campos con valor definido ([§5.1](#51-las-cinco-reglas)) |
| `isDirty` siempre `true` o siempre `false` | Defaults incompletos, o binding con `setValue` sin `shouldDirty` | [§5.1](#51-las-cinco-reglas) / [§7.4](#74-setvalue-no-sustituye-a-controller) |
| Aviso de "cambios sin guardar" tras guardar bien | El guard no contempla el éxito | `&& !isSaved`, evaluado en render ([§11.6](#116-cambios-sin-guardar--y-el-bug-que-casi-siempre-trae)) |
| Un select no valida ni marca *touched* | Atado con `setValue`, o falta `field.onBlur` | `Controller` completo ([§7.3](#73-controller-bien-usado)) |
| El componente ignora un `reset()` | `defaultValue={valorObservado}` en un control controlado | `Controller` ([§7.4](#74-setvalue-no-sustituye-a-controller)) |
| El submit falla y no se ve ningún error | Refinamiento sin `path`, o error en una sección colapsada | `path` explícito + abrir sección antes del scroll ([§3.4](#34-validación-cruzada-contexto-en-el-esquema-nunca-campos-fantasma), [§11.2](#112-fallo-de-validación-en-el-submit)) |
| El resolver no compila al alternar create/update | Esquemas de API con formas distintas | Esquema propio del formulario ([§3.3](#33-modos-que-difieren-define-el-esquema-del-formulario-no-reutilices-el-de-la-api)) |
| El servidor recibe campos que no existen en su API | Campos auxiliares metidos en el form para validar | Factory con contexto ([§3.4](#34-validación-cruzada-contexto-en-el-esquema-nunca-campos-fantasma)) |
| Al abrir para editar, un campo cambia solo | Precedencia `contexto ?? guardado` en los defaults | Precedencia por modo ([§5.1](#51-las-cinco-reglas)) |
| No se puede vaciar un campo opcional | El parser descarta `''` sin semántica decidida | Elegir PATCH / PUT / centinela ([§10.2](#102-vaciar-un-campo-el-centinela)) |
| El validador rechaza un campo con un error absurdo | `Object.fromEntries(formData)` metió un `File` | Extraer los archivos antes ([§10.3](#103-el-parser-del-servidor-es-el-espejo-del-cliente)) |
| Los archivos no llegan al servidor | Se enviaron dentro de un array serializado a JSON | Metadatos y binarios por separado ([§10.5](#105-colecciones-de-archivos-metadatos--binarios)) |
| Al editar exige volver a subir el archivo | La validación mira el `File` en vez del nombre guardado | Validar `originalName` ([§10.5](#105-colecciones-de-archivos-metadatos--binarios)) |
| Aviso de éxito duplicado | `useEffect` sobre `fetcher.data` con callbacks inestables | `useFetcherToast` ([§11.4](#114-feedback-sin-duplicados)) |
| `onSubmit(data: Record<string, unknown>)` | Falta el tercer genérico de `useForm` | `useForm<In, Ctx, Out>` ([§3.2](#32-los-tres-genéricos-de-useform)) |
| Castings del tipo `errors as MiInterfaz` | `useFormContext()` sin genérico | `useFormContext<FormInput>()` ([§8.3](#83-contexto-no-prop-drilling)) |
| Un campo se envía "por si acaso" con hidden input | Confusión con el submit nativo | Quitarlo: el valor ya está en el estado ([§7.5](#75-campos-ocultos)) |
| El formulario no funciona sin JavaScript | Se eligió RHF donde hacía falta PE | Nivel 0: `<Form>` nativo ([§1](#1-elegir-el-nivel-de-formulario)) |
| El orquestador tiene 500+ líneas | Secciones inline y transformaciones en el JSX | Extraer por las reglas de corte ([§2](#2-capa-1--dónde-vive-cada-cosa)) |

---

## 13. Checklist maestro

### Contrato
- [ ] Un solo esquema, importable por cliente **y** servidor.
- [ ] Esquema **del formulario** con forma única entre modos; DTOs de la API derivados con `buildPayload` ([§3.3](#33-modos-que-difieren-define-el-esquema-del-formulario-no-reutilices-el-de-la-api)).
- [ ] Validaciones cruzadas en un factory con contexto; **sin campos auxiliares en el formulario**.
- [ ] Todo refinamiento con `path` a un campo real.
- [ ] Coerción declarada para numéricos; cadenas vacías normalizadas.
- [ ] Mensajes redactados para el usuario final.
- [ ] `type FormInput = Input<S>`, `type FormOutput = Output<S>`.
- [ ] Límites (tamaño de arrays, tipo y peso de archivos) declarados en el contrato.

### Estado inicial
- [ ] `buildDefaultValues()` pura, fuera del componente, con tests.
- [ ] Todos los campos presentes; sin `undefined` accidental.
- [ ] Datos del API normalizados (uniones colapsadas, sub-arrays garantizados).
- [ ] Precedencia guardado-vs-contexto decidida por modo.
- [ ] `useMemo` sobre los defaults; `key` por registro si puede cambiar en caliente.

### Configuración
- [ ] `useForm<In, Ctx, Out>` con los tres genéricos.
- [ ] `mode: 'onTouched'` + `reValidateMode: 'onChange'`.
- [ ] Resolver memoizado si depende de algo.
- [ ] `shouldUnregister: false` si hay secciones condicionales.

### Identidad y accesibilidad
- [ ] `useFormIds()` con un solo `useId`, alimentado por una constante de módulo.
- [ ] `id={ids.form}` en el `<form>`; botones externos con `form={ids.form}`.
- [ ] Todo control con `id`, `<label htmlFor>` correcto, `aria-invalid` y `aria-describedby`.
- [ ] Errores con `role="alert"`.
- [ ] `type="button"` en todos los botones que no son el submit.
- [ ] Navegable con teclado; foco visible.

### Binding
- [ ] Cada wrapper usado con `register` pasa los 6 puntos de [§7.2](#72-la-prueba-de-compatibilidad-los-6-puntos).
- [ ] `Controller` solo donde hace falta, con `field.onBlur` conectado.
- [ ] Ningún control atado con `setValue` suelto.
- [ ] Ningún `defaultValue={valorObservado}` en controles controlados.
- [ ] Sin hidden inputs decorativos.

### Rendimiento
- [ ] Cero `watch()` en la raíz; `useWatch`/`useFormState` en la hoja.
- [ ] `getValues()` dentro de handlers.
- [ ] De `formState` solo se desestructura lo que se usa; nunca `isValid` "por si acaso".
- [ ] Subcomponentes `memo()` **con todas las props estables**.
- [ ] Verificado en el Profiler: teclear no re-renderiza el formulario entero ([§8.7](#87-cómo-medirlo-de-verdad)).

### Colecciones
- [ ] `key={field.id}`, nunca el índice.
- [ ] Un componente por fila, autoregistrado por contexto.
- [ ] `append()` con el objeto completo.
- [ ] Estado vacío con CTA; IDs de backend en hidden inputs.
- [ ] Sin `update()` por tecleo; máximo dos niveles de anidación.

### Serialización y archivos
- [ ] `toFormData` + `encType: 'multipart/form-data'` si hay archivos.
- [ ] Semántica de campo vacío decidida y documentada ([§10.2](#102-vaciar-un-campo-el-centinela)).
- [ ] Archivos fuera del esquema si no participan en reglas ([§10.4](#104-el-caso-especial-de-los-archivos)).
- [ ] Validación de tipo y tamaño con la **misma** función en cliente y servidor.
- [ ] Object URLs revocados.
- [ ] Parser con sus listas sincronizadas con el esquema, y con test sobre un `FormData` real.

### Ciclo de envío
- [ ] `isSubmitting` (con `state !== 'idle'`) deshabilita botones y cambia su texto.
- [ ] Aviso de éxito/error una sola vez por respuesta.
- [ ] `onInvalid` informa y lleva al primer campo, abriendo su sección.
- [ ] Intención de envío como argumento, no vía `ref` mutable.
- [ ] `fieldErrors` del servidor mapeados con `setError`.
- [ ] Guard `isDirty` con `useBlocker` + `beforeunload`, **contemplando el guardado exitoso**.
- [ ] Comportamiento post-guardado definido.

---

## 14. Plantillas copiables

### 14.1 Los cuatro archivos portables

Se copian entre proyectos **sin modificar**:

| Archivo | Contenido | Sección |
|---|---|---|
| `shared/hooks/use-form-ids.ts` | IDs estables | [§4.1](#41-qué-problema-resuelve-useformids) |
| `shared/lib/form-data.ts` | `toFormData` | [§10.1](#101-toformdata) |
| `shared/lib/parse-form-data.ts` | `createFormDataParser` | [§10.3](#103-el-parser-del-servidor-es-el-espejo-del-cliente) |
| `shared/hooks/use-fetcher-toast.ts` | Feedback sin duplicados | [§11.4](#114-feedback-sin-duplicados) |

A los que conviene añadir, en cuanto haya un segundo formulario: `use-unsaved-changes.ts` ([§11.6](#116-cambios-sin-guardar--y-el-bug-que-casi-siempre-trae)) y un `toFieldErrors()` que traduzca las incidencias de tu validador al mapa `{ campo: mensaje }`.

### 14.2 Esqueleto del orquestador

```tsx
export function EntityForm({ initialData, ids, fetcher, categories = [] }: EntityFormProps) {
  const isEdit = !!initialData

  // 1. Derivados de catálogos (estables)
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })), [categories])

  // 2. Contrato y estado inicial
  const resolver = useMemo(() => buildResolver(isEdit ? 'edit' : 'create'), [isEdit])
  const defaultValues = useMemo(() => buildEntityDefaults(initialData), [initialData])

  const methods = useForm<FormInput, unknown, FormOutput>({
    resolver, defaultValues, mode: 'onTouched', reValidateMode: 'onChange', shouldFocusError: true,
  })

  // 3. Ciclo de envío
  const isSubmitting = fetcher.state !== 'idle'
  const isSaved = fetcher.data?.success === true
  useUnsavedChanges(methods.formState.isDirty && !isSubmitting && !isSaved)

  useEffect(() => {
    const fieldErrors = fetcher.data?.fieldErrors
    if (!fieldErrors) return
    for (const [name, message] of Object.entries(fieldErrors))
      methods.setError(name as Path<FormInput>, { type: 'server', message })
  }, [fetcher.data, methods])

  const onSubmit: SubmitHandler<FormOutput> = (data) =>
    fetcher.submit(toFormData(buildEntityPayload(data)), {
      method: 'POST', encType: 'multipart/form-data',
    })

  const onInvalid: SubmitErrorHandler<FormInput> = (errors) =>
    toast.error(`Revisa los ${Object.keys(errors).length} campos marcados`)

  // 4. Composición
  return (
    <FormProvider {...methods}>
      <form id={ids.form} onSubmit={methods.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
        <BasicInfoSection ids={ids} />
        <SettingsSection ids={ids} categoryOptions={categoryOptions} />
        <ItemsManager />
      </form>
    </FormProvider>
  )
}
```

El `fetcher` y los `ids` **entran por props**: los crea el componente de la ruta, que es quien también pinta el botón de guardar en el header ([§4.2](#42-la-clave-form-el-botón-de-guardar-fuera-del-form)).

### 14.3 Tests mínimos

Cuatro archivos cubren el ~90 % de la lógica **sin montar React** — y son los que de verdad fallan.

Los tres primeros viven en `utils/__tests__/` y el de reglas en `domain/__tests__/`: ningún test se coloca junto al archivo que prueba (ver [AGENTS.md](../AGENTS.md), "Ubicación obligatoria de pruebas").

| Test | Qué cubre |
|---|---|
| `utils/__tests__/build-default-values.test.ts` | Entidad completa, entidad ausente, nulos del API, sub-arrays ausentes, precedencia por modo |
| `utils/__tests__/build-payload.test.ts` | Separación de archivos, campos derivados, limpieza de auxiliares |
| `utils/__tests__/parse-form-data.test.ts` | `FormData` real con archivos, JSON inválido, booleanos, campos vacíos |
| `domain/__tests__/<entity>.rules.test.ts` | Cada validación cruzada y cada mensaje |

Los tests de interacción (Testing Library) valen la pena solo para el flujo completo de un formulario crítico. Escribirlos para cada campo es caro y frágil; el `getByLabelText` sí es la forma correcta de seleccionar, y funciona precisamente porque [§4.3](#43-checklist-de-accesibilidad-barata-y-completa) está cumplida.

---

## 15. Adaptación a otros stacks

| Si no tienes… | Sustituto |
|---|---|
| `action` de React Router | `onSubmit` que llama a `fetch`/axios con el `FormData` de `toFormData`; `isSubmitting` desde `useState` o TanStack Query (`mutation.isPending`) |
| `useFetcher` | `useMutation` de TanStack Query — `onSuccess`/`onError` sustituyen a `useFetcherToast` |
| `useBlocker` | El hook de bloqueo de tu router (`history.block` en RR v5); `beforeunload` es igual en todos |
| Librería de toasts | El hook solo necesita `success()` y `error()`; sirve cualquiera, o un `Alert` inline |
| Zod | Valibot / Yup / ArkType: cambia el resolver y la sintaxis ([§3.1](#31-el-contrato-es-agnóstico-de-la-librería)). El patrón no se toca |
| Backend con `multipart` | Sube los archivos primero (URL prefirmada de S3/GCS) y envía JSON con las referencias; `toFormData` deja de hacer falta y "metadatos + binarios" se convierte en "subir, luego guardar referencias" |
| React 19 | En React ≤18 los wrappers necesitan `forwardRef`; el resto es idéntico |
| Cliente (Server Components / Next.js) | El formulario sigue siendo cliente y el `action` es una server action que recibe el `FormData` y revalida con el mismo esquema |

---

## 16. Resumen en una página

Si solo te llevas diez frases:

1. **Elige el nivel** ([§1](#1-elegir-el-nivel-de-formulario)) antes de escribir código; RHF no es gratis y rompe el funcionamiento sin JavaScript.
2. **Un contrato, dos consumidores.** Cliente para UX, servidor para la verdad.
3. **El esquema del formulario no es el DTO de la API.** Separarlos elimina la mitad de los problemas de tipos.
4. **`buildDefaultValues` y `buildPayload` son funciones puras.** Ahí es donde viven los casos raros, y donde se testean barato.
5. **Antes de usar `register` con un wrapper, pásale los 6 puntos** ([§7.2](#72-la-prueba-de-compatibilidad-los-6-puntos)). Arregla el wrapper; no lo esquives con `Controller`.
6. **`useWatch` y `useFormState` en la hoja**, nunca `watch()` ni `formState` en la raíz. Y verifica en el Profiler.
7. **`key={field.id}`** en toda colección.
8. **Los archivos que no participan en reglas no van en el esquema**, y su validación es la misma función en ambos lados.
9. **Los errores del servidor se pintan en su campo** con `setError`, no en un toast.
10. **El guard de cambios sin guardar tiene que saber que ya guardaste** ([§11.6](#116-cambios-sin-guardar--y-el-bug-que-casi-siempre-trae)).
