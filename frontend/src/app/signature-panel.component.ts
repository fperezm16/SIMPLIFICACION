import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { API_BASE } from './api.config';
import { InstitutionalLoaderComponent } from './institutional-loader/institutional-loader.component';
import {
  SignatureCoordinatesChange,
  SignaturePositionerComponent
} from './signature-positioner/signature-positioner.component';

export type SignatureResult = {
  id: number;
  signed_pdf_filename?: string | null;
  signed_pdf_mime?: string | null;
  signed_pdf_uploaded_at?: string | null;
  approved_at?: string | null;
  signature_status?: string | null;
  signature_provider?: string | null;
  signature_requested_at?: string | null;
  signature_completed_at?: string | null;
};

@Component({
  selector: 'app-signature-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, SignaturePositionerComponent, InstitutionalLoaderComponent],
  template: `
    <app-institutional-loader
      [visible]="isBusy"
      [message]="signing ? 'Firmando documento electrónico...' : 'Cargando documento...'"
      [detail]="signing ? 'No cierres esta ventana mientras finaliza la firma.' : 'Estamos preparando la vista previa para colocar la firma.'">
    </app-institutional-loader>

    <section class="signature-shell" [attr.inert]="isBusy ? '' : null" [attr.aria-busy]="isBusy">
      <div class="signature-workspace">
        <div class="signature-file" *ngIf="documentName">
          <strong>Documento base</strong>
          <small>{{ documentName }}</small>
        </div>

        <app-signature-positioner
          [pdfUrl]="pdfPreviewPath"
          (coordinatesChange)="handleCoordinatesChange($event)"
          (placementValidityChange)="handlePlacementValidityChange($event)"
          (loadingChange)="handlePdfLoadingChange($event)">
        </app-signature-positioner>
      </div>

      <aside class="signature-sidebar">
        <div class="signature-card">
          <div class="signature-copy">
            <strong>Firma electrónica</strong>
            <small>El correo se toma automaticamente de tu sesion institucional.</small>
          </div>

          <label class="signature-field">
            <span>Correo del firmante</span>
            <input type="email" [ngModel]="userEmail" readonly>
          </label>

          <label class="signature-field">
            <span>Contraseña de firma</span>
            <input
              type="password"
              [(ngModel)]="signaturePassword"
              [disabled]="signing || !canSign"
              placeholder="Ingresa tu contraseña de firma">
          </label>

          <label class="signature-field">
            <span>Posición calculada</span>
            <input type="text" [ngModel]="selectedCoordinates" readonly>
          </label>
        </div>

        <div class="signature-card summary-card">
          <strong>Resumen de firma</strong>
          <div class="summary-row">
            <span>Página</span>
            <strong>{{ selectedPage }}</strong>
          </div>
          <div class="summary-row">
            <span>Coordenadas</span>
            <strong>{{ selectedCoordinates }}</strong>
          </div>
          <small class="signature-status" *ngIf="!manualPlacementConfirmed">
            Activa la firma dinámica y coloca manualmente la caja sobre el documento.
          </small>
          <button
            type="button"
            class="sign-button"
            (click)="signDocument()"
            [disabled]="signing || !canSign || !submissionId || !signaturePassword.trim() || !manualPlacementConfirmed">
            {{ signing ? 'Firmando...' : 'Firmar documento' }}
          </button>
          <small class="signature-status" *ngIf="statusMessage">{{ statusMessage }}</small>
        </div>
      </aside>
    </section>
  `,
  styles: [`
    .signature-shell {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.95fr);
      gap: 16px;
      margin-top: 10px;
      padding: 14px;
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      background: linear-gradient(180deg, #f8fbff 0%, #f3f6fb 100%);
    }
    .signature-workspace,
    .signature-sidebar,
    .signature-card,
    .signature-copy,
    .signature-file,
    .signature-field {
      display: grid;
      gap: 10px;
    }
    .signature-file {
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.88);
      border: 1px solid #dbe4f0;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
    }
    .signature-file strong,
    .signature-copy strong,
    .summary-card strong {
      color: #0f172a;
      font-size: 13px;
    }
    .signature-file small,
    .signature-copy small,
    .signature-status {
      color: #475569;
      font-size: 12px;
      line-height: 1.4;
    }
    .signature-sidebar {
      align-content: start;
    }
    .signature-card {
      padding: 14px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #dbe4f0;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
    }
    .signature-field span {
      display: block;
      margin-bottom: 6px;
      color: #334155;
      font-size: 12px;
      font-weight: 700;
    }
    .signature-field input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      font: inherit;
      box-sizing: border-box;
      background: #fff;
    }
    .summary-card {
      gap: 14px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
      font-size: 13px;
    }
    .summary-row strong {
      font-size: 13px;
      text-align: right;
    }
    .sign-button {
      padding: 11px 14px;
      border-radius: 10px;
      border: 1px solid #1d4ed8;
      background: linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%);
      color: #fff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .sign-button:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    @media (max-width: 980px) {
      .signature-shell {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 640px) {
      .sign-button {
        width: 100%;
      }
    }
  `]
})
export class SignaturePanelComponent {
  private http = inject(HttpClient);

  @Input() submissionId: number | null = null;
  @Input() canSign = false;
  @Input() userEmail = '';
  @Input() documentName = '';
  @Input() pdfPreviewPath = '';

  @Output() signed = new EventEmitter<SignatureResult>();
  @Output() failed = new EventEmitter<string>();

  signaturePassword = '';
  signing = false;
  pdfLoading = false;
  statusMessage = '';
  selectedPage = 1;
  selectedCoordinates = '';
  manualPlacementConfirmed = false;

  get isBusy() {
    return this.signing || this.pdfLoading;
  }

  handleCoordinatesChange(event: SignatureCoordinatesChange) {
    this.selectedPage = event.page;
    this.selectedCoordinates = event.coordinates;
  }

  handlePlacementValidityChange(isValid: boolean) {
    this.manualPlacementConfirmed = isValid;
    if (isValid && this.statusMessage === 'Debes colocar manualmente la firma sobre el documento.') {
      this.statusMessage = '';
    }
  }

  handlePdfLoadingChange(isLoading: boolean) {
    this.pdfLoading = isLoading;
  }

  signDocument() {
    if (this.signing || !this.submissionId || !this.canSign) return;

    if (!this.manualPlacementConfirmed) {
      this.statusMessage = 'Debes colocar manualmente la firma sobre el documento.';
      return;
    }

    const password = this.signaturePassword.trim();
    if (!password) {
      this.statusMessage = 'Debes ingresar la contrasena de firma.';
      return;
    }

    this.signing = true;
    this.statusMessage = 'Firmando documento...';

    this.http.post<SignatureResult>(`${API_BASE}/submissions/${this.submissionId}/sign`, {
      password_firma: password,
      page: this.selectedPage,
      coordinates: this.selectedCoordinates,
      paginas: String(this.selectedPage),
      coordenadas: this.selectedCoordinates,
      ubicacion_firma_confirmada: true
    }).pipe(
      finalize(() => {
        this.signing = false;
      })
    ).subscribe({
      next: (resp) => {
        this.signaturePassword = '';
        this.statusMessage = 'Documento firmado correctamente.';
        this.signed.emit(resp);
      },
      error: (err) => {
        const message = String(err?.error?.error || 'No se pudo firmar el documento.').trim();
        this.statusMessage = message;
        this.failed.emit(message);
      }
    });
  }
}
