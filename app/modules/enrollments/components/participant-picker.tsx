import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { TextInput } from "@/shared/components/common/text-input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import type { ParticipantCandidate } from "../domain/enrollment.types";
import { personNameOf } from "../utils/enrollment-labels";
import { PERSON_SEARCH_PARAM } from "../utils/parse-enrollment-form-data";

const SEARCH_DEBOUNCE_MS = 300;

interface ParticipantPickerProps {
	candidates: readonly ParticipantCandidate[];
	search: string;
	/** Se limpia la selección cuando cambia, p. ej. tras un envío exitoso. */
	resetKey: unknown;
	showDependency?: boolean;
	actions: (selected: readonly string[]) => ReactNode;
}

/** Buscador de personas con selección múltiple; el término vive en la URL. */
export function ParticipantPicker({
	candidates,
	search,
	resetKey,
	showDependency = false,
	actions,
}: ParticipantPickerProps) {
	const [, setSearchParams] = useSearchParams();
	const [term, setTerm] = useState(search);
	const [selected, setSelected] = useState<string[]>([]);

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

	const toggle = useCallback((documentId: string) => {
		setSelected((previous) =>
			previous.includes(documentId)
				? previous.filter((id) => id !== documentId)
				: [...previous, documentId],
		);
	}, []);

	return (
		<div className="flex flex-col gap-3">
			<TextInput
				name={PERSON_SEARCH_PARAM}
				placeholder="Buscar por nombre o correo"
				value={term}
				onChange={(event) => setTerm(event.target.value)}
			/>

			{candidates.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No hay personas disponibles que coincidan con la búsqueda.
				</p>
			) : (
				<ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
					{candidates.map((candidate) => (
						<li key={candidate.documentId}>
							<Label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
								<Checkbox
									checked={selected.includes(candidate.documentId)}
									onCheckedChange={() => toggle(candidate.documentId)}
								/>
								<span className="min-w-0">
									<span className="block truncate text-sm">
										{personNameOf(candidate)}
									</span>
									<span className="block truncate text-muted-foreground text-xs">
										{showDependency
											? `${candidate.email} · ${candidate.dependencyName}`
											: candidate.email}
									</span>
								</span>
							</Label>
						</li>
					))}
				</ul>
			)}

			{actions(selected)}
		</div>
	);
}
