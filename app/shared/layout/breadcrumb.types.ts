import type { BreadcrumbItem } from "@/shared/components/common/breadcrumb";

/**
 * Lo que exporta una ruta del dashboard en `handle` para que el header del
 * layout pinte su rastro.
 *
 * Las rutas del dashboard son planas (hermanas bajo `prefix("dashboard")`, no
 * anidadas), así que la hoja declara el rastro COMPLETO, padre incluido. La
 * raíz "Dashboard" no va aquí: la pone el componente.
 *
 * `loaderData` llega `undefined` cuando el loader lanzó y se ve el
 * ErrorBoundary: el header sigue montado en ese caso, así que la función tiene
 * que tener una etiqueta de repuesto.
 */
export interface BreadcrumbHandle<TLoaderData = unknown> {
	breadcrumb: (loaderData: TLoaderData | undefined) => BreadcrumbItem[];
}
