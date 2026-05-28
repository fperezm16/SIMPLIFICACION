import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { ReviewPanelComponent } from './review-panel.component';
import { Submission } from './submission.model';
import { API_BASE } from './api.config';

type FinancialApprovedHistoryItem = {
  id: number;
  registro_codigo?: string | null;
  gestion_nombre?: string | null;
  nombre_propietario?: string | null;
  correo?: string | null;
  approved_log_at?: string | null;
};

type FinancialApprovedHistoryLog = {
  id: number;
  event_label: string;
  event_detail?: string | null;
  actor_role?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  created_at: string;
};

type FinancialApprovedHistoryDetail = {
  submission: {
    id: number;
    registro_codigo?: string | null;
    gestion_nombre?: string | null;
    nombre_propietario?: string | null;
    correo?: string | null;
    created_at?: string | null;
    sent_to_emisor_at?: string | null;
    sent_to_aprobador_at?: string | null;
    approved_at?: string | null;
    delivered_at?: string | null;
    assigned_analista_name?: string | null;
    assigned_emisor_name?: string | null;
    assigned_aprobador_name?: string | null;
  };
  logs: FinancialApprovedHistoryLog[];
};

type ArchiveItem = {
  id: number;
  registro_codigo?: string | null;
  gestion_nombre?: string | null;
  unidad_clave?: string | null;
  nombre_propietario?: string | null;
  correo?: string | null;
  telefono?: string | null;
  persona_tipo?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  delivered_at?: string | null;
  assigned_analista_name?: string | null;
  assigned_emisor_name?: string | null;
  assigned_aprobador_name?: string | null;
  approved_by_name?: string | null;
  approved_by_email?: string | null;
  delivered_by_name?: string | null;
  delivered_by_email?: string | null;
  analyst_pdf_filename?: string | null;
  signed_pdf_filename?: string | null;
  carta_representacion_filename?: string | null;
  dpi_filename?: string | null;
};

@Component({
    selector: 'app-review-page',
    imports: [CommonModule, ReviewPanelComponent],
    template: `
    <section class="review-page">
      <header class="head">
        <div>
          <h2>M&oacute;dulo de revisi&oacute;n</h2>
          <p class="muted">Acceso autenticado para consultar y corregir registros.</p>
        </div>
        <button (click)="fetch()" [disabled]="loading">Recargar</button>
      </header>

      <div class="tabs" *ngIf="showArchiveTab()">
        <button type="button" class="tab" [class.active]="activeTab === 'review'" (click)="activeTab = 'review'">Revisi&oacute;n</button>
        <button type="button" class="tab" [class.active]="activeTab === 'archive'" (click)="openArchiveTab()">Archivo</button>
        <button type="button" class="tab" *ngIf="showFinancialApprovedHistory()" [class.active]="activeTab === 'approved'" (click)="openApprovedTab()">Procesos aprobados</button>
      </div>

      <section class="history-card" *ngIf="activeTab === 'archive'">
        <div class="history-head">
          <div>
            <h3>Archivo de procesos entregados</h3>
            <p class="muted">Procesos finalizados y entregados al usuario con responsables y aprobaciones.</p>
          </div>
        </div>
        <div class="history-empty" *ngIf="!archiveItems.length && !loadingArchive">A&uacute;n no hay procesos archivados.</div>
        <div class="history-empty" *ngIf="loadingArchive">Cargando archivo...</div>
        <div class="history-list" *ngIf="archiveItems.length">
          <article class="history-item" *ngFor="let row of archiveItems">
            <div class="history-top">
              <strong>{{ row.registro_codigo || ('#' + row.id) }}</strong>
              <span>{{ row.delivered_at | date:'short' }}</span>
            </div>
            <div class="history-body">
              <div><span>Proceso:</span> {{ row.gestion_nombre || 'Sin nombre' }}</div>
              <div><span>Unidad:</span> {{ row.unidad_clave || 'GENERAL' }}</div>
              <div><span>Usuario:</span> {{ row.nombre_propietario || 'Sin nombre' }}</div>
              <div><span>Correo:</span> {{ row.correo || 'Sin correo' }}</div>
            </div>
            <div class="detail-grid archive-detail">
              <div><span>Fecha de envío:</span> {{ row.created_at | date:'short' }}</div>
              <div><span>Fecha de aprobación:</span> {{ row.approved_at ? (row.approved_at | date:'short') : 'No aplica' }}</div>
              <div><span>Fecha de entrega:</span> {{ row.delivered_at ? (row.delivered_at | date:'short') : 'No aplica' }}</div>
              <div><span>Tipo de persona:</span> {{ row.persona_tipo === 'juridica' ? 'Jurídica' : 'Individual' }}</div>
              <div><span>Analista:</span> {{ row.assigned_analista_name || 'No aplica' }}</div>
              <div><span>Emisor:</span> {{ row.assigned_emisor_name || 'No aplica' }}</div>
              <div><span>Aprobador asignado:</span> {{ row.assigned_aprobador_name || 'No aplica' }}</div>
              <div><span>Aprobado por:</span> {{ row.approved_by_name || row.approved_by_email || 'No aplica' }}</div>
              <div><span>Entregado por:</span> {{ row.delivered_by_name || row.delivered_by_email || 'No aplica' }}</div>
              <div><span>Teléfono:</span> {{ row.telefono || 'N/D' }}</div>
            </div>
            <div class="archive-documents" *ngIf="archiveDocuments(row).length">
              <span class="archive-documents-label">Documentos</span>
              <div class="archive-documents-list">
                <button type="button" class="history-doc-link" *ngFor="let doc of archiveDocuments(row)" (click)="openArchiveDocument(row, doc.key)">
                  {{ doc.label }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="history-card" *ngIf="showFinancialApprovedHistory() && activeTab === 'approved'">
        <div class="history-head">
          <div>
            <h3>Procesos aprobados en Financiero</h3>
            <p class="muted">Historial de procesos aprobados por el Aprobador.</p>
          </div>
        </div>
        <div class="history-empty" *ngIf="!approvedHistory.length && !loadingHistory">A&uacute;n no hay procesos aprobados registrados.</div>
        <div class="history-empty" *ngIf="loadingHistory">Cargando procesos aprobados...</div>
        <div class="history-list" *ngIf="approvedHistory.length">
          <article class="history-item" *ngFor="let row of approvedHistory">
            <div class="history-top">
              <button type="button" class="history-link" (click)="toggleApprovedDetail(row)">
                {{ row.registro_codigo || ('FIN-' + row.id) }}
              </button>
              <span>{{ row.approved_log_at | date:'short' }}</span>
            </div>
            <div class="history-body">
              <div><span>Proceso:</span> {{ row.gestion_nombre || 'Solicitud de solvencia de pago' }}</div>
              <div><span>Usuario:</span> {{ row.nombre_propietario || 'Sin nombre' }}</div>
              <div><span>Correo:</span> {{ row.correo || 'Sin correo' }}</div>
            </div>
            <div class="history-detail" *ngIf="expandedApprovedId === row.id">
              <div class="history-empty" *ngIf="loadingApprovedDetail">Cargando detalle...</div>
              <div class="detail-grid" *ngIf="!loadingApprovedDetail && approvedDetailMap[row.id]?.submission as detail">
                <div><span>Fecha de env&iacute;o:</span> {{ detail.created_at | date:'short' }}</div>
                <div><span>Fecha de env&iacute;o a emisor:</span> {{ detail.sent_to_emisor_at ? (detail.sent_to_emisor_at | date:'short') : 'No aplica' }}</div>
                <div><span>Fecha de env&iacute;o a aprobador:</span> {{ detail.sent_to_aprobador_at ? (detail.sent_to_aprobador_at | date:'short') : 'No aplica' }}</div>
                <div><span>Fecha de aprobaci&oacute;n:</span> {{ detail.approved_at ? (detail.approved_at | date:'short') : 'Pendiente' }}</div>
                <div><span>Estado:</span> {{ detail.approved_at ? 'Aprobado' : 'En proceso' }}</div>
                <div><span>Analista:</span> {{ detail.assigned_analista_name || 'Sin asignar' }}</div>
                <div><span>Emisor:</span> {{ detail.assigned_emisor_name || 'Sin asignar' }}</div>
                <div><span>Aprobador:</span> {{ detail.assigned_aprobador_name || 'Sin asignar' }}</div>
              </div>
              <div class="detail-logs" *ngIf="!loadingApprovedDetail && approvedDetailMap[row.id]?.logs?.length">
                <h4>Bit&aacute;cora del proceso</h4>
                <div class="detail-log" *ngFor="let log of approvedDetailMap[row.id].logs">
                  <div class="detail-log-top">
                    <strong>{{ log.event_label }}</strong>
                    <span>{{ log.created_at | date:'short' }}</span>
                  </div>
                  <div class="detail-log-meta">
                    {{ log.actor_name || log.actor_email || 'Sistema' }}<span *ngIf="log.actor_role"> · {{ log.actor_role }}</span>
                  </div>
                  <div class="detail-log-detail" *ngIf="log.event_detail">{{ log.event_detail }}</div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <app-review-panel *ngIf="activeTab === 'review'" [data]="submissions" [apiBase]="apiBase" (updated)="fetch()"></app-review-panel>
    </section>
  `,
    styles: [`
    .review-page {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 18px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(246, 252, 255, 0.96));
      box-shadow: var(--shadow-card);
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .tabs {
      display: flex;
      gap: 10px;
      margin: 18px 0;
    }
    .tab {
      padding: 10px 16px;
      border: 1px solid #b9d5e9;
      background: #f8fcff;
      color: #0f3e63;
      border-radius: 999px;
      cursor: pointer;
      font-weight: 700;
    }
    .tab.active {
      background: #dbeafe;
      border-color: #93c5fd;
      color: #1d4ed8;
    }
    .history-card {
      margin: 18px 0;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 16px;
      background: rgba(255,255,255,0.92);
    }
    .history-head h3 { margin: 0 0 4px; }
    .history-list { display: grid; gap: 12px; }
    .history-item {
      border: 1px solid #d7e6f1;
      border-radius: 14px;
      padding: 12px 14px;
      background: #f8fcff;
    }
    .history-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }
    .history-link {
      border: 0;
      background: transparent;
      padding: 0;
      color: #1d4ed8;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .history-top span { color: var(--muted); font-size: 13px; }
    .history-body { display: grid; gap: 4px; }
    .history-body span,
    .detail-grid span { font-weight: 700; color: #0f3e63; }
    .history-detail {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px dashed #c7dced;
      display: grid;
      gap: 14px;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 16px;
    }
    .archive-documents {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px dashed #c7dced;
      display: grid;
      gap: 8px;
    }
    .archive-documents-label {
      font-weight: 700;
      color: #0f3e63;
    }
    .archive-documents-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .history-doc-link {
      padding: 7px 12px;
      border: 1px solid #9ec3dd;
      background: #f8fcff;
      color: #1d4ed8;
      border-radius: 999px;
      cursor: pointer;
      font-weight: 600;
    }
    .detail-logs {
      display: grid;
      gap: 10px;
    }
    .detail-logs h4 {
      margin: 0;
      color: #0f3e63;
    }
    .detail-log {
      border: 1px solid #d7e6f1;
      border-radius: 12px;
      padding: 10px 12px;
      background: #fff;
    }
    .detail-log-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 4px;
    }
    .detail-log-top span,
    .detail-log-meta { color: var(--muted); font-size: 13px; }
    .detail-log-detail { margin-top: 4px; color: #365067; }
    .history-empty { color: var(--muted); }
    h2 { margin: 0 0 4px; }
    .muted { color: var(--muted); margin: 0; }
    button {
      padding: 8px 13px;
      border: 1px solid #b9d5e9;
      background: #f8fcff;
      color: #0f3e63;
      border-radius: 999px;
      cursor: pointer;
      font-weight: 600;
    }
    button[disabled] { opacity: 0.6; cursor: not-allowed; }
  `]
})
export class ReviewPageComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private autoRefreshHandle: ReturnType<typeof setInterval> | null = null;
  readonly apiBase = API_BASE;
  submissions: Submission[] = [];
  approvedHistory: FinancialApprovedHistoryItem[] = [];
  approvedDetailMap: Record<number, FinancialApprovedHistoryDetail> = {};
  expandedApprovedId: number | null = null;
  archiveItems: ArchiveItem[] = [];
  activeTab: 'review' | 'archive' | 'approved' = 'review';
  loading = false;
  loadingHistory = false;
  loadingApprovedDetail = false;
  loadingArchive = false;

  ngOnInit(): void {
    this.fetch();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    if (this.autoRefreshHandle) {
      clearInterval(this.autoRefreshHandle);
      this.autoRefreshHandle = null;
    }
  }

  fetch() {
    if (this.loading) return;
    this.loading = true;
    this.http.get<Submission[]>(`${this.apiBase}/submissions`).subscribe({
      next: (data) => {
        this.submissions = data;
        this.loading = false;
        this.fetchArchive();
        this.fetchApprovedHistory();
      },
      error: () => {
        this.submissions = [];
        this.loading = false;
        this.approvedHistory = [];
        this.archiveItems = [];
      }
    });
  }

  private startAutoRefresh() {
    this.autoRefreshHandle = setInterval(() => {
      if (document.hidden) return;
      this.fetch();
    }, 10000);
  }

  showFinancialApprovedHistory() {
    return this.auth.currentUser?.role === 'aprobador';
  }

  showArchiveTab() {
    return this.auth.currentUser?.role !== 'user';
  }

  openArchiveTab() {
    this.activeTab = 'archive';
    this.fetchArchive();
  }

  fetchArchive() {
    if (!this.showArchiveTab()) {
      this.archiveItems = [];
      return;
    }
    this.loadingArchive = true;
    this.http.get<ArchiveItem[]>(`${this.apiBase}/submissions/archive`).subscribe({
      next: (data) => {
        this.archiveItems = data;
        this.loadingArchive = false;
      },
      error: () => {
        this.archiveItems = [];
        this.loadingArchive = false;
      }
    });
  }

  openApprovedTab() {
    this.activeTab = 'approved';
    this.fetchApprovedHistory();
  }

  fetchApprovedHistory() {
    if (!this.showFinancialApprovedHistory()) {
      this.approvedHistory = [];
      return;
    }
    this.loadingHistory = true;
    this.http.get<FinancialApprovedHistoryItem[]>(`${this.apiBase}/financial-approved-history`).subscribe({
      next: (data) => {
        this.approvedHistory = data;
        this.loadingHistory = false;
      },
      error: () => {
        this.approvedHistory = [];
        this.loadingHistory = false;
      }
    });
  }

  toggleApprovedDetail(row: FinancialApprovedHistoryItem) {
    if (this.expandedApprovedId === row.id) {
      this.expandedApprovedId = null;
      return;
    }
    this.expandedApprovedId = row.id;
    if (this.approvedDetailMap[row.id]) return;
    this.loadingApprovedDetail = true;
    this.http.get<FinancialApprovedHistoryDetail>(`${this.apiBase}/financial-approved-history/${row.id}`).subscribe({
      next: (data) => {
        this.approvedDetailMap[row.id] = data;
        this.loadingApprovedDetail = false;
      },
      error: () => {
        this.loadingApprovedDetail = false;
      }
    });
  }

  archiveDocuments(row: ArchiveItem) {
    const docs: Array<{ key: 'dpi' | 'carta' | 'boleta' | 'signed'; label: string }> = [];
    if (row.dpi_filename) docs.push({ key: 'dpi', label: 'DPI adjunto' });
    if (row.carta_representacion_filename) docs.push({ key: 'carta', label: 'Carta de representación' });
    if (row.analyst_pdf_filename) docs.push({ key: 'boleta', label: 'Boleta / documento del proceso' });
    if (row.signed_pdf_filename) docs.push({ key: 'signed', label: 'Documento firmado' });
    return docs;
  }

  openArchiveDocument(row: ArchiveItem, key: 'dpi' | 'carta' | 'boleta' | 'signed') {
    let path = '';
    if (key === 'dpi') path = `${this.apiBase}/submissions/${row.id}/dpi`;
    if (key === 'carta') path = `${this.apiBase}/submissions/${row.id}/carta-representacion`;
    if (key === 'boleta') path = `${this.apiBase}/submissions/${row.id}/boleta`;
    if (key === 'signed') path = `${this.apiBase}/submissions/${row.id}/documento-firmado`;
    if (!path) return;
    this.http.get(path, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    });
  }
}
