import { valibotResolver } from "@hookform/resolvers/valibot";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { useFetcher } from "react-router";
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
import { useAuth } from "@/shared/hooks/use-auth";
import { splitToastMessage } from "@/shared/hooks/use-fetcher-toast";
import { adminResetPasswordRule } from "../domain/user.rules";
import type { AdminResetPasswordDto } from "../domain/user.types";
import { useResetPasswordFormIds } from "../hooks/use-user-form-ids";
import {
	INTENT_FIELD,
	USER_INTENTS,
	type UserActionData,
} from "../utils/parse-user-form-data";

export interface ResetPasswordTarget {
	documentId: string;
	/** Nombre para la copia; el correo cuando no hay nombre. */
	name: string;
}

interface ResetPasswordDialogProps {
	/** `null` cierra el diálogo. */
	user: ResetPasswordTarget | null;
	onOpenChange: (open: boolean) => void;
}

/**
 * Reseteo administrativo de la contraseña de otra cuenta, en un diálogo que se
 * abre desde el listado, desde su panel de detalle y desde la edición.
 *
 * Es una operación aparte del perfil —su propia regla y su propio intent— y por
 * eso no es un campo más del UserForm: guardar el perfil nunca toca la
 * contraseña. Envía siempre al action de la edición, que es donde vive el
 * intent, sea cual sea la pantalla que lo abrió.
 */
export function ResetPasswordDialog({
	user,
	onOpenChange,
}: ResetPasswordDialogProps) {
	// Se recuerda el último destino: al cerrar, `user` pasa a null antes de que
	// termine la animación de salida y el contenido se vaciaría a medio fundido.
	// Se compara por valor: quien lo abre suele construir el objeto en cada render,
	// y comparar por referencia volvería a fijar el estado en bucle.
	const [shown, setShown] = useState(user);
	if (
		user &&
		(user.documentId !== shown?.documentId || user.name !== shown?.name)
	) {
		setShown(user);
	}

	return (
		<Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
			<DialogContent>
				{/* El cuerpo se desmonta al cerrar: su fetcher y su formulario empiezan
				    de cero en cada apertura, sin arrastrar el resultado anterior. */}
				{shown && <ResetPasswordBody user={shown} />}
			</DialogContent>
		</Dialog>
	);
}

function ResetPasswordBody({ user }: { user: ResetPasswordTarget }) {
	const ids = useResetPasswordFormIds();
	const isSelf = useAuth().documentId === user.documentId;
	const fetcher = useFetcher<UserActionData>();
	const isSubmitting = fetcher.state !== "idle";
	const [submitted, setSubmitted] = useState("");

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<AdminResetPasswordDto>({
		resolver: valibotResolver(
			adminResetPasswordRule,
		) as Resolver<AdminResetPasswordDto>,
		defaultValues: { newPassword: "" },
		mode: "onTouched",
		reValidateMode: "onChange",
	});

	const result = isSubmitting ? undefined : fetcher.data;

	if (result?.success) {
		return (
			<ResetPasswordDone user={user} password={submitted} result={result} />
		);
	}

	// El fallo se queda en el diálogo, junto al campo: un toast detrás del overlay
	// obligaría a cerrar para enterarse de qué pasó.
	const serverError =
		result && !result.success
			? (result.error.fieldErrors?.newPassword ?? result.error.message)
			: undefined;

	const onSubmit = ({ newPassword }: AdminResetPasswordDto) => {
		setSubmitted(newPassword);
		fetcher.submit(
			{ newPassword, [INTENT_FIELD]: USER_INTENTS.resetPassword },
			{
				method: "post",
				action: `/dashboard/usuarios/${user.documentId}/editar`,
			},
		);
	};

	return (
		<form
			id={ids.form}
			onSubmit={handleSubmit(onSubmit)}
			className="grid gap-6"
			noValidate
		>
			<DialogHeader>
				<DialogTitle>Restablecer contraseña</DialogTitle>
				<DialogDescription>
					{isSelf
						? "Tu sesión actual seguirá abierta."
						: `${user.name} tendrá que entrar con la nueva. Se cerrarán sus sesiones abiertas.`}
				</DialogDescription>
			</DialogHeader>

			<PasswordInput
				id={ids.newPassword}
				label="Nueva contraseña"
				required
				showGenerator
				autoFocus
				autoComplete="new-password"
				helperText="Mínimo 8 caracteres"
				error={errors.newPassword?.message ?? serverError}
				{...register("newPassword")}
			/>

			<DialogFooter>
				<DialogClose asChild>
					<Button type="button" variant="outline">
						Cancelar
					</Button>
				</DialogClose>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? "Restableciendo…" : "Restablecer contraseña"}
				</Button>
			</DialogFooter>
		</form>
	);
}

const COPIED_MS = 2000;

function ResetPasswordDone({
	user,
	password,
	result,
}: {
	user: ResetPasswordTarget;
	password: string;
	result: Extract<UserActionData, { success: true }>;
}) {
	const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
		"idle",
	);

	useEffect(() => {
		if (copyState !== "copied") return;
		const timeout = setTimeout(() => setCopyState("idle"), COPIED_MS);
		return () => clearTimeout(timeout);
	}, [copyState]);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(password);
			setCopyState("copied");
		} catch {
			setCopyState("failed");
		}
	};

	// "Contraseña restablecida. Se cerraron…" → el hecho va al título y la
	// salvedad sobre las sesiones, a la descripción.
	const { description } = splitToastMessage(result.message ?? "");

	return (
		<>
			<DialogHeader>
				<DialogTitle>Contraseña restablecida</DialogTitle>
				<DialogDescription>
					{description ? `${description} ` : ""}
					Compártela con {user.name} por un canal privado.
				</DialogDescription>
			</DialogHeader>

			<div className="grid gap-1.5">
				<span className="font-medium text-foreground text-sm">
					Nueva contraseña
				</span>
				<div className="flex items-center gap-2 rounded-2xl bg-muted py-1.5 pr-1.5 pl-3">
					<code className="min-w-0 flex-1 break-all font-mono text-foreground text-sm">
						{password}
					</code>
					{/* El foco estaba en el botón de enviar, que ya no existe: sin esto se
					    pierde dentro del diálogo. Copiar es lo siguiente que se hace. */}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={copy}
						autoFocus
					>
						{copyState === "copied" ? (
							<Check aria-hidden="true" />
						) : (
							<Copy aria-hidden="true" />
						)}
						{copyState === "copied" ? "Copiada" : "Copiar"}
					</Button>
				</div>
				{/* Anuncia el resultado de copiar: el cambio de icono no lo oye nadie. */}
				<span
					role="status"
					className={
						copyState === "failed" ? "text-destructive text-sm" : "sr-only"
					}
				>
					{copyState === "failed"
						? "No se pudo copiar. Selecciónala y cópiala a mano."
						: copyState === "copied"
							? "Contraseña copiada"
							: ""}
				</span>
			</div>

			<DialogFooter>
				<DialogClose asChild>
					<Button type="button">Listo</Button>
				</DialogClose>
			</DialogFooter>
		</>
	);
}
