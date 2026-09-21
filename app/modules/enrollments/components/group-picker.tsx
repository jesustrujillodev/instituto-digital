import { type ReactNode, useEffect, useState } from "react";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import type { RosterGroupOption } from "../domain/enrollment.types";

interface GroupPickerProps {
	groups: readonly RosterGroupOption[];
	/** Se limpia la selección cuando cambia, p. ej. tras un envío exitoso. */
	resetKey: unknown;
	showDependency?: boolean;
	actions: (selected: readonly RosterGroupOption[]) => ReactNode;
}

const membersLabel = (group: RosterGroupOption): string => {
	const pending = group.enrollableMemberIds.length;
	const total = `${group.memberCount} ${group.memberCount === 1 ? "miembro" : "miembros"}`;

	if (group.memberCount === 0) return "Sin miembros";
	if (pending === 0) return `${total} · todos inscritos`;
	if (pending === group.memberCount) return total;

	return `${total} · ${pending} por inscribir`;
};

export function GroupPicker({
	groups,
	resetKey,
	showDependency = false,
	actions,
}: GroupPickerProps) {
	const [selected, setSelected] = useState<string[]>([]);

	useEffect(() => {
		if (resetKey) setSelected([]);
	}, [resetKey]);

	const toggle = (documentId: string) =>
		setSelected((previous) =>
			previous.includes(documentId)
				? previous.filter((id) => id !== documentId)
				: [...previous, documentId],
		);

	return (
		<div className="flex flex-col gap-3">
			{groups.length === 0 ? (
				<p className="py-6 text-center text-muted-foreground text-sm">
					No hay grupos activos en tu alcance.
				</p>
			) : (
				<ul className="-mx-2 flex max-h-80 flex-col overflow-y-auto">
					{groups.map((group) => (
						<li key={group.documentId}>
							<Label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 font-normal hover:bg-muted">
								<Checkbox
									checked={selected.includes(group.documentId)}
									onCheckedChange={() => toggle(group.documentId)}
								/>
								<span className="min-w-0">
									<span className="block truncate text-sm">{group.name}</span>
									<span className="block truncate text-muted-foreground text-xs">
										{showDependency
											? `${group.dependencyName} · ${membersLabel(group)}`
											: membersLabel(group)}
									</span>
								</span>
							</Label>
						</li>
					))}
				</ul>
			)}

			{actions(groups.filter((group) => selected.includes(group.documentId)))}
		</div>
	);
}
