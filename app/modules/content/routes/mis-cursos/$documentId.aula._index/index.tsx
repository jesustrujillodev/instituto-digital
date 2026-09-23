import { BookOpen } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";

export { loader } from "./index.loader";

export default function AulaIndexPage() {
	return (
		<Empty className="border border-border border-dashed p-8">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<BookOpen />
				</EmptyMedia>
				<EmptyTitle>Todavía no hay lecciones</EmptyTitle>
				<EmptyDescription>
					Cuando quien imparte el curso publique su temario, aparecerá aquí.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
