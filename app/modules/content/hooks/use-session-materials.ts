import { useCallback, useEffect } from "react";
import { useFetcher } from "react-router";
import { useFetcherPromise } from "@/shared/hooks/use-fetcher-promise";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { AppResponse } from "@/shared/response/response.types";
import type { LessonUploadKind } from "../domain/content.rules";
import type { UploadTicket } from "../domain/content.types";
import type {
	NewSessionMaterial,
	SessionMaterial,
	SessionMaterialBoard,
} from "../domain/session-material.types";
import {
	CONTENT_INTENTS,
	INTENT_FIELD,
	PAYLOAD_FIELD,
	sessionMaterialsPath,
} from "../utils/content-form";

/** Lo que la hoja de una sesión pinta y hace, venga de la base o del formulario. */
export interface SheetMaterial {
	id: string;
	type: SessionMaterial["type"];
	title: string;
	fileName: string | null;
	fileSize: number | null;
	externalUrl: string | null;
	/** `null` si todavía no se puede abrir: un archivo sin guardar. */
	href: string | null;
	availableFromSession: boolean;
}

export interface SessionMaterialSource {
	/** `null` mientras carga. */
	materials: SheetMaterial[] | null;
	editable: boolean;
	busy: boolean;
	/** El material de una sesión sin guardar espera a que se guarde el paso. */
	pending: boolean;
	add: (material: NewSessionMaterial) => Promise<boolean>;
	toggle: (id: string, availableFromSession: boolean) => void;
	remove: (id: string) => void;
	requestTicket: (
		kind: LessonUploadKind,
		file: File,
	) => Promise<UploadTicket | null>;
}

const toSheetMaterial = (material: SessionMaterial): SheetMaterial => ({
	id: material.documentId,
	type: material.type,
	title: material.title,
	fileName: material.fileName,
	fileSize: material.fileSize,
	externalUrl: material.externalUrl,
	href: material.type === "LINK" ? material.externalUrl : material.fileUrl,
	availableFromSession: material.availableFromSession,
});

type Intent =
	| typeof CONTENT_INTENTS.createSessionMaterial
	| typeof CONTENT_INTENTS.updateSessionMaterial
	| typeof CONTENT_INTENTS.removeSessionMaterial;

const payloadOf = (intent: string, payload: unknown) => ({
	[INTENT_FIELD]: intent,
	[PAYLOAD_FIELD]: JSON.stringify(payload),
});

/**
 * El material de las sesiones de un curso: lo carga una vez y escribe contra
 * la misma ruta. Cada escritura revalida la carga, así que la lista y los
 * conteos se ponen al día solos.
 *
 * `null` mientras el curso no existe: el alta todavía no guardó el borrador.
 */
export function useSessionMaterials(courseDocumentId: string | null) {
	const loader = useFetcher<AppResponse<SessionMaterialBoard>>();
	const saver = useFetcherPromise<AppResponse<unknown>>();
	const ticketer = useFetcherPromise<AppResponse<UploadTicket>>();
	useFetcherToast(saver.fetcher);
	useFetcherToast(ticketer.fetcher);

	const path = courseDocumentId ? sessionMaterialsPath(courseDocumentId) : null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: el fetcher cambia de identidad en cada render y reentraría en bucle.
	useEffect(() => {
		if (path) loader.load(path);
	}, [path]);

	const board = loader.data?.success ? loader.data.data : null;

	const submit = useCallback(
		async (intent: Intent, payload: unknown) => {
			if (!path) return false;

			const result = await saver.submit(payloadOf(intent, payload), {
				method: "post",
				action: path,
			});
			return result?.success === true;
		},
		[path, saver.submit],
	);

	/** Sin sesión: el archivo es de una fila que el alta todavía no guarda. */
	const requestTicket = useCallback(
		async (
			sessionDocumentId: string | null,
			kind: LessonUploadKind,
			file: File,
		) => {
			if (!path) return null;

			const result = await ticketer.submit(
				payloadOf(CONTENT_INTENTS.uploadUrl, {
					...(sessionDocumentId && { sessionDocumentId }),
					kind,
					fileName: file.name,
					contentType: file.type,
					size: file.size,
				}),
				{ method: "post", action: path },
			);
			return result?.success ? result.data : null;
		},
		[path, ticketer.submit],
	);

	const storedOf = (sessionDocumentId: string) =>
		board?.sessions.find((session) => session.documentId === sessionDocumentId);

	/** La hoja de una sesión ya guardada: cada cambio se escribe en el acto. */
	const sourceFor = (sessionDocumentId: string): SessionMaterialSource => ({
		materials: board
			? (storedOf(sessionDocumentId)?.materials ?? []).map(toSheetMaterial)
			: null,
		editable: board?.editable ?? false,
		busy: saver.fetcher.state !== "idle",
		pending: false,
		add: (material) =>
			submit(CONTENT_INTENTS.createSessionMaterial, {
				...material,
				sessionDocumentId,
			}),
		toggle: (id, availableFromSession) => {
			const material = storedOf(sessionDocumentId)?.materials.find(
				(entry) => entry.documentId === id,
			);
			if (!material) return;
			void submit(CONTENT_INTENTS.updateSessionMaterial, {
				materialDocumentId: id,
				title: material.title,
				availableFromSession,
			});
		},
		remove: (id) =>
			void submit(CONTENT_INTENTS.removeSessionMaterial, {
				materialDocumentId: id,
			}),
		requestTicket: (kind, file) => requestTicket(sessionDocumentId, kind, file),
	});

	return { board, storedOf, sourceFor, requestTicket };
}

export type SessionMaterialsState = ReturnType<typeof useSessionMaterials>;

/**
 * Crea el material que el alta dejó pendiente en sesiones recién guardadas.
 * Devuelve el nombre de lo que no se pudo crear.
 */
export function useCreatePendingSessionMaterials(
	courseDocumentId: string | null,
) {
	const creator = useFetcherPromise<AppResponse<unknown>>();

	return useCallback(
		async (
			groups: readonly {
				sessionDocumentId: string;
				materials: readonly NewSessionMaterial[];
			}[],
		): Promise<string[]> => {
			if (!courseDocumentId) return [];

			const failed: string[] = [];
			for (const group of groups) {
				for (const material of group.materials) {
					const result = await creator.submit(
						payloadOf(CONTENT_INTENTS.createSessionMaterial, {
							...material,
							sessionDocumentId: group.sessionDocumentId,
						}),
						{ method: "post", action: sessionMaterialsPath(courseDocumentId) },
					);
					if (!result?.success) failed.push(material.title);
				}
			}
			return failed;
		},
		[courseDocumentId, creator.submit],
	);
}
