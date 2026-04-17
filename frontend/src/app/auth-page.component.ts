import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

type Status = { type: 'success' | 'error'; message: string } | null;

@Component({
    selector: 'app-auth-page',
    imports: [CommonModule, ReactiveFormsModule],
    template: `
    <section class="auth-shell">
      <div class="auth-card">
        <div class="tabs">
          <button [class.active]="mode === 'login'" (click)="switchMode('login')">Iniciar sesión</button>
          <button [class.active]="mode === 'register'" (click)="switchMode('register')">Crear cuenta</button>
        </div>

        <div *ngIf="mode === 'login'">
          <h2>Bienvenido de nuevo</h2>
          <p class="muted">Ingresa con tu correo y contraseña.</p>
          <form [formGroup]="loginForm" (ngSubmit)="submitLogin()" class="form-grid">
            <label>Correo
              <input type="email" formControlName="email" autocomplete="email" />
              <span class="error" *ngIf="getLoginError('email')">{{ getLoginError('email') }}</span>
            </label>
            <label>Contraseña
              <input type="password" formControlName="password" autocomplete="current-password" />
              <span class="error" *ngIf="getLoginError('password')">{{ getLoginError('password') }}</span>
            </label>
            <button type="submit" [disabled]="loading">Entrar</button>
          </form>
          <div class="helper-row" *ngIf="canResendVerification">
            <button type="button" class="link-btn" (click)="resendVerification()" [disabled]="resending || loading">
              {{ resending ? 'Reenviando...' : 'Reenviar verificación' }}
            </button>
            <small class="muted">Usa esta opción si no te llegó el enlace.</small>
          </div>
        </div>

        <div *ngIf="mode === 'register'">
          <h2>Crea tu cuenta</h2>
          <p class="muted">Solo necesitas correo y contraseña.</p>
          <form [formGroup]="registerForm" (ngSubmit)="submitRegister()" class="form-grid">
            <label>Nombre (opcional)
              <input type="text" formControlName="name" autocomplete="name" />
              <span class="error" *ngIf="getRegisterError('name')">{{ getRegisterError('name') }}</span>
            </label>
            <label>Correo
              <input type="email" formControlName="email" autocomplete="email" />
              <span class="error" *ngIf="getRegisterError('email')">{{ getRegisterError('email') }}</span>
            </label>
            <label>Contraseña
              <input type="password" formControlName="password" autocomplete="new-password" />
              <span class="error" *ngIf="getRegisterError('password')">{{ getRegisterError('password') }}</span>
            </label>
            <button type="submit" [disabled]="loading">Crear cuenta</button>
          </form>
        </div>

        <div *ngIf="status" [class.success]="status.type === 'success'" [class.error-box]="status.type === 'error'" class="status-box">
          {{ status.message }}
          <div *ngIf="devVerifyUrl" class="dev-link">
            <a [href]="devVerifyUrl" target="_blank" rel="noopener">Abrir enlace de verificación (modo desarrollo)</a>
          </div>
        </div>
      </div>
    </section>
  `,
    styles: [`
    .auth-shell { max-width: 520px; margin: 40px auto; padding: 0 16px; }
    .auth-card {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(247, 252, 255, 0.95));
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: var(--shadow-card);
    }
    .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .tabs button { padding: 10px 12px; border: 1px solid var(--border); background: #f3f9fd; border-radius: 999px; cursor: pointer; font-weight: 700; color: #104164; }
    .tabs button.active { background: linear-gradient(90deg, #0b8fd9, #31a8e8); color: #fff; border-color: #0b8fd9; }
    h2 { margin: 4px 0; }
    .muted { color: var(--muted); margin: 0 0 10px; }
    .form-grid { display: grid; gap: 10px; margin-top: 8px; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
    input { padding: 10px; border: 1px solid var(--border); border-radius: 10px; font-size: 14px; }
    button[type="submit"] { padding: 10px 12px; border: 1px solid #0b8fd9; background: linear-gradient(90deg, #0b8fd9, #31a8e8); color: #fff; border-radius: 999px; cursor: pointer; font-weight: 700; }
    button[disabled] { opacity: 0.6; cursor: not-allowed; }
    .helper-row { margin-top: 8px; display: grid; gap: 4px; }
    .link-btn {
      justify-self: start;
      border: none;
      background: none;
      color: #2563eb;
      font-weight: 600;
      padding: 0;
      cursor: pointer;
      text-decoration: underline;
    }
    .error { color: #b91c1c; font-size: 12px; }
    .status-box { margin-top: 12px; padding: 10px; border-radius: 10px; font-size: 14px; }
    .status-box.success { background: #ecfdf3; color: #166534; border: 1px solid #bbf7d0; }
    .status-box.error-box { background: #fef2f2; color: #b91c1c; border: 1px solid #fecdd3; }
    .dev-link { margin-top: 8px; font-size: 12px; }
    .dev-link a { color: inherit; font-weight: 600; }
  `]
})
export class AuthPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  mode: 'login' | 'register' = 'login';
  loading = false;
  resending = false;
  status: Status = null;
  canResendVerification = false;
  devVerifyUrl = '';

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  registerForm = this.fb.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  ngOnInit(): void {
    const verifyToken = String(this.route.snapshot.queryParamMap.get('verify') || '').trim();
    if (!verifyToken) return;

    this.mode = 'login';
    this.loading = true;
    this.auth.verifyEmail(verifyToken).subscribe({
      next: (resp) => {
        this.loading = false;
        this.status = { type: 'success', message: resp?.message || 'Correo verificado. Ya puedes iniciar sesión.' };
        this.clearVerifyQueryParam();
      },
      error: (err) => {
        this.loading = false;
        this.status = { type: 'error', message: err?.error?.error || 'No se pudo verificar el correo.' };
        this.canResendVerification = true;
        this.clearVerifyQueryParam();
      }
    });
  }

  switchMode(mode: 'login' | 'register') {
    this.mode = mode;
    this.status = null;
    this.devVerifyUrl = '';
  }

  getLoginError(field: 'email' | 'password'): string | null {
    const control = this.loginForm.get(field);
    if (!control || !control.touched || !control.invalid) return null;
    if (control.errors?.['required']) return 'Obligatorio';
    if (control.errors?.['email']) return 'Correo no válido';
    return 'Valor no válido';
  }

  getRegisterError(field: 'email' | 'password' | 'name'): string | null {
    const control = this.registerForm.get(field);
    if (!control || !control.touched || !control.invalid) return null;
    if (control.errors?.['required']) return 'Obligatorio';
    if (control.errors?.['email']) return 'Correo no válido';
    if (control.errors?.['minlength']) return `Mínimo ${control.errors['minlength'].requiredLength} caracteres`;
    return 'Valor no válido';
  }

  submitLogin() {
    this.status = null;
    this.devVerifyUrl = '';
    this.canResendVerification = false;
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    const { email, password } = this.loginForm.value;
    this.loading = true;
    this.auth.login(email || '', password || '').subscribe({
      next: () => {
        this.loading = false;
        this.router.navigateByUrl('/');
      },
      error: (err) => {
        this.loading = false;
        this.status = { type: 'error', message: err?.error?.error || 'No se pudo iniciar sesión.' };
        this.canResendVerification = err?.error?.code === 'EMAIL_NOT_VERIFIED';
      }
    });
  }

  submitRegister() {
    this.status = null;
    this.devVerifyUrl = '';
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const { name, email, password } = this.registerForm.value;
    this.loading = true;
    this.auth.register({
      name: name || '',
      email: email || '',
      password: password || ''
    }).subscribe({
      next: (resp) => {
        this.loading = false;
        this.status = {
          type: 'success',
          message: resp.message || 'Cuenta creada. Revisa tu correo para verificarla.'
        };
        this.devVerifyUrl = resp.dev_verify_url || '';
        this.mode = 'login';
        this.canResendVerification = resp.requires_verification === true;
        this.loginForm.patchValue({ email: email || '' });
      },
      error: (err) => {
        this.loading = false;
        this.status = { type: 'error', message: err?.error?.error || 'No se pudo registrar el usuario.' };
      }
    });
  }

  resendVerification() {
    this.devVerifyUrl = '';
    const email = String(this.loginForm.value.email || this.registerForm.value.email || '').trim();
    if (!email) {
      this.status = { type: 'error', message: 'Ingresa tu correo para reenviar la verificación.' };
      return;
    }

    this.resending = true;
    this.auth.resendVerification(email).subscribe({
      next: (resp) => {
        this.resending = false;
        this.status = { type: 'success', message: resp?.message || 'Se envió el enlace de verificación.' };
        this.devVerifyUrl = resp?.dev_verify_url || '';
      },
      error: (err) => {
        this.resending = false;
        this.status = { type: 'error', message: err?.error?.error || 'No se pudo reenviar la verificación.' };
        this.devVerifyUrl = err?.error?.dev_verify_url || '';
      }
    });
  }

  private clearVerifyQueryParam() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { verify: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }
}
