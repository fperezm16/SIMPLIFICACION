import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentService } from './payment-form/payment.service';

type ReversalStatus = '' | 'approved' | 'timeout' | 'reversed';

interface ReversalPayment {
  id: number;
  submission_id: number;
  amount: number;
  status: 'approved' | 'timeout' | 'reversed';
  authorization_code?: string | null;
  reference_number?: string | null;
  audit_number?: string | null;
  masked_card?: string | null;
  card_brand?: string | null;
  created_at: string;
  updated_at: string;
  registro_codigo?: string | null;
  gestion_nombre?: string | null;
  nombre_propietario?: string | null;
  can_reverse: boolean;
}

interface ReversalHistoryItem {
  event_label: string;
  event_detail?: string | null;
  actor_role?: string | null;
  created_at: string;
  metadata?: { response_code?: string; response_message?: string };
}

@Component({
  selector: 'app-payment-reversals-page',
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe],
  template: `
    <section class="reversals-page">
      <header class="page-header">
        <div>
          <span class="eyebrow">Financiero</span>
          <h2>Gestión de reversas</h2>
        </div>
        <button type="button" class="icon-action" title="Actualizar pagos" (click)="loadPayments()" [disabled]="loading">↻</button>
      </header>

      <section class="filters" aria-label="Filtros de reversas">
        <label>
          Buscar
          <input [(ngModel)]="query" (keyup.enter)="loadPayments()" placeholder="Pago, registro, solicitante o referencia">
        </label>
        <label>
          Estado
          <select [(ngModel)]="status" (change)="loadPayments()">
            <option value="">Todos</option>
            <option value="approved">Aprobado</option>
            <option value="timeout">En revisión</option>
            <option value="reversed">Reversado</option>
          </select>
        </label>
        <button type="button" class="filter-button" (click)="loadPayments()" [disabled]="loading">Buscar</button>
      </section>

      <p class="notice error" *ngIf="error">{{ error }}</p>
      <p class="notice" *ngIf="loading">Cargando pagos...</p>
      <p class="notice" *ngIf="!loading && !payments.length">No hay pagos para los filtros seleccionados.</p>

      <div class="payment-table" *ngIf="payments.length">
        <div class="table-row table-head">
          <span>Pago</span><span>Trámite</span><span>Tarjeta</span><span>Monto</span><span>Estado</span><span></span>
        </div>
        <article class="table-row" *ngFor="let payment of payments">
          <div><strong>#{{ payment.id }}</strong><small>{{ payment.created_at | date:'short' }}</small></div>
          <div><strong>{{ payment.registro_codigo || ('Solicitud #' + payment.submission_id) }}</strong><small>{{ payment.gestion_nombre || payment.nombre_propietario || 'Sin detalle' }}</small></div>
          <div><strong>{{ payment.card_brand || 'N/D' }}</strong><small>{{ payment.masked_card || 'No disponible' }}</small></div>
          <div><strong>{{ payment.amount | currency:'GTQ':'symbol-narrow':'1.2-2' }}</strong><small>Ref. {{ payment.reference_number || 'N/D' }}</small></div>
          <div><span class="status" [class.approved]="payment.status === 'approved'" [class.timeout]="payment.status === 'timeout'" [class.reversed]="payment.status === 'reversed'">{{ statusLabel(payment.status) }}</span></div>
          <div class="row-actions">
            <button type="button" class="detail-button" (click)="showHistory(payment)">Historial</button>
            <button type="button" class="reverse-button" (click)="openReverse(payment)" [disabled]="!payment.can_reverse || reversingId === payment.id">Reversar</button>
          </div>
        </article>
      </div>
    </section>

    <div class="modal-layer" *ngIf="selectedPayment">
      <div class="modal-backdrop" (click)="closeDialog()"></div>
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="reversal-dialog-title">
        <header>
          <div>
            <span class="eyebrow">Reversa controlada</span>
            <h3 id="reversal-dialog-title">Pago #{{ selectedPayment.id }}</h3>
          </div>
          <button type="button" class="icon-action" title="Cerrar" (click)="closeDialog()">×</button>
        </header>
        <dl class="payment-detail">
          <div><dt>Registro</dt><dd>{{ selectedPayment.registro_codigo || selectedPayment.submission_id }}</dd></div>
          <div><dt>Monto</dt><dd>{{ selectedPayment.amount | currency:'GTQ':'symbol-narrow':'1.2-2' }}</dd></div>
          <div><dt>Referencia</dt><dd>{{ selectedPayment.reference_number || 'N/D' }}</dd></div>
          <div><dt>Auditoría</dt><dd>{{ selectedPayment.audit_number || 'N/D' }}</dd></div>
        </dl>
        <label *ngIf="dialogMode === 'reverse'">
          Motivo de reversa
          <textarea [(ngModel)]="reverseReason" maxlength="300" rows="4" placeholder="Describe el motivo de la reversa"></textarea>
        </label>
        <p class="notice error" *ngIf="dialogError">{{ dialogError }}</p>
        <section class="history" *ngIf="dialogMode === 'history'">
          <p class="notice" *ngIf="historyLoading">Cargando historial...</p>
          <p class="notice" *ngIf="!historyLoading && !history.length">Sin reversas registradas.</p>
          <article *ngFor="let item of history">
            <strong>{{ item.event_label }}</strong>
            <span>{{ item.created_at | date:'short' }} · {{ item.actor_role || 'Sistema' }}</span>
            <p *ngIf="item.event_detail">{{ item.event_detail }}</p>
            <small *ngIf="item.metadata?.response_code">{{ item.metadata?.response_code }} {{ item.metadata?.response_message || '' }}</small>
          </article>
        </section>
        <footer *ngIf="dialogMode === 'reverse'">
          <button type="button" class="detail-button" (click)="closeDialog()" [disabled]="reversingId === selectedPayment.id">Cancelar</button>
          <button type="button" class="reverse-button" (click)="confirmReverse()" [disabled]="!reverseReason.trim() || reversingId === selectedPayment.id">{{ reversingId === selectedPayment.id ? 'Procesando...' : 'Confirmar reversa' }}</button>
        </footer>
      </section>
    </div>
  `,
  styles: [`
    .reversals-page { padding: 22px; background: #fff; border: 1px solid #d8e4ec; border-radius: 8px; color: #173652; }
    .page-header, .dialog header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
    h2, h3 { margin:4px 0 0; } h2 { font-size:22px; } h3 { font-size:18px; }
    .eyebrow { color:#5d8098; font-size:11px; font-weight:700; letter-spacing:0; text-transform:uppercase; }
    .icon-action { width:36px; height:36px; border:1px solid #b7ccda; border-radius:6px; background:#fff; color:#173652; font-size:20px; cursor:pointer; }
    .filters { display:grid; grid-template-columns:minmax(250px,1fr) 180px auto; gap:12px; align-items:end; padding:16px 0; border-bottom:1px solid #dbe7ee; }
    label { display:grid; gap:6px; color:#294c65; font-size:13px; font-weight:700; }
    input, select, textarea { width:100%; box-sizing:border-box; border:1px solid #bdcfda; border-radius:6px; padding:10px; color:#173652; font:inherit; background:#fff; }
    textarea { resize:vertical; }
    button { font:inherit; font-weight:700; cursor:pointer; } button:disabled { cursor:not-allowed; opacity:.55; }
    .filter-button, .detail-button, .reverse-button { min-height:40px; border-radius:6px; padding:0 12px; }
    .filter-button, .detail-button { border:1px solid #aec5d5; background:#fff; color:#173652; }
    .reverse-button { border:1px solid #a62929; background:#b42318; color:#fff; }
    .notice { margin:14px 0 0; color:#58758a; font-size:13px; }.notice.error { color:#b42318; }
    .payment-table { margin-top:16px; border:1px solid #d8e4ec; overflow:auto; }
    .table-row { display:grid; grid-template-columns:100px minmax(190px,1.4fr) 155px 150px 120px auto; gap:12px; align-items:center; min-width:850px; padding:12px 14px; border-bottom:1px solid #e3edf2; }
    .table-row:last-child { border-bottom:0; }.table-head { background:#eff6fa; color:#547186; font-size:12px; font-weight:700; }
    .table-row strong, .table-row small { display:block; }.table-row small { margin-top:3px; color:#678093; font-size:11px; overflow-wrap:anywhere; }
    .status { display:inline-flex; padding:5px 8px; border:1px solid #b7cbd9; border-radius:999px; color:#38566c; font-size:11px; font-weight:700; }.status.approved { color:#177245; border-color:#a8d8ba; background:#effbf3; }.status.timeout { color:#a76600; border-color:#f0d3a5; background:#fff8e8; }.status.reversed { color:#0d5c91; border-color:#b4d4e8; background:#f0f8fd; }
    .row-actions { display:flex; gap:8px; justify-content:flex-end; }.row-actions button { min-height:34px; }
    .modal-layer { position:fixed; inset:0; z-index:1300; display:grid; place-items:center; padding:18px; }.modal-backdrop { position:absolute; inset:0; background:rgba(15,31,45,.54); }.dialog { position:relative; width:min(100%,520px); padding:20px; border-radius:8px; background:#fff; box-shadow:0 18px 44px rgba(15,31,45,.25); }
    .payment-detail { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:20px 0; }.payment-detail div { border-bottom:1px solid #e0eaf0; padding-bottom:8px; }.payment-detail dt { color:#668195; font-size:11px; font-weight:700; }.payment-detail dd { margin:4px 0 0; font-weight:700; }
    footer { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }.history { margin-top:18px; }.history article { padding:10px 0; border-top:1px solid #e2ebf0; }.history span, .history small { display:block; margin-top:4px; color:#668195; font-size:12px; }.history p { margin:7px 0 0; font-size:13px; }
    @media (max-width:700px) { .reversals-page { padding:16px; }.filters { grid-template-columns:1fr; }.filter-button { width:100%; }.payment-detail { grid-template-columns:1fr; }.row-actions { justify-content:flex-start; } }
  `]
})
export class PaymentReversalsPageComponent implements OnInit {
  payments: ReversalPayment[] = [];
  history: ReversalHistoryItem[] = [];
  query = '';
  status: ReversalStatus = '';
  loading = false;
  historyLoading = false;
  error = '';
  dialogError = '';
  selectedPayment: ReversalPayment | null = null;
  dialogMode: 'history' | 'reverse' = 'history';
  reverseReason = '';
  reversingId: number | null = null;

  constructor(private paymentsApi: PaymentService) {}

  ngOnInit(): void { this.loadPayments(); }

  loadPayments(): void {
    this.loading = true; this.error = '';
    this.paymentsApi.getReversalPayments(this.query, this.status).subscribe({
      next: (response) => { this.payments = response?.payments || []; this.loading = false; },
      error: (error) => { this.error = error?.error?.message || 'No se pudieron cargar los pagos.'; this.loading = false; }
    });
  }

  openReverse(payment: ReversalPayment): void {
    this.selectedPayment = payment; this.dialogMode = 'reverse'; this.reverseReason = ''; this.dialogError = ''; this.history = [];
  }

  showHistory(payment: ReversalPayment): void {
    this.selectedPayment = payment; this.dialogMode = 'history'; this.history = []; this.dialogError = ''; this.historyLoading = true;
    this.paymentsApi.getReversalHistory(payment.id).subscribe({
      next: (response) => { this.history = response?.history || []; this.historyLoading = false; },
      error: (error) => { this.dialogError = error?.error?.message || 'No se pudo cargar el historial.'; this.historyLoading = false; }
    });
  }

  confirmReverse(): void {
    if (!this.selectedPayment || !this.reverseReason.trim()) return;
    this.reversingId = this.selectedPayment.id; this.dialogError = '';
    this.paymentsApi.reversePayment(this.selectedPayment.id, this.reverseReason.trim()).subscribe({
      next: () => { this.reversingId = null; this.closeDialog(); this.loadPayments(); },
      error: (error) => { this.dialogError = error?.error?.message || 'No se pudo procesar la reversa.'; this.reversingId = null; }
    });
  }

  closeDialog(): void { if (this.reversingId === this.selectedPayment?.id) return; this.selectedPayment = null; this.history = []; this.dialogError = ''; }
  statusLabel(status: ReversalPayment['status']): string { return ({ approved: 'Aprobado', timeout: 'En revisión', reversed: 'Reversado' } as const)[status]; }
}
