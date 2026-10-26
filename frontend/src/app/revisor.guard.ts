import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const revisorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser;
  if (user?.role === 'revisor' || user?.role === 'analista' || user?.role === 'emisor' || user?.role === 'aprobador' || user?.role === 'recepcion_aila' || user?.role === 'recepcion_avsec' || user?.role === 'jefatura_avsec' || user?.role === 'jefatura_aila' || user?.role === 'recepcion_dvso' || user?.role === 'jefatura_seccion_aeronavegabilidad' || user?.role === 'inspectores_aeronavegabilidad' || user?.role === 'jefatura_seccion_operaciones' || user?.role === 'inspector_rpas' || user?.role === 'asistentes_aeronavegabilidad' || user?.role === 'jefatura_dvso' || user?.role === 'avsec_financiero' || user?.role === 'analista_servicios_aereos' || user?.role === 'jefatura_transporte_aereo' || user?.role === 'asesoria_juridica_transporte_aereo' || user?.role === 'despacho_superior_transporte_aereo' || user?.role === 'admin' || user?.role === 'supervisor') return true;
  return router.createUrlTree(['/auth']);
};
