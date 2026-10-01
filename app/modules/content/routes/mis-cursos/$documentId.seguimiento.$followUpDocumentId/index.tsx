import { Clock, QrCode } from "lucide-react";
import { PageHeader } from "@/shared/components/common/page-header";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	QuizOutcomeView,
	QuizRetakeHint,
	QuizRetryNotice,
	QuizTaker,
} from "../../../components/quiz-taker";
import { followUpOwnerOf } from "../../../domain/quiz.rules";
import type { Route } from "./+types/index";

export { action } from "./index.action";
export { loader } from "./index.loader";

export function meta({ data }: Route.MetaArgs) {
	return [{ title: data?.data.view?.title ?? "Evaluación de seguimiento" }];
}

const UNAVAILABLE_COPY = {
	NOT_YET: {
		icon: Clock,
		text: "Esta evaluación todavía no se abre. Vuelve cuando lo indique quien imparte la sesión.",
	},
	NOT_ATTENDED: {
		icon: QrCode,
		text: "Para presentarla, registra tu asistencia a la sesión escaneando su código QR.",
	},
	CLOSED: {
		icon: Clock,
		text: "Esta evaluación ya se cerró.",
	},
} as const;

export default function SeguimientoPage({
	loaderData,
	params,
}: Route.ComponentProps) {
	const { courseDocumentId, view } = loaderData.data;
	const unavailable =
		view &&
		(view.availability === "NOT_YET" ||
			view.availability === "NOT_ATTENDED" ||
			view.availability === "CLOSED")
			? UNAVAILABLE_COPY[view.availability]
			: null;

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={view?.title ?? "Evaluación de seguimiento"}
				description="Evaluación de seguimiento"
				goBack={`/dashboard/mis-capacitaciones/${courseDocumentId}`}
			/>
			<Card>
				<CardContent className="flex flex-col gap-6">
					{!view ? (
						<p className="text-muted-foreground text-sm">
							Esta evaluación todavía no tiene preguntas.
						</p>
					) : view.sheet ? (
						<>
							{view.outcome && <QuizRetryNotice outcome={view.outcome} />}
							<QuizTaker
								sheet={view.sheet}
								owner={followUpOwnerOf(params.followUpDocumentId)}
							/>
						</>
					) : view.outcome ? (
						<>
							<QuizOutcomeView outcome={view.outcome} />
							{view.canRequestRetake && <QuizRetakeHint />}
						</>
					) : unavailable ? (
						<Alert>
							<unavailable.icon />
							<AlertDescription>{unavailable.text}</AlertDescription>
						</Alert>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
