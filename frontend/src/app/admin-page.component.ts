import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API_BASE } from './api.config';

type UserRow = {
  id: number;
  name: string | null;
  email: string;
  role: string;
  unit_access?: string[] | null;
  created_at: string;
};

@Component({
    selector: 'app-admin-page',
    imports: [CommonModule, FormsModule],
    template: `
    <section class="card">
      <header class="head">
        <div>
          <h2>Administración de usuarios</h2>
          <p class="muted">Solo admin: crea usuarios, asigna roles y define unidades por perfil.</p>
        </div>
        <button (click)="fetch()" [disabled]="loading">Refrescar</button>
      </header>

      <section class="create-box">
        <h3>Crear usuario</h3>
        <div class="grid">
          <label>Nombre
            <input [(ngModel)]="createForm.name" placeholder="Nombre (opcional)" />
          </label>
          <label>Correo
            <input [(ngModel)]="createForm.email" type="email" placeholder="usuario@correo.com" />
          </label>
          <label>Contraseña
            <input [(ngModel)]="createForm.password" type="password" placeholder="Mínimo 8 caracteres" />
          </label>
          <label>Rol
            <select [(ngModel)]="createForm.role" (ngModelChange)="onCreateRoleChange()">
              <option *ngFor="let r of roles" [value]="r">{{ r }}</option>
            </select>
          </label>
        </div>
        <div class="units-grid" *ngIf="isUnitRole(createForm.role)">
          <span>Unidades permitidas:</span>
          <label *ngFor="let unit of unitOptions">
            <input
              type="checkbox"
              [checked]="hasUnit(createForm.unit_access, unit)"
              (change)="toggleCreateUnit(unit, $any($event.target).checked)"
            />
            {{ unit }}
          </label>
        </div>
        <button (click)="createUser()" [disabled]="loading">Crear usuario</button>
      </section>

      <div *ngIf="error" class="error">{{ error }}</div>
      <div *ngIf="message" class="ok">{{ message }}</div>

      <div class="table-wrap" *ngIf="users.length; else empty">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Unidades</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let u of users">
              <td>{{ u.email }}</td>
              <td>{{ u.name || 'N/D' }}</td>
              <td>
                <select [(ngModel)]="u.role">
                  <option *ngFor="let r of roles" [value]="r">{{ r }}</option>
                </select>
              </td>
              <td>
                <div class="units-inline" *ngIf="isUnitRole(u.role); else allUnits">
                  <label *ngFor="let unit of unitOptions">
                    <input
                      type="checkbox"
                      [checked]="hasUnit(u.unit_access, unit)"
                      (change)="toggleUserUnit(u, unit, $any($event.target).checked)"
                    />
                    {{ unit }}
                  </label>
                </div>
                <ng-template #allUnits>
                  <span class="muted">Todas</span>
                </ng-template>
              </td>
              <td>{{ u.created_at | date:'short' }}</td>
              <td class="actions">
                <button class="primary" (click)="updateRole(u)" [disabled]="loading">Guardar rol</button>
                <button
                  class="primary"
                  *ngIf="isUnitRole(u.role)"
                  (click)="updateUnits(u)"
                  [disabled]="loading"
                >
                  Guardar unidades
                </button>
                <button class="danger" (click)="remove(u)" [disabled]="loading">Borrar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ng-template #empty>
        <p class="muted">No hay usuarios.</p>
      </ng-template>
    </section>
  `,
    styles: [`
    .card {
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 252, 255, 0.96));
      box-shadow: var(--shadow-card);
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h2 { margin: 0 0 4px; }
    h3 { margin: 0 0 10px; font-size: 15px; }
    .muted { color: var(--muted); margin: 0; }
    .create-box { margin-top: 12px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: #f7fbff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-bottom: 10px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
    input, select { padding: 8px; border: 1px solid var(--border); border-radius: 10px; }
    .units-grid { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; margin: 6px 0 10px; font-size: 13px; }
    .units-grid label { display: inline-flex; flex-direction: row; align-items: center; gap: 6px; margin: 0; }
    .units-grid input { width: auto; margin: 0; padding: 0; }
    .table-wrap { overflow: auto; margin-top: 12px; border: 1px solid var(--border); border-radius: 12px; background: #fff; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; border-bottom: 1px solid var(--border, #e5e7eb); text-align: left; }
    th { background: #edf6fd; position: sticky; top: 0; color: #18466d; font-weight: 700; }
    .actions { display: flex; gap: 8px; }
    .units-inline { display: grid; grid-template-columns: repeat(2, minmax(120px, 1fr)); gap: 6px 10px; min-width: 230px; }
    .units-inline label { display: inline-flex; flex-direction: row; align-items: center; gap: 6px; margin: 0; font-size: 12px; }
    .units-inline input { width: auto; margin: 0; padding: 0; }
    .primary { background: #e8f4ff; border: 1px solid #8fc5e8; color: #0c4672; padding: 6px 10px; border-radius: 999px; cursor: pointer; font-weight: 600; }
    .danger { background: #fff1f2; border: 1px solid #fda4af; color: #881337; padding: 6px 10px; border-radius: 999px; cursor: pointer; font-weight: 600; }
    button[disabled] { opacity: 0.6; cursor: not-allowed; }
    .error { color: #b91c1c; margin-top: 8px; }
    .ok { color: #166534; margin-top: 8px; }
  `]
})
export class AdminPageComponent implements OnInit {
  private http = inject(HttpClient);
  readonly apiBase = API_BASE;
  readonly roles = ['user', 'revisor', 'analista', 'emisor', 'aprobador', 'admin', 'supervisor'];
  readonly unitOptions = ['GENERAL', 'RAN', 'DVSO', 'AILA', 'FINANCIERO'];
  private readonly unitRoles = new Set(['revisor', 'analista', 'emisor', 'aprobador']);

  users: UserRow[] = [];
  loading = false;
  error = '';
  message = '';
  createForm = {
    name: '',
    email: '',
    password: '',
    role: 'user',
    unit_access: [...this.unitOptions]
  };

  ngOnInit(): void {
    this.fetch();
  }

  isUnitRole(role: string) {
    return this.unitRoles.has(String(role || '').toLowerCase());
  }

  hasUnit(unitAccess: string[] | null | undefined, unit: string) {
    return this.normalizeUnits(unitAccess).includes(unit);
  }

  toggleCreateUnit(unit: string, checked: boolean) {
    this.createForm.unit_access = this.toggleUnit(this.createForm.unit_access, unit, checked);
  }

  toggleUserUnit(user: UserRow, unit: string, checked: boolean) {
    user.unit_access = this.toggleUnit(user.unit_access, unit, checked);
  }

  onCreateRoleChange() {
    if (!this.isUnitRole(this.createForm.role)) {
      this.createForm.unit_access = [...this.unitOptions];
      return;
    }
    if (!this.createForm.unit_access.length) {
      this.createForm.unit_access = [...this.unitOptions];
    }
  }

  private toggleUnit(units: string[] | null | undefined, unit: string, checked: boolean) {
    const current = this.normalizeUnits(units);
    if (checked) {
      if (current.includes(unit)) return current;
      return [...current, unit];
    }
    return current.filter((u) => u !== unit);
  }

  private normalizeUnits(units: string[] | null | undefined) {
    const allowed = new Set(this.unitOptions);
    if (!Array.isArray(units)) return [...this.unitOptions];
    const normalized = units
      .map((u) => String(u || '').trim().toUpperCase())
      .filter((u) => allowed.has(u));
    return Array.from(new Set(normalized));
  }

  fetch() {
    this.loading = true;
    this.error = '';
    this.message = '';
    this.http.get<UserRow[]>(`${this.apiBase}/users`).subscribe({
      next: (rows) => {
        this.users = rows.map((row) => ({ ...row, unit_access: this.normalizeUnits(row.unit_access) }));
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.error || 'No se pudieron cargar usuarios.';
        this.loading = false;
      }
    });
  }

  createUser() {
    this.error = '';
    this.message = '';
    if (!this.createForm.email || !this.createForm.password || !this.createForm.role) {
      this.error = 'Completa correo, contraseña y rol.';
      return;
    }
    const isRestricted = this.isUnitRole(this.createForm.role);
    const selectedUnits = this.normalizeUnits(this.createForm.unit_access);
    if (isRestricted && !selectedUnits.length) {
      this.error = 'Debes seleccionar al menos una unidad.';
      return;
    }
    this.loading = true;
    this.http.post<UserRow>(`${this.apiBase}/users`, {
      ...this.createForm,
      unit_access: isRestricted ? selectedUnits : this.unitOptions
    }).subscribe({
      next: () => {
        this.loading = false;
        this.message = 'Usuario creado.';
        this.createForm = { name: '', email: '', password: '', role: 'user', unit_access: [...this.unitOptions] };
        this.fetch();
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'No se pudo crear el usuario.';
      }
    });
  }

  updateRole(u: UserRow) {
    this.error = '';
    this.message = '';
    this.loading = true;
    this.http.patch<UserRow>(`${this.apiBase}/users/${u.id}/role`, { role: u.role }).subscribe({
      next: (updated) => {
        u.unit_access = this.normalizeUnits(updated.unit_access);
        this.loading = false;
        this.message = 'Rol actualizado.';
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'No se pudo actualizar el rol.';
      }
    });
  }

  updateUnits(u: UserRow) {
    this.error = '';
    this.message = '';
    if (!this.isUnitRole(u.role)) {
      this.error = 'Solo aplica para revisor, analista, emisor o aprobador.';
      return;
    }
    const units = this.normalizeUnits(u.unit_access);
    if (!units.length) {
      this.error = 'Debes seleccionar al menos una unidad.';
      return;
    }
    this.loading = true;
    this.http.patch<UserRow>(`${this.apiBase}/users/${u.id}/units`, { unit_access: units }).subscribe({
      next: (updated) => {
        u.unit_access = this.normalizeUnits(updated.unit_access);
        this.loading = false;
        this.message = 'Unidades actualizadas.';
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'No se pudieron actualizar las unidades.';
      }
    });
  }

  remove(u: UserRow) {
    if (!confirm(`Borrar usuario ${u.email}?`)) return;
    this.loading = true;
    this.error = '';
    this.message = '';
    this.http.delete(`${this.apiBase}/users/${u.id}`).subscribe({
      next: () => {
        this.loading = false;
        this.users = this.users.filter((x) => x.id !== u.id);
        this.message = 'Usuario eliminado.';
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'No se pudo borrar el usuario.';
      }
    });
  }
}

