import { MediaPlayer, MediaProvider } from "@vidstack/react";
import {
	DefaultVideoLayout,
	defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

// El reproductor de una lección de video.
//
// La fuente es una URL firmada de TTL largo: los rangos van directos al bucket
// y el servidor no ve un solo byte. Sin transcodificar no hay escalera de
// calidad —eso pide HLS y una cola de trabajos—, así que esto es MP4 progresivo
// con `Range`, que es lo que el navegador sabe hacer solo.

export function LessonVideoPlayer({
	src,
	title,
	mimeType,
	onEnded,
}: {
	src: string;
	title: string;
	mimeType: string | null;
	/** La señal que el avance por lección (F-05) va a escuchar. */
	onEnded?: () => void;
}) {
	return (
		<MediaPlayer
			className="w-full overflow-hidden rounded-md"
			title={title}
			src={{ src, type: (mimeType ?? "video/mp4") as "video/mp4" }}
			crossOrigin={null}
			playsInline
			onEnded={() => onEnded?.()}
		>
			<MediaProvider />
			<DefaultVideoLayout icons={defaultLayoutIcons} />
		</MediaPlayer>
	);
}
