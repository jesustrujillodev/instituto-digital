import { Ban, FileQuestion, LockKeyhole, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
	isForbiddenError,
	isForbiddenRoleError,
	isNotFoundError,
	isUnauthorizedError,
} from "@/shared/http/route-error";

interface RouteErrorViewProps {
	error: unknown;
	/** Destino del enlace de vuelta: raíz para el boundary global, /dashboard dentro del shell. */
	homeTo?: string;
}

/**
 * Vista única de errores de ruta, compartida por el ErrorBoundary raíz y el del
 * dashboard para que no puedan divergir.
 *
 * La clasificación se apoya en los predicados tipados de `shared/http/route-error`
 * (status de ErrorResponse), nunca en el texto del mensaje.
 */
export function RouteErrorView({ error, homeTo = "/" }: RouteErrorViewProps) {
	let Icon = TriangleAlert;
	let title = "Algo salió mal";
	let detail = "Ha ocurrido un error inesperado.";
	// Un 404 es un callejón sin salida, no un fallo: no se pinta en rojo.
	let variant: "default" | "destructive" = "destructive";

	if (isNotFoundError(error)) {
		Icon = FileQuestion;
		title = "404 — No encontrado";
		detail = "La página que buscas no existe o fue movida.";
		variant = "default";
	} else if (isForbiddenError(error)) {
		Icon = Ban;
		title = "403 — Acceso denegado";
		detail = isForbiddenRoleError(error)
			? `No tienes permiso para ver esta sección. Requiere el rol: ${error.data.requiredRoles.join(", ")}.`
			: "No tienes permiso para realizar esta acción.";
	} else if (isUnauthorizedError(error)) {
		Icon = LockKeyhole;
		title = "401 — Sesión requerida";
		detail = "Inicia sesión para continuar.";
	}

	// El stack solo en desarrollo: en producción no se filtra nada interno.
	const stack =
		import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

	return (
		<div className="flex w-full max-w-2xl flex-col gap-4">
			<Alert variant={variant}>
				<Icon />
				<AlertTitle>{title}</AlertTitle>
				<AlertDescription>{detail}</AlertDescription>
			</Alert>

			<div className="flex gap-2">
				<Button asChild variant="outline">
					<Link to={homeTo}>Volver</Link>
				</Button>
			</div>

			{stack && (
				<pre className="w-full overflow-x-auto rounded-md bg-muted p-4 text-xs">
					<code>{stack}</code>
				</pre>
			)}
		</div>
	);
}
