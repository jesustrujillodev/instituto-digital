import { GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { SafeUser } from "@/modules/users/domain/user.types";
import { TextInput } from "@/shared/components/common/text-input";
import { TextareaInput } from "@/shared/components/common/textarea-input";
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
import { useActivateProfileFormIds } from "../hooks/use-trainer-form-ids";
import {
	INTENT_FIELD,
	TRAINER_INTENTS,
	type TrainerActionData,
} from "../utils/parse-trainer-form-data";

interface ActivateProfileDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	candidates: readonly SafeUser[];
}

const nameOf = (candidate: SafeUser) =>
	[candidate.firstName, candidate.lastName].filter(Boolean).join(" ").trim() ||
	candidate.email;

/**
 * Activación del perfil sobre una cuenta interna que ya existe.
 *
 * Solo ofrece personal DENTRO DEL ALCANCE de quien administra y sin perfil
 * todavía; el servidor vuelve a comprobarlo, esto solo evita ofrecer lo que
 * fallaría. Un capacitador externo no aparece aquí: nace con perfil en su
 * propia alta.
 */
export function ActivateProfileDialog({
	open,
	onOpenChange,
	candidates,
}: ActivateProfileDialogProps) {
	const ids = useActivateProfileFormIds();
	const fetcher = useFetcher<TrainerActionData>();
	const [selected, setSelected] = useState("");
	const [specialty, setSpecialty] = useState("");
	const [bio, setBio] = useState("");

	const isSubmitting = fetcher.state !== "idle";

	// Al cerrar se olvida lo tecleado: reabrir no debe proponer lo que se
	// descartó la vez anterior.
	useEffect(() => {
		if (open) return;

		setSelected("");
		setSpecialty("");
		setBio("");
	}, [open]);

	// Se cierra solo al confirmarse. Si falló, se queda abierto para que el error
	// se lea junto a la acción que lo produjo.
	useEffect(() => {
		if (fetcher.data?.success) onOpenChange(false);
	}, [fetcher.data, onOpenChange]);

	const submit = () => {
		if (!selected) return;

		fetcher.submit(
			{
				userDocumentId: selected,
				specialty,
				bio,
				[INTENT_FIELD]: TRAINER_INTENTS.activate,
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
					<DialogTitle>Activar perfil de capacitador</DialogTitle>
					<DialogDescription>
						El perfil se suma al rol que ya tenga la persona. Al activarlo se
						cierran sus sesiones para que el cambio tenga efecto de inmediato.
					</DialogDescription>
				</DialogHeader>

				{candidates.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Todo tu personal activo ya tiene perfil de capacitador.
					</p>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor={ids.userDocumentId}>Persona</Label>
							<Select value={selected} onValueChange={setSelected}>
								<SelectTrigger id={ids.userDocumentId}>
									<SelectValue placeholder="Elige a quién activarle el perfil" />
								</SelectTrigger>
								<SelectContent>
									{candidates.map((candidate) => (
										<SelectItem
											key={candidate.documentId}
											value={candidate.documentId}
										>
											{nameOf(candidate)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<TextInput
							id={ids.specialty}
							label="Especialidad"
							required
							placeholder="Protección civil"
							value={specialty}
							onChange={(event) => setSpecialty(event.target.value)}
						/>

						<TextareaInput
							id={ids.bio}
							label="Semblanza"
							rows={3}
							placeholder="Trayectoria breve, en una o dos frases."
							value={bio}
							onChange={(event) => setBio(event.target.value)}
						/>

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
						<GraduationCap className="h-4 w-4" />
						{isSubmitting ? "Activando…" : "Activar perfil"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
