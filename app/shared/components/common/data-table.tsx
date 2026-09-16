import {
	ArrowUpDown,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	ChevronUp,
	Eye,
	FolderOpen,
	MoreVertical,
	Pencil,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";

export type SortDirection = "asc" | "desc";

/**
 * Entrada escalonada de las filas, ACOTADA.
 *
 * El escalonado tiene sentido mientras se lea como "esto es una lista y está
 * llegando". Con `índice × 50 ms` sin tope dejaba de serlo: una página de 50
 * filas terminaba de pintarse a los 2,8 s, y como la animación no fija el estado
 * inicial (`fill-mode` por defecto), cada fila se veía primero en su sitio, se
 * apagaba al llegarle su turno y volvía a entrar deslizándose. Un parpadeo, no
 * una entrada.
 *
 * Ahora solo las primeras filas llevan retraso propio y el resto entra con el
 * tope: la lista completa termina en 450 ms venga con 5 filas o con 200. El
 * `fill-mode-both` es lo que quita el parpadeo — la fila espera invisible en vez
 * de aparecer para volver a esconderse.
 *
 * Con `prefers-reduced-motion` el retraso se anula desde app.css y todas entran
 * a la vez, sin deslizamiento.
 */
const ROW_ENTER = "animate-in fade-in duration-300 fill-mode-both";
const ROW_STAGGER_MS = 30;
const ROW_STAGGER_LIMIT = 5;

const rowEnterDelay = (index: number): string =>
	`${Math.min(index, ROW_STAGGER_LIMIT) * ROW_STAGGER_MS}ms`;

export interface Column<T> {
	key: string;
	label: string;
	sortable?: boolean;
	render?: (item: T) => React.ReactNode;
	className?: string;
	mobileHidden?: boolean;
	align?: "left" | "center" | "right";
}

export interface DataTableAction<T> {
	icon?: React.ComponentType<{ className?: string }>;
	getIcon?: (item: T) => React.ComponentType<{ className?: string }>;
	label: string | ((item: T) => string);
	onClick: (item: T) => void;
	variant?: "default" | "danger";
	disabled?: (item: T) => boolean;
	show?: (item: T) => boolean;
}

export interface DataTableProps<T> {
	data: T[];
	columns: Column<T>[];
	actions?: DataTableAction<T>[];
	isLoading?: boolean;
	emptyState?: {
		icon?: React.ComponentType<{ className?: string }>;
		title: string;
		description: string;
	};
	mobileCard?: {
		title: (item: T) => React.ReactNode;
		description?: (item: T) => React.ReactNode;
		content?: (item: T) => React.ReactNode;
	};
	pagination?: {
		total: number;
		page: number;
		pageSize: number;
		pageCount: number;
		onPageChange: (page: number) => void;
		onPageSizeChange: (size: number) => void;
	};
	defaultSortKey?: string;
	defaultSortDirection?: SortDirection;
	onSort?: (key: string, direction: SortDirection) => void;
	onRowClick?: (item: T) => void;
	selectedRowIds?: string[];
	showCheckbox?: boolean;
	onCheckboxChange?: (id: string, checked: boolean) => void;
	rowClassName?: (item: T) => string;
	/**
	 * Sustituye el "Mostrando X - Y de Z" del pie. Para listados que no conocen
	 * su total —paginación por cursor—, donde esa cifra afirmaría un total falso.
	 */
	summary?: React.ReactNode;
}

export function DataTable<T extends { id: string }>({
	data,
	columns,
	actions,
	emptyState,
	mobileCard,
	pagination,
	isLoading = false,
	defaultSortKey,
	defaultSortDirection = "asc",
	onSort,
	onRowClick,
	selectedRowIds = [],
	showCheckbox = false,
	onCheckboxChange,
	rowClassName,
	summary,
}: DataTableProps<T>) {
	const [sortField, setSortField] = useState<string>(
		defaultSortKey || columns[0]?.key || "",
	);
	const [sortDirection, setSortDirection] =
		useState<SortDirection>(defaultSortDirection);

	// Sync state with props if they change (server-side control)
	useEffect(() => {
		if (defaultSortKey) setSortField(defaultSortKey);
		if (defaultSortDirection) setSortDirection(defaultSortDirection);
	}, [defaultSortKey, defaultSortDirection]);

	const handleSort = (key: string) => {
		const newDirection =
			sortField === key && sortDirection === "asc" ? "desc" : "asc";

		setSortField(key);
		setSortDirection(newDirection);

		if (onSort) {
			onSort(key, newDirection);
		}
	};

	const renderSortIcon = (key: string) => {
		if (sortField !== key) {
			return (
				<ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" />
			);
		}
		return sortDirection === "asc" ? (
			<ChevronUp className="h-4 w-4 text-foreground" />
		) : (
			<ChevronDown className="h-4 w-4 text-foreground" />
		);
	};

	const processedData = useMemo(() => {
		if (isLoading || !data) return [];
		if (onSort || !sortField) return data;

		return [...data].sort((a, b) => {
			const aValue = a[sortField as keyof T];
			const bValue = b[sortField as keyof T];

			if (aValue instanceof Date && bValue instanceof Date) {
				return sortDirection === "asc"
					? aValue.getTime() - bValue.getTime()
					: bValue.getTime() - aValue.getTime();
			}

			const aStr = String(aValue || "").toLowerCase();
			const bStr = String(bValue || "").toLowerCase();

			if (aStr < bStr) return sortDirection === "asc" ? -1 : 1;
			if (aStr > bStr) return sortDirection === "asc" ? 1 : -1;
			return 0;
		});
	}, [data, sortField, sortDirection, onSort, isLoading]);

	// Loading State
	if (isLoading) {
		return (
			<div className="w-full space-y-4 px-4 sm:px-6 py-6">
				<div className="hidden xl:block">
					<div className="space-y-4">
						<div className="flex gap-4">
							{[...Array(columns.length)].map((_, i) => (
								<Skeleton key={columns[i].key} className="h-8 w-full" />
							))}
						</div>
						{[...Array(5)].map((_, i) => (
							<Skeleton key={columns[i].key} className="h-16 w-full" />
						))}
					</div>
				</div>
				<div className="xl:hidden space-y-4">
					{[...Array(3)].map((_, i) => (
						<Skeleton key={columns[i].key} className="h-40 w-full rounded-xl" />
					))}
				</div>
			</div>
		);
	}

	// Empty State
	if (processedData.length === 0) {
		const EmptyIcon = emptyState?.icon || FolderOpen;
		return (
			<div className="px-4 py-12 text-center sm:px-6">
				<EmptyIcon className="mx-auto h-12 w-12 text-muted-foreground" />
				<h3 className="mt-2 text-sm font-semibold text-foreground">
					{emptyState?.title || "No hay datos"}
				</h3>
				<p className="mt-1 text-sm text-muted-foreground">
					{emptyState?.description || "No se encontraron resultados."}
				</p>
			</div>
		);
	}

	return (
		<>
			{/* Desktop Table View */}
			<div className="hidden xl:block">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-border">
						<thead className="bg-muted">
							<tr>
								{showCheckbox && (
									<th scope="col" className="w-[1%] px-6 py-3">
										<Checkbox
											checked={
												processedData.length > 0 &&
												processedData.every((item) =>
													selectedRowIds.includes(item.id),
												)
											}
											onCheckedChange={(checked) => {
												const ids = processedData.map((item) => item.id);
												if (checked) {
													// Select all on page
													ids.forEach((id) => {
														if (!selectedRowIds.includes(id)) {
															onCheckboxChange?.(id, true);
														}
													});
												} else {
													// Deselect all on page
													ids.forEach((id) => {
														if (selectedRowIds.includes(id)) {
															onCheckboxChange?.(id, false);
														}
													});
												}
											}}
											className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
											aria-label="Seleccionar todos los elementos"
										/>
									</th>
								)}
								{columns.map((column) => (
									<th
										key={column.key}
										scope="col"
										aria-sort={
											sortField === column.key
												? sortDirection === "asc"
													? "ascending"
													: "descending"
												: "none"
										}
										className={`px-4 py-3 text-left first:pl-6 last:pr-6 ${
											column.align === "right"
												? "text-right"
												: column.align === "center"
													? "text-center"
													: "text-left"
										} ${column.className || ""}`}
									>
										{column.sortable !== false ? (
											<button
												type="button"
												onClick={() => handleSort(column.key)}
												className={`group inline-flex items-center gap-1 align-middle text-xs font-semibold uppercase tracking-wider text-foreground hover:text-foreground/80 transition-colors ${
													column.align === "right" ? "flex-row-reverse" : ""
												}`}
											>
												{column.label}
												{renderSortIcon(column.key)}
											</button>
										) : (
											<span className="align-middle text-xs font-semibold uppercase tracking-wider text-foreground">
												{column.label}
											</span>
										)}
									</th>
								))}
								{/* Actions Header: Not sticky, just a regular column at the end */}
								{actions && actions.length > 0 && (
									<th
										scope="col"
										className="px-4 py-3 w-[1%] whitespace-nowrap first:pl-6 last:pr-6"
									>
										<span className="align-middle text-xs font-semibold uppercase tracking-wider text-foreground">
											Acciones
										</span>
									</th>
								)}
							</tr>
						</thead>
						<tbody className="divide-y divide-border bg-card">
							{processedData.map((item, index) => {
								const isSelected = selectedRowIds.includes(item.id);
								return (
									<tr
										key={item.id}
										onClick={() => onRowClick?.(item)}
										className={`${onRowClick ? "cursor-pointer" : ""} ${
											isSelected
												? "bg-primary/5 dark:bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/20"
												: "hover:bg-muted/50"
										} ${rowClassName?.(item) || ""}`}
										style={{ animationDelay: rowEnterDelay(index) }}
									>
										{showCheckbox && (
											<td className="px-6 py-4 w-[1%] whitespace-nowrap">
												<Checkbox
													checked={isSelected}
													onCheckedChange={(checked) => {
														onCheckboxChange?.(item.id, checked as boolean);
													}}
													onClick={(e) => e.stopPropagation()}
												/>
											</td>
										)}
										{columns.map((column) => (
											<td
												key={column.key}
												className={`px-4 py-4 text-foreground first:pl-6 last:pr-6 ${
													column.align === "right"
														? "text-right"
														: column.align === "center"
															? "text-center"
															: "text-left"
												} ${column.className || ""}`}
											>
												{column.render
													? column.render(item)
													: String(item[column.key as keyof T] || "-")}
											</td>
										))}
										{actions && actions.length > 0 && (
											<td className="px-4 py-4 text-right whitespace-nowrap w-12 first:pl-6 last:pr-6">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															className="h-8 w-8 p-0 hover:bg-muted data-[state=open]:bg-muted"
														>
															<span className="sr-only">Abrir menú</span>
															<MoreVertical className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end" className="w-40">
														<DropdownMenuLabel>Acciones</DropdownMenuLabel>
														<DropdownMenuSeparator />
														{actions.map((action) => {
															if (action.show && !action.show(item))
																return null;

															const Icon = action.getIcon
																? action.getIcon(item)
																: action.icon;
															const label =
																typeof action.label === "function"
																	? action.label(item)
																	: action.label;

															if (!Icon) return null;

															const isDisabled = action.disabled?.(item);

															// Optional: Add a separator before "Delete" actions automatically
															const isDestructive = action.variant === "danger";

															return (
																<DropdownMenuItem
																	key={label}
																	disabled={isDisabled}
																	onClick={(e) => {
																		e.stopPropagation();
																		action.onClick(item);
																	}}
																	className={`cursor-pointer gap-2 ${
																		isDestructive
																			? "text-destructive focus:text-destructive focus:bg-destructive/10"
																			: ""
																	}`}
																>
																	<Icon className="h-4 w-4" />
																	<span>{label}</span>
																</DropdownMenuItem>
															);
														})}
													</DropdownMenuContent>
												</DropdownMenu>
											</td>
										)}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>

			{/* Mobile Card View - Kept consistent with improvements */}
			{mobileCard && (
				<div className="xl:hidden p-4 space-y-4">
					{processedData.map((item, index) => {
						const isSelected = selectedRowIds.includes(item.id);
						return (
							<Card
								key={item.id}
								className={`${ROW_ENTER} slide-in-from-bottom-5 ${
									isSelected
										? "bg-primary/5 dark:bg-primary/10 border-primary/20"
										: ""
								} ${rowClassName?.(item) || ""}`}
								style={{ animationDelay: rowEnterDelay(index) }}
								onClick={() => onRowClick?.(item)}
							>
								<CardHeader className="pb-3">
									<div className="flex min-w-0 items-start justify-between gap-4">
										{showCheckbox && (
											<div className="pt-1">
												<Checkbox
													checked={isSelected}
													onCheckedChange={(checked) => {
														onCheckboxChange?.(item.id, checked as boolean);
													}}
													onClick={(e) => e.stopPropagation()}
												/>
											</div>
										)}
										{/* `min-w-0`: sin él un título largo (un nombre de archivo) no
										    puede truncarse y empuja las acciones fuera de la tarjeta. */}
										<div className="min-w-0 flex-1">
											<CardTitle className="text-base">
												{mobileCard.title(item)}
											</CardTitle>
											{mobileCard.description && (
												<CardDescription className="text-xs mt-1">
													{mobileCard.description(item)}
												</CardDescription>
											)}
										</div>
										{actions && actions.length > 0 && (
											<div className="flex gap-1 shrink-0">
												{actions.map((action) => {
													if (action.show && !action.show(item)) return null;

													const Icon = action.getIcon
														? action.getIcon(item)
														: action.icon;
													const label =
														typeof action.label === "function"
															? action.label(item)
															: action.label;

													if (!Icon) return null;

													const isDisabled = action.disabled?.(item);
													return (
														<button
															key={label}
															type="button"
															disabled={isDisabled}
															onClick={() => action.onClick(item)}
															className={`p-2 rounded-lg transition-colors ${
																isDisabled
																	? "text-muted-foreground/50 cursor-not-allowed"
																	: action.variant === "danger"
																		? "text-muted-foreground hover:text-destructive"
																		: "text-muted-foreground hover:text-foreground"
															}`}
														>
															<Icon className="h-4 w-4" />
															<span className="sr-only">{label}</span>
														</button>
													);
												})}
											</div>
										)}
									</div>
								</CardHeader>
								{mobileCard.content && (
									<CardContent className="pt-0">
										{mobileCard.content(item)}
									</CardContent>
								)}
							</Card>
						);
					})}
				</div>
			)}

			<div className="border-t border-border px-4 py-3 sm:px-6">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
					<div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full sm:w-auto">
						{pagination?.onPageSizeChange && (
							<div className="flex items-center gap-2">
								<span className="text-sm text-muted-foreground whitespace-nowrap">
									Mostrar
								</span>
								<Select
									value={pagination.pageSize.toString()}
									onValueChange={(value) =>
										pagination.onPageSizeChange?.(Number(value))
									}
								>
									<SelectTrigger size="sm" className="w-17.5">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="10">10</SelectItem>
										<SelectItem value="20">20</SelectItem>
										<SelectItem value="25">25</SelectItem>
										<SelectItem value="50">50</SelectItem>
									</SelectContent>
								</Select>
							</div>
						)}
						<div className="text-sm text-foreground text-center sm:text-left">
							{summary !== undefined ? (
								summary
							) : pagination ? (
								<>
									Mostrando{" "}
									<span className="font-medium">
										{(pagination.page - 1) * pagination.pageSize + 1}
									</span>{" "}
									-{" "}
									<span className="font-medium">
										{Math.min(
											pagination.page * pagination.pageSize,
											pagination.total,
										)}
									</span>{" "}
									de <span className="font-medium">{pagination.total}</span>{" "}
									resultados
								</>
							) : (
								<>
									Mostrando <span className="font-medium">1</span> -{" "}
									<span className="font-medium">{processedData.length}</span> de{" "}
									<span className="font-medium">{processedData.length}</span>{" "}
									resultados
								</>
							)}
						</div>
					</div>

					{pagination && (
						<>
							{/* Desktop Navigation */}
							<div className="hidden sm:flex items-center gap-1">
								<Button
									variant="outline"
									size="icon"
									className="h-8 w-8"
									onClick={() => pagination.onPageChange(1)}
									disabled={pagination.page === 1}
								>
									<ChevronsLeft className="h-4 w-4" />
									<span className="sr-only">Primera página</span>
								</Button>
								<Button
									variant="outline"
									size="icon"
									className="h-8 w-8"
									onClick={() => pagination.onPageChange(pagination.page - 1)}
									disabled={pagination.page === 1}
								>
									<ChevronLeft className="h-4 w-4" />
									<span className="sr-only">Anterior</span>
								</Button>
								<Button
									variant="outline"
									size="icon"
									className="h-8 w-8"
									onClick={() => pagination.onPageChange(pagination.page + 1)}
									disabled={
										pagination.page >=
										(pagination.pageCount ||
											Math.ceil(pagination.total / pagination.pageSize))
									}
								>
									<ChevronRight className="h-4 w-4" />
									<span className="sr-only">Siguiente</span>
								</Button>
								<Button
									variant="outline"
									size="icon"
									className="h-8 w-8"
									onClick={() =>
										pagination.onPageChange(
											pagination.pageCount ||
												Math.ceil(pagination.total / pagination.pageSize),
										)
									}
									disabled={
										pagination.page >=
										(pagination.pageCount ||
											Math.ceil(pagination.total / pagination.pageSize))
									}
								>
									<ChevronsRight className="h-4 w-4" />
									<span className="sr-only">Última página</span>
								</Button>
							</div>

							{/* Mobile Navigation */}
							<div className="flex sm:hidden items-center justify-between w-full mt-2">
								<Button
									variant="outline"
									size="icon"
									className="h-8 w-8"
									onClick={() => pagination.onPageChange(pagination.page - 1)}
									disabled={pagination.page === 1}
								>
									<ChevronLeft className="h-4 w-4" />
									<span className="sr-only">Página anterior</span>
								</Button>
								<span className="text-sm font-medium">
									{pagination.page} /{" "}
									{pagination.pageCount ||
										Math.ceil(pagination.total / pagination.pageSize)}
								</span>
								<Button
									variant="outline"
									size="icon"
									className="h-8 w-8"
									onClick={() => pagination.onPageChange(pagination.page + 1)}
									disabled={
										pagination.page >=
										(pagination.pageCount ||
											Math.ceil(pagination.total / pagination.pageSize))
									}
								>
									<ChevronRight className="h-4 w-4" />
									<span className="sr-only">Página siguiente</span>
								</Button>
							</div>
						</>
					)}
				</div>
			</div>
		</>
	);
}

// Export default actions for common use cases
export const defaultActions = {
	edit: <T extends { id: string }>(
		onClick: (item: T) => void,
	): DataTableAction<T> => ({
		icon: Pencil,
		label: "Editar",
		onClick,
		variant: "default",
	}),
	view: <T extends { id: string }>(
		onClick: (item: T) => void,
	): DataTableAction<T> => ({
		icon: Eye,
		label: "Ver detalles",
		onClick,
		variant: "default",
	}),
	delete: <T extends { id: string }>(
		onClick: (item: T) => void,
	): DataTableAction<T> => ({
		icon: Trash2,
		label: "Eliminar",
		onClick,
		variant: "danger",
	}),
};
