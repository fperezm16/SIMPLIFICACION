import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { adminGuard } from './admin.guard';
import { authGuard } from './auth.guard';
import { authInterceptor } from './auth.interceptor';
import { AuthPageComponent } from './auth-page.component';
import { FormPageComponent } from './form-page.component';
import { ReviewPageComponent } from './review-page.component';
import { revisorGuard } from './revisor.guard';
import { AdminPageComponent } from './admin-page.component';
import { HomePageComponent } from './home-page.component';
import { formGuard } from './form.guard';
import { SupervisorPageComponent } from './supervisor-page.component';
import { supervisorGuard } from './supervisor.guard';
import { FinancialFormPageComponent } from './financial-form-page.component';
import { AilaFormPageComponent } from './aila-form-page.component';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter([
      
      {path: 'pago-test', loadComponent: () => import('./payment-test/payment-test.component').then(m => m.PaymentTestComponent)},
      { path: 'auth', component: AuthPageComponent },
      { path: '', component: HomePageComponent, canActivate: [authGuard] },
      { path: 'formulario', component: FormPageComponent, canActivate: [formGuard], data: { formMode: 'general' } },
      { path: 'ran', redirectTo: 'ran/formulario-2', pathMatch: 'full' },
      { path: 'ran/formulario-2', component: FormPageComponent, canActivate: [formGuard], data: { formMode: 'ran2' } },
      { path: 'ran/formulario-8', component: FormPageComponent, canActivate: [formGuard], data: { formMode: 'ran8' } },
      { path: 'ran/formulario-drones', component: FormPageComponent, canActivate: [formGuard], data: { formMode: 'ranUav' } },
      { path: 'aila/permiso-trabajo', component: AilaFormPageComponent, canActivate: [formGuard] },
      { path: 'financiero/solvencia-pago', component: FinancialFormPageComponent, canActivate: [formGuard] },
      { path: 'revision', component: ReviewPageComponent, canActivate: [revisorGuard] },
      { path: 'supervision', component: SupervisorPageComponent, canActivate: [supervisorGuard] },
      { path: 'admin', component: AdminPageComponent, canActivate: [adminGuard] },
      { path: '**', redirectTo: '' }
    ]),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
