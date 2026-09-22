import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
	LessonBlockNode,
	LessonBody,
	LessonInlineNode,
	LessonMark,
	LessonTextNode,
} from "../domain/content.types";

// El cuerpo de una lección, pintado con elementos React.
//
// Aquí no hay `dangerouslySetInnerHTML` ni saneador: React escapa el texto por
// sí solo, así que el árbol guardado no puede inyectar nada. Es la mitad de la
// promesa que la lista blanca de `lessonBodyRule` sostiene del otro lado.

const wrapInMark = (mark: LessonMark, child: ReactNode): ReactNode => {
	switch (mark.type) {
		case "bold":
			return <strong className="font-semibold">{child}</strong>;
		case "italic":
			return <em>{child}</em>;
		case "strike":
			return <s>{child}</s>;
		case "code":
			return (
				<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
					{child}
				</code>
			);
		case "link":
			return (
				<a
					href={mark.attrs.href}
					target="_blank"
					rel="noreferrer noopener"
					className="text-primary underline underline-offset-2"
				>
					{child}
				</a>
			);
		default: {
			const exhaustive: never = mark;
			return exhaustive;
		}
	}
};

/** Las marcas se anidan una dentro de otra: no son hermanas, no llevan clave. */
const withMarks = (node: LessonTextNode): ReactNode => {
	let child: ReactNode = node.text;
	for (const mark of node.marks ?? []) child = wrapInMark(mark, child);

	return child;
};

const Inline = ({
	nodes,
}: {
	nodes: readonly LessonInlineNode[] | undefined;
}) => (
	<>
		{(nodes ?? []).map((node, index) =>
			node.type === "hardBreak" ? (
				// biome-ignore lint/suspicious/noArrayIndexKey: el árbol no tiene ids
				<br key={index} />
			) : (
				// biome-ignore lint/suspicious/noArrayIndexKey: el árbol no tiene ids
				<span key={index}>{withMarks(node)}</span>
			),
		)}
	</>
);

const Blocks = ({ nodes }: { nodes: readonly LessonBlockNode[] }) => (
	<>
		{nodes.map((node, index) => (
			// biome-ignore lint/suspicious/noArrayIndexKey: el árbol no tiene ids
			<Block key={index} node={node} />
		))}
	</>
);

function Block({ node }: { node: LessonBlockNode }) {
	switch (node.type) {
		case "paragraph":
			return (
				<p className="leading-relaxed">
					<Inline nodes={node.content} />
				</p>
			);
		case "heading": {
			const Tag = `h${node.attrs.level}` as "h1" | "h2" | "h3";
			const size = { 1: "text-xl", 2: "text-lg", 3: "text-base" }[
				node.attrs.level
			];

			return (
				<Tag className={cn("font-semibold", size)}>
					<Inline nodes={node.content} />
				</Tag>
			);
		}
		case "bulletList":
			return (
				<ul className="list-disc space-y-1 pl-5">
					{node.content.map((item, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: el árbol no tiene ids
						<li key={index} className="space-y-2">
							<Blocks nodes={item.content} />
						</li>
					))}
				</ul>
			);
		case "orderedList":
			return (
				<ol className="list-decimal space-y-1 pl-5">
					{node.content.map((item, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: el árbol no tiene ids
						<li key={index} className="space-y-2">
							<Blocks nodes={item.content} />
						</li>
					))}
				</ol>
			);
		case "blockquote":
			return (
				<blockquote className="space-y-2 border-muted-foreground/30 border-l-2 pl-4 text-muted-foreground italic">
					<Blocks nodes={node.content} />
				</blockquote>
			);
		case "codeBlock":
			return (
				<pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
					<code>
						<Inline nodes={node.content} />
					</code>
				</pre>
			);
		case "horizontalRule":
			return <hr className="border-border" />;
		default: {
			const exhaustive: never = node;
			return exhaustive;
		}
	}
}

export function LessonBodyView({
	body,
	className,
}: {
	body: LessonBody;
	className?: string;
}) {
	if (body.content.length === 0) {
		return (
			<p className={cn("text-muted-foreground text-sm", className)}>
				Esta lección todavía no tiene contenido.
			</p>
		);
	}

	return (
		<div className={cn("space-y-3 text-sm", className)}>
			<Blocks nodes={body.content} />
		</div>
	);
}
