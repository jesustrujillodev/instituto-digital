import type { Config } from "@react-router/dev/config";

export default {
	// Config options...
	// Server-side render by default, to enable SPA mode set this to `false`
	ssr: true,
	/**
	 * Todas las rutas viajan en el documento inicial, no se descubren al navegar.
	 *
	 * El modo `lazy` por defecto manda un manifiesto con la ruta actual y pide el
	 * resto a `/__manifest` conforme hacen falta. Descubre bien lo que cuelga de
	 * un `<Link>` —los marca con `data-discover` y los precarga—, pero una ruta a
	 * la que solo se llega por `navigate()` depende de que ese fetch ocurra y
	 * acierte la versión del manifiesto. Si no acierta, el router cambia de
	 * ubicación sin rutas que casar y la pantalla queda en blanco. Es justo el
	 * caso del alta de curso: el salto del paso 1 al 2 estrena una ruta que
	 * ninguna pantalla enlaza todavía, porque el curso acaba de existir.
	 *
	 * El panel es privado y ronda las cuarenta rutas: el manifiesto completo pesa
	 * 5 KB comprimido y ahorra una petición por cada destino nuevo. `lazy` está
	 * pensado para sitios públicos con muchas más rutas de las que nadie visita.
	 */
	routeDiscovery: { mode: "initial" },
	future: {
		v8_middleware: true,
	},
} satisfies Config;
