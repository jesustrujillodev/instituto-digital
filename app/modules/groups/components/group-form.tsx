import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect, useMemo } from "react";
import {
	type Resolver,
	type SubmitErrorHandler,
	useForm,
} from "react-hook-form";
import type { FetcherWithComponents } from "react-router";
import { sileo } from "sileo";
import { toFormData } from "@/lib/form-data";
import { scrollIntoView } from "@/lib/motion";
import { TextInput } from "@/shared/components/common/text-input";
import { TextareaInput } from "@/shared/components/common/textarea-input";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import { Card, CardContent } from "@/shared/components/ui/card";
import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { createGroupRule, updateGroupRule } from "../domain/group.rules";
import type { Group } from "../domain/group.types";
import type { GroupFormIds } from "../hooks/use-group-form-ids";
import {
	buildGroupFormDefaults,
	type GroupFormValues,
} from "../utils/build-group-form-defaults";
import {
	GROUP_INTENTS,
	type GroupActionData,
	INTENT_FIELD,
} from "../utils/parse-group-form-data";

interface GroupFormProps {
	mode: "create" | "edit";
	ids: GroupFormIds;
	/** Lo crea la ruta para poder pintar el botón de guardar en el PageHeader. */
	fetcher: FetcherWithComponents<GroupActionData>;
	group?: Group | null;
}

export function GroupForm({ mode, ids, fetcher, group }: GroupFormProps) {
	const isEdit = mode === "edit";

	const defaultValues = useMemo(() => buildGroupFormDefaults(group), [group]);

	// El cast es la única forma de expresar "resolver de un esquema que valida un
	// SUBCONJUNTO de los valores del formulario": updateGroupRule los declara
	// todos opcionales y TypeScript no acepta esa relación en un tipo
	// contravariante. La validación real es la misma regla que corre el servidor.
	const resolver = useMemo(
		() =>
			valibotResolver(
				isEdit ? updateGroupRule : createGroupRule,
			) as unknown as Resolver<GroupFormValues>,
		[isEdit],
	);

	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<GroupFormValues>({
		resolver,
		defaultValues,
		mode: "onTouched",
		reValidateMode: "onChange",
		shouldFocusError: true,
	});

	const isSubmitting = fetcher.state !== "idle";
	const isSaved = fetcher.data?.success === true;
	const hasUnsavedChanges = isDirty && !isSubmitting && !isSaved;

	useEffect(() => {
		const data = fetcher.data;
		const fieldErrors = data && !data.success ? data.error.fieldErrors : null;
		if (!fieldErrors) return;

		for (const [name, message] of Object.entries(fieldErrors)) {
			setError(name as keyof GroupFormValues, { type: "server", message });
		}
	}, [fetcher.data, setError]);

	const onSubmit = (values: GroupFormValues) => {
		fetcher.submit(
			toFormData({
				...values,
				[INTENT_FIELD]: isEdit ? GROUP_INTENTS.update : GROUP_INTENTS.create,
			}),
			{ method: "post" },
		);
	};

	const onInvalid: SubmitErrorHandler<GroupFormValues> = (formErrors) => {
		const keys = Object.keys(formErrors);
		sileo.error({
			title: "Revisa el formulario",
			description:
				keys.length === 1
					? "Hay un campo marcado."
					: `Hay ${keys.length} campos marcados.`,
		});

		const firstId = ids[keys[0] as keyof GroupFormIds];
		scrollIntoView(document.getElementById(firstId), { block: "center" });
	};

	return (
		<>
			<UnsavedChangesDialog when={hasUnsavedChanges} />
			<form
				id={ids.form}
				onSubmit={handleSubmit(onSubmit, onInvalid)}
				className="flex flex-col gap-4"
			>
				<Card>
					<CardContent>
						<FieldSet>
							<FieldLegend>Identidad</FieldLegend>

							<TextInput
								id={ids.name}
								label="Nombre"
								required
								placeholder="Mandos medios"
								error={errors.name?.message}
								{...register("name")}
							/>

							<TextareaInput
								id={ids.description}
								label="Descripción"
								rows={3}
								placeholder="Para qué sirve esta lista."
								error={errors.description?.message}
								{...register("description")}
							/>
						</FieldSet>
					</CardContent>
				</Card>
			</form>
		</>
	);
}
