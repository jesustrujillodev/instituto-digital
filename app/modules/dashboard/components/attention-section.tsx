import {
	CalendarClock,
	CircleCheck,
	ClipboardCheck,
	type LucideIcon,
	Mail,
	PencilLine,
	UserX,
} from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate, formatZonedDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { MONTH_LABELS } from "@/modules/annual-plan/utils/plan-labels";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import type {
	AttentionItem,
	AttentionKind,
	DashboardAttention,
} from "../domain/dashboard.types";
import { agoPhrase } from "../utils/dashboard-dates";
import { AttentionCard, AttentionChip } from "./attention-card";
import { OverflowLink } from "./dashboard-list";
import { DashboardSection, EmptyNote } from "./dashboard-section";

/** Cuántos renglones enseña cada grupo antes de mandar a su pantalla. */
const ROWS_PER_GROUP = 3;

interface GroupSpec {
	title: string;
	hint: string;
	chip: string;
	icon: LucideIcon;
	tone: "warning" | "neutral";
	action: string;
	/** Hacia la lista completa; con el total cuando se conoce. */
	seeAll: (count: number | null) => { label: string; to: string };
}

const GROUPS: Record<AttentionKind, GroupSpec> = {
	pendingFinish: {
		title: "Por finalizar",
		hint: "Sus sesiones ya terminaron",
		chip: "Por finalizar",
		icon: ClipboardCheck,
		tone: "warning",
		action: "Finalizar",
		seeAll: (count) => ({
			label: count
				? `Ver los ${count} cursos por finalizar`
				: "Ver todos los cursos por finalizar",
			to: "/dashboard/imparticion",
		}),
	},
	invitation: {
		title: "Invitaciones por responder",
		hint: "Cierran pronto",
		chip: "Cierra pronto",
		icon: Mail,
		tone: "warning",
		action: "Responder",
		seeAll: (count) => ({
			label: count ? `Ver las ${count} invitaciones` : "Ver las invitaciones",
			to: "/dashboard/mis-capacitaciones",
		}),
	},
	withoutTrainer: {
		title: "Publicados sin capacitador",
		hint: "Su capacitador se desactivó",
		chip: "Sin capacitador",
		icon: UserX,
		tone: "warning",
		action: "Revisar",
		seeAll: () => ({
			label: "Ver los cursos publicados",
			to: "/dashboard/capacitaciones?status=PUBLISHED",
		}),
	},
	overdueLine: {
		title: "Líneas del plan atrasadas",
		hint: "Ya deberían tener capacitación",
		chip: "Atrasada",
		icon: CalendarClock,
		tone: "warning",
		action: "Crear curso",
		seeAll: () => ({ label: "Ver el plan anual", to: "/dashboard/plan-anual" }),
	},
	draft: {
		title: "Borradores sin publicar",
		hint: "El más reciente primero",
		chip: "Borrador",
		icon: PencilLine,
		tone: "neutral",
		action: "Continuar",
		seeAll: (count) => ({
			label: count ? `Ver los ${count} borradores` : "Ver todos los borradores",
			to: "/dashboard/capacitaciones?status=DRAFT",
		}),
	},
};

const ORDER: AttentionKind[] = [
	"pendingFinish",
	"invitation",
	"withoutTrainer",
	"overdueLine",
	"draft",
];

const metaOf = (item: AttentionItem, today: string): string => {
	switch (item.kind) {
		case "pendingFinish": {
			const ended = new Date(item.lastSessionEndsAt);
			return `Terminó el ${formatZonedDate(ended)} · ${agoPhrase(ended, today)}`;
		}
		case "invitation":
			return item.closesAt
				? `Responde antes del ${formatZonedDateTime(new Date(item.closesAt))}`
				: "Te invitaron a esta capacitación.";
		case "withoutTrainer":
			return "Asigna otro capacitador antes de su próxima sesión.";
		case "overdueLine":
			return `Planeada para ${MONTH_LABELS[item.plannedMonth].toLowerCase()}`;
		case "draft": {
			const edited = new Date(item.updatedAt);
			return `Editado el ${formatZonedDate(edited)} · ${agoPhrase(edited, today)}`;
		}
	}
};

const keyOf = (item: AttentionItem) =>
	item.kind === "overdueLine"
		? `${item.kind}-${item.lineDocumentId}`
		: `${item.kind}-${item.courseDocumentId}`;

/** Los pendientes de un tipo, cuántos son y si la lectura se recortó. */
const groupsOf = (attention: DashboardAttention) =>
	ORDER.map((kind) => ({
		kind,
		items: attention.items.filter((item) => item.kind === kind),
		more: kind === "invitation" ? false : attention.more[kind],
	})).filter((group) => group.items.length > 0);

function AttentionRow({
	item,
	spec,
	today,
}: {
	item: AttentionItem;
	spec: GroupSpec;
	today: string;
}) {
	const Icon = spec.icon;
	// Una línea del plan aún no tiene curso: su título no lleva a ninguna parte.
	const titleHref = item.kind === "overdueLine" ? null : item.href;

	return (
		<li className="flex flex-col gap-3 px-5 py-3.5 @md:flex-row @md:items-center @md:gap-4">
			<div className="flex min-w-0 flex-1 items-start gap-3">
				<span
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded-lg",
						spec.tone === "warning"
							? "bg-warning text-warning-foreground"
							: "bg-muted text-muted-foreground",
					)}
				>
					<Icon className="size-4" aria-hidden="true" />
				</span>
				<div className="flex min-w-0 flex-col gap-0.5">
					{titleHref ? (
						<Link
							to={titleHref}
							className="line-clamp-2 rounded-sm font-medium text-foreground text-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
						>
							{item.title}
						</Link>
					) : (
						<p className="line-clamp-2 font-medium text-foreground text-sm">
							{item.title}
						</p>
					)}
					<p className="text-muted-foreground text-xs tabular-nums">
						{metaOf(item, today)}
					</p>
				</div>
			</div>
			<Button
				asChild
				size="sm"
				variant="outline"
				className="w-full shrink-0 @md:w-auto"
			>
				<Link to={item.href}>{spec.action}</Link>
			</Button>
		</li>
	);
}

/** Lo que espera una decisión de quien cursa, imparte u organiza, por tipo. */
export function AttentionSection({
	attention,
	today,
}: {
	attention: DashboardAttention;
	today: string;
}) {
	const groups = groupsOf(attention);
	const count = attention.items.length;

	return (
		<DashboardSection
			title="Requiere tu atención"
			count={{
				value: count,
				noun: ["pendiente", "pendientes"],
				tone: "warning",
				more: groups.some((group) => group.more),
			}}
		>
			{count === 0 ? (
				<EmptyNote icon={CircleCheck} tone="success">
					Nada pendiente: todo lo que depende de ti está al día.
				</EmptyNote>
			) : (
				<Card className="@container gap-0 divide-y py-0">
					{groups.map(({ kind, items, more }) => {
						const spec = GROUPS[kind];
						const hidden = items.length > ROWS_PER_GROUP;
						const seeAll = spec.seeAll(more ? null : items.length);

						return (
							<section
								key={kind}
								aria-label={spec.title}
								className="flex flex-col"
							>
								<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 pt-4 pb-1.5">
									<h3 className="font-semibold text-foreground text-sm">
										{spec.title}
										<span className="font-normal text-muted-foreground tabular-nums">
											{" · "}
											{items.length}
											{more && "+"}
										</span>
									</h3>
									<p className="text-muted-foreground text-xs">{spec.hint}</p>
								</div>
								<ul className="flex flex-col divide-y">
									{items.slice(0, ROWS_PER_GROUP).map((item) => (
										<AttentionRow
											key={keyOf(item)}
											item={item}
											spec={spec}
											today={today}
										/>
									))}
								</ul>
								{(hidden || more) && (
									<div className="border-t px-5 py-3">
										<OverflowLink label={seeAll.label} to={seeAll.to} />
									</div>
								)}
							</section>
						);
					})}
				</Card>
			)}
		</DashboardSection>
	);
}

/** Lo propio del superadministrador que además imparte, como tarjetas detrás de las suyas. */
export function PersonalAttentionCards({
	attention,
	today,
}: {
	attention: DashboardAttention;
	today: string;
}) {
	return attention.items.map((item) => {
		const spec = GROUPS[item.kind];
		return (
			<AttentionCard
				key={keyOf(item)}
				icon={spec.icon}
				title={item.title}
				titleHref={item.kind === "overdueLine" ? undefined : item.href}
				chips={<AttentionChip>{spec.chip}</AttentionChip>}
				description={metaOf(item, today)}
				action={{ label: spec.action, to: item.href }}
			/>
		);
	});
}

/** «Ver todos» de cada lista propia que llegó recortada. */
export function PersonalAttentionMore({
	attention,
}: {
	attention: DashboardAttention;
}) {
	const links = groupsOf(attention).filter((group) => group.more);
	if (links.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1">
			{links.map(({ kind }) => {
				const { label, to } = GROUPS[kind].seeAll(null);
				return <OverflowLink key={kind} label={label} to={to} />;
			})}
		</div>
	);
}
