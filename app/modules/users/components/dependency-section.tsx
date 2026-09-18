import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { sileo } from "sileo";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { Role } from "@/shared/rules/atoms.rules";
import type { DependencyChangeEntry } from "../domain/user.types";
import {
	INTENT_FIELD,
	USER_INTENTS,
	type UserActionData,
} from "../utils/parse-user-form-data";
import { DependencyHistory } from "./dependency-history";

/** Lo que el loader de la edición resuelve para este actor y esta cuenta. */
export type DependencyChangeState =
	| { kind: "head" }
	| {
			kind: "available";
			currentName: string | null;
			options: readonly { documentId: string; name: string }[];
	  };

interface DependencySectionProps {
	user: { documentId: string; name: string; role: Role };
	history: readonly DependencyChangeEntry[];
	/** `null` = el actor no puede mover esta cuenta; queda solo la bitácora. */
	change: DependencyChangeState | null;
}

/**
 * Historial de adscripción con el traslado a otra dependencia.
 *
 * El traslado es una operación aparte del formulario —su propio intent y su
 * propio diálogo—: escribe bitácora y cierra las sesiones de la persona, y no
 * debe poder dispararse con "Guardar cambios".
 */
export function DependencySection({
	user,
	history,
	change,
}: DependencySectionProps) {
	const [open, setOpen] = useState(false);

	return (
		<Card className="mt-4">
			<CardContent className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="font-medium text-foreground text-sm">
						Historial de adscripción
					</span>
					{change?.kind === "available" && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setOpen(true)}
						>
							<Building2 aria-hidden="true" />
							Cambiar dependencia
						</Button>
					)}
				</div>

				{change?.kind === "head" && (
					<p className="text-muted-foreground text-sm">
						Es titular de su dependencia y no se puede trasladar mientras lo
						sea. Designa primero a otra persona como titular desde la
						dependencia.
					</p>
				)}

				<DependencyHistory entries={history} />
			</CardContent>

			{change?.kind === "available" && (
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogContent>
						{/* Se desmonta al cerrar: cada apertura empieza sin la elección ni
						    el error de la anterior. */}
						{open && (
							<ChangeDependencyBody
								user={user}
								change={change}
								onClose={setOpen}
							/>
						)}
					</DialogContent>
				</Dialog>
			)}
		</Card>
	);
}

function ChangeDependencyBody({
	user,
	change,
	onClose,
}: {
	user: DependencySectionProps["user"];
	change: Extract<DependencyChangeState, { kind: "available" }>;
	// El setter del estado, estable entre renders: el efecto de éxito no se repite.
	onClose: (open: false) => void;
}) {
	const fetcher = useFetcher<UserActionData>();
	const isSubmitting = fetcher.state !== "idle";
	const [target, setTarget] = useState("");

	const result = isSubmitting ? undefined : fetcher.data;

	// El fallo se queda en el diálogo, junto al selector: un toast detrás del
	// overlay obligaría a cerrar para enterarse. Solo el éxito se anuncia fuera.
	useEffect(() => {
		if (!result?.success) return;
		sileo.success({ title: result.message ?? "Dependencia actualizada" });
		onClose(false);
	}, [result, onClose]);

	const serverError =
		result && !result.success
			? (result.error.fieldErrors?.dependency ?? result.error.message)
			: undefined;

	const submit = () =>
		fetcher.submit(
			{ dependency: target, [INTENT_FIELD]: USER_INTENTS.changeDependency },
			{
				method: "post",
				action: `/dashboard/usuarios/${user.documentId}/editar`,
			},
		);

	return (
		<div className="grid gap-6">
			<DialogHeader>
				<DialogTitle>Cambiar dependencia</DialogTitle>
				<DialogDescription>
					{user.name} está en {change.currentName ?? "ninguna dependencia"}. El
					cambio es inmediato: se cerrarán sus sesiones abiertas y recibirá un
					aviso por correo.
					{user.role === "DEPENDENCY_DEPUTY" &&
						" Dejará de ser auxiliar de su dependencia actual."}
				</DialogDescription>
			</DialogHeader>

			<div className="grid gap-1.5">
				<Label htmlFor="cambiar-dependencia">Nueva dependencia</Label>
				<Select
					value={target}
					onValueChange={setTarget}
					disabled={change.options.length === 0}
				>
					<SelectTrigger
						id="cambiar-dependencia"
						className="w-full"
						aria-invalid={Boolean(serverError)}
					>
						<SelectValue
							placeholder={
								change.options.length === 0
									? "No hay otra dependencia activa"
									: "Elige la dependencia"
							}
						/>
					</SelectTrigger>
					<SelectContent>
						{change.options.map((dependency) => (
							<SelectItem
								key={dependency.documentId}
								value={dependency.documentId}
							>
								{dependency.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{serverError && (
					<span className="text-destructive text-sm" role="alert">
						{serverError}
					</span>
				)}
			</div>

			<DialogFooter>
				<DialogClose asChild>
					<Button type="button" variant="outline">
						Cancelar
					</Button>
				</DialogClose>
				<Button
					type="button"
					onClick={submit}
					disabled={isSubmitting || !target}
				>
					{isSubmitting ? "Cambiando…" : "Cambiar dependencia"}
				</Button>
			</DialogFooter>
		</div>
	);
}
