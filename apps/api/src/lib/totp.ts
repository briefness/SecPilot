import { createHmac, randomBytes } from 'node:crypto';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  while (output.length % 8 !== 0) {
    output += '=';
  }

  return output;
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleaned[i]);
    if (idx < 0) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTOTPSecret(): string {
  const buffer = randomBytes(20);
  return base32Encode(buffer);
}

export function generateTOTP(secret: string, timestamp?: number, period = 30, digits = 6): string {
  const time = timestamp ?? Date.now() / 1000;
  const counter = Math.floor(time / period);

  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];

  const totp = (code % Math.pow(10, digits)).toString().padStart(digits, '0');
  return totp;
}

export function verifyTOTP(
  token: string,
  secret: string,
  period = 30,
  digits = 6,
  window = 1
): boolean {
  const now = Date.now() / 1000;

  for (let i = -window; i <= window; i++) {
    const timestamp = (Math.floor(now / period) + i) * period * 1000;
    const expected = generateTOTP(secret, timestamp / 1000, period, digits);
    if (expected === token) {
      return true;
    }
  }

  return false;
}

export function generateOTPAuthURL(
  secret: string,
  accountName: string,
  issuer: string,
  algorithm = 'SHA1',
  digits = 6,
  period = 30
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=${algorithm}&digits=${digits}&period=${period}`;
}

export function qrCodeDataURL(otpAuthURL: string): string {
  const encoded = encodeURIComponent(otpAuthURL);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`;
}
