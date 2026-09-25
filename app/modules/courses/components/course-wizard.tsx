import { valibotResolver } from "@hookform/resolvers/valibot";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, type Resolver, useForm } from "react-hook-form";
import { Link, useFetcher, useNavigate } from "react-router";
import { sileo } from "sileo";
import { toFormData } from "@/lib/form-data";
import { scrollIntoView } from "@/lib/motion";
import { CourseContentPanel } from "@/modules/content/components/course-content-panel";
import type { ContentSaveRef } from "@/modules/content/components/course-content-workspace";
import type { QuizSaveRef } from "@/modules/content/components/quiz-editor";
import { toContentSummary } from "@/modules/content/domain/content.mapper";
import type { CourseContentTree } from "@/modules/content/domain/content.types";
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

const describeStep = (step: CourseStep, mode: CourseWizardMode): string => {
	switch (step.key) {
		case "identity":
			return mode === "create"
				? "Es lo que el personal lee en el catálogo. Con el título basta para guardar el borrador."
				: "Es lo que el personal lee en el catálogo.";
		case "program":
			return "Quién lo imparte, cuándo y dónde.";
		case "content":
			return "Los módulos y las lecciones que se recorren. Lo que escribes en una lección se guarda al pasar a otra o al continuar.";
		case "rules":
			return "Qué hace falta para completar el curso y obtener el crédito, y cómo se evalúa a quien lo toma.";
		case "access":
			return "Quién puede verlo e inscribirse, y cuántos lugares hay.";
		case "review":
			return "Repasa lo capturado. Al publicar, el curso aparece a su audiencia y puede recibir inscripciones.";
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
	/** A dónde lleva terminar: publicar o guardar el último paso. */
	finishTo?: string;
	/** Query que viaja entre pasos, para no perder a dónde se vuelve. */
	search?: string;
	/** Las evaluaciones de seguimiento, ya pintadas, para el paso Evaluación. */
	evaluations?: ReactNode;
	evaluationTitles?: readonly string[];
	/**
	 * El editor del examen para el paso Evaluación. Es función porque el wizard
	 * lo guarda al continuar y lo cuenta como cambio sin guardar.
	 */
	quiz?: (bindings: QuizBindings) => ReactNode;
	/** Preguntas del examen guardado, para la revisión. */
	quizQuestionCount?: number;
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
	finishTo,
	search = "",
	evaluations,
	evaluationTitles = [],
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

	const targetRef = useRef<"next" | "exit">("next");
	const [leavingTo, setLeavingTo] = useState<string | null>(null);

	const headingRef = useRef<HTMLHeadingElement>(null);
	// `watch` y no `useWatch`: el proveedor del formulario se monta más abajo en
	// este mismo árbol, así que aquí todavía no hay contexto que consultar.
	const format = watch("format");
	const completionRule = watch("completionRule");
	const steps = stepsFor({ format, completionRule }, mode);
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
	 * Tras guardar: la salida, o el paso siguiente. Si la regla recién elegida
	 * pide un temario que el curso no tenía, el siguiente es Contenido aunque
	 * quede atrás: sin él no se puede publicar.
	 */
	const destinationAfterSave = (): string => {
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
			? "No se pudo crear el curso"
			: "No se pudo guardar el curso",
		onSuccess: () => {
			const data = fetcher.data;
			if (!data?.success) return;

			const created = data.data as { documentId: string } | null;
			if (isCreate) {
				if (created) setLeavingTo(stepPath(created.documentId, 2));
				return;
			}

			setLeavingTo(destinationAfterSave());
		},
	});

	// La navegación espera un render: mientras `leavingTo` sea nulo el aviso de
	// cambios sin guardar sigue activo y bloquearía nuestra propia salida.
	useEffect(() => {
		if (!leavingTo) return;

		navigate(leavingTo);
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

	const hasUnsavedChanges =
		(isDirty || coverTouched || contentDirty || quizDirty) &&
		!isSubmitting &&
		leavingTo === null;

	const submitStep = async (target: "next" | "exit") => {
		targetRef.current = target;

		if (isReview) {
			fetcher.submit(
				{ [INTENT_FIELD]: COURSE_INTENTS.publish },
				{ method: "post" },
			);
			return;
		}

		// Un paso sin campos del curso no tiene nada que guardar aquí: el temario
		// ya se persistió por su propio fetcher, lección a lección.
		if (step.fields.length === 0 && documentId) {
			const saveContent = contentSaveRef.current;
			if (saveContent && !(await saveContent())) return;
			// En el mismo render que la salida: si no, el aviso de cambios sin
			// guardar todavía la bloquearía.
			setContentDirty(false);
			setLeavingTo(destinationAfterSave());
			return;
		}

		const valid = await trigger(step.fields);
		if (!valid) {
			reportStepErrors();
			return;
		}

		const saveQuiz = quizSaveRef.current;
		if (saveQuiz && !(await saveQuiz())) return;

		const { dependency, ...rest } = buildCoursePayload(getValues());
		const payload = isCreate ? { dependency, ...rest } : rest;

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

	const pending = checklist ? stepsWithPending(checklist) : NO_PENDING;
	const canPublish = !checklist || pending.size === 0;
	const { position, total } = stepPosition(steps, step);

	return (
		<FormProvider {...methods}>
			<UnsavedChangesDialog when={hasUnsavedChanges} />

			<div className="flex flex-col">
				<PageHeader
					title={course ? course.title : "Nuevo curso"}
					description={
						course
							? `${isEdit ? "Editando" : "Borrador"} · Paso ${position} de ${total}`
							: "En cuanto continúes, el curso queda guardado como borrador."
					}
					goBack={exitPath}
					collapseActionsOnMobile
					actions={
						course && !isReview ? (
							<Button
								type="button"
								variant="outline"
								disabled={isSubmitting}
								onClick={() => submitStep("exit")}
							>
								Guardar y salir
							</Button>
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
						errors={stepsWithErrors(Object.keys(errors))}
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
								evaluations={evaluations}
								evaluationTitles={evaluationTitles}
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
							isSubmitting={isSubmitting}
							submitKind={
								isReview ? "publish" : isEdit && !following ? "save" : "next"
							}
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
	evaluations,
	evaluationTitles,
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
	evaluations?: ReactNode;
	evaluationTitles: readonly string[];
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
					evaluations={evaluations}
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
					evaluationTitles={evaluationTitles}
					quizQuestionCount={quizQuestionCount}
				/>
			) : null;
	}
}
