import type * as v from "valibot";
import type { CourseModality } from "@/modules/courses/domain/course.rules";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	creditsOverviewQueryRule,
	myCreditsQueryRule,
} from "./credit.rules";

export type MyCreditsQueryDto = v.InferOutput<typeof myCreditsQueryRule>;
export type CreditsOverviewQueryDto = v.InferOutput<
	typeof creditsOverviewQueryRule
>;

// ── Escritura (la usa `teaching` al finalizar y al corregir) ──────────────────

/** Estado actual del crédito de una persona en un curso. */
export interface StoredCredit {
	userId: number;
	dependencyId: number;
	revokedAt: Date | null;
}

/** Persona que completó el curso y puede sumar crédito, con su dependencia de hoy. */
export interface CreditCandidate {
	userId: number;
	dependencyId: number;
}

export interface CreditDiff {
	grant: CreditCandidate[];
	/** Tenían un crédito retirado y vuelven a cumplir. */
	restore: number[];
	revoke: number[];
}

export interface CreditWriteContext {
	courseId: number;
	fiscalYear: number;
	at: Date;
	actorId: number;
}

// ── Lectura ───────────────────────────────────────────────────────────────────

export interface MyCreditCourse {
	documentId: string;
	title: string;
	modality: CourseModality;
	coverUrl: string | null;
	/** La organizadora del curso. */
	dependencyName: string;
	sessionCount: number;
	firstSessionAt: Date | null;
	lastSessionEndsAt: Date | null;
	totalMinutes: number;
}

export interface MyCredit {
	documentId: string;
	/** La dependencia para la que cuenta, que puede no ser la actual. */
	dependencyName: string;
	fiscalYear: number;
	grantedAt: Date;
	course: MyCreditCourse;
	attendedSessions: number;
	grade: number | null;
}

export interface CreditTally {
	label: string;
	total: number;
}

export interface MyCredits {
	fiscalYear: number;
	yearTotal: number;
	historicTotal: number;
	/** Ejercicios con algún crédito, más el pedido. Descendentes. */
	years: { fiscalYear: number; total: number }[];
	/** Del ejercicio, de mayor a menor. */
	byDependency: CreditTally[];
	/** Solo los del ejercicio. */
	credits: MyCredit[];
}

export interface StaffCreditRow {
	userDocumentId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	currentDependencyName: string | null;
	/** Obtuvo créditos aquí pero hoy pertenece a otra dependencia. */
	transferred: boolean;
	credits: number;
}

export interface DependencyCreditRow {
	dependencyDocumentId: string;
	name: string;
	credits: number;
	people: number;
}

export interface CreditDependency {
	id: number;
	documentId: string;
	name: string;
}

export type CreditsOverview =
	| {
			view: "staff";
			fiscalYear: number;
			dependency: Omit<CreditDependency, "id">;
			/** El alcance global llega desde el resumen y puede volver a él. */
			canChangeDependency: boolean;
			rows: StaffCreditRow[];
	  }
	| {
			view: "dependencies";
			fiscalYear: number;
			rows: DependencyCreditRow[];
	  };

export interface StaffQuery {
	dependencyId: number;
	fiscalYear: number;
	page: number;
	pageSize: number;
	search?: string;
}

export type MyCreditsResponse = AppResponse<MyCredits>;
export type CreditsOverviewResponse = AppResponse<CreditsOverview>;
