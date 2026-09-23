import { Loader2 } from "lucide-react";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { useFetcher } from "react-router";
import { Button } from "@/shared/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/shared/components/ui/sheet";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { AppResponse } from "@/shared/response/response.types";
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
import { LESSON_TYPE_LABELS } from "../utils/content-labels";
import { LessonBodyView } from "./lesson-body-view";
import { LessonLinkField } from "./lesson-link-field";
import { LessonFilePreview } from "./lesson-material-view";
import {
	LessonUploadField,
	type UploadedMaterial,
} from "./lesson-upload-field";
import { LessonVideoPlayer } from "./lesson-video-player";

// Tiptap solo lo descarga quien captura, y solo al abrir el panel de una
// lección de texto.
const LessonBodyEditor = lazy(() => import("./lesson-body-editor"));

type MaterialLoaderData = AppResponse<LessonMaterial>;

/** El panel del material de una lección: se abre desde el árbol del temario. */
export function LessonMaterialSheet({
	open,
	onOpenChange,
	courseDocumentId,
	lesson,
	canWrite,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	courseDocumentId: string;
	/** `null` mientras el panel está cerrado. */
	lesson: { documentId: string; title: string; type: LessonType } | null;
	canWrite: boolean;
}) {
	const id = useId();
	const loader = useFetcher<MaterialLoaderData>();
	const saver = useFetcher<ContentActionData>();
	const ticketer = useFetcher<AppResponse<UploadTicket>>();
	useFetcherToast(saver);

	const [body, setBody] = useState<LessonBody>(EMPTY_LESSON_BODY);
	const [link, setLink] = useState("");

	const path = lesson
		? materialPath(courseDocumentId, lesson.documentId)
		: null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: el fetcher cambia de identidad en cada render y reentraría en bucle.
	useEffect(() => {
		if (!open || !path) return;
		loader.load(path);
	}, [open, path]);

	const material = loader.data?.success ? loader.data.data : null;

	useEffect(() => {
		if (!material) return;
		setBody(material.body ?? EMPTY_LESSON_BODY);
		setLink(material.externalUrl ?? "");
	}, [material]);

	const save = (payload: unknown) => {
		if (!path) return;
		saver.submit(
			{
				[INTENT_FIELD]: CONTENT_INTENTS.saveMaterial,
				[PAYLOAD_FIELD]: JSON.stringify(payload),
			},
			{ method: "post", action: path },
		);
	};

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
		// Subido y confirmado en el mismo gesto: un objeto en el bucket que nadie
		// reclama es exactamente lo que el escaneo de huérfanos tiene que barrer.
		save({
			lessonDocumentId: lesson.documentId,
			type: lesson.type,
			...uploaded,
		});
	};

	const busy = saver.state !== "idle";
	const loading = loader.state === "loading" && !material;

	const renderMaterial = () => {
		if (!lesson || !material) return null;

		switch (lesson.type) {
			case "TEXT":
				return canWrite ? (
					<Suspense
						fallback={
							<div className="flex items-center gap-2 text-muted-foreground text-sm">
								<Loader2 className="size-4 animate-spin" />
								Cargando el editor…
							</div>
						}
					>
						<LessonBodyEditor value={body} onChange={setBody} disabled={busy} />
					</Suspense>
				) : (
					<LessonBodyView body={body} />
				);

			case "LINK":
				return (
					<LessonLinkField
						id={`${id}-link`}
						value={link}
						onChange={setLink}
						disabled={!canWrite || busy}
					/>
				);

			case "VIDEO":
				return (
					<div className="flex flex-col gap-4">
						{material.fileUrl ? (
							<LessonVideoPlayer
								src={material.fileUrl}
								title={lesson.title}
								mimeType={material.mimeType}
							/>
						) : null}

						{canWrite ? (
							<LessonUploadField
								kind="VIDEO"
								current={
									material.fileName
										? {
												fileName: material.fileName,
												fileSize: material.fileSize,
											}
										: null
								}
								requestTicket={requestTicket}
								onUploaded={onUploaded}
								disabled={busy}
							/>
						) : null}
					</div>
				);

			case "FILE":
				return (
					<div className="flex flex-col gap-4">
						<LessonFilePreview material={material} title={lesson.title} />

						{canWrite ? (
							<LessonUploadField
								kind="FILE"
								current={
									material.fileName
										? {
												fileName: material.fileName,
												fileSize: material.fileSize,
											}
										: null
								}
								requestTicket={requestTicket}
								onUploaded={onUploaded}
								disabled={busy}
							/>
						) : null}
					</div>
				);

			default: {
				const exhaustive: never = lesson.type;
				return exhaustive;
			}
		}
	};

	// Un archivo ya se guardó al subirse; el texto y el enlace necesitan el gesto.
	const savesByHand = lesson?.type === "TEXT" || lesson?.type === "LINK";

	const submit = () => {
		if (!lesson) return;

		save(
			lesson.type === "TEXT"
				? { lessonDocumentId: lesson.documentId, type: "TEXT", body }
				: {
						lessonDocumentId: lesson.documentId,
						type: "LINK",
						externalUrl: link.trim(),
					},
		);
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full gap-0 sm:max-w-3xl">
				<SheetHeader>
					<SheetTitle>{lesson?.title ?? "Material"}</SheetTitle>
					<SheetDescription>
						{lesson ? LESSON_TYPE_LABELS[lesson.type] : null}
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto p-4">
					{loading ? (
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<Loader2 className="size-4 animate-spin" />
							Cargando el material…
						</div>
					) : (
						renderMaterial()
					)}
				</div>

				{canWrite && savesByHand ? (
					<div className="flex justify-end gap-2 border-t p-4">
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							Cerrar
						</Button>
						<Button type="button" disabled={busy} onClick={submit}>
							Guardar material
						</Button>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
