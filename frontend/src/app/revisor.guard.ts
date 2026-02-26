import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const revisorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser;
  if (user?.role === 'revisor' || user?.role === 'analista' || user?.role === 'aprobador' || user?.role === 'admin' || user?.role === 'supervisor') return true;
  return router.createUrlTree(['/auth']);
};
