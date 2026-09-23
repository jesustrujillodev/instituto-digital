import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/shared/components/ui/sheet";
import type { ContentModule } from "../domain/content.types";
import { QuizBankPanel } from "./quiz-bank-panel";

/**
 * La evaluación de un módulo (docs/adr/0016). Aprobarla cuenta para el avance
 * como una lección obligatoria más.
 */
export function ModuleQuizSheet({
	open,
	onOpenChange,
	courseDocumentId,
	module,
	canWrite,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	courseDocumentId: string;
	module: ContentModule | null;
	canWrite: boolean;
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full gap-0 sm:max-w-3xl">
				<SheetHeader>
					<SheetTitle>Evaluación del módulo</SheetTitle>
					<SheetDescription>
						{module?.title}. Si el curso cuenta el contenido, hay que aprobarla
						para completarlo; a quien la repruebe, quien imparte le puede
						habilitar otro intento.
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto p-4">
					{module && (
						<QuizBankPanel
							courseDocumentId={courseDocumentId}
							owner={{
								lessonDocumentId: null,
								moduleDocumentId: module.documentId,
							}}
							defaultTitle={`Evaluación · ${module.title}`}
							canWrite={canWrite}
						/>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
