import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API_BASE } from './api.config';
import { AuthService } from './auth.service';

type FileKey = 'correction' | 'opinions' | 'certificate_project' | 'agreement_project' | 'signed_certificate' | 'payment_order' | 'registry_receipt' | 'signed_by_user' | 'signed_agreement' | 'modification_annex_project' | 'signed_modification_annex' | 'temporary_permit' | 'archive_record';
type DocumentRow = { document_key: string; label: string; filename: string; uploaded_at: string };
type ApplicationView = {
  nombre_propietario?: string; representante_legal?: string; correo?: string; telefono?: string;
  direccion?: string; especificaciones?: string; titulo?: string; codigo?: string;
  campos_digitales: Record<string, unknown>; opciones: Record<string, unknown>;
  tablas: Record<string, Array<Record<string, unknown>>>;
};
type DisplayField = { label: string; value: string };
type DisplayTable = { label: string; rows: Array<{ label: string; fields: DisplayField[] }> };
type ProcessLog = { created_at: string; event_code: string; event_label: string; event_detail?: string | null; actor_role?: string | null; actor_name?: string | null; actor_email?: string | null };
type Workflow = { id: number; registro_codigo: string; slug?: string; workflow_type?: 'line_certificate' | 'schedule_modification' | 'auxiliary_services_certificate' | 'temporary_non_regular_permit'; assigned_analista_id?: number | null; assigned_analista_name?: string | null; assigned_analista_email?: string | null; etapa: string; estado: Record<string, any>; solicitud?: ApplicationView | null; documentos: DocumentRow[]; logs?: ProcessLog[] };
type ListRow = {
  id: number; registro_codigo: string; gestion_nombre: string; nombre_propietario: string;
  correo?: string; telefono?: string; persona_tipo?: string; created_at?: string;
  detalle_formulario?: { slug?: string; codigo?: string; campos_digitales?: Record<string, unknown> };
  documentos_resumen?: DocumentRow[]; etapa: string; estado_visual: 'sent' | 'reviewing' | 'pending' | 'finished';
  assigned_analista_id?: number | null; assigned_analista_name?: string | null; assigned_analista_email?: string | null;
};

@Component({
  selector: 'app-transport-line-workflow',
  imports: [CommonModule, FormsModule],
  template: `
    <section class="transport-workflow">
      <ng-container *ngIf="!submissionId">
        <header class="review-head">
          <div>
            <h3>Módulo de revisión</h3>
            <p>Consulta y revisa las solicitudes de Transporte Aéreo.</p>
          </div>
          <label class="filter">Formulario:
            <select [(ngModel)]="filterFormulario">
              <option value="">Todos</option>
              <option value="linea-aerea">Certificado de Explotación de una Línea Aérea</option>
              <option value="modificacion-horarios-rutas-frecuencias">Modificación de horarios, rutas y frecuencias</option>
              <option value="trabajos-aereos-servicios-auxiliares">Certificado de Explotación para Trabajos Aéreos/Servicios Auxiliares</option>
              <option value="permiso-temporal-no-regular">Permiso Temporal de Explotación Comercial No Regular</option>
            </select>
          </label>
        </header>
        <div class="status-legend" aria-label="Filtrar solicitudes por estado">
          <button type="button" class="chip assigned" [class.active]="statusFilter === 'reviewing'" [attr.aria-pressed]="statusFilter === 'reviewing'" (click)="toggleStatusFilter('reviewing')">En revisión</button>
          <button type="button" class="chip pending" [class.active]="statusFilter === 'pending'" [attr.aria-pressed]="statusFilter === 'pending'" (click)="toggleStatusFilter('pending')">Pendiente</button>
          <button type="button" class="chip unopened" [class.active]="statusFilter === 'sent'" [attr.aria-pressed]="statusFilter === 'sent'" (click)="toggleStatusFilter('sent')">Enviado</button>
        </div>
        <div class="process-list" *ngIf="filteredRows().length; else noProcesses">
          <article class="process-card" *ngFor="let row of filteredRows()" [class]="cardStateClass(row)">
            <div class="process-main">
              <div class="process-title-block">
                <div class="process-title">
                  <strong>{{ row.nombre_propietario || 'N/D' }}</strong>
                  <span class="registry-chip">{{ row.registro_codigo || ('#' + row.id) }}</span>
                </div>
                <div class="process-subtitle">{{ row.correo || 'N/D' }} · Tel. {{ row.telefono || 'N/D' }}</div>
              </div>
              <div class="process-actions">
                <span class="pill">{{ row.gestion_nombre || 'Certificado de Explotación de una Línea Aérea' }}</span>
                <span class="state-pill" [class]="cardStateClass(row)">{{ cardStateLabel(row) }}</span>
                <button type="button" class="open-btn" (click)="open(row.id)">Abrir</button>
              </div>
            </div>
            <div class="process-meta">
              <span><strong>Referencia</strong>{{ referenceValue(row) }}</span>
              <span><strong>{{ entityFieldLabel(row) }}</strong>{{ entityFieldValue(row) }}</span>
              <span><strong>Fecha envío</strong>{{ row.created_at | date:'short' }}</span>
              <span><strong>Responsable actual</strong>{{ stageOwner(row) }}</span>
            </div>
            <div class="documents-row">
              <span class="documents-label">Documentos</span>
              <div class="doc-list" *ngIf="row.documentos_resumen?.length; else noCardDocs">
                <span class="doc-chip" *ngFor="let doc of (row.documentos_resumen || []).slice(0, 3)">{{ doc.label }}</span>
                <span class="doc-chip" *ngIf="(row.documentos_resumen || []).length > 3">+{{ (row.documentos_resumen || []).length - 3 }} más</span>
              </div>
              <ng-template #noCardDocs><span class="muted">Sin documentos</span></ng-template>
            </div>
          </article>
        </div>
        <ng-template #noProcesses><div class="empty" *ngIf="!loading">No hay registros para mostrar.</div></ng-template>
      </ng-container>
      <p *ngIf="error" class="error">{{ error }}</p>
      <p *ngIf="message" class="success">{{ message }}</p>
      <div *ngIf="workflow as item" class="editor">
        <h4>{{ submissionId ? 'Seguimiento del proceso' : 'Edición de registro' }} {{ item.registro_codigo || ('#' + item.id) }}</h4>
        <p class="editor-state">Estado actual: <strong>{{ stageLabel(item.etapa) }}</strong></p>
        <section class="log-box" *ngIf="role !== 'user'">
          <div class="log-head"><h5>Bitácora del proceso</h5><small>Fecha y hora de cada movimiento</small></div>
          <p class="log-empty" *ngIf="!item.logs?.length">Sin movimientos registrados.</p>
          <ul class="log-list" *ngIf="item.logs?.length">
            <li *ngFor="let entry of item.logs">
              <div class="log-meta"><span>{{ entry.created_at | date:'short' }}</span><span class="log-role" *ngIf="entry.actor_role">{{ logRole(entry.actor_role) }}</span></div>
              <strong class="log-event">{{ logLabel(entry) }}</strong>
              <small *ngIf="entry.event_detail">{{ entry.event_detail }}</small>
              <small *ngIf="entry.actor_name || entry.actor_email">Por: {{ entry.actor_name || entry.actor_email }}<ng-container *ngIf="entry.actor_name && entry.actor_email"> ({{ entry.actor_email }})</ng-container></small>
            </li>
          </ul>
        </section>
        <p *ngIf="expectedTime(item.etapa)">Tiempo de referencia del procedimiento: {{ expectedTime(item.etapa) }}</p>
        <p *ngIf="item.etapa === 'user_correction' && item.estado['observacion']">Corrección solicitada: {{ item.estado['observacion'] }}</p>
        <p *ngIf="item.etapa === 'jefatura_review' && item.estado['inconformidad']">Inconformidad del usuario: {{ item.estado['inconformidad'] }}</p>
        <p *ngIf="isAuxiliaryWorkflow() && item.etapa === 'analyst_close'">La boleta de pago ya está disponible. Preséntate en la DGAC para realizar el pago correspondiente y entregar la constancia al Analista de Servicios Aéreos.</p>
        <section *ngIf="item.solicitud as form" class="application-detail">
          <h5 *ngIf="form.titulo">{{ form.titulo }}</h5>
          <div class="application-grid">
            <label class="application-field" *ngFor="let field of applicationFields(form)">
              <span>{{ field.label }}</span><input [value]="field.value" [title]="field.value" readonly />
            </label>
            <label class="application-field"><span>Analista asignado</span><input [value]="item.assigned_analista_name || item.assigned_analista_email || 'Sin asignar'" readonly /></label>
            <label class="application-field"><span>Responsable actual</span><input [value]="stageOwnerName(item.etapa)" readonly /></label>
          </div>
          <section *ngFor="let table of applicationTables(form)" class="application-table">
            <h5>{{ table.label }}</h5>
            <div *ngFor="let row of table.rows" class="application-row">
              <strong>{{ row.label }}</strong>
              <div class="application-grid">
                <label class="application-field" *ngFor="let field of row.fields">
                  <span>{{ field.label }}</span><input [value]="field.value" [title]="field.value" readonly />
                </label>
              </div>
            </div>
          </section>
        </section>
        <section class="documents" *ngIf="initialDocuments(item).length">
          <h5>Documentos del proceso</h5>
          <button type="button" *ngFor="let doc of initialDocuments(item)" (click)="download(doc)">{{ doc.label }} · {{ doc.filename }}</button>
        </section>
        <section class="documents" *ngIf="workflowDocuments(item).length">
          <h5>Documentos generados durante el proceso</h5>
          <button type="button" *ngFor="let doc of workflowDocuments(item)" (click)="download(doc)">{{ doc.label }} · {{ doc.filename }}</button>
        </section>
        <div *ngIf="actions().length" class="actions">
          <label *ngIf="needsNotes()">Observaciones
            <textarea [(ngModel)]="notes" rows="3" placeholder="Describe el motivo o las notificaciones realizadas"></textarea>
          </label>
          <label *ngIf="item.etapa === 'analyst_payment' && isAnalyst() && !isAuxiliaryWorkflow()"><input type="checkbox" [(ngModel)]="newOperator"> Es un operador nuevo; se requerirá constancia de pago registral</label>
          <p *ngIf="item.etapa === 'analyst_payment'">Carga aquí la boleta de pago en PDF para notificar al usuario.</p>
          <div *ngIf="item.etapa === 'analyst_close' && !isAuxiliaryWorkflow() && !isTemporaryPermitWorkflow()" class="checklist">
            <strong>{{ notificationChecklistTitle() }}</strong>
            <label *ngFor="let entry of activeNotificationEntries()"><input type="checkbox" [(ngModel)]="notifications[entry.key]"> {{ entry.label }}</label>
          </div>
          <label *ngFor="let key of requiredFiles()" class="file-label">{{ fileLabel(key) }} (PDF)
            <input type="file" accept="application/pdf" (change)="onFile(key, $event)">
          </label>
          <div class="buttons">
            <button type="button" *ngFor="let action of actions()" (click)="advance(action.code)" [disabled]="busy">{{ action.label }}</button>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .transport-workflow { margin-top: 20px; padding: 20px; border: 1px solid rgba(147,197,253,.55); border-radius: 18px; background: radial-gradient(circle at top left, rgba(14,165,233,.08), transparent 30%), linear-gradient(180deg,#fff,#f6fbff); box-shadow: 0 12px 28px rgba(15,23,42,.07); }
    .review-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
    .review-head h3 { margin: 0; font-size: 24px; letter-spacing: -.02em; color: #0f2d47; }
    .review-head p { margin: 4px 0 0; color: #52657a; font-size: 14px; }
    .filter { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .filter select { padding: 8px 12px; min-width: 220px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; }
    .status-legend { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 14px; }
    .chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid; cursor: pointer; }
    .chip.active { outline: 2px solid currentColor; outline-offset: 2px; font-weight: 700; }
    .chip:focus-visible { outline: 2px solid #0f2d47; outline-offset: 2px; }
    .chip.assigned { background: #dcfce7; border-color: #86efac; color: #166534; }
    .chip.pending { background: #fef9c3; border-color: #fde047; color: #854d0e; }
    .chip.unopened { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
    .process-list { display: grid; gap: 12px; max-height: 520px; overflow: auto; padding: 4px 6px 4px 0; }
    .process-card { display: grid; gap: 12px; padding: 14px; border: 1px solid #d7e6f2; border-left: 5px solid #93c5fd; border-radius: 16px; background: #fff; box-shadow: 0 10px 24px rgba(15,23,42,.06); }
    .process-card.state-enviado,.process-card.state-devuelto { border-left-color: #ef4444; background: #fff7f7; }
    .process-card.state-pending { border-left-color: #f59e0b; background: #fffdf0; }
    .process-card.state-asignado,.process-card.state-entregado { border-left-color: #22c55e; background: #f3fff7; }
    .process-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .process-title-block { min-width: 0; }
    .process-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 16px; color: #0f2d47; }
    .process-subtitle { margin-top: 4px; color: #52657a; font-size: 13px; overflow-wrap: anywhere; }
    .registry-chip { display: inline-flex; padding: 3px 9px; border-radius: 999px; background: #e0f2fe; border: 1px solid #93c5fd; color: #075985; font-size: 12px; font-weight: 700; }
    .process-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 10px; border: 1px solid #c7d2fe; background: #eef2ff; font-size: 12px; }
    .state-pill { display: inline-flex; align-items: center; padding: 2px 8px; border: 1px solid; border-radius: 999px; font-size: 12px; white-space: nowrap; }
    .state-pill.state-enviado,.state-pill.state-devuelto { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
    .state-pill.state-pending { background: #fef9c3; border-color: #fde047; color: #854d0e; }
    .state-pill.state-asignado,.state-pill.state-entregado { background: #dcfce7; border-color: #86efac; color: #166534; }
    .open-btn { border: 1px solid #0284c7; border-radius: 999px; background: #0ea5e9; color: #fff; padding: 7px 14px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 16px rgba(14,165,233,.18); }
    .process-meta { display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 8px; padding: 10px; border-radius: 12px; background: #f8fbfe; border: 1px solid #e2edf6; }
    .process-meta span { display: grid; gap: 2px; font-size: 13px; color: #0f172a; min-width: 0; overflow-wrap: anywhere; }
    .process-meta strong { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
    .documents-row { display: grid; grid-template-columns: 110px 1fr; gap: 10px; align-items: start; padding-top: 10px; border-top: 1px dashed #d7e6f2; }
    .documents-label { color: #18466d; font-weight: 800; font-size: 13px; }
    .doc-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .doc-chip { border: 1px solid #93c5fd; background: #eff6ff; color: #1d4ed8; border-radius: 999px; padding: 3px 8px; font-size: 12px; }
    .muted,.empty { color: #64748b; font-size: 13px; }
    .empty { padding: 12px; }
    .editor { margin-top: 14px; padding: 14px; border: 1px solid #cbd5e1; border-radius: 12px; background: #fff; box-shadow: 0 8px 20px rgba(15,23,42,.05); }
    .editor h4 { margin: 0 0 8px; color: #183e61; font-size: 18px; }
    .editor-state { margin: 0 0 12px; font-size: 13px; color: #52657a; }
    .log-box { margin: 12px 0 16px; padding: 12px; border: 1px solid #d7e6f2; border-radius: 12px; background: #f8fbff; }
    .log-head,.log-meta { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .log-head h5 { margin: 0; font-size: 14px; color: #263d53; }
    .log-head small,.log-meta { color: #64748b; font-size: 12px; }
    .log-list { list-style: none; margin: 10px 0 0; padding: 0; max-height: 230px; overflow: auto; display: grid; gap: 7px; }
    .log-list li { display: grid; gap: 4px; padding: 9px; border: 1px solid #d7e6f2; border-radius: 9px; background: #fff; }
    .log-role { padding: 3px 8px; border-radius: 999px; background: #e8eef7; color: #475569; font-weight: 700; }
    .log-event { width: fit-content; padding: 4px 9px; border-radius: 999px; background: #e8f1ff; color: #1d4ed8; font-size: 12px; }
    .log-list small,.log-empty { font-size: 12px; color: #475569; }
    .log-empty { margin: 10px 0 0; }
    .documents,.actions { display: grid; gap: 9px; margin-top: 14px; }
    .documents { padding-top: 12px; border-top: 1px dashed #d7e6f2; }
    .documents h5 { margin: 0; color: #263d53; font-size: 14px; }
    .documents button { text-align: left; background: #f1f5f9; color: #123755; border: 1px solid #cbd5e1; padding: 8px; border-radius: 7px; cursor: pointer; }
    .application-detail { margin-top: 18px; }
    .application-detail > h5 { margin: 0 0 12px; color: #183e61; font-size: 13px; }
    .application-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .application-field { display: grid; gap: 5px; min-width: 0; color: #344a60; font-size: 13px; }
    .application-field input { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid #cbdff0; border-radius: 9px; background: #fff; color: #334155; padding: 9px 10px; font: inherit; }
    .application-field input:focus { outline: 2px solid #93c5fd; }
    .application-table { margin-top: 16px; }
    .application-table h5 { margin: 0 0 10px; color: #183e61; }
    .application-row { margin-top: 8px; padding: 10px; background: #eef5fb; border-radius: 8px; }
    .application-row > strong { display: block; margin-bottom: 8px; color: #183e61; }
    .actions { border-top: 1px solid #cbd5e1; padding-top: 12px; }
    .actions label { display: grid; gap: 5px; }
    .file-label input { max-width: 100%; }
    .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
    .buttons button { background: #224d73; color: #fff; border: 0; padding: 9px 12px; border-radius: 7px; cursor: pointer; }
    textarea { width: 100%; box-sizing: border-box; }
    .error { color: #b91c1c; }.success { color: #166534; }
    @media (max-width: 900px) { .application-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 780px) { .review-head,.process-main { flex-direction: column; } .process-actions { justify-content: flex-start; } .documents-row { grid-template-columns: 1fr; } .filter { width: 100%; } .filter select { min-width: 0; width: 100%; } }
    @media (max-width: 520px) { .application-grid { grid-template-columns: 1fr; } .log-head { align-items: flex-start; flex-direction: column; } }
  `]
})
export class TransportLineWorkflowComponent implements OnInit {
  @Input() submissionId?: number;
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  readonly role = this.auth.currentUser?.role || 'user';
  filterFormulario = '';
  statusFilter: 'sent' | 'reviewing' | 'pending' | '' = '';
  rows: ListRow[] = [];
  workflow: Workflow | null = null;
  files: Partial<Record<FileKey, File>> = {};
  notes = '';
  newOperator = false;
  notifications: Record<string, boolean> = {};
  readonly notificationEntries = [
    { key: 'seguridad_operacional', label: 'Certificado a Vigilancia de la Seguridad Operacional' },
    { key: 'financiero', label: 'Certificado y copia de convenio a Financiero' },
    { key: 'navegacion_aerea', label: 'Certificado a Navegación Aérea' },
    { key: 'operaciones_aeroportuarias', label: 'Certificado a Operaciones Aeroportuarias' },
    { key: 'usuario', label: 'Convenio original al usuario' },
    { key: 'asesoria_juridica', label: 'Convenio a Asesoría Jurídica para resguardo' },
    { key: 'expediente_archivado', label: 'Expediente archivado' }
  ];
  readonly scheduleNotificationEntries = [
    { key: 'seguridad_operacional', label: 'Certificado de Explotación a Vigilancia de la Seguridad Operacional' },
    { key: 'operaciones_aeroportuarias', label: 'Certificado de Explotación a Operaciones Aeroportuarias' },
    { key: 'aim', label: 'Certificado de Explotación a AIM' }
  ];
  loading = false;
  busy = false;
  error = '';
  message = '';

  ngOnInit(): void {
    if (this.submissionId) this.open(this.submissionId);
    else this.loadList();
  }

  isAnalyst(): boolean { return this.role === 'analista_servicios_aereos' || this.isAdmin(); }
  isAnalystStage(stage: string): boolean { return ['analyst_review', 'analyst_payment', 'analyst_annex', 'analyst_close'].includes(stage); }
  isAdmin(): boolean { return this.role === 'admin' || this.role === 'supervisor'; }
  isRole(role: string): boolean { return this.role === role || this.isAdmin(); }

  filteredRows(): ListRow[] {
    return this.rows.filter(row => (!this.filterFormulario || row.detalle_formulario?.slug === this.filterFormulario)
      && (!this.statusFilter || row.estado_visual === this.statusFilter));
  }

  toggleStatusFilter(status: 'sent' | 'reviewing' | 'pending'): void {
    this.statusFilter = this.statusFilter === status ? '' : status;
  }

  cardStateClass(row: ListRow): string {
    if (row.estado_visual === 'sent') return 'state-enviado';
    if (row.estado_visual === 'reviewing') return 'state-asignado';
    if (row.estado_visual === 'finished') return 'state-entregado';
    return 'state-pending';
  }

  cardStateLabel(row: ListRow): string {
    if (row.estado_visual === 'sent') return 'Enviado';
    if (row.estado_visual === 'reviewing') return 'En revisión';
    if (row.estado_visual === 'finished') return 'Finalizado';
    return 'Pendiente';
  }

  isScheduleRow(row: ListRow): boolean {
    return row.detalle_formulario?.slug === 'modificacion-horarios-rutas-frecuencias';
  }

  isAuxiliaryRow(row: ListRow): boolean {
    return row.detalle_formulario?.slug === 'trabajos-aereos-servicios-auxiliares';
  }

  isTemporaryPermitRow(row: ListRow): boolean {
    return row.detalle_formulario?.slug === 'permiso-temporal-no-regular';
  }

  referenceValue(row: ListRow): string {
    return this.isAuxiliaryRow(row)
      ? row.registro_codigo || ('#' + row.id)
      : row.detalle_formulario?.codigo || 'N/D';
  }

  entityFieldLabel(row: ListRow): string {
    if (this.isScheduleRow(row)) return 'Entidad';
    if (this.isAuxiliaryRow(row) || this.isTemporaryPermitRow(row)) return 'Solicitante';
    return 'Línea aérea';
  }

  entityFieldValue(row: ListRow): string {
    const fields = row.detalle_formulario?.campos_digitales || {};
    if (this.isScheduleRow(row)) return String(fields['entidad'] || row.nombre_propietario || 'N/D');
    if (this.isAuxiliaryRow(row) || this.isTemporaryPermitRow(row)) return String(fields['entidad'] || row.nombre_propietario || 'N/D');
    return String(fields['linea_aerea'] || row.nombre_propietario || 'N/D');
  }

  stageOwner(row: ListRow): string {
    const stage = row.etapa;
    if (this.isAnalystStage(stage)) return row.assigned_analista_name || row.assigned_analista_email || (row.assigned_analista_id ? 'Analista asignado' : 'Sin asignar');
    return this.stageOwnerName(stage);
  }

  stageOwnerName(stage: string): string {
    const owners: Record<string, string> = {
      analyst_review: 'Analista de Servicios Aéreos', user_correction: 'Usuario solicitante',
      jefatura_review: 'Jefatura de Transporte Aéreo', legal_and_despacho: 'Asesoría Jurídica y Despacho Superior',
      analyst_payment: 'Analista de Servicios Aéreos', user_review: 'Usuario solicitante',
      analyst_annex: 'Analista de Servicios Aéreos', office_signature: 'Despacho Superior',
      jefatura_agreement: 'Jefatura de Transporte Aéreo', office_agreement: 'Despacho Superior',
      analyst_close: 'Analista de Servicios Aéreos', finished: 'Proceso finalizado'
    };
    return owners[stage] || 'No definido';
  }

  logRole(role: string): string {
    const labels: Record<string, string> = {
      user: 'USUARIO', analista_servicios_aereos: 'ANALISTA DE SERVICIOS AÉREOS',
      jefatura_transporte_aereo: 'JEFATURA', asesoria_juridica_transporte_aereo: 'ASESORÍA JURÍDICA',
      despacho_superior_transporte_aereo: 'DESPACHO SUPERIOR'
    };
    return labels[role] || role.replace(/_/g, ' ').toUpperCase();
  }

  logLabel(entry: ProcessLog): string {
    const labels: Record<string, string> = {
      ta_line_request_correction: 'Solicitó corrección al usuario',
      ta_line_resubmit: 'Usuario completó la documentación',
      ta_line_send_to_head: 'Trasladó la solicitud a Jefatura',
      ta_line_send_projects: 'Envió proyectos a Jurídica y Despacho',
      ta_line_legal_draft: 'Elaboró el proyecto de convenio',
      ta_line_sign_certificate: 'Firmó el certificado y anexos',
      ta_line_send_payment_order: 'Envió la boleta de pago',
      ta_line_accept: 'Usuario aceptó y firmó el convenio',
      ta_line_object: 'Usuario notificó inconformidad',
      ta_line_send_agreement: 'Trasladó el convenio a Despacho',
      ta_line_sign_agreement: 'Firmó el convenio',
      ta_line_archive: 'Notificó y archivó el expediente',
      ta_line_send_modification_project: 'Trasladó el proyecto de modificación a Despacho Superior',
      ta_line_return_signed_modification: 'Firmó y devolvió el proyecto de modificación',
      ta_line_send_annex_to_user: 'Cargó el Anexo y lo envió al usuario',
      ta_line_notify_finish: 'Realizó las notificaciones y finalizó el proceso',
      ta_line_send_auxiliary_projects: 'Trasladó el proyecto de Certificado y Anexo a Despacho Superior',
      ta_line_return_signed_auxiliary: 'Firmó y devolvió el Certificado y Anexo al Analista',
      ta_line_archive_finish: 'Cargó el expediente y finalizó el proceso',
      ta_line_authorize_temporary_permit: 'Jefatura autorizó el Permiso Temporal de Explotación',
      ta_line_archive_temporary: 'Cargó y archivó el expediente'
    };
    return labels[entry.event_code] || entry.event_label || entry.event_code;
  }

  loadList(): void {
    this.loading = true;
    this.http.get<ListRow[]>(`${API_BASE}/transport-line-workflow`).subscribe({
      next: rows => { this.rows = rows; this.loading = false; },
      error: err => { this.error = err?.error?.error || 'No se pudieron cargar las solicitudes.'; this.loading = false; }
    });
  }

  open(id: number): void {
    this.error = '';
    this.http.get<Workflow>(`${API_BASE}/transport-line-workflow/${id}`).subscribe({
      next: workflow => {
        this.workflow = workflow;
        this.newOperator = Boolean(workflow.estado['nuevo_operador']);
        this.files = {};
        if (!this.submissionId) {
          this.http.post<{ estado_visual: ListRow['estado_visual'] }>(`${API_BASE}/transport-line-workflow/${id}/open`, {}).subscribe({
            next: ({ estado_visual }) => {
              this.rows = this.rows.map(row => row.id === id ? { ...row, estado_visual } : row);
              this.statusFilter = '';
            },
            error: err => { this.error = err?.error?.error || 'No se pudo registrar la apertura del proceso.'; }
          });
        }
      },
      error: err => { this.error = err?.error?.error || 'No se pudo abrir el proceso.'; }
    });
  }

  stageLabel(stage: string): string {
    if (this.isTemporaryPermitWorkflow()) {
      const temporaryLabels: Record<string, string> = {
        analyst_review: 'Paso 2: revisión del Analista de Servicios Aéreos',
        user_correction: 'Paso 3: corrección del usuario',
        jefatura_review: 'Paso 4: elaboración y autorización del permiso por Jefatura',
        user_review: 'Paso 5: revisión y aceptación del usuario',
        analyst_close: 'Paso 6: carga y archivo del expediente',
        finished: 'Proceso finalizado'
      };
      return temporaryLabels[stage] || stage;
    }
    if (this.isAuxiliaryWorkflow()) {
      const auxiliaryLabels: Record<string, string> = {
        analyst_review: 'Paso 2: revisión del Analista de Servicios Aéreos',
        user_correction: 'Paso 3: corrección del usuario',
        jefatura_review: 'Paso 4: revisión de Jefatura de Transporte Aéreo',
        office_signature: 'Paso 5: firma de Despacho Superior',
        analyst_payment: 'Paso 6: carga de la boleta de pago',
        analyst_close: 'Pasos 7 y 8: pago presencial, archivo y finalización',
        finished: 'Proceso finalizado'
      };
      return auxiliaryLabels[stage] || stage;
    }
    if (this.isScheduleWorkflow()) {
      const scheduleLabels: Record<string, string> = {
        analyst_review: 'Paso 2: revisión del Analista de Servicios Aéreos',
        user_correction: 'Paso 3: corrección del usuario',
        jefatura_review: 'Paso 4: revisión de Jefatura de Transporte Aéreo',
        office_signature: 'Paso 5: firma de Despacho Superior',
        analyst_annex: 'Paso 6: carga del Anexo por el Analista de Servicios Aéreos',
        user_review: 'Paso 7: revisión y aceptación del usuario',
        analyst_close: 'Paso 8: notificación de unidades',
        finished: 'Proceso finalizado'
      };
      return scheduleLabels[stage] || stage;
    }
    const labels: Record<string, string> = {
      analyst_review: 'Paso 2: revisión del Analista de Servicios Aéreos',
      user_correction: 'Paso 3: corrección del usuario',
      jefatura_review: 'Paso 4: Jefatura de Transporte Aéreo',
      legal_and_despacho: 'Pasos 5 y 6: Asesoría Jurídica y Despacho Superior',
      analyst_payment: 'Paso 7: gestión de inscripción y boleta de pago',
      user_review: 'Paso 8: pago, firma y aceptación del usuario',
      jefatura_agreement: 'Paso 9: envío del convenio a Despacho Superior',
      office_agreement: 'Paso 10: firma del convenio',
      analyst_close: 'Paso 11: notificación y archivo',
      finished: 'Proceso finalizado'
    };
    return labels[stage] || stage;
  }

  expectedTime(stage: string): string {
    if (this.isScheduleWorkflow() || this.isAuxiliaryWorkflow() || this.isTemporaryPermitWorkflow()) return '';
    const times: Record<string, string> = {
      analyst_review: '2 horas', user_correction: '1 hora', jefatura_review: '2 horas',
      legal_and_despacho: '1 día para Jurídica y 2 días para Despacho Superior',
      analyst_payment: '1 día', jefatura_agreement: '15 minutos',
      office_agreement: '2 días', analyst_close: '45 minutos'
    };
    return times[stage] || '';
  }

  isScheduleWorkflow(): boolean {
    return this.workflow?.workflow_type === 'schedule_modification' || this.workflow?.slug === 'modificacion-horarios-rutas-frecuencias';
  }

  isAuxiliaryWorkflow(): boolean {
    return this.workflow?.workflow_type === 'auxiliary_services_certificate' || this.workflow?.slug === 'trabajos-aereos-servicios-auxiliares';
  }

  isTemporaryPermitWorkflow(): boolean {
    return this.workflow?.workflow_type === 'temporary_non_regular_permit' || this.workflow?.slug === 'permiso-temporal-no-regular';
  }

  activeNotificationEntries(): Array<{ key: string; label: string }> {
    return this.isScheduleWorkflow() ? this.scheduleNotificationEntries : this.notificationEntries;
  }

  notificationChecklistTitle(): string {
    return this.isScheduleWorkflow()
      ? 'Confirma las notificaciones realizadas antes de finalizar'
      : 'Confirma las notificaciones realizadas y el archivo del expediente';
  }

  initialDocuments(item: Workflow): DocumentRow[] {
    return item.documentos.filter(doc => !doc.document_key.startsWith('ta_line_'));
  }

  workflowDocuments(item: Workflow): DocumentRow[] {
    return item.documentos.filter(doc => doc.document_key.startsWith('ta_line_'));
  }

  applicationFields(form: ApplicationView): DisplayField[] {
    const primary: Record<string, unknown> = {
      nombre_propietario: form.nombre_propietario,
      representante_legal: form.representante_legal,
      correo: form.correo,
      telefono: form.telefono,
      direccion: form.direccion,
      especificaciones: form.especificaciones
    };
    const fields = Object.entries({ ...primary, ...form.campos_digitales })
      .map(([key, value]) => ({ label: this.humanize(key), value: String(value ?? '').trim() }))
      .filter(field => field.value);
    for (const [key, selected] of Object.entries(form.opciones || {})) {
      if (selected) fields.push({ label: this.humanize(key), value: 'Sí' });
    }
    return fields;
  }

  applicationTables(form: ApplicationView): DisplayTable[] {
    return Object.entries(form.tablas || {}).map(([key, rows]) => ({
      label: this.humanize(key),
      rows: (Array.isArray(rows) ? rows : []).map((row, index) => ({
        label: `${this.humanize(key)} ${index + 1}`,
        fields: Object.entries(row || {})
          .map(([fieldKey, value]) => ({ label: this.humanize(fieldKey), value: String(value ?? '').trim() }))
          .filter(field => field.value)
      })).filter(row => row.fields.length)
    })).filter(table => table.rows.length);
  }

  private humanize(key: string): string {
    const labels: Record<string, string> = {
      nombre_propietario: 'Solicitante / línea aérea', representante_legal: 'Representante legal',
      correo: 'Correo electrónico', correo_electronico: 'Correo electrónico',
      telefono: 'Teléfono', direccion: 'Dirección', especificaciones: 'Observaciones',
      linea_aerea: 'Línea aérea', fecha_solicitud: 'Fecha de solicitud', tipo_servicio: 'Tipo de servicio'
    };
    return labels[key] || key.replace(/_/g, ' ').replace(/^./, char => char.toUpperCase());
  }

  actions(): { code: string; label: string }[] {
    const w = this.workflow;
    if (!w) return [];
    if (this.isTemporaryPermitWorkflow()) {
      switch (w.etapa) {
        case 'analyst_review': return this.isAnalyst() ? [{ code: 'request_correction', label: 'Solicitar corrección' }, { code: 'send_to_head', label: 'Trasladar a Jefatura' }] : [];
        case 'user_correction': return this.role === 'user' ? [{ code: 'resubmit', label: 'Enviar documentación corregida' }] : [];
        case 'jefatura_review': return this.isRole('jefatura_transporte_aereo') ? [{ code: 'authorize_temporary_permit', label: 'Autorizar permiso y enviar al usuario' }] : [];
        case 'user_review': return this.role === 'user' ? [{ code: 'accept', label: 'Aceptar y descargar permiso' }, { code: 'object', label: 'Notificar inconformidad' }] : [];
        case 'analyst_close': return this.isAnalyst() ? [{ code: 'archive_temporary', label: 'Cargar expediente, archivar y finalizar' }] : [];
        default: return [];
      }
    }
    if (this.isAuxiliaryWorkflow()) {
      switch (w.etapa) {
        case 'analyst_review': return this.isAnalyst() ? [{ code: 'request_correction', label: 'Solicitar corrección' }, { code: 'send_to_head', label: 'Trasladar a Jefatura' }] : [];
        case 'user_correction': return this.role === 'user' ? [{ code: 'resubmit', label: 'Enviar documentación corregida' }] : [];
        case 'jefatura_review': return this.isRole('jefatura_transporte_aereo') ? [{ code: 'send_auxiliary_projects', label: 'Enviar proyecto a Despacho Superior' }] : [];
        case 'office_signature': return this.isRole('despacho_superior_transporte_aereo') ? [{ code: 'return_signed_auxiliary', label: 'Cargar documentos firmados y devolver al Analista' }] : [];
        case 'analyst_payment': return this.isAnalyst() ? [{ code: 'send_payment_order', label: 'Cargar boleta y avisar al usuario' }] : [];
        case 'analyst_close': return this.isAnalyst() ? [{ code: 'archive_finish', label: 'Cargar expediente y finalizar' }] : [];
        default: return [];
      }
    }
    if (this.isScheduleWorkflow()) {
      switch (w.etapa) {
        case 'analyst_review': return this.isAnalyst() ? [{ code: 'request_correction', label: 'Solicitar corrección' }, { code: 'send_to_head', label: 'Trasladar a Jefatura' }] : [];
        case 'user_correction': return this.role === 'user' ? [{ code: 'resubmit', label: 'Enviar documentación corregida' }] : [];
        case 'jefatura_review': return this.isRole('jefatura_transporte_aereo') ? [{ code: 'send_modification_project', label: 'Enviar proyecto a Despacho Superior' }] : [];
        case 'office_signature': return this.isRole('despacho_superior_transporte_aereo') ? [{ code: 'return_signed_modification', label: 'Confirmar firma y devolver a Transporte Aéreo' }] : [];
        case 'analyst_annex': return this.isAnalyst() ? [{ code: 'send_annex_to_user', label: 'Cargar Anexo y enviar al usuario' }] : [];
        case 'user_review': return this.role === 'user' ? [{ code: 'accept', label: 'Aceptar y descargar Anexo' }, { code: 'object', label: 'Notificar inconformidad' }] : [];
        case 'analyst_close': return this.isAnalyst() ? [{ code: 'notify_finish', label: 'Registrar notificaciones y finalizar' }] : [];
        default: return [];
      }
    }
    switch (w.etapa) {
      case 'analyst_review': return this.isAnalyst() ? [{ code: 'request_correction', label: 'Solicitar corrección' }, { code: 'send_to_head', label: 'Trasladar a Jefatura' }] : [];
      case 'user_correction': return this.role === 'user' ? [{ code: 'resubmit', label: 'Enviar documentación corregida' }] : [];
      case 'jefatura_review': return this.isRole('jefatura_transporte_aereo') ? [{ code: 'send_projects', label: 'Enviar proyectos a Jurídica y Despacho' }] : [];
      case 'legal_and_despacho': {
        const result = [];
        if (this.isRole('asesoria_juridica_transporte_aereo') && !w.estado['legal_done']) result.push({ code: 'legal_draft', label: 'Cargar proyecto de convenio' });
        if (this.isRole('despacho_superior_transporte_aereo') && !w.estado['office_done']) result.push({ code: 'sign_certificate', label: 'Cargar certificado firmado' });
        return result;
      }
      case 'analyst_payment': return this.isAnalyst() ? [{ code: 'send_payment_order', label: 'Registrar boleta y enviar al usuario' }] : [];
      case 'user_review': return this.role === 'user' ? [{ code: 'accept', label: 'Firmar y aceptar' }, { code: 'object', label: 'Notificar inconformidad' }] : [];
      case 'jefatura_agreement': return this.isRole('jefatura_transporte_aereo') ? [{ code: 'send_agreement', label: 'Trasladar convenio a Despacho' }] : [];
      case 'office_agreement': return this.isRole('despacho_superior_transporte_aereo') ? [{ code: 'sign_agreement', label: 'Cargar convenio firmado' }] : [];
      case 'analyst_close': return this.isAnalyst() ? [{ code: 'archive', label: 'Registrar notificaciones y archivar' }] : [];
      default: return [];
    }
  }

  needsNotes(): boolean {
    const stages = this.isTemporaryPermitWorkflow()
      ? ['analyst_review', 'user_review']
      : this.isAuxiliaryWorkflow()
      ? ['analyst_review']
      : this.isScheduleWorkflow() ? ['analyst_review', 'user_review'] : ['analyst_review', 'user_review', 'analyst_close'];
    return stages.includes(this.workflow?.etapa || '');
  }

  requiredFiles(): FileKey[] {
    if (this.isTemporaryPermitWorkflow()) {
      switch (this.workflow?.etapa) {
        case 'user_correction': return ['correction'];
        case 'jefatura_review': return ['opinions', 'temporary_permit'];
        case 'analyst_close': return ['archive_record'];
        default: return [];
      }
    }
    if (this.isAuxiliaryWorkflow()) {
      switch (this.workflow?.etapa) {
        case 'user_correction': return ['correction'];
        case 'jefatura_review': return ['opinions', 'certificate_project'];
        case 'office_signature': return ['signed_certificate'];
        case 'analyst_payment': return ['payment_order'];
        case 'analyst_close': return ['archive_record'];
        default: return [];
      }
    }
    if (this.isScheduleWorkflow()) {
      switch (this.workflow?.etapa) {
        case 'user_correction': return ['correction'];
        case 'jefatura_review': return ['opinions', 'modification_annex_project'];
        case 'analyst_annex': return ['signed_modification_annex'];
        default: return [];
      }
    }
    switch (this.workflow?.etapa) {
      case 'user_correction': return ['correction'];
      case 'jefatura_review': return ['opinions', 'certificate_project'];
      case 'legal_and_despacho': {
        const keys: FileKey[] = [];
        if (this.isRole('asesoria_juridica_transporte_aereo') && !this.workflow?.estado['legal_done']) keys.push('agreement_project');
        if (this.isRole('despacho_superior_transporte_aereo') && !this.workflow?.estado['office_done']) keys.push('signed_certificate');
        return keys;
      }
      case 'analyst_payment': return ['payment_order'];
      case 'user_review': return this.workflow?.estado['nuevo_operador'] ? ['registry_receipt', 'signed_by_user'] : ['signed_by_user'];
      case 'office_agreement': return ['signed_agreement'];
      default: return [];
    }
  }

  fileLabel(key: FileKey): string {
    const labels: Record<FileKey, string> = {
      correction: 'Documentación complementaria', opinions: 'Dictámenes técnicos favorables',
      certificate_project: 'Proyecto de certificado y anexos', agreement_project: 'Proyecto de convenio',
      signed_certificate: 'Certificado firmado y anexos', payment_order: 'Boleta de pago de inscripción',
      registry_receipt: 'Constancia de pago registral', signed_by_user: 'Convenio firmado por representante',
      signed_agreement: 'Convenio firmado por Despacho Superior',
      modification_annex_project: 'Proyecto de modificación del Anexo del Certificado de Explotación',
      signed_modification_annex: 'Anexo del Certificado de Explotación firmado',
      temporary_permit: 'Permiso Temporal de Explotación autorizado',
      archive_record: 'Expediente completo para archivo'
    };
    return labels[key];
  }

  onFile(key: FileKey, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.files[key] = file;
  }

  private readFile(file: File): Promise<{ filename: string; pdf_base64: string }> {
    return new Promise((resolve, reject) => {
      if (file.size > 50 * 1024 * 1024 || file.type !== 'application/pdf') return reject(new Error('El documento debe ser PDF y no superar 50 MB.'));
      const reader = new FileReader();
      reader.onload = () => resolve({ filename: file.name, pdf_base64: String(reader.result).split(',')[1] || '' });
      reader.onerror = () => reject(new Error('No se pudo leer el PDF.'));
      reader.readAsDataURL(file);
    });
  }

  async advance(action: string): Promise<void> {
    if (!this.workflow || this.busy) return;
    this.error = ''; this.message = '';
    if (['request_correction', 'object', 'archive'].includes(action) && !this.notes.trim()) { this.error = 'Escribe las observaciones antes de continuar.'; return; }
    const keys: FileKey[] = action === 'resubmit' ? ['correction']
      : action === 'send_projects' ? ['opinions', 'certificate_project']
      : action === 'send_auxiliary_projects' ? ['opinions', 'certificate_project']
      : action === 'send_modification_project' ? ['opinions', 'modification_annex_project']
      : action === 'authorize_temporary_permit' ? ['opinions', 'temporary_permit']
      : action === 'legal_draft' ? ['agreement_project']
      : action === 'sign_certificate' ? ['signed_certificate']
      : action === 'return_signed_auxiliary' ? ['signed_certificate']
      : action === 'send_annex_to_user' ? ['signed_modification_annex']
      : action === 'send_payment_order' ? ['payment_order']
      : action === 'accept' && !this.isScheduleWorkflow() && !this.isTemporaryPermitWorkflow() ? (this.workflow.estado['nuevo_operador'] ? ['registry_receipt', 'signed_by_user'] : ['signed_by_user'])
      : action === 'sign_agreement' ? ['signed_agreement']
      : action === 'archive_finish' ? ['archive_record'] : [];
    if (action === 'archive_temporary') keys.push('archive_record');
    if (keys.some(key => !this.files[key])) { this.error = 'Carga todos los documentos PDF requeridos.'; return; }
    this.busy = true;
    try {
      const files: Record<string, { filename: string; pdf_base64: string }> = {};
      for (const key of keys) files[key] = await this.readFile(this.files[key]!);
      this.http.post(`${API_BASE}/transport-line-workflow/${this.workflow.id}/actions`, { action, notes: this.notes, new_operator: this.newOperator, notifications: this.notifications, files }).subscribe({
        next: () => {
          const id = this.workflow!.id;
          if (action === 'accept' && this.isScheduleWorkflow()) {
            const annex = this.workflow!.documentos.find(doc => doc.document_key === 'ta_line_signed_modification_annex');
            if (annex) this.download(annex);
          }
          if (action === 'accept' && this.isTemporaryPermitWorkflow()) {
            const permit = this.workflow!.documentos.find(doc => doc.document_key === 'ta_line_temporary_permit');
            if (permit) this.download(permit);
          }
          this.message = 'Etapa actualizada correctamente.';
          this.notes = '';
          this.busy = false;
          this.open(id);
          if (!this.submissionId) this.loadList();
        },
        error: err => { this.error = err?.error?.error || 'No se pudo avanzar el proceso.'; this.busy = false; }
      });
    } catch (err) { this.error = err instanceof Error ? err.message : 'No se pudo leer el documento.'; this.busy = false; }
  }

  download(doc: DocumentRow): void {
    if (!this.workflow) return;
    this.http.get(`${API_BASE}/transport-line-workflow/${this.workflow.id}/documents/${encodeURIComponent(doc.document_key)}`, { responseType: 'blob' }).subscribe({
      next: blob => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = doc.filename || 'documento.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); },
      error: err => { this.error = err?.error?.error || 'No se pudo descargar el documento.'; }
    });
  }
}
