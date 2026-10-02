export { action } from "./index.action";
export { loader } from "./index.loader";

import { Archive, ArchiveRestore, ImageUp, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { useFetcher } from "react-router";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/shared/components/common/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import type { LogoOption } from "../../domain/certificate.types";
import { INSTITUTIONAL_LOGO } from "../../domain/certificate-logo.rules";
import { LOGO_INTENTS, type LogoActionData } from "../../utils/logo-form";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [{ label: "Logos institucionales" }],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta() {
	return [{ title: "Logos institucionales" }];
}

const ACCEPT = "image/png,image/webp,image/svg+xml";

function LogoCard({ logo }: { logo: LogoOption }) {
	const fetcher = useFetcher<LogoActionData>();
	useFetcherToast(fetcher);
	const input = useRef<HTMLInputElement>(null);
	const [dark, setDark] = useState(true);
	const busy = fetcher.state !== "idle";

	return (
		<li
			className={cn(
				"flex flex-col overflow-hidden rounded-lg border bg-card",
				logo.archived && "opacity-70",
			)}
		>
			<button
				type="button"
				title="Cambiar el fondo de la vista previa"
				onClick={() => setDark((value) => !value)}
				className={cn(
					"flex h-32 items-center justify-center p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring",
					dark
						? "bg-[#750d2f]"
						: "bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]",
				)}
			>
				<img
					src={logo.url}
					alt={logo.name}
					className="max-h-full max-w-full object-contain"
				/>
			</button>
			<div className="flex flex-1 flex-col gap-2 p-3">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">{logo.name}</p>
						<p className="text-muted-foreground text-xs">
							{logo.widthPx} × {logo.heightPx} px
						</p>
					</div>
					{logo.builtin ? (
						<Badge variant="secondary">Integrado</Badge>
					) : logo.archived ? (
						<Badge variant="outline">Archivado</Badge>
					) : null}
				</div>
				{!logo.builtin && (
					<div className="mt-auto flex gap-2">
						{!logo.archived && (
							<Button
								variant="outline"
								size="sm"
								disabled={busy}
								onClick={() => input.current?.click()}
							>
								<RefreshCw aria-hidden="true" />
								Reemplazar
							</Button>
						)}
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={() =>
								fetcher.submit(
									{
										intent: LOGO_INTENTS.archive,
										documentId: logo.id,
										archived: String(!logo.archived),
									},
									{ method: "post" },
								)
							}
						>
							{logo.archived ? (
								<ArchiveRestore aria-hidden="true" />
							) : (
								<Archive aria-hidden="true" />
							)}
							{logo.archived ? "Restaurar" : "Archivar"}
						</Button>
						<input
							ref={input}
							type="file"
							accept={ACCEPT}
							className="sr-only"
							tabIndex={-1}
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = "";
								if (!file) return;
								const form = new FormData();
								form.set("intent", LOGO_INTENTS.replace);
								form.set("documentId", logo.id);
								form.set("file", file);
								fetcher.submit(form, {
									method: "post",
									encType: "multipart/form-data",
								});
							}}
						/>
					</div>
				)}
			</div>
		</li>
	);
}

function UploadForm() {
	const fetcher = useFetcher<LogoActionData>();
	useFetcherToast(fetcher);
	const [name, setName] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const busy = fetcher.state !== "idle";

	return (
		<form
			className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (!file) return;
				const form = new FormData();
				form.set("intent", LOGO_INTENTS.upload);
				form.set("name", name);
				form.set("file", file);
				fetcher.submit(form, {
					method: "post",
					encType: "multipart/form-data",
				});
				setName("");
				setFile(null);
				event.currentTarget.reset();
			}}
		>
			<div className="flex min-w-56 flex-1 flex-col gap-1.5">
				<Label htmlFor="logo-name">Nombre</Label>
				<Input
					id="logo-name"
					value={name}
					maxLength={INSTITUTIONAL_LOGO.nameMax}
					placeholder="Por ejemplo, «Escudo a color»"
					onChange={(event) => setName(event.target.value)}
					required
				/>
			</div>
			<div className="flex min-w-56 flex-1 flex-col gap-1.5">
				<Label htmlFor="logo-file">Archivo</Label>
				<Input
					id="logo-file"
					type="file"
					accept={ACCEPT}
					onChange={(event) => setFile(event.target.files?.[0] ?? null)}
					required
				/>
			</div>
			<Button type="submit" pending={busy} disabled={!file || !name.trim()}>
				<ImageUp aria-hidden="true" />
				Subir logo
			</Button>
			<p className="w-full text-muted-foreground text-xs">
				PNG, WEBP o SVG de hasta 2 MB, idealmente con fondo transparente. Un
				logo no se borra: reemplazarlo crea uno nuevo y los certificados ya
				emitidos conservan el anterior.
			</p>
		</form>
	);
}

export default function InstitutionalLogosPage({
	loaderData,
}: Route.ComponentProps) {
	const { logos } = loaderData.data;

	return (
		<div className="flex flex-col gap-4 pb-10">
			<PageHeader
				title="Logos institucionales"
				description="Los logos que se pueden colocar en los certificados."
			/>
			<UploadForm />
			<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{logos.map((logo) => (
					<LogoCard key={logo.id} logo={logo} />
				))}
			</ul>
		</div>
	);
}
