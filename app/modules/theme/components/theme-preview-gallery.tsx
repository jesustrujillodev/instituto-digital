import {
	Bell,
	FileText,
	GalleryVerticalEnd,
	Home,
	Settings,
	Users,
} from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/shared/components/ui/command";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Separator } from "@/shared/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";

const ROWS = [
	{ name: "Ana Ruiz", role: "ADMIN", state: "Activa" },
	{ name: "Beto Salas", role: "USER", state: "Pendiente" },
	{ name: "Cris Vela", role: "USER", state: "Archivada" },
];

const SIDEBAR_ITEMS = [
	{ label: "Resumen", Icon: Home, active: true },
	{ label: "Usuarios", Icon: Users, active: false },
	{ label: "Documentos", Icon: FileText, active: false },
	{ label: "Ajustes", Icon: Settings, active: false },
];

/**
 * Componentes shadcn REALES con el tema en edición aplicado.
 *
 * Reales y no maquetas: son los mismos que usa la aplicación, así que un token
 * que rompe un botón o un input aquí lo rompe también en producción. Un swatch
 * de color no habría enseñado nada de eso — el problema casi nunca es el color
 * suelto, sino el color puesto encima de otro.
 *
 * El preview de verdad no es esta caja, sino el `<style>` que reescribe el
 * documento entero (ver use-theme-draft.ts): el sidebar y la cabecera de la
 * aplicación cambian a la vez que esto. La galería está para juzgar de un
 * vistazo lo que no cabe en la pantalla actual.
 */
export function ThemePreviewGallery() {
	return (
		<div className="flex flex-col gap-4">
			<section className="flex flex-wrap items-center gap-2">
				<Button>Primario</Button>
				<Button variant="secondary">Secundario</Button>
				<Button variant="outline">Contorno</Button>
				<Button variant="ghost">Fantasma</Button>
				<Button variant="destructive">Destructivo</Button>
				<Button variant="link">Enlace</Button>
				<Button disabled>Deshabilitado</Button>
			</section>

			<section className="flex flex-wrap items-center gap-2">
				<Badge>Por defecto</Badge>
				<Badge variant="secondary">Secundaria</Badge>
				<Badge variant="outline">Contorno</Badge>
				<Badge variant="destructive">Destructiva</Badge>
				<Badge className="bg-success text-success-foreground">Éxito</Badge>
				<Badge className="bg-warning text-warning-foreground">Aviso</Badge>
			</section>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Formulario</CardTitle>
						<CardDescription>
							Campos, foco y estados con los tokens actuales.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="preview-email">Correo</Label>
							<Input id="preview-email" placeholder="persona@ejemplo.com" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="preview-notes">Notas</Label>
							<Textarea id="preview-notes" placeholder="Escribe aquí…" />
						</div>
						<Label className="gap-2">
							<Checkbox defaultChecked />
							Recibir avisos
						</Label>
					</CardContent>
					<CardFooter className="gap-2">
						<Button size="sm">Guardar</Button>
						<Button size="sm" variant="ghost">
							Cancelar
						</Button>
					</CardFooter>
				</Card>

				{/* Sidebar en miniatura: es la superficie con más tokens propios
				    (sidebar, sidebar-accent, sidebar-border) y la que peor se juzga
				    mirando solo los swatches. */}
				<Card className="overflow-hidden p-0">
					<div className="flex min-h-56">
						<nav className="w-40 shrink-0 border-r border-sidebar-border bg-sidebar p-2 text-sidebar-foreground">
							{/* La marca es el ÚNICO sitio donde la aplicación usa
							    `sidebar-primary` (ver dashboard-sidebar.tsx). Sin ella, dos
							    tokens del tema no se veían en ninguna parte del preview. */}
							<div className="flex items-center gap-2 px-1 py-1">
								<span className="flex aspect-square size-6 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
									<GalleryVerticalEnd className="size-3.5" />
								</span>
								<span className="truncate text-xs font-semibold">
									Plataforma
								</span>
							</div>
							<ul className="mt-1 flex flex-col gap-0.5">
								{SIDEBAR_ITEMS.map(({ label, Icon, active }) => (
									<li key={label}>
										<span
											className={
												active
													? "flex items-center gap-2 rounded-md bg-sidebar-accent px-2 py-1.5 text-xs text-sidebar-accent-foreground"
													: "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
											}
										>
											<Icon className="size-3.5" />
											{label}
										</span>
									</li>
								))}
							</ul>
						</nav>

						<div className="flex-1 p-3">
							<div className="flex items-center justify-between">
								<p className="text-sm font-medium">Panel</p>
								<Bell className="size-4 text-muted-foreground" />
							</div>
							<Separator className="my-2" />
							<div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
								Bloque `muted` con texto `muted-foreground`.
							</div>
							<div className="mt-2 rounded-md bg-accent p-3 text-xs text-accent-foreground shadow-md">
								Bloque `accent` con sombra `shadow-md`.
							</div>
						</div>
					</div>
				</Card>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				{/* Las cuatro familias a la vez: es la única forma de ver si el titular
				    y el cuerpo se distinguen, y el único sitio donde la serif —que la
				    interfaz reserva para contenido editorial— enseña lo que se eligió. */}
				<Card>
					<CardHeader>
						<CardTitle>Tipografía</CardTitle>
						<CardDescription>
							Las cuatro familias del tema, en su papel.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<p className="font-heading text-2xl font-semibold">
							Titulares en 2xl
						</p>
						<p className="text-sm">
							Texto de cuerpo: la familia que lee toda la interfaz y la que
							decide si una tabla de cuarenta filas se repasa de un vistazo.
						</p>
						<p className="font-serif text-base">
							Serif, para contenido editorial: la utilidad{" "}
							<span className="font-mono text-xs">font-serif</span> sale de este
							tema.
						</p>
						<p className="font-mono text-xs tabular-nums">
							1HGCM82633A004352 · oklch(0.62 0.19 259)
						</p>
					</CardContent>
				</Card>

				{/* Superficie `popover`: selects, desplegables y la paleta de comandos
				    se pintan con sus propios tokens, y ninguno se veía aquí porque
				    todos viven en un portal que solo existe al abrirlos. `Command` es
				    el mismo componente de la paleta, montado en línea. */}
				<Card>
					<CardHeader>
						<CardTitle>Menú</CardTitle>
						<CardDescription>
							La superficie popover, sobre el fondo de la tarjeta.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Command className="border">
							<CommandInput placeholder="Buscar…" />
							<CommandList>
								<CommandGroup heading="Ir a">
									<CommandItem>
										<Home />
										Resumen
									</CommandItem>
									<CommandItem>
										<Users />
										Usuarios
									</CommandItem>
									<CommandItem>
										<Settings />
										Ajustes
									</CommandItem>
								</CommandGroup>
							</CommandList>
						</Command>
					</CardContent>
				</Card>
			</div>

			<section className="flex flex-wrap items-end gap-4">
				<Tabs defaultValue="resumen">
					<TabsList>
						<TabsTrigger value="resumen">Resumen</TabsTrigger>
						<TabsTrigger value="unidades">Unidades</TabsTrigger>
						<TabsTrigger value="ajustes">Ajustes</TabsTrigger>
					</TabsList>
				</Tabs>

				{/*
				 * El anillo de foco, pintado a mano.
				 *
				 * Son literalmente las clases que `focus-visible:` aplica en Input y
				 * Button; puestas fijas porque una galería no tiene el foco y `ring`
				 * es el token que WCAG 1.4.11 mide contra el fondo. Sin esto había que
				 * creerse el número del panel de contraste sin poder mirarlo.
				 */}
				<div className="flex min-w-48 flex-1 flex-col gap-1.5">
					<Label htmlFor="preview-ring">Foco</Label>
					<Input
						id="preview-ring"
						readOnly
						defaultValue="Anillo de foco"
						className="border-ring ring-3 ring-ring/50"
					/>
				</div>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Tabla</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Nombre</TableHead>
								<TableHead>Rol</TableHead>
								<TableHead>Estado</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{ROWS.map((row) => (
								<TableRow key={row.name}>
									<TableCell>{row.name}</TableCell>
									<TableCell>
										<Badge variant="outline">{row.role}</Badge>
									</TableCell>
									<TableCell>
										<Badge
											className={
												row.state === "Activa"
													? "bg-success text-success-foreground"
													: row.state === "Pendiente"
														? "bg-warning text-warning-foreground"
														: "bg-muted text-muted-foreground"
											}
										>
											{row.state}
										</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<section className="grid grid-cols-5 gap-2">
				{(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const).map(
					(token) => (
						<div key={token} className="flex flex-col gap-1">
							<span
								className="h-12 rounded-md border"
								style={{ backgroundColor: `var(--${token})` }}
							/>
							{/* `text-xs` y no `text-[10px]`: un tamaño arbitrario en px se
							    queda fuera de la escala del tema, así que era la única
							    etiqueta de la pantalla que no obedecía al tamaño base. */}
							<span className="truncate text-center text-xs text-muted-foreground">
								{token}
							</span>
						</div>
					),
				)}
			</section>
		</div>
	);
}
