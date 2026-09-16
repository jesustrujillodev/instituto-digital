import { UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
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
import type { HeadCandidate } from "../domain/dependency.types";
import { useAssignHeadFormIds } from "../hooks/use-dependency-form-ids";
import {
	DEPENDENCY_INTENTS,
	type DependencyActionData,
	INTENT_FIELD,
} from "../utils/parse-dependency-form-data";
import { HeadBadge } from "./dependency-badges";

interface AssignHeadDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	candidates: readonly HeadCandidate[];
}

const nameOf = (candidate: HeadCandidate) =>
	[candidate.firstName, candidate.lastName].filter(Boolean).join(" ").trim() ||
	candidate.email;

/**
 * Designación de titular.
 *
 * Es un diálogo aparte y no un campo del formulario de la dependencia porque no
 * es una edición sino un relevo: degrada a una cuenta, promueve a otra y cierra
 * las sesiones de ambas. Meterlo en el guardado general haría que cambiar unas
 * siglas arrastrara ese efecto.
 *
 * Solo ofrece cuentas ACTIVAS de la dependencia, que son las que el servicio
 * acepta. El servidor vuelve a comprobarlo: esto solo evita ofrecer lo que
 * fallaría.
 */
export function AssignHeadDialog({
	open,
	onOpenChange,
	candidates,
}: AssignHeadDialogProps) {
	const ids = useAssignHeadFormIds();
	const fetcher = useFetcher<DependencyActionData>();
	const currentHead = candidates.find((candidate) => candidate.isHead) ?? null;
	const [selected, setSelected] = useState<string>("");

	const isSubmitting = fetcher.state !== "idle";

	// Al cerrar se olvida la selección: reabrir el diálogo no debe proponer lo que
	// se descartó la vez anterior.
	useEffect(() => {
		if (!open) setSelected("");
	}, [open]);

	// Se cierra solo cuando el relevo se confirma. Si falló, se queda abierto para
	// que el error se lea junto a la acción que lo produjo.
	useEffect(() => {
		if (fetcher.data?.success) onOpenChange(false);
	}, [fetcher.data, onOpenChange]);

	const submit = () => {
		if (!selected) return;

		fetcher.submit(
			{
				userDocumentId: selected,
				[INTENT_FIELD]: DEPENDENCY_INTENTS.assignHead,
			},
			{ method: "post" },
		);
	};

	const error =
		fetcher.data && !fetcher.data.success ? fetcher.data.error.message : null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Designar titular</DialogTitle>
					<DialogDescription>
						{currentHead
							? `Hoy es titular ${nameOf(currentHead)}. Designar a otra persona lo releva y lo deja como participante.`
							: "Esta dependencia todavía no tiene titular."}
					</DialogDescription>
				</DialogHeader>

				{candidates.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No hay cuentas activas adscritas a esta dependencia. Da de alta a su
						personal antes de designar titular.
					</p>
				) : (
					<div className="flex flex-col gap-2">
						<Label htmlFor={ids.userDocumentId}>Persona</Label>
						<Select value={selected} onValueChange={setSelected}>
							<SelectTrigger id={ids.userDocumentId}>
								<SelectValue placeholder="Elige a quien la administrará" />
							</SelectTrigger>
							<SelectContent>
								{candidates.map((candidate) => (
									<SelectItem
										key={candidate.documentId}
										value={candidate.documentId}
									>
										<span className="flex items-center gap-2">
											{nameOf(candidate)}
											<HeadBadge isHead={candidate.isHead} />
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{error && <p className="text-destructive text-sm">{error}</p>}
					</div>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSubmitting}
					>
						Cancelar
					</Button>
					<Button
						onClick={submit}
						disabled={isSubmitting || !selected || candidates.length === 0}
					>
						<UserCog className="h-4 w-4" />
						{isSubmitting ? "Designando…" : "Designar titular"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
