import { PLATFORM_NAME } from "@/modules/notifications/domain/notification.config";
import { escapeHtml } from "@/shared/html/escape-html";
import {
	footerStyles,
	renderFooter,
	renderStatement,
	SANS,
	SERIF,
	shade,
	type TemplateRenderer,
} from "./shared";

/** Con marco: doble filete de acento y el logo en una placa del acento. */
export const renderMarco: TemplateRenderer = (context) => {
	const { design, data, logoUrl } = context;
	const root = ".t-marco";
	const accent = design.accentColor;

	const body = `
<div class="cert t-marco">
	<div class="frame">
		<div class="medallion"><img class="logo" src="${escapeHtml(logoUrl)}" alt=""></div>
		<div class="org">${escapeHtml(data.dependencyName)} · ${escapeHtml(PLATFORM_NAME)}</div>
		<div class="content">
			<div class="kicker">Constancia</div>
			${renderStatement(context)}
		</div>
		${renderFooter(context)}
	</div>
</div>`;

	const styles = `
${root} { background: ${shade(accent, 0.94)}; color: #383838; font-family: ${SANS}; padding: 22px; border: 14px solid ${accent}; }
${root} .frame { position: relative; height: 100%; border: 2px solid ${shade(accent, 0.35)}; background: #fffdf9; padding: 26px 80px 34px; display: flex; flex-direction: column; align-items: center; }
${root} .medallion { width: 240px; height: 92px; border-radius: 46px; background: ${accent}; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 5px #fffdf9, 0 0 0 7px ${shade(accent, 0.35)}; }
${root} .logo { max-width: 176px; max-height: 64px; object-fit: contain; }
${root} .org { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #6b6b6b; margin-top: 16px; text-align: center; max-width: 100%; overflow-wrap: anywhere; }
${root} .content { flex: 1; min-height: 0; width: 100%; padding: 10px 0; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
${root} .kicker { font-family: ${SERIF}; font-size: 30px; letter-spacing: 0.3em; text-transform: uppercase; color: ${accent}; margin-bottom: 8px; }
${root} .subtitle { font-size: 13px; color: #6b6b6b; margin-bottom: 10px; overflow-wrap: anywhere; }
${root} .lead { font-size: 13px; color: #6b6b6b; margin: 5px 0; }
${root} .recipient { font-family: ${SERIF}; font-style: italic; font-size: 48px; line-height: 1.1; color: #1f1f1f; max-width: 100%; overflow-wrap: anywhere; }
${root} .recipient.is-long { font-size: 38px; }
${root} .recipient.is-longer { font-size: 29px; }
${root} .course { font-family: ${SERIF}; font-size: 25px; line-height: 1.25; color: ${accent}; max-width: 100%; overflow-wrap: anywhere; }
${root} .course.is-long { font-size: 21px; }
${root} .course.is-longer { font-size: 17px; }
${root} .hours { font-size: 13px; font-weight: 600; margin-top: 10px; }
${root} .description { font-size: 12px; line-height: 1.5; color: #555555; margin-top: 8px; max-width: 720px; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
${root} .footer { width: 100%; padding-top: 14px; }
${footerStyles(root, accent)}
`;

	return { body, styles };
};
