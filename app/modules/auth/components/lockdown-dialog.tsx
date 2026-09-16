import { ShieldAlert } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { TextInput } from "@/shared/components/common/text-input";
import { TextareaInput } from "@/shared/components/common/textarea-input";
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
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { LOCKDOWN_CONFIRMATION_WORD } from "../domain/auth.rules";
import type { LockdownScope } from "../domain/security-state.repository";

export interface LockdownRequest {
	scope: LockdownScope;
	reason: string;
	confirmation: string;
}

// Cada alcance lleva su consecuencia al lado: es lo que hay que saber para
// elegir, y así no hace falta un párrafo aparte que cambie según la opción.
const SCOPE_OPTIONS: ReadonlyArray<{
	value: LockdownScope;
	label: string;
	consequence: ReactNode;
}> = [
	{
		value: "except-admin",
		label: "Todos salvo ADMIN",
		consequence: "Nadie más entra. Se levanta desde esta pantalla.",
	},
	{
		value: "all",
		label: "Todos, incluido ADMIN",
		consequence: (
			<>
				Nadie entra, tampoco tú. Solo se levanta en el servidor con{" "}
				<code className="rounded bg-muted px-1 py-0.5 text-foreground">
					bun run lockdown lift
				</code>
				.
			</>
		),
	},
];

interface LockdownDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	busy: boolean;
	onConfirm: (request: LockdownRequest) => void;
}

/**
 * Formulario de lockdown. No envía nada: lo hace la página con su fetcher, que
 * sigue montado cuando la revalidación oculta el botón que abrió el diálogo
 * (docs/auth/03-lockdown.md §7).
 */
export function LockdownDialog({
	open,
	onOpenChange,
	busy,
	onConfirm,
}: LockdownDialogProps) {
	const [scope, setScope] = useState<LockdownScope>("except-admin");
	const [reason, setReason] = useState("");
	const [confirmation, setConfirmation] = useState("");

	const canActivate = confirmation === LOCKDOWN_CONFIRMATION_WORD && !busy;

	const reset = () => {
		setScope("except-admin");
		setReason("");
		setConfirmation("");
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) reset();
		onOpenChange(nextOpen);
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canActivate) return;

		onConfirm({ scope, reason, confirmation });
		handleOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<form onSubmit={handleSubmit} className="grid gap-6">
					<DialogHeader>
						<DialogTitle>Activar lockdown</DialogTitle>
						<DialogDescription>
							Corta el acceso en curso y bloquea los inicios de sesión nuevos.
						</DialogDescription>
					</DialogHeader>

					<RadioGroup
						value={scope}
						onValueChange={(value) => setScope(value as LockdownScope)}
						aria-label="Alcance"
					>
						{SCOPE_OPTIONS.map((option) => (
							<div key={option.value} className="flex items-start gap-3">
								<RadioGroupItem
									id={`lockdown-scope-${option.value}`}
									value={option.value}
									className="mt-0.5"
								/>
								<Label
									htmlFor={`lockdown-scope-${option.value}`}
									className="flex flex-col items-start gap-1"
								>
									<span className="font-medium text-foreground">
										{option.label}
									</span>
									<span className="font-normal text-muted-foreground leading-snug">
										{option.consequence}
									</span>
								</Label>
							</div>
						))}
					</RadioGroup>

					<TextareaInput
						name="reason"
						label="Motivo (opcional)"
						helperText="Interno; no lo ve quien queda bloqueado."
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						maxLength={500}
						rows={2}
					/>

					<TextInput
						name="confirmation"
						label={`Escribe ${LOCKDOWN_CONFIRMATION_WORD} para confirmar`}
						value={confirmation}
						onChange={(event) => setConfirmation(event.target.value)}
						autoComplete="off"
						spellCheck={false}
					/>

					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="outline">
								Cancelar
							</Button>
						</DialogClose>
						<Button type="submit" variant="destructive" disabled={!canActivate}>
							<ShieldAlert className="h-4 w-4" />
							Activar lockdown
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
