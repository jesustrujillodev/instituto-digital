import { Download, ExternalLink, Lock } from "lucide-react";
import { formatZonedDate, formatZonedTime } from "@/lib/date-utils";
import type { ParticipantSessionMaterial } from "../domain/session-material.types";
import {
	SESSION_MATERIAL_ICONS,
	sessionMaterialMetaOf,
} from "./session-material-sheet";

/** El material de una sesión tal como lo ve el participante. */
export function SessionMaterialList({
	materials,
}: {
	materials: readonly ParticipantSessionMaterial[];
}) {
	if (materials.length === 0) return null;

	return (
		<ul className="flex flex-col gap-1.5 pt-1">
			{materials.map((material) => {
				const Icon = SESSION_MATERIAL_ICONS[material.type];

				if (material.state === "locked") {
					const at = new Date(material.availableAt);

					return (
						<li
							key={material.documentId}
							className="flex items-center gap-2 text-muted-foreground text-xs"
						>
							<Lock className="size-3.5 shrink-0" aria-hidden="true" />
							<span className="truncate">{material.title}</span>
							<span className="shrink-0">
								· disponible el {formatZonedDate(at)}, {formatZonedTime(at)}
							</span>
						</li>
					);
				}

				const href =
					material.type === "LINK" ? material.externalUrl : material.fileUrl;

				return (
					<li
						key={material.documentId}
						className="flex items-center gap-2 text-xs"
					>
						<Icon
							className="size-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						{href ? (
							<a
								href={href}
								target="_blank"
								rel="noreferrer"
								className="flex min-w-0 items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
							>
								<span className="truncate">{material.title}</span>
								<ExternalLink className="size-3 shrink-0" aria-hidden="true" />
							</a>
						) : (
							<span className="truncate">{material.title}</span>
						)}
						<span className="shrink-0 text-muted-foreground">
							· {sessionMaterialMetaOf(material)}
						</span>
						{material.downloadUrl && (
							<a
								href={material.downloadUrl}
								className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
							>
								<Download className="size-3.5" aria-hidden="true" />
								<span className="sr-only sm:not-sr-only">Descargar</span>
							</a>
						)}
					</li>
				);
			})}
		</ul>
	);
}
