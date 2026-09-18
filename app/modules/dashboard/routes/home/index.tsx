import { Users } from "lucide-react";
import { Link } from "react-router";
import { RoleGuard } from "@/shared/components/auth/role-guard";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { useAuth } from "@/shared/hooks/use-auth";

export function meta() {
	return [{ title: "Panel" }];
}

export default function DashboardHomePage() {
	// La sesión ya la cargó el loader del layout: sin loader propio ni fetch extra.
	const user = useAuth();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h1 className="font-semibold text-2xl">Panel</h1>
				<p className="text-muted-foreground text-sm">
					Sesión iniciada como {user.email}.
				</p>
			</div>

			<RoleGuard allowedRoles={["SUPERADMIN"]}>
				<Card className="max-w-md">
					<CardHeader>
						<CardTitle>Administración</CardTitle>
						<CardDescription>
							Gestión de las cuentas con acceso a la herramienta.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild variant="outline">
							<Link to="/dashboard/usuarios">
								<Users data-icon="inline-start" />
								Gestionar usuarios
							</Link>
						</Button>
					</CardContent>
				</Card>
			</RoleGuard>
		</div>
	);
}
