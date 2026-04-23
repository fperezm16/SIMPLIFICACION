import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  @Input() amount = 0;
  @Input() submissionId = 0;
  @Input() requiresPayment = true;

  @Output() paymentApproved = new EventEmitter<any>();
  @Output() paymentRejected = new EventEmitter<any>();

  cardNumber = '';
  expirationDate = '';
  cvv = '';

  loading = false;
  errorMessage = '';
  successMessage = '';
  paymentResponse: any = null;

  constructor(private paymentService: PaymentService) {}

  get cardBrand(): string {
    const value = this.cardNumber.replace(/\s/g, '');
    if (/^4/.test(value)) return 'VISA';
    if (/^(5[1-5]|2[2-7])/.test(value)) return 'MASTERCARD';
    return '';
  }

  onCardNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 16);
    this.cardNumber = digits.replace(/(.{4})/g, '$1 ').trim();
  }

  onExpirationInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);

    if (digits.length >= 3) {
      this.expirationDate = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else {
      this.expirationDate = digits;
    }
  }

  onCvvInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.cvv = input.value.replace(/\D/g, '').slice(0, 4);
  }

  private validateForm(): boolean {
    this.errorMessage = '';

    if (!this.requiresPayment) {
      this.errorMessage = 'Este trámite no requiere pago.';
      return false;
    }

    if (!this.cardNumber || !this.expirationDate || !this.cvv) {
      this.errorMessage = 'Todos los campos de tarjeta son obligatorios.';
      return false;
    }

    if (this.cardNumber.replace(/\s/g, '').length < 13) {
      this.errorMessage = 'El número de tarjeta no es válido.';
      return false;
    }

    if (!/^\d{2}\/\d{2}$/.test(this.expirationDate)) {
      this.errorMessage = 'La fecha de expiración debe tener formato MM/YY.';
      return false;
    }

    if (!/^\d{3,4}$/.test(this.cvv)) {
      this.errorMessage = 'El CVV no es válido.';
      return false;
    }

    if (!this.amount || this.amount <= 0) {
      this.errorMessage = 'El monto debe ser mayor a cero.';
      return false;
    }

    return true;
  }

  processPayment(): void {
    if (!this.validateForm()) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.paymentResponse = null;

    const payload = {
      submission_id: this.submissionId || 0,
      amount: this.amount,
      card_number: this.cardNumber.replace(/\s/g, ''),
      expiration_date: this.expirationDate.replace('/', ''),
      cvv: this.cvv
    };

    this.paymentService.createPayment(payload).subscribe({
      next: (response) => {
        this.loading = false;
        this.paymentResponse = response;

        if (response?.status === 'approved') {
          this.successMessage = 'Pago aprobado correctamente.';
          this.paymentApproved.emit(response);
        } else {
          this.errorMessage = 'El pago fue rechazado.';
          this.paymentRejected.emit(response);
        }
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error?.error?.message || 'Ocurrió un error al procesar el pago.';
        this.paymentRejected.emit(error);
      }
    });
  }
}