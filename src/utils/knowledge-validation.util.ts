import { BadRequestException } from '@nestjs/common';
import { BlockList, isIP } from 'node:net';
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
    if (typeof value !== 'string' || value.length > 500) throw new Error();
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    if (url.username || url.password) throw new Error();
    url.hash = '';
    if (url.toString().length > 500) throw new Error();
    return url;
  } catch {
    throw new BadRequestException(
      'A valid HTTP or HTTPS URL without credentials (maximum 500 characters) is required',
    );
  }
}

const blockedIpv4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blockedIpv4.addSubnet(network, prefix, 'ipv4');

const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');
const blockedIpv6 = new BlockList();
blockedIpv6.addSubnet('2001::', 23, 'ipv6');
blockedIpv6.addSubnet('2001:db8::', 32, 'ipv6');
blockedIpv6.addSubnet('2002::', 16, 'ipv6');
blockedIpv6.addSubnet('3fff::', 20, 'ipv6');

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedIpv4.check(address, 'ipv4');
  if (family === 6) {
    // Only global unicast: also excludes mapped IPv4, translation and local ranges.
    return (
      !globalIpv6.check(address, 'ipv6') || blockedIpv6.check(address, 'ipv6')
    );
  }
  return true;
}
