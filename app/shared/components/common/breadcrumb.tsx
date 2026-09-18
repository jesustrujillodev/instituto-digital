import { Link } from "react-router";
import { truncateText } from "@/lib/string-utils";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
	label: string;
	path?: string;
}

interface BreadcrumbProps {
	items?: BreadcrumbItem[];
	className?: string;
	/** Maximum characters before truncation (default: 35) */
	maxLabelLength?: number;
}

export function Breadcrumb({
	items = [],
	className,
	maxLabelLength = 35,
}: BreadcrumbProps) {
	return (
		// Una sola línea: vive en el header del dashboard, de altura fija, así que
		// envolver lo desbordaría. El último item trunca en su lugar.
		<div className={cn("flex flex-nowrap items-center gap-3", className)}>
			<nav aria-label="Breadcrumb" className="min-w-0 flex-1">
				<ol className="flex flex-nowrap items-center gap-1.5">
					{/* Home link */}
					<li className={cn("shrink-0", items.length > 1 && "hidden sm:block")}>
						<Link
							to="/dashboard"
							className="text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							Dashboard
						</Link>
					</li>

					{/* Dynamic breadcrumb items */}
					{items.map((item, index) => {
						const isLast = index === items.length - 1;
						const isParent = index === items.length - 2;
						const displayLabel = truncateText(item.label, maxLabelLength);

						return (
							<li
								key={item.path ?? item.label}
								className={cn(
									"flex items-center gap-1.5",
									isLast && "min-w-0 flex-1",
									// En móvil no cabe el rastro entero: queda el padre, que
									// trunca, y la hoja. Los anteriores vuelven desde `md`.
									isParent && "min-w-0 shrink",
									!isLast && !isParent && "hidden shrink-0 md:flex",
								)}
							>
								{/* Chevron separator — always visible, never clipped */}
								<svg
									aria-hidden="true"
									className={cn(
										"stroke-current shrink-0 text-muted-foreground",
										// Sin "Dashboard" delante, la flecha del padre quedaría suelta.
										isParent && "max-sm:hidden",
									)}
									width="17"
									height="16"
									viewBox="0 0 17 16"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path
										d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
										strokeWidth="1.2"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>

								{item.path && !isLast ? (
									<Link
										to={item.path}
										className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate min-w-0"
										title={item.label}
									>
										{displayLabel}
									</Link>
								) : (
									<span
										className="text-sm text-foreground truncate min-w-0"
										title={item.label}
									>
										{displayLabel}
									</span>
								)}
							</li>
						);
					})}
				</ol>
			</nav>
		</div>
	);
}
