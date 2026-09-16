import { Link } from "react-router";
import { ThemeModeToggle } from "@/modules/theme/components/theme-mode-toggle";
import { InstitutionalLogo } from "@/shared/components/common/institutional-logo";
import { Button } from "@/shared/components/ui/button";

export default function LandingPage() {
	return (
		<main className="relative flex min-h-dvh flex-col bg-sidebar px-6 py-8 text-sidebar-foreground sm:px-10 lg:px-16 lg:py-12">
			{/* El tema se puede cambiar sin sesión: aquí no hay menú de usuario donde
			    colgarlo, así que va suelto en la esquina. */}
			<div className="absolute top-4 right-4">
				<ThemeModeToggle />
			</div>

			<InstitutionalLogo />

			<div className="my-auto max-w-2xl space-y-6 py-16">
				<div className="h-1 w-16 bg-sidebar-primary" />
				<h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
					Instituto Digital de Capacitación
				</h1>
				<p className="max-w-prose text-base text-sidebar-foreground/80 sm:text-lg">
					Consulta tus cursos, tus sesiones y tus créditos, o administra la
					capacitación de tu dependencia.
				</p>
				<Button
					asChild
					size="lg"
					className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 focus-visible:ring-sidebar-ring/50"
				>
					<Link to="/iniciar-sesion">Iniciar sesión</Link>
				</Button>
			</div>
		</main>
	);
}
