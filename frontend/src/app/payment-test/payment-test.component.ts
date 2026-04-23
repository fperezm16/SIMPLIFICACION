import { Component } from '@angular/core';
import { PaymentFormComponent } from '../payment-form/payment-form.component';

@Component({
  selector: 'app-payment-test',
  standalone: true,
  imports: [PaymentFormComponent],
  template: `
    <h1>Prueba de Pago</h1>

    <app-payment-form
      [amount]="1400"
      [submissionId]="99"
      [requiresPayment]="true"
      (paymentApproved)="onPaymentApproved($event)"
      (paymentRejected)="onPaymentRejected($event)">
    </app-payment-form>
  `
})
export class PaymentTestComponent {

  onPaymentApproved(event: any): void {
    console.log('Pago aprobado:', event);
  }

  onPaymentRejected(event: any): void {
    console.log('Pago rechazado:', event);
  }
}