import { Send, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { type BatchSelection, planBatch } from "../utils/enrollment-batch";

interface BatchActionsProps extends BatchSelection {
	busy: boolean;
	onAssign: () => void;
	onInvite: () => void;
}

/** Pie de un selector: qué pasaría al inscribir, y las acciones. */
export function BatchActions({
	busy,
	onAssign,
	onInvite,
	...selection
}: BatchActionsProps) {
	const plan = planBatch(selection);

	return (
		<div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
			<p
				aria-live="polite"
				className={cn(
					"text-sm",
					plan.blocked ? "text-destructive" : "text-muted-foreground",
				)}
			>
				{plan.message}
			</p>
			<div className="flex shrink-0 gap-2">
				{selection.canInvite && (
					<Button
						variant="outline"
						disabled={busy || selection.selected === 0}
						onClick={onInvite}
					>
						<Send className="h-4 w-4" />
						Invitar
					</Button>
				)}
				<Button disabled={busy || !plan.canAssign} onClick={onAssign}>
					<UserPlus className="h-4 w-4" />
					Inscribir
				</Button>
			</div>
		</div>
	);
}
