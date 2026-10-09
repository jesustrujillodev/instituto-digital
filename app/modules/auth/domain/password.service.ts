/**
 * Fuera del envelope a propósito (docs/reglas.md §25.5): no lo consume ningún
 * loader ni action, solo otros casos de uso, y un fallo de bcrypt es un error
 * inesperado que su runner ya convierte.
 */
export interface IPasswordService {
	hash(plain: string): Promise<string>;
	compare(plain: string, hashed: string): Promise<boolean>;
}
