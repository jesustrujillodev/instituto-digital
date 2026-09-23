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

/** Sobria: franja de acento con el logo arriba y el texto centrado. */
export const renderInstitucional: TemplateRenderer = (context) => {
	const { design, data, logoUrl } = context;
	const root = ".t-institucional";
	const accent = design.accentColor;

	const body = `
<div class="cert t-institucional">
	<div class="band">
		<img class="logo" src="${escapeHtml(logoUrl)}" alt="">
		<div class="org">
			<div class="org-name">${escapeHtml(data.dependencyName)}</div>
			<div class="org-issuer">${escapeHtml(PLATFORM_NAME)}</div>
		</div>
	</div>
	<div class="content">
		<div class="kicker">Constancia</div>
		${renderStatement(context)}
	</div>
	${renderFooter(context)}
</div>`;

	const styles = `
${root} { background: #ffffff; color: #383838; font-family: ${SANS}; }
${root} .band { height: 136px; background: ${accent}; display: flex; align-items: center; justify-content: space-between; gap: 40px; padding: 0 72px; }
${root} .logo { height: 80px; width: auto; max-width: 300px; object-fit: contain; }
${root} .org { color: #ffffff; text-align: right; max-width: 520px; }
${root} .org-name { font-size: 16px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
${root} .org-issuer { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.85; margin-top: 6px; }
${root} .content { height: 470px; padding: 0 110px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
${root} .kicker { font-size: 13px; font-weight: 600; letter-spacing: 0.4em; text-transform: uppercase; color: ${accent}; margin-bottom: 10px; }
${root} .subtitle { font-size: 14px; color: #6b6b6b; margin-bottom: 14px; overflow-wrap: anywhere; }
${root} .lead { font-size: 14px; color: #6b6b6b; margin: 6px 0; }
${root} .recipient { font-family: ${SERIF}; font-size: 52px; line-height: 1.1; color: #1f1f1f; padding: 4px 24px 10px; border-bottom: 2px solid ${accent}; margin-bottom: 8px; max-width: 100%; overflow-wrap: anywhere; }
${root} .recipient.is-long { font-size: 42px; }
${root} .recipient.is-longer { font-size: 32px; }
${root} .course { font-family: ${SERIF}; font-style: italic; font-size: 28px; line-height: 1.25; color: ${accent}; max-width: 100%; overflow-wrap: anywhere; }
${root} .course.is-long { font-size: 23px; }
${root} .course.is-longer { font-size: 19px; }
${root} .hours { font-size: 14px; font-weight: 600; margin-top: 12px; }
${root} .description { font-size: 13px; line-height: 1.55; color: #555555; margin-top: 12px; max-width: 760px; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
${root} .footer { position: absolute; left: 90px; right: 90px; bottom: 48px; }
${footerStyles(root, accent)}
`;

	return { body, styles };
};
