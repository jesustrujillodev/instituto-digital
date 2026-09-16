import { UploadIcon } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import {
	type DropEvent,
	type DropzoneOptions,
	type FileRejection,
	useDropzone,
} from "react-dropzone";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";

// Vendorizado de @kibo-ui/dropzone con dos ajustes respecto al registry:
//
// 1. Vive en `shared/components/ui/` y no en `components/kibo-ui/dropzone/`,
//    que es el `target` que declara el registry: este proyecto alias `ui` a
//    `@/shared/components/ui` (components.json) y no tiene `@/components`.
// 2. El import de Button apunta a la ruta real del proyecto.
//
// La copia por defecto está traducida: es un componente vendorizado, así que el
// código es nuestro y una cadena en inglés dentro de una app en español sería
// una fuga de la plantilla original.

type DropzoneContextType = {
	src?: File[];
	accept?: DropzoneOptions["accept"];
	maxSize?: DropzoneOptions["maxSize"];
	minSize?: DropzoneOptions["minSize"];
	maxFiles?: DropzoneOptions["maxFiles"];
};

const renderBytes = (bytes: number) => {
	const units = ["B", "KB", "MB", "GB", "TB", "PB"];
	let size = bytes;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(2)} ${units[unitIndex]}`;
};

const DropzoneContext = createContext<DropzoneContextType | undefined>(
	undefined,
);

export type DropzoneProps = Omit<DropzoneOptions, "onDrop"> & {
	src?: File[];
	className?: string;
	onDrop?: (
		acceptedFiles: File[],
		fileRejections: FileRejection[],
		event: DropEvent,
	) => void;
	children?: ReactNode;
};

export const Dropzone = ({
	accept,
	maxFiles = 1,
	maxSize,
	minSize,
	onDrop,
	onError,
	disabled,
	src,
	className,
	children,
	...props
}: DropzoneProps) => {
	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		accept,
		maxFiles,
		maxSize,
		minSize,
		onError,
		disabled,
		onDrop: (acceptedFiles, fileRejections, event) => {
			if (fileRejections.length > 0) {
				const message = fileRejections.at(0)?.errors.at(0)?.message;
				onError?.(new Error(message));
				return;
			}

			onDrop?.(acceptedFiles, fileRejections, event);
		},
		...props,
	});

	return (
		<DropzoneContext.Provider
			key={JSON.stringify(src)}
			value={{ src, accept, maxSize, minSize, maxFiles }}
		>
			<Button
				className={cn(
					"relative h-auto w-full flex-col overflow-hidden p-8",
					isDragActive && "outline-none ring-1 ring-ring",
					className,
				)}
				disabled={disabled}
				type="button"
				variant="outline"
				{...getRootProps()}
			>
				<input {...getInputProps()} disabled={disabled} />
				{children}
			</Button>
		</DropzoneContext.Provider>
	);
};

const useDropzoneContext = () => {
	const context = useContext(DropzoneContext);

	if (!context) {
		throw new Error("useDropzoneContext must be used within a Dropzone");
	}

	return context;
};

export type DropzoneContentProps = {
	children?: ReactNode;
	className?: string;
};

const maxLabelItems = 3;

export const DropzoneContent = ({
	children,
	className,
}: DropzoneContentProps) => {
	const { src } = useDropzoneContext();

	if (!src) return null;
	if (children) return children;

	const formatter = new Intl.ListFormat("es-MX");

	return (
		<div className={cn("flex flex-col items-center justify-center", className)}>
			<div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<UploadIcon size={16} />
			</div>
			<p className="my-2 w-full truncate font-medium text-sm">
				{src.length > maxLabelItems
					? `${formatter.format(
							src.slice(0, maxLabelItems).map((file) => file.name),
						)} y ${src.length - maxLabelItems} más`
					: formatter.format(src.map((file) => file.name))}
			</p>
			<p className="w-full text-wrap text-muted-foreground text-xs">
				Arrastra o haz clic para reemplazar
			</p>
		</div>
	);
};

export type DropzoneEmptyStateProps = {
	children?: ReactNode;
	className?: string;
};

export const DropzoneEmptyState = ({
	children,
	className,
}: DropzoneEmptyStateProps) => {
	const { src, accept, maxSize, minSize, maxFiles } = useDropzoneContext();

	if (src) return null;
	if (children) return children;

	let caption = "";

	if (accept) {
		caption += `Acepta ${new Intl.ListFormat("es-MX").format(Object.keys(accept))}`;
	}

	if (minSize && maxSize) {
		caption += ` entre ${renderBytes(minSize)} y ${renderBytes(maxSize)}`;
	} else if (minSize) {
		caption += ` de al menos ${renderBytes(minSize)}`;
	} else if (maxSize) {
		caption += ` de hasta ${renderBytes(maxSize)}`;
	}

	return (
		<div className={cn("flex flex-col items-center justify-center", className)}>
			<div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<UploadIcon size={16} />
			</div>
			<p className="my-2 w-full truncate text-wrap font-medium text-sm">
				{maxFiles === 1 ? "Sube un archivo" : "Sube tus archivos"}
			</p>
			<p className="w-full truncate text-wrap text-muted-foreground text-xs">
				Arrastra o haz clic para subir
			</p>
			{caption && (
				<p className="text-wrap text-muted-foreground text-xs">{caption}.</p>
			)}
		</div>
	);
};
