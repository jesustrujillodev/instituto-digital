import { valibotResolver } from "@hookform/resolvers/valibot";
import { LogOut, Save } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, type Resolver, useForm } from "react-hook-form";
import { Link, useFetcher, useNavigate, useNavigation } from "react-router";
import { sileo } from "sileo";
import { toFormData } from "@/lib/form-data";
import { scrollIntoView } from "@/lib/motion";
import { CourseContentPanel } from "@/modules/content/components/course-content-panel";
import type { ContentSaveRef } from "@/modules/content/components/course-content-workspace";
import type { QuizSaveRef } from "@/modules/content/components/quiz-editor";
import { toContentSummary } from "@/modules/content/domain/content.mapper";
import type { CourseContentTree } from "@/modules/content/domain/content.types";
import { useCreatePendingSessionMaterials } from "@/modules/content/hooks/use-session-materials";
import { PageHeader } from "@/shared/components/common/page-header";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { AppResponse } from "@/shared/response/response.types";
import { requiresContent } from "../domain/course.rules";
import type { CourseDetail, CourseFormOptions } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import {
	buildCourseFormDefaults,
	type CourseFormValues,
	type CoursePlanPrefill,
} from "../utils/build-course-form-defaults";
import {
	buildCoursePayload,
	createCourseFormRule,
	updateCourseFormRule,
} from "../utils/build-course-payload";
import {
	COURSE_LIST_PATH,
	type CourseStep,
	type CourseStepKey,
	type CourseWizardMode,
	nextStep,
	type PublishChecklist,
	previousStep,
	stepOfKey,
	stepPath,
	stepPosition,
	stepsFor,
	stepsResolved,
	stepsWithErrors,
	stepsWithPending,
} from "../utils/course-wizard-steps";
import {
	COURSE_INTENTS,
	COVER_FIELD,
	type CourseCreateActionData,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/parse-course-form-data";
import {
	matchPendingMaterials,
	type PendingMaterialsSnapshot,
	pendingSessionMaterialsOf,
	type SavedSession,
} from "../utils/pending-session-materials";
import { CourseEnrollmentFields } from "./course-enrollment-fields";
import { CourseEvaluationFields } from "./course-evaluation-fields";
import {
	type CourseCoverControl,
	CourseIdentityFields,
} from "./course-identity-fields";
import { CourseProgramFields } from "./course-program-fields";
import { CourseReviewStep } from "./course-review-step";
import { CourseWizardFooter } from "./course-wizard-footer";
import { CourseWizardStepper } from "./course-wizard-stepper";

const LIST_PATH = COURSE_LIST_PATH;

const NO_PENDING: ReadonlySet<CourseStepKey> = new Set();

/** Tras guardar: al paso siguiente, fuera del wizard, o en el mismo paso. */
type SaveTarget = "next" | "exit" | "stay";

const describeStep = (step: CourseStep, mode: CourseWizardMode): string => {
	switch (step.key) {
		case "identity":
			return mode === "create"
				? "Es lo que el personal lee en el catálogo. Con el título basta para guardar el borrador."
				: "Es lo que el personal lee en el catálogo.";
		case "program":
			return "Quién la imparte, cuándo y dónde.";
		case "content":
			return "Los módulos y las lecciones que se recorren.";
		case "rules":
			return "Qué hace falta para acreditar la capacitación y cómo se evalúa.";
		case "access":
			return "Quién puede verla e inscribirse, y cuántos lugares hay.";
		case "review":
			return "Repasa lo capturado. Al publicar, la capacitación aparece a su audiencia y puede recibir inscripciones.";
	}
};

interface CourseWizardProps {
	step: CourseStep;
	/** El alta de un borrador, o la edición de un curso publicado. */
	mode?: CourseWizardMode;
	options: CourseFormOptions;
	/** `null` en el paso 1 del alta: el borrador todavía no existe. */
	course?: CourseDetail | null;
	checklist?: PublishChecklist | null;
	/** El temario, solo cuando el formato lo pide. */
	content?: CourseContentTree | null;
	prefill?: CoursePlanPrefill | null;
	ids: CourseFormIds;
	/** A dónde lleva salir de la edición. En el alta es siempre la ficha. */
	exitTo?: string;
	/** `exitTo` para el botón: «al curso», «a Impartición». */
	exitLabel?: string;
	/** A dónde lleva terminar: publicar o guardar el último paso. */
	finishTo?: string;
	/** `finishTo` para el botón: «a Cursos», «a Impartición». */
	finishLabel?: string;
	/** Query que viaja entre pasos, para no perder a dónde se vuelve. */
	search?: string;
	/**
	 * Las evaluaciones de seguimiento del paso Evaluación. Es función porque sus
	 * preguntas se guardan al continuar, como las del examen.
	 */
	followUps?: (bindings: FollowUpBindings) => ReactNode;
	followUpTitles?: readonly string[];
	/** Las que entran al promedio, para el resumen de cómo se acredita. */
	countedFollowUpTitles?: readonly string[];
	/**
	 * El editor del examen para el paso Evaluación. Es función porque el wizard
	 * lo guarda al continuar y lo cuenta como cambio sin guardar.
	 */
	quiz?: (bindings: QuizBindings) => ReactNode;
	/** Preguntas del examen guardado, para la revisión. */
	quizQuestionCount?: number;
}

/** Lo que el wizard le pasa a las preguntas del seguimiento. */
export interface FollowUpBindings {
	saveRef: QuizSaveRef;
	onDirtyChange: (dirty: boolean) => void;
}

/** Lo que el wizard le pasa al editor del examen. */
export interface QuizBindings {
	saveRef: QuizSaveRef;
	onDirtyChange: (dirty: boolean) => void;
	onSummaryChange: (summary: string | null) => void;
}

/**
 * El alta y la edición de un curso, paso a paso.
 *
 * El borrador nace al salir del paso 1 y cada paso guarda al avanzar, así que
 * el servidor es la única fuente de verdad: al llegar datos nuevos, el
 * formulario se reinicia con ellos.
 */
export function CourseWizard({
	step,
	mode = "create",
	options,
	course,
	checklist,
	content,
	prefill,
	ids,
	exitTo,
	exitLabel = "a la capacitación",
	finishTo,
	finishLabel,
	search = "",
	followUps,
	followUpTitles = [],
	countedFollowUpTitles = [],
	quiz,
	quizQuestionCount = 0,
}: CourseWizardProps) {
	const navigate = useNavigate();
	const isCreate = !course;
	const isEdit = mode === "edit";
	const isReview = step.key === "review";
	const documentId = course?.documentId ?? null;
	const exitPath =
		exitTo ?? (documentId ? `${LIST_PATH}/${documentId}` : LIST_PATH);
	const hrefOf = (number: number) =>
		documentId ? `${stepPath(documentId, number, mode)}${search}` : null;

	const fetcher = useFetcher<CourseCreateActionData | AppResponse<null>>();
	const isSubmitting = fetcher.state !== "idle";

	const defaultValues = useMemo(
		() => buildCourseFormDefaults(course, prefill),
		[course, prefill],
	);

	const resolver = useMemo(
		() =>
			valibotResolver(
				isCreate ? createCourseFormRule : updateCourseFormRule,
			) as unknown as Resolver<CourseFormValues, unknown, unknown>,
		[isCreate],
	);

	const methods = useForm<CourseFormValues, unknown, unknown>({
		resolver,
		defaultValues,
		mode: "onTouched",
		reValidateMode: "onChange",
	});
	const {
		watch,
		getValues,
		trigger,
		reset,
		setError,
		formState: { isDirty, errors },
	} = methods;

	// La portada vive fuera de react-hook-form (guía §10.4) y solo viaja desde su
	// propio paso: en los demás, su ausencia significa "no la toques".
	const [cover, setCover] = useState<File | null>(null);
	const [coverRemoved, setCoverRemoved] = useState(false);

	const targetRef = useRef<SaveTarget>("next");
	// El guardado termina en el `onSuccess` del fetcher, no en `submit`: quien
	// necesita esperarlo —el aviso de salida— recibe aquí el resultado.
	const settleRef = useRef<((saved: boolean) => void) | null>(null);
	const settle = (saved: boolean) => {
		settleRef.current?.(saved);
		settleRef.current = null;
	};
	// El material de las sesiones nuevas, tal como estaba al guardar: se crea
	// cuando el servidor devuelve la identidad de esas sesiones (docs/adr/0026).
	const pendingMaterialsRef = useRef<PendingMaterialsSnapshot | null>(null);
	const createPendingMaterials = useCreatePendingSessionMaterials(
		course?.documentId ?? null,
	);
	const [savingMaterials, setSavingMaterials] = useState(false);
	const busy = isSubmitting || savingMaterials;
	const [leavingTo, setLeavingTo] = useState<string | null>(null);
	// Guardado el paso, el botón sigue ocupado hasta que se pinta el destino: sin
	// esto quedaba un hueco sin respuesta mientras cargaba el paso siguiente.
	const navigation = useNavigation();
	const [openedAfterSave, setOpenedAfterSave] = useState(false);
	const opening = openedAfterSave && navigation.state !== "idle";
	// Qué botón lanzó el guardado: es el que enseña que está trabajando.
	const [submittedTarget, setSubmittedTarget] = useState<SaveTarget | null>(
		null,
	);
	const pendingTarget = busy || opening ? submittedTarget : null;

	const headingRef = useRef<HTMLHeadingElement>(null);
	// `watch` y no `useWatch`: el proveedor del formulario se monta más abajo en
	// este mismo árbol, así que aquí todavía no hay contexto que consultar.
	const format = watch("format");
	const completionRule = watch("completionRule");
	const steps = stepsFor({ format, completionRule }, mode);
	const savedSteps = stepsFor(defaultValues, mode);
	const addedSteps = new Set(
		steps
			.filter((entry) => !savedSteps.includes(entry))
			.map((entry) => entry.key),
	);
	const following = nextStep(steps, step);
	const preceding = previousStep(steps, step);

	// Datos nuevos del servidor mandan sobre lo que haya en pantalla: es lo que
	// deja `isDirty` en falso tras cada guardado y libera el aviso de salida.
	// Se compara el contenido y no el objeto: guardar una evaluación recarga la
	// ruta con el mismo curso, y reiniciar ahí tiraría lo que está sin guardar.
	const defaultsKey = JSON.stringify(defaultValues);
	// biome-ignore lint/correctness/useExhaustiveDependencies: defaultsKey resume a defaultValues.
	useEffect(() => {
		reset(defaultValues);
		setCover(null);
		setCoverRemoved(false);
	}, [reset, defaultsKey]);

	useEffect(() => {
		headingRef.current?.focus({ preventScroll: true });
	}, []);

	useEffect(() => {
		const data = fetcher.data;
		const fieldErrors = data && !data.success ? data.error.fieldErrors : null;
		if (!fieldErrors) return;

		for (const [name, message] of Object.entries(fieldErrors)) {
			setError(name as keyof CourseFormValues, { type: "server", message });
		}
	}, [fetcher.data, setError]);

	/**
	 * Tras guardar: la salida, el paso siguiente, o `null` para quedarse. Si la
	 * regla recién elegida pide un temario que el curso no tenía, el siguiente es
	 * Contenido aunque quede atrás: sin él no se puede publicar.
	 */
	const destinationAfterSave = (): string | null => {
		if (targetRef.current === "stay") return null;
		if (targetRef.current === "exit") return exitPath;
		if (isReview || !following) return finishTo ?? COURSE_LIST_PATH;

		const contentBecameRequired =
			step.key === "rules" &&
			content === null &&
			requiresContent({ format, completionRule });
		const target = contentBecameRequired ? stepOfKey("content") : following;

		return hrefOf(target.number) ?? exitPath;
	};

	useFetcherToast(fetcher, {
		errorMessage: isCreate
			? "No se pudo crear la capacitación"
			: "No se pudo guardar la capacitación",
		onError: () => settle(false),
		onSuccess: () => {
			const data = fetcher.data;
			if (!data?.success) return;

			const created = data.data as { documentId: string } | null;
			if (isCreate) {
				if (created) setLeavingTo(stepPath(created.documentId, 2));
				settle(true);
				return;
			}

			const leave = () => {
				const destination = destinationAfterSave();
				if (destination) setLeavingTo(destination);
				settle(true);
			};

			const saved =
				(data.data as { sessions?: SavedSession[] } | null)?.sessions ?? [];
			const pendingMaterials = pendingMaterialsRef.current;
			pendingMaterialsRef.current = null;
			if (!pendingMaterials || pendingMaterials.entries.length === 0) {
				leave();
				return;
			}

			const { groups, orphaned } = matchPendingMaterials(
				pendingMaterials,
				saved,
			);
			setSavingMaterials(true);
			void createPendingMaterials(groups).then((failed) => {
				setSavingMaterials(false);
				const lost = [...orphaned, ...failed];
				if (lost.length > 0) {
					// El paso ya se guardó; se queda en él para que se vuelva a agregar
					// desde la sesión, que ahora sí existe.
					sileo.error({
						title: "No se guardó parte del material",
						description: `«${lost.join("», «")}». Agrégalo de nuevo desde su sesión.`,
					});
					settle(false);
					return;
				}
				leave();
			});
		},
	});

	// La navegación espera un render: mientras `leavingTo` sea nulo el aviso de
	// cambios sin guardar sigue activo y bloquearía nuestra propia salida.
	useEffect(() => {
		if (!leavingTo) return;

		navigate(leavingTo);
		setOpenedAfterSave(true);
		setLeavingTo(null);
	}, [leavingTo, navigate]);

	const coverTouched = cover !== null || coverRemoved;
	// El temario no vive en react-hook-form: su editor avisa de lo pendiente y
	// entrega con qué guardarlo antes de avanzar.
	const contentSaveRef: ContentSaveRef = useRef(null);
	const [contentDirty, setContentDirty] = useState(false);
	// El examen tampoco: se guarda entero, por su ruta, antes que el paso.
	const quizSaveRef: QuizSaveRef = useRef(null);
	const [quizDirty, setQuizDirty] = useState(false);
	const [quizSummary, setQuizSummary] = useState<string | null>(null);
	// Las preguntas del seguimiento, igual: cada evaluación guarda las suyas.
	const followUpSaveRef: QuizSaveRef = useRef(null);
	const [followUpDirty, setFollowUpDirty] = useState(false);

	const hasUnsavedChanges =
		(isDirty || coverTouched || contentDirty || quizDirty || followUpDirty) &&
		!busy &&
		leavingTo === null;

	/** `true` cuando el paso quedó guardado. */
	const submitStep = async (target: SaveTarget): Promise<boolean> => {
		targetRef.current = target;
		setSubmittedTarget(target);
		const settled = () =>
			new Promise<boolean>((resolve) => {
				settle(false);
				settleRef.current = resolve;
			});

		if (isReview) {
			fetcher.submit(
				{ [INTENT_FIELD]: COURSE_INTENTS.publish },
				{ method: "post" },
			);
			return settled();
		}

		// Un paso sin campos del curso no tiene nada que guardar aquí: el temario
		// ya se persistió por su propio fetcher, lección a lección.
		if (step.fields.length === 0 && documentId) {
			const saveContent = contentSaveRef.current;
			if (saveContent && !(await saveContent())) return false;
			// En el mismo render que la salida: si no, el aviso de cambios sin
			// guardar todavía la bloquearía.
			setContentDirty(false);
			const destination = destinationAfterSave();
			if (destination) setLeavingTo(destination);
			else sileo.success({ title: "Contenido guardado" });
			return true;
		}

		const valid = await trigger(step.fields);
		if (!valid) {
			reportStepErrors();
			return false;
		}

		const saveQuiz = quizSaveRef.current;
		if (saveQuiz && !(await saveQuiz())) return false;
		const saveFollowUps = followUpSaveRef.current;
		if (saveFollowUps && !(await saveFollowUps())) return false;

		const values = getValues();
		const { dependency, ...rest } = buildCoursePayload(values);
		const payload = isCreate ? { dependency, ...rest } : rest;
		pendingMaterialsRef.current = pendingSessionMaterialsOf(values.sessions);

		fetcher.submit(
			toFormData({
				[INTENT_FIELD]: isCreate
					? COURSE_INTENTS.create
					: COURSE_INTENTS.update,
				[PAYLOAD_FIELD]: JSON.stringify({
					...payload,
					removeCover: coverRemoved,
				}),
				[COVER_FIELD]: cover,
			}),
			{ method: "post", encType: "multipart/form-data" },
		);
		return settled();
	};

	// `getFieldState` y no `errors`: `trigger` acaba de escribirlos y la copia
	// que este render tiene en la mano todavía es la anterior.
	const reportStepErrors = () => {
		const marked = step.fields.filter(
			(field) => methods.getFieldState(field).invalid,
		);
		sileo.error({
			title: "Revisa este paso",
			description:
				marked.length === 1
					? "Hay un campo marcado."
					: `Hay ${marked.length} campos marcados.`,
		});

		const first = marked[0];
		if (!first) return;

		// Las dos listas de audiencia comparten ancla: se pintan juntas.
		const anchor = first.startsWith("audience") ? "audience" : first;
		const element = document.getElementById(
			ids[anchor as keyof CourseFormIds] ?? "",
		);
		scrollIntoView(element, { block: "center" });
	};

	// La revisión no guarda: publica. Y sin curso todavía no hay dónde guardar.
	const canSaveInPlace = Boolean(course) && !isReview;
	const pending = checklist ? stepsWithPending(checklist) : NO_PENDING;
	const resolved = checklist ? stepsResolved(checklist) : NO_PENDING;
	const canPublish = !checklist || pending.size === 0;
	const { position, total } = stepPosition(steps, step);

	return (
		<FormProvider {...methods}>
			<UnsavedChangesDialog
				when={hasUnsavedChanges}
				onSave={canSaveInPlace ? () => submitStep("stay") : undefined}
			/>

			<div className="flex flex-col">
				<PageHeader
					title={course ? course.title : "Nueva capacitación"}
					description={
						course
							? `${isEdit ? "Editando" : "Borrador"} · Paso ${position} de ${total}`
							: "En cuanto continúes, la capacitación queda guardada como borrador."
					}
					goBack={exitPath}
					collapseActionsOnMobile
					actions={
						canSaveInPlace ? (
							<>
								<Button
									type="button"
									variant="outline"
									disabled={busy || opening}
									pending={pendingTarget === "stay"}
									onClick={() => void submitStep("stay")}
								>
									<Save aria-hidden="true" />
									{isEdit ? "Guardar cambios" : "Guardar borrador"}
								</Button>
								<Button
									type="button"
									variant="outline"
									disabled={busy || opening}
									pending={pendingTarget === "exit"}
									onClick={() => void submitStep("exit")}
								>
									<LogOut aria-hidden="true" />
									Guardar y salir {exitLabel}
								</Button>
							</>
						) : course ? undefined : (
							<Button variant="outline" asChild>
								<Link to={LIST_PATH}>Cancelar</Link>
							</Button>
						)
					}
				/>

				<div className="flex flex-col gap-6 lg:gap-8">
					<CourseWizardStepper
						hrefOf={hrefOf}
						tracksProgress={!isEdit}
						steps={steps}
						current={step.number}
						pending={pending}
						resolved={resolved}
						errors={stepsWithErrors(Object.keys(errors))}
						added={addedSteps}
					/>

					<div className="flex flex-col">
						<form
							id={ids.form}
							className="flex flex-col gap-8"
							onSubmit={(event) => {
								event.preventDefault();
								void submitStep("next");
							}}
						>
							<header className="flex flex-col gap-1">
								<h2
									ref={headingRef}
									tabIndex={-1}
									className="font-bold text-xl outline-none"
								>
									{step.title}
								</h2>
								<p className="text-muted-foreground text-sm">
									{describeStep(step, mode)}
								</p>
							</header>

							<StepFields
								step={step}
								ids={ids}
								options={options}
								course={course}
								isPublished={course?.status === "PUBLISHED"}
								checklist={checklist ?? []}
								content={content ?? null}
								followUps={followUps?.({
									saveRef: followUpSaveRef,
									onDirtyChange: setFollowUpDirty,
								})}
								followUpTitles={followUpTitles}
								countedFollowUpTitles={countedFollowUpTitles}
								quiz={quiz?.({
									saveRef: quizSaveRef,
									onDirtyChange: setQuizDirty,
									onSummaryChange: setQuizSummary,
								})}
								quizSummary={quizSummary}
								quizQuestionCount={quizQuestionCount}
								contentSaveRef={contentSaveRef}
								onContentDirtyChange={setContentDirty}
								contentHref={hrefOf(stepOfKey("content").number)}
								cover={{
									value: cover,
									existingUrl: course?.coverImageUrl ?? null,
									removed: coverRemoved,
									onChange: (file) => {
										setCover(file);
										if (file) setCoverRemoved(false);
									},
									onRemove: () => {
										setCover(null);
										setCoverRemoved(true);
									},
								}}
							/>
						</form>

						<CourseWizardFooter
							formId={ids.form}
							backTo={preceding ? hrefOf(preceding.number) : null}
							nextTitle={isReview ? null : (following?.title ?? null)}
							busy={busy || opening}
							pendingPhase={
								pendingTarget === "next"
									? opening
										? "opening"
										: "saving"
									: null
							}
							submitKind={
								isReview ? "publish" : isEdit && !following ? "save" : "next"
							}
							finishLabel={finishLabel}
							canSubmit={!isReview || canPublish}
						/>
					</div>
				</div>
			</div>
		</FormProvider>
	);
}

function StepFields({
	step,
	ids,
	options,
	course,
	isPublished,
	checklist,
	content,
	cover,
	followUps,
	followUpTitles,
	countedFollowUpTitles,
	quiz,
	quizSummary,
	quizQuestionCount,
	contentSaveRef,
	onContentDirtyChange,
	contentHref,
}: {
	step: CourseStep;
	ids: CourseFormIds;
	options: CourseFormOptions;
	course?: CourseDetail | null;
	isPublished: boolean;
	checklist: PublishChecklist;
	content: CourseContentTree | null;
	cover: CourseCoverControl;
	followUps?: ReactNode;
	followUpTitles: readonly string[];
	countedFollowUpTitles: readonly string[];
	quiz?: ReactNode;
	quizSummary: string | null;
	quizQuestionCount: number;
	contentSaveRef: ContentSaveRef;
	onContentDirtyChange: (dirty: boolean) => void;
	/** El paso Contenido, para las evaluaciones de módulo del paso Evaluación. */
	contentHref: string | null;
}) {
	switch (step.key) {
		case "identity":
			return (
				<CourseIdentityFields
					ids={ids}
					organizers={
						!course && options.canChooseOrganizer ? options.organizers : null
					}
					cover={cover}
					documentId={course?.documentId ?? null}
					plans={options.plans}
					course={course}
				/>
			);
		case "program":
			return (
				<CourseProgramFields
					ids={ids}
					options={options}
					isPublished={isPublished}
					courseDocumentId={course?.documentId ?? null}
				/>
			);
		case "content":
			return course && content ? (
				<CourseContentPanel
					courseDocumentId={course.documentId}
					tree={content}
					saveRef={contentSaveRef}
					onDirtyChange={onContentDirtyChange}
				/>
			) : null;
		case "rules":
			return (
				<CourseEvaluationFields
					ids={ids}
					isPublished={isPublished}
					followUps={followUps}
					countedFollowUpTitles={countedFollowUpTitles}
					quiz={quiz}
					quizSummary={quizSummary}
					content={
						content
							? {
									requiredLessons:
										toContentSummary(content).requiredLessonCount,
									moduleEvaluations: content.filter((module) => module.quiz)
										.length,
								}
							: null
					}
					contentHref={contentHref}
				/>
			);
		case "access":
			return (
				<CourseEnrollmentFields
					ids={ids}
					options={options}
					isPublished={isPublished}
				/>
			);
		case "review":
			return course ? (
				<CourseReviewStep
					course={course}
					checklist={checklist}
					content={content ? toContentSummary(content) : null}
					followUpTitles={followUpTitles}
					quizQuestionCount={quizQuestionCount}
				/>
			) : null;
	}
}
