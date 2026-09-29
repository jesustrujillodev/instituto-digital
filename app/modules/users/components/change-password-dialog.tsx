import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { sileo } from "sileo";
import { PasswordInput } from "@/shared/components/common/password-input";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { useChangePasswordFormIds } from "../hooks/use-user-form-ids";
import {
	INTENT_FIELD,
	USER_INTENTS,
	type UserActionData,
} from "../utils/parse-user-form-data";

interface ChangePasswordDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** Cambio de la contraseña propia. Envía al action del perfil, donde vive el intent. */
export function ChangePasswordDialog({
	open,
	onOpenChange,
}: ChangePasswordDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				{/* Se desmonta al cerrar: cada apertura empieza con los campos vacíos y
				    sin el error de la vez anterior. */}
				{open && <ChangePasswordBody onDone={() => onOpenChange(false)} />}
			</DialogContent>
		</Dialog>
	);
}

function ChangePasswordBody({ onDone }: { onDone: () => void }) {
	const ids = useChangePasswordFormIds();
	const fetcher = useFetcher<UserActionData>();
	const isSubmitting = fetcher.state !== "idle";
	const result = isSubmitting ? undefined : fetcher.data;

	// Una sola vez por respuesta: `onDone` cambia de referencia en cada render.
	const announced = useRef<UserActionData | null>(null);
	useEffect(() => {
		if (!result?.success || announced.current === result) return;
		announced.current = result;
		sileo.success({ title: result.message ?? "Contraseña actualizada" });
		onDone();
	}, [result, onDone]);

	// El fallo se queda en el diálogo: un toast detrás del overlay obligaría a
	// cerrar para enterarse. Cada error va bajo su campo; el que no es de ninguno,
	// al pie.
	const failure = result && !result.success ? result.error : null;
	const fieldErrors = failure?.fieldErrors;
	const generalError = failure && !fieldErrors ? failure.message : null;

	return (
		<fetcher.Form
			id={ids.form}
			method="post"
			action="/dashboard/perfil"
			className="grid gap-6"
			noValidate
		>
			<input
				type="hidden"
				name={INTENT_FIELD}
				value={USER_INTENTS.changePassword}
			/>

			<DialogHeader>
				<DialogTitle>Cambiar contraseña</DialogTitle>
				<DialogDescription>
					Tu sesión en este dispositivo seguirá abierta.
				</DialogDescription>
			</DialogHeader>

			<div className="grid gap-4">
				<PasswordInput
					id={ids.currentPassword}
					name="currentPassword"
					label="Contraseña actual"
					autoComplete="current-password"
					autoFocus
					error={fieldErrors?.currentPassword}
				/>
				<PasswordInput
					id={ids.newPassword}
					name="newPassword"
					label="Contraseña nueva"
					autoComplete="new-password"
					helperText="Mínimo 8 caracteres"
					error={fieldErrors?.newPassword}
				/>
				<PasswordInput
					id={ids.confirmPassword}
					name="confirmPassword"
					label="Confirmar contraseña"
					autoComplete="new-password"
					error={fieldErrors?.confirmPassword}
				/>
			</div>

			{generalError && (
				<p role="alert" className="text-destructive text-sm">
					{generalError}
				</p>
			)}

			<DialogFooter>
				<DialogClose asChild>
					<Button type="button" variant="outline">
						Cancelar
					</Button>
				</DialogClose>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? "Guardando…" : "Guardar contraseña"}
				</Button>
			</DialogFooter>
		</fetcher.Form>
	);
}
