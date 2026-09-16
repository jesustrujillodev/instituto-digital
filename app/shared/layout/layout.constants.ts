/**
 * Id estable del layout del dashboard.
 *
 * Se declara explícitamente (en vez de dejar que React Router lo derive del path
 * del archivo) porque `useRouteLoaderData(routeId)` recibe un `string` SIN
 * comprobación de tipos y devuelve `| undefined`: mover o renombrar
 * `dashboard.layout.tsx` rompería el hook en silencio, en runtime.
 *
 * Consumido por `app/routes.ts` —vía `layout(file, { id }, children)`— y por
 * `useAuth()`. Ambos lados apuntan a este único símbolo.
 *
 * Sin imports a propósito: `app/routes.ts` se carga en el pipeline de config de
 * Vite, separado del bundle de la app.
 */
export const DASHBOARD_LAYOUT_ID = "dashboard-layout";
