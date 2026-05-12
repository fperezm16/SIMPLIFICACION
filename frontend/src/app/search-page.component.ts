import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API_BASE } from './api.config';
import { Submission } from './submission.model';

@Component({
  selector: 'app-search-page',
  imports: [CommonModule, FormsModule],
  template: `
    <section class="search-page">
      <header class="head">
        <div>
          <h2>Búsqueda de procesos</h2>
          <p class="muted">Busca procesos por correlativo, nombre, correo, NIT, matrícula o texto relacionado.</p>
        </div>
      </header>

      <section class="search-card">
        <div class="filters">
          <label>
            Buscar
            <input [(ngModel)]="query" type="text" placeholder="Ej. FINANCIERO-06-2026, matrícula, correo o nombre" (keyup.enter)="search()">
          </label>
          <label>
            Unidad
            <select [(ngModel)]="selectedUnit">
              <option value="TODAS">Todas</option>
              <option *ngFor="let unit of units" [value]="unit">{{ unit }}</option>
            </select>
          </label>
          <div class="actions">
            <button type="button" (click)="search()" [disabled]="loading">Buscar</button>
            <button type="button" class="secondary" (click)="clearSearch()" [disabled]="loading">Limpiar</button>
          </div>
        </div>
      </section>

      <div class="status error" *ngIf="error">{{ error }}</div>
      <div class="status" *ngIf="loading">Buscando procesos...</div>
      <div class="status" *ngIf="!loading && searched && !results.length">No se encontraron procesos.</div>

      <section class="results" *ngIf="results.length">
        <article class="result-card" *ngFor="let row of results">
          <button type="button" class="result-head" (click)="toggle(row.id)">
            <div>
              <strong>{{ row.registro_codigo || ('REG-' + row.id) }}</strong>
              <p>{{ row.gestion_nombre || 'Proceso sin nombre' }}</p>
            </div>
            <div class="meta">
              <span class="chip">{{ row.unidad_clave || 'GENERAL' }}</span>
              <span class="state">{{ row.process_label || stateLabel(row) }}</span>
            </div>
          </button>

          <div class="result-summary">
            <span><strong>Usuario:</strong> {{ row.nombre_propietario || 'Sin nombre' }}</span>
            <span><strong>Correo:</strong> {{ row.correo || 'Sin correo' }}</span>
            <span><strong>Fecha:</strong> {{ row.created_at | date:'short' }}</span>
          </div>

          <div class="result-detail" *ngIf="expandedId === row.id">
            <div class="detail-grid">
              <div><strong>Estado:</strong> {{ row.process_label || stateLabel(row) }}</div>
              <div><strong>Persona:</strong> {{ row.persona_tipo || 'N/D' }}</div>
              <div><strong>NIT:</strong> {{ row.nit || 'N/D' }}</div>
              <div><strong>Teléfono:</strong> {{ row.telefono || 'N/D' }}</div>
              <div><strong>Correo:</strong> {{ row.correo || 'N/D' }}</div>
              <div><strong>Matrícula:</strong> {{ row.matricula_tg || row.matricula_tg_nueva || 'N/D' }}</div>
              <div><strong>Analista:</strong> {{ row.assigned_analista_name || row.assigned_analista_email || 'Sin asignar' }}</div>
              <div><strong>Emisor:</strong> {{ row.assigned_emisor_name || row.assigned_emisor_email || 'Sin asignar' }}</div>
              <div><strong>Aprobador:</strong> {{ row.assigned_aprobador_name || row.assigned_aprobador_email || 'Sin asignar' }}</div>
              <div><strong>Fecha envío a emisor:</strong> {{ row.sent_to_emisor_at ? (row.sent_to_emisor_at | date:'short') : 'N/D' }}</div>
              <div><strong>Fecha envío a aprobador:</strong> {{ row.sent_to_aprobador_at ? (row.sent_to_aprobador_at | date:'short') : 'N/D' }}</div>
              <div><strong>Fecha aprobación:</strong> {{ row.approved_at ? (row.approved_at | date:'short') : 'N/D' }}</div>
              <div><strong>Fecha entrega/finalización:</strong> {{ row.delivered_at ? (row.delivered_at | date:'short') : 'N/D' }}</div>
            </div>
            <div class="detail-note" *ngIf="row.especificaciones"><strong>Observaciones del formulario:</strong> {{ row.especificaciones }}</div>
          </div>
        </article>
      </section>
    </section>
  `,
  styles: [`
    .search-page {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 18px;
      background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(246,252,255,0.96));
      box-shadow: var(--shadow-card);
    }
    .head h2 { margin: 0 0 4px; }
    .muted { margin: 0; color: var(--muted); }
    .search-card {
      margin-top: 18px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 16px;
      background: rgba(255,255,255,0.92);
    }
    .filters {
      display: grid;
      grid-template-columns: minmax(320px, 1.8fr) minmax(180px, 0.7fr) auto;
      gap: 12px;
      align-items: end;
    }
    label {
      display: grid;
      gap: 6px;
      font-weight: 600;
      color: #173652;
    }
    input, select {
      width: 100%;
      border: 1px solid #c6d8e6;
      border-radius: 12px;
      padding: 10px 12px;
      font: inherit;
      color: #173652;
      background: #fff;
    }
    .actions {
      display: flex;
      gap: 10px;
    }
    button {
      padding: 10px 14px;
      border: 1px solid #9ec3dd;
      background: #f8fcff;
      color: #12385a;
      border-radius: 999px;
      cursor: pointer;
      font-weight: 700;
    }
    button.secondary {
      background: #fff;
    }
    .status {
      margin-top: 14px;
      color: var(--muted);
    }
    .status.error {
      color: #b91c1c;
    }
    .results {
      display: grid;
      gap: 14px;
      margin-top: 18px;
    }
    .result-card {
      border: 1px solid #d7e6f1;
      border-radius: 16px;
      background: #fff;
      overflow: hidden;
    }
    .result-head {
      width: 100%;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border: 0;
      border-bottom: 1px solid #e3eef6;
      border-radius: 0;
      background: linear-gradient(180deg, #fcfeff, #f6fbff);
      padding: 14px 16px;
      text-align: left;
    }
    .result-head p {
      margin: 4px 0 0;
      color: var(--muted);
      font-weight: 500;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: flex-start;
      justify-content: flex-end;
    }
    .chip, .state {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      border: 1px solid #b9d5e9;
      background: #f3f9fe;
      color: #0f3e63;
    }
    .result-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding: 12px 16px;
      color: #365067;
    }
    .result-detail {
      border-top: 1px dashed #d7e6f1;
      padding: 14px 16px 16px;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 18px;
      color: #173652;
    }
    .detail-note {
      margin-top: 12px;
      color: #365067;
    }
    @media (max-width: 900px) {
      .filters {
        grid-template-columns: 1fr;
      }
      .actions {
        justify-content: flex-start;
      }
      .result-head {
        flex-direction: column;
      }
      .meta {
        justify-content: flex-start;
      }
      .detail-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class SearchPageComponent {
  private http = inject(HttpClient);
  readonly apiBase = API_BASE;
  readonly units = ['GENERAL', 'RAN', 'DVSO', 'AILA', 'FINANCIERO'];
  query = '';
  selectedUnit = 'TODAS';
  loading = false;
  searched = false;
  error = '';
  expandedId: number | null = null;
  results: Submission[] = [];

  search() {
    this.loading = true;
    this.searched = true;
    this.error = '';
    this.expandedId = null;
    let params = new HttpParams();
    if (this.query.trim()) params = params.set('q', this.query.trim());
    if (this.selectedUnit && this.selectedUnit !== 'TODAS') params = params.set('unit', this.selectedUnit);
    this.http.get<Submission[]>(`${this.apiBase}/submissions/search`, { params }).subscribe({
      next: (data) => {
        this.results = data;
        this.loading = false;
      },
      error: (err) => {
        this.results = [];
        this.loading = false;
        this.error = err?.error?.error || 'No se pudo realizar la búsqueda.';
      }
    });
  }

  clearSearch() {
    this.query = '';
    this.selectedUnit = 'TODAS';
    this.results = [];
    this.error = '';
    this.searched = false;
    this.expandedId = null;
  }

  toggle(id: number) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  stateLabel(row: Submission) {
    if (row.returned_at) return 'Devuelto';
    if (row.returned_to_analista_at) return 'Devuelto a analista';
    if (row.delivered_at) return 'Finalizado';
    if (row.approved_at) return 'Aprobado';
    if (row.assigned_aprobador_id || row.sent_to_aprobador_at) return 'En aprobación';
    if (row.assigned_emisor_id || row.sent_to_emisor_at) return 'En emisor';
    if (row.assigned_analista_id) return 'Asignado';
    if (row.receptor_opened_at) return 'Recibido';
    return 'Enviado';
  }
}
