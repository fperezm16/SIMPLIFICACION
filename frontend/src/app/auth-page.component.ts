import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

type Status = { type: 'success' | 'error'; message: string } | null;
type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
const FULL_NAME_PATTERN = /^\p{L}+(?:[-']\p{L}+)?\s+\p{L}+(?:[-']\p{L}+)?$/u;

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = String(control.get('password')?.value || '');
  const confirmPassword = String(control.get('confirmPassword')?.value || '');
  if (!password || !confirmPassword) return null;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-auth-page',
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="auth-shell">
      <div class="auth-card">
        <div class="tabs" *ngIf="mode !== 'reset'">
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
          <div class="helper-row">
            <button type="button" class="link-btn" (click)="switchMode('forgot')" [disabled]="loading || resending">
              Olvidé mi contraseña
            </button>
          </div>
          <div class="helper-row" *ngIf="canResendVerification">
            <button type="button" class="link-btn" (click)="resendVerification()" [disabled]="resending || loading">
              {{ resending ? 'Reenviando...' : 'Reenviar verificación' }}
            </button>
            <small class="muted">Usa esta opción si no te llegó el enlace.</small>
          </div>
        </div>

        <div *ngIf="mode === 'register'">
          <h2>Crea tu cuenta</h2>
          <p class="muted">Completa tu nombre, correo y contraseña.</p>
          <form [formGroup]="registerForm" (ngSubmit)="submitRegister()" class="form-grid">
            <label>Nombre y apellido
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

        <div *ngIf="mode === 'forgot'">
          <h2>Recuperar contraseña</h2>
          <p class="muted">Te enviaremos un enlace para crear una nueva contraseña.</p>
          <form [formGroup]="forgotForm" (ngSubmit)="submitForgotPassword()" class="form-grid">
            <label>Correo
              <input type="email" formControlName="email" autocomplete="email" />
              <span class="error" *ngIf="getForgotError('email')">{{ getForgotError('email') }}</span>
            </label>
            <button type="submit" [disabled]="loading">Enviar enlace</button>
          </form>
          <div class="helper-row">
            <button type="button" class="link-btn" (click)="switchMode('login')" [disabled]="loading">
              Volver al inicio de sesión
            </button>
          </div>
        </div>

        <div *ngIf="mode === 'reset'">
          <h2>Nueva contraseña</h2>
          <p class="muted">Define una nueva contraseña para tu cuenta.</p>
          <form [formGroup]="resetForm" (ngSubmit)="submitResetPassword()" class="form-grid">
            <label>Nueva contraseña
              <input type="password" formControlName="password" autocomplete="new-password" />
              <span class="error" *ngIf="getResetError('password')">{{ getResetError('password') }}</span>
            </label>
            <label>Confirmar contraseña
              <input type="password" formControlName="confirmPassword" autocomplete="new-password" />
              <span class="error" *ngIf="getResetError('confirmPassword')">{{ getResetError('confirmPassword') }}</span>
            </label>
            <button type="submit" [disabled]="loading">Guardar nueva contraseña</button>
          </form>
        </div>

        <div
          *ngIf="status"
          [class.success]="status.type === 'success'"
          [class.error-box]="status.type === 'error'"
          class="status-box">
          {{ status.message }}
          <div *ngIf="devVerifyUrl" class="dev-link">
            <a [href]="devVerifyUrl" target="_blank" rel="noopener">Abrir enlace de verificación (modo desarrollo)</a>
          </div>
          <div *ngIf="devResetUrl" class="dev-link">
            <a [href]="devResetUrl" target="_blank" rel="noopener">Abrir enlace de recuperación (modo desarrollo)</a>
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

  mode: AuthMode = 'login';
  loading = false;
  resending = false;
  status: Status = null;
  canResendVerification = false;
  devVerifyUrl = '';
  devResetUrl = '';
  resetToken = '';

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  forgotForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  registerForm = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(FULL_NAME_PATTERN)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  resetForm = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: passwordMatchValidator });

  ngOnInit(): void {
    const verifyToken = String(this.route.snapshot.queryParamMap.get('verify') || '').trim();
    const resetToken = String(this.route.snapshot.queryParamMap.get('reset') || '').trim();

    if (resetToken) {
      this.mode = 'reset';
      this.resetToken = resetToken;
      return;
    }

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

  switchMode(mode: AuthMode) {
    this.mode = mode;
    this.status = null;
    this.devVerifyUrl = '';
    this.devResetUrl = '';
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
    if (field === 'name' && control.errors?.['pattern']) return 'Ingresa un nombre y un apellido';
    if (control.errors?.['email']) return 'Correo no válido';
    if (control.errors?.['minlength']) return `Mínimo ${control.errors['minlength'].requiredLength} caracteres`;
    return 'Valor no válido';
  }

  getForgotError(field: 'email'): string | null {
    const control = this.forgotForm.get(field);
    if (!control || !control.touched || !control.invalid) return null;
    if (control.errors?.['required']) return 'Obligatorio';
    if (control.errors?.['email']) return 'Correo no válido';
    return 'Valor no válido';
  }

  getResetError(field: 'password' | 'confirmPassword'): string | null {
    const control = this.resetForm.get(field);
    if (!control) return null;
    if (control.touched && control.errors?.['required']) return 'Obligatorio';
    if (control.touched && control.errors?.['minlength']) {
      return `Mínimo ${control.errors['minlength'].requiredLength} caracteres`;
    }
    if (field === 'confirmPassword' && control.touched && this.resetForm.errors?.['passwordMismatch']) {
      return 'Las contraseñas no coinciden';
    }
    return null;
  }

  submitLogin() {
    this.status = null;
    this.devVerifyUrl = '';
    this.devResetUrl = '';
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
    this.devResetUrl = '';
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
    this.devResetUrl = '';
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

  submitForgotPassword() {
    this.status = null;
    this.devVerifyUrl = '';
    this.devResetUrl = '';
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    const email = String(this.forgotForm.value.email || '').trim();
    this.loading = true;
    this.auth.forgotPassword(email).subscribe({
      next: (resp) => {
        this.loading = false;
        this.status = {
          type: 'success',
          message: resp?.message || 'Si existe una cuenta con ese correo, enviaremos un enlace.'
        };
        this.devResetUrl = resp?.dev_reset_url || '';
      },
      error: (err) => {
        this.loading = false;
        this.status = { type: 'error', message: err?.error?.error || 'No se pudo enviar el enlace.' };
      }
    });
  }

  submitResetPassword() {
    this.status = null;
    this.devVerifyUrl = '';
    this.devResetUrl = '';
    if (!this.resetToken) {
      this.status = { type: 'error', message: 'El enlace de recuperación no es válido.' };
      return;
    }
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    const password = String(this.resetForm.value.password || '');
    this.loading = true;
    this.auth.resetPassword(this.resetToken, password).subscribe({
      next: (resp) => {
        this.loading = false;
        this.status = {
          type: 'success',
          message: resp?.message || 'Contraseña actualizada correctamente.'
        };
        this.mode = 'login';
        this.resetToken = '';
        this.resetForm.reset();
        this.clearResetQueryParam();
      },
      error: (err) => {
        this.loading = false;
        this.status = {
          type: 'error',
          message: err?.error?.error || 'No se pudo restablecer la contraseña.'
        };
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

  private clearResetQueryParam() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { reset: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }
}
