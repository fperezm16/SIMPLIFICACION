import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API_BASE } from './api.config';

type UnitStats = {
  unit: string;
  total: number;
  active: number;
  status_counts: Record<string, number>;
  avg_stage_hours: {
    receptor: number | null;
    analista: number | null;
    aprobador: number | null;
    total_aprobado: number | null;
  };
};

type ProcessRow = {
  id: number;
  registro_codigo?: string | null;
  unidad_clave: string;
  gestion_nombre?: string | null;
  nombre_propietario?: string | null;
  estado_code: string;
  estado_label: string;
  created_at?: string | null;
  assigned_analista_name?: string | null;
  assigned_aprobador_name?: string | null;
  receptor_hours: number | null;
  analista_hours: number | null;
  aprobador_hours: number | null;
  current_stage_hours: number | null;
};

type DashboardResponse = {
  generated_at: string;
  totals: {
    total: number;
    active: number;
    approved: number;
    returned: number;
  };
  by_unit: UnitStats[];
  processes: ProcessRow[];
};

type StageKey = 'receptor' | 'analista' | 'aprobador' | 'total_aprobado';

type StatusLegendItem = {
  key: string;
  label: string;
  count: number;
  percent: number;
  css: string;
};

@Component({
  selector: 'app-supervisor-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="supervisor">
      <header class="head">
        <div>
          <h2>Dashboard de supervisi&oacute;n</h2>
          <p>Estad&iacute;sticas por unidad, tiempos por etapa y reporte de procesos.</p>
        </div>
        <div class="actions">
          <label>Unidad:
            <select [(ngModel)]="unitFilter" (change)="load()">
              <option value="">Todas</option>
              <option *ngFor="let unit of units" [value]="unit">{{ unitLabel(unit) }}</option>
            </select>
          </label>
          <label>Reporte:
            <select [(ngModel)]="reportScope">
              <option value="all">Todos</option>
              <option value="active">Solo activos</option>
            </select>
          </label>
          <button type="button" (click)="load()" [disabled]="loading">{{ loading ? 'Actualizando...' : 'Actualizar' }}</button>
          <button type="button" (click)="downloadReport()" [disabled]="downloadingReport || loading">
            {{ downloadingReport ? 'Generando...' : 'Descargar reporte CSV' }}
          </button>
        </div>
      </header>

      <p class="error" *ngIf="error">{{ error }}</p>

      <div class="kpi-grid" *ngIf="dashboard as d">
        <article class="kpi-card kpi-total">
          <h4>Total procesos</h4>
          <div class="kpi-value">{{ d.totals.total }}</div>
          <div class="kpi-meter">
            <span style="width: 100%"></span>
          </div>
        </article>
        <article class="kpi-card kpi-active">
          <h4>Activos</h4>
          <div class="kpi-value">{{ d.totals.active }}</div>
          <small>{{ totalPercent(d.totals.active) | number:'1.0-0' }}%</small>
          <div class="kpi-meter">
            <span [style.width.%]="totalPercent(d.totals.active)"></span>
          </div>
        </article>
        <article class="kpi-card kpi-approved">
          <h4>Aprobados</h4>
          <div class="kpi-value">{{ d.totals.approved }}</div>
          <small>{{ totalPercent(d.totals.approved) | number:'1.0-0' }}%</small>
          <div class="kpi-meter">
            <span [style.width.%]="totalPercent(d.totals.approved)"></span>
          </div>
        </article>
        <article class="kpi-card kpi-returned">
          <h4>Devueltos</h4>
          <div class="kpi-value">{{ d.totals.returned }}</div>
          <small>{{ totalPercent(d.totals.returned) | number:'1.0-0' }}%</small>
          <div class="kpi-meter">
            <span [style.width.%]="totalPercent(d.totals.returned)"></span>
          </div>
        </article>
      </div>

      <div class="meta" *ngIf="dashboard?.generated_at">
        Actualizado: {{ dashboard?.generated_at | date:'short' }}
      </div>

      <section class="overview-grid" *ngIf="dashboard?.by_unit?.length">
        <article class="overview-card" *ngFor="let unitStat of dashboard?.by_unit">
          <div class="overview-head">
            <h4>{{ unitLabel(unitStat.unit) }}</h4>
            <span class="overview-total">{{ unitStat.total }} procesos</span>
          </div>
          <div class="overview-main">
            <div class="ring" [style.--progress]="unitApprovedPercent(unitStat) + '%'">
              <span>{{ unitApprovedPercent(unitStat) | number:'1.0-0' }}%</span>
            </div>
            <div class="overview-legend">
              <div class="legend-line">
                <span>Aprobados</span>
                <strong>{{ approvedCount(unitStat) }}</strong>
              </div>
              <div class="mini-track"><span class="mini-fill approved" [style.width.%]="unitApprovedPercent(unitStat)"></span></div>
              <div class="legend-line">
                <span>Activos</span>
                <strong>{{ unitStat.active }}</strong>
              </div>
              <div class="mini-track"><span class="mini-fill active" [style.width.%]="unitActivePercent(unitStat)"></span></div>
              <div class="legend-line">
                <span>Devueltos</span>
                <strong>{{ returnedCount(unitStat) }}</strong>
              </div>
              <div class="mini-track"><span class="mini-fill returned" [style.width.%]="unitReturnedPercent(unitStat)"></span></div>
            </div>
          </div>
        </article>
      </section>

      <div class="empty" *ngIf="loading">Cargando dashboard...</div>
      <div class="empty" *ngIf="!loading && dashboard && !dashboard.by_unit.length">No hay procesos para mostrar.</div>

      <section class="unit" *ngFor="let unitStat of dashboard?.by_unit">
        <div class="unit-head">
          <h3>{{ unitLabel(unitStat.unit) }}</h3>
          <span class="chip">Total {{ unitStat.total }}</span>
          <span class="chip">Activos {{ unitStat.active }}</span>
          <span class="chip chip-ok">Aprobados {{ approvedCount(unitStat) }}</span>
        </div>

        <div class="stats-grid">
          <div class="card">
            <h4>Distribuci&oacute;n de estados</h4>
            <div class="stack-track" [attr.aria-label]="'Distribución de estados ' + unitLabel(unitStat.unit)">
              <span
                *ngFor="let item of statusLegend(unitStat)"
                [class]="item.css"
                [style.width.%]="item.percent"
                [attr.title]="item.label + ': ' + item.count">
              </span>
            </div>
            <div class="legend-grid">
              <div class="legend-item" *ngFor="let item of statusLegend(unitStat)">
                <span class="dot" [class]="item.css"></span>
                <span class="legend-label">{{ item.label }}</span>
                <strong>{{ item.count }}</strong>
                <small>{{ item.percent | number:'1.0-0' }}%</small>
              </div>
            </div>
          </div>

          <div class="card">
            <h4>Tiempo promedio por etapa</h4>
            <div class="time-bars">
              <div class="time-row">
                <span>Receptor</span>
                <div class="time-track"><div class="time-fill t-receptor" [style.width.%]="stageWidth(unitStat, 'receptor')"></div></div>
                <strong>{{ formatDuration(stageValue(unitStat, 'receptor')) }}</strong>
              </div>
              <div class="time-row">
                <span>Analista</span>
                <div class="time-track"><div class="time-fill t-analista" [style.width.%]="stageWidth(unitStat, 'analista')"></div></div>
                <strong>{{ formatDuration(stageValue(unitStat, 'analista')) }}</strong>
              </div>
              <div class="time-row">
                <span>Aprobador</span>
                <div class="time-track"><div class="time-fill t-aprobador" [style.width.%]="stageWidth(unitStat, 'aprobador')"></div></div>
                <strong>{{ formatDuration(stageValue(unitStat, 'aprobador')) }}</strong>
              </div>
              <div class="time-row">
                <span>Total aprobados</span>
                <div class="time-track"><div class="time-fill t-total" [style.width.%]="stageWidth(unitStat, 'total_aprobado')"></div></div>
                <strong>{{ formatDuration(stageValue(unitStat, 'total_aprobado')) }}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="table-wrap" *ngIf="processesByUnit(unitStat.unit).length">
          <table>
            <thead>
              <tr>
                <th>Registro</th>
                <th>Formulario</th>
                <th>Propietario</th>
                <th>Estado</th>
                <th>Receptor</th>
                <th>Analista</th>
                <th>Aprobador</th>
                <th>Etapa actual</th>
                <th>Analista asignado</th>
                <th>Aprobador asignado</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of processesByUnit(unitStat.unit)">
                <td>{{ row.registro_codigo || ('#' + row.id) }}</td>
                <td>{{ row.gestion_nombre || 'Formulario General TG' }}</td>
                <td>{{ row.nombre_propietario || 'N/D' }}</td>
                <td>
                  <span class="status-pill" [class]="statusClass(row.estado_code)">{{ row.estado_label }}</span>
                </td>
                <td>{{ formatDuration(row.receptor_hours) }}</td>
                <td>{{ formatDuration(row.analista_hours) }}</td>
                <td>{{ formatDuration(row.aprobador_hours) }}</td>
                <td>{{ formatDuration(row.current_stage_hours) }}</td>
                <td>{{ row.assigned_analista_name || 'Sin asignar' }}</td>
                <td>{{ row.assigned_aprobador_name || 'Sin asignar' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `,
  styles: [`
    .supervisor {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background:
        radial-gradient(circle at top right, rgba(11, 143, 217, 0.11), rgba(11, 143, 217, 0) 36%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(246, 252, 255, 0.96));
      padding: 18px;
      box-shadow: var(--shadow-card);
    }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
    .head h2 { margin: 0 0 6px; }
    .head p { margin: 0; color: var(--muted); }
    .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .actions label { font-size: 13px; color: #123d60; display: inline-flex; align-items: center; gap: 6px; }
    .actions select { border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; background: #fff; }
    .actions button {
      border: 1px solid #b9d5e9;
      background: #f8fcff;
      color: #0f3e63;
      border-radius: 999px;
      padding: 8px 12px;
      cursor: pointer;
      font-weight: 700;
    }
    .actions button[disabled] { opacity: 0.6; cursor: not-allowed; }
    .error {
      margin: 10px 0 0;
      color: #991b1b;
      background: #fff1f2;
      border: 1px solid #fecdd3;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 13px;
    }
    .kpi-grid {
      margin-top: 12px;
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .kpi-card {
      border: 1px solid #cfe1ef;
      border-radius: 12px;
      background: #fff;
      padding: 10px;
      box-shadow: var(--shadow-soft);
      display: grid;
      gap: 4px;
    }
    .kpi-card h4 { margin: 0; font-size: 12px; color: #4f6a82; text-transform: uppercase; letter-spacing: 0.03em; }
    .kpi-value { font-size: 26px; font-weight: 800; color: #123a59; line-height: 1; }
    .kpi-card small { color: #46617a; font-size: 12px; }
    .kpi-meter {
      margin-top: 4px;
      height: 8px;
      border-radius: 999px;
      background: #e2e8f0;
      overflow: hidden;
    }
    .kpi-meter span { display: block; height: 100%; border-radius: 999px; }
    .kpi-total .kpi-meter span { background: #0b8fd9; }
    .kpi-active .kpi-meter span { background: #f59e0b; }
    .kpi-approved .kpi-meter span { background: #22c55e; }
    .kpi-returned .kpi-meter span { background: #ef4444; }
    .meta { margin-top: 10px; color: #5c748c; font-size: 12px; }
    .overview-grid {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
      gap: 10px;
    }
    .overview-card {
      border: 1px solid #c8dceb;
      border-radius: 12px;
      background: linear-gradient(180deg, #ffffff, #f6fbff);
      box-shadow: var(--shadow-soft);
      padding: 10px;
      display: grid;
      gap: 10px;
    }
    .overview-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    .overview-head h4 {
      margin: 0;
      font-size: 14px;
      color: #153f63;
    }
    .overview-total {
      font-size: 12px;
      color: #4b6377;
      font-weight: 700;
    }
    .overview-main {
      display: grid;
      grid-template-columns: 74px 1fr;
      gap: 10px;
      align-items: center;
    }
    .ring {
      --progress: 0%;
      width: 74px;
      height: 74px;
      border-radius: 999px;
      background: conic-gradient(#22c55e var(--progress), #dbe7f1 0);
      position: relative;
      display: grid;
      place-items: center;
    }
    .ring::before {
      content: '';
      width: 56px;
      height: 56px;
      border-radius: 999px;
      background: #fff;
      border: 1px solid #d1e2ef;
    }
    .ring span {
      position: absolute;
      font-size: 11px;
      font-weight: 800;
      color: #1b4468;
    }
    .overview-legend {
      display: grid;
      gap: 4px;
    }
    .legend-line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: #274b6a;
    }
    .mini-track {
      height: 7px;
      border-radius: 999px;
      background: #deebf4;
      overflow: hidden;
    }
    .mini-fill {
      display: block;
      height: 100%;
      border-radius: 999px;
    }
    .mini-fill.approved { background: #22c55e; }
    .mini-fill.active { background: #f59e0b; }
    .mini-fill.returned { background: #ef4444; }
    .empty { margin-top: 12px; color: var(--muted); }
    .unit { margin-top: 16px; border-top: 1px solid #d8e6f1; padding-top: 12px; }
    .unit-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .unit-head h3 { margin: 0; margin-right: auto; }
    .chip {
      border: 1px solid #c8dceb;
      border-radius: 999px;
      background: #eff8ff;
      color: #1f4b70;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
    }
    .chip-ok { background: #ecfdf3; border-color: #86efac; color: #166534; }
    .stats-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .card {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #fff;
      padding: 10px;
      box-shadow: var(--shadow-soft);
    }
    .card h4 { margin: 0 0 8px; font-size: 14px; }
    .stack-track {
      height: 12px;
      border-radius: 999px;
      background: #e2e8f0;
      overflow: hidden;
      display: flex;
    }
    .stack-track span { display: block; height: 100%; min-width: 0; }
    .legend-grid { margin-top: 8px; display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .legend-item { display: grid; grid-template-columns: 10px 1fr auto auto; gap: 6px; align-items: center; font-size: 12px; }
    .legend-label { color: #35526b; }
    .legend-item small { color: #607b92; }
    .dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
    .time-bars { display: grid; gap: 8px; }
    .time-row { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px; align-items: center; font-size: 12px; }
    .time-track {
      height: 9px;
      border-radius: 999px;
      background: #e2e8f0;
      overflow: hidden;
    }
    .time-fill { height: 100%; border-radius: 999px; }
    .t-receptor { background: #f59e0b; }
    .t-analista { background: #0b8fd9; }
    .t-aprobador { background: #6366f1; }
    .t-total { background: #22c55e; }
    .s-enviado { background: #f59e0b; }
    .s-en_recepcion { background: #facc15; }
    .s-asignado { background: #38bdf8; }
    .s-en_aprobacion { background: #6366f1; }
    .s-aprobado { background: #22c55e; }
    .s-devuelto { background: #ef4444; }
    .s-devuelto_analista { background: #fb923c; }
    .table-wrap {
      margin-top: 10px;
      overflow: auto;
      max-height: 340px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #fff;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 8px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
    th { background: #edf6fd; position: sticky; top: 0; color: #17456c; }
    .status-pill {
      display: inline-flex;
      align-items: center;
      border: 1px solid #c8dceb;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
      color: #1f4b70;
      background: #f8fbff;
    }
    .status-enviado { background: #fff7ed; border-color: #fdba74; color: #9a3412; }
    .status-en_recepcion { background: #fefce8; border-color: #fde047; color: #854d0e; }
    .status-asignado { background: #f0f9ff; border-color: #7dd3fc; color: #075985; }
    .status-en_aprobacion { background: #eef2ff; border-color: #a5b4fc; color: #3730a3; }
    .status-aprobado { background: #ecfdf3; border-color: #86efac; color: #166534; }
    .status-devuelto { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
    .status-devuelto_analista { background: #fff7ed; border-color: #fdba74; color: #9a3412; }
    @media (max-width: 700px) {
      .overview-main { grid-template-columns: 1fr; justify-items: center; }
      .overview-legend { width: 100%; }
      .time-row { grid-template-columns: 1fr; }
      .legend-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class SupervisorPageComponent implements OnInit {
  private http = inject(HttpClient);
  readonly apiBase = API_BASE;
  readonly units = ['GENERAL', 'RAN', 'DVSO', 'AILA', 'FINANCIERO'];
  readonly statusView = [
    { key: 'enviado', label: 'Enviado', css: 's-enviado' },
    { key: 'en_recepcion', label: 'Receptor', css: 's-en_recepcion' },
    { key: 'asignado', label: 'Analista', css: 's-asignado' },
    { key: 'en_aprobacion', label: 'Aprobador', css: 's-en_aprobacion' },
    { key: 'aprobado', label: 'Aprobado', css: 's-aprobado' },
    { key: 'devuelto', label: 'Devuelto user', css: 's-devuelto' },
    { key: 'devuelto_analista', label: 'Devuelto analista', css: 's-devuelto_analista' }
  ] as const;
  unitFilter = '';
  reportScope: 'all' | 'active' = 'all';
  loading = false;
  downloadingReport = false;
  error = '';
  dashboard: DashboardResponse | null = null;

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.loading = true;
    this.error = '';
    const params: Record<string, string> = {};
    if (this.unitFilter) params['unit'] = this.unitFilter;

    this.http.get<DashboardResponse>(`${this.apiBase}/supervisor/dashboard`, { params }).subscribe({
      next: (data) => {
        this.dashboard = data;
        this.loading = false;
      },
      error: (err) => {
        this.dashboard = null;
        this.loading = false;
        this.error = err?.error?.error || 'No se pudo cargar el dashboard.';
      }
    });
  }

  downloadReport() {
    this.downloadingReport = true;
    this.error = '';
    const params: Record<string, string> = { scope: this.reportScope };
    if (this.unitFilter) params['unit'] = this.unitFilter;

    this.http.get(`${this.apiBase}/supervisor/report`, { params, responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reporte-supervision-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        this.downloadingReport = false;
      },
      error: (err) => {
        this.downloadingReport = false;
        this.error = err?.error?.error || 'No se pudo descargar el reporte.';
      }
    });
  }

  processesByUnit(unit: string) {
    if (!this.dashboard?.processes?.length) return [];
    return this.dashboard.processes.filter((row) => row.unidad_clave === unit);
  }

  value(record: Record<string, number>, key: string) {
    return Number(record?.[key] || 0);
  }

  totalPercent(value: number) {
    const total = Number(this.dashboard?.totals?.total || 0);
    if (!total) return 0;
    return (Number(value || 0) * 100) / total;
  }

  approvedCount(unitStat: UnitStats) {
    return this.value(unitStat.status_counts, 'aprobado');
  }

  returnedCount(unitStat: UnitStats) {
    return this.value(unitStat.status_counts, 'devuelto') + this.value(unitStat.status_counts, 'devuelto_analista');
  }

  unitPercent(unitStat: UnitStats, value: number) {
    const total = Number(unitStat.total || 0);
    if (!total) return 0;
    return (Number(value || 0) * 100) / total;
  }

  unitApprovedPercent(unitStat: UnitStats) {
    return this.unitPercent(unitStat, this.approvedCount(unitStat));
  }

  unitActivePercent(unitStat: UnitStats) {
    return this.unitPercent(unitStat, unitStat.active);
  }

  unitReturnedPercent(unitStat: UnitStats) {
    return this.unitPercent(unitStat, this.returnedCount(unitStat));
  }

  statusLegend(unitStat: UnitStats): StatusLegendItem[] {
    const total = Number(unitStat.total || 0);
    return this.statusView.map((status) => {
      const count = this.value(unitStat.status_counts, status.key);
      const percent = total ? (count * 100) / total : 0;
      return {
        key: status.key,
        label: status.label,
        count,
        percent,
        css: status.css
      };
    }).filter((item) => item.count > 0 || !total);
  }

  stageValue(unitStat: UnitStats, key: StageKey) {
    return unitStat.avg_stage_hours?.[key] ?? null;
  }

  maxStageValue(unitStat: UnitStats) {
    const values = [
      this.stageValue(unitStat, 'receptor'),
      this.stageValue(unitStat, 'analista'),
      this.stageValue(unitStat, 'aprobador'),
      this.stageValue(unitStat, 'total_aprobado')
    ].map((value) => Number(value || 0));
    const max = Math.max(...values, 0);
    return max > 0 ? max : 1;
  }

  stageWidth(unitStat: UnitStats, key: StageKey) {
    const value = this.stageValue(unitStat, key);
    if (value === null || value === undefined || !Number.isFinite(value)) return 0;
    return (Number(value) * 100) / this.maxStageValue(unitStat);
  }

  unitLabel(unit: string) {
    const normalized = String(unit || 'GENERAL').toUpperCase();
    if (normalized === 'RAN') return 'Unidad RAN';
    if (normalized === 'DVSO') return 'Unidad DVSO';
    if (normalized === 'AILA') return 'Unidad AILA';
    if (normalized === 'FINANCIERO') return 'Unidad FINANCIERO';
    return 'Unidad GENERAL';
  }

  formatDuration(hours: number | null | undefined) {
    if (hours === null || hours === undefined || !Number.isFinite(hours)) return 'N/D';
    const totalHours = Number(hours);
    const days = Math.floor(totalHours / 24);
    const remainingHours = Math.round((totalHours - (days * 24)) * 10) / 10;
    if (days <= 0) return `${remainingHours} h`;
    return `${days} d ${remainingHours} h`;
  }

  statusClass(statusCode: string) {
    const normalized = String(statusCode || '').trim().toLowerCase();
    return `status-${normalized}`;
  }
}
