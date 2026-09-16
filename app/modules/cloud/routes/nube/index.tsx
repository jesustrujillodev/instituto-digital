export { action } from "./index.action";
export { loader } from "./index.loader";

import { CloudOff, Loader2, SearchCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type ShouldRevalidateFunctionArgs,
	useFetcher,
	useNavigate,
} from "react-router";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	CloudDeleteDialog,
	type CloudDeleteRequest,
} from "../../components/cloud-delete-dialog";
import { CloudGrid } from "../../components/cloud-grid";
import { CloudObjectSheet } from "../../components/cloud-object-sheet";
import { CloudOrphansSheet } from "../../components/cloud-orphans-sheet";
import { CloudPathBar } from "../../components/cloud-path-bar";
import { CloudSelectionBar } from "../../components/cloud-selection-bar";
import { CloudTable } from "../../components/cloud-table";
import type { CloudListing, CloudObject } from "../../domain/cloud.types";
import { useViewMode } from "../../hooks/use-view-mode";
import { useZipDownload } from "../../hooks/use-zip-download";
import { pluralize } from "../../utils/cloud-format";
import {
	CLOUD_INTENTS,
	type CloudActionData,
	INTENT_FIELD,
	SELECTION_FIELDS,
	toSelectionFormData,
} from "../../utils/cloud-intents";
import {
	type CloudRow,
	crumbLabel,
	displayNameOf,
	folderHref,
	suggestedZipName,
	toCloudRows,
	toSelection,
} from "../../utils/to-cloud-rows";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [{ label: "Nube" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Nube" }];
}

/**
 * Solo un borrado cambia lo que hay en la carpeta. Firmar URLs, calcular el
 * resumen o buscar huérfanos no: revalidar tras ellos volvería a listar los dos
 * buckets para nada.
 */
export function shouldRevalidate({
	formData,
	defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
	if (formData && formData.get(INTENT_FIELD) !== CLOUD_INTENTS.delete) {
		return false;
	}
	return defaultShouldRevalidate;
}

export default function NubePage({ loaderData }: Route.ComponentProps) {
	const { data } = loaderData;

	if (!data.configured) {
		return (
			<div className="flex flex-col">
				<PageHeader
					title="Nube"
					description="Archivos del almacenamiento: fotos, documentos y fotos de perfil."
				/>
				<Empty className="border border-border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CloudOff aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>El almacenamiento no está configurado</EmptyTitle>
						<EmptyDescription>
							Define STORAGE_PROVIDER y STORAGE_BUCKET_NAME en el entorno del
							servidor para ver y gestionar los archivos aquí.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	// `key` por carpeta: al cambiar de carpeta se descartan páginas extra,
	// selección y paneles abiertos de la anterior sin sincronizarlos a mano.
	return <CloudBrowser key={data.listing.path} listing={data.listing} />;
}

function CloudBrowser({ listing }: { listing: CloudListing }) {
	const navigate = useNavigate();
	const [viewMode, setViewMode] = useViewMode();

	// ── Páginas ─────────────────────────────────────────────────────────────────
	// La primera la trae el loader; "Cargar más" añade las siguientes. Tras un
	// borrado el loader revalida y se vuelve a empezar desde la primera.
	const [extraPages, setExtraPages] = useState<CloudListing[]>([]);
	// Ajuste durante el render y no en un efecto: con un efecto se pintaría un
	// frame con las páginas viejas pegadas al listado nuevo.
	const [pagesBase, setPagesBase] = useState(listing);
	if (pagesBase !== listing) {
		setPagesBase(listing);
		setExtraPages([]);
	}

	const more = useFetcher<typeof import("./index.loader").loader>();
	useEffect(() => {
		const page = more.state === "idle" ? more.data?.data : undefined;
		if (!page?.configured || page.listing.path !== listing.path) return;
		setExtraPages((pages) =>
			pages.some((existing) => existing.nextCursor === page.listing.nextCursor)
				? pages
				: [...pages, page.listing],
		);
	}, [more.state, more.data, listing.path]);

	const pages = useMemo(() => [listing, ...extraPages], [listing, extraPages]);
	const nextCursor = pages.at(-1)?.nextCursor ?? null;
	const rows = useMemo(() => toCloudRows(pages), [pages]);

	const loadMore = () => {
		if (!nextCursor) return;
		const params = new URLSearchParams({
			path: listing.path,
			cursor: nextCursor,
		});
		more.load(`/dashboard/nube?${params}`);
	};

	// ── Selección ───────────────────────────────────────────────────────────────
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const toggle = useCallback((id: string, checked: boolean) => {
		setSelectedIds((current) =>
			checked
				? current.includes(id)
					? current
					: [...current, id]
				: current.filter((selected) => selected !== id),
		);
	}, []);

	// ── Paneles ─────────────────────────────────────────────────────────────────
	const [detail, setDetail] = useState<CloudObject | null>(null);
	const [orphansOpen, setOrphansOpen] = useState(false);
	const [scanToken, setScanToken] = useState(0);
	const [deleteRequest, setDeleteRequest] = useState<CloudDeleteRequest | null>(
		null,
	);

	// ── Descargas ───────────────────────────────────────────────────────────────
	const zip = useZipDownload();
	const download = useFetcher<CloudActionData>({ key: "cloud-download" });
	useFetcherToast(download);
	useEffect(() => {
		const result = download.state === "idle" ? download.data : undefined;
		if (result?.success && result.data.intent === CLOUD_INTENTS.download) {
			// La URL firmada lleva `Content-Disposition: attachment`: el navegador
			// descarga sin salir de la pantalla.
			window.location.assign(result.data.url);
		}
	}, [download.state, download.data]);

	const downloadRow = useCallback(
		(row: CloudRow) => {
			if (row.kind === "folder") {
				const selection = { keys: [], prefixes: [row.id] };
				void zip.start(selection, suggestedZipName(selection, listing.path));
				return;
			}
			download.submit(
				{
					[INTENT_FIELD]: CLOUD_INTENTS.download,
					[SELECTION_FIELDS.key]: row.id,
				},
				{ method: "post" },
			);
		},
		[zip, download, listing.path],
	);

	// ── Borrado ─────────────────────────────────────────────────────────────────
	const remove = useFetcher<CloudActionData>({ key: "cloud-delete" });
	useFetcherToast(remove, {
		onSuccess: () => {
			setDeleteRequest(null);
			setDetail(null);
			setSelectedIds([]);
			setScanToken((token) => token + 1);
		},
	});

	const confirmDelete = (request: CloudDeleteRequest) =>
		remove.submit(toSelectionFormData(CLOUD_INTENTS.delete, request), {
			method: "post",
		});

	const deleteRow = useCallback((row: CloudRow) => {
		setDeleteRequest({
			...toSelection([row.id]),
			name: displayNameOf(row),
		});
	}, []);

	const openRow = useCallback(
		(row: CloudRow) => {
			if (row.kind === "folder") navigate(folderHref(row.id));
			else setDetail(row.object);
		},
		[navigate],
	);

	// ── Textos ──────────────────────────────────────────────────────────────────
	const here = listing.trail.at(-1);
	const hereLabel = here ? crumbLabel(here) : "todo el almacenamiento";
	const emptyState = here
		? {
				title: "Carpeta vacía",
				description: "No hay archivos ni subcarpetas en esta carpeta.",
			}
		: {
				title: "El almacenamiento está vacío",
				description:
					"Aquí aparecerán las fotos y documentos de los vehículos y las fotos de perfil en cuanto se suban.",
			};

	const summary = (
		<>
			{pluralize(rows.length, "elemento", "elementos")}
			{nextCursor ? " cargados; hay más en esta carpeta" : ""}
		</>
	);

	const selection = toSelection(selectedIds);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Nube"
				description="Archivos del almacenamiento: fotos, documentos y fotos de perfil."
				actions={
					<Button variant="outline" onClick={() => setOrphansOpen(true)}>
						<SearchCheck aria-hidden="true" />
						Buscar huérfanos
					</Button>
				}
				collapseActionsOnMobile
			/>

			<CloudPathBar
				trail={listing.trail}
				viewMode={viewMode}
				onViewModeChange={setViewMode}
			/>

			{viewMode === "grid" ? (
				<CloudGrid
					rows={rows}
					selectedIds={selectedIds}
					onToggle={toggle}
					onOpen={openRow}
					emptyState={emptyState}
					summary={summary}
				/>
			) : (
				// Solo la tabla de escritorio va enmarcada.
				<div className="-mx-4 xl:mx-0 xl:overflow-hidden xl:rounded-lg xl:border xl:border-border xl:bg-card">
					<CloudTable
						rows={rows}
						selectedIds={selectedIds}
						onToggle={toggle}
						onOpen={openRow}
						onDownload={downloadRow}
						onDelete={deleteRow}
						emptyState={emptyState}
						summary={summary}
					/>
				</div>
			)}

			{nextCursor && (
				<div className="flex justify-center pt-4">
					<Button
						type="button"
						variant="outline"
						onClick={loadMore}
						disabled={more.state !== "idle"}
					>
						{more.state !== "idle" && (
							<Loader2
								className="animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						)}
						Cargar más
					</Button>
				</div>
			)}

			<CloudSelectionBar
				count={selectedIds.length}
				zip={zip.state}
				onZip={() =>
					void zip.start(selection, suggestedZipName(selection, listing.path))
				}
				onDelete={() => setDeleteRequest(selection)}
				onClear={() => setSelectedIds([])}
				onCancelZip={zip.cancel}
			/>

			<CloudObjectSheet
				object={detail}
				onOpenChange={(open) => {
					if (!open) setDetail(null);
				}}
				onDownload={(object) =>
					downloadRow({ id: object.key, kind: "file", object })
				}
				onDelete={(object) =>
					setDeleteRequest({
						keys: [object.key],
						prefixes: [],
						name: object.name,
					})
				}
			/>

			<CloudOrphansSheet
				open={orphansOpen}
				onOpenChange={setOrphansOpen}
				path={listing.path}
				pathLabel={hereLabel}
				scanToken={scanToken}
				onDelete={(keys) => setDeleteRequest({ keys, prefixes: [] })}
			/>

			<CloudDeleteDialog
				request={deleteRequest}
				onOpenChange={(open) => {
					if (!open && remove.state === "idle") setDeleteRequest(null);
				}}
				onConfirm={confirmDelete}
				deleting={remove.state !== "idle"}
			/>
		</div>
	);
}
