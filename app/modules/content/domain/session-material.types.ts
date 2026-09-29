import type * as v from "valibot";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type {
	createSessionMaterialRule,
	removeSessionMaterialRule,
	SessionMaterialType,
	sessionUploadUrlRule,
	updateSessionMaterialRule,
} from "./session-material.rules";

export type SessionUploadUrlDto = v.InferOutput<typeof sessionUploadUrlRule>;
export type CreateSessionMaterialDto = v.InferOutput<
	typeof createSessionMaterialRule
>;
export type UpdateSessionMaterialDto = v.InferOutput<
	typeof updateSessionMaterialRule
>;
export type RemoveSessionMaterialDto = v.InferOutput<
	typeof removeSessionMaterialRule
>;

/** Un material por crear, todavía sin la sesión de la que colgará. */
export type NewSessionMaterial =
	| {
			type: "FILE" | "VIDEO";
			title: string;
			availableFromSession: boolean;
			key: string;
			fileName: string;
			mimeType: string;
	  }
	| {
			type: "LINK";
			title: string;
			availableFromSession: boolean;
			externalUrl: string;
	  };

/**
 * El material de una sesión que el alta aún no guarda. Vive en el formulario,
 * con su fila, y se crea cuando el paso se guarda.
 */
export type PendingSessionMaterial = NewSessionMaterial & { draftId: string };

/** Tal como se guarda: `fileUrl` es la referencia del proxy, no una URL firmada. */
export interface SessionMaterialRaw {
	documentId: string;
	type: SessionMaterialType;
	title: string;
	fileUrl: string | null;
	fileName: string | null;
	fileSize: number | null;
	mimeType: string | null;
	externalUrl: string | null;
	availableFromSession: boolean;
}

/** Firmado para abrirse: `fileUrl` para verlo, `downloadUrl` para descargarlo. */
export interface SessionMaterial extends SessionMaterialRaw {
	downloadUrl: string | null;
}

export interface SessionMaterialsRaw {
	documentId: string;
	startsAt: Date;
	endsAt: Date;
	materials: SessionMaterialRaw[];
}

export interface SessionMaterialCourseRef {
	id: number;
	status: CourseStatus;
}

/** Lo que ve quien administra: todo el material, con sus sesiones. */
export interface SessionMaterialBoard {
	/** Finalizado o cancelado: se consulta, ya no se cambia. */
	editable: boolean;
	sessions: {
		documentId: string;
		startsAt: Date;
		endsAt: Date;
		materials: SessionMaterial[];
	}[];
}

/**
 * Lo que ve el participante. Lo que todavía no se abre viaja sin enlaces: la
 * espera no depende de que la interfaz lo esconda.
 */
export type ParticipantSessionMaterial =
	| ({ state: "available" } & SessionMaterial)
	| {
			state: "locked";
			documentId: string;
			type: SessionMaterialType;
			title: string;
			availableAt: Date;
	  };

export interface ParticipantSessionMaterials {
	sessionDocumentId: string;
	materials: ParticipantSessionMaterial[];
}

export interface SessionMaterialWrite {
	type: SessionMaterialType;
	title: string;
	fileUrl: string | null;
	fileName: string | null;
	fileSize: number | null;
	mimeType: string | null;
	externalUrl: string | null;
	availableFromSession: boolean;
}
