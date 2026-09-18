import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../api.config';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = `${API_BASE}/payments`;

  constructor(private http: HttpClient) {}

  createPayment(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, payload);
  }

  continuePayment(paymentId: number, payload: any = {}): Observable<any> {
    return this.http.post(`${this.apiUrl}/${paymentId}/continue`, payload);
  }

  cancelPayment(paymentId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${paymentId}/cancel`, {});
  }

  reversePayment(paymentId: number, reason: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${paymentId}/reverse`, { reason });
  }

  getReversalPayments(query = '', status = ''): Observable<any> {
    let params = new HttpParams();
    if (query.trim()) params = params.set('q', query.trim());
    if (status) params = params.set('status', status);
    return this.http.get(`${this.apiUrl}/reversals`, { params });
  }

  getReversalHistory(paymentId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${paymentId}/reversal-history`);
  }

  getVoucher(paymentId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${paymentId}/voucher`);
  }

  getVoucherPdf(paymentId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${paymentId}/voucher/pdf`, {
      responseType: 'blob'
    });
  }
}
