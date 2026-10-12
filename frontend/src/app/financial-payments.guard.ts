import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

const financialPaymentRoles = new Set(['admin', 'operador_pagos']);

export const financialPaymentsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return financialPaymentRoles.has(auth.currentUser?.role || '')
    ? true
    : router.createUrlTree(['/']);
};
