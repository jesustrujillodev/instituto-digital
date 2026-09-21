import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { TextInput } from "@/shared/components/common/text-input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import type { RosterCandidate } from "../domain/enrollment.types";
import { personNameOf } from "../utils/enrollment-labels";
import { PERSON_SEARCH_PARAM } from "../utils/parse-enrollment-form-data";

const SEARCH_DEBOUNCE_MS = 300;

interface ParticipantPickerProps {
	candidates: readonly RosterCandidate[];
	search: string;
	/** Se limpia la selección cuando cambia, p. ej. tras un envío exitoso. */
	resetKey: unknown;
	showDependency?: boolean;
	actions: (selected: readonly RosterCandidate[]) => ReactNode;
}

/**
 * Buscador de personas con selección múltiple; el término vive en la URL.
 *
 * La selección guarda a la persona completa y no solo su id: sobrevive a una
 * búsqueda nueva que ya no la lista, y quien envía sigue sabiendo si se le
 * puede inscribir o solo invitar.
 */
export function ParticipantPicker({
	candidates,
	search,
	resetKey,
	showDependency = false,
	actions,
}: ParticipantPickerProps) {
	const [, setSearchParams] = useSearchParams();
	const [term, setTerm] = useState(search);
	const [selected, setSelected] = useState<RosterCandidate[]>([]);

	useEffect(() => {
		if (term === search) return;

		const timeout = setTimeout(() => {
			setSearchParams(
				(previous) => {
					const next = new URLSearchParams(previous);
					if (term === "") next.delete(PERSON_SEARCH_PARAM);
					else next.set(PERSON_SEARCH_PARAM, term);
					return next;
				},
				{ preventScrollReset: true },
			);
		}, SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timeout);
	}, [term, search, setSearchParams]);

	useEffect(() => {
		if (resetKey) setSelected([]);
	}, [resetKey]);

	const isSelected = (documentId: string) =>
		selected.some((person) => person.documentId === documentId);

	const toggle = useCallback((candidate: RosterCandidate) => {
		setSelected((previous) =>
			previous.some((person) => person.documentId === candidate.documentId)
				? previous.filter(
						(person) => person.documentId !== candidate.documentId,
					)
				: [...previous, candidate],
		);
	}, []);

	const hiddenSelected = selected.filter(
		(person) =>
			!candidates.some(
				(candidate) => candidate.documentId === person.documentId,
			),
	).length;

	return (
		<div className="flex flex-col gap-3">
			<TextInput
				name={PERSON_SEARCH_PARAM}
				type="search"
				aria-label="Buscar personas"
				placeholder="Buscar por nombre o correo"
				value={term}
				onChange={(event) => setTerm(event.target.value)}
			/>

			{candidates.length === 0 ? (
				<p className="py-6 text-center text-muted-foreground text-sm">
					{search
						? "Nadie coincide con la búsqueda, o ya está en el curso."
						: "Todas las personas disponibles ya están en el curso."}
				</p>
			) : (
				<ul className="-mx-2 flex max-h-80 flex-col overflow-y-auto">
					{candidates.map((candidate) => (
						<li key={candidate.documentId}>
							<Label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 font-normal hover:bg-muted">
								<Checkbox
									checked={isSelected(candidate.documentId)}
									onCheckedChange={() => toggle(candidate)}
								/>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm">
										{personNameOf(candidate)}
									</span>
									<span className="block truncate text-muted-foreground text-xs">
										{showDependency
											? `${candidate.email} · ${candidate.dependencyName}`
											: candidate.email}
									</span>
								</span>
								{!candidate.assignable && (
									<span className="shrink-0 text-muted-foreground text-xs">
										Solo invitación
									</span>
								)}
							</Label>
						</li>
					))}
				</ul>
			)}

			{hiddenSelected > 0 && (
				<p className="text-muted-foreground text-xs">
					{hiddenSelected === 1
						? "1 persona elegida no aparece en esta búsqueda."
						: `${hiddenSelected} personas elegidas no aparecen en esta búsqueda.`}
				</p>
			)}

			{actions(selected)}
		</div>
	);
}
