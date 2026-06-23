import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { hideDvsoInCurrentRuntime } from './runtime-flags';

export const formGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser;

  if (!user) {
    return router.createUrlTree(['/auth']);
  }
  if (user.role === 'user' || user.role === 'admin') {
    if (hideDvsoInCurrentRuntime() && String(state.url || '').startsWith('/dvso')) {
      return router.createUrlTree(['/']);
    }
    return true;
  }
  return router.createUrlTree(['/']);
};
