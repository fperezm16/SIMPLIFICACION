import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentService } from './payment.service';

@Component({
  selector: 'app-payment-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-form.component.html',
  styleUrls: ['./payment-form.component.css']
})
export class PaymentFormComponent {
  // Monto que se enviara a la pasarela de pago.
  @Input() amount = 0;

  // Id del tramite o registro asociado al pago.
  @Input() submissionId = 0;

  // Concepto o descripcion visible del pago.
  @Input() concept = 'Pago de tramite';

  // Indica si el tramite actual requiere procesar pago.
  @Input() requiresPayment = true;

  // Se emite cuando la transaccion fue aprobada.
  @Output() paymentApproved = new EventEmitter<any>();

  // Se emite cuando la transaccion fue rechazada o fallo.
  @Output() paymentRejected = new EventEmitter<any>();

  // Se emite cuando el usuario solicita consultar o descargar el voucher.
  @Output() voucherRequested = new EventEmitter<any>();

  // Campos capturados en el formulario de pago.
  cardholderName = '';
  cardNumber = '';
  expirationDate = '';
  cvv = '';

  // Estado visual y respuesta del procesamiento del pago.
  loading = false;
  errorMessage = '';
  successMessage = '';
  paymentResponse: any = null;

  // Servicio encargado de comunicarse con el backend de pagos.
  constructor(private paymentService: PaymentService) {}

  get sanitizedCardNumber(): string {
    return this.cardNumber.replace(/\s/g, '');
  }

  // Detecta la franquicia para mostrar apoyo visual al usuario mientras escribe la tarjeta.
  get cardBrand(): string {
    const value = this.sanitizedCardNumber;
    if (/^4/.test(value)) return 'VISA';
    if (/^(5[1-5]|2[2-7])/.test(value)) return 'MASTERCARD';
    return '';
  }

  // Expone el id del pago creado para habilitar acciones posteriores como el voucher.
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

  get statusBadgeLabel(): string {
    if (this.isApproved) return 'Aprobado';
    if (this.isTimeout) return 'En revision';
    if (this.paymentStatus) return 'Rechazado';
    return 'Pendiente';
  }

  get statusToneClass(): string {
    if (this.isApproved) return 'tone-success';
    if (this.isTimeout) return 'tone-warning';
    if (this.paymentStatus) return 'tone-danger';
    return 'tone-neutral';
  }

  get paymentStatusDescription(): string {
    if (this.isApproved) {
      return 'La transaccion fue autorizada correctamente por la pasarela.';
    }
    if (this.isTimeout) {
      return 'La pasarela no respondio a tiempo. Verifica el estado antes de reintentar.';
    }
    if (this.paymentStatus) {
      return 'La transaccion no pudo ser autorizada con los datos proporcionados.';
    }
    return 'Completa los datos de la tarjeta para procesar el pago.';
  }

  get formattedAmount(): string {
    return Number(this.amount || 0).toFixed(2);
  }

  get maskedCardPreview(): string {
    if (!this.sanitizedCardNumber) return '**** **** **** ****';
    const padded = this.sanitizedCardNumber.padEnd(16, '*').slice(0, 16);
    return padded.replace(/(.{4})/g, '$1 ').trim();
  }

  get cardholderPreview(): string {
    return this.cardholderName.trim() || 'NOMBRE DEL TITULAR';
  }

  get canRequestVoucher(): boolean {
    return Boolean(this.paymentId && this.isApproved);
  }

  get isPayButtonDisabled(): boolean {
    return this.loading || this.isApproved;
  }

  get payButtonLabel(): string {
    if (this.loading) return 'Procesando pago...';
    if (this.isApproved) return 'Pago procesado';
    return 'Pagar ahora';
  }

  get expirationDateForApi(): string {
    const digits = this.expirationDate.replace(/\D/g, '');
    if (digits.length !== 4) return digits;
    const month = digits.slice(0, 2);
    const year = digits.slice(2, 4);
    return `${year}${month}`;
  }

  // Normaliza el nombre del titular en mayusculas y limita su longitud.
  onCardholderNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.cardholderName = input.value.toUpperCase().slice(0, 80);
  }

  // Agrupa el numero de tarjeta en bloques de 4 digitos y elimina caracteres no validos.
  onCardNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 16);
    this.cardNumber = digits.replace(/(.{4})/g, '$1 ').trim();
  }

  // Mantiene la fecha con formato MM/YY para coincidir con lo esperado por la validacion.
  onExpirationInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    this.expirationDate =
      digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  }

  // Restringe el CVV a contenido numerico con un maximo de 4 digitos.
  onCvvInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.cvv = input.value.replace(/\D/g, '').slice(0, 4);
  }

  // Evita llamadas innecesarias al backend si falta informacion minima del pago.
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

    if (this.sanitizedCardNumber.length < 13) {
      this.errorMessage = 'El numero de tarjeta no es valido.';
      return false;
    }

    if (!/^\d{2}\/\d{2}$/.test(this.expirationDate)) {
      this.errorMessage = 'La fecha de expiracion debe tener formato MM/YY.';
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

  // Envia el pago al backend con los datos ya normalizados y maneja los estados devueltos por la pasarela.
  processPayment(): void {
    if (!this.validateForm()) return;

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.paymentResponse = null;

    // El backend recibe los campos sin formato visual para construir la transaccion.
    const payload = {
      submission_id: this.submissionId || 0,
      amount: this.amount,
      cardholder_name: this.cardholderName.trim(),
      card_number: this.sanitizedCardNumber,
      expiration_date: this.expirationDateForApi,
      cvv: this.cvv
    };

    this.paymentService.createPayment(payload).subscribe({
      next: (response) => {
        this.loading = false;
        this.paymentResponse = response;

        if (this.isApproved) {
          this.successMessage = 'Pago aprobado correctamente.';
          this.paymentApproved.emit(response);
          return;
        }

        if (this.isTimeout) {
          this.errorMessage = 'La transaccion excedio el tiempo de espera.';
          this.paymentRejected.emit(response);
          return;
        }

        this.errorMessage = 'El pago fue rechazado.';
        this.paymentRejected.emit(response);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error?.error?.message || 'Ocurrio un error al procesar el pago.';
        this.paymentRejected.emit(error);
      }
    });
  }

  // Notifica al componente padre cuando ya existe un pago y el usuario solicita su comprobante.
  requestVoucher(): void {
    if (!this.paymentId) return;
    this.voucherRequested.emit(this.paymentResponse);
  }
}
