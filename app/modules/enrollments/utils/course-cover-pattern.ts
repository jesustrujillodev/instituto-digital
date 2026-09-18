/**
 * Placa generada para los cursos sin portada.
 *
 * Un hueco gris en una cuadrícula de tarjetas lee como error de carga, y una
 * única placa repetida convierte el catálogo en una pared. La variante se
 * deriva del `documentId`, así que es estable —el mismo curso se ve siempre
 * igual, también entre servidor y cliente— y a la vez distinta de la de al
 * lado.
 *
 * Aquí solo vive la aritmética; el dibujo está en `components/course-cover.tsx`.
 */

/** Tramas disponibles, en el orden que fija su índice. */
export const COVER_PATTERNS = [
	"grid",
	"diagonals",
	"dots",
	"chevron",
	"rings",
	"bricks",
] as const;

export type CoverPattern = (typeof COVER_PATTERNS)[number];

/** Giros de la trama, en grados. */
const ROTATIONS = [0, 15, -15, 30] as const;

/** Tamaño del mosaico, en unidades del viewBox. */
const SCALES = [16, 20, 26] as const;

export interface CoverDesign {
	pattern: CoverPattern;
	rotation: number;
	scale: number;
}

/**
 * Hash entero de una cadena (FNV-1a de 32 bits).
 *
 * Determinista y sin dependencias: se necesita el mismo número en el render del
 * servidor y en el del cliente, o React reporta una discrepancia de hidratación.
 */
const hashOf = (value: string): number => {
	let hash = 2166136261;

	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return hash >>> 0;
};

/** La placa que le toca a un curso. */
export const coverDesignOf = (documentId: string): CoverDesign => {
	const hash = hashOf(documentId);

	return {
		pattern: COVER_PATTERNS[hash % COVER_PATTERNS.length],
		// Se desplaza el hash antes de cada elección: tomar dígitos contiguos del
		// mismo número ata las tres variantes entre sí y reduce las combinaciones.
		rotation: ROTATIONS[(hash >>> 8) % ROTATIONS.length],
		scale: SCALES[(hash >>> 16) % SCALES.length],
	};
};
