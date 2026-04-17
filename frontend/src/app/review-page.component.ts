import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { ReviewPanelComponent } from './review-panel.component';
import { Submission } from './submission.model';
import { API_BASE } from './api.config';

@Component({
    selector: 'app-review-page',
    imports: [CommonModule, ReviewPanelComponent],
    template: `
    <section class="review-page">
      <header class="head">
        <div>
          <h2>M&oacute;dulo de revisi&oacute;n</h2>
          <p class="muted">Acceso autenticado para consultar y corregir registros.</p>
        </div>
        <button (click)="fetch()" [disabled]="loading">Recargar</button>
      </header>
      <app-review-panel [data]="submissions" [apiBase]="apiBase" (updated)="fetch()"></app-review-panel>
    </section>
  `,
    styles: [`
    .review-page {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 18px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(246, 252, 255, 0.96));
      box-shadow: var(--shadow-card);
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h2 { margin: 0 0 4px; }
    .muted { color: var(--muted); margin: 0; }
    button {
      padding: 8px 13px;
      border: 1px solid #b9d5e9;
      background: #f8fcff;
      color: #0f3e63;
      border-radius: 999px;
      cursor: pointer;
      font-weight: 600;
    }
    button[disabled] { opacity: 0.6; cursor: not-allowed; }
  `]
})
export class ReviewPageComponent implements OnInit {
  private http = inject(HttpClient);
  readonly apiBase = API_BASE;
  submissions: Submission[] = [];
  loading = false;

  ngOnInit(): void {
    this.fetch();
  }

  fetch() {
    this.loading = true;
    this.http.get<Submission[]>(`${this.apiBase}/submissions`).subscribe({
      next: (data) => {
        this.submissions = data;
        this.loading = false;
      },
      error: () => {
        this.submissions = [];
        this.loading = false;
      }
    });
  }
}