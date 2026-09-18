import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/shared/components/ui/pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";

/** Páginas a mostrar alrededor de la actual, sin contar los extremos. */
const WINDOW = 1;

/** Un número de página, o el salto que lo precede. */
type PageSlot = { key: string; page: number | null };

/**
 * Números visibles: primera, última, la actual con su ventana, y elipsis donde
 * se salta. Con pocas páginas no hay salto y se listan todas.
 *
 * Cada hueco se identifica por la página que abre, no por su posición: dos
 * elipsis son intercambiables a la vista pero no para React.
 */
const pagesFor = (page: number, pageCount: number): PageSlot[] => {
	const shown = new Set<number>([1, pageCount]);

	for (let offset = -WINDOW; offset <= WINDOW; offset++) {
		const candidate = page + offset;
		if (candidate >= 1 && candidate <= pageCount) shown.add(candidate);
	}

	const ordered = [...shown].sort((a, b) => a - b);

	return ordered.flatMap((value, index) => {
		const slot: PageSlot = { key: `page-${value}`, page: value };

		return index > 0 && value - ordered[index - 1] > 1
			? [{ key: `gap-${value}`, page: null }, slot]
			: [slot];
	});
};

interface ListPaginationProps {
	page: number;
	pageSize: number;
	pageCount: number;
	total: number;
	pageSizes: readonly number[];
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
}

export function ListPagination({
	page,
	pageSize,
	pageCount,
	total,
	pageSizes,
	onPageChange,
	onPageSizeChange,
}: ListPaginationProps) {
	const from = (page - 1) * pageSize + 1;
	const to = Math.min(page * pageSize, total);

	// `pointer-events-none` solo detiene al ratón: el ancla sigue en el orden de
	// tabulación y Enter dispara su click. Sin esta guarda, un teclado en la
	// primera página pide la página 0.
	const goTo = (next: number) => {
		if (next < 1 || next > pageCount || next === page) return;
		onPageChange(next);
	};

	return (
		<div className="flex flex-col items-center justify-between gap-4 border-t pt-4 sm:flex-row">
			<p className="text-muted-foreground text-sm">
				Mostrando{" "}
				<span className="font-medium text-foreground">
					{from}–{to}
				</span>{" "}
				de <span className="font-medium text-foreground">{total}</span>
			</p>

			{pageCount > 1 && (
				<Pagination className="mx-0 w-auto">
					<PaginationContent>
						<PaginationItem>
							<PaginationPrevious
								href="#"
								aria-disabled={page === 1}
								className={page === 1 ? "pointer-events-none opacity-50" : ""}
								onClick={(event) => {
									event.preventDefault();
									goTo(page - 1);
								}}
							/>
						</PaginationItem>

						{pagesFor(page, pageCount).map((slot) => (
							<PaginationItem key={slot.key}>
								{slot.page === null ? (
									<PaginationEllipsis />
								) : (
									<PaginationLink
										href="#"
										isActive={slot.page === page}
										onClick={(event) => {
											event.preventDefault();
											if (slot.page !== null) goTo(slot.page);
										}}
									>
										{slot.page}
									</PaginationLink>
								)}
							</PaginationItem>
						))}

						<PaginationItem>
							<PaginationNext
								href="#"
								aria-disabled={page === pageCount}
								className={
									page === pageCount ? "pointer-events-none opacity-50" : ""
								}
								onClick={(event) => {
									event.preventDefault();
									goTo(page + 1);
								}}
							/>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			)}

			<div className="flex items-center gap-2">
				<span className="whitespace-nowrap text-muted-foreground text-sm">
					Por página
				</span>
				<Select
					value={String(pageSize)}
					onValueChange={(value) => onPageSizeChange(Number(value))}
				>
					<SelectTrigger size="sm" className="w-20" aria-label="Por página">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{pageSizes.map((size) => (
							<SelectItem key={size} value={String(size)}>
								{size}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
