import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

let cachedMasterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  const keyHex = process.env.ENCRYPTION_MASTER_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable not set');
  }

  const keyBuf = Buffer.from(keyHex, 'hex');
  if (keyBuf.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_MASTER_KEY must be ${KEY_LENGTH * 2} hex chars (${KEY_LENGTH} bytes)`);
  }

  cachedMasterKey = keyBuf;
  return cachedMasterKey;
}

function deriveKey(salt: Buffer): Buffer {
  const master = getMasterKey();
  return scryptSync(master, salt, KEY_LENGTH);
}

export function encrypt(plaintext: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const result = Buffer.concat([salt, iv, tag, encrypted]);
  return result.toString('base64url');
}

export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64url');

  if (buf.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Invalid ciphertext: too short');
  }

  let offset = 0;
  const salt = buf.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = buf.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const tag = buf.subarray(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH;
  const encrypted = buf.subarray(offset);

  const key = deriveKey(salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function isEncrypted(value: string): boolean {
  try {
    const buf = Buffer.from(value, 'base64url');
    return buf.length >= SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1 &&
      buf.toString('base64url') === value;
  } catch {
    return false;
  }
}

export function encryptIfNeeded(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (isEncrypted(value)) return value;
  return encrypt(value);
}

export function decryptIfNeeded(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!isEncrypted(value)) return value;
  return decrypt(value);
}

export function generateMasterKey(): string {
  return randomBytes(KEY_LENGTH).toString('hex');
}

export function secureCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function hashToken(token: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(token, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyToken(token: string, hash: string): boolean {
  const [salt, expected] = hash.split(':');
  if (!salt || !expected) return false;
  const derived = scryptSync(token, salt, 32);
  const expectedBuf = Buffer.from(expected, 'hex');
  return timingSafeEqual(derived, expectedBuf);
}
