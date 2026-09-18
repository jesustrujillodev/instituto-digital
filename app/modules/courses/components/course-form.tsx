import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect, useMemo, useState } from "react";
import {
	FormProvider,
	type Resolver,
	type SubmitErrorHandler,
	useForm,
} from "react-hook-form";
import type { FetcherWithComponents } from "react-router";
import { sileo } from "sileo";
import { toFormData } from "@/lib/form-data";
import { scrollIntoView } from "@/lib/motion";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import type { AppResponse } from "@/shared/response/response.types";
import type { CourseDetail, CourseFormOptions } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import {
	buildCourseFormDefaults,
	type CourseFormValues,
} from "../utils/build-course-form-defaults";
import { updateCourseFormRule } from "../utils/build-course-payload";
import {
	COURSE_INTENTS,
	COVER_FIELD,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/parse-course-form-data";
import { CourseAttendanceSection } from "./course-attendance-section";
import { CourseFormNav } from "./course-form-nav";
import { CourseGeneralSection } from "./course-general-section";
import { CoursePeopleSection } from "./course-people-section";
import { CourseSessionsManager } from "./course-sessions-manager";

interface CourseFormProps {
	ids: CourseFormIds;
	/** Lo crea la ruta para poder pintar el botón de guardar en el PageHeader. */
	fetcher: FetcherWithComponents<AppResponse<unknown>>;
	options: CourseFormOptions;
	course: CourseDetail;
}

/**
 * Edición de un curso que ya existe: todas las secciones a la vista.
 *
 * El alta va por pasos (`CourseWizard`) porque ahí se captura de cero; quien
 * edita viene a un campo concreto y recorrer pasos sería un trayecto de más.
 */
export function CourseForm({ ids, fetcher, options, course }: CourseFormProps) {
	const defaultValues = useMemo(
		() => buildCourseFormDefaults(course),
		[course],
	);

	// El cast expresa "resolver de una regla que transforma los valores antes de
	// validarlos": la salida ya es la entrada del servidor, no el formulario.
	const resolver = useMemo(
		() =>
			valibotResolver(updateCourseFormRule) as unknown as Resolver<
				CourseFormValues,
				unknown,
				unknown
			>,
		[],
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

	// La portada vive fuera de react-hook-form (guía §10.4), así que su cambio no
	// lo ve `isDirty`: se rastrea aparte para que el aviso de cambios sin guardar
	// siga diciendo la verdad.
	const [cover, setCover] = useState<File | null>(null);
	const [coverRemoved, setCoverRemoved] = useState(false);

	const isSubmitting = fetcher.state !== "idle";
	const isSaved = fetcher.data?.success === true;
	const coverTouched = cover !== null || coverRemoved;
	const hasUnsavedChanges =
		(isDirty || coverTouched) && !isSubmitting && !isSaved;

	useEffect(() => {
		const data = fetcher.data;
		const fieldErrors = data && !data.success ? data.error.fieldErrors : null;
		if (!fieldErrors) return;

		for (const [name, message] of Object.entries(fieldErrors)) {
			setError(name as keyof CourseFormValues, { type: "server", message });
		}
	}, [fetcher.data, setError]);

	const onSubmit = (payload: unknown) => {
		// El curso sigue viajando como un solo JSON; la portada no cabe ahí, así
		// que el envío pasa a multipart. `toFormData` omite el archivo cuando es
		// null, y esa ausencia significa "no la toques": quitarla viaja en el
		// payload como `removeCover`.
		fetcher.submit(
			toFormData({
				[INTENT_FIELD]: COURSE_INTENTS.update,
				[PAYLOAD_FIELD]: JSON.stringify({
					...(payload as Record<string, unknown>),
					removeCover: coverRemoved,
				}),
				[COVER_FIELD]: cover,
			}),
			{ method: "post", encType: "multipart/form-data" },
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
			<div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
				<CourseFormNav />
				<form
					id={ids.form}
					onSubmit={handleSubmit(onSubmit, onInvalid)}
					className="flex flex-col gap-6"
				>
					<CourseGeneralSection
						ids={ids}
						organizers={null}
						cover={{
							value: cover,
							existingUrl: course.coverImageUrl,
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
					<CourseSessionsManager
						ids={ids}
						isPublished={course.status === "PUBLISHED"}
					/>
					<CoursePeopleSection ids={ids} options={options} />
					<CourseAttendanceSection ids={ids} />
				</form>
			</div>
		</FormProvider>
	);
}
