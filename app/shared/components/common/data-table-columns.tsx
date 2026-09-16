import type { Column } from "./data-table";
import { TruncatedText } from "./truncated-text";

/**
 * Helper functions to create common column types
 */

export const columnHelpers = {
	/**
	 * Creates a text column
	 */
	text: <T,>(
		key: string,
		label: string,
		options?: {
			sortable?: boolean;
			className?: string;
			mobileHidden?: boolean;
		},
	): Column<T> => ({
		key,
		label,
		sortable: options?.sortable,
		className: options?.className,
		mobileHidden: options?.mobileHidden,
		render: (item) => (
			<div className="text-sm font-medium text-foreground">
				{String((item as Record<string, unknown>)[key] || "-")}
			</div>
		),
	}),

	/**
	 * Creates a truncated text column
	 */
	truncatedText: <T,>(
		key: string,
		label: string,
		maxLength: number = 60,
		options?: {
			sortable?: boolean;
			className?: string;
			mobileHidden?: boolean;
		},
	): Column<T> => ({
		key,
		label,
		sortable: options?.sortable,
		className: options?.className,
		mobileHidden: options?.mobileHidden,
		render: (item) => (
			<div className="text-sm text-foreground max-w-xs">
				<TruncatedText
					text={String((item as Record<string, unknown>)[key] || "")}
					maxLength={maxLength}
				/>
			</div>
		),
	}),

	/**
	 * Creates a badge/tag column (like for SCIAN codes)
	 */
	badge: <T,>(
		key: string,
		label: string,
		options?: {
			sortable?: boolean;
			className?: string;
			mobileHidden?: boolean;
			variant?: "primary" | "secondary" | "success" | "warning" | "danger";
		},
	): Column<T> => {
		const variantClasses = {
			primary: "bg-primary text-primary-foreground",
			secondary: "bg-secondary text-secondary-foreground",
			// Tokens, no paleta cruda: el alfa que antes traía el `/20` de la
			// variante oscura vive ahora dentro del propio token (theme.config.ts),
			// así que el tema del builder podrá redefinir estos colores igual que
			// redefine primary o destructive.
			success: "bg-success text-success-foreground",
			warning: "bg-warning text-warning-foreground",
			danger: "bg-destructive/10 dark:bg-destructive/20 text-destructive",
		};

		return {
			key,
			label,
			sortable: options?.sortable,
			className: `whitespace-nowrap ${options?.className || ""}`,
			mobileHidden: options?.mobileHidden,
			render: (item) => (
				<span
					className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${
						variantClasses[options?.variant || "primary"]
					}`}
				>
					{String((item as Record<string, unknown>)[key] || "-")}
				</span>
			),
		};
	},

	/**
	 * Creates a date column
	 */
	date: <T,>(
		key: string,
		label: string,
		options?: {
			sortable?: boolean;
			className?: string;
			mobileHidden?: boolean;
			format?: Intl.DateTimeFormatOptions;
		},
	): Column<T> => ({
		key,
		label,
		sortable: options?.sortable,
		className: `whitespace-nowrap ${options?.className || ""}`,
		mobileHidden: options?.mobileHidden,
		render: (item) => {
			const value = (item as Record<string, unknown>)[key];
			if (!value) return "-";

			const date = value instanceof Date ? value : new Date(String(value));
			return (
				<span className="text-sm text-muted-foreground">
					{date.toLocaleDateString(
						"es-MX",
						options?.format || {
							year: "numeric",
							month: "short",
							day: "numeric",
						},
					)}
				</span>
			);
		},
	}),

	/**
	 * Creates a pill/rounded badge column (like for categories)
	 */
	pill: <T,>(
		key: string,
		label: string,
		options?: {
			sortable?: boolean;
			className?: string;
			mobileHidden?: boolean;
			color?: string;
		},
	): Column<T> => ({
		key,
		label,
		sortable: options?.sortable,
		className: `whitespace-nowrap ${options?.className || ""}`,
		mobileHidden: options?.mobileHidden,
		render: (item) => (
			<span
				className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
					options?.color || "bg-accent text-accent-foreground"
				}`}
			>
				{String((item as Record<string, unknown>)[key] || "-")}
			</span>
		),
	}),

	/**
	 * Creates a simple label column (no special styling)
	 */
	label: <T,>(
		key: string,
		label: string,
		options?: {
			sortable?: boolean;
			className?: string;
			mobileHidden?: boolean;
		},
	): Column<T> => ({
		key,
		label,
		sortable: options?.sortable,
		className: `whitespace-nowrap ${options?.className || ""}`,
		mobileHidden: options?.mobileHidden,
		render: (item) => (
			<div className="text-sm text-foreground max-w-50 truncate">
				{String((item as Record<string, unknown>)[key] || "-")}
			</div>
		),
	}),

	/**
	 * Creates a custom column with full control
	 */
	custom: <T,>(
		key: string,
		label: string,
		render: (item: T) => React.ReactNode,
		options?: {
			sortable?: boolean;
			className?: string;
			mobileHidden?: boolean;
		},
	): Column<T> => ({
		key,
		label,
		sortable: options?.sortable,
		className: options?.className,
		mobileHidden: options?.mobileHidden,
		render,
	}),
};
