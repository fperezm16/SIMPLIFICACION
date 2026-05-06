import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { API_BASE } from './api.config';
import { AuthService } from './auth.service';
import { Submission } from './submission.model';

type UnitGroup = { unit: string; rows: Submission[] };

@Component({
    selector: 'app-home-page',
    imports: [CommonModule, FormsModule],
    template: `
    <section class="home">
      <header class="head">
        <div>
          <h2>Inicio</h2>
          <p>Seguimiento de gestiones realizadas, separadas por unidad.</p>
        </div>
        <button type="button" (click)="load()" [disabled]="loading">
          {{ loading ? 'Actualizando...' : 'Actualizar' }}
        </button>
      </header>
      <p class="download-error" *ngIf="downloadError">{{ downloadError }}</p>

      <div class="empty" *ngIf="loading">Cargando gestiones...</div>
      <div class="empty" *ngIf="!loading && !groups.length">Aún no tienes gestiones registradas.</div>

      <section class="unit" *ngFor="let group of groups">
        <h3>{{ unitLabel(group.unit) }} <small>({{ group.rows.length }})</small></h3>

        <article class="card" *ngFor="let row of group.rows">
          <div class="row-top">
            <strong>{{ gestionDisplay(row) }}</strong>
            <div class="row-top-right">
              <span class="code">Correlativo: {{ row.registro_codigo || ('#' + row.id) }}</span>
              <span class="state">{{ stateLabel(row) }}</span>
            </div>
          </div>
          <div class="meta">
            {{ row.nombre_propietario || 'Sin propietario' }} &middot; Registro {{ row.registro_codigo || ('#' + row.id) }} &middot; Matrícula {{ row.matricula_tg || 'N/D' }} &middot; {{ row.created_at | date:'short' }}
          </div>
          <p class="return-note" *ngIf="row.returned_reason">
            Corrección solicitada: {{ row.returned_reason }}
          </p>
          <button type="button" class="fix-btn" *ngIf="row.returned_at" (click)="goToCorrection(row)">
            Realizar correcciones
          </button>
          <button type="button" class="download-btn" *ngIf="row.approved_at" (click)="downloadApprovedPdf(row)">
            Descargar formulario
          </button>
          <button
            type="button"
            class="download-btn boleta-btn"
            *ngIf="canDownloadBoleta(row)"
            (click)="downloadBoletaPago(row)">
            Descargar boleta de pago
          </button>
          <button
            type="button"
            class="download-btn signed-btn"
            *ngIf="canDownloadSignedDocument(row)"
            (click)="downloadSignedDocument(row)">
            {{ isAilaGenericFlow(row) ? 'Descargar permiso' : 'Descargar documento firmado' }}
          </button>
          <button
            type="button"
            class="rate-btn"
            *ngIf="row.approved_at && !row.feedback_rating"
            (click)="openFeedbackModal(row)">
            Calificar servicio
          </button>
          <span class="rated-pill" *ngIf="row.feedback_rating">
            {{ ratingEmoji(row.feedback_rating) }} Calificación: {{ row.feedback_rating }}/5
          </span>
          <div class="progress-row">
            <div class="progress">
              <div class="fill" [style.width.%]="progressPercent(row)"></div>
            </div>
            <span class="percent">{{ progressPercent(row) }}%</span>
          </div>
        </article>
      </section>

      <div class="notice-overlay" *ngIf="approvedNoticeTarget">
        <div class="notice-modal" role="alertdialog" aria-modal="true">
          <h3>{{ noticeTitle(approvedNoticeTarget) }}</h3>
          <p>
            {{ approvedNoticeIntro(approvedNoticeTarget) }}
          </p>
          <p>
            {{ approvedNoticeMessage(approvedNoticeTarget) }}
          </p>
          <div class="notice-actions">
            <button
              type="button"
              class="notice-download signed-btn"
              *ngIf="approvedNoticeTarget && canDownloadSignedDocument(approvedNoticeTarget)"
              (click)="downloadSignedFromNotice()">
              {{ approvedNoticeTarget && isAilaGenericFlow(approvedNoticeTarget) ? 'Descargar permiso' : 'Descargar documento firmado' }}
            </button>
            <button type="button" class="notice-download" *ngIf="approvedNoticeTarget && canDownloadBoleta(approvedNoticeTarget)" (click)="downloadBoletaFromNotice()">
              Descargar boleta de pago
            </button>
            <button type="button" class="notice-close" (click)="closeApprovedNotice()">
              Entendido
            </button>
          </div>
        </div>
      </div>

      <div class="feedback-overlay" *ngIf="feedbackTarget">
        <div class="feedback-modal" role="dialog" aria-modal="true">
          <h3>¿Cómo calificarías el servicio?</h3>
          <p>
            Proceso: <strong>{{ gestionDisplay(feedbackTarget) }}</strong>
            ({{ feedbackTarget.registro_codigo || ('#' + feedbackTarget.id) }})
          </p>

          <div class="faces">
            <button
              type="button"
              class="face-btn"
              *ngFor="let option of ratingOptions"
              [class.active]="feedbackRating === option.value"
              (click)="setFeedbackRating(option.value)">
              <span class="emoji">{{ option.emoji }}</span>
              <small>{{ option.label }}</small>
            </button>
          </div>

          <label class="feedback-comment">
            Comentario (opcional):
            <textarea rows="3" [(ngModel)]="feedbackComment" maxlength="500" placeholder="Cuéntanos tu experiencia"></textarea>
          </label>

          <p class="feedback-error" *ngIf="feedbackError">{{ feedbackError }}</p>
          <div class="feedback-actions">
            <button type="button" class="submit-btn" (click)="submitFeedback()" [disabled]="feedbackSaving">
              {{ feedbackSaving ? 'Enviando...' : 'Enviar calificación' }}
            </button>
            <button type="button" class="later-btn" (click)="closeFeedbackModal()" [disabled]="feedbackSaving">
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </section>
  `,
    styles: [`
    .home {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.93), rgba(247, 252, 255, 0.95));
      padding: 20px;
      box-shadow: var(--shadow-card);
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h2 { margin: 0 0 6px; }
    p { margin: 0; color: var(--muted); }
    button { border: 1px solid #b8d2e6; background: #fff; border-radius: 999px; padding: 8px 12px; cursor: pointer; color: #0f3e63; font-weight: 600; }
    button[disabled] { opacity: 0.6; cursor: not-allowed; }
    .empty { margin-top: 12px; color: var(--muted); font-size: 14px; }
    .download-error { margin: 10px 0 0; color: #991b1b; font-size: 13px; padding: 8px 10px; border: 1px solid #fca5a5; border-radius: 10px; background: #fff1f2; }
    .unit { margin-top: 16px; border-top: 1px solid #d8e6f1; padding-top: 12px; }
    .unit h3 { margin: 0 0 10px; font-size: 16px; }
    .unit small { color: var(--muted); font-weight: 500; }
    .card {
      background: #fff;
      border: 1px solid #d7e6f2;
      border-radius: var(--radius-md);
      padding: 12px;
      margin-bottom: 10px;
      box-shadow: var(--shadow-soft);
    }
    .row-top { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .row-top-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .code { font-size: 12px; background: #e4f3ff; border: 1px solid #a6d5f4; border-radius: 999px; padding: 4px 9px; color: #0c4a6e; font-weight: 700; }
    .state { font-size: 12px; background: #eef7ff; border: 1px solid #bcd8f0; border-radius: 999px; padding: 4px 9px; color: #1e4f75; }
    .meta { margin-top: 6px; font-size: 12px; color: var(--muted); }
    .return-note { margin: 8px 0 0; padding: 8px 10px; border: 1px solid #fca5a5; border-radius: 8px; background: #fee2e2; color: #991b1b; font-size: 12px; }
    .fix-btn { margin-top: 8px; border: 1px solid #5eb4e4; background: #e6f6ff; color: #0a5c8f; border-radius: 999px; padding: 6px 11px; font-weight: 700; cursor: pointer; }
    .download-btn { margin-top: 8px; margin-left: 8px; border: 1px solid #67ba8a; background: #e5f8ec; color: #15633b; border-radius: 999px; padding: 6px 11px; font-weight: 700; cursor: pointer; }
    .boleta-btn { border-color: #7ab8df; background: #e8f5ff; color: #0b5e92; }
    .signed-btn { border-color: #c4b5fd; background: #f5f3ff; color: #5b21b6; }
    .progress-row { margin-top: 8px; display: flex; align-items: center; gap: 8px; }
    .progress { flex: 1; height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
    .fill { height: 100%; background: linear-gradient(90deg, #f59e0b 0%, #22c55e 100%); transition: width 320ms ease; }
    .percent { font-size: 12px; color: #274b68; font-weight: 700; min-width: 38px; text-align: right; }
    .rate-btn {
      margin-top: 8px;
      margin-left: 8px;
      border: 1px solid #f4b142;
      background: #fff8e6;
      color: #8a5400;
      border-radius: 999px;
      padding: 6px 11px;
      font-weight: 700;
      cursor: pointer;
    }
    .rated-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      margin-left: 8px;
      font-size: 12px;
      border: 1px solid #93c5fd;
      background: #eff6ff;
      color: #1e3a8a;
      border-radius: 999px;
      padding: 4px 9px;
      font-weight: 700;
    }
    .notice-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.5);
      display: grid;
      place-items: center;
      z-index: 1150;
      padding: 16px;
    }
    .notice-modal {
      width: min(640px, 100%);
      border: 1px solid #c8dceb;
      border-radius: 16px;
      background: #fff;
      padding: 18px;
      box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
      display: grid;
      gap: 8px;
    }
    .notice-modal h3 {
      margin: 0;
      font-size: 24px;
      color: #0f3656;
    }
    .notice-modal p {
      margin: 0;
      color: #334e68;
      font-size: 14px;
      line-height: 1.45;
    }
    .notice-actions {
      margin-top: 6px;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .notice-download {
      border: 1px solid #7ab8df;
      background: #e8f5ff;
      color: #0b5e92;
      border-radius: 999px;
      padding: 8px 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .notice-close {
      border: 1px solid #b8d2e6;
      background: #fff;
      color: #0f3e63;
      border-radius: 999px;
      padding: 8px 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .feedback-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: grid;
      place-items: center;
      z-index: 1200;
      padding: 16px;
    }
    .feedback-modal {
      width: min(540px, 100%);
      border: 1px solid #c8dceb;
      border-radius: 16px;
      background: #fff;
      padding: 18px;
      box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
    }
    .feedback-modal h3 {
      margin: 0 0 6px;
      font-size: 22px;
      color: #0f3656;
    }
    .feedback-modal p {
      margin: 0;
      color: #4b647b;
      font-size: 13px;
    }
    .faces {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .face-btn {
      border: 1px solid #c8dceb;
      background: #f8fbff;
      border-radius: 12px;
      min-height: 74px;
      display: grid;
      place-items: center;
      gap: 2px;
      color: #1f3f5d;
      font-weight: 700;
      cursor: pointer;
      transition: all 140ms ease;
    }
    .face-btn .emoji {
      font-size: 24px;
      line-height: 1;
    }
    .face-btn small {
      font-size: 11px;
    }
    .face-btn.active {
      border-color: #0b8fd9;
      background: #e7f6ff;
      box-shadow: inset 0 0 0 1px #6cc3f2;
      transform: translateY(-1px);
    }
    .feedback-comment {
      margin-top: 12px;
      display: block;
      font-size: 13px;
      color: #1d3e5d;
      font-weight: 600;
    }
    .feedback-comment textarea {
      margin-top: 6px;
      width: 100%;
      border: 1px solid #c8dceb;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 13px;
      color: #0f172a;
      resize: vertical;
      min-height: 76px;
    }
    .feedback-error {
      margin-top: 8px;
      color: #991b1b;
      font-size: 12px;
    }
    .feedback-actions {
      margin-top: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: flex-end;
    }
    .feedback-actions .submit-btn {
      border: 1px solid #0b8fd9;
      background: linear-gradient(90deg, #0b8fd9, #31a8e8);
      color: #fff;
      border-radius: 999px;
      padding: 8px 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .feedback-actions .later-btn {
      border: 1px solid #b8d2e6;
      background: #fff;
      color: #0f3e63;
      border-radius: 999px;
      padding: 8px 13px;
      font-weight: 700;
      cursor: pointer;
    }
    @media (max-width: 640px) {
      .faces {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `]
})
export class HomePageComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private auth = inject(AuthService);
  readonly apiBase = API_BASE;
  readonly ratingOptions = [
    { value: 1, emoji: '🙁', label: 'Malo' },
    { value: 3, emoji: '😐', label: 'Regular' },
    { value: 5, emoji: '🙂', label: 'Bueno' }
  ] as const;
  loading = false;
  allRows: Submission[] = [];
  groups: UnitGroup[] = [];
  downloadError = '';
  feedbackTarget: Submission | null = null;
  approvedNoticeTarget: Submission | null = null;
  feedbackRating = 0;
  feedbackComment = '';
  feedbackSaving = false;
  feedbackError = '';
  private readonly approvedNoticeStorageKey = 'approved_notice_seen_v1';

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.loading = true;
    this.http.get<Submission[]>(`${this.apiBase}/my-submissions`).subscribe({
      next: (rows) => {
        this.allRows = rows || [];
        this.groups = this.groupByUnit(this.allRows);
        this.maybeOpenApprovedNotice();
        this.loading = false;
      },
      error: () => {
        this.allRows = [];
        this.groups = [];
        this.loading = false;
      }
    });
  }

  unitLabel(unit: string) {
    const key = (unit || 'GENERAL').toUpperCase();
    if (key === 'RAN') return 'Unidad RAN';
    if (key === 'DVSO') return 'Unidad DVSO';
    if (key === 'AILA') return 'Administración AILA';
    if (key === 'FINANCIERO') return 'Unidad FINANCIERO';
    return 'Unidad General';
  }

  stateLabel(row: Submission) {
    return row.process_label || this.inferState(row);
  }

  progressPercent(row: Submission) {
    if (typeof row.process_percent === 'number') return row.process_percent;
    if (row.returned_at) return 45;
    if (row.delivered_at) return 100;
    if (this.isFinancialPaymentPasswordFlow(row) && (row.has_analyst_pdf || row.analyst_pdf_filename)) return 90;
    if (this.isRanSubmission(row) && row.approved_at) return 95;
    if (row.approved_at) return 100;
    if (row.assigned_aprobador_id || row.sent_to_aprobador_at) return 90;
    if (row.assigned_emisor_id || row.sent_to_emisor_at) return 82;
    if (row.assigned_analista_id) return 68;
    if (row.receptor_opened_at) return 50;
    return 25;
  }

  ratingEmoji(value?: number | null) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return '🙂';
    if (numeric <= 2) return '🙁';
    if (numeric === 3) return '😐';
    return '🙂';
  }

  gestionDisplay(row: Submission) {
    const raw = String(row.gestion_nombre || '').trim();
    if (!raw) return this.inferGestion(row);
    const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (normalized.includes('uav') || normalized.includes('rpa') || normalized.includes('distintivo') || normalized.includes('drone')) {
      return 'UAV / RPA - Distintivo';
    }
    if (normalized.includes('certific')) return 'Certificación';
    if (normalized.includes('reserva') || normalized.includes('prorroga') || normalized.includes('cesion')) {
      return 'Reserva, Prórroga o Cesión de Matrícula';
    }
    return raw;
  }

  inferGestion(row: Submission) {
    const unit = this.inferUnit(row);
    if (unit === 'RAN' && (row.tipo_inscripcion || row.tipo_reposicion || row.tipo_cambio_prop)) {
      return 'UAV / RPA - Distintivo';
    }
    if (row.tipo_certificacion) return 'Certificación';
    if (row.tipo_reservacion) return 'Reserva, Prórroga o Cesión de Matrícula';
    return 'Formulario General TG';
  }

  goToCorrection(row: Submission) {
    if (!row.id || !row.returned_at) return;
    const route = this.formRouteForRow(row);
    this.router.navigate([route], { queryParams: { editReturned: row.id } });
  }

  downloadApprovedPdf(row: Submission) {
    if (!row.id || !row.approved_at) return;
    this.downloadError = '';
    this.http.get(`${this.apiBase}/my-submissions/${row.id}/pdf`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        if (!blob || blob.size === 0) {
          this.downloadError = 'No se generó el PDF. Intenta de nuevo.';
          return;
        }
        if (blob.type && !blob.type.toLowerCase().includes('pdf')) {
          this.readBlobText(blob).then((text) => {
            this.downloadError = this.extractBackendError(text) || 'No se pudo descargar el PDF.';
          });
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fallback = row.id ? `REG-${row.id}` : 'REG-SIN-CODIGO';
        const safeCode = String(row.registro_codigo || fallback).replace(/[^A-Za-z0-9-_]+/g, '-');
        link.download = `formulario-tg-${safeCode}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      error: (err) => {
        const source = err?.error;
        if (source instanceof Blob) {
          this.readBlobText(source).then((text) => {
            this.downloadError = this.extractBackendError(text) || 'No se pudo descargar el PDF.';
          });
          return;
        }
        this.downloadError = err?.error?.error || 'No se pudo descargar el PDF.';
      }
    });
  }

  downloadBoletaPago(row: Submission) {
    if (!row.id || !this.canDownloadBoleta(row)) return;
    this.downloadError = '';
    this.http.get(`${this.apiBase}/my-submissions/${row.id}/boleta`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        if (!blob || blob.size === 0) {
          this.downloadError = 'No se pudo descargar la boleta de pago.';
          return;
        }
        if (blob.type && !blob.type.toLowerCase().includes('pdf')) {
          this.readBlobText(blob).then((text) => {
            this.downloadError = this.extractBackendError(text) || 'No se pudo descargar la boleta de pago.';
          });
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fallback = row.id ? `REG-${row.id}` : 'REG-SIN-CODIGO';
        const safeCode = String(row.registro_codigo || fallback).replace(/[^A-Za-z0-9-_]+/g, '-');
        link.download = `boleta-pago-${safeCode}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      error: (err) => {
        const source = err?.error;
        if (source instanceof Blob) {
          this.readBlobText(source).then((text) => {
            this.downloadError = this.extractBackendError(text) || 'No se pudo descargar la boleta de pago.';
          });
          return;
        }
        this.downloadError = err?.error?.error || 'No se pudo descargar la boleta de pago.';
      }
    });
  }

  downloadSignedDocument(row: Submission) {
    if (!row.id || !row.approved_at) return;
    this.downloadError = '';
    this.http.get(`${this.apiBase}/my-submissions/${row.id}/documento-firmado`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        if (!blob || blob.size === 0) {
          this.downloadError = 'No se pudo descargar el documento firmado.';
          return;
        }
        if (blob.type && !blob.type.toLowerCase().includes('pdf')) {
          this.readBlobText(blob).then((text) => {
            this.downloadError = this.extractBackendError(text) || 'No se pudo descargar el documento firmado.';
          });
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fallback = row.id ? `REG-${row.id}` : 'REG-SIN-CODIGO';
        const safeCode = String(row.registro_codigo || fallback).replace(/[^A-Za-z0-9-_]+/g, '-');
        link.download = `documento-firmado-${safeCode}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      error: (err) => {
        const source = err?.error;
        if (source instanceof Blob) {
          this.readBlobText(source).then((text) => {
            this.downloadError = this.extractBackendError(text) || 'No se pudo descargar el documento firmado.';
          });
          return;
        }
        this.downloadError = err?.error?.error || 'No se pudo descargar el documento firmado.';
      }
    });
  }

  openFeedbackModal(row: Submission) {
    if (!row?.id || !row.approved_at) return;
    this.feedbackTarget = row;
    this.feedbackRating = Number(row.feedback_rating || 0);
    this.feedbackComment = row.feedback_comment || '';
    this.feedbackError = '';
  }

  closeFeedbackModal() {
    this.feedbackTarget = null;
    this.feedbackRating = 0;
    this.feedbackComment = '';
    this.feedbackError = '';
    this.feedbackSaving = false;
  }

  setFeedbackRating(value: number) {
    this.feedbackRating = value;
    this.feedbackError = '';
  }

  submitFeedback() {
    if (!this.feedbackTarget?.id) return;
    if (!Number.isInteger(this.feedbackRating) || this.feedbackRating < 1 || this.feedbackRating > 5) {
      this.feedbackError = 'Selecciona una carita para enviar tu calificación.';
      return;
    }

    this.feedbackSaving = true;
    this.feedbackError = '';
    const submissionId = this.feedbackTarget.id;
    this.http.post<{ rating_value: number; comment?: string | null; created_at?: string | null }>(
      `${this.apiBase}/my-submissions/${submissionId}/feedback`,
      {
        rating_value: this.feedbackRating,
        comment: this.feedbackComment?.trim() || null
      }
    ).subscribe({
      next: (saved) => {
        this.allRows = this.allRows.map((row) => {
          if (row.id !== submissionId) return row;
          return {
            ...row,
            feedback_rating: Number(saved.rating_value),
            feedback_comment: saved.comment || null,
            feedback_created_at: saved.created_at || row.feedback_created_at || null
          };
        });
        this.groups = this.groupByUnit(this.allRows);
        this.feedbackTarget = null;
        this.feedbackRating = 0;
        this.feedbackComment = '';
        this.feedbackSaving = false;
        this.feedbackError = '';
      },
      error: (err) => {
        this.feedbackSaving = false;
        this.feedbackError = err?.error?.error || 'No se pudo guardar la calificación.';
      }
    });
  }

  private inferState(row: Submission) {
    if (row.returned_at) return 'Devuelto para corrección';
    if (this.isFinancialPaymentPasswordFlow(row) && row.delivered_at) return 'Finalizado';
    if (row.delivered_at) return 'Entregado al usuario';
    if (this.isFinancialPaymentPasswordFlow(row) && (row.has_analyst_pdf || row.analyst_pdf_filename)) return 'Boleta disponible para pago';
    if (this.isRanSubmission(row) && row.approved_at) return 'Aprobado - pendiente de entrega';
    if (row.approved_at) return 'Aprobado';
    if (row.assigned_aprobador_id || row.sent_to_aprobador_at) return 'En aprobación de unidad';
    if (row.assigned_emisor_id || row.sent_to_emisor_at) return 'En revisión por emisor';
    if (row.assigned_analista_id) return 'Asignado a analista';
    if (row.receptor_opened_at) return 'Recibido por receptor';
    return 'Enviado';
  }

  approvedNoticeIntro(row: Submission) {
    const gestion = this.gestionDisplay(row);
    const codigo = row.registro_codigo || ('#' + row.id);
    if (this.isPaymentBoletaNotice(row)) {
      return `Tu boleta de pago del proceso ${gestion} (${codigo}) ya está disponible.`;
    }
    return `Tu proceso ${gestion} (${codigo}) ya fue aprobado.`;
  }

  approvedNoticeMessage(row: Submission) {
    if (this.isPaymentBoletaNotice(row)) {
      return 'Ya puedes descargar la boleta de pago, acercarte a las instalaciones de la DGAC a realizar el pago correspondiente y pasar a recoger el documento solicitado.';
    }
    if (this.isRanSubmission(row)) {
      return 'Ya puedes venir a realizar el pago correspondiente y recoger la certificación solicitada en las instalaciones de la DGAC.';
    }
    if (this.isFinancialCancelacionMatriculaFlow(row)) {
      return 'La solvencia de la aeronave se encuentra disponible para su retiro en las instalaciones de la DGAC, segundo nivel, Departamento Financiero.';
    }
    if (this.isFinancialGestionTiaFlow(row)) {
      return 'El documento ha sido remitido a la administracion correspondiente (AVSEC) para su gestión y seguimiento.';
    }
    if (this.isFinancialRenovacionArrendamientoFlow(row)) {
      return 'Si necesita el documento original, puede pasar a recogerlo en las instalaciones de la DGAC, segundo nivel, en el departamento financiero.';
    }
    if (this.isFinancialSolvenciaFlow(row)) {
      return 'El proceso fue aprobado. Ya puedes descargar el documento firmado para continuar con la gestión.';
    }
    if (String(row.unidad_clave || '').toUpperCase() === 'FINANCIERO') {
      return 'El proceso fue aprobado. Ya puedes descargar el documento firmado y la boleta de pago para continuar con la gestión.';
    }
    return 'Puedes descargar la boleta de pago y aproximarte a las instalaciones de la DGAC a realizar el pago correspondiente.';
  }

  noticeTitle(row: Submission) {
    return this.isPaymentBoletaNotice(row) ? 'Boleta de pago disponible' : 'Proceso finalizado';
  }

  private isRanSubmission(row: Submission) {
    return String(row.unidad_clave || this.inferUnit(row)).toUpperCase() === 'RAN';
  }

  canDownloadSignedDocument(row: Submission | null | undefined) {
    if (!row?.approved_at) return false;
    if (this.isAilaGenericFlow(row)) return true;
    return Boolean(row.has_signed_pdf || row.signed_pdf_filename);
  }

  private isAilaSubmission(row: Submission | null | undefined) {
    return String(row?.unidad_clave || '').toUpperCase() === 'AILA';
  }

  isAilaGenericFlow(row: Submission | null | undefined) {
    if (!this.isAilaSubmission(row)) return false;
    const detail = row?.detalle_formulario && typeof row.detalle_formulario === 'object'
      ? row.detalle_formulario as Record<string, unknown>
      : {};
    return String(detail['tipo_permiso'] || '').trim().toLowerCase() === 'generico';
  }

  canDownloadBoleta(row: Submission) {
    if (!row?.id || !(row.has_analyst_pdf || row.analyst_pdf_filename)) return false;
    if (this.isFinancialSolvenciaFlow(row)) return false;
    return Boolean(row.approved_at || this.isFinancialPaymentPasswordFlow(row));
  }

  private isPaymentBoletaNotice(row: Submission | null | undefined) {
    return Boolean(
      row &&
      this.isFinancialPaymentPasswordFlow(row) &&
      this.canDownloadBoleta(row) &&
      !row.approved_at &&
      !row.delivered_at
    );
  }

  private isFinancialPaymentPasswordFlow(row: Submission | null | undefined) {
    if (!row || String(row.unidad_clave || this.inferUnit(row)).toUpperCase() !== 'FINANCIERO') return false;
    const detail = row.detalle_formulario && typeof row.detalle_formulario === 'object'
      ? row.detalle_formulario as Record<string, unknown>
      : {};
    const groupCode = String(detail['gestion_grupo_codigo'] || '').trim();
    const groupLabel = String(detail['gestion_grupo_label'] || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return groupCode === 'otros_tramites' || groupLabel.includes('contrasena de pago');
  }

  private isFinancialSolvenciaFlow(row: Submission | null | undefined) {
    if (!row || String(row.unidad_clave || this.inferUnit(row)).toUpperCase() !== 'FINANCIERO') return false;
    const detail = row.detalle_formulario && typeof row.detalle_formulario === 'object'
      ? row.detalle_formulario as Record<string, unknown>
      : {};
    const groupCode = String(detail['gestion_grupo_codigo'] || '').trim();
    return groupCode === 'solvencias';
  }

  private isFinancialRenovacionArrendamientoFlow(row: Submission | null | undefined) {
    if (!row || !this.isFinancialSolvenciaFlow(row)) return false;
    const detail = row.detalle_formulario && typeof row.detalle_formulario === 'object'
      ? row.detalle_formulario as Record<string, unknown>
      : {};
    return String(detail['proceso_codigo'] || '').trim() === 'renovacion_arrendamiento';
  }

  private isFinancialGestionTiaFlow(row: Submission | null | undefined) {
    if (!row || !this.isFinancialSolvenciaFlow(row)) return false;
    const detail = row.detalle_formulario && typeof row.detalle_formulario === 'object'
      ? row.detalle_formulario as Record<string, unknown>
      : {};
    return String(detail['proceso_codigo'] || '').trim() === 'gestion_tia';
  }

  private isFinancialCancelacionMatriculaFlow(row: Submission | null | undefined) {
    if (!row || !this.isFinancialSolvenciaFlow(row)) return false;
    const detail = row.detalle_formulario && typeof row.detalle_formulario === 'object'
      ? row.detalle_formulario as Record<string, unknown>
      : {};
    return String(detail['proceso_codigo'] || '').trim() === 'cancelacion_matricula';
  }

  private inferUnit(row: Submission) {
    const raw = String(row.unidad_clave || '').toUpperCase();
    if (raw) return raw;
    if (row.tipo_certificacion || row.tipo_reservacion) return 'RAN';
    return 'GENERAL';
  }

  private formRouteForRow(row: Submission) {
    const unit = this.inferUnit(row);
    if (unit === 'FINANCIERO') return '/financiero/solvencia-pago';
    if (unit === 'AILA') return '/aila/permiso-trabajo';
    if (unit !== 'RAN') return '/formulario';
    const gestion = String(row.gestion_nombre || '').toLowerCase();
    if (!gestion && (row.tipo_inscripcion || row.tipo_reposicion || row.tipo_cambio_prop)) {
      return '/ran/formulario-drones';
    }
    if (gestion.includes('uav') || gestion.includes('rpa') || gestion.includes('distintivo') || gestion.includes('drone')) {
      return '/ran/formulario-drones';
    }
    if (gestion.includes('certific')) return '/ran/formulario-8';
    return '/ran/formulario-2';
  }

  private groupByUnit(rows: Submission[]): UnitGroup[] {
    const map = new Map<string, Submission[]>();
    for (const row of rows) {
      const unit = this.inferUnit(row);
      if (!map.has(unit)) map.set(unit, []);
      map.get(unit)?.push(row);
    }

    const order = ['RAN', 'DVSO', 'AILA', 'FINANCIERO', 'GENERAL'];
    const groups = Array.from(map.entries()).map(([unit, unitRows]) => ({
      unit,
      rows: unitRows
    }));
    groups.sort((a, b) => {
      const ai = order.indexOf(a.unit);
      const bi = order.indexOf(b.unit);
      const av = ai === -1 ? 999 : ai;
      const bv = bi === -1 ? 999 : bi;
      return av - bv;
    });
    return groups;
  }

  private readBlobText(blob: Blob): Promise<string> {
    if (typeof blob.text === 'function') {
      return blob.text().catch(() => '');
    }
    return Promise.resolve('');
  }

  private extractBackendError(raw: string): string | null {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      const message = data?.error || data?.message;
      return message ? String(message) : null;
    } catch {
      const compact = String(raw).trim();
      return compact || null;
    }
  }

  closeApprovedNotice() {
    const noticeStamp = this.approvedNoticeTarget ? this.notificationStamp(this.approvedNoticeTarget) : '';
    if (this.approvedNoticeTarget?.id && noticeStamp) {
      const seen = this.readApprovedNoticeSeen();
      seen[String(this.approvedNoticeTarget.id)] = noticeStamp;
      this.writeApprovedNoticeSeen(seen);
    }
    this.approvedNoticeTarget = null;
    this.maybeOpenApprovedNotice();
  }

  downloadBoletaFromNotice() {
    if (!this.approvedNoticeTarget) return;
    const target = this.approvedNoticeTarget;
    this.closeApprovedNotice();
    this.downloadBoletaPago(target);
  }

  downloadSignedFromNotice() {
    if (!this.approvedNoticeTarget) return;
    const target = this.approvedNoticeTarget;
    this.closeApprovedNotice();
    this.downloadSignedDocument(target);
  }

  private maybeOpenApprovedNotice() {
    if (this.approvedNoticeTarget) return;
    if ((this.auth.currentUser?.role || '').toLowerCase() !== 'user') return;
    const seen = this.readApprovedNoticeSeen();
    const pending = [...this.allRows]
      .filter((row) => {
        const id = Number(row.id);
        const stamp = this.notificationStamp(row);
        if (!Number.isInteger(id) || id <= 0 || !stamp) return false;
        if (this.isRanSubmission(row) && row.delivered_at) return false;
        return seen[String(id)] !== stamp;
      })
      .sort((a, b) => {
        const ta = this.notificationTime(a);
        const tb = this.notificationTime(b);
        return tb - ta;
      })[0];

    if (pending) {
      this.approvedNoticeTarget = pending;
    }
  }

  private notificationStamp(row: Submission) {
    if (this.isPaymentBoletaNotice(row)) {
      const uploadedAt = String(row.analyst_pdf_uploaded_at || '').trim();
      const filename = String(row.analyst_pdf_filename || '').trim();
      return `boleta:${uploadedAt || filename || row.id}`;
    }
    const approvedAt = String(row.approved_at || '').trim();
    return approvedAt ? `aprobado:${approvedAt}` : '';
  }

  private notificationTime(row: Submission) {
    const source = this.isPaymentBoletaNotice(row) ? row.analyst_pdf_uploaded_at : row.approved_at;
    const value = new Date(String(source || '')).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  private readApprovedNoticeSeen(): Record<string, string> {
    const userId = Number(this.auth.currentUser?.id || 0);
    if (!Number.isInteger(userId) || userId <= 0) return {};
    const storageKey = `${this.approvedNoticeStorageKey}_${userId}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed as Record<string, string>;
    } catch {
      return {};
    }
  }

  private writeApprovedNoticeSeen(seen: Record<string, string>) {
    const userId = Number(this.auth.currentUser?.id || 0);
    if (!Number.isInteger(userId) || userId <= 0) return;
    const storageKey = `${this.approvedNoticeStorageKey}_${userId}`;
    localStorage.setItem(storageKey, JSON.stringify(seen));
  }
}



