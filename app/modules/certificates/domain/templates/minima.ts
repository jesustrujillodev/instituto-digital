import { PLATFORM_NAME } from "@/modules/notifications/domain/notification.config";
import { escapeHtml } from "@/shared/html/escape-html";
import {
	footerStyles,
	renderFooter,
	renderStatement,
	SANS,
	SERIF,
	type TemplateRenderer,
} from "./shared";

/** Mínima: columna de acento a la izquierda con el logo, y tipografía pura. */
export const renderMinima: TemplateRenderer = (context) => {
	const { design, data, logoUrl } = context;
	const root = ".t-minima";
	const accent = design.accentColor;

	const body = `
<div class="cert t-minima">
	<div class="aside">
		<img class="logo" src="${escapeHtml(logoUrl)}" alt="">
		<div class="org">
			<div class="org-name">${escapeHtml(data.dependencyName)}</div>
			<div class="org-issuer">${escapeHtml(PLATFORM_NAME)}</div>
		</div>
	</div>
	<div class="main">
		<div class="content">
			<div class="kicker">Constancia</div>
			${renderStatement(context)}
		</div>
		${renderFooter(context)}
	</div>
</div>`;

	const styles = `
${root} { background: #ffffff; color: #383838; font-family: ${SANS}; display: flex; }
${root} .aside { width: 230px; flex-shrink: 0; background: ${accent}; color: #ffffff; padding: 56px 32px; display: flex; flex-direction: column; justify-content: space-between; }
${root} .logo { width: 100%; height: auto; max-height: 120px; object-fit: contain; object-position: left top; }
${root} .org-name { font-size: 15px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
${root} .org-issuer { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.85; margin-top: 8px; }
${root} .main { flex: 1; min-width: 0; padding: 64px 76px 48px; display: flex; flex-direction: column; justify-content: space-between; }
${root} .content { max-height: 500px; overflow: hidden; }
${root} .kicker { font-size: 12px; font-weight: 600; letter-spacing: 0.4em; text-transform: uppercase; color: ${accent}; margin-bottom: 18px; }
${root} .subtitle { font-size: 14px; color: #6b6b6b; margin-bottom: 18px; overflow-wrap: anywhere; }
${root} .lead { font-size: 13px; color: #6b6b6b; margin: 8px 0; }
${root} .recipient { font-family: ${SERIF}; font-size: 60px; line-height: 1.05; color: #1f1f1f; overflow-wrap: anywhere; }
${root} .recipient.is-long { font-size: 46px; }
${root} .recipient.is-longer { font-size: 34px; }
${root} .course { font-family: ${SERIF}; font-style: italic; font-size: 30px; line-height: 1.2; color: ${accent}; padding-bottom: 14px; border-bottom: 2px solid ${accent}; overflow-wrap: anywhere; }
${root} .course.is-long { font-size: 24px; }
${root} .course.is-longer { font-size: 19px; }
${root} .hours { font-size: 14px; font-weight: 600; margin-top: 14px; }
${root} .description { font-size: 13px; line-height: 1.55; color: #555555; margin-top: 10px; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
${root} .footer { padding-top: 18px; }
${footerStyles(root, accent)}
`;

	return { body, styles };
};
