export { action } from "./index.action";
export { loader } from "./index.loader";

import { useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import {
	FormActions,
	FormFooter,
} from "@/shared/components/common/form-actions";
import { PageHeader } from "@/shared/components/common/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { DependencyHistory } from "../../../components/dependency-history";
import { ResetPasswordDialog } from "../../../components/reset-password-dialog";
import { UserForm } from "../../../components/user-form";
import { useUserFormIds } from "../../../hooks/use-user-form-ids";
import type { UserActionData } from "../../../utils/parse-user-form-data";
import { fullNameOf } from "../../../utils/to-user-rows";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/usuarios";

export const handle = {
	// Sin loaderData el loader lanzó (p. ej. id inexistente) y se ve el
	// ErrorBoundary: el header sigue ahí y necesita una etiqueta de repuesto.
	breadcrumb: (loaderData) => [
		{ label: "Usuarios", path: LIST_PATH },
		{
			label: loaderData
				? fullNameOf(loaderData.data.user) || loaderData.data.user.email
				: "Editar usuario",
		},
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	const user = data?.data.user;
	const name = user ? fullNameOf(user) || user.email : "Usuario";
	return [{ title: `Editar · ${name}` }];
}

export default function EditarUsuarioPage({
	loaderData,
}: Route.ComponentProps) {
	const { user, history, assignableRoles } = loaderData.data;
	const navigate = useNavigate();
	const ids = useUserFormIds();
	const [resetOpen, setResetOpen] = useState(false);

	const fetcher = useFetcher<UserActionData>();
	const isSubmitting = fetcher.state !== "idle";

	useFetcherToast(fetcher, {
		errorMessage: "No se pudieron guardar los cambios",
		onSuccess: () => navigate(LIST_PATH),
	});

	const displayName = fullNameOf(user) || user.email;

	const actions = (
		<FormActions
			formId={ids.form}
			isSubmitting={isSubmitting}
			submitLabel="Guardar cambios"
			cancelTo={LIST_PATH}
		/>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Editar usuario"
				titleAccent={displayName}
				description="Actualiza los datos de la cuenta."
				goBack={LIST_PATH}
				actions={actions}
				collapseActionsOnMobile
			/>

			<UserForm
				mode="edit"
				ids={ids}
				fetcher={fetcher}
				user={user}
				assignableRoles={assignableRoles}
				onResetPassword={() => setResetOpen(true)}
			/>

			{/* La bitácora va como sección de la pantalla que ya tiene el dato, no
			    como ruta aparte: una segunda pantalla exigiría un segundo guard sobre
			    el mismo recurso. */}
			<Card className="mt-4">
				<CardContent className="flex flex-col gap-3">
					<span className="font-medium text-foreground text-sm">
						Historial de adscripción
					</span>
					<DependencyHistory entries={history} />
				</CardContent>
			</Card>

			<FormFooter>{actions}</FormFooter>

			<ResetPasswordDialog
				user={
					resetOpen ? { documentId: user.documentId, name: displayName } : null
				}
				onOpenChange={setResetOpen}
			/>
		</div>
	);
}
