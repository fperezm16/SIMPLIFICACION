import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_BASE } from './api.config';

export interface Analyst {
  id: number;
  email: string;
  name?: string | null;
  unit_access?: string[];
}

@Injectable({ providedIn: 'root' })
export class AnalystsService {
  private http = inject(HttpClient);

  list() {
    return this.http.get<Analyst[]>(`${API_BASE}/analistas`);
  }

  listApprovers() {
    return this.http.get<Analyst[]>(`${API_BASE}/aprobadores`);
  }

  listEmitters() {
    return this.http.get<Analyst[]>(`${API_BASE}/emisores`);
  }
}
