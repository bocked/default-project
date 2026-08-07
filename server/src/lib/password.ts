import argon2 from "@node-rs/argon2";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

const argon2Options = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export const password: PasswordHasher = {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, argon2Options);
  },
  async verify(stored: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(stored, plain);
    } catch {
      return false;
    }
  },
};
