import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
	Bold,
	Code,
	Italic,
	Link2,
	List,
	ListOrdered,
	Minus,
	Quote,
	Strikethrough,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import type { LessonBody } from "../domain/content.types";

// El editor del cuerpo de la lección.
//
// Se carga con `lazy` desde el panel del material: Tiptap pesa y solo lo usa
// quien captura. Quien recorre el curso lee el mismo árbol con `LessonBodyView`,
// que no arrastra ninguna dependencia.

/** Solo lo que el renderizador sabe pintar: activar más aquí lo rompería. */
const EXTENSIONS = [
	StarterKit.configure({
		heading: { levels: [1, 2, 3] },
		underline: false,
		link: {
			openOnClick: false,
			autolink: true,
			protocols: ["http", "https"],
		},
	}),
];

export default function LessonBodyEditor({
	value,
	onChange,
	disabled,
}: {
	value: LessonBody;
	onChange: (body: LessonBody) => void;
	disabled?: boolean;
}) {
	const editor = useEditor({
		extensions: EXTENSIONS,
		// ProseMirror exige al menos un bloque en el documento, y el documento
		// vacío que guarda la base no tiene ninguno: se abre en blanco.
		content: value.content.length > 0 ? value : "",
		editable: !disabled,
		immediatelyRender: false,
		editorProps: {
			attributes: {
				class:
					"min-h-64 max-h-[26rem] overflow-y-auto rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring",
			},
		},
		onUpdate: ({ editor: current }) => {
			onChange(current.getJSON() as unknown as LessonBody);
		},
	});

	if (!editor) return null;

	const toggle = (
		label: string,
		icon: React.ReactNode,
		active: boolean,
		run: () => void,
	) => (
		<Button
			type="button"
			size="icon"
			variant={active ? "secondary" : "ghost"}
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={run}
		>
			{icon}
		</Button>
	);

	const promptLink = () => {
		const previous = editor.getAttributes("link").href as string | undefined;
		const href = window.prompt("Dirección del enlace", previous ?? "https://");
		if (href === null) return;

		if (href.trim() === "") {
			editor.chain().focus().unsetLink().run();
			return;
		}

		editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-1 rounded-md border border-input p-1">
				{([1, 2, 3] as const).map((level) =>
					toggle(
						`Título ${level}`,
						<span className="font-semibold text-xs">H{level}</span>,
						editor.isActive("heading", { level }),
						() => editor.chain().focus().toggleHeading({ level }).run(),
					),
				)}

				<Separator orientation="vertical" className="mx-1 h-5" />

				{toggle("Negrita", <Bold />, editor.isActive("bold"), () =>
					editor.chain().focus().toggleBold().run(),
				)}
				{toggle("Cursiva", <Italic />, editor.isActive("italic"), () =>
					editor.chain().focus().toggleItalic().run(),
				)}
				{toggle("Tachado", <Strikethrough />, editor.isActive("strike"), () =>
					editor.chain().focus().toggleStrike().run(),
				)}
				{toggle("Código", <Code />, editor.isActive("code"), () =>
					editor.chain().focus().toggleCode().run(),
				)}

				<Separator orientation="vertical" className="mx-1 h-5" />

				{toggle("Lista", <List />, editor.isActive("bulletList"), () =>
					editor.chain().focus().toggleBulletList().run(),
				)}
				{toggle(
					"Lista numerada",
					<ListOrdered />,
					editor.isActive("orderedList"),
					() => editor.chain().focus().toggleOrderedList().run(),
				)}
				{toggle("Cita", <Quote />, editor.isActive("blockquote"), () =>
					editor.chain().focus().toggleBlockquote().run(),
				)}
				{toggle("Separador", <Minus />, false, () =>
					editor.chain().focus().setHorizontalRule().run(),
				)}

				<Separator orientation="vertical" className="mx-1 h-5" />

				{toggle("Enlace", <Link2 />, editor.isActive("link"), promptLink)}
			</div>

			<EditorContent editor={editor} />
		</div>
	);
}
