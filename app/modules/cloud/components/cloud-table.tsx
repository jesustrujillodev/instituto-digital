import { Download, Eye, FolderOpen, Trash2 } from "lucide-react";
import { useMemo } from "react";
import {
	DataTable,
	type DataTableAction,
} from "@/shared/components/common/data-table";
import { columnHelpers } from "@/shared/components/common/data-table-columns";
import { formatBytes, formatModified } from "../utils/cloud-format";
import { type CloudRow, displayNameOf } from "../utils/to-cloud-rows";
import { UsageCell, VisibilityBadge } from "./cloud-badges";
import { CloudThumb } from "./cloud-thumb";

export interface CloudRowHandlers {
	onOpen: (row: CloudRow) => void;
	onDownload: (row: CloudRow) => void;
	onDelete: (row: CloudRow) => void;
}

interface CloudTableProps extends CloudRowHandlers {
	rows: CloudRow[];
	selectedIds: string[];
	onToggle: (id: string, checked: boolean) => void;
	emptyState: { title: string; description: string };
	summary: React.ReactNode;
}

const NUMERIC = {
	align: "right",
	className: "whitespace-nowrap tabular-nums",
} as const;

/** Segunda línea del nombre: la carpeta cruda bajo su nombre legible. */
const secondaryLine = (row: CloudRow) =>
	row.kind === "folder"
		? row.folder.label
			? row.folder.name
			: "Carpeta"
		: row.object.contentType;

export function CloudTable({
	rows,
	selectedIds,
	onToggle,
	onOpen,
	onDownload,
	onDelete,
	emptyState,
	summary,
}: CloudTableProps) {
	const columns = useMemo(
		() => [
			columnHelpers.custom<CloudRow>(
				"name",
				"Nombre",
				(row) => (
					<div className="flex min-w-0 items-center gap-3">
						<CloudThumb row={row} />
						<div className="flex min-w-0 flex-col">
							<span className="truncate font-medium text-foreground text-sm">
								{displayNameOf(row)}
							</span>
							<span className="truncate text-muted-foreground text-xs">
								{secondaryLine(row)}
							</span>
						</div>
					</div>
				),
				{ sortable: false, className: "max-w-md" },
			),
			{
				...columnHelpers.custom<CloudRow>(
					"size",
					"Tamaño",
					(row) => (row.kind === "file" ? formatBytes(row.object.size) : "—"),
					{ sortable: false },
				),
				...NUMERIC,
			},
			columnHelpers.custom<CloudRow>(
				"modified",
				"Modificado",
				(row) =>
					row.kind === "file" ? formatModified(row.object.lastModified) : "—",
				{ sortable: false, className: "whitespace-nowrap tabular-nums" },
			),
			columnHelpers.custom<CloudRow>(
				"visibility",
				"Acceso",
				(row) => (
					<VisibilityBadge
						visibility={
							row.kind === "folder"
								? row.folder.visibility
								: row.object.visibility
						}
					/>
				),
				{ sortable: false },
			),
			columnHelpers.custom<CloudRow>(
				"usage",
				"Uso",
				(row) =>
					row.kind === "file" ? (
						<UsageCell reference={row.object.reference} />
					) : (
						<span className="text-muted-foreground">—</span>
					),
				{ sortable: false, className: "max-w-56" },
			),
		],
		[],
	);

	const actions = useMemo<DataTableAction<CloudRow>[]>(
		() => [
			{
				icon: FolderOpen,
				label: "Abrir",
				show: (row) => row.kind === "folder",
				onClick: onOpen,
			},
			{
				icon: Eye,
				label: "Ver detalles",
				show: (row) => row.kind === "file",
				onClick: onOpen,
			},
			{
				icon: Download,
				label: (row) => (row.kind === "folder" ? "Descargar ZIP" : "Descargar"),
				onClick: onDownload,
			},
			{
				icon: Trash2,
				label: "Eliminar",
				variant: "danger",
				onClick: onDelete,
			},
		],
		[onOpen, onDownload, onDelete],
	);

	return (
		<DataTable
			data={rows}
			columns={columns}
			actions={actions}
			showCheckbox
			selectedRowIds={selectedIds}
			onCheckboxChange={onToggle}
			onRowClick={onOpen}
			emptyState={{ icon: FolderOpen, ...emptyState }}
			summary={summary}
			mobileCard={{
				title: (row) => (
					<span className="flex min-w-0 items-center gap-3">
						<CloudThumb row={row} />
						<span className="truncate">{displayNameOf(row)}</span>
					</span>
				),
				description: (row) =>
					row.kind === "file"
						? `${formatBytes(row.object.size)} · ${formatModified(row.object.lastModified)}`
						: secondaryLine(row),
				content: (row) => (
					<div className="flex flex-wrap items-center gap-2">
						<VisibilityBadge
							visibility={
								row.kind === "folder"
									? row.folder.visibility
									: row.object.visibility
							}
						/>
						{row.kind === "file" && (
							<UsageCell reference={row.object.reference} compact />
						)}
					</div>
				),
			}}
		/>
	);
}
