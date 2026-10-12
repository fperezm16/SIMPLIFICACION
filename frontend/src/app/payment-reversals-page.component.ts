import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentService } from './payment-form/payment.service';

type PaymentOperationStatus = '' | 'approved' | 'cancelled';

interface PaymentOperation {
  id: number;
  submission_id: number;
  amount: number;
  status: 'approved' | 'cancelled';
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
  recipient_email?: string | null;
  receipt_review_status?: 'pending_review' | 'reviewed' | null;
  receipt_send_status?: 'not_sent' | 'sent' | 'error' | null;
  receipt_sent_to?: string | null;
  receipt_sent_at?: string | null;
  can_cancel: boolean;
}

interface CancellationReceipt {
  payment_id: number;
  receipt_number: string;
  snapshot: {
    payment_id: number;
    submission_id: number;
    submission_code?: string | null;
    sale_date: string;
    cancellation_date: string;
    amount: number;
    card_brand?: string | null;
    masked_card?: string | null;
    reference_number?: string | null;
    authorization_code?: string | null;
    systems_trace_no?: string | null;
    response_code?: string | null;
    response_message?: string | null;
    reason?: string | null;
    cancelled_by?: string | null;
    suggested_email?: string | null;
  };
  review_status: 'pending_review' | 'reviewed';
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  send_status: 'not_sent' | 'sent' | 'error';
  sent_to?: string | null;
  sent_at?: string | null;
}

interface CancellationHistoryItem {
  event_label: string;
  event_detail?: string | null;
  actor_role?: string | null;
  actor_name?: string | null;
  created_at: string;
  metadata?: {
    response_code?: string;
    response_message?: string;
    systems_trace_no?: string;
    reference_number?: string;
    recipient?: string;
  };
}

@Component({
  selector: 'app-payment-reversals-page',
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe],
  template: `
    <section class="reversals-page">
      <header class="page-header">
        <div>
          <span class="eyebrow">Operaciones de pagos</span>
          <h2>Gestión de pagos</h2>
        </div>
        <button type="button" class="icon-action" title="Actualizar pagos" (click)="loadPayments()" [disabled]="loading">↻</button>
      </header>

      <section class="filters" aria-label="Filtros de pagos">
        <label>
          Buscar
          <input [(ngModel)]="query" (keyup.enter)="loadPayments()" placeholder="Pago, registro, solicitante o referencia">
        </label>
        <label>
          Estado
          <select [(ngModel)]="status" (change)="loadPayments()">
            <option value="">Todos</option>
            <option value="approved">Aprobado</option>
            <option value="cancelled">Anulado</option>
          </select>
        </label>
        <button type="button" class="filter-button" (click)="loadPayments()" [disabled]="loading">Buscar</button>
      </section>

      <p class="notice error" *ngIf="error">{{ error }}</p>
      <p class="notice success" role="status" *ngIf="pageSuccess">{{ pageSuccess }}</p>
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
          <div>
            <span class="status" [class.approved]="payment.status === 'approved'" [class.cancelled]="payment.status === 'cancelled'">{{ statusLabel(payment.status) }}</span>
            <small class="receipt-state-copy" *ngIf="payment.status === 'cancelled'">{{ receiptStateLabel(payment) }}</small>
          </div>
          <div class="row-actions">
            <button type="button" class="detail-button" (click)="showHistory(payment)">Historial</button>
            <button type="button" class="reverse-button" *ngIf="payment.status === 'approved'" (click)="openCancellation(payment)" [disabled]="!payment.can_cancel || cancellingId === payment.id">Anular</button>
            <button type="button" class="detail-button" *ngIf="payment.status === 'cancelled'" (click)="openReceipt(payment, 'review')">{{ payment.receipt_review_status === 'reviewed' ? 'Ver comprobante' : 'Revisar comprobante' }}</button>
            <button type="button" class="send-button" *ngIf="payment.status === 'cancelled'" (click)="openReceipt(payment, 'send')">{{ payment.receipt_send_status === 'sent' ? 'Reenviar comprobante' : 'Enviar comprobante' }}</button>
          </div>
        </article>
      </div>
    </section>

    <div class="modal-layer" *ngIf="selectedPayment">
      <div class="modal-backdrop" (click)="closeDialog()"></div>
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="cancellation-dialog-title">
        <header>
          <div>
            <span class="eyebrow">{{ dialogMode === 'cancel' ? 'Anulación controlada' : dialogMode === 'history' ? 'Historial de operaciones' : 'Comprobante de anulación' }}</span>
            <h3 id="cancellation-dialog-title">Pago #{{ selectedPayment.id }}</h3>
          </div>
          <button type="button" class="icon-action" title="Cerrar" (click)="closeDialog()">×</button>
        </header>
        <dl class="payment-detail">
          <div><dt>Registro</dt><dd>{{ selectedPayment.registro_codigo || selectedPayment.submission_id }}</dd></div>
          <div><dt>Monto</dt><dd>{{ selectedPayment.amount | currency:'GTQ':'symbol-narrow':'1.2-2' }}</dd></div>
          <div><dt>Referencia</dt><dd>{{ selectedPayment.reference_number || 'N/D' }}</dd></div>
          <div><dt>Auditoría</dt><dd>{{ selectedPayment.audit_number || 'N/D' }}</dd></div>
        </dl>
        <label *ngIf="dialogMode === 'cancel'">
          Motivo de anulación
          <textarea [(ngModel)]="cancellationReason" maxlength="300" rows="4" placeholder="Describe el motivo de la anulación"></textarea>
        </label>
        <p class="notice error" *ngIf="dialogError">{{ dialogError }}</p>
        <p class="notice success" *ngIf="dialogSuccess">{{ dialogSuccess }}</p>
        <section class="history" *ngIf="dialogMode === 'history'">
          <p class="notice" *ngIf="historyLoading">Cargando historial...</p>
          <p class="notice" *ngIf="!historyLoading && !history.length">Sin anulaciones registradas.</p>
          <article *ngFor="let item of history">
            <strong>{{ item.event_label }}</strong>
            <span>{{ item.created_at | date:'short' }} · {{ item.actor_name || item.actor_role || 'Sistema' }}</span>
            <p *ngIf="item.event_detail">{{ item.event_detail }}</p>
            <small *ngIf="item.metadata?.response_code">{{ item.metadata?.response_code }} {{ item.metadata?.response_message || '' }}</small>
            <small *ngIf="item.metadata?.systems_trace_no">Correlativo: {{ item.metadata?.systems_trace_no }}</small>
            <small *ngIf="item.metadata?.reference_number">Referencia: {{ item.metadata?.reference_number }}</small>
            <small *ngIf="item.metadata?.recipient">Destinatario: {{ item.metadata?.recipient }}</small>
          </article>
        </section>
        <section class="receipt-panel" *ngIf="dialogMode === 'receipt' || dialogMode === 'send'">
          <p class="notice" *ngIf="receiptLoading">Preparando comprobante...</p>
          <ng-container *ngIf="!receiptLoading && receipt">
            <div class="receipt-heading">
              <div><small>Comprobante</small><strong>{{ receipt.receipt_number }}</strong></div>
              <span class="review-state" [class.reviewed]="receipt.review_status === 'reviewed'">{{ receiptStatusLabel() }}</span>
            </div>
            <dl class="receipt-summary">
              <div><dt>Resultado</dt><dd>{{ receipt.snapshot.response_code }} {{ receipt.snapshot.response_message }}</dd></div>
              <div><dt>Correlativo</dt><dd>{{ receipt.snapshot.systems_trace_no || 'N/D' }}</dd></div>
              <div><dt>Referencia</dt><dd>{{ receipt.snapshot.reference_number || 'N/D' }}</dd></div>
              <div><dt>Tarjeta</dt><dd>{{ receipt.snapshot.masked_card || 'N/D' }}</dd></div>
            </dl>

            <button type="button" class="preview-button" (click)="openReceiptPdf()" [disabled]="receiptPdfLoading">
              {{ receiptPdfLoading ? 'Abriendo...' : 'Abrir comprobante PDF' }}
            </button>

            <div class="review-confirmation" *ngIf="dialogMode === 'receipt' && receipt.review_status !== 'reviewed'">
              <label>
                <input type="checkbox" [(ngModel)]="receiptReviewConfirmed" [disabled]="!receiptPreviewOpened">
                Confirmo que revisé el PDF y que sus datos son correctos.
              </label>
              <p class="notice" *ngIf="!receiptPreviewOpened">Primero debe abrir el comprobante PDF.</p>
            </div>

            <div class="review-confirmation reviewed-copy" *ngIf="dialogMode === 'receipt' && receipt.review_status === 'reviewed'">
              Revisado {{ receipt.reviewed_at | date:'short' }} por {{ receipt.reviewed_by || 'usuario autorizado' }}.
            </div>

            <label *ngIf="dialogMode === 'send'">
              Correo del destinatario
              <input type="email" [(ngModel)]="receiptEmail" maxlength="320" placeholder="cliente@correo.com">
            </label>
            <p class="notice" *ngIf="dialogMode === 'send' && receipt.send_status === 'sent'">
              Último envío: {{ receipt.sent_at | date:'short' }} a {{ receipt.sent_to }}.
            </p>
          </ng-container>
        </section>
        <footer *ngIf="dialogMode === 'cancel'">
          <button type="button" class="detail-button" (click)="closeDialog()" [disabled]="cancellingId === selectedPayment.id">Cerrar</button>
          <button type="button" class="reverse-button" (click)="confirmCancellation()" [disabled]="!cancellationReason.trim() || cancellingId === selectedPayment.id">{{ cancellingId === selectedPayment.id ? 'Procesando...' : 'Confirmar anulación' }}</button>
        </footer>
        <footer *ngIf="dialogMode === 'receipt' && receipt">
          <button type="button" class="detail-button" (click)="closeDialog()" [disabled]="receiptActionLoading">Cerrar</button>
          <button type="button" class="filter-button" *ngIf="receipt.review_status !== 'reviewed'" (click)="confirmReceiptReview()" [disabled]="!receiptReviewConfirmed || receiptActionLoading">
            {{ receiptActionLoading ? 'Confirmando...' : 'Confirmar revisión' }}
          </button>
          <button type="button" class="send-button" *ngIf="receipt.review_status === 'reviewed'" (click)="switchToSend()">Enviar por correo</button>
        </footer>
        <footer *ngIf="dialogMode === 'send' && receipt">
          <button type="button" class="detail-button" (click)="closeDialog()" [disabled]="receiptActionLoading">Cerrar</button>
          <button type="button" class="send-button" (click)="sendReceipt()" [disabled]="!receiptEmail.trim() || receiptActionLoading">
            {{ receiptActionLoading
              ? (receipt.send_status === 'sent' ? 'Reenviando...' : 'Enviando...')
              : (receipt.send_status === 'sent' ? 'Confirmar reenvío' : 'Confirmar envío') }}
          </button>
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
    .filter-button, .detail-button, .reverse-button, .send-button, .preview-button { min-height:40px; border-radius:6px; padding:0 12px; }
    .filter-button, .detail-button { border:1px solid #aec5d5; background:#fff; color:#173652; }
    .reverse-button { border:1px solid #a62929; background:#b42318; color:#fff; }
    .send-button { border:1px solid #166b95; background:#176f9d; color:#fff; }
    .preview-button { width:100%; border:1px solid #8db5ca; background:#edf7fc; color:#174764; }
    .notice { margin:14px 0 0; color:#58758a; font-size:13px; }.notice.error { color:#b42318; }.notice.success { color:#177245; }
    .payment-table { margin-top:16px; border:1px solid #d8e4ec; overflow:auto; }
    .table-row { display:grid; grid-template-columns:100px minmax(190px,1.4fr) 155px 150px 120px auto; gap:12px; align-items:center; min-width:850px; padding:12px 14px; border-bottom:1px solid #e3edf2; }
    .table-row:last-child { border-bottom:0; }.table-head { background:#eff6fa; color:#547186; font-size:12px; font-weight:700; }
    .table-row strong, .table-row small { display:block; }.table-row small { margin-top:3px; color:#678093; font-size:11px; overflow-wrap:anywhere; }
    .status { display:inline-flex; padding:5px 8px; border:1px solid #b7cbd9; border-radius:999px; color:#38566c; font-size:11px; font-weight:700; }.status.approved { color:#177245; border-color:#a8d8ba; background:#effbf3; }.status.cancelled { color:#0d5c91; border-color:#b4d4e8; background:#f0f8fd; }
    .row-actions { display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }.row-actions button { min-height:34px; }.receipt-state-copy { margin-top:5px; color:#5d7484; font-size:10px; }
    .modal-layer { position:fixed; inset:0; z-index:1300; display:grid; place-items:center; padding:18px; }.modal-backdrop { position:absolute; inset:0; background:rgba(15,31,45,.54); }.dialog { position:relative; width:min(100%,520px); padding:20px; border-radius:8px; background:#fff; box-shadow:0 18px 44px rgba(15,31,45,.25); }
    .payment-detail { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:20px 0; }.payment-detail div { border-bottom:1px solid #e0eaf0; padding-bottom:8px; }.payment-detail dt { color:#668195; font-size:11px; font-weight:700; }.payment-detail dd { margin:4px 0 0; font-weight:700; }
    footer { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }.history { margin-top:18px; }.history article { padding:10px 0; border-top:1px solid #e2ebf0; }.history span, .history small { display:block; margin-top:4px; color:#668195; font-size:12px; }.history p { margin:7px 0 0; font-size:13px; }
    .receipt-panel { margin-top:18px; }.receipt-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }.receipt-heading small, .receipt-heading strong { display:block; }.receipt-heading small { color:#668195; font-size:11px; }.review-state { padding:5px 8px; border:1px solid #e5bf7f; border-radius:999px; background:#fff8e8; color:#8a5700; font-size:11px; font-weight:700; }.review-state.reviewed { border-color:#a8d8ba; background:#effbf3; color:#177245; }
    .receipt-summary { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:0 0 14px; }.receipt-summary div { border-bottom:1px solid #e0eaf0; padding-bottom:7px; }.receipt-summary dt { color:#668195; font-size:11px; font-weight:700; }.receipt-summary dd { margin:4px 0 0; font-size:13px; font-weight:700; overflow-wrap:anywhere; }.review-confirmation { margin-top:14px; padding:12px; border:1px solid #d6e4ec; border-radius:6px; background:#f8fbfd; }.review-confirmation label { display:flex; grid-template-columns:none; align-items:flex-start; gap:9px; }.review-confirmation input[type='checkbox'] { width:16px; height:16px; margin:2px 0 0; padding:0; flex:0 0 16px; }.reviewed-copy { color:#376277; font-size:13px; }
    @media (max-width:700px) { .reversals-page { padding:16px; }.filters { grid-template-columns:1fr; }.filter-button { width:100%; }.payment-detail { grid-template-columns:1fr; }.row-actions { justify-content:flex-start; } }
  `]
})
export class PaymentReversalsPageComponent implements OnInit {
  payments: PaymentOperation[] = [];
  history: CancellationHistoryItem[] = [];
  query = '';
  status: PaymentOperationStatus = '';
  loading = false;
  historyLoading = false;
  error = '';
  pageSuccess = '';
  dialogError = '';
  dialogSuccess = '';
  selectedPayment: PaymentOperation | null = null;
  dialogMode: 'history' | 'cancel' | 'receipt' | 'send' = 'history';
  cancellationReason = '';
  cancellingId: number | null = null;
  receipt: CancellationReceipt | null = null;
  receiptLoading = false;
  receiptPdfLoading = false;
  receiptActionLoading = false;
  receiptPreviewOpened = false;
  receiptReviewConfirmed = false;
  receiptEmail = '';

  constructor(private paymentsApi: PaymentService) {}

  ngOnInit(): void { this.loadPayments(); }

  loadPayments(): void {
    this.loading = true; this.error = '';
    this.paymentsApi.getReversalPayments(this.query, this.status).subscribe({
      next: (response) => { this.payments = response?.payments || []; this.loading = false; },
      error: (error) => { this.error = error?.error?.message || 'No se pudieron cargar los pagos.'; this.loading = false; }
    });
  }

  openCancellation(payment: PaymentOperation): void {
    this.selectedPayment = payment; this.dialogMode = 'cancel'; this.cancellationReason = ''; this.dialogError = ''; this.dialogSuccess = ''; this.history = [];
  }

  showHistory(payment: PaymentOperation): void {
    this.selectedPayment = payment; this.dialogMode = 'history'; this.history = []; this.dialogError = ''; this.dialogSuccess = ''; this.historyLoading = true;
    this.paymentsApi.getReversalHistory(payment.id).subscribe({
      next: (response) => { this.history = response?.history || []; this.historyLoading = false; },
      error: (error) => { this.dialogError = error?.error?.message || 'No se pudo cargar el historial.'; this.historyLoading = false; }
    });
  }

  confirmCancellation(): void {
    if (!this.selectedPayment || !this.cancellationReason.trim()) return;
    this.cancellingId = this.selectedPayment.id; this.dialogError = '';
    this.paymentsApi.cancelPayment(this.selectedPayment.id, this.cancellationReason.trim()).subscribe({
      next: () => { this.cancellingId = null; this.closeDialog(); this.loadPayments(); },
      error: (error) => { this.dialogError = error?.error?.message || 'No se pudo procesar la anulación.'; this.cancellingId = null; }
    });
  }

  openReceipt(payment: PaymentOperation, intent: 'review' | 'send'): void {
    this.selectedPayment = payment;
    this.dialogMode = 'receipt';
    this.dialogError = '';
    this.dialogSuccess = '';
    this.receipt = null;
    this.receiptLoading = true;
    this.receiptPreviewOpened = false;
    this.receiptReviewConfirmed = false;
    this.receiptEmail = payment.recipient_email || '';
    this.paymentsApi.getCancellationReceipt(payment.id).subscribe({
      next: (response) => {
        this.receipt = response?.receipt || null;
        this.receiptLoading = false;
        this.receiptEmail = this.receipt?.snapshot?.suggested_email || payment.recipient_email || this.receipt?.sent_to || '';
        if (intent === 'send') {
          if (this.receipt?.review_status !== 'reviewed') {
            this.dialogError = 'Debe revisar y confirmar el comprobante antes de enviarlo por correo.';
            this.dialogMode = 'receipt';
          } else {
            this.dialogMode = 'send';
          }
        }
      },
      error: (error) => {
        this.dialogError = error?.error?.message || 'No se pudo preparar el comprobante.';
        this.receiptLoading = false;
      }
    });
  }

  openReceiptPdf(): void {
    if (!this.selectedPayment) return;
    const previewWindow = window.open('', '_blank');
    this.receiptPdfLoading = true;
    this.dialogError = '';
    this.paymentsApi.getCancellationReceiptPdf(this.selectedPayment.id).subscribe({
      next: (pdf) => {
        const url = URL.createObjectURL(pdf);
        if (previewWindow) previewWindow.location.href = url;
        else window.open(url, '_blank');
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.receiptPreviewOpened = true;
        this.receiptPdfLoading = false;
      },
      error: (error) => {
        previewWindow?.close();
        this.dialogError = error?.error?.message || 'No se pudo abrir el comprobante PDF.';
        this.receiptPdfLoading = false;
      }
    });
  }

  confirmReceiptReview(): void {
    if (!this.selectedPayment || !this.receiptReviewConfirmed) return;
    this.receiptActionLoading = true;
    this.dialogError = '';
    this.dialogSuccess = '';
    this.paymentsApi.reviewCancellationReceipt(this.selectedPayment.id).subscribe({
      next: (response) => {
        this.receipt = response?.receipt || this.receipt;
        this.receiptActionLoading = false;
        this.dialogSuccess = 'Comprobante revisado correctamente. Ya puede enviarse por correo.';
        this.loadPayments();
      },
      error: (error) => {
        this.dialogError = error?.error?.message || 'No se pudo confirmar la revisión.';
        this.receiptActionLoading = false;
      }
    });
  }

  switchToSend(): void {
    this.dialogMode = 'send';
    this.dialogError = '';
    this.dialogSuccess = '';
    this.receiptEmail = this.receipt?.snapshot?.suggested_email || this.receipt?.sent_to || this.receiptEmail;
  }

  sendReceipt(): void {
    if (!this.selectedPayment || !this.receiptEmail.trim()) return;
    const recipient = this.receiptEmail.trim();
    const wasPreviouslySent = this.receipt?.send_status === 'sent';
    this.receiptActionLoading = true;
    this.dialogError = '';
    this.dialogSuccess = '';
    this.pageSuccess = '';
    this.paymentsApi.sendCancellationReceipt(this.selectedPayment.id, recipient).subscribe({
      next: (response) => {
        this.receipt = response?.receipt || this.receipt;
        this.receiptActionLoading = false;
        const receiptNumber = this.receipt?.receipt_number || `del pago #${this.selectedPayment?.id}`;
        this.pageSuccess = `El comprobante ${receiptNumber} fue ${wasPreviouslySent ? 'reenviado' : 'enviado'} correctamente a ${recipient}.`;
        this.closeDialog();
        this.loadPayments();
      },
      error: (error) => {
        this.dialogError = error?.error?.message || 'No se pudo enviar el comprobante.';
        this.receiptActionLoading = false;
      }
    });
  }

  receiptStatusLabel(): string {
    if (!this.receipt) return '';
    if (this.receipt.send_status === 'sent') return 'Enviado';
    if (this.receipt.send_status === 'error') return 'Error de envío';
    return this.receipt.review_status === 'reviewed' ? 'Revisado' : 'Pendiente de revisión';
  }

  receiptStateLabel(payment: PaymentOperation): string {
    if (payment.receipt_send_status === 'sent') return 'Comprobante enviado';
    if (payment.receipt_send_status === 'error') return 'Error de envío';
    return payment.receipt_review_status === 'reviewed'
      ? 'Comprobante revisado'
      : 'Pendiente de revisión';
  }

  closeDialog(): void {
    if (this.cancellingId === this.selectedPayment?.id || this.receiptActionLoading) return;
    this.selectedPayment = null;
    this.history = [];
    this.receipt = null;
    this.dialogError = '';
    this.dialogSuccess = '';
    this.receiptReviewConfirmed = false;
    this.receiptPreviewOpened = false;
  }
  statusLabel(status: PaymentOperation['status']): string { return ({ approved: 'Aprobado', cancelled: 'Anulado' } as const)[status]; }
}
