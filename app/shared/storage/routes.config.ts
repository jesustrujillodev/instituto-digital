import { route } from "@react-router/dev/routes";

// Resource route (solo loader, sin componente): proxy de almacenamiento.
export const storageRoutes = [
	route("api/storage", "shared/storage/routes/storage.route.ts"),
];
