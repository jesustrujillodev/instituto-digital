import * as v from "valibot";
import type { AppResponse } from "@/shared/response/response.types";
import { createResponseSchema } from "@/shared/rules/response.rules";
import type {
	assignHeadRule,
	createDependencyRule,
	findDependencyRule,
	listDependenciesRule,
	updateDependencyRule,
} from "./dependency.rules";
import { dependencySchema } from "./dependency.rules";

export type Dependency = v.InferOutput<typeof dependencySchema>;

export type CreateDependencyDto = v.InferInput<typeof createDependencyRule>;
export type UpdateDependencyDto = v.InferInput<typeof updateDependencyRule>;
export type FindDependencyDto = v.InferInput<typeof findDependencyRule>;
export type ListDependenciesDto = v.InferInput<typeof listDependenciesRule>;
export type AssignHeadDto = v.InferInput<typeof assignHeadRule>;

/**
 * Lo mínimo que el módulo necesita saber de una cuenta para decidir sobre ella.
 *
 * No es `SafeUser`: `dependencies` no depende del módulo `users` ni de su forma
 * de dominio, solo de los tres datos que gobiernan la designación de titular.
 */
export interface DependencyMember {
	id: number;
	documentId: string;
	archivedAt: Date | null;
}

/**
 * Cuenta elegible como titular: activa y adscrita a la dependencia.
 *
 * Lleva lo justo para pintar un selector y nada más. En particular NO lleva el id
 * interno: el formulario devuelve `documentId` y la traducción es del
 * repositorio, como en el resto del módulo.
 */
export interface HeadCandidate {
	documentId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	/** Ya ocupa el puesto: el selector lo marca y evita ofrecer un cambio nulo. */
	isHead: boolean;
}

// ===============================================================
// Contrato de respuesta del modulo
// ===============================================================

/** Una dependencia dentro del envelope estandar. */
export type DependencyResponse = AppResponse<Dependency>;

/** Página de dependencias; el total y las páginas viajan en `pagination`. */
export type DependencyListResponse = AppResponse<Dependency[]>;

// Instancias valibot del envelope con el dato de este dominio. Existen para
// validar la respuesta cuando cruza una frontera real —un contract test, o el
// día que este servicio viva detrás de HTTP— sin volver a describir la forma.
export const dependencyResponseSchema = createResponseSchema(dependencySchema);

export const dependencyListResponseSchema = createResponseSchema(
	v.array(dependencySchema),
);
