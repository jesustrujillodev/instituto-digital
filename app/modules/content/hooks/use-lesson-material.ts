import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useFetcherPromise } from "@/shared/hooks/use-fetcher-promise";
import type { AppResponse } from "@/shared/response/response.types";
import type { UploadedMaterial } from "../components/lesson-upload-field";
import { EMPTY_LESSON_BODY } from "../domain/content.config";
import type { LessonType, LessonUploadKind } from "../domain/content.rules";
import type {
	LessonBody,
	LessonMaterial,
	UploadTicket,
} from "../domain/content.types";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	INTENT_FIELD,
	materialPath,
	PAYLOAD_FIELD,
} from "../utils/content-form";

type MaterialLoaderData = AppResponse<LessonMaterial>;

const materialKey = (material: LessonMaterial) =>
	`${material.lessonDocumentId}:${material.type}`;

export interface MaterialLesson {
	documentId: string;
	title: string;
	type: LessonType;
}

/**
 * El material de una lección: lo carga, lo edita y lo guarda.
 *
 * El texto y el enlace se editan en borrador y se guardan con `saveDraft`; un
 * archivo se guarda en cuanto termina de subirse, porque un objeto en el bucket
 * que nadie reclama es justo lo que el escaneo de huérfanos barre.
 */
export function useLessonMaterial({
	courseDocumentId,
	lesson,
	active,
}: {
	courseDocumentId: string;
	/** `null` mientras no hay lección que mostrar. */
	lesson: MaterialLesson | null;
	/** Solo se pide al servidor mientras la vista está abierta. */
	active: boolean;
}) {
	const loader = useFetcher<MaterialLoaderData>();
	const saver = useFetcherPromise<ContentActionData>();
	const ticketer = useFetcher<AppResponse<UploadTicket>>();

	const [body, setBody] = useState<LessonBody>(EMPTY_LESSON_BODY);
	const [link, setLink] = useState("");
	const [baseline, setBaseline] = useState({
		body: JSON.stringify(EMPTY_LESSON_BODY),
		link: "",
	});

	// Cada acción revalida este fetcher: adoptar cada respuesta pisaría lo que se
	// está escribiendo. El borrador se toma del servidor una vez por lección y
	// tipo; después solo lo mueve un guardado propio.
	const initializedFor = useRef<string | null>(null);
	// Tiptap solo lee su contenido al montarse: el editor no se pinta hasta que
	// el borrador ya es el de esta lección.
	const [readyFor, setReadyFor] = useState<string | null>(null);

	const path = lesson
		? materialPath(courseDocumentId, lesson.documentId)
		: null;
	const lessonType = lesson?.type;

	// El tipo entra en las dependencias: al cambiarlo, el material que se enseña
	// es otro aunque la ruta sea la misma.
	// biome-ignore lint/correctness/useExhaustiveDependencies: el fetcher cambia de identidad en cada render y reentraría en bucle.
	useEffect(() => {
		if (!active) {
			initializedFor.current = null;
			setReadyFor(null);
			return;
		}
		if (!path) return;
		loader.load(path);
	}, [active, path, lessonType]);

	const loaded = loader.data?.success ? loader.data.data : null;
	// Una respuesta de otra lección no se enseña mientras llega la de esta.
	const current =
		loaded && loaded.lessonDocumentId === lesson?.documentId ? loaded : null;
	const material =
		current && readyFor === materialKey(current) ? current : null;

	useEffect(() => {
		if (!current) return;
		const key = materialKey(current);
		if (initializedFor.current === key) return;
		initializedFor.current = key;

		const nextBody = current.body ?? EMPTY_LESSON_BODY;
		const nextLink = current.externalUrl ?? "";
		setBody(nextBody);
		setLink(nextLink);
		setBaseline({ body: JSON.stringify(nextBody), link: nextLink });
		setReadyFor(key);
	}, [current]);

	const submitMaterial = useCallback(
		(payload: unknown) => {
			if (!path) return Promise.resolve(undefined);

			return saver.submit(
				{
					[INTENT_FIELD]: CONTENT_INTENTS.saveMaterial,
					[PAYLOAD_FIELD]: JSON.stringify(payload),
				},
				{ method: "post", action: path },
			);
		},
		[path, saver.submit],
	);

	// ── El permiso de subida, como promesa ────────────────────────────────────
	//
	// `useFetcher` no devuelve una, así que el resolver espera aquí hasta que la
	// respuesta llega. `settled` evita resolver con la respuesta de una subida
	// anterior: sin él, el primer render tras el envío —que todavía es `idle`—
	// entregaría el ticket viejo.
	const pending = useRef<((ticket: UploadTicket | null) => void) | null>(null);
	const settled = useRef(false);

	useEffect(() => {
		if (ticketer.state !== "idle") {
			settled.current = true;
			return;
		}
		if (!settled.current || !pending.current) return;

		const resolve = pending.current;
		pending.current = null;
		settled.current = false;
		resolve(
			ticketer.data?.success === true ? (ticketer.data.data ?? null) : null,
		);
	}, [ticketer.state, ticketer.data]);

	const requestTicket = useCallback(
		(file: File) =>
			new Promise<UploadTicket | null>((resolve) => {
				if (!path || !lesson) {
					resolve(null);
					return;
				}

				pending.current = resolve;
				settled.current = false;
				ticketer.submit(
					{
						[INTENT_FIELD]: CONTENT_INTENTS.uploadUrl,
						[PAYLOAD_FIELD]: JSON.stringify({
							lessonDocumentId: lesson.documentId,
							kind: lesson.type as LessonUploadKind,
							fileName: file.name,
							contentType: file.type,
							size: file.size,
						}),
					},
					{ method: "post", action: path },
				);
			}),
		[path, lesson, ticketer.submit],
	);

	const onUploaded = (uploaded: UploadedMaterial) => {
		if (!lesson) return;
		void submitMaterial({
			lessonDocumentId: lesson.documentId,
			type: lesson.type,
			...uploaded,
		});
	};

	/** Solo el texto y el enlace se editan en borrador. */
	const savesByHand = lesson?.type === "TEXT" || lesson?.type === "LINK";

	const dirty =
		Boolean(material) &&
		savesByHand &&
		(lesson?.type === "TEXT"
			? JSON.stringify(body) !== baseline.body
			: link.trim() !== baseline.link);

	/** Guarda el borrador del texto o del enlace. `undefined` si no hacía falta. */
	const saveDraft = async () => {
		if (!lesson || !savesByHand) return undefined;

		const result = await submitMaterial(
			lesson.type === "TEXT"
				? { lessonDocumentId: lesson.documentId, type: "TEXT", body }
				: {
						lessonDocumentId: lesson.documentId,
						type: "LINK",
						externalUrl: link.trim(),
					},
		);

		if (result?.success) {
			setBaseline({ body: JSON.stringify(body), link: link.trim() });
		}
		return result;
	};

	return {
		material,
		loading: active && path !== null && !material,
		busy: saver.fetcher.state !== "idle",
		saver: saver.fetcher,
		body,
		setBody,
		link,
		setLink,
		dirty,
		savesByHand,
		saveDraft,
		requestTicket,
		onUploaded,
	};
}

export type LessonMaterialState = ReturnType<typeof useLessonMaterial>;
