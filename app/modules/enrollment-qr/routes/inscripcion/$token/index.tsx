import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { ThemeModeToggle } from "@/modules/theme/components/theme-mode-toggle";
import { InstitutionalLogo } from "@/shared/components/common/institutional-logo";
import { Button } from "@/shared/components/ui/button";
import type { RouteErrorData } from "@/shared/http/route-error";

export { loader } from "./index.loader";

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-sidebar px-6 py-12 text-sidebar-foreground">
			<div className="absolute top-4 right-4">
				<ThemeModeToggle />
			</div>

			<InstitutionalLogo className="h-12" />

			<div className="w-full max-w-sm rounded-xl bg-background p-6 text-foreground shadow-lg">
				{children}
			</div>
		</main>
	);
}

/** El loader siempre redirige o corta; esto solo se ve mientras navega. */
export default function InscripcionPage() {
	return (
		<Shell>
			<p className="text-sm text-muted-foreground" role="status">
				Abriendo el curso…
			</p>
		</Shell>
	);
}

export function ErrorBoundary() {
	const error = useRouteError();

	if (!isRouteErrorResponse(error)) throw error;

	const { message } = (error.data ?? {}) as Partial<RouteErrorData>;

	return (
		<Shell>
			<h1 className="text-base font-semibold">No pudimos abrir el curso</h1>
			<p role="alert" className="mt-2 text-sm text-muted-foreground">
				{message ?? "Este código de inscripción no es válido."}
			</p>

			<Button asChild className="mt-6 w-full">
				<Link to="/dashboard/cursos-disponibles">Ver cursos disponibles</Link>
			</Button>

			<Link
				to="/dashboard"
				className="mt-6 block text-center text-xs text-muted-foreground underline"
			>
				Volver al inicio
			</Link>
		</Shell>
	);
}
