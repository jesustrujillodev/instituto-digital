import { Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { TextInput } from "@/shared/components/common/text-input";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { GroupMemberEntry, MemberCandidate } from "../domain/group.types";
import {
	GROUP_INTENTS,
	type GroupActionData,
	INTENT_FIELD,
} from "../utils/parse-group-form-data";
import { memberNameOf } from "../utils/to-group-rows";

interface GroupMembersProps {
	members: readonly GroupMemberEntry[];
	candidates: readonly MemberCandidate[];
	/** Término con el que se acotó el selector; vive en la URL. */
	memberSearch: string;
	canManage: boolean;
	/** Dependencia del grupo: es la que decide quién puede entrar. */
	dependencyName: string;
}

const SEARCH_DEBOUNCE_MS = 300;

const candidateNameOf = (candidate: MemberCandidate) =>
	[candidate.firstName, candidate.lastName].filter(Boolean).join(" ").trim() ||
	candidate.email;

/**
 * Miembros del grupo y alta de nuevos.
 *
 * Los candidatos son de la dependencia DEL GRUPO, no de la de quien administra,
 * y el servidor vuelve a comprobarlo: esto solo evita ofrecer lo que fallaría.
 *
 * Quien cambió de dependencia después de entrar sigue en la lista y se muestra
 * con su dependencia actual — §6.4 evalúa la pertenencia al ver el curso o al
 * inscribirse, no antes.
 */
export function GroupMembers({
	members,
	candidates,
	memberSearch,
	canManage,
	dependencyName,
}: GroupMembersProps) {
	const [, setSearchParams] = useSearchParams();
	const [term, setTerm] = useState(memberSearch);
	const [selected, setSelected] = useState<string[]>([]);

	const fetcher = useFetcher<GroupActionData>();
	useFetcherToast(fetcher);

	const isSubmitting = fetcher.state !== "idle";

	// El término vive en la URL para que el loader lo lea y la lista sea
	// enlazable; el input se controla en local y solo viaja tras la pausa.
	useEffect(() => {
		if (term === memberSearch) return;

		const timeout = setTimeout(() => {
			setSearchParams(
				(previous) => {
					const next = new URLSearchParams(previous);
					if (term === "") next.delete("miembro");
					else next.set("miembro", term);
					return next;
				},
				{ preventScrollReset: true },
			);
		}, SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timeout);
	}, [term, memberSearch, setSearchParams]);

	// Al confirmarse el alta se limpia la selección: dejarla marcada invitaría a
	// reenviar a gente que ya está dentro.
	useEffect(() => {
		if (fetcher.data?.success) setSelected([]);
	}, [fetcher.data]);

	const toggle = useCallback((documentId: string) => {
		setSelected((previous) =>
			previous.includes(documentId)
				? previous.filter((id) => id !== documentId)
				: [...previous, documentId],
		);
	}, []);

	const addSelected = () => {
		if (selected.length === 0) return;

		const body = new FormData();
		for (const documentId of selected) {
			body.append("userDocumentIds", documentId);
		}
		body.append(INTENT_FIELD, GROUP_INTENTS.addMembers);

		fetcher.submit(body, { method: "post" });
	};

	const removeMember = (userDocumentId: string) => {
		fetcher.submit(
			{ userDocumentId, [INTENT_FIELD]: GROUP_INTENTS.removeMember },
			{ method: "post" },
		);
	};

	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<Card>
				<CardContent className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<Users className="h-4 w-4 text-muted-foreground" />
						<h3 className="font-medium text-sm">Miembros</h3>
						<Badge variant="secondary">{members.length}</Badge>
					</div>

					{members.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Este grupo todavía no tiene miembros.
						</p>
					) : (
						<ul className="flex flex-col divide-y divide-border">
							{members.map((member) => (
								<li
									key={member.userDocumentId}
									className="flex items-center justify-between gap-3 py-2"
								>
									<div className="min-w-0">
										<p className="truncate font-medium text-sm">
											{memberNameOf(member)}
										</p>
										<p className="truncate text-muted-foreground text-xs">
											{member.dependencyName ?? "Sin dependencia"}
										</p>
									</div>

									{canManage && (
										<Button
											variant="ghost"
											size="icon"
											aria-label={`Dar de baja a ${memberNameOf(member)}`}
											disabled={isSubmitting}
											onClick={() => removeMember(member.userDocumentId)}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									)}
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			{canManage && (
				<Card>
					<CardContent className="flex flex-col gap-3">
						<div>
							<h3 className="font-medium text-sm">Agregar miembros</h3>
							<p className="text-muted-foreground text-xs">
								Personal interno y activo de {dependencyName}.
							</p>
						</div>

						<TextInput
							name="miembro"
							placeholder="Buscar por nombre o correo"
							value={term}
							onChange={(event) => setTerm(event.target.value)}
						/>

						{candidates.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No hay personal disponible que coincida con la búsqueda.
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
													{candidateNameOf(candidate)}
												</span>
												<span className="block truncate text-muted-foreground text-xs">
													{candidate.email}
												</span>
											</span>
										</Label>
									</li>
								))}
							</ul>
						)}

						<Button
							onClick={addSelected}
							disabled={isSubmitting || selected.length === 0}
						>
							<UserPlus className="h-4 w-4" />
							{isSubmitting
								? "Agregando…"
								: selected.length <= 1
									? "Agregar al grupo"
									: `Agregar ${selected.length} al grupo`}
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
