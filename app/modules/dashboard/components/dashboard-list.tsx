import { Link } from "react-router";

/** «y N más →» al pie de una lista recortada, o el rótulo que se le dé. */
export function OverflowLink({
	count = 0,
	label,
	to,
}: {
	count?: number;
	label?: string;
	to: string;
}) {
	if (!label && count <= 0) return null;

	return (
		<Link
			to={to}
			className="self-start rounded-sm text-muted-foreground text-xs underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
		>
			{label ?? `y ${count} más`} →
		</Link>
	);
}
