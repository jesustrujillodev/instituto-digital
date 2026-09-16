import bcrypt from "bcryptjs";
import type { IPasswordService } from "../domain/password.service";

const SALT_ROUNDS = 12;

export const createPasswordService = (): IPasswordService => {
	return {
		async hash(plain: string): Promise<string> {
			return bcrypt.hash(plain, SALT_ROUNDS);
		},
		async compare(plain: string, hashed: string): Promise<boolean> {
			return bcrypt.compare(plain, hashed);
		},
	};
};
