import { type RouteConfigEntry, route } from "@react-router/dev/routes";

export const creditsRoutes = [
	/** Participantes: los créditos propios (`requireParticipant`). */
	route("mis-creditos", "modules/credits/routes/mis-creditos/index.tsx"),
	/** Titular, auxiliar y alcance global (`requireScope`). */
	route("creditos", "modules/credits/routes/creditos/index.tsx"),
] satisfies RouteConfigEntry[];
