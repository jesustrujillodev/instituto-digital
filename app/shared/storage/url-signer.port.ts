import type { SignedUrl, SignedUrlPolicy } from "./signed-url.policy";

export interface SignRequest {
	bucket: string;
	key: string;
	disposition: "inline" | "attachment";
	policy: SignedUrlPolicy;
}

/** Firma URLs de lectura reutilizando las que siguen vigentes. */
export interface UrlSigner {
	/** En el mismo orden que `requests`. Solo lanza si falla la firma misma. */
	signMany(requests: readonly SignRequest[]): Promise<SignedUrl[]>;
}
