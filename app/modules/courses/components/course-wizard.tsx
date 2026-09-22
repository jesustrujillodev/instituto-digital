import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, type Resolver, useForm } from "react-hook-form";
import { Link, useFetcher, useNavigate } from "react-router";
import { sileo } from "sileo";
import { toFormData } from "@/lib/form-data";
import { scrollIntoView } from "@/lib/motion";
import { CourseContentManager } from "@/modules/content/components/course-content-manager";
import { toContentSummary } from "@/modules/content/domain/content.mapper";
import type { CourseContentTree } from "@/modules/content/domain/content.types";
import { PageHeader } from "@/shared/components/common/page-header";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { AppResponse } from "@/shared/response/response.types";
import {
	type CourseFormat,
	type CourseModality,
	requiresLink,
	requiresSessions,
	requiresVenue,
} from "../domain/course.rules";
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
	type CourseStep,
	type CourseStepKey,
	nextStep,
	type PublishChecklist,
	previousStep,
	stepPath,
	stepPosition,
	stepsForFormat,
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
	CourseRulesFields,
	RULES_DESCRIPTION,
} from "./course-attendance-section";
import {
	type CourseCoverControl,
	CourseGeneralFields,
} from "./course-general-section";
import { CourseAccessFields } from "./course-people-section";
import { CourseReviewStep } from "./course-review-step";
import { CourseProgramFields } from "./course-sessions-manager";
import { CourseWizardFooter } from "./course-wizard-footer";
import { CourseWizardStepper } from "./course-wizard-stepper";

const LIST_PATH = "/dashboard/cursos";

const NO_PENDING: ReadonlySet<CourseStepKey> = new Set();

const placeOf = (modality: CourseModality) =>
	requiresVenue(modality) && requiresLink(modality)
		? "sede y enlace"
		: requiresVenue(modality)
			? "sede"
			: "enlace";

const describeStep = (
	step: CourseStep,
	modality: CourseModality,
	format: CourseFormat,
): string => {
	switch (step.key) {
		case "identity":
			return "Es lo que el personal lee en el catálogo. Con el título basta para guardar el borrador.";
		case "program":
			return requiresSessions(format)
				? `Horario de Tijuana. Para publicar hace falta al menos una sesión, y cada una con ${placeOf(modality)}.`
				: "Un curso autogestivo no se reúne: no hay sesiones que programar.";
		case "access":
			return "Quién imparte, quién puede verlo y cuántos lugares hay.";
		case "rules":
			return RULES_DESCRIPTION;
		case "content":
			return "Los módulos y las lecciones que se recorren. Cada cambio se guarda solo, sin salir del paso.";
		case "review":
			return "Repasa lo capturado. Al publicar, el curso aparece a su audiencia y puede recibir inscripciones.";
	}
};

interface CourseWizardProps {
	step: CourseStep;
	options: CourseFormOptions;
	/** `null` en el paso 1 del alta: el borrador todavía no existe. */
	course?: CourseDetail | null;
	checklist?: PublishChecklist | null;
	/** El temario, solo cuando el formato lo pide. */
	content?: CourseContentTree | null;
	prefill?: CoursePlanPrefill | null;
	/** Aviso propio de la pantalla, sobre el índice (p. ej. la línea del plan). */
	notice?: React.ReactNode;
	ids: CourseFormIds;
}

/**
 * El alta de un curso, paso a paso.
 *
 * El borrador nace al salir del paso 1 y cada paso guarda al avanzar, así que
 * el servidor es la única fuente de verdad: al llegar datos nuevos, el
 * formulario se reinicia con ellos.
 */
export function CourseWizard({
	step,
	options,
	course,
	checklist,
	content,
	prefill,
	notice,
	ids,
}: CourseWizardProps) {
	const navigate = useNavigate();
	const isCreate = !course;
	const isReview = step.key === "review";
	const documentId = course?.documentId ?? null;
	const detailPath = documentId ? `${LIST_PATH}/${documentId}` : LIST_PATH;

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
	const modality = watch("modality");
	const format = watch("format");
	const steps = stepsForFormat(format);
	const following = nextStep(steps, step);
	const preceding = previousStep(steps, step);

	// Datos nuevos del servidor mandan sobre lo que haya en pantalla: es lo que
	// deja `isDirty` en falso tras cada guardado y libera el aviso de salida.
	useEffect(() => {
		reset(defaultValues);
		setCover(null);
		setCoverRemoved(false);
	}, [reset, defaultValues]);

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

			setLeavingTo(
				targetRef.current === "exit" || isReview || !following
					? detailPath
					: stepPath(documentId as string, following.number),
			);
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
	const hasUnsavedChanges =
		(isDirty || coverTouched) && !isSubmitting && leavingTo === null;

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
			setLeavingTo(
				targetRef.current === "exit" || !following
					? detailPath
					: stepPath(documentId, following.number),
			);
			return;
		}

		const valid = await trigger(step.fields);
		if (!valid) {
			reportStepErrors();
			return;
		}

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
							? `Borrador · Paso ${position} de ${total}`
							: "En cuanto continúes, el curso queda guardado como borrador."
					}
					goBack={detailPath}
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

				{notice && <div className="mb-4">{notice}</div>}

				<div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-6">
					<CourseWizardStepper
						documentId={documentId}
						steps={steps}
						current={step.number}
						pending={pending}
						errors={stepsWithErrors(Object.keys(errors))}
					/>

					<div className="flex flex-col">
						<form
							id={ids.form}
							onSubmit={(event) => {
								event.preventDefault();
								void submitStep("next");
							}}
						>
							<Card>
								<CardContent className="flex flex-col gap-6">
									<header className="flex flex-col gap-1">
										<h2
											ref={headingRef}
											tabIndex={-1}
											className="font-medium text-base outline-none"
										>
											{step.title}
										</h2>
										<p className="max-w-prose text-muted-foreground text-sm">
											{describeStep(step, modality, format)}
										</p>
									</header>

									<StepFields
										step={step}
										ids={ids}
										options={options}
										course={course}
										checklist={checklist ?? []}
										content={content ?? null}
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
								</CardContent>
							</Card>
						</form>

						<CourseWizardFooter
							formId={ids.form}
							backTo={
								documentId && preceding
									? stepPath(documentId, preceding.number)
									: null
							}
							isSubmitting={isSubmitting}
							isLastStep={isReview}
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
	checklist,
	content,
	cover,
}: {
	step: CourseStep;
	ids: CourseFormIds;
	options: CourseFormOptions;
	course?: CourseDetail | null;
	checklist: PublishChecklist;
	content: CourseContentTree | null;
	cover: CourseCoverControl;
}) {
	switch (step.key) {
		case "identity":
			return (
				<CourseGeneralFields
					ids={ids}
					organizers={
						!course && options.canChooseOrganizer ? options.organizers : null
					}
					cover={cover}
				/>
			);
		case "program":
			return <CourseProgramFields ids={ids} isPublished={false} />;
		case "access":
			return <CourseAccessFields ids={ids} options={options} />;
		case "rules":
			return <CourseRulesFields ids={ids} />;
		case "content":
			return course && content ? (
				<CourseContentManager
					courseDocumentId={course.documentId}
					tree={content}
				/>
			) : null;
		case "review":
			return course ? (
				<CourseReviewStep
					course={course}
					checklist={checklist}
					content={content ? toContentSummary(content) : null}
				/>
			) : null;
	}
}
