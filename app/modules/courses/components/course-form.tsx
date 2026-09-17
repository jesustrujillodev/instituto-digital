import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect, useMemo } from "react";
import {
	FormProvider,
	type Resolver,
	type SubmitErrorHandler,
	useForm,
} from "react-hook-form";
import type { FetcherWithComponents } from "react-router";
import { sileo } from "sileo";
import { scrollIntoView } from "@/lib/motion";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import type { CourseDetail, CourseFormOptions } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import {
	buildCourseFormDefaults,
	type CourseFormValues,
	type CoursePlanPrefill,
} from "../utils/build-course-form-defaults";
import {
	createCourseFormRule,
	updateCourseFormRule,
} from "../utils/build-course-payload";
import {
	COURSE_INTENTS,
	type CourseActionData,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/parse-course-form-data";
import { CourseGeneralSection } from "./course-general-section";
import { CoursePeopleSection } from "./course-people-section";
import { CourseSessionsManager } from "./course-sessions-manager";

interface CourseFormProps {
	mode: "create" | "edit";
	ids: CourseFormIds;
	/** Lo crea la ruta para poder pintar el botón de guardar en el PageHeader. */
	fetcher: FetcherWithComponents<CourseActionData>;
	options: CourseFormOptions;
	course?: CourseDetail | null;
	prefill?: CoursePlanPrefill | null;
}

export function CourseForm({
	mode,
	ids,
	fetcher,
	options,
	course,
	prefill,
}: CourseFormProps) {
	const isEdit = mode === "edit";

	const defaultValues = useMemo(
		() => buildCourseFormDefaults(course, prefill),
		[course, prefill],
	);

	// El cast expresa "resolver de una regla que transforma los valores antes de
	// validarlos": la salida ya es la entrada del servidor, no el formulario.
	const resolver = useMemo(
		() =>
			valibotResolver(
				isEdit ? updateCourseFormRule : createCourseFormRule,
			) as unknown as Resolver<CourseFormValues, unknown, unknown>,
		[isEdit],
	);

	const methods = useForm<CourseFormValues, unknown, unknown>({
		resolver,
		defaultValues,
		mode: "onTouched",
		reValidateMode: "onChange",
		shouldFocusError: true,
	});
	const {
		handleSubmit,
		setError,
		formState: { isDirty },
	} = methods;

	const isSubmitting = fetcher.state !== "idle";
	const isSaved = fetcher.data?.success === true;
	const hasUnsavedChanges = isDirty && !isSubmitting && !isSaved;

	useEffect(() => {
		const data = fetcher.data;
		const fieldErrors = data && !data.success ? data.error.fieldErrors : null;
		if (!fieldErrors) return;

		for (const [name, message] of Object.entries(fieldErrors)) {
			setError(name as keyof CourseFormValues, { type: "server", message });
		}
	}, [fetcher.data, setError]);

	const onSubmit = (payload: unknown) => {
		fetcher.submit(
			{
				[INTENT_FIELD]: isEdit ? COURSE_INTENTS.update : COURSE_INTENTS.create,
				[PAYLOAD_FIELD]: JSON.stringify(payload),
			},
			{ method: "post" },
		);
	};

	const onInvalid: SubmitErrorHandler<CourseFormValues> = (formErrors) => {
		const keys = Object.keys(formErrors);
		sileo.error({
			title: "Revisa el formulario",
			description:
				keys.length === 1
					? "Hay un campo marcado."
					: `Hay ${keys.length} campos marcados.`,
		});

		const firstId = ids[keys[0] as keyof CourseFormIds];
		if (firstId) {
			scrollIntoView(document.getElementById(firstId), { block: "center" });
		}
	};

	return (
		<FormProvider {...methods}>
			<UnsavedChangesDialog when={hasUnsavedChanges} />
			<form
				id={ids.form}
				onSubmit={handleSubmit(onSubmit, onInvalid)}
				className="flex flex-col gap-4"
			>
				<CourseGeneralSection
					ids={ids}
					organizers={
						!isEdit && options.canChooseOrganizer ? options.organizers : null
					}
				/>
				<CoursePeopleSection ids={ids} options={options} />
				<CourseSessionsManager id={ids.sessions} />
			</form>
		</FormProvider>
	);
}
