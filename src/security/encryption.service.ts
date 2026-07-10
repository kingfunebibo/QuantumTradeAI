import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

const SECRET =
  process.env.ENCRYPTION_SECRET;

if (!SECRET) {
  throw new Error(
    "ENCRYPTION_SECRET is not defined.",
  );
}

// Create a 32-byte encryption key
const KEY = crypto
  .createHash("sha256")
  .update(SECRET)
  .digest();

export class EncryptionService {
  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(
      ALGORITHM,
      KEY,
      iv,
    );

    const encrypted = Buffer.concat([
      cipher.update(text, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return [
      iv.toString("hex"),
      authTag.toString("hex"),
      encrypted.toString("hex"),
    ].join(":");
  }

  decrypt(payload: string): string {
    const [
      ivHex,
      authTagHex,
      encryptedHex,
    ] = payload.split(":");

    const decipher =
      crypto.createDecipheriv(
        ALGORITHM,
        KEY,
        Buffer.from(ivHex, "hex"),
      );

    decipher.setAuthTag(
      Buffer.from(authTagHex, "hex"),
    );

    const decrypted = Buffer.concat([
      decipher.update(
        Buffer.from(encryptedHex, "hex"),
      ),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }
}

export const encryptionService =
  new EncryptionService();