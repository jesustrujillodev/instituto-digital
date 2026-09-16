import { EyeIcon, EyeOff, Key } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Link } from "react-router";
import { generateSecurePassword } from "@/lib/password-generator";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "../ui/input";
import { Label } from "../ui/label";

interface Props extends InputProps {
	label: string;
	error?: string;
	icon?: ReactNode;
	iconPosition?: "start" | "end";
	forgetPassword?: boolean;
	helperText?: string;
	showGenerator?: boolean;
	onGenerate?: (password: string) => void;
}

export function PasswordInput({
	label,
	error,
	icon,
	iconPosition = "start",
	forgetPassword,
	helperText,
	showGenerator = false,
	onGenerate,
	className,
	ref,
	...props
}: Props) {
	const [showPassword, setShowPassword] = useState(false);
	const hasError = Boolean(error);
	const inputRef = useRef<HTMLInputElement>(null);

	// El ref se compone en vez de reenviarse: el generador necesita el suyo
	// propio, y quien consume el componente (p. ej. register() de react-hook-form)
	// necesita el suyo. Sin esto, el último en asignarse anula al otro.
	const setRefs = (node: HTMLInputElement | null) => {
		inputRef.current = node;
		if (typeof ref === "function") ref(node);
		else if (ref) ref.current = node;
	};

	const handleGeneratePassword = () => {
		const newPassword = generateSecurePassword(12);

		// Actualizar el valor del input directamente
		if (inputRef.current) {
			inputRef.current.value = newPassword;

			// Disparar evento de cambio para que el formulario capture el valor
			const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype,
				"value",
			)?.set;

			if (nativeInputValueSetter) {
				nativeInputValueSetter.call(inputRef.current, newPassword);
			}

			// Disparar eventos para que React detecte el cambio
			const inputEvent = new Event("input", { bubbles: true });
			inputRef.current.dispatchEvent(inputEvent);

			const changeEvent = new Event("change", { bubbles: true });
			inputRef.current.dispatchEvent(changeEvent);

			// Llamar al onChange del componente si existe
			if (props.onChange) {
				const syntheticEvent = {
					target: inputRef.current,
					currentTarget: inputRef.current,
				} as React.ChangeEvent<HTMLInputElement>;

				props.onChange(syntheticEvent);
			}
		}

		// Callback adicional si se proporciona
		onGenerate?.(newPassword);

		// Mostrar la contraseña generada temporalmente
		setShowPassword(true);

		// Ocultarla después de 5 segundos
		setTimeout(() => {
			setShowPassword(false);
		}, 5000);
	};

	return (
		<div className="grid w-full items-center gap-1.5">
			<div className="flex items-center gap-2">
				{label && (
					<Label
						htmlFor={props.id ?? props.name}
						className={cn(
							"text-sm font-medium text-foreground",
							hasError && "text-destructive",
						)}
					>
						{label}
						{props.required && <span className="text-destructive">*</span>}
					</Label>
				)}
				{forgetPassword && (
					<Link
						to="#"
						className="ml-auto inline-block text-sm text-primary hover:text-primary/80 underline-offset-4 hover:underline"
					>
						¿Olvidaste tu contraseña?
					</Link>
				)}
				{/* En la fila de la etiqueta y como texto, no como botón a todo el
				    ancho: así el campo mide lo mismo que sus vecinos de rejilla y la
				    acción no compite con el botón principal del formulario. */}
				{showGenerator && (
					<button
						type="button"
						onClick={handleGeneratePassword}
						aria-label="Generar contraseña segura"
						className="ml-auto inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 lg:cursor-pointer"
					>
						<Key className="size-3.5" aria-hidden="true" />
						Generar
					</button>
				)}
			</div>
			<div className="relative">
				{icon && iconPosition === "start" && (
					<div
						className={cn(
							"absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none",
							hasError ? "text-destructive" : "text-muted-foreground",
						)}
					>
						{icon}
					</div>
				)}
				<Input
					ref={setRefs}
					className={cn(
						icon && iconPosition === "start" ? "pl-10" : "",
						icon && iconPosition === "end" ? "pr-10" : "",
						"pr-10",
						hasError &&
							"border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
						className,
					)}
					aria-invalid={hasError}
					aria-describedby={
						error
							? `${props.name}-error`
							: helperText
								? `${props.name}-helper`
								: undefined
					}
					{...props}
					type={!showPassword ? "password" : "text"}
				/>
				<div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3">
					<button
						type="button"
						onClick={() => setShowPassword(!showPassword)}
						className={cn(
							"lg:cursor-pointer transition-colors",
							hasError
								? "text-destructive hover:text-destructive/80"
								: "text-muted-foreground hover:text-foreground",
						)}
						aria-label={
							showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
						}
					>
						{showPassword ? (
							<EyeIcon className="h-4 w-4" />
						) : (
							<EyeOff className="h-4 w-4" />
						)}
					</button>
				</div>
			</div>
			{error && (
				<span
					id={`${props.name}-error`}
					className="text-sm text-destructive flex items-center gap-1"
					role="alert"
				>
					<svg
						aria-hidden="true"
						role="img"
						className="w-4 h-4 shrink-0"
						fill="currentColor"
						viewBox="0 0 20 20"
					>
						<path
							fillRule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
							clipRule="evenodd"
						/>
					</svg>
					{error}
				</span>
			)}
			{!error && helperText && (
				<span
					id={`${props.name}-helper`}
					className="text-sm text-muted-foreground"
				>
					{helperText}
				</span>
			)}
		</div>
	);
}
