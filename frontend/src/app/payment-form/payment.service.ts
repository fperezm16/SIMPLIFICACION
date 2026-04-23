import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = 'http://localhost:4000/api/payments';

  constructor(private http: HttpClient) {}

  // Crea una transacción de pago
  createPayment(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, payload);
  }

  // Anula un pago
  cancelPayment(paymentId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${paymentId}/cancel`, {});
  }

  // Ejecuta reversa
  reversePayment(paymentId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${paymentId}/reverse`, {});
  }

  // Obtiene el voucher
  getVoucher(paymentId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${paymentId}/voucher`);
  }
}