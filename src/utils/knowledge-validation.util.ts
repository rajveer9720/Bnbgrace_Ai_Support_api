import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';
import { normalizeText } from './knowledge-text.util.js';

export function requireText(
  value: string,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || !value.trim())
    throw new BadRequestException(`${label} is required`);
  if (value.trim().length > maxLength)
    throw new BadRequestException(`${label} is too long`);
  return normalizeText(value);
}

export function parseUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    url.username = '';
    url.password = '';
    return url;
  } catch {
    throw new BadRequestException('A valid HTTP or HTTPS URL is required');
  }
}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const value = address.toLowerCase();
  return (
    value === '::1' ||
    value === '::' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    /^fe[89ab]/.test(value)
  );
}
