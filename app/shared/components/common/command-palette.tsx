// import {
//   DocumentTextIcon,
//   MagnifyingGlassIcon,
//   UserCircleIcon,
// } from '@heroicons/react/24/outline'
// import { Command } from 'cmdk'
// import { useEffect, useState } from 'react'
// import { useNavigate } from 'react-router'
// import type { User } from '@/modules/auth/auth.types'
// import { normalizeString } from '@/shared/lib/string-utils'
// import { navigationConfig } from '../layout/config/navigation.config'
// import { filterNavigationByRole } from '../layout/utils/navigation.utils'

// interface CommandPaletteProps {
//   user: User
//   open: boolean
//   onOpenChange: (open: boolean) => void
// }

// export function CommandPalette({
//   user,
//   open,
//   onOpenChange,
// }: CommandPaletteProps) {
//   const navigate = useNavigate()
//   const [search, setSearch] = useState('')

//   const filteredNavigation = filterNavigationByRole(navigationConfig, user.rol)

//   useEffect(() => {
//     const down = (e: KeyboardEvent) => {
//       if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
//         e.preventDefault()
//         onOpenChange(!open)
//       }
//     }

//     document.addEventListener('keydown', down)
//     return () => document.removeEventListener('keydown', down)
//   }, [open, onOpenChange])

//   // Auto-focus input when opened
//   useEffect(() => {
//     if (open) {
//       // Small delay to ensure the dialog is fully rendered
//       const timer = setTimeout(() => {
//         const input = document.querySelector('[cmdk-input]') as HTMLInputElement
//         if (input) {
//           input.focus()
//         }
//       }, 0)
//       return () => clearTimeout(timer)
//     }
//   }, [open])

//   const handleSelect = (callback: () => void) => {
//     callback()
//     onOpenChange(false)
//     setSearch('')
//   }

//   if (!open) return null

//   const filter = (value: string, search: string) => {
//     const normalizedValue = normalizeString(value)
//     const normalizedSearch = normalizeString(search)

//     if (normalizedValue.includes(normalizedSearch)) return 1
//     return 0
//   }

//   return (
//     <Command.Dialog
//       open={open}
//       onOpenChange={onOpenChange}
//       label="Command Menu"
//       className="fixed inset-0 z-100"
//     >
//       {/* Backdrop */}
//       <button
//         type="button"
//         className="fixed inset-0 bg-black/50 backdrop-blur-xs animate-in fade-in-0"
//         onClick={() => onOpenChange(false)}
//         onKeyDown={(e) => {
//           if (e.key === 'Escape') onOpenChange(false)
//         }}
//         aria-label="Cerrar búsqueda"
//       />

//       {/* Command Dialog */}
//       <div className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-2xl px-4">
//         <Command
//           className="bg-white dark:bg-zinc-800 rounded-lg shadow-2xl border border-gray-200 dark:border-border overflow-hidden animate-in fade-in-0 zoom-in-95"
//           shouldFilter={true}
//           filter={filter}
//         >
//           <div className="flex items-center border-b border-gray-200 dark:border-border px-4">
//             <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 dark:text-muted-foreground" />
//             <Command.Input
//               value={search}
//               onValueChange={setSearch}
//               placeholder="Buscar o escribir un comando..."
//               className="flex-1 bg-transparent py-4 px-3 text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-muted-foreground text-foreground"
//             />
//             <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted px-1.5 font-mono text-[10px] text-gray-600 dark:text-muted-foreground">
//               ESC
//             </kbd>
//           </div>

//           <Command.List className="max-h-100 overflow-y-auto p-2">
//             <Command.Empty className="py-6 text-center text-sm text-gray-500 dark:text-muted-foreground">
//               No se encontraron resultados
//             </Command.Empty>

//             {/* Navegación Dinámica */}
//             {filteredNavigation.map((item) => (
//               <Command.Group key={item.label} heading={item.label}>
//                 {item.path && (
//                   <CommandItem
//                     icon={item.icon}
//                     onSelect={() =>
//                       handleSelect(() => navigate(item.path as string))
//                     }
//                   >
//                     {item.label}
//                   </CommandItem>
//                 )}
//                 {item.subItems?.map((subItem) => (
//                   <CommandItem
//                     key={subItem.path}
//                     icon={item.icon}
//                     onSelect={() => handleSelect(() => navigate(subItem.path))}
//                   >
//                     {subItem.label}
//                   </CommandItem>
//                 ))}
//               </Command.Group>
//             ))}

//             {/* Otros */}
//             <Command.Group heading="Otros">
//               <CommandItem
//                 icon={DocumentTextIcon}
//                 onSelect={() =>
//                   handleSelect(() =>
//                     navigate('/dashboard/solicitudes-por-atender'),
//                   )
//                 }
//               >
//                 Solicitudes por atender
//               </CommandItem>
//               <CommandItem
//                 icon={DocumentTextIcon}
//                 onSelect={() =>
//                   handleSelect(() => navigate('/dashboard/manuales'))
//                 }
//               >
//                 Manuales
//               </CommandItem>
//               <CommandItem
//                 icon={UserCircleIcon}
//                 onSelect={() =>
//                   handleSelect(() => navigate('/dashboard/perfil'))
//                 }
//               >
//                 Mi Perfil
//               </CommandItem>
//             </Command.Group>
//           </Command.List>
//         </Command>
//       </div>
//     </Command.Dialog>
//   )
// }

// interface CommandItemProps {
//   children: React.ReactNode
//   icon?: React.ComponentType<{ className?: string }>
//   onSelect: () => void
// }

// function CommandItem({ children, icon: Icon, onSelect }: CommandItemProps) {
//   return (
//     <Command.Item
//       onSelect={onSelect}
//       className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-muted aria-selected:bg-gray-100 dark:aria-selected:bg-muted text-foreground transition-colors"
//     >
//       {Icon && (
//         <Icon className="h-4 w-4 text-gray-500 dark:text-muted-foreground" />
//       )}
//       <span>{children}</span>
//     </Command.Item>
//   )
// }
