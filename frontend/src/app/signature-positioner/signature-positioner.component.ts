import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type SignatureCoordinatesChange = {
  page: number;
  coordinates: string;
  visual: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pdf: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
};

type DebugErrorInfo = {
  url?: string;
  dataType?: string;
  byteLength?: number;
  errorName?: string;
  errorMessage?: string;
  httpStatus?: number | null;
};

@Component({
  selector: 'app-signature-positioner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './signature-positioner.component.html',
  styleUrls: ['./signature-positioner.component.css']
})
export class SignaturePositionerComponent implements AfterViewInit, OnChanges, OnDestroy {
  private http = inject(HttpClient);
  private static readonly MIN_ZOOM = 0.65;
  private static readonly MAX_ZOOM = 2.4;
  private static readonly ZOOM_STEP = 0.1;
  @ViewChild('previewViewport') previewViewport?: ElementRef<HTMLDivElement>;
  @ViewChild('canvasHost') canvasHost?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfCanvas') pdfCanvas?: ElementRef<HTMLCanvasElement>;

  @Input() pdfUrl?: string;
  @Input() pdfData?: ArrayBuffer | Uint8Array | string;
  @Input() initialPage = 1;
  @Input() initialCoordinates?: string;
  @Input() signatureWidth = 290;
  @Input() signatureHeight = 45;

  @Output() coordinatesChange = new EventEmitter<SignatureCoordinatesChange>();
  @Output() placementValidityChange = new EventEmitter<boolean>();
  @Output() loadingChange = new EventEmitter<boolean>();

  pageNumber = 1;
  pageCount = 0;
  zoomFactor = 1;
  showDynamicSignature = false;
  loading = false;
  errorMessage = '';
  debugErrorInfo: DebugErrorInfo | null = null;

  private pdfJsModule: any = null;
  private pdfDocument: any = null;
  renderedWidth = 595;
  renderedHeight = 842;
  private pdfWidth = 595;
  private pdfHeight = 842;
  private boxX1 = 40;
  private boxY1 = 690;
  private boxWidth = 250;
  private boxHeight = 45;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  get zoomPercent() {
    return `${Math.round(this.zoomFactor * 100)}%`;
  }

  get canZoomOut() {
    return this.zoomFactor > SignaturePositionerComponent.MIN_ZOOM;
  }

  get canZoomIn() {
    return this.zoomFactor < SignaturePositionerComponent.MAX_ZOOM;
  }

  get coordinateSummary() {
    const pdf = this.currentPdfRect();
    return `${pdf.x1} ${pdf.y1} ${pdf.x2} ${pdf.y2}`;
  }

  get stageAspectRatio() {
    return `${this.pdfWidth} / ${this.pdfHeight}`;
  }

  get visualLeftPx() {
    return (this.boxX1 / this.pdfWidth) * this.renderedWidth;
  }

  get visualTopPx() {
    const pdfY2 = this.boxY1 + this.boxHeight;
    return this.renderedHeight - ((pdfY2 / this.pdfHeight) * this.renderedHeight);
  }

  get visualWidthPx() {
    return (this.boxWidth / this.pdfWidth) * this.renderedWidth;
  }

  get visualHeightPx() {
    return (this.boxHeight / this.pdfHeight) * this.renderedHeight;
  }

  ngAfterViewInit() {
    void this.loadPdf();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialCoordinates'] && !changes['pdfUrl'] && !changes['pdfData']) {
      this.applyInitialCoordinates();
      this.emitCoordinates();
    }

    if (changes['initialPage'] && !changes['pdfUrl'] && !changes['pdfData']) {
      this.pageNumber = this.normalizePage(this.initialPage);
      if (this.pdfDocument) {
        void this.renderCurrentPage();
      }
    }

    if (changes['pdfUrl'] || changes['pdfData']) {
      void this.loadPdf();
    }
  }

  ngOnDestroy() {
    this.releaseDocument();
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (this.pdfDocument && !this.loading) {
      void this.renderCurrentPage();
    }
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(event: PointerEvent) {
    if (!this.dragging) return;
    // Convierte el puntero global a coordenadas visibles del PDF.
    const point = this.resolveVisualPoint(event.clientX, event.clientY);
    if (!point) return;
    this.setBoxFromVisualTopLeft(point.x - this.dragOffsetX, point.y - this.dragOffsetY);
    event.preventDefault();
  }

  @HostListener('document:pointerup')
  stopDragging() {
    this.dragging = false;
  }

  previousPage() {
    if (this.pageNumber <= 1 || this.loading) return;
    this.placementValidityChange.emit(false);
    this.pageNumber -= 1;
    void this.renderCurrentPage();
  }

  nextPage() {
    if (this.pageNumber >= this.pageCount || this.loading) return;
    this.placementValidityChange.emit(false);
    this.pageNumber += 1;
    void this.renderCurrentPage();
  }

  zoomOut() {
    if (this.loading || !this.canZoomOut) return;
    this.zoomFactor = Math.max(
      SignaturePositionerComponent.MIN_ZOOM,
      Number((this.zoomFactor - SignaturePositionerComponent.ZOOM_STEP).toFixed(2))
    );
    void this.renderCurrentPage();
  }

  zoomIn() {
    if (this.loading || !this.canZoomIn) return;
    this.zoomFactor = Math.min(
      SignaturePositionerComponent.MAX_ZOOM,
      Number((this.zoomFactor + SignaturePositionerComponent.ZOOM_STEP).toFixed(2))
    );
    void this.renderCurrentPage();
  }

  resetPosition() {
    this.placementValidityChange.emit(false);
    this.zoomFactor = 1;
    this.pageNumber = this.normalizePage(this.initialPage);
    this.applyInitialCoordinates();
    if (this.pdfDocument) {
      void this.renderCurrentPage();
      return;
    }
    this.emitCoordinates();
  }

  toggleDynamicSignature() {
    this.showDynamicSignature = !this.showDynamicSignature;
    this.placementValidityChange.emit(false);
    if (this.showDynamicSignature) {
      // Reinicia la caja al punto base cada vez que se activa.
      this.applyInitialCoordinates();
      this.emitCoordinates();
    }
  }

  moveFromStageClick(event: MouseEvent) {
    if (this.loading || this.errorMessage || !this.showDynamicSignature) return;
    const point = this.resolveVisualPoint(event.clientX, event.clientY);
    if (!point) return;
    this.setBoxFromVisualTopLeft(
      point.x - (this.visualWidthPx / 2),
      point.y - (this.visualHeightPx / 2)
    );
  }

  startDragging(event: PointerEvent) {
    if (this.loading || this.errorMessage || !this.showDynamicSignature) return;
    const point = this.resolveVisualPoint(event.clientX, event.clientY);
    if (!point) return;
    this.dragging = true;
    this.dragOffsetX = point.x - this.visualLeftPx;
    this.dragOffsetY = point.y - this.visualTopPx;
    event.preventDefault();
    event.stopPropagation();
  }

  private async loadPdf() {
    this.placementValidityChange.emit(false);
    this.releaseDocument();
    this.errorMessage = '';
    this.debugErrorInfo = null;
    if (!this.pdfCanvas || (!this.pdfUrl && !this.pdfData)) return;

    this.setLoading(true);
    let debugDataType = this.pdfData instanceof Uint8Array
      ? 'Uint8Array'
      : this.pdfData instanceof ArrayBuffer
        ? 'ArrayBuffer'
        : typeof this.pdfData === 'string' && this.pdfData.trim()
          ? 'string'
          : this.pdfUrl
            ? 'URL->ArrayBuffer->Uint8Array'
            : 'desconocido';
    let debugByteLength: number | undefined;
    try {
      if (!this.pdfJsModule) {
        // Carga PDF.js bajo demanda para no inflar el arranque inicial.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.mjs',
          import.meta.url
        ).toString();
        this.pdfJsModule = { getDocument: pdfjs.getDocument };
      }

      const sourceData = await this.resolvePdfSource();
      debugDataType = sourceData instanceof Uint8Array ? 'Uint8Array' : typeof sourceData;
      debugByteLength = sourceData instanceof Uint8Array ? sourceData.byteLength : undefined;
      const loadingTask = this.pdfJsModule!.getDocument({
        data: sourceData
      } as any);

      this.pdfDocument = await loadingTask.promise;
      this.pageCount = Number(this.pdfDocument?.numPages || 1);
      this.pageNumber = this.normalizePage(this.initialPage);
      this.applyInitialCoordinates();
      await this.renderCurrentPage();
    } catch (error: any) {
      this.errorMessage = 'No se pudo abrir la vista del PDF.';
      this.debugErrorInfo = {
        url: this.pdfUrl || undefined,
        dataType: debugDataType,
        byteLength: debugByteLength,
        errorName: typeof error?.name === 'string' ? error.name : undefined,
        errorMessage: typeof error?.message === 'string' ? error.message : undefined,
        httpStatus: Number.isFinite(Number(error?.status)) ? Number(error.status) : null
      };
    } finally {
      this.setLoading(false);
    }
  }

  private async renderCurrentPage() {
    if (!this.pdfDocument || !this.pdfCanvas || !this.canvasHost) return;

    try {
      this.setLoading(true);
      this.errorMessage = '';

      const page = await this.pdfDocument.getPage(this.pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      this.pdfWidth = baseViewport.width || 595;
      this.pdfHeight = baseViewport.height || 842;

      // Ajusta el zoom sobre el ancho visible real del contenedor.
      const previewWidth = this.previewViewport?.nativeElement.clientWidth || 0;
      const availableWidth = Math.max(Math.min(previewWidth - 16, this.pdfWidth) || this.pdfWidth, 280);
      const fitScale = availableWidth / this.pdfWidth;
      const renderScale = Math.max(fitScale * this.zoomFactor, 0.6);
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = this.pdfCanvas.nativeElement;
      const context = canvas.getContext('2d');
      if (!context) {
        this.errorMessage = 'No se pudo preparar el lienzo del PDF.';
        return;
      }

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      this.renderedWidth = viewport.width;
      this.renderedHeight = viewport.height;

      await page.render({
        canvasContext: context,
        viewport
      }).promise;

      this.clampPdfRect();
      this.emitCoordinates();
    } catch {
      this.errorMessage = 'No se pudo renderizar la pagina seleccionada.';
    } finally {
      this.setLoading(false);
    }
  }

  private emitCoordinates() {
    // Emite coordenadas tanto visuales como reales del PDF.
    const pdf = this.currentPdfRect();
    this.coordinatesChange.emit({
      page: this.pageNumber,
      coordinates: `${pdf.x1} ${pdf.y1} ${pdf.x2} ${pdf.y2}`,
      visual: {
        x: Math.round(this.visualLeftPx),
        y: Math.round(this.visualTopPx),
        width: Math.round(this.visualWidthPx),
        height: Math.round(this.visualHeightPx)
      },
      pdf
    });
  }

  private currentPdfRect() {
    const x1 = Math.round(this.boxX1);
    const y1 = Math.round(this.boxY1);
    const x2 = Math.round(this.boxX1 + this.boxWidth);
    const y2 = Math.round(this.boxY1 + this.boxHeight);
    return { x1, y1, x2, y2 };
  }

  private applyInitialCoordinates() {
    // Usa coordenadas externas cuando existen; si no, aplica el fallback.
    const parsed = this.parseCoordinates(this.initialCoordinates);
    if (parsed) {
      this.boxX1 = parsed.x1;
      this.boxY1 = parsed.y1;
      this.boxWidth = parsed.x2 - parsed.x1;
      this.boxHeight = parsed.y2 - parsed.y1;
    } else {
      this.boxWidth = Math.max(1, Number(this.signatureWidth) || 290);
      this.boxHeight = Math.max(1, Number(this.signatureHeight) || 45);
      this.boxX1 = 40;
      this.boxY1 = 690;
    }
    this.clampPdfRect();
  }

  private parseCoordinates(value?: string) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parts = raw.split(/\s+/).map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
    const [x1, y1, x2, y2] = parts;
    if (x2 <= x1 || y2 <= y1) return null;
    return { x1, y1, x2, y2 };
  }

  private setBoxFromVisualTopLeft(rawLeft: number, rawTop: number) {
    // Mantiene la caja siempre dentro de los limites visibles.
    const maxLeft = Math.max(this.renderedWidth - this.visualWidthPx, 0);
    const maxTop = Math.max(this.renderedHeight - this.visualHeightPx, 0);
    const left = Math.min(Math.max(rawLeft, 0), maxLeft);
    const top = Math.min(Math.max(rawTop, 0), maxTop);

    this.boxX1 = (left / this.renderedWidth) * this.pdfWidth;
    const nextY2 = this.pdfHeight - ((top / this.renderedHeight) * this.pdfHeight);
    this.boxY1 = nextY2 - this.boxHeight;
    this.clampPdfRect();
    this.emitCoordinates();
    this.placementValidityChange.emit(true);
  }

  private clampPdfRect() {
    const maxX = Math.max(this.pdfWidth - this.boxWidth, 0);
    const maxY = Math.max(this.pdfHeight - this.boxHeight, 0);
    this.boxX1 = Math.min(Math.max(this.boxX1, 0), maxX);
    this.boxY1 = Math.min(Math.max(this.boxY1, 0), maxY);
  }

  private normalizePage(value: number) {
    const numeric = Number.parseInt(String(value || 1), 10);
    const max = this.pageCount || 1;
    if (!Number.isFinite(numeric)) return 1;
    return Math.min(Math.max(numeric, 1), max);
  }

  private resolveVisualPoint(clientX: number, clientY: number) {
    // Traduce coordenadas de pantalla a coordenadas del canvas renderizado.
    const canvas = this.pdfCanvas?.nativeElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    return { x, y };
  }

  private async resolvePdfSource() {
    if (this.pdfData instanceof Uint8Array) {
      return this.pdfData;
    }
    if (this.pdfData instanceof ArrayBuffer) {
      return new Uint8Array(this.pdfData);
    }
    if (typeof this.pdfData === 'string' && this.pdfData.trim()) {
      // Soporta PDFs embebidos en base64.
      return this.decodeStringPdf(this.pdfData);
    }
    if (!this.pdfUrl) {
      throw new Error('PDF source missing');
    }
    const data = await firstValueFrom(this.http.get(this.pdfUrl, { responseType: 'arraybuffer' }));
    return new Uint8Array(data || new ArrayBuffer(0));
  }

  private decodeStringPdf(rawValue: string) {
    const normalized = rawValue.includes(',')
      ? rawValue.slice(rawValue.indexOf(',') + 1)
      : rawValue;
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  private releaseDocument() {
    this.dragging = false;
    this.pageCount = 0;
    if (this.pdfDocument?.destroy) {
      try {
        this.pdfDocument.destroy();
      } catch {
        // PDF.js cleanup best effort.
      }
    }
    this.pdfDocument = null;
  }

  private setLoading(value: boolean) {
    if (this.loading === value) return;
    this.loading = value;
    this.loadingChange.emit(value);
  }
}
