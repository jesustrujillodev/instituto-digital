import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { EvaluationTarget } from "../evaluation.types";

export const COURSE_DOC = "11111111-1111-4111-8111-111111111111";
export const EVALUATION_DOC = "41111111-1111-4111-8111-111111111111";
export const SESSION_DOC = "21111111-1111-4111-8111-111111111111";
export const ANA_DOC = "31111111-1111-4111-8111-111111111111";
export const LUIS_DOC = "32222222-2222-4222-8222-222222222222";

/** Dos inscritos, sin nada capturado, en un curso publicado de Obras Públicas. */
export const targetOf = (
	overrides: Partial<EvaluationTarget> = {},
): EvaluationTarget => ({
	id: 7,
	course: { id: 10, status: "PUBLISHED", dependencyId: 3 },
	participants: [
		{ userId: 50, userDocumentId: ANA_DOC },
		{ userId: 51, userDocumentId: LUIS_DOC },
	],
	results: [],
	...overrides,
});

export const actorOf = (overrides: Partial<AuthContext> = {}): AuthContext => ({
	userId: 9,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "carlos.sop@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: true,
	...overrides,
});
