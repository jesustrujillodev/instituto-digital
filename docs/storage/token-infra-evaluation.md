**La configuración óptima son dos API Tokens con permisos diferentes, cada uno scoped al bucket**, siguiendo el principio de menor privilegio:

| Token | Uso | Permisos | Scope |
|---|---|---|---|
| **Token Admin** | Panel de administración (escribe, elimina, lista) | `Object Read & Write` | Solo tu bucket |
| **Token Proxy** | Catálogo público vía proxy (solo lee) | `Object Read only` | Solo tu bucket |

### Por qué dos tokens y no uno

- Si usas un solo token con `Object Read & Write` para ambos, el proxy público tendría credenciales capaces de **escribir y eliminar** objetos. Si esas credenciales se comprometen (por ejemplo, filtradas en el navegador), alguien podría modificar o borrar todo el bucket.
- Con dos tokens, el proxy solo tiene credenciales de lectura. Aunque se filtren, el máximo daño es leer objetos que de todas formas son públicos.

### Cómo crearlos

Desde la página donde estás ahora — [R2 API Tokens](https://dash.cloudflare.com/2f0425c29a17536b701f11c1e2f5443f/r2/api-tokens):

1. **Token Admin**:
   - Tipo: `Account API Token` o `User API Token`
   - Permiso: **Object Read & Write**
   - Bucket scope: selecciona **solo tu bucket**

2. **Token Proxy**:
   - Tipo: `Account API Token` o `User API Token`
   - Permiso: **Object Read only**
   - Bucket scope: selecciona **solo tu bucket**

Cada token te dará un `Access Key ID` y un `Secret Access Key` que configuras como variables de entorno en cada sección de tu proyecto.

### Endpoints S3

Ambos tokens usan el mismo endpoint:
```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

- El **Token Proxy** podrá hacer: `GetObject`, `HeadObject`
- El **Token Admin** podrá hacer: `PutObject`, `DeleteObject`, `ListObjects`, `GetObject`, `HeadObject`

---

**¿Cuál es el nombre de tu bucket?** Así puedo confirmar que el scope se aplique correctamente al crear los tokens.