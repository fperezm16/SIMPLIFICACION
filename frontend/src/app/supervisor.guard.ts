import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const supervisorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const role = String(auth.currentUser?.role || '').toLowerCase();
  if (role === 'supervisor' || role === 'admin') return true;
  return router.createUrlTree(['/']);
};

