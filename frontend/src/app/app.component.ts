import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
    selector: 'app-root',
    imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
    template: `
    <div class="shell">
      <header class="shell__header">
        <div class="brand">
          <img class="brand-logo" src="assets/dgac-header.png" alt="Dirección General de Aeronáutica Civil">
        </div>
        <div class="header__right">
          <nav class="nav" *ngIf="auth.user$ | async as user; else guestNav">
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Inicio</a>
            <a routerLink="/revision" routerLinkActive="active" *ngIf="user.role === 'revisor' || user.role === 'analista' || user.role === 'emisor' || user.role === 'aprobador' || user.role === 'recepcion_aila' || user.role === 'recepcion_avsec' || user.role === 'jefatura_avsec' || user.role === 'jefatura_aila' || user.role === 'avsec_financiero' || user.role === 'admin' || user.role === 'supervisor'">Revisión</a>
            <a routerLink="/busqueda" routerLinkActive="active" *ngIf="user.role === 'revisor' || user.role === 'analista' || user.role === 'emisor' || user.role === 'aprobador' || user.role === 'recepcion_aila' || user.role === 'recepcion_avsec' || user.role === 'jefatura_avsec' || user.role === 'jefatura_aila' || user.role === 'avsec_financiero' || user.role === 'admin' || user.role === 'supervisor'">Búsqueda</a>
            <a routerLink="/supervision" routerLinkActive="active" *ngIf="user.role === 'supervisor' || user.role === 'admin'">Dashboard</a>
            <a routerLink="/admin" routerLinkActive="active" *ngIf="user.role === 'admin'">Admin</a>
            <div class="units-menu" *ngIf="showUnitsMenu && canAccessForms(user.role)">
              <button type="button" class="units-trigger">Unidades</button>
              <div class="units-dropdown">
                <div class="units-submenu">
                  <button type="button" class="submenu-trigger">RAN</button>
                  <div class="units-submenu-panel">
                    <a routerLink="/ran/formulario-2" routerLinkActive="active-link">Reserva, Prórroga o Cesión de Matrícula</a>
                    <a routerLink="/ran/formulario-8" routerLinkActive="active-link">Certificación</a>
                    <a routerLink="/ran/formulario-drones" routerLinkActive="active-link">UAV / RPA - Distintivo</a>
                  </div>
                </div>
                <div class="units-submenu">
                  <button type="button" class="submenu-trigger">FINANCIERO</button>
                  <div class="units-submenu-panel">
                    <a routerLink="/financiero/solvencia-pago" routerLinkActive="active-link">Solicitud de solvencia de pago</a>
                  </div>
                </div>
              </div>
            </div>
          </nav>
          <div class="user" *ngIf="auth.user$ | async as user; else guest">
            <span class="chip">{{ user.name || user.email }} <small class="role">({{ user.role || 'user' }})</small></span>
            <button (click)="logout()">Cerrar sesión</button>
          </div>
          <ng-template #guest>
            <a class="cta" routerLink="/auth">Ingresar</a>
          </ng-template>
          <ng-template #guestNav>
            <nav class="nav">
              <a routerLink="/auth" routerLinkActive="active">Acceso</a>
            </nav>
          </ng-template>
        </div>
      </header>
      <main class="shell__body">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
    styles: [`
    .shell { max-width: 1240px; margin: 0 auto; padding: 6px; }
    .shell__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 16px 18px;
      background: linear-gradient(120deg, rgba(255, 255, 255, 0.95), rgba(243, 250, 255, 0.92));
      box-shadow: var(--shadow-card);
    }
    .brand { flex: 1; text-align: center; }
    .brand-logo { width: 220px; max-width: 100%; height: auto; display: inline-block; }
    .nav { display: flex; gap: 10px; align-items: center; }
    .nav a {
      text-decoration: none;
      color: #173652;
      font-weight: 600;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid transparent;
    }
    .nav a:hover { background: rgba(223, 241, 255, 0.75); border-color: #b7d8ee; }
    .nav a.active {
      background: linear-gradient(90deg, #0b8fd9, #31a8e8);
      color: #fff;
      border-color: #0b8fd9;
    }
    .units-menu { position: relative; }
    .units-trigger {
      border: 1px solid #b9d5e9;
      background: #f7fcff;
      color: #0e3f64;
      font-weight: 600;
      border-radius: 999px;
      padding: 7px 13px;
      cursor: pointer;
    }
    .units-dropdown {
      display: none;
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      min-width: 200px;
      background: linear-gradient(180deg, #0a3452, #112841);
      border-radius: 14px;
      border: 1px solid rgba(126, 181, 218, 0.25);
      padding: 8px;
      box-shadow: 0 20px 48px rgba(8, 37, 61, 0.38);
      z-index: 40;
    }
    .units-menu:hover .units-dropdown,
    .units-menu:focus-within .units-dropdown { display: block; }
    .units-dropdown a {
      display: block;
      color: #f3f4f6;
      text-decoration: none;
      padding: 8px 10px;
      border-radius: 9px;
      font-weight: 600;
    }
    .units-dropdown a:hover { background: rgba(151, 205, 240, 0.15); }
    .units-dropdown a.active-link { background: #0b8fd9; color: #fff; }
    .units-submenu { position: relative; }
    .submenu-trigger {
      width: 100%;
      border: none;
      background: transparent;
      color: #f3f4f6;
      font-weight: 600;
      border-radius: 9px;
      text-align: left;
      padding: 8px 10px;
      cursor: pointer;
    }
    .submenu-trigger:hover { background: rgba(151, 205, 240, 0.15); }
    .units-submenu-panel {
      display: none;
      position: absolute;
      top: 0;
      left: 100%;
      min-width: 220px;
      background: linear-gradient(180deg, #082b45, #133350);
      border-radius: 12px;
      border: 1px solid rgba(126, 181, 218, 0.28);
      padding: 8px;
      box-shadow: 0 18px 42px rgba(8, 37, 61, 0.35);
    }
    .units-submenu:hover > .units-submenu-panel { display: block; }
    .shell__body { margin-top: 16px; }
    .header__right { display: flex; align-items: center; gap: 12px; }
    .chip {
      padding: 7px 12px;
      background: #f1f8ff;
      border: 1px solid #b9d5e9;
      border-radius: 999px;
      font-size: 13px;
      color: #103452;
    }
    .role { color: #577794; }
    .user button {
      padding: 7px 12px;
      border: 1px solid #9ec3dd;
      background: #f8fcff;
      color: #12385a;
      border-radius: 999px;
      cursor: pointer;
      margin-left: 6px;
    }
    .cta {
      padding: 8px 14px;
      background: linear-gradient(90deg, #0b8fd9, #31a8e8);
      color: #fff;
      border-radius: 999px;
      font-weight: 700;
      text-decoration: none;
      border: 1px solid #0b8fd9;
    }
    @media (max-width: 900px) {
      .shell__header { flex-direction: column; align-items: flex-start; }
      .brand { width: 100%; text-align: center; }
      .brand-logo { width: 190px; }
      .header__right { width: 100%; flex-wrap: wrap; }
      .units-dropdown { right: 0; left: auto; }
      .units-submenu-panel { left: 0; top: calc(100% + 6px); }
    }
  `]
})
export class AppComponent {
  auth = inject(AuthService);
  private router = inject(Router);

  get showUnitsMenu() {
    return this.router.url !== '/auth';
  }

  canAccessForms(role: string | null | undefined) {
    return role === 'user' || role === 'admin';
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/auth');
  }
}


