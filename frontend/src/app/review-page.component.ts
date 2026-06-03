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

type ApproverDashboardSummary = {
  active_total: number;
  pending_approval_total: number;
  approved_total: number;
  delivered_total: number;
};

type ApproverDashboardStageTiming = {
  key: string;
  label: string;
  average_hours: number | null;
  max_hours: number | null;
  sample_size: number;
};

type ApproverDashboardProcessBottleneck = {
  gestion_nombre: string;
  unidad_clave: string;
  total: number;
  average_cycle_hours: number | null;
};

type ApproverDashboardAssignment = {
  id: number;
  registro_codigo?: string | null;
  gestion_nombre?: string | null;
  unidad_clave?: string | null;
  nombre_propietario?: string | null;
  current_stage: string;
  responsible_name: string;
  age_hours: number | null;
  assigned_analista_name?: string | null;
  assigned_emisor_name?: string | null;
  assigned_aprobador_name?: string | null;
};

type ApproverDashboardPayload = {
  units: string[];
  summary: ApproverDashboardSummary;
  stage_timings: ApproverDashboardStageTiming[];
  process_bottlenecks: ApproverDashboardProcessBottleneck[];
  active_assignments: ApproverDashboardAssignment[];
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
        <button type="button" class="tab" *ngIf="showApproverDashboard()" [class.active]="activeTab === 'dashboard'" (click)="openDashboardTab()">Dashboard</button>
        <button type="button" class="tab" [class.active]="activeTab === 'archive'" (click)="openArchiveTab()">Archivo</button>
        <button type="button" class="tab" *ngIf="showFinancialApprovedHistory()" [class.active]="activeTab === 'approved'" (click)="openApprovedTab()">Procesos aprobados</button>
      </div>

      <section class="history-card" *ngIf="activeTab === 'dashboard' && showApproverDashboard()">
        <div class="history-head">
          <div>
            <h3>Dashboard de aprobaci&oacute;n</h3>
            <p class="muted">Vista operativa de RAN y Financiero con tiempos, cuellos de botella y responsables actuales.</p>
          </div>
        </div>
        <div class="history-empty" *ngIf="loadingDashboard">Cargando dashboard...</div>
        <div class="history-empty" *ngIf="!loadingDashboard && !dashboardUnits.length">No hay unidades de RAN o Financiero asignadas a este aprobador.</div>
        <ng-container *ngIf="!loadingDashboard && dashboardUnits.length">
          <section class="dashboard-hero">
            <span class="dashboard-unit-pill" *ngFor="let unit of dashboardUnits">{{ unit }}</span>
            <h4>Seguimiento operativo de aprobaci&oacute;n</h4>
            <p>Concentra los tiempos de respuesta, los tr&aacute;mites que se detienen m&aacute;s y la persona que actualmente tiene cada proceso.</p>
          </section>
          <section class="dashboard-chart-card">
            <div class="chart-card-header">
              <div>
                <h4>Distribuci&oacute;n general</h4>
                <p>Lectura r&aacute;pida del volumen por estado.</p>
              </div>
            </div>
            <div class="dashboard-ring-layout">
              <div class="ring-chart" [style.--p1]="summarySegmentPercent('active')" [style.--p2]="summarySegmentPercent('pending')" [style.--p3]="summarySegmentPercent('approved')">
                <div class="ring-chart-center">
                  <strong>{{ dashboardSummary.active_total + dashboardSummary.pending_approval_total + dashboardSummary.approved_total + dashboardSummary.delivered_total }}</strong>
                  <span>Total</span>
                </div>
              </div>
              <div class="ring-legend">
                <div><span class="legend-dot active"></span>Activos: {{ dashboardSummary.active_total }}</div>
                <div><span class="legend-dot pending"></span>Pendientes: {{ dashboardSummary.pending_approval_total }}</div>
                <div><span class="legend-dot approved"></span>Aprobados: {{ dashboardSummary.approved_total }}</div>
                <div><span class="legend-dot delivered"></span>Entregados: {{ dashboardSummary.delivered_total }}</div>
              </div>
            </div>
          </section>
          <div class="dashboard-summary">
            <article class="summary-card info">
              <strong>{{ dashboardSummary.active_total }}</strong>
              <span>Procesos activos</span>
            </article>
            <article class="summary-card alert">
              <strong>{{ dashboardSummary.pending_approval_total }}</strong>
              <span>Pendientes de aprobaci&oacute;n</span>
            </article>
            <article class="summary-card neutral">
              <strong>{{ dashboardSummary.approved_total }}</strong>
              <span>Aprobados sin cerrar</span>
            </article>
            <article class="summary-card success">
              <strong>{{ dashboardSummary.delivered_total }}</strong>
              <span>Entregados</span>
            </article>
          </div>

          <div class="dashboard-block">
            <h4>Tiempos promedio por etapa</h4>
            <div class="chart-card-header compact">
              <p>Comparativo visual del tiempo promedio de cada etapa.</p>
            </div>
            <div class="bar-chart">
              <div class="bar-row" *ngFor="let item of dashboardStageTimings">
                <div class="bar-label">{{ item.label }}</div>
                <div class="bar-track">
                  <div class="bar-fill timing" [style.width.%]="stageTimingPercent(item)"></div>
                </div>
                <div class="bar-value">{{ item.average_hours !== null ? (item.average_hours + ' h') : 'N/D' }}</div>
              </div>
            </div>
            <div class="dashboard-grid">
              <article class="metric-card" *ngFor="let item of dashboardStageTimings">
                <strong>{{ item.label }}</strong>
                <span>Promedio: {{ item.average_hours !== null ? (item.average_hours + ' h') : 'N/D' }}</span>
                <span>Mayor: {{ item.max_hours !== null ? (item.max_hours + ' h') : 'N/D' }}</span>
                <span>Muestra: {{ item.sample_size }}</span>
              </article>
            </div>
          </div>

          <div class="dashboard-block">
            <h4>Tr&aacute;mites con mayor tiempo de ciclo</h4>
            <div class="history-empty" *ngIf="!dashboardProcessBottlenecks.length">Sin datos suficientes.</div>
            <div class="bar-chart" *ngIf="dashboardProcessBottlenecks.length">
              <div class="bar-row" *ngFor="let item of dashboardProcessBottlenecks">
                <div class="bar-label truncate">{{ item.gestion_nombre }}</div>
                <div class="bar-track">
                  <div class="bar-fill bottleneck" [style.width.%]="bottleneckPercent(item)"></div>
                </div>
                <div class="bar-value">{{ item.average_cycle_hours !== null ? (item.average_cycle_hours + ' h') : 'N/D' }}</div>
              </div>
            </div>
            <div class="dashboard-grid" *ngIf="dashboardProcessBottlenecks.length">
              <article class="metric-card" *ngFor="let item of dashboardProcessBottlenecks">
                <strong>{{ item.gestion_nombre }}</strong>
                <span>Unidad: {{ item.unidad_clave }}</span>
                <span>Promedio: {{ item.average_cycle_hours !== null ? (item.average_cycle_hours + ' h') : 'N/D' }}</span>
                <span>Total: {{ item.total }}</span>
              </article>
            </div>
          </div>

          <div class="dashboard-block">
            <h4>Responsable actual por proceso</h4>
            <div class="history-empty" *ngIf="!dashboardAssignments.length">No hay procesos activos.</div>
            <div class="history-list" *ngIf="dashboardAssignments.length">
              <article class="history-item assignment-card" *ngFor="let row of dashboardAssignments">
                <div class="history-top">
                  <strong>{{ row.registro_codigo || ('#' + row.id) }}</strong>
                  <span>{{ row.age_hours !== null ? (row.age_hours + ' h en proceso') : 'N/D' }}</span>
                </div>
                <div class="history-body">
                  <div><span>Proceso:</span> {{ row.gestion_nombre || 'Sin nombre' }}</div>
                  <div><span>Unidad:</span> {{ row.unidad_clave || 'GENERAL' }}</div>
                  <div><span>Usuario:</span> {{ row.nombre_propietario || 'Sin nombre' }}</div>
                </div>
                <div class="assignment-stage">{{ row.current_stage }}</div>
                <div class="assignment-meta">
                  <div><span>Responsable actual:</span> {{ row.responsible_name }}</div>
                  <div><span>Analista:</span> {{ row.assigned_analista_name || 'No aplica' }}</div>
                  <div><span>Emisor:</span> {{ row.assigned_emisor_name || 'No aplica' }}</div>
                  <div><span>Aprobador:</span> {{ row.assigned_aprobador_name || 'No aplica' }}</div>
                </div>
              </article>
            </div>
          </div>
        </ng-container>
      </section>

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
            <h3>Procesos aprobados</h3>
            <p class="muted">Historial de procesos aprobados por el aprobador en sus unidades asignadas.</p>
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
              <div><span>Proceso:</span> {{ row.gestion_nombre || 'Sin nombre' }}</div>
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
                    <strong>{{ normalizeDisplayText(log.event_label) }}</strong>
                    <span>{{ log.created_at | date:'short' }}</span>
                  </div>
                  <div class="detail-log-meta">
                    {{ normalizeDisplayText(log.actor_name || log.actor_email || 'Sistema') }}<span *ngIf="log.actor_role"> · {{ normalizeDisplayText(log.actor_role) }}</span>
                  </div>
                  <div class="detail-log-detail" *ngIf="log.event_detail">{{ normalizeDisplayText(log.event_detail) }}</div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <app-review-panel *ngIf="activeTab === 'review'" [data]="submissions" [apiBase]="apiBase" (updated)="fetch(true)"></app-review-panel>
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
    .dashboard-unit-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 18px;
    }
    .dashboard-summary,
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }
    .summary-card,
    .metric-card {
      border: 1px solid #d7e6f1;
      border-radius: 18px;
      padding: 16px;
      background: linear-gradient(180deg, #ffffff, #f4faff);
      box-shadow: 0 12px 26px rgba(15, 62, 99, 0.08);
      display: grid;
      gap: 6px;
    }
    .summary-card strong {
      font-size: 34px;
      line-height: 1;
      color: #0b4d7a;
    }
    .dashboard-chart-card {
      margin-bottom: 18px;
      border: 1px solid #d7e6f1;
      border-radius: 22px;
      padding: 18px;
      background: linear-gradient(180deg, #ffffff, #f5fbff);
      box-shadow: 0 12px 26px rgba(15, 62, 99, 0.08);
    }
    .chart-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .chart-card-header.compact {
      margin-bottom: 10px;
    }
    .chart-card-header h4 {
      margin: 0 0 4px;
      color: #0f3e63;
      font-size: 24px;
    }
    .chart-card-header p {
      margin: 0;
      color: #5d7991;
    }
    .dashboard-ring-layout {
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 20px;
      align-items: center;
    }
    .ring-chart {
      --p1: 25%;
      --p2: 25%;
      --p3: 25%;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      background:
        conic-gradient(
          #31a8e8 0 var(--p1),
          #f5b63e var(--p1) calc(var(--p1) + var(--p2)),
          #7c8cff calc(var(--p1) + var(--p2)) calc(var(--p1) + var(--p2) + var(--p3)),
          #43c27c calc(var(--p1) + var(--p2) + var(--p3)) 100%
        );
      position: relative;
      margin: 0 auto;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.45), 0 18px 36px rgba(15, 62, 99, 0.12);
    }
    .ring-chart::after {
      content: '';
      position: absolute;
      inset: 24px;
      border-radius: 50%;
      background: linear-gradient(180deg, #ffffff, #f5fbff);
      box-shadow: inset 0 0 0 1px #d7e6f1;
    }
    .ring-chart-center {
      position: absolute;
      inset: 0;
      z-index: 1;
      display: grid;
      place-content: center;
      text-align: center;
    }
    .ring-chart-center strong {
      font-size: 36px;
      color: #0f3e63;
      line-height: 1;
    }
    .ring-chart-center span {
      margin-top: 4px;
      color: #5d7991;
      font-weight: 600;
    }
    .ring-legend {
      display: grid;
      gap: 10px;
      color: #173652;
      font-weight: 600;
    }
    .legend-dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }
    .legend-dot.active { background: #31a8e8; }
    .legend-dot.pending { background: #f5b63e; }
    .legend-dot.approved { background: #7c8cff; }
    .legend-dot.delivered { background: #43c27c; }
    .bar-chart {
      display: grid;
      gap: 10px;
    }
    .bar-row {
      display: grid;
      grid-template-columns: minmax(180px, 240px) 1fr 90px;
      gap: 12px;
      align-items: center;
    }
    .bar-label {
      color: #173652;
      font-weight: 700;
    }
    .bar-label.truncate {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bar-track {
      position: relative;
      height: 12px;
      border-radius: 999px;
      background: #e6f0f7;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 999px;
    }
    .bar-fill.timing {
      background: linear-gradient(90deg, #31a8e8, #6dc8f2);
    }
    .bar-fill.bottleneck {
      background: linear-gradient(90deg, #f5b63e, #f7d36f);
    }
    .bar-value {
      text-align: right;
      color: #365067;
      font-weight: 700;
    }
    .summary-card span,
    .metric-card span { color: #365067; }
    .dashboard-block {
      margin-top: 22px;
      display: grid;
      gap: 12px;
    }
    .dashboard-block h4 {
      margin: 0;
      color: #0f3e63;
      font-size: 26px;
      letter-spacing: -0.02em;
    }
    .dashboard-hero {
      display: grid;
      gap: 10px;
      margin-bottom: 14px;
      padding: 18px 20px;
      border-radius: 20px;
      border: 1px solid #d7e6f1;
      background:
        radial-gradient(circle at top right, rgba(49, 168, 232, 0.2), transparent 35%),
        linear-gradient(135deg, #0d3554, #174a73 58%, #1e6ca1);
      color: #fff;
      box-shadow: 0 18px 40px rgba(12, 53, 84, 0.22);
    }
    .dashboard-hero h4 {
      margin: 0;
      font-size: 30px;
      line-height: 1.05;
      color: #fff;
    }
    .dashboard-hero p {
      margin: 0;
      color: rgba(255, 255, 255, 0.88);
      max-width: 760px;
      font-size: 15px;
    }
    .dashboard-unit-pill {
      display: inline-flex;
      align-items: center;
      padding: 7px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.2);
      font-weight: 700;
      width: fit-content;
    }
    .summary-card.alert {
      background: linear-gradient(180deg, #fff8ea, #fff3d4);
      border-color: #f2cf78;
    }
    .summary-card.success {
      background: linear-gradient(180deg, #effdf5, #def8e7);
      border-color: #98dfb4;
    }
    .summary-card.info {
      background: linear-gradient(180deg, #edf8ff, #dff2ff);
      border-color: #9fd0f0;
    }
    .summary-card.neutral {
      background: linear-gradient(180deg, #f7fafc, #eef5fb);
      border-color: #d5e3ef;
    }
    .metric-card strong {
      color: #0f3e63;
      font-size: 18px;
      line-height: 1.25;
    }
    .assignment-card {
      background: linear-gradient(180deg, #ffffff, #f5fbff);
      border-left: 5px solid #31a8e8;
    }
    .assignment-stage {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: #e7f5ff;
      border: 1px solid #bfe1f5;
      color: #0b4d7a;
      font-weight: 700;
      font-size: 13px;
      width: fit-content;
    }
    .assignment-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 16px;
      margin-top: 12px;
      color: #173652;
    }
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
    @media (max-width: 900px) {
      .dashboard-ring-layout {
        grid-template-columns: 1fr;
      }
      .bar-row {
        grid-template-columns: 1fr;
      }
      .bar-value {
        text-align: left;
      }
      .dashboard-summary,
      .dashboard-grid,
      .assignment-meta,
      .detail-grid {
        grid-template-columns: 1fr;
      }
      .dashboard-hero h4 {
        font-size: 24px;
      }
    }
  `]
})
export class ReviewPageComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private autoRefreshHandle: ReturnType<typeof setInterval> | null = null;
  private pendingScrollRestore: number | null = null;
  readonly apiBase = API_BASE;
  submissions: Submission[] = [];
  approvedHistory: FinancialApprovedHistoryItem[] = [];
  approvedDetailMap: Record<number, FinancialApprovedHistoryDetail> = {};
  expandedApprovedId: number | null = null;
  archiveItems: ArchiveItem[] = [];
  dashboardUnits: string[] = [];
  dashboardSummary: ApproverDashboardSummary = {
    active_total: 0,
    pending_approval_total: 0,
    approved_total: 0,
    delivered_total: 0
  };
  dashboardStageTimings: ApproverDashboardStageTiming[] = [];
  dashboardProcessBottlenecks: ApproverDashboardProcessBottleneck[] = [];
  dashboardAssignments: ApproverDashboardAssignment[] = [];
  activeTab: 'review' | 'dashboard' | 'archive' | 'approved' = 'review';
  loading = false;
  loadingHistory = false;
  loadingApprovedDetail = false;
  loadingArchive = false;
  loadingDashboard = false;

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

  fetch(silent = false) {
    if (this.loading) return;
    this.preserveScrollPosition();
    if (!silent) {
      this.loading = true;
    }
    this.http.get<Submission[]>(`${this.apiBase}/submissions`).subscribe({
      next: (data) => {
        this.submissions = data;
        this.loading = false;
        this.restoreScrollPosition();
        this.fetchDashboard(silent);
        this.fetchArchive(silent);
        this.fetchApprovedHistory(silent);
      },
      error: () => {
        this.submissions = [];
        this.loading = false;
        this.approvedHistory = [];
        this.archiveItems = [];
        this.dashboardUnits = [];
        this.dashboardStageTimings = [];
        this.dashboardProcessBottlenecks = [];
        this.dashboardAssignments = [];
        this.restoreScrollPosition();
      }
    });
  }

  private startAutoRefresh() {
    this.autoRefreshHandle = setInterval(() => {
      if (document.hidden) return;
      this.fetch(true);
    }, 10000);
  }

  private preserveScrollPosition() {
    this.pendingScrollRestore = window.scrollY || window.pageYOffset || 0;
  }

  private restoreScrollPosition() {
    if (this.pendingScrollRestore === null) return;
    const target = this.pendingScrollRestore;
    this.pendingScrollRestore = null;
    requestAnimationFrame(() => window.scrollTo({ top: target, behavior: 'auto' }));
  }

  showFinancialApprovedHistory() {
    return this.auth.currentUser?.role === 'aprobador';
  }

  showApproverDashboard() {
    if (this.auth.currentUser?.role !== 'aprobador') return false;
    const units = Array.isArray(this.auth.currentUser?.unit_access) ? this.auth.currentUser!.unit_access! : [];
    return units.some((unit) => {
      const normalized = String(unit || '').trim().toUpperCase();
      return normalized === 'RAN' || normalized === 'FINANCIERO';
    });
  }

  showArchiveTab() {
    return this.auth.currentUser?.role !== 'user';
  }

  openArchiveTab() {
    this.activeTab = 'archive';
    this.fetchArchive();
  }

  openDashboardTab() {
    this.activeTab = 'dashboard';
    this.fetchDashboard();
  }

  fetchDashboard(silent = false) {
    if (!this.showApproverDashboard()) {
      this.dashboardUnits = [];
      this.dashboardStageTimings = [];
      this.dashboardProcessBottlenecks = [];
      this.dashboardAssignments = [];
      return;
    }
    if (!silent) {
      this.loadingDashboard = true;
    }
    this.http.get<ApproverDashboardPayload>(`${this.apiBase}/approver-dashboard`).subscribe({
      next: (data) => {
        this.dashboardUnits = data.units || [];
        this.dashboardSummary = data.summary || this.dashboardSummary;
        this.dashboardStageTimings = data.stage_timings || [];
        this.dashboardProcessBottlenecks = data.process_bottlenecks || [];
        this.dashboardAssignments = data.active_assignments || [];
        this.loadingDashboard = false;
      },
      error: () => {
        this.dashboardUnits = [];
        this.dashboardStageTimings = [];
        this.dashboardProcessBottlenecks = [];
        this.dashboardAssignments = [];
        this.loadingDashboard = false;
      }
    });
  }

  fetchArchive(silent = false) {
    if (!this.showArchiveTab()) {
      this.archiveItems = [];
      return;
    }
    if (!silent) {
      this.loadingArchive = true;
    }
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

  fetchApprovedHistory(silent = false) {
    if (!this.showFinancialApprovedHistory()) {
      this.approvedHistory = [];
      return;
    }
    if (!silent) {
      this.loadingHistory = true;
    }
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

  normalizeDisplayText(value: unknown): string {
    const text = value === null || value === undefined ? '' : String(value);
    if (!text) return '';
    if (!/[ÃÂ�]/.test(text)) return text;

    const replacements: Record<string, string> = {
      'Ã¡': 'á',
      'Ã©': 'é',
      'Ã­': 'í',
      'Ã³': 'ó',
      'Ãº': 'ú',
      'Ã': 'Á',
      'Ã‰': 'É',
      'Ã': 'Í',
      'Ã“': 'Ó',
      'Ãš': 'Ú',
      'Ã±': 'ñ',
      'Ã‘': 'Ñ',
      'Â·': '·'
    };

    let normalized = text;
    for (const [from, to] of Object.entries(replacements)) {
      normalized = normalized.split(from).join(to);
    }

    if (!/[ÃÂ�]/.test(normalized)) return normalized;

    try {
      const bytes = Uint8Array.from(Array.from(normalized).map((char) => char.charCodeAt(0) & 0xff));
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return normalized;
    }
  }

  summarySegmentPercent(kind: 'active' | 'pending' | 'approved') {
    const total =
      Number(this.dashboardSummary.active_total || 0) +
      Number(this.dashboardSummary.pending_approval_total || 0) +
      Number(this.dashboardSummary.approved_total || 0) +
      Number(this.dashboardSummary.delivered_total || 0);

    if (!total) return '0%';

    if (kind === 'active') {
      return `${(Number(this.dashboardSummary.active_total || 0) / total) * 100}%`;
    }
    if (kind === 'pending') {
      return `${(Number(this.dashboardSummary.pending_approval_total || 0) / total) * 100}%`;
    }
    return `${(Number(this.dashboardSummary.approved_total || 0) / total) * 100}%`;
  }

  stageTimingPercent(item: ApproverDashboardStageTiming) {
    const value = Number(item?.average_hours || 0);
    const max = Math.max(
      ...this.dashboardStageTimings.map((row) => Number(row?.max_hours || row?.average_hours || 0)),
      0
    );
    if (!value || !max) return 0;
    return Math.max(6, Math.min(100, (value / max) * 100));
  }

  bottleneckPercent(item: ApproverDashboardProcessBottleneck) {
    const value = Number(item?.average_cycle_hours || 0);
    const max = Math.max(
      ...this.dashboardProcessBottlenecks.map((row) => Number(row?.average_cycle_hours || 0)),
      0
    );
    if (!value || !max) return 0;
    return Math.max(8, Math.min(100, (value / max) * 100));
  }
}
