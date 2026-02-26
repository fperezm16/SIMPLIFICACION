import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const formGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser;

  if (!user) {
    return router.createUrlTree(['/auth']);
  }
  if (user.role === 'user' || user.role === 'admin') {
    return true;
  }
  return router.createUrlTree(['/']);
};
