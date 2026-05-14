function resolveApiBase(): string {
  if (typeof window === 'undefined') return '/api';

  const { protocol, hostname, port, origin } = window.location;
  const isLocalDevHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0';

  if (
    isLocalDevHost &&
    (port === '3000' || port === '3001' || port === '4200' || port === '4201' || port === '4202')
  ) {
    return `${protocol}//${hostname}:4000/api`;
  }

  return `${origin}/api`;
}

export const API_BASE = resolveApiBase();
