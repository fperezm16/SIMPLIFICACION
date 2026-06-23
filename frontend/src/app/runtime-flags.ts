const FORCE_HIDE_DVSO = true;

const DVSO_HIDDEN_HOSTS = new Set([
  '172.18.10.23'
]);

export function hideDvsoInCurrentRuntime() {
  if (FORCE_HIDE_DVSO) return true;
  if (typeof window === 'undefined') return false;
  const host = String(window.location.hostname || '').trim().toLowerCase();
  return DVSO_HIDDEN_HOSTS.has(host);
}

export function isUnitVisibleInCurrentRuntime(unit: string | null | undefined) {
  const normalized = String(unit || '').trim().toUpperCase();
  if (!normalized) return true;
  if (normalized === 'DVSO' && hideDvsoInCurrentRuntime()) return false;
  return true;
}

export function filterVisibleUnitsInCurrentRuntime<T extends string>(units: T[]) {
  return units.filter((unit) => isUnitVisibleInCurrentRuntime(unit));
}
