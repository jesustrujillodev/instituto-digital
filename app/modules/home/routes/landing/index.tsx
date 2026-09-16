import { ThemeModeToggle } from "@/modules/theme/components/theme-mode-toggle";

export default function LandingPage() {
	return (
		<main className="min-h-screen flex items-center justify-center">
			{/* El tema se puede cambiar sin sesión: aquí no hay menú de usuario donde
			    colgarlo, así que va suelto en la esquina. */}
			<div className="absolute top-4 right-4">
				<ThemeModeToggle />
			</div>

			<h1 className="text-2xl font-semibold">Landing Page</h1>
		</main>
	);
}
