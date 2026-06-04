import { Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const passwordPrefix = "scrypt";
const secretPrefix = "aes-256-gcm";

@Injectable()
export class CryptoService {
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("base64url");
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `${passwordPrefix}:${salt}:${derived.toString("base64url")}`;
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [prefix, salt, expected] = storedHash.split(":");
    if (prefix !== passwordPrefix || !salt || !expected) {
      return false;
    }

    const actual = (await scrypt(password, salt, 64)) as Buffer;
    const expectedBuffer = Buffer.from(expected, "base64url");
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  }

  encryptSecret(plaintext: string): string {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [secretPrefix, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
  }

  decryptSecret(encrypted: string): string {
    const [prefix, iv, tag, ciphertext] = encrypted.split(":");
    if (prefix !== secretPrefix || !iv || !tag || !ciphertext) {
      throw new Error("Unsupported encrypted secret format");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey(),
      Buffer.from(iv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }

  signSession(payload: object): string {
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = this.hmac(body);
    return `${body}.${signature}`;
  }

  verifySession<T extends object>(token: string): T | null {
    const [body, signature] = token.split(".");
    if (!body || !signature || this.hmac(body) !== signature) {
      return null;
    }

    try {
      return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    } catch {
      return null;
    }
  }

  private hmac(value: string): string {
    return createHmac("sha256", this.sessionSecret()).update(value).digest("base64url");
  }

  private encryptionKey(): Buffer {
    return normalizeKey(readSecret("APP_SECRET_KEY", "review-pilot-dev-app-secret-change-me"));
  }

  private sessionSecret(): string {
    return readSecret("OWNER_SESSION_SECRET", "review-pilot-dev-session-secret-change-me");
  }
}

function readSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required in production`);
  }
  return devFallback;
}

function normalizeKey(raw: string): Buffer {
  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32) {
    return base64;
  }

  const hex = Buffer.from(raw, "hex");
  if (hex.length === 32) {
    return hex;
  }

  return createHmac("sha256", "review-pilot-key-derivation").update(raw).digest();
}
