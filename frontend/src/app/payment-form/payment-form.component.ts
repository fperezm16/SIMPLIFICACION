import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API_BASE } from '../api.config';
import { PaymentService } from './payment.service';

@Component({
  selector: 'app-payment-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-form.component.html',
  styleUrls: ['./payment-form.component.css']
})
export class PaymentFormComponent implements OnDestroy {
  @Input() amount = 0;
  @Input() submissionId = 0;
  @Input() concept = 'Pago de tramite';
  @Input() requiresPayment = true;

  @Output() paymentApproved = new EventEmitter<any>();
  @Output() paymentRejected = new EventEmitter<any>();
  @Output() voucherRequested = new EventEmitter<any>();

  cardholderName = '';
  cardNumber = '';
  expirationDate = '';
  cvv = '';

  loading = false;
  errorMessage = '';
  successMessage = '';
  infoMessage = '';
  paymentResponse: any = null;
  threeDSChallengeVisible = false;

  private readonly backendOrigin = this.resolveBackendOrigin();
  private readonly stepUpIframeName = 'payment-3ds-stepup-iframe';
  private readonly stepUpIframeId = 'payment-3ds-stepup-iframe';
  private readonly stepUpFormId = 'payment-3ds-stepup-form';
  private readonly onWindowMessageBound = this.onWindowMessage.bind(this);

  constructor(private paymentService: PaymentService) {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.onWindowMessageBound);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.onWindowMessageBound);
    }
  }

  private resolveBackendOrigin(): string {
    if (typeof window === 'undefined') return '';
    if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
      return new URL(API_BASE).origin;
    }
    return window.location.origin;
  }

  private focusField(fieldId: string): void {
    if (typeof document === 'undefined') return;
    const next = document.getElementById(fieldId) as HTMLInputElement | null;
    next?.focus();
  }

  get sanitizedCardNumber(): string {
    return this.cardNumber.replace(/\s/g, '');
  }

  private detectCardBrand(value: string): string {
    if (/^4/.test(value)) return 'VISA';
    if (/^(5[1-5]|2[2-7])/.test(value)) return 'MASTERCARD';
    return '';
  }

  private passesLuhn(value: string): boolean {
    let sum = 0;
    let shouldDouble = false;

    for (let index = value.length - 1; index >= 0; index -= 1) {
      let digit = Number(value[index]);
      if (Number.isNaN(digit)) return false;

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }

  private isCardReadyForAdvance(value: string): boolean {
    if (!value || value.length !== 16) return false;
    if (!this.detectCardBrand(value)) return false;
    return this.passesLuhn(value);
  }

  private isExpirationReadyForAdvance(value: string): boolean {
    if (!/^\d{2}\/\d{2}$/.test(value)) return false;
    const [month] = value.split('/');
    const numericMonth = Number(month);
    return Number.isInteger(numericMonth) && numericMonth >= 1 && numericMonth <= 12;
  }

  get cardBrand(): string {
    return this.detectCardBrand(this.sanitizedCardNumber);
  }

  get showCardWarning(): boolean {
    const value = this.sanitizedCardNumber;
    if (!value) return false;

    if (!this.cardBrand) return true;
    if (value.length >= 13 && !this.passesLuhn(value)) return true;
    if (value.length > 16) return true;

    return false;
  }

  get cardStatusLabel(): string {
    if (this.showCardWarning) return 'Tarjeta no aceptada';
    return this.cardBrand;
  }

  get paymentId(): number | null {
    return this.paymentResponse?.payment?.id || null;
  }

  get hasPaymentResponse(): boolean {
    return Boolean(this.paymentResponse?.payment);
  }

  get paymentStatus(): string {
    return String(this.paymentResponse?.status || '').trim().toLowerCase();
  }

  get isApproved(): boolean {
    return this.paymentStatus === 'approved';
  }

  get isTimeout(): boolean {
    return this.paymentStatus === 'timeout';
  }

  get isReversed(): boolean {
    return this.paymentStatus === 'reversed';
  }

  get isPendingThreeDS(): boolean {
    return this.paymentStatus === 'pending_3ds';
  }

  get isChallengeRequired(): boolean {
    return this.paymentStatus === 'challenge_required';
  }

  get isAuthenticationInProgress(): boolean {
    return this.isPendingThreeDS || this.isChallengeRequired || this.threeDSChallengeVisible;
  }

  get paymentStatusDisplayLabel(): string {
    if (this.isApproved) return 'Aprobado';
    if (this.isReversed) return 'Reversado';
    if (this.isTimeout) return 'En revision';
    if (this.isAuthenticationInProgress) return 'Autenticando';
    if (this.paymentStatus) return 'Rechazado';
    return 'N/D';
  }

  get statusBadgeLabel(): string {
    if (this.isApproved) return 'Aprobado';
    if (this.isReversed) return 'Reversado';
    if (this.isTimeout) return 'En revision';
    if (this.isAuthenticationInProgress) return 'Autenticando';
    if (this.paymentStatus) return 'Rechazado';
    return 'Pendiente';
  }

  get statusToneClass(): string {
    if (this.isApproved) return 'tone-success';
    if (this.isReversed) return 'tone-warning';
    if (this.isTimeout || this.isAuthenticationInProgress) return 'tone-warning';
    if (this.paymentStatus) return 'tone-danger';
    return 'tone-neutral';
  }

  get paymentStatusDescription(): string {
    if (this.isApproved) {
      return 'La transaccion fue autorizada correctamente por la pasarela.';
    }
    if (this.isReversed) {
      return 'La transaccion fue reversada automaticamente por timeout del flujo.';
    }
    if (this.isTimeout) {
      return 'La pasarela no respondio a tiempo. Verifica el estado antes de reintentar.';
    }
    if (this.isAuthenticationInProgress) {
      return 'Estamos validando la autenticacion 3DS con el emisor de la tarjeta.';
    }
    if (this.paymentStatus) {
      return 'La transaccion no pudo ser autorizada con los datos proporcionados.';
    }
    return 'Completa los datos de la tarjeta para procesar el pago.';
  }

  get formattedAmount(): string {
    return Number(this.amount || 0).toFixed(2);
  }

  get canRequestVoucher(): boolean {
    return Boolean(this.paymentId && this.isApproved);
  }

  get isPayButtonDisabled(): boolean {
    return this.loading || this.isApproved || this.isAuthenticationInProgress;
  }

  get payButtonLabel(): string {
    if (this.loading) return 'Procesando pago...';
    if (this.isAuthenticationInProgress) return 'Autenticando tarjeta...';
    if (this.isApproved) return 'Pago procesado';
    return 'Pagar ahora';
  }

  get expirationDateForApi(): string {
    const digits = this.expirationDate.replace(/\D/g, '');
    if (digits.length !== 4) return digits;
    return `${digits.slice(2, 4)}${digits.slice(0, 2)}`;
  }

  onCardholderNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.cardholderName = input.value.toUpperCase().slice(0, 80);
  }

  onCardNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 16);
    this.cardNumber = digits.replace(/(.{4})/g, '$1 ').trim();

    if (this.isCardReadyForAdvance(digits)) {
      this.focusField('expirationDate');
    }
  }

  onExpirationInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    this.expirationDate =
      digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;

    if (this.isExpirationReadyForAdvance(this.expirationDate)) {
      this.focusField('cvv');
    }
  }

  onCvvInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.cvv = input.value.replace(/\D/g, '').slice(0, 4);
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.infoMessage = '';
  }

  private buildBrowserThreeDSData(): {
    browserLanguage: string;
    browserUserAgent: string;
    browserAcceptHeader: string;
    browserScreenWidth: string;
    browserScreenHeight: string;
    browserColorDepth: string;
    browserJavaEnabled: string;
    browserTZ: string;
  } {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return {
        browserLanguage: 'es-GT',
        browserUserAgent: '',
        browserAcceptHeader: 'application/json, text/plain, */*',
        browserScreenWidth: '1366',
        browserScreenHeight: '768',
        browserColorDepth: '24',
        browserJavaEnabled: 'false',
        browserTZ: '360'
      };
    }

    return {
      browserLanguage: navigator.language || 'es-GT',
      browserUserAgent: navigator.userAgent || '',
      browserAcceptHeader: 'application/json, text/plain, */*',
      browserScreenWidth: String(window.screen?.width || window.innerWidth || 1366),
      browserScreenHeight: String(window.screen?.height || window.innerHeight || 768),
      browserColorDepth: String(window.screen?.colorDepth || 24),
      browserJavaEnabled: String(
        typeof navigator.javaEnabled === 'function' ? navigator.javaEnabled() : false
      ),
      browserTZ: String(new Date().getTimezoneOffset())
    };
  }

  private validateForm(): boolean {
    this.errorMessage = '';

    if (!this.requiresPayment) {
      this.errorMessage = 'Este tramite no requiere pago.';
      return false;
    }

    if (!this.cardholderName || this.cardholderName.trim().length < 3) {
      this.errorMessage = 'El nombre del titular es obligatorio.';
      return false;
    }

    if (!this.cardNumber || !this.expirationDate || !this.cvv) {
      this.errorMessage = 'Todos los campos de tarjeta son obligatorios.';
      return false;
    }

    if (!this.cardBrand) {
      this.errorMessage = 'La tarjeta no es aceptada. Usa Visa o Mastercard.';
      return false;
    }

    if (this.sanitizedCardNumber.length < 13) {
      this.errorMessage = 'El numero de tarjeta no es valido.';
      return false;
    }

    if (!this.passesLuhn(this.sanitizedCardNumber)) {
      this.errorMessage = 'El numero de tarjeta no es valido.';
      return false;
    }

    if (!/^\d{2}\/\d{2}$/.test(this.expirationDate)) {
      this.errorMessage = 'La fecha de expiracion debe tener formato MM/YY.';
      return false;
    }

    const [month] = this.expirationDate.split('/');
    const numericMonth = Number(month);
    if (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
      this.errorMessage = 'El mes de expiracion debe estar entre 01 y 12.';
      return false;
    }

    if (!/^\d{3,4}$/.test(this.cvv)) {
      this.errorMessage = 'El CVV no es valido.';
      return false;
    }

    if (!this.amount || this.amount <= 0) {
      this.errorMessage = 'El monto debe ser mayor a cero.';
      return false;
    }

    return true;
  }

  processPayment(): void {
    if (!this.validateForm()) return;

    this.loading = true;
    this.clearMessages();
    this.paymentResponse = null;
    this.threeDSChallengeVisible = false;

    const payload = {
      submission_id: this.submissionId || 0,
      amount: this.amount,
      cardholder_name: this.cardholderName,
      card_number: this.sanitizedCardNumber,
      expiration_date: this.expirationDateForApi,
      cvv: this.cvv
    };

    this.paymentService.createPayment(payload).subscribe({
      next: (response) => {
        this.loading = false;
        this.handlePaymentResponse(response, false);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error?.error?.message || 'Ocurrio un error al procesar el pago.';
        this.paymentRejected.emit(error);
      }
    });
  }

  private handlePaymentResponse(response: any, fromContinuation: boolean): void {
    this.paymentResponse = response;

    if (this.isApproved) {
      this.threeDSChallengeVisible = false;
      this.clearMessages();
      this.successMessage = 'Pago aprobado correctamente.';
      this.paymentApproved.emit(response);
      return;
    }

    if (this.isReversed) {
      this.threeDSChallengeVisible = false;
      this.clearMessages();
      this.infoMessage = 'La transaccion fue reversada automaticamente.';
      this.paymentRejected.emit(response);
      return;
    }

    if (this.isPendingThreeDS) {
      this.clearMessages();
      this.infoMessage = 'Verificando el dispositivo para autenticacion 3DS...';
      this.beginDeviceDataCollection(response);
      return;
    }

    if (this.isChallengeRequired) {
      this.clearMessages();
      this.infoMessage = 'Se requiere autenticacion adicional del emisor.';
      this.openStepUpChallenge(response);
      return;
    }

    this.threeDSChallengeVisible = false;

    if (this.isTimeout) {
      this.clearMessages();
      this.errorMessage = 'La transaccion excedio el tiempo de espera.';
      this.paymentRejected.emit(response);
      return;
    }

    const gatewayDetail =
      response?.neo_response?.PrivateUse63?.AlternateHostResponse22 ||
      response?.payment?.raw_response?.PrivateUse63?.AlternateHostResponse22 ||
      response?.payment?.raw_response?.latest?.PrivateUse63?.AlternateHostResponse22 ||
      '';

    this.clearMessages();
    this.errorMessage = this.getPaymentErrorMessage(
      gatewayDetail,
      response?.message,
      fromContinuation
    );
    this.paymentRejected.emit(response);
  }

  private getPaymentErrorMessage(
    gatewayDetail: string,
    responseMessage: string,
    fromContinuation: boolean
  ): string {
    const technicalMessage = String(gatewayDetail || responseMessage || '').trim();

    if (technicalMessage.toUpperCase() === 'CONSUMER_AUTHENTICATION_FAILED') {
      return 'No fue posible completar la autenticacion con el banco. El pago no fue procesado.';
    }

    return technicalMessage ||
      (fromContinuation
        ? 'La autenticacion 3DS no pudo completarse.'
        : 'El pago fue rechazado.');
  }

  private async beginDeviceDataCollection(response: any): Promise<void> {
    const threeDS = response?.three_ds;
    if (!threeDS?.deviceDataCollectionUrl || !threeDS?.accessToken) {
      this.errorMessage = 'No fue posible iniciar la verificacion 3DS.';
      this.paymentRejected.emit(response);
      return;
    }

    this.loading = true;

    try {
      await this.submitHiddenJwtForm({
        iframeName: `payment-3ds-ddc-${this.paymentId || 'session'}`,
        formId: `payment-3ds-ddc-form-${this.paymentId || 'session'}`,
        action: threeDS.deviceDataCollectionUrl,
        jwt: threeDS.accessToken,
        timeoutMs: 15000
      });

      this.infoMessage = 'Validando autenticacion con NeoNet...';
      this.continueThreeDSPayment();
    } catch (_error) {
      this.loading = false;
      this.errorMessage = 'No fue posible completar la verificacion inicial 3DS.';
      this.paymentRejected.emit(response);
    }
  }

  private continueThreeDSPayment(): void {
    if (!this.paymentId) {
      this.loading = false;
      this.errorMessage = 'No se encontro el pago para continuar la autenticacion.';
      return;
    }

    this.paymentService.continuePayment(this.paymentId, {
      browserData: this.buildBrowserThreeDSData(),
      card_number: this.sanitizedCardNumber,
      expiration_date: this.expirationDateForApi,
      cvv: this.cvv
    }).subscribe({
      next: (response) => {
        this.loading = false;
        this.handlePaymentResponse(response, true);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error?.error?.message || 'No se pudo continuar la autenticacion 3DS.';
        this.paymentRejected.emit(error);
      }
    });
  }

  private async openStepUpChallenge(response: any): Promise<void> {
    const threeDS = response?.three_ds;
    if (!threeDS?.accessToken || !threeDS?.stepUpUrl) {
      this.errorMessage = 'No fue posible abrir el challenge 3DS.';
      this.paymentRejected.emit(response);
      return;
    }

    this.threeDSChallengeVisible = true;
    this.infoMessage = 'Completa la autenticacion solicitada por el emisor.';

    await new Promise((resolve) => setTimeout(resolve, 0));
    this.submitStepUpForm(threeDS.stepUpUrl, threeDS.accessToken);
  }

  private submitStepUpForm(action: string, jwt: string): void {
    if (typeof document === 'undefined') return;

    const previous = document.getElementById(this.stepUpFormId);
    previous?.remove();

    const form = document.createElement('form');
    form.id = this.stepUpFormId;
    form.method = 'POST';
    form.action = action;
    form.target = this.stepUpIframeName;
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'JWT';
    input.value = jwt;

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    setTimeout(() => form.remove(), 0);
  }

  private submitHiddenJwtForm({
    iframeName,
    formId,
    action,
    jwt,
    timeoutMs
  }: {
    iframeName: string;
    formId: string;
    action: string;
    jwt: string;
    timeoutMs: number;
  }): Promise<void> {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return Promise.resolve();
    }

    const existingFrame = document.getElementsByName(iframeName)[0];
    existingFrame?.remove();
    document.getElementById(formId)?.remove();

    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    iframe.width = '1';
    iframe.height = '1';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.id = formId;
    form.method = 'POST';
    form.action = action;
    form.target = iframeName;
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'JWT';
    input.value = jwt;
    form.appendChild(input);
    document.body.appendChild(form);

    return new Promise((resolve) => {
      let settled = false;
      let loadHandled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        iframe.removeEventListener('load', onLoad);
        form.remove();
        setTimeout(() => iframe.remove(), 1000);
      };

      const finish = (delayMs = 0) => {
        window.setTimeout(() => {
          cleanup();
          resolve();
        }, delayMs);
      };

      const onLoad = () => {
        if (loadHandled) return;
        loadHandled = true;
        finish(1500);
      };

      iframe.addEventListener('load', onLoad);
      form.submit();

      window.setTimeout(() => {
        if (settled) return;
        if (loadHandled) {
          finish(0);
          return;
        }
        cleanup();
        resolve();
      }, timeoutMs);
    });
  }

  private onWindowMessage(event: MessageEvent): void {
    if (event.origin !== this.backendOrigin) return;
    if (event.data?.type !== 'payment_3ds_step_up_complete') return;

    this.threeDSChallengeVisible = false;
    this.loading = true;
    this.infoMessage = 'Confirmando autenticacion 3DS...';
    this.continueThreeDSPayment();
  }

  closeStepUpChallenge(): void {
    this.threeDSChallengeVisible = false;
    this.loading = false;
    this.errorMessage = 'La autenticacion 3DS fue cancelada antes de finalizar.';
    this.paymentRejected.emit(this.paymentResponse);
  }

  requestVoucher(): void {
    if (!this.paymentId) return;
    this.paymentService.getVoucherPdf(this.paymentId).subscribe({
      next: (file) => {
        const objectUrl = URL.createObjectURL(file);
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        this.voucherRequested.emit(this.paymentResponse);
      },
      error: () => {
        this.errorMessage = 'No se pudo abrir el voucher.';
        this.voucherRequested.emit(this.paymentResponse);
      }
    });
  }
}
