import { Form, useActionData, useNavigation } from "react-router";
import { ThemeModeToggle } from "@/modules/theme/components/theme-mode-toggle";
import { InstitutionalLogo } from "@/shared/components/common/institutional-logo";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type { action } from "./index.action";

export { action } from "./index.action";
export { loader } from "./index.loader";

export default function IniciarSesionPage() {
	const actionData = useActionData<typeof action>();
	const submitting = useNavigation().state === "submitting";

	return (
		<main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
			<section className="flex flex-col justify-between gap-10 bg-sidebar px-6 py-8 text-sidebar-foreground sm:px-10 lg:px-14 lg:py-14">
				<InstitutionalLogo className="h-12 lg:h-16" />
				<div className="max-w-md space-y-3">
					<p className="text-3xl font-bold tracking-tight text-balance lg:text-4xl">
						Instituto Digital de Capacitación
					</p>
					<p className="text-sm text-sidebar-foreground/80 lg:text-base">
						Cursos, calendario y créditos del personal del Ayuntamiento.
					</p>
				</div>
			</section>

			<section className="relative flex items-center justify-center px-6 py-12 sm:px-10">
				<div className="absolute top-4 right-4">
					<ThemeModeToggle />
				</div>

				<div className="w-full max-w-sm space-y-8">
					<div className="space-y-2">
						<h1 className="text-2xl font-semibold tracking-tight">
							Iniciar sesión
						</h1>
						<p className="text-sm text-muted-foreground">
							Entra con el correo y la contraseña que te dio tu dependencia.
						</p>
					</div>

					{actionData && !actionData.success && (
						<p
							role="alert"
							className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
						>
							{actionData.error.message}
						</p>
					)}

					<Form method="post" className="space-y-5">
						<div className="space-y-2">
							<Label htmlFor="email">Correo electrónico</Label>
							<Input
								id="email"
								name="email"
								type="email"
								required
								autoComplete="email"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="password">Contraseña</Label>
							<Input
								id="password"
								name="password"
								type="password"
								required
								autoComplete="current-password"
							/>
						</div>

						<Button type="submit" className="w-full" disabled={submitting}>
							{submitting ? "Entrando…" : "Entrar"}
						</Button>
					</Form>
				</div>
			</section>
		</main>
	);
}
