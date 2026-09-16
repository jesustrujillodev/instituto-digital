import { Form, useActionData } from "react-router";
import { ThemeModeToggle } from "@/modules/theme/components/theme-mode-toggle";
import { Button } from "@/shared/components/ui/button";
import type { action } from "./index.action";

export { action } from "./index.action";
export { loader } from "./index.loader";

export default function IniciarSesionPage() {
	const actionData = useActionData<typeof action>();

	return (
		<main className="min-h-screen flex items-center justify-center">
			<div className="absolute top-4 right-4">
				<ThemeModeToggle />
			</div>

			<div className="w-full max-w-sm space-y-6">
				<h1 className="text-2xl font-semibold text-center">Iniciar sesión</h1>

				{actionData && !actionData.success && (
					<p className="text-sm text-destructive text-center">
						{actionData.error.message}
					</p>
				)}

				<Form method="post" className="space-y-4">
					<div>
						<label htmlFor="email" className="block text-sm font-medium mb-1">
							Correo electrónico
						</label>
						<input
							id="email"
							name="email"
							type="email"
							required
							autoComplete="email"
							className="w-full border rounded px-3 py-2 text-sm"
						/>
					</div>

					<div>
						<label
							htmlFor="password"
							className="block text-sm font-medium mb-1"
						>
							Contraseña
						</label>
						<input
							id="password"
							name="password"
							type="password"
							required
							autoComplete="current-password"
							className="w-full border rounded px-3 py-2 text-sm"
						/>
					</div>

					<Button type="submit" className="w-full">
						Entrar
					</Button>
				</Form>
			</div>
		</main>
	);
}
