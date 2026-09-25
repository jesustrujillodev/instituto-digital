import { Columns2, List, Loader2, Save } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import { Button } from "@/shared/components/ui/button";
import type { CourseContentTree } from "../domain/content.types";
import { CourseContentManager } from "./course-content-manager";
import {
	type ContentSaveRef,
	CourseContentWorkspace,
} from "./course-content-workspace";

type ContentView = "list" | "editor";

const VIEW_KEY = "contenido:vista";

/** Los dos paneles necesitan el ancho de un escritorio. */
const DESKTOP_QUERY = "(min-width: 1024px)";

const readView = (): ContentView => {
	try {
		return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "editor";
	} catch {
		return "editor";
	}
};

const writeView = (view: ContentView) => {
	try {
		window.localStorage.setItem(VIEW_KEY, view);
	} catch {
		// Sin almacenamiento, la vista vuelve al editor en la próxima carga.
	}
};

/** `true` en el servidor: el editor es la vista por omisión. */
function useIsDesktop() {
	const [isDesktop, setIsDesktop] = useState(true);

	useEffect(() => {
		const query = window.matchMedia(DESKTOP_QUERY);
		const sync = () => setIsDesktop(query.matches);
		sync();
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, []);

	return isDesktop;
}

const VIEW_OPTIONS = [
	{ value: "list", label: "Lista", icon: List },
	{ value: "editor", label: "Editor", icon: Columns2 },
] as const;

/**
 * El temario con sus dos vistas: la lista, que edita con diálogos, y el editor
 * de dos paneles. En móvil solo cabe la lista.
 *
 * Con `saveRef` el guardado lo dispara quien monta el panel (el wizard, al
 * continuar). Sin él, el panel pone su propia barra para guardar y avisa antes
 * de salir con cambios.
 */
export function CourseContentPanel({
	courseDocumentId,
	tree,
	canWrite = true,
	saveRef,
	onDirtyChange,
}: {
	courseDocumentId: string;
	tree: CourseContentTree;
	canWrite?: boolean;
	saveRef?: ContentSaveRef;
	onDirtyChange?: (dirty: boolean) => void;
}) {
	const isDesktop = useIsDesktop();
	const [view, setView] = useState<ContentView>("editor");
	const [switching, setSwitching] = useState(false);

	const ownSaveRef: ContentSaveRef = useRef(null);
	const activeSaveRef = saveRef ?? ownSaveRef;
	const [ownDirty, setOwnDirty] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => setView(readView()), []);

	const effectiveView: ContentView = isDesktop ? view : "list";

	const changeView = async (next: ContentView) => {
		if (next === view) return;
		if (activeSaveRef.current) {
			setSwitching(true);
			const saved = await activeSaveRef.current();
			setSwitching(false);
			if (!saved) return;
		}
		setView(next);
		writeView(next);
	};

	const reportDirty = onDirtyChange ?? setOwnDirty;

	const saveOwn = async () => {
		if (!ownSaveRef.current) return;
		setSaving(true);
		await ownSaveRef.current();
		setSaving(false);
	};

	const standalone = !saveRef;

	const viewToggle = isDesktop ? (
		<ToggleGroup.Root
			type="single"
			aria-label="Vista del temario"
			value={view}
			disabled={switching}
			onValueChange={(value) => {
				if (value) void changeView(value as ContentView);
			}}
			className="flex gap-0.5 rounded-xl border border-border bg-muted/40 p-1"
		>
			{VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
				<ToggleGroup.Item
					key={value}
					value={value}
					className={cn(
						"flex h-7 items-center gap-1.5 rounded-lg px-2.5 font-medium text-muted-foreground text-xs transition-colors duration-150",
						"hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
						"data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
					)}
				>
					<Icon className="size-3.5" aria-hidden="true" />
					{label}
				</ToggleGroup.Item>
			))}
		</ToggleGroup.Root>
	) : null;

	return (
		<div className="flex flex-col gap-3">
			{effectiveView === "editor" && viewToggle && (
				<div className="flex justify-end">{viewToggle}</div>
			)}

			{effectiveView === "editor" ? (
				<CourseContentWorkspace
					courseDocumentId={courseDocumentId}
					tree={tree}
					canWrite={canWrite}
					saveRef={activeSaveRef}
					onDirtyChange={reportDirty}
				/>
			) : (
				<CourseContentManager
					courseDocumentId={courseDocumentId}
					tree={tree}
					canWrite={canWrite}
					actions={viewToggle}
				/>
			)}

			{standalone && effectiveView === "editor" && canWrite && (
				<>
					<UnsavedChangesDialog when={ownDirty && !saving} />
					<div className="flex items-center justify-end gap-3">
						{ownDirty && (
							<span className="text-muted-foreground text-sm">
								Hay cambios sin guardar.
							</span>
						)}
						<Button
							type="button"
							disabled={!ownDirty || saving}
							onClick={() => void saveOwn()}
						>
							{saving ? (
								<Loader2 className="animate-spin" aria-hidden="true" />
							) : (
								<Save aria-hidden="true" />
							)}
							{saving ? "Guardando…" : "Guardar cambios"}
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
