import { Save } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { CERTIFICATE_EMAIL_MESSAGE_MAX } from "../domain/certificate.config";
import type { CertificateDelivery } from "../domain/certificate.types";
import {
	CERTIFICATE_INTENTS,
	type CertificateActionData,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/certificate-form";

interface CertificateDeliveryPanelProps {
	delivery: CertificateDelivery;
	disabled: boolean;
}

/**
 * Cómo llega el certificado a quien lo recibe. Se guarda aparte del diseño:
 * no pasa por borrador ni publicado, y rige desde que se guarda, también para
 * lo ya emitido.
 */
export function CertificateDeliveryPanel({
	delivery,
	disabled,
}: CertificateDeliveryPanelProps) {
	const fetcher = useFetcher<CertificateActionData>();
	useFetcherToast(fetcher);
	const [isDownloadable, setIsDownloadable] = useState(delivery.isDownloadable);
	const [emailMessage, setEmailMessage] = useState(delivery.emailMessage ?? "");

	const busy = fetcher.state !== "idle";
	const dirty =
		isDownloadable !== delivery.isDownloadable ||
		emailMessage.trim() !== (delivery.emailMessage ?? "");

	const save = () =>
		fetcher.submit(
			{
				[INTENT_FIELD]: CERTIFICATE_INTENTS.saveDelivery,
				[PAYLOAD_FIELD]: JSON.stringify({
					isDownloadable,
					emailMessage: emailMessage.trim() || null,
				}),
			},
			{ method: "post" },
		);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start gap-3">
				<Checkbox
					id="certificate-downloadable"
					checked={isDownloadable}
					disabled={disabled || busy}
					onCheckedChange={(checked) => setIsDownloadable(checked === true)}
				/>
				<div>
					<Label htmlFor="certificate-downloadable">
						Permitir que el participante lo descargue
					</Label>
					<p className="text-muted-foreground text-xs">
						Sin marcar, lo ve en «Mis certificados» con la nota de que la
						dependencia se lo entregará.
					</p>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="certificate-email-message">Mensaje del correo</Label>
				<Textarea
					id="certificate-email-message"
					value={emailMessage}
					maxLength={CERTIFICATE_EMAIL_MESSAGE_MAX}
					disabled={disabled || busy}
					placeholder="Opcional. Se añade al correo que avisa de la emisión."
					onChange={(event) => setEmailMessage(event.target.value)}
				/>
				<p className="text-right text-muted-foreground text-xs tabular-nums">
					{emailMessage.length} / {CERTIFICATE_EMAIL_MESSAGE_MAX}
				</p>
			</div>

			<Button
				variant="outline"
				size="sm"
				className="self-start"
				disabled={disabled || busy || !dirty}
				onClick={save}
			>
				<Save aria-hidden="true" />
				Guardar entrega
			</Button>
		</div>
	);
}
