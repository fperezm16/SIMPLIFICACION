const FORCE_HIDE_DVSO = false;
const FORCE_HIDE_TRANSPORTE_AEREO = true;
const FORCE_HIDE_INFRAESTRUCTURA = true;

const DVSO_HIDDEN_HOSTS = new Set<string>([
]);

export function hideDvsoInCurrentRuntime() {
  if (FORCE_HIDE_DVSO) return true;
  if (typeof window === 'undefined') return false;
  const host = String(window.location.hostname || '').trim().toLowerCase();
  return DVSO_HIDDEN_HOSTS.has(host);
}

export function hideTransporteAereoInCurrentRuntime() {
  return FORCE_HIDE_TRANSPORTE_AEREO;
}

export function hideInfraestructuraInCurrentRuntime() {
  return FORCE_HIDE_INFRAESTRUCTURA;
}

export function isUnitVisibleInCurrentRuntime(unit: string | null | undefined) {
  const normalized = String(unit || '').trim().toUpperCase();
  if (!normalized) return true;
  if (normalized === 'DVSO' && hideDvsoInCurrentRuntime()) return false;
  if (normalized === 'TRANSPORTE_AEREO' && hideTransporteAereoInCurrentRuntime()) return false;
  if (normalized === 'INFRAESTRUCTURA' && hideInfraestructuraInCurrentRuntime()) return false;
  return true;
}

export function filterVisibleUnitsInCurrentRuntime<T extends string>(units: T[]) {
  return units.filter((unit) => isUnitVisibleInCurrentRuntime(unit));
}
