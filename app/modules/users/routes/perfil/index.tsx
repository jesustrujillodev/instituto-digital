export { action } from "./index.action";
export { loader } from "./index.loader";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { PageHeader } from "@/shared/components/common/page-header";
import { PasswordInput } from "@/shared/components/common/password-input";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { DependencyHistory } from "../../components/dependency-history";
import { RoleBadge } from "../../components/user-badges";
import {
	INTENT_FIELD,
	USER_INTENTS,
	type UserActionData,
} from "../../utils/parse-user-form-data";
import { fullNameOf } from "../../utils/to-user-rows";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [{ label: "Mi perfil" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Mi perfil" }];
}

const FIELD_GRID = "grid items-start gap-4 md:grid-cols-2";

function Dato({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-muted-foreground text-sm">{label}</dt>
			<dd className="text-sm">{value}</dd>
		</div>
	);
}

export default function PerfilPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { user, dependencyName, history },
	} = loaderData;

	const passwordFetcher = useFetcher<UserActionData>();
	useFetcherToast(passwordFetcher);

	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	const isChangingPassword = passwordFetcher.state !== "idle";

	const passwordError =
		passwordFetcher.data && !passwordFetcher.data.success
			? passwordFetcher.data.error.message
			: null;

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title="Mi perfil"
				description="Tus datos, tu adscripción y tu contraseña."
			/>

			<Card>
				<CardContent>
					<FieldSet>
						<FieldLegend>Datos</FieldLegend>

						<dl className={FIELD_GRID}>
							<Dato label="Nombre" value={fullNameOf(user) || "Sin nombre"} />
							<Dato label="Correo" value={user.email} />
							<Dato
								label="Número de empleado"
								value={user.employeeNumber ?? "—"}
							/>
							<Dato label="Puesto" value={user.jobTitle ?? "—"} />
							<div className="flex flex-col gap-1">
								<dt className="text-muted-foreground text-sm">Rol</dt>
								<dd>
									<RoleBadge role={user.role} />
								</dd>
							</div>
							<Dato
								label="Dependencia"
								value={dependencyName ?? "Sin asignar"}
							/>
						</dl>
					</FieldSet>
				</CardContent>
			</Card>

			<Card>
				<CardContent>
					<FieldSet>
						<FieldLegend>Adscripción</FieldLegend>

						<p className="text-muted-foreground text-sm">
							Si cambias de área, pide al titular o auxiliar de tu dependencia
							que te traslade.
						</p>

						<DependencyHistory entries={history} />
					</FieldSet>
				</CardContent>
			</Card>

			<Card>
				<CardContent>
					<FieldSet>
						<FieldLegend>Contraseña</FieldLegend>

						<div className={FIELD_GRID}>
							<PasswordInput
								id="perfil-actual"
								label="Contraseña actual"
								value={currentPassword}
								onChange={(event) => setCurrentPassword(event.target.value)}
							/>
							<PasswordInput
								id="perfil-nueva"
								label="Contraseña nueva"
								value={newPassword}
								onChange={(event) => setNewPassword(event.target.value)}
							/>
							<PasswordInput
								id="perfil-confirmar"
								label="Confirmar contraseña"
								error={passwordError ?? undefined}
								value={confirmPassword}
								onChange={(event) => setConfirmPassword(event.target.value)}
							/>
						</div>

						<div>
							<Button
								onClick={() =>
									passwordFetcher.submit(
										{
											currentPassword,
											newPassword,
											confirmPassword,
											[INTENT_FIELD]: USER_INTENTS.changePassword,
										},
										{ method: "post" },
									)
								}
								disabled={
									isChangingPassword ||
									!currentPassword ||
									!newPassword ||
									!confirmPassword
								}
							>
								<KeyRound className="h-4 w-4" />
								{isChangingPassword ? "Cambiando…" : "Cambiar contraseña"}
							</Button>
						</div>
					</FieldSet>
				</CardContent>
			</Card>
		</div>
	);
}
