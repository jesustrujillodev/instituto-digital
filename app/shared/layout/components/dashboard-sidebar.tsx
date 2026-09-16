import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import type { SessionUser } from "@/shared/auth/session-user";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarRail,
	useSidebar,
} from "@/shared/components/ui/sidebar";
import {
	footerNavigationConfig,
	navigationSections,
} from "../navigation.config";
import type { NavItem } from "../navigation.types";
import {
	filterNavigationByRole,
	filterNavigationSections,
} from "../navigation.utils";

/**
 * `/dashboard` es prefijo de todas sus hijas, así que solo debe marcarse activo
 * en coincidencia exacta (semántica `end` de NavLink). El resto de rutas sí
 * aceptan sub-rutas.
 */
function isPathActive(pathname: string, path: string): boolean {
	if (path === "/dashboard") return pathname === path;
	return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * En móvil la barra es una hoja superpuesta: al elegir destino tiene que
 * cerrarse, o la página nueva carga debajo sin que se vea.
 */
function useCloseOnNavigate() {
	const { isMobile, setOpenMobile } = useSidebar();
	return () => {
		if (isMobile) setOpenMobile(false);
	};
}

function NavEntry({ item, pathname }: { item: NavItem; pathname: string }) {
	return item.children?.length ? (
		<NavGroup item={item} pathname={pathname} />
	) : (
		<NavLink item={item} pathname={pathname} />
	);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
	const Icon = item.icon;
	const closeOnNavigate = useCloseOnNavigate();
	const isActive = !!item.path && isPathActive(pathname, item.path);

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				asChild={Boolean(item.path)}
				tooltip={item.label}
				isActive={isActive}
				className="font-medium"
			>
				{item.path ? (
					<Link
						to={item.path}
						onClick={closeOnNavigate}
						aria-current={isActive ? "page" : undefined}
					>
						{Icon && <Icon />}
						<span>{item.label}</span>
					</Link>
				) : (
					<>
						{Icon && <Icon />}
						<span>{item.label}</span>
					</>
				)}
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

/**
 * Grupo con submenú, siguiendo el bloque `sidebar-07` de shadcn: `Collapsible`
 * con chevron y los hijos en `SidebarMenuSub`.
 *
 * Con la barra colapsada a iconos, `SidebarMenuSub` se oculta por CSS y un
 * grupo sin `path` quedaría inalcanzable; ahí el mismo botón abre un menú
 * lateral con los destinos. En móvil la barra nunca colapsa a iconos (es una
 * hoja), así que siempre usa el desplegable.
 */
function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
	const Icon = item.icon;
	const children = item.children ?? [];
	const { state, isMobile } = useSidebar();
	const closeOnNavigate = useCloseOnNavigate();

	const hasActiveChild = children.some(
		(child) => child.path && isPathActive(pathname, child.path),
	);

	// Abierto si se entra a uno de sus hijos —también desde fuera del sidebar,
	// con un enlace o el botón atrás—, pero cerrarlo a mano se respeta mientras
	// se siga dentro. Se ajusta en render, no en un efecto, para no pintar un
	// frame con el grupo cerrado.
	const [open, setOpen] = useState(hasActiveChild);
	const [wasActive, setWasActive] = useState(hasActiveChild);
	if (hasActiveChild !== wasActive) {
		setWasActive(hasActiveChild);
		if (hasActiveChild) setOpen(true);
	}

	const trigger = (
		<>
			{Icon && <Icon />}
			<span>{item.label}</span>
		</>
	);

	if (state === "collapsed" && !isMobile) {
		return (
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							tooltip={item.label}
							isActive={hasActiveChild}
							className="font-medium"
						>
							{trigger}
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="right" align="start" className="min-w-44">
						<DropdownMenuLabel>{item.label}</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{children.map((child) => {
							const isActive =
								!!child.path && isPathActive(pathname, child.path);
							return (
								<DropdownMenuItem key={child.path ?? child.label} asChild>
									<Link
										to={child.path ?? "#"}
										aria-current={isActive ? "page" : undefined}
										className={isActive ? "font-medium" : undefined}
									>
										{child.label}
									</Link>
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		);
	}

	return (
		<Collapsible
			asChild
			open={open}
			onOpenChange={setOpen}
			className="group/collapsible"
		>
			<SidebarMenuItem>
				<CollapsibleTrigger asChild>
					<SidebarMenuButton tooltip={item.label} className="font-medium">
						{trigger}
						<ChevronRight
							aria-hidden="true"
							className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
						/>
					</SidebarMenuButton>
				</CollapsibleTrigger>
				<CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
					<SidebarMenuSub>
						{children.map((child) => {
							const isActive =
								!!child.path && isPathActive(pathname, child.path);
							return (
								<SidebarMenuSubItem key={child.path ?? child.label}>
									<SidebarMenuSubButton asChild isActive={isActive}>
										<Link
											to={child.path ?? "#"}
											onClick={closeOnNavigate}
											aria-current={isActive ? "page" : undefined}
										>
											<span>{child.label}</span>
										</Link>
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							);
						})}
					</SidebarMenuSub>
				</CollapsibleContent>
			</SidebarMenuItem>
		</Collapsible>
	);
}

export function DashboardSidebar({ user }: { user: SessionUser }) {
	const { pathname } = useLocation();

	// Filtrado por rol = SOLO UX. La autorización real la impone requireRole en
	// el loader: navegar directo a una URL oculta sigue devolviendo 403.
	const viewer = useMemo(
		() => ({ role: user.role, isTrainer: user.isTrainer }),
		[user.role, user.isTrainer],
	);

	const sections = useMemo(
		() => filterNavigationSections(navigationSections, viewer),
		[viewer],
	);

	const footerItems = useMemo(
		() => filterNavigationByRole(footerNavigationConfig, viewer),
		[viewer],
	);

	// `floating` es lo que distingue al bloque 04: la barra se despega del borde
	// (padding + esquinas redondeadas + ring). Se combina con `collapsible="icon"`
	// —que el 04 no trae—: todos los items tienen icono, así que colapsada sigue
	// siendo usable y los tooltips la explican; los grupos pasan a menú lateral.
	return (
		<Sidebar variant="floating" collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link to="/dashboard">
								<img
									src="/assets/favicon.png"
									alt=""
									className="size-8 shrink-0 object-contain"
								/>
								<div className="flex min-w-0 flex-col gap-0.5 leading-tight">
									<span className="truncate font-semibold">
										Instituto Digital
									</span>
									<span className="truncate text-xs text-sidebar-foreground/70">
										de Capacitación
									</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				{sections.map((section, index) => (
					<SidebarGroup key={section.label ?? index}>
						{section.label && (
							<SidebarGroupLabel>{section.label}</SidebarGroupLabel>
						)}
						<SidebarMenu className="gap-1">
							{section.items.map((item) => (
								<NavEntry
									key={item.path ?? item.label}
									item={item}
									pathname={pathname}
								/>
							))}
						</SidebarMenu>
					</SidebarGroup>
				))}
			</SidebarContent>

			{/* El menú de cuenta y el tema viven en el header del layout. Sin items
			    de pie (rol USER) no se pinta el footer, que solo sumaría padding. */}
			{footerItems.length > 0 && (
				<SidebarFooter>
					<SidebarMenu>
						{footerItems.map((item) => (
							<NavEntry
								key={item.path ?? item.label}
								item={item}
								pathname={pathname}
							/>
						))}
					</SidebarMenu>
				</SidebarFooter>
			)}

			<SidebarRail />
		</Sidebar>
	);
}
