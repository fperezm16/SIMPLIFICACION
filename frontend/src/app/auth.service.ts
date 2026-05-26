import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, tap } from 'rxjs';
import { API_BASE } from './api.config';

export interface AuthUser {
  id: number;
  email: string;
  name?: string | null;
  role?: 'admin' | 'supervisor' | 'revisor' | 'analista' | 'emisor' | 'aprobador' | 'avsec_financiero' | 'recepcion_aila' | 'recepcion_avsec' | 'jefatura_avsec' | 'jefatura_aila' | 'user' | string;
}

export interface RegisterResponse {
  message: string;
  requires_verification?: boolean;
  email_sent?: boolean;
  dev_verify_url?: string;
}

export interface PasswordRecoveryResponse {
  message?: string;
  error?: string;
  dev_reset_url?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly tokenKey = 'auth_token';
  private readonly userKey = 'auth_user';
  private userSubject = new BehaviorSubject<AuthUser | null>(this.restoreUser());
  user$ = this.userSubject.asObservable();

  private readSessionValue(key: string): string | null {
    const current = sessionStorage.getItem(key);
    if (current !== null) return current;

    // Compatibilidad con sesiones antiguas guardadas en localStorage.
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      sessionStorage.setItem(key, legacy);
      localStorage.removeItem(key);
      return legacy;
    }
    return null;
  }

  get currentUser(): AuthUser | null {
    return this.userSubject.value;
  }

  private restoreUser(): AuthUser | null {
    const token = this.readSessionValue(this.tokenKey);
    const rawUser = this.readSessionValue(this.userKey);
    if (token && rawUser) {
      try {
        return JSON.parse(rawUser) as AuthUser;
      } catch {
        return null;
      }
    }
    return null;
  }

  get token(): string | null {
    return this.readSessionValue(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.token;
  }

  register(payload: { name: string; email: string; password: string; }) {
    return this.http.post<RegisterResponse>(`${API_BASE}/auth/register`, payload);
  }

  login(email: string, password: string) {
    return this.http
      .post<{ token: string; user: AuthUser }>(`${API_BASE}/auth/login`, { email, password })
      .pipe(tap(({ token, user }) => this.setSession(token, user)));
  }

  verifyEmail(token: string) {
    return this.http.get<{ message: string }>(`${API_BASE}/auth/verify-email`, { params: { token } });
  }

  resendVerification(email: string) {
    return this.http.post<{ message?: string; error?: string; dev_verify_url?: string }>(
      `${API_BASE}/auth/resend-verification`,
      { email }
    );
  }

  forgotPassword(email: string) {
    return this.http.post<PasswordRecoveryResponse>(`${API_BASE}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, password: string) {
    return this.http.post<{ message: string }>(`${API_BASE}/auth/reset-password`, { token, password });
  }

  logout() {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.userKey);
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.userSubject.next(null);
  }

  private setSession(token: string, user: AuthUser) {
    sessionStorage.setItem(this.tokenKey, token);
    sessionStorage.setItem(this.userKey, JSON.stringify(user));
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.userSubject.next(user);
  }
}
