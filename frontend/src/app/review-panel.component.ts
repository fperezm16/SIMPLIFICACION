import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Analyst, AnalystsService } from './analysts.service';
import { AuthService } from './auth.service';
import { Submission } from './submission.model';

type SubmissionLog = {
  id: number;
  submission_id: number;
  event_code: string;
  event_label: string;
  event_detail?: string | null;
  metadata?: { comment?: string | null; rating_value?: number | null } | null;
  actor_user_id?: number | null;
  actor_role?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  created_at: string;
};

type TableDocumentKey =
  | 'dpi'
  | 'financialDeclaraguate1'
  | 'financialDeclaraguate2'
  | 'financialDeclaraguate3'
  | 'financialDeclaraguate4'
  | 'financialDeclaraguate5'
  | 'acta'
  | 'carta'
  | 'registro'
  | 'rpaActaNombramiento'
  | 'rpaRegistroRepresentante'
  | 'rpaRegistroEntidad'
  | 'rpaDocumentoEstado'
  | 'boleta'
  | 'signed';

type TableDocument = {
  key: TableDocumentKey;
  label: string;
  filename?: string | null;
};

@Component({
    selector: 'app-review-panel',
    imports: [CommonModule, FormsModule],
    template: `
    <section class="review-card">
      <header class="review-head">
        <div>
          <h3>Módulo de revisión</h3>
          <p>Consulta, asigna y revisa los registros almacenados.</p>
        </div>
        <div class="filters">
          <label>Formulario:
            <select [(ngModel)]="filterFormulario">
              <option value="">Todos</option>
              <option *ngFor="let option of formulariosDisponibles()" [value]="option">{{ option }}</option>
            </select>
          </label>
        </div>
      </header>
      <div class="status-legend" *ngIf="role === 'revisor'">
        <span class="chip ok">Asignado</span>
        <span class="chip warn">Pendiente</span>
        <span class="chip bad">No abierto</span>
      </div>

      <div class="process-list" *ngIf="filtered().length; else empty">
        <article class="process-card" *ngFor="let row of filtered()" [class]="statusClass(row)">
          <div class="process-main">
            <div class="process-title-block">
              <div class="process-title">
                <strong>{{ row.nombre_propietario || 'N/D' }}</strong>
                <span class="registry-chip">{{ row.registro_codigo || ('#' + row.id) }}</span>
              </div>
              <div class="process-subtitle">
                {{ row.correo || 'N/D' }} · Tel. {{ row.telefono || 'N/D' }}
              </div>
            </div>
            <div class="process-actions">
              <span class="pill small">{{ formularioLabel(row) }}</span>
              <span class="state-pill" [class]="stateClass(row)">{{ stateLabel(row) }}</span>
              <button class="open-btn" type="button" (click)="select(row)">Abrir</button>
            </div>
          </div>

          <div class="process-meta">
            <span><strong>Referencia</strong>{{ tableReference(row) }}</span>
            <span><strong>Tipo persona</strong>{{ row.persona_tipo === 'juridica' ? 'Jurídica' : 'Individual' }}</span>
            <span><strong>Fecha envío</strong>{{ row.created_at | date:'short' }}</span>
            <span><strong>{{ stageLabel(row, 'analista') }}</strong>{{ row.assigned_analista_name || row.assigned_analista_email || 'Sin asignar' }}</span>
            <span *ngIf="showsEmitterField(row)"><strong>{{ stageLabel(row, 'emisor') }}</strong>{{ stageAssignee(row, 'emisor') }}</span>
            <span><strong>{{ stageLabel(row, 'aprobador') }}</strong>{{ stageAssignee(row, 'aprobador') }}</span>
          </div>

          <div class="documents-row">
            <span class="documents-label">Documentos</span>
            <div class="doc-list" *ngIf="tableDocuments(row).length; else noCardDocs">
              <button
                type="button"
                class="doc-link"
                *ngFor="let doc of tableDocuments(row)"
                (click)="openTableDocument(row, doc.key)">
                {{ doc.label }}
              </button>
            </div>
            <ng-template #noCardDocs><span class="muted">Sin documentos</span></ng-template>
          </div>
        </article>
      </div>
      <ng-template #empty>
        <div class="empty">No hay registros para mostrar.</div>
      </ng-template>

      <div class="editor" *ngIf="selected && edit">
        <h4>Edición de registro {{ selected.registro_codigo || ('#' + selected.id) }}</h4>
        <p class="editor-state">Estado actual: <strong>{{ stateLabel(selected) }}</strong></p>
        <section class="log-box" *ngIf="canViewLogs">
          <div class="log-head">
            <h5>Bitácora del proceso</h5>
            <small>Fecha y hora de cada movimiento</small>
          </div>
          <div class="log-empty" *ngIf="logsLoading">Cargando bitácora...</div>
          <div class="log-empty" *ngIf="!logsLoading && !logs.length">Sin movimientos registrados.</div>
          <ul class="log-list" *ngIf="!logsLoading && logs.length">
            <li *ngFor="let entry of logs">
              <div class="log-meta">
                <span class="log-time">{{ entry.created_at | date:'short' }}</span>
                <span class="log-role" *ngIf="entry.actor_role">{{ normalizeDisplayText(entry.actor_role) }}</span>
              </div>
              <span class="log-event" [class]="logEventClass(entry)">{{ normalizeDisplayText(entry.event_label) }}</span>
              <small *ngIf="entry.event_detail">{{ normalizeDisplayText(entry.event_detail) }}</small>
              <small *ngIf="logComment(entry)">Comentario: {{ normalizeDisplayText(logComment(entry)) }}</small>
              <small *ngIf="entry.actor_name || entry.actor_email">Por: {{ actorDisplay(entry) }}</small>
            </li>
          </ul>
        </section>
        <div class="editor-grid">
          <ng-container *ngIf="isFinancialSubmission(selected); else standardSubmissionFields">
            <label>Nombre <input [value]="selected.nombre_propietario || financialValue(selected, 'nombre_empresa')" disabled /></label>
            <label>DPI del solicitante <input [value]="selected.documento_propietario || financialValue(selected, 'dpi_solicitante')" disabled /></label>
            <label>Correo <input [value]="selected.correo || ''" disabled /></label>
            <label>Teléfono <input [value]="selected.telefono || ''" disabled /></label>
            <label>NIT <input [value]="selected.nit || ''" disabled /></label>
            <label>Nombre del solicitante <input [value]="selected.representante_legal || financialValue(selected, 'nombre_solicitante')" disabled /></label>
            <label>{{ financialProcessFieldLabel() }} <input [value]="financialProcessLabel(selected)" disabled /></label>
            <label *ngIf="financialValue(selected, 'area')">Área <input [value]="financialValue(selected, 'area')" disabled /></label>
            <label *ngIf="financialValue(selected, 'nomenclatura_area')">Nomenclatura del área <input [value]="financialValue(selected, 'nomenclatura_area')" disabled /></label>
            <label *ngIf="financialValue(selected, 'anio')">Año <input [value]="financialValue(selected, 'anio')" disabled /></label>
            <label *ngIf="financialValue(selected, 'matricula')">Número de matrícula <input [value]="financialValue(selected, 'matricula')" disabled /></label>
            <label *ngIf="financialValue(selected, 'peso_kg')">Peso máximo de despegue en KGS <input [value]="financialValue(selected, 'peso_kg')" disabled /></label>
            <label *ngIf="financialValue(selected, 'fecha_pago_mora')">Fecha de pago para mora <input [value]="financialValue(selected, 'fecha_pago_mora')" disabled /></label>
            <label *ngIf="financialValue(selected, 'nombre_taller')">Nombre de taller <input [value]="financialValue(selected, 'nombre_taller')" disabled /></label>
            <label *ngIf="financialValue(selected, 'numero_placa')">Número de placa <input [value]="financialValue(selected, 'numero_placa')" disabled /></label>
            <label *ngIf="financialValue(selected, 'tipo_vehiculo')">Tipo de vehículo <input [value]="financialValue(selected, 'tipo_vehiculo')" disabled /></label>
            <label *ngIf="financialValue(selected, 'color_vehiculo')">Color de vehículo <input [value]="financialValue(selected, 'color_vehiculo')" disabled /></label>
            <label *ngIf="financialValue(selected, 'marca_vehiculo')">Marca de vehículo <input [value]="financialValue(selected, 'marca_vehiculo')" disabled /></label>
            <label *ngIf="financialValue(selected, 'monto_referencia')">Monto seleccionado <input [value]="financialValue(selected, 'monto_referencia')" disabled /></label>
            <label *ngIf="financialValue(selected, 'certificado_operativo_subtipo')">Tipo certificado operativo <input [value]="financialCertificadoOperativoLabel(selected)" disabled /></label>
            <label *ngIf="financialValue(selected, 'otros_detalle')">Detalle adicional <input [value]="financialValue(selected, 'otros_detalle')" disabled /></label>
            <label *ngIf="financialSelectedLanguages(selected)">Idiomas seleccionados <input [value]="financialSelectedLanguages(selected)" disabled /></label>
          </ng-container>
          <ng-template #standardSubmissionFields>
            <ng-container *ngIf="isAilaSubmission(selected); else genericSubmissionFields">
              <div class="aila-review-view">
                <section class="aila-section">
                  <div class="aila-section-title"><span>1</span><h5>Clasificación del permiso</h5></div>
                  <div class="aila-field-grid">
                    <div class="aila-field-card">
                      <strong>Tipo de permiso</strong>
                      <span>{{ ailaPermitLabel(selected) }}</span>
                    </div>
                    <div class="aila-field-card">
                      <strong>Fecha de solicitud</strong>
                      <span>{{ ailaValue(selected, 'fecha') || (selected.created_at | date:'yyyy-MM-dd') }}</span>
                    </div>
                  </div>
                </section>

                <section class="aila-section">
                  <div class="aila-section-title"><span>2</span><h5>Datos del permiso</h5></div>
                  <div class="aila-field-grid">
                    <div class="aila-field-card">
                      <strong>Empresa / Arrendatario</strong>
                      <span>{{ selected.nombre_propietario || ailaValue(selected, 'empresa_arrendatario') || '—' }}</span>
                    </div>
                    <div class="aila-field-card">
                      <strong>Área de destino a visitar</strong>
                      <span>{{ selected.direccion || ailaValue(selected, 'area_destino') || '—' }}</span>
                    </div>
                    <div class="aila-field-card">
                      <strong>Motivo de la visita</strong>
                      <span>{{ ailaValue(selected, 'motivo_visita') || '—' }}</span>
                    </div>
                    <div class="aila-field-card">
                      <strong>Fecha de ingreso</strong>
                      <span>{{ ailaValue(selected, 'fecha_ingreso') || '—' }}</span>
                    </div>
                    <div class="aila-field-card">
                      <strong>Días solicitados</strong>
                      <span>{{ ailaValue(selected, 'dias_solicitados') || '—' }}</span>
                    </div>
                    <div class="aila-field-card">
                      <strong>No. telefónico para notificaciones</strong>
                      <span>{{ selected.telefono || ailaValue(selected, 'telefono_notificaciones') || '—' }}</span>
                    </div>
                    <div class="aila-field-card">
                      <strong>Hora de ingreso</strong>
                      <span>{{ ailaValue(selected, 'hora_ingreso') || '—' }}</span>
                    </div>
                    <div class="aila-field-card">
                      <strong>Correo electrónico para notificaciones</strong>
                      <span>{{ selected.correo || ailaValue(selected, 'correo_notificaciones') || '—' }}</span>
                    </div>
                  </div>
                </section>

                <section class="aila-section">
                  <div class="aila-section-title"><span>3</span><h5>Personas a ingresar</h5></div>
                  <div class="aila-table-wrap">
                    <table class="aila-table" *ngIf="ailaEntries(selected, 'personas').length; else noAilaPeople">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Nombres y apellidos completos como DPI</th>
                          <th>No. DPI / Pasaporte</th>
                          <th>PDF</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr *ngFor="let person of ailaEntries(selected, 'personas'); let i = index">
                          <td>{{ i + 1 }}</td>
                          <td>{{ displayValue(person['nombre']) }}</td>
                          <td>{{ displayValue(person['documento']) }}</td>
                          <td>{{ displayValue(person['documento_pdf']) }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <ng-template #noAilaPeople><div class="aila-empty">Sin personas registradas.</div></ng-template>
                  </div>
                </section>

                <section class="aila-section">
                  <div class="aila-section-title"><span>4</span><h5>Datos de escolta</h5></div>
                  <div class="aila-table-wrap">
                    <table class="aila-table" *ngIf="ailaEntries(selected, 'escoltas').length; else noAilaEscorts">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Nombre y apellido según T.I.A.</th>
                          <th>No. teléfono</th>
                          <th>No. T.I.A.</th>
                          <th>Vencimiento T.I.A.</th>
                          <th>PDF T.I.A. / contraseña</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr *ngFor="let escort of ailaEntries(selected, 'escoltas'); let i = index">
                          <td>{{ i + 1 }}</td>
                          <td>{{ displayValue(escort['nombre']) }}</td>
                          <td>{{ displayValue(escort['telefono']) }}</td>
                          <td>{{ displayValue(escort['tia']) }}</td>
                          <td>{{ displayValue(escort['vencimiento_tia']) }}</td>
                          <td>{{ displayValue(escort['documento_pdf'] || escort['contrasena_pdf']) }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <ng-template #noAilaEscorts><div class="aila-empty">Sin escoltas registrados.</div></ng-template>
                  </div>
                </section>

                <section class="aila-section" *ngIf="ailaEntries(selected, 'herramientas').length">
                  <div class="aila-section-title"><span>5</span><h5>Herramienta, mercadería y/o mobiliario</h5></div>
                  <div class="aila-table-wrap">
                    <table class="aila-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Cantidad</th>
                          <th>Descripción</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr *ngFor="let item of ailaEntries(selected, 'herramientas'); let i = index">
                          <td>{{ i + 1 }}</td>
                          <td>{{ displayValue(item['cantidad']) }}</td>
                          <td>{{ displayValue(item['descripcion']) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>

                <section class="aila-section" *ngIf="ailaEntries(selected, 'vehiculos').length">
                  <div class="aila-section-title"><span>6</span><h5>Ingreso de vehículo</h5></div>
                  <div class="aila-table-wrap">
                    <table class="aila-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>No. placa</th>
                          <th>Tipo vehículo</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr *ngFor="let vehicle of ailaEntries(selected, 'vehiculos'); let i = index">
                          <td>{{ i + 1 }}</td>
                          <td>{{ displayValue(vehicle['placa']) }}</td>
                          <td>{{ displayValue(vehicle['tipo']) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </ng-container>
            <ng-template #genericSubmissionFields>
              <label>Nombre propietario <input [(ngModel)]="edit.nombre_propietario" [disabled]="!canEdit" /></label>
              <label>Documento propietario <input [(ngModel)]="edit.documento_propietario" [disabled]="!canEdit" /></label>
              <label>Dirección <input [(ngModel)]="edit.direccion" [disabled]="!canEdit" /></label>
              <label>Teléfono <input [(ngModel)]="edit.telefono" [disabled]="!canEdit" /></label>
              <label>Correo <input [(ngModel)]="edit.correo" [disabled]="!canEdit" /></label>
              <label>NIT <input [(ngModel)]="edit.nit" [disabled]="!canEdit" /></label>
              <label>Nombre orden de pago <input [(ngModel)]="edit.nombre_orden_pago" [disabled]="!canEdit" /></label>
              <label>Autorizado nombre <input [(ngModel)]="edit.autorizado_nombre" [disabled]="!canEdit" /></label>
              <label>Autorizado documento <input [(ngModel)]="edit.autorizado_documento" [disabled]="!canEdit" /></label>
              <label>Autorizado teléfono <input [(ngModel)]="edit.autorizado_telefono" [disabled]="!canEdit" /></label>
              <label>Matrícula TG <input [(ngModel)]="edit.matricula_tg" [disabled]="!canEdit" /></label>
              <label>Matrícula TG nueva <input [(ngModel)]="edit.matricula_tg_nueva" [disabled]="!canEdit" /></label>
              <label>Uso
                <select [(ngModel)]="edit.uso" [disabled]="!canEdit">
                  <option value="privado">Privado</option>
                  <option value="comercial">Comercial</option>
                  <option value="fumigacion">Fumigación</option>
                  <option value="estado">Entidades de Estado</option>
                  <option value="otros">Otros</option>
                </select>
              </label>
              <label>Fabricante <input [(ngModel)]="edit.fabricante" [disabled]="!canEdit" /></label>
              <label>Número serie <input [(ngModel)]="edit.numero_serie" [disabled]="!canEdit" /></label>
              <label>Modelo <input [(ngModel)]="edit.modelo" [disabled]="!canEdit" /></label>
              <label>Año fabricación <input [(ngModel)]="edit.anio_fabricacion" [disabled]="!canEdit" /></label>
              <label>Colores <input [(ngModel)]="edit.colores" [disabled]="!canEdit" /></label>
              <label>Especificaciones <input [(ngModel)]="edit.especificaciones" [disabled]="!canEdit" /></label>
            </ng-template>
          </ng-template>
          <label *ngIf="canReturnToUserSelected() || canReturnToAnalyst">
            {{ canReturnToAnalyst ? 'Motivo de devolución al analista' : 'Motivo de devolución al usuario' }}
            <textarea rows="3" [(ngModel)]="returnReason" [disabled]="returning"></textarea>
          </label>
          <label *ngIf="canWriteReceptionComments(selected)">
            Observaciones / comentarios
            <textarea rows="3" [(ngModel)]="reviewComments" [disabled]="saving || sendingToEmitter"></textarea>
          </label>
          <label *ngIf="analysts.length && canAssign">Asignar a {{ assignStageLabel(selected) }}
            <select [(ngModel)]="edit.assigned_analista_id">
              <option [ngValue]="null">Sin asignar</option>
              <option *ngFor="let a of analysts" [ngValue]="a.id">
                {{ a.name || a.email }} ({{ a.email }})
              </option>
            </select>
          </label>
          <label>{{ assignedStageLabel(selected, 'analista') }}
            <input [value]="selected.assigned_analista_name || selected.assigned_analista_email || 'Sin asignar'" disabled />
          </label>
          <label>{{ assignedStageLabel(selected, 'aprobador') }}
            <input [value]="selected.assigned_aprobador_name || selected.assigned_aprobador_email || 'Sin asignar'" disabled />
          </label>
          <label *ngIf="canSendSelectedToApprover()">Asignar a {{ assignStageLabel(selected, 'aprobador') }}
            <select [(ngModel)]="edit.assigned_aprobador_id" [disabled]="sendingToApprover || !approversForSelected().length">
              <option [ngValue]="null">Asignar automáticamente</option>
              <option *ngFor="let a of approversForSelected()" [ngValue]="a.id">
                {{ a.name || a.email }} ({{ a.email }})
              </option>
            </select>
            <small class="muted" *ngIf="!approversForSelected().length">No hay aprobadores configurados para esta unidad.</small>
          </label>
          <label *ngIf="canSendSelectedToEmitter() && showsEmitterField(selected)">Asignar a {{ assignStageLabel(selected, 'emisor') }}
            <select [(ngModel)]="edit.assigned_emisor_id" [disabled]="sendingToEmitter || !emittersForSelected().length">
              <option [ngValue]="null">Asignar automáticamente</option>
              <option *ngFor="let e of emittersForSelected()" [ngValue]="e.id">
                {{ e.name || e.email }} ({{ e.email }})
              </option>
            </select>
            <small class="muted" *ngIf="!emittersForSelected().length">No hay emisores configurados para esta unidad.</small>
          </label>
          <label *ngIf="showsEmitterField(selected)">{{ assignedStageLabel(selected, 'emisor') }}
            <input [value]="selected.assigned_emisor_name || selected.assigned_emisor_email || 'Sin asignar'" disabled />
          </label>
        </div>
        <section class="attachments-zone">
          <h5>Documentos del proceso</h5>
          <div class="attachments-list">
            <ng-container *ngIf="isFinancialSubmission(selected); else defaultDpiAttachment">
              <div class="dpi-box" *ngFor="let doc of financialDeclaraguateDocuments(selected)" [hidden]="!doc.has">
                <div class="dpi-head">
                  <span>Declaraguate {{ doc.number }}:</span>
                  <strong>{{ doc.filename || ('declaraguate-' + doc.number + '.pdf') }}</strong>
                </div>
                <button class="link" type="button" (click)="viewFinancialDeclaraguate(selected, doc.number)">Ver PDF</button>
              </div>
            </ng-container>
            <ng-template #defaultDpiAttachment>
              <div class="dpi-box" *ngIf="selected.has_dpi || selected.dpi_filename">
              <div class="dpi-head">
                <span>{{ documentLabel(selected, 'dpi') }}:</span>
                <strong>{{ selected.dpi_filename || 'dpi.pdf' }}</strong>
              </div>
              <button class="link" type="button" (click)="viewDpi(selected)">Ver PDF</button>
              </div>
            </ng-template>
            <div class="dpi-box" *ngIf="selected.has_acta || selected.acta_filename">
              <div class="dpi-head">
                <span>{{ documentLabel(selected, 'acta') }}:</span>
                <strong>{{ selected.acta_filename || 'acta-notarial.pdf' }}</strong>
              </div>
              <button class="link" type="button" (click)="viewActa(selected)">Ver PDF</button>
            </div>
            <div class="dpi-box" *ngIf="selected.has_carta_representacion || selected.carta_representacion_filename">
              <div class="dpi-head">
                <span>{{ documentLabel(selected, 'carta') }}:</span>
                <strong>{{ selected.carta_representacion_filename || 'carta-representacion.pdf' }}</strong>
              </div>
              <button class="link" type="button" (click)="viewCartaRepresentacion(selected)">Ver PDF</button>
            </div>
            <div class="dpi-box" *ngIf="shouldShowRegistroMercantil(selected)">
              <div class="dpi-head">
                <span>{{ documentLabel(selected, 'registro') }}:</span>
                <strong>{{ selected.registro_mercantil_filename || 'registro-mercantil.pdf' }}</strong>
              </div>
              <button class="link" type="button" (click)="viewRegistroMercantil(selected)">Ver PDF</button>
            </div>
            <div class="dpi-box" *ngIf="selected.has_rpa_acta_nombramiento || selected.rpa_acta_nombramiento_filename">
              <div class="dpi-head">
                <span>{{ documentLabel(selected, 'rpaActaNombramiento') }}:</span>
                <strong>{{ selected.rpa_acta_nombramiento_filename || 'acta-nombramiento.pdf' }}</strong>
              </div>
              <button class="link" type="button" (click)="viewRpaActaNombramiento(selected)">Ver PDF</button>
            </div>
            <div class="dpi-box" *ngIf="selected.has_rpa_registro_representante || selected.rpa_registro_representante_filename">
              <div class="dpi-head">
                <span>{{ documentLabel(selected, 'rpaRegistroRepresentante') }}:</span>
                <strong>{{ selected.rpa_registro_representante_filename || 'registro-representante.pdf' }}</strong>
              </div>
              <button class="link" type="button" (click)="viewRpaRegistroRepresentante(selected)">Ver PDF</button>
            </div>
            <div class="dpi-box" *ngIf="selected.has_rpa_registro_entidad || selected.rpa_registro_entidad_filename">
              <div class="dpi-head">
                <span>{{ documentLabel(selected, 'rpaRegistroEntidad') }}:</span>
                <strong>{{ selected.rpa_registro_entidad_filename || 'registro-entidad.pdf' }}</strong>
              </div>
              <button class="link" type="button" (click)="viewRpaRegistroEntidad(selected)">Ver PDF</button>
            </div>
            <div class="dpi-box" *ngIf="selected.has_rpa_documento_estado || selected.rpa_documento_estado_filename">
              <div class="dpi-head">
                <span>{{ documentLabel(selected, 'rpaDocumentoEstado') }}:</span>
                <strong>{{ selected.rpa_documento_estado_filename || 'documento-estado-ong.pdf' }}</strong>
              </div>
              <button class="link" type="button" (click)="viewRpaDocumentoEstado(selected)">Ver PDF</button>
            </div>
            <div class="dpi-box" *ngIf="canShowBoletaPanel(selected)">
              <div class="dpi-head">
                <span>{{ processPdfPanelTitle(selected) }}:</span>
                <span class="muted" *ngIf="!(selected.has_analyst_pdf || selected.analyst_pdf_filename)">No adjunto</span>
              </div>
              <button class="link" type="button" *ngIf="selected.has_analyst_pdf || selected.analyst_pdf_filename" (click)="viewBoleta(selected)">Ver PDF</button>
              <label class="upload-inline" *ngIf="canUploadAnalystPdf(selected)">
                <input type="file" accept="application/pdf" [disabled]="uploadingAnalystPdf || boletaLockedForAnalyst()" (change)="onAnalystPdfSelected($event)">
                <span>{{ uploadingAnalystPdf ? analystPdfUploadingLabel(selected) : (analystPdfFile?.name || analystPdfSelectLabel(selected)) }}</span>
              </label>
              <button
                type="button"
                class="send-approver"
                *ngIf="canUploadAnalystPdf(selected)"
                (click)="uploadAnalystPdf()"
                [disabled]="uploadingAnalystPdf || !analystPdfFile || boletaLockedForAnalyst()">
                {{ uploadingAnalystPdf ? 'Cargando...' : 'Subir PDF' }}
              </button>
              <small class="muted" *ngIf="selected.analyst_pdf_filename && !analystPdfFile">
                {{ analystPdfCurrentLabel(selected) }}: {{ selected.analyst_pdf_filename }}
              </small>
              <small class="muted" *ngIf="canUploadAnalystPdf(selected) && boletaLockedForAnalyst()">
                Enviado a la siguiente etapa. Solo se habilita de nuevo si el proceso regresa a la etapa anterior.
              </small>
              <small class="muted" *ngIf="selected.analyst_pdf_uploaded_at">
                Ultima carga: {{ selected.analyst_pdf_uploaded_at | date:'short' }}
              </small>
              <small class="error-text" *ngIf="analystPdfError">{{ analystPdfError }}</small>
            </div>
            <div class="dpi-box" *ngIf="showSignedPdfPanel(selected) && (canApproveSelected() || canUploadFinalSignedPdf(selected) || selected.has_signed_pdf || selected.signed_pdf_filename)">
              <div class="dpi-head">
                <span>Documento firmado:</span>
                <span class="muted" *ngIf="!(selected.has_signed_pdf || selected.signed_pdf_filename)">No adjunto</span>
              </div>
              <button class="link" type="button" *ngIf="selected.has_signed_pdf || selected.signed_pdf_filename" (click)="viewSignedPdf(selected)">Ver PDF</button>
              <label class="upload-inline" *ngIf="(canApproveSelected() || canUploadFinalSignedPdf(selected)) && !selected?.approved_at">
                <input type="file" accept="application/pdf" [disabled]="uploadingSignedPdf" (change)="onSignedPdfSelected($event)">
                <span>{{ uploadingSignedPdf ? 'Cargando documento firmado...' : (signedPdfFile?.name || 'Seleccionar documento firmado...') }}</span>
              </label>
              <button
                type="button"
                class="send-approver"
                *ngIf="(canApproveSelected() || canUploadFinalSignedPdf(selected)) && !selected?.approved_at"
                (click)="uploadSignedPdf()"
                [disabled]="uploadingSignedPdf || !signedPdfFile">
                {{ uploadingSignedPdf ? 'Cargando...' : 'Subir PDF' }}
              </button>
              <small class="muted" *ngIf="selected.signed_pdf_filename && !signedPdfFile">
                Documento actual: {{ selected.signed_pdf_filename }}
              </small>
              <small class="muted" *ngIf="selected.signed_pdf_uploaded_at">
                Última carga: {{ selected.signed_pdf_uploaded_at | date:'short' }}
              </small>
              <small class="error-text" *ngIf="signedPdfError">{{ signedPdfError }}</small>
            </div>
          </div>
        </section>
        <div class="editor-actions">
          <button *ngIf="canEdit || canAssign" (click)="save()" [disabled]="saving">
            {{ primaryActionLabel() }}
          </button>
          <button *ngIf="canSendSelectedToEmitter() && !selected?.approved_at" class="send-approver" (click)="sendToEmitter()" [disabled]="saving || sendingToEmitter">
            {{ sendingToEmitter ? 'Enviando...' : sendToEmitterLabel(selected) }}
          </button>
          <button *ngIf="canSendSelectedToApprover() && !selected?.approved_at" class="send-approver" (click)="sendToApprover()" [disabled]="saving || sendingToApprover">
            {{ sendingToApprover ? 'Enviando...' : sendToApproverLabel(selected) }}
          </button>
          <button *ngIf="canApproveSelected() && !selected?.approved_at" class="approve" (click)="approve()" [disabled]="saving || approving || requiresSignedPdfBeforeApprove(selected)">
            {{ approving ? 'Aprobando...' : 'Marcar aprobado' }}
          </button>
          <button *ngIf="canMarkDelivered(selected)" class="deliver" (click)="markDelivered()" [disabled]="saving || delivering">
            {{ delivering ? 'Marcando...' : deliveryActionLabel(selected) }}
          </button>
          <button *ngIf="canReturnToUserSelected()" class="return" (click)="returnToUser()" [disabled]="saving || returning">
            {{ returning ? 'Devolviendo...' : 'Devolver al usuario' }}
          </button>
          <button *ngIf="canReturnToAnalyst" class="return" (click)="returnToAnalyst()" [disabled]="saving || returning">
            {{ returning ? 'Devolviendo...' : 'Devolver al analista' }}
          </button>
          <button class="secondary" (click)="cancel()" [disabled]="saving">Cancelar</button>
          <span class="status" *ngIf="status">{{ status }}</span>
        </div>
      </div>
    </section>
  `,
    styles: [`
    .review-card {
      margin-top: 20px;
      padding: 20px;
      border: 1px solid rgba(147, 197, 253, 0.55);
      background:
        radial-gradient(circle at top left, rgba(14, 165, 233, 0.08), transparent 30%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 251, 255, 0.96));
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-card);
    }
    .review-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 14px; }
    .review-head h3 { margin: 0; font-size: 24px; letter-spacing: -0.02em; }
    .review-head p { margin: 4px 0 0; color: var(--muted); font-size: 14px; }
    .filters { font-size: 14px; display: flex; align-items: center; gap: 8px; }
    .status-legend { display: flex; gap: 8px; margin: 8px 0 10px; }
    .chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); }
    .chip.ok { background: #dcfce7; border-color: #86efac; }
    .chip.warn { background: #fef9c3; border-color: #fde047; }
    .chip.bad { background: #fee2e2; border-color: #fca5a5; }
    select { margin-left: 6px; padding: 8px 12px; min-width: 220px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; }
    .process-list { display: grid; gap: 12px; max-height: 520px; overflow: auto; padding: 4px 6px 4px 0; }
    .process-card {
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid #d7e6f2;
      border-left: 5px solid #93c5fd;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
    }
    .process-card.state-assigned { border-left-color: #22c55e; background: #f3fff7; }
    .process-card.state-pending { border-left-color: #f59e0b; background: #fffdf0; }
    .process-card.state-unopened,
    .process-card.state-returned { border-left-color: #ef4444; background: #fff7f7; }
    .process-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .process-title-block { min-width: 0; }
    .process-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 16px; color: #0f2d47; }
    .process-subtitle { margin-top: 4px; color: #52657a; font-size: 13px; overflow-wrap: anywhere; }
    .registry-chip {
      display: inline-flex;
      padding: 3px 9px;
      border-radius: 999px;
      background: #e0f2fe;
      border: 1px solid #93c5fd;
      color: #075985;
      font-size: 12px;
      font-weight: 700;
    }
    .process-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .open-btn {
      border: 1px solid #0284c7;
      border-radius: 999px;
      background: #0ea5e9;
      color: #fff;
      padding: 7px 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 8px 16px rgba(14, 165, 233, 0.18);
    }
    .process-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
      padding: 10px;
      border-radius: 12px;
      background: #f8fbfe;
      border: 1px solid #e2edf6;
    }
    .process-meta span { display: grid; gap: 2px; font-size: 13px; color: #0f172a; min-width: 0; overflow-wrap: anywhere; }
    .process-meta strong { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
    .documents-row {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 10px;
      align-items: start;
      padding-top: 10px;
      border-top: 1px dashed #d7e6f2;
    }
    .documents-label { color: #18466d; font-weight: 800; font-size: 13px; }
    .empty { padding: 12px; color: var(--muted); }
    .pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border); background: #eef2ff; }
    .small { font-size: 12px; }
    .link { background: none; border: none; color: #2563eb; cursor: pointer; }
    .muted { color: var(--muted); font-size: 12px; }
    .doc-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .doc-link {
      border: 1px solid #93c5fd;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    .doc-link:hover { background: #dbeafe; }
    @media (max-width: 780px) {
      .review-head,
      .process-main { flex-direction: column; }
      .process-actions { justify-content: flex-start; }
      .documents-row { grid-template-columns: 1fr; }
      select { min-width: 0; width: 100%; }
    }
    .state-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid var(--border); }
    .state-enviado { background: #fee2e2; border-color: #fca5a5; }
    .state-recepcion { background: #fef9c3; border-color: #fde047; }
    .state-asignado { background: #dbeafe; border-color: #93c5fd; }
    .state-en-aprobacion { background: #dbeafe; border-color: #60a5fa; color: #1e3a8a; }
    .state-devuelto { background: #fee2e2; border-color: #f87171; color: #991b1b; }
    .state-devuelto-analista { background: #ffedd5; border-color: #fdba74; color: #9a3412; }
    .state-aprobado { background: #dcfce7; border-color: #86efac; }
    .state-entregado { background: #dcfce7; border-color: #10b981; color: #065f46; }
    .editor { margin-top: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: #fff; box-shadow: var(--shadow-soft); }
    .editor-state { margin: 0 0 10px; font-size: 13px; color: var(--muted); }
    .log-box { margin: 0 0 12px; padding: 10px; border: 1px solid var(--border); border-radius: 12px; background: #f7fbff; }
    .log-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .log-head h5 { margin: 0; font-size: 14px; }
    .log-head small { color: var(--muted); font-size: 12px; }
    .log-empty { font-size: 12px; color: var(--muted); }
    .log-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; max-height: 200px; overflow: auto; }
    .log-list li { border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 8px; display: grid; gap: 3px; }
    .log-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .log-time { font-size: 12px; color: var(--muted); }
    .log-role { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #334155; background: #e2e8f0; border-radius: 999px; padding: 2px 8px; }
    .log-event { display: inline-flex; width: fit-content; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); font-size: 12px; font-weight: 600; }
    .log-info { background: #dbeafe; border-color: #93c5fd; color: #1e3a8a; }
    .log-open { background: #fef9c3; border-color: #fde047; color: #854d0e; }
    .log-assigned { background: #dcfce7; border-color: #86efac; color: #166534; }
    .log-pending { background: #f3f4f6; border-color: #d1d5db; color: #374151; }
    .log-returned { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
    .log-approved { background: #dcfce7; border-color: #22c55e; color: #166534; }
    .log-neutral { background: #f8fafc; border-color: #cbd5e1; color: #334155; }
    .editor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .editor-grid label { font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
    .editor-grid input, .editor-grid select, .editor-grid textarea { padding: 7px; border: 1px solid var(--border); border-radius: 9px; }
    .aila-review-view {
      grid-column: 1 / -1;
      display: grid;
      gap: 12px;
      margin-bottom: 4px;
    }
    .aila-section {
      padding: 12px;
      border: 1px solid #d7e6f2;
      border-radius: 14px;
      background: linear-gradient(180deg, #ffffff, #f8fbff);
    }
    .aila-section-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .aila-section-title span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: #dbeafe;
      border: 1px solid #93c5fd;
      color: #1d4ed8;
      font-weight: 800;
      font-size: 13px;
    }
    .aila-section-title h5 {
      margin: 0;
      font-size: 15px;
      color: #0f2d47;
    }
    .aila-field-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }
    .aila-field-card {
      display: grid;
      gap: 4px;
      padding: 10px;
      border: 1px solid #d7e6f2;
      border-radius: 12px;
      background: #fff;
      min-width: 0;
    }
    .aila-field-card strong {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }
    .aila-field-card span {
      color: #0f172a;
      font-size: 14px;
      overflow-wrap: anywhere;
    }
    .aila-table-wrap {
      overflow-x: auto;
      border: 1px solid #d7e6f2;
      border-radius: 12px;
      background: #fff;
    }
    .aila-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 620px;
    }
    .aila-table th,
    .aila-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2edf6;
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    .aila-table th {
      background: #eff6ff;
      color: #1e3a8a;
      font-weight: 800;
    }
    .aila-table tbody tr:last-child td {
      border-bottom: none;
    }
    .aila-empty {
      padding: 12px;
      color: #64748b;
      font-size: 13px;
    }
    .checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px; margin-top: 8px; }
    .attachments-zone { margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border); }
    .attachments-zone h5 { margin: 0 0 8px; font-size: 13px; color: #234868; }
    .attachments-list { display: grid; gap: 8px; }
    .editor-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
    .send-approver { background: #dbeafe; border: 1px solid #60a5fa; color: #1e3a8a; }
    .approve { background: #dcfce7; border: 1px solid #22c55e; }
    .deliver { background: #ecfdf5; border: 1px solid #34d399; color: #065f46; }
    .return { background: #fee2e2; border: 1px solid #ef4444; color: #991b1b; }
    .secondary { background: #e5e7eb; border: 1px solid var(--border); }
    .status { font-size: 12px; color: var(--muted); }
    .dpi-box { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 10px; padding: 8px; border: 1px dashed var(--border); border-radius: 10px; background: #f8fbfe; }
    .dpi-head { display: flex; gap: 6px; align-items: center; font-size: 13px; flex: 1 1 260px; }
    .upload-inline { display: inline-flex; align-items: center; gap: 8px; border: 1px dashed #a9cce4; border-radius: 10px; padding: 7px 10px; background: #fff; cursor: pointer; }
    .upload-inline input[type="file"] { display: none; }
    .error-text { color: #b91c1c; font-size: 12px; }
    select { padding: 6px; border: 1px solid var(--border); border-radius: 6px; }
  `]
})
export class ReviewPanelComponent implements OnChanges {
  @Input() data: Submission[] = [];
  @Input() apiBase = '';
  @Output() updated = new EventEmitter<void>();
  private http = inject(HttpClient);
  private analystsService = inject(AnalystsService);
  private auth = inject(AuthService);
  private readonly maxPdfSizeBytes = 10 * 1024 * 1024;
  private readonly financialDeclaraguateProcessCodes = new Set([
    'cancelacion_matricula',
    'solvencia_aeronavegabilidad',
    'solvencia_financiera_aeronave'
  ]);

  filterFormulario = '';
  selected: Submission | null = null;
  edit: Submission | null = null;
  saving = false;
  approving = false;
  delivering = false;
  returning = false;
  sendingToEmitter = false;
  sendingToApprover = false;
  uploadingAnalystPdf = false;
  uploadingSignedPdf = false;
  status = '';
  returnReason = '';
  reviewComments = '';
  analystPdfFile: File | null = null;
  analystPdfError = '';
  signedPdfFile: File | null = null;
  signedPdfError = '';
  analysts: Analyst[] = [];
  emitters: Analyst[] = [];
  approvers: Analyst[] = [];
  logs: SubmissionLog[] = [];
  logsLoading = false;
  role = this.auth.currentUser?.role || 'user';
  readonly avsecFinancieroRole = 'avsec_financiero';
  readonly ailaRecepcionRole = 'recepcion_aila';
  readonly ailaRecepcionAvsecRole = 'recepcion_avsec';
  readonly ailaJefaturaAvsecRole = 'jefatura_avsec';
  readonly ailaJefaturaAilaRole = 'jefatura_aila';
  currentUserId = this.auth.currentUser?.id || null;
  canEdit = false;
  canApprove = this.role === 'aprobador' || this.role === this.ailaJefaturaAilaRole || this.role === 'admin' || this.role === 'supervisor';
  canSendToEmitter = this.role === 'analista' || this.role === this.ailaRecepcionAvsecRole || this.role === 'admin' || this.role === 'supervisor';
  canSendToApprover = this.role === 'emisor' || this.role === this.ailaJefaturaAvsecRole || this.role === 'admin' || this.role === 'supervisor';
  canDeliverRole = this.role === 'revisor';
  canAssign = this.role === 'revisor' || this.role === this.ailaRecepcionRole || this.role === 'admin' || this.role === 'supervisor';
  canViewLogs = this.role === 'analista' || this.role === 'emisor' || this.role === 'revisor' || this.role === 'aprobador' || this.role === this.ailaRecepcionRole || this.role === this.ailaRecepcionAvsecRole || this.role === this.ailaJefaturaAvsecRole || this.role === this.ailaJefaturaAilaRole || this.role === 'admin' || this.role === 'supervisor';
  canReturn = this.role === 'analista' || this.role === 'emisor' || this.role === this.ailaJefaturaAilaRole || this.role === 'admin' || this.role === 'supervisor';
  canReturnToAnalyst = this.role === 'aprobador';

  financialProcessFieldLabel() {
    return this.isFinancialAreaRole() ? 'Motivo de la solicitud' : 'Proceso financiero';
  }

  isFinancialAreaRole() {
    return this.role === 'revisor' || this.role === 'analista' || this.role === 'emisor' || this.role === 'aprobador' || this.role === this.avsecFinancieroRole;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['data'] || !this.selected?.id) return;
    const refreshed = this.data.find((row) => Number(row.id) === Number(this.selected?.id));
    if (!refreshed) return;

    this.selected = { ...this.selected, ...refreshed };

    if (this.edit) {
      this.edit = {
        ...this.edit,
        comentarios_revision: refreshed.comentarios_revision ?? undefined,
        assigned_analista_id: refreshed.assigned_analista_id ?? null,
        assigned_analista_name: refreshed.assigned_analista_name ?? null,
        assigned_analista_email: refreshed.assigned_analista_email ?? null,
        assigned_emisor_id: refreshed.assigned_emisor_id ?? null,
        assigned_emisor_name: refreshed.assigned_emisor_name ?? null,
        assigned_emisor_email: refreshed.assigned_emisor_email ?? null,
        assigned_aprobador_id: refreshed.assigned_aprobador_id ?? null,
        assigned_aprobador_name: refreshed.assigned_aprobador_name ?? null,
        assigned_aprobador_email: refreshed.assigned_aprobador_email ?? null,
        sent_to_emisor_at: refreshed.sent_to_emisor_at ?? null,
        sent_to_aprobador_at: refreshed.sent_to_aprobador_at ?? null,
        approved_at: refreshed.approved_at ?? null,
        delivered_at: refreshed.delivered_at ?? null
      };
    }
    this.reviewComments = refreshed.comentarios_revision || '';
  }

  private visibleRows() {
    let rows = this.data;
    if (this.role === 'analista') {
      if (!this.currentUserId) return [];
      rows = rows.filter((d) => Number(d.assigned_analista_id) === Number(this.currentUserId));
    }
    if (this.role === this.ailaRecepcionAvsecRole) {
      if (!this.currentUserId) return [];
      rows = rows.filter((d) => this.isAilaGenericFlow(d) && Number(d.assigned_analista_id) === Number(this.currentUserId));
    }
    if (this.role === 'emisor') {
      if (!this.currentUserId) return [];
      rows = rows.filter((d) => Number(d.assigned_emisor_id) === Number(this.currentUserId));
    }
    if (this.role === this.ailaJefaturaAvsecRole) {
      if (!this.currentUserId) return [];
      rows = rows.filter((d) => this.isAilaGenericFlow(d) && Number(d.assigned_emisor_id) === Number(this.currentUserId));
    }
    if (this.role === 'aprobador') {
      if (!this.currentUserId) return [];
      rows = rows.filter((d) => Number(d.assigned_aprobador_id) === Number(this.currentUserId));
    }
    if (this.role === this.ailaJefaturaAilaRole) {
      if (!this.currentUserId) return [];
      rows = rows.filter((d) => this.isAilaGenericFlow(d) && Number(d.assigned_aprobador_id) === Number(this.currentUserId));
    }
    if (this.role === this.avsecFinancieroRole) {
      rows = rows.filter((d) => this.isFinancialAvsecFlow(d) && Boolean(d.approved_at) && Boolean(d.has_signed_pdf || d.signed_pdf_filename));
    }
    return rows;
  }

  filtered() {
    const rows = this.visibleRows();
    if (!this.filterFormulario) return rows;
    return rows.filter((d) => this.formularioLabel(d) === this.filterFormulario);
  }

  formulariosDisponibles() {
    const options = new Set<string>();
    for (const row of this.visibleRows()) {
      options.add(this.formularioLabel(row));
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }

  formularioLabel(row: Submission) {
    const value = String(row.gestion_nombre || '').trim();
    if (value) {
      const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (normalized.includes('uav') || normalized.includes('rpa') || normalized.includes('distintivo') || normalized.includes('drone')) {
        return 'UAV / RPA - Distintivo';
      }
      if (normalized.includes('certific')) return 'Certificación';
      if (normalized.includes('reserva') || normalized.includes('prorroga') || normalized.includes('cesion')) {
        return 'Reserva, Prórroga o Cesión de Matrícula';
      }
      return value;
    }
    const unit = String(row.unidad_clave || '').toUpperCase();
    if (unit === 'RAN' && (row.tipo_inscripcion || row.tipo_reposicion || row.tipo_cambio_prop)) {
      return 'UAV / RPA - Distintivo';
    }
    if (row.tipo_reservacion) return 'Reserva, Prórroga o Cesión de Matrícula';
    if (row.tipo_certificacion) return 'Certificación';
    return 'Formulario General TG';
  }

  showsEmitterField(row: Submission | null) {
    if (!row) return false;
    if (this.isAilaGenericFlow(row)) return true;
    return this.isFinancialSubmission(row) && !this.isFinancialPaymentPasswordFlow(row);
  }

  isFinancialSubmission(row: Submission | null) {
    if (!row) return false;
    return String(row.unidad_clave || '').toUpperCase() === 'FINANCIERO';
  }

  isFinancialPaymentPasswordFlow(row: Submission | null | undefined) {
    if (!row || !this.isFinancialSubmission(row)) return false;
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

  isFinancialAvsecFlow(row: Submission | null | undefined) {
    if (!row || !this.isFinancialSubmission(row)) return false;
    const detail = row.detalle_formulario && typeof row.detalle_formulario === 'object'
      ? row.detalle_formulario as Record<string, unknown>
      : {};
    return String(detail['gestion_grupo_codigo'] || '').trim() === 'solvencias'
      && String(detail['proceso_codigo'] || '').trim() === 'gestion_tia';
  }

  isAilaSubmission(row: Submission | null) {
    if (!row) return false;
    return String(row.unidad_clave || '').toUpperCase() === 'AILA';
  }

  isAilaGenericFlow(row: Submission | null | undefined) {
    if (!this.isAilaSubmission(row || null)) return false;
    return this.ailaValue(row || null, 'tipo_permiso').toLowerCase() === 'generico';
  }

  isRpaExtranjeroIndividual(row: Submission | null) {
    if (!row) return false;
    const unit = String(row.unidad_clave || '').toUpperCase();
    const form = String(row.gestion_nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const isRpa = unit === 'RAN' && (
      form.includes('uav') ||
      form.includes('rpa') ||
      form.includes('drone') ||
      form.includes('distintivo')
    );
    return isRpa &&
      String(row.persona_tipo || '').toLowerCase() === 'individual' &&
      String(row.origen_compra || '').toLowerCase() === 'extranjero';
  }

  isRpaExtranjeroJuridica(row: Submission | null) {
    if (!row) return false;
    const unit = String(row.unidad_clave || '').toUpperCase();
    const form = String(row.gestion_nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const isRpa = unit === 'RAN' && (
      form.includes('uav') ||
      form.includes('rpa') ||
      form.includes('drone') ||
      form.includes('distintivo')
    );
    return isRpa &&
      String(row.persona_tipo || '').toLowerCase() === 'juridica' &&
      String(row.origen_compra || '').toLowerCase() === 'extranjero';
  }

  isRanCertificacion(row: Submission | null | undefined) {
    if (!row) return false;
    const unit = String(row.unidad_clave || '').toUpperCase();
    const gestion = String(row.gestion_nombre || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return unit === 'RAN' && gestion.includes('certific');
  }

  usesCombinedRanCertificationJuridicaDocument(row: Submission | null | undefined) {
    if (!this.isRanCertificacion(row)) return false;
    if (String(row?.persona_tipo || '').toLowerCase() !== 'juridica') return false;
    const hasActa = Boolean(row?.has_acta || row?.acta_filename);
    const hasRegistro = Boolean(row?.has_registro_mercantil || row?.registro_mercantil_filename);
    if (!hasActa || !hasRegistro) return false;
    if (!row?.acta_filename || !row?.registro_mercantil_filename) return true;
    return row.acta_filename === row.registro_mercantil_filename;
  }

  financialValue(row: Submission | null, key: string) {
    if (!row?.detalle_formulario || typeof row.detalle_formulario !== 'object') return '';
    const value = (row.detalle_formulario as Record<string, unknown>)[key];
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  financialProcessLabel(row: Submission | null) {
    if (!row) return '';
    return this.financialValue(row, 'proceso_label') || String(row.gestion_nombre || '').trim();
  }

  financialProcessCode(row: Submission | null) {
    if (!row) return '';
    return this.financialValue(row, 'proceso_codigo') || this.financialValue(row, 'gestion_codigo');
  }

  shouldShowFinancialDeclaraguates(row: Submission | null) {
    return this.financialDeclaraguateProcessCodes.has(this.financialProcessCode(row));
  }

  financialCertificadoOperativoLabel(row: Submission | null) {
    const subtype = this.financialValue(row, 'certificado_operativo_subtipo');
    if (!subtype) return '';
    if (subtype === 'certificaciones') return 'Certificaciones';
    if (subtype === 'calcomania') return 'Calcomanía de circulación';
    if (subtype === 'otros') return 'Otros';
    return subtype;
  }

  financialSelectedLanguages(row: Submission | null) {
    if (!row?.detalle_formulario || typeof row.detalle_formulario !== 'object') return '';
    const detail = row.detalle_formulario as Record<string, unknown>;
    const labels: string[] = [];
    if (detail['idioma_ingles']) labels.push('Inglés');
    if (detail['idioma_espanol']) labels.push('Español');
    return labels.join(', ');
  }

  ailaValue(row: Submission | null, key: string) {
    if (!row?.detalle_formulario || typeof row.detalle_formulario !== 'object') return '';
    const value = (row.detalle_formulario as Record<string, unknown>)[key];
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  ailaPermitLabel(row: Submission | null) {
    const value = this.ailaValue(row, 'tipo_permiso');
    if (value === 'urgente') return 'Permiso urgente';
    if (value === 'generico') return 'Permiso genérico';
    return value || String(row?.uso || '').trim();
  }

  ailaSummary(row: Submission | null, key: 'personas' | 'escoltas' | 'herramientas' | 'vehiculos') {
    if (!row?.detalle_formulario || typeof row.detalle_formulario !== 'object') return '';
    const values = (row.detalle_formulario as Record<string, unknown>)[key];
    if (!Array.isArray(values) || !values.length) return '';
    return values.map((item, index) => {
      const data = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
      const primary =
        data['nombre'] ||
        data['descripcion'] ||
        data['placa'] ||
        data['documento'] ||
        data['tipo'] ||
        '';
      return `${index + 1}. ${String(primary || 'registro').trim()}`;
    }).join(' | ');
  }

  ailaEntries(row: Submission | null, key: 'personas' | 'escoltas' | 'herramientas' | 'vehiculos') {
    if (!row?.detalle_formulario || typeof row.detalle_formulario !== 'object') return [] as Record<string, unknown>[];
    const values = (row.detalle_formulario as Record<string, unknown>)[key];
    if (!Array.isArray(values)) return [] as Record<string, unknown>[];
    return values.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  }

  displayValue(value: unknown) {
    const text = String(value ?? '').trim();
    return text || '—';
  }

  documentLabel(row: Submission | null, key: string) {
    if (this.isAilaSubmission(row)) {
      const labels: Record<string, string> = {
        dpi: 'DPI, fe de edad o pasaporte de las personas',
        acta: 'Tarjeta de Identificación Aeroportuaria',
        carta: 'Carta de solicitud de permiso',
        registro: 'Factura reciente de arrendamiento / solvencia',
        rpaRegistroRepresentante: 'Tarjeta de circulación de vehículo',
        rpaRegistroEntidad: 'Fotografías de herramienta, mercadería y/o mobiliario',
        rpaDocumentoEstado: 'Contraseña del escolta'
      };
      return labels[key] || key;
    }
    if (this.isFinancialSubmission(row)) {
      const labels: Record<string, string> = {
        dpi: 'Últimos 5 formularios de Declaraguate',
        acta: 'Factura de inspección del año en curso',
        carta: 'Carta de representación',
        registro: 'Factura de aproximación del año en curso',
        rpaActaNombramiento: 'Documentos del antiguo dueño y certificado de aeronavegabilidad',
        rpaRegistroRepresentante: 'Certificado de aeronavegabilidad actual',
        rpaRegistroEntidad: 'Solvencia del año anterior',
        rpaDocumentoEstado: 'Documento de peso máximo de despegue'
      };
      return labels[key] || key;
    }
    if (key === 'rpaDocumentoEstado' && this.isRpaExtranjeroIndividual(row)) {
      return 'Importación o DUCA con pago';
    }
    if (key === 'carta' && this.isRpaExtranjeroJuridica(row)) {
      return 'Póliza de importación o DUCA con pago';
    }
    const labels: Record<string, string> = {
      dpi: 'DPI adjunto',
      acta: this.usesCombinedRanCertificationJuridicaDocument(row)
        ? 'Acta notarial / Registro mercantil'
        : 'Acta notarial',
      carta: 'Carta de representación',
      registro: 'Registro mercantil',
      rpaActaNombramiento: 'Acta nombramiento representante legal',
      rpaRegistroRepresentante: 'Registro mercantil representante legal',
      rpaRegistroEntidad: 'Registro mercantil de la entidad',
      rpaDocumentoEstado: 'Documento entidad Estado/ONG'
    };
    return labels[key] || key;
  }

  financialDeclaraguateDocuments(row: Submission | null) {
    if (!row || !this.shouldShowFinancialDeclaraguates(row)) return [];
    return [
      { number: 1, filename: row.dpi_filename || '', has: Boolean(row.has_dpi || row.dpi_filename) },
      { number: 2, filename: row.financial_declaraguate_2_filename || '', has: Boolean(row.has_financial_declaraguate_2 || row.financial_declaraguate_2_filename) },
      { number: 3, filename: row.financial_declaraguate_3_filename || '', has: Boolean(row.has_financial_declaraguate_3 || row.financial_declaraguate_3_filename) },
      { number: 4, filename: row.financial_declaraguate_4_filename || '', has: Boolean(row.has_financial_declaraguate_4 || row.financial_declaraguate_4_filename) },
      { number: 5, filename: row.financial_declaraguate_5_filename || '', has: Boolean(row.has_financial_declaraguate_5 || row.financial_declaraguate_5_filename) }
    ];
  }

  tableReference(row: Submission) {
    if (this.isFinancialSubmission(row)) {
      return this.financialValue(row, 'matricula') ||
        this.financialValue(row, 'numero_placa') ||
        this.financialValue(row, 'nombre_taller') ||
        this.financialValue(row, 'area') ||
        row.matricula_tg ||
        'N/D';
    }
    if (this.isAilaSubmission(row)) {
      return this.ailaPermitLabel(row) ||
        this.ailaValue(row, 'area_destino') ||
        this.ailaValue(row, 'motivo') ||
        'N/D';
    }
    return row.matricula_tg || row.matricula_tg_nueva || 'N/D';
  }

  stageAssignee(row: Submission, stage: 'emisor' | 'aprobador') {
    if (this.isFinancialPaymentPasswordFlow(row)) return 'No aplica';
    if (stage === 'emisor') {
      return row.assigned_emisor_name || row.assigned_emisor_email || 'Sin asignar';
    }
    return row.assigned_aprobador_name || row.assigned_aprobador_email || 'Sin asignar';
  }

  stageLabel(row: Submission | null | undefined, stage: 'analista' | 'emisor' | 'aprobador') {
    if (this.isAilaGenericFlow(row)) {
      if (stage === 'analista') return 'Recepción AVSEC';
      if (stage === 'emisor') return 'Jefatura AVSEC';
      return 'Jefatura AILA';
    }
    if (stage === 'analista') return 'Analista';
    if (stage === 'emisor') return 'Emisor';
    return 'Aprobador';
  }

  assignStageLabel(row: Submission | null | undefined, stage: 'analista' | 'emisor' | 'aprobador' = 'analista') {
    return this.stageLabel(row, stage);
  }

  assignedStageLabel(row: Submission | null | undefined, stage: 'analista' | 'emisor' | 'aprobador') {
    return `${this.stageLabel(row, stage)} asignado`;
  }

  sendToEmitterLabel(row: Submission | null | undefined) {
    return this.isAilaGenericFlow(row) ? 'Enviar a Jefatura AVSEC' : 'Enviar a emisor';
  }

  sendToApproverLabel(row: Submission | null | undefined) {
    return this.isAilaGenericFlow(row) ? 'Enviar a Jefatura AILA' : 'Enviar a aprobador';
  }

  shouldShowRegistroMercantil(row: Submission | null | undefined) {
    if (!(row?.has_registro_mercantil || row?.registro_mercantil_filename)) return false;
    if (this.usesCombinedRanCertificationJuridicaDocument(row)) return false;
    return true;
  }

  tableDocuments(row: Submission): TableDocument[] {
    const docs: TableDocument[] = [];
    const add = (key: TableDocumentKey, label: string, hasDocument: boolean, filename?: string | null) => {
      if (!hasDocument) return;
      docs.push({ key, label, filename });
    };

    if (this.role === this.avsecFinancieroRole && this.isFinancialAvsecFlow(row)) {
      add('signed', 'Documento firmado', Boolean(row.has_signed_pdf || row.signed_pdf_filename), row.signed_pdf_filename);
      return docs;
    }

    if (this.isFinancialSubmission(row)) {
      for (const doc of this.financialDeclaraguateDocuments(row)) {
        add(`financialDeclaraguate${doc.number}` as TableDocumentKey, `Declaraguate ${doc.number}`, doc.has, doc.filename);
      }
    } else {
      add('dpi', this.documentLabel(row, 'dpi'), Boolean(row.has_dpi || row.dpi_filename), row.dpi_filename);
    }

    add('acta', this.documentLabel(row, 'acta'), Boolean(row.has_acta || row.acta_filename), row.acta_filename);
    add('carta', this.documentLabel(row, 'carta'), Boolean(row.has_carta_representacion || row.carta_representacion_filename), row.carta_representacion_filename);
    add('registro', this.documentLabel(row, 'registro'), this.shouldShowRegistroMercantil(row), row.registro_mercantil_filename);
    add('rpaActaNombramiento', this.documentLabel(row, 'rpaActaNombramiento'), Boolean(row.has_rpa_acta_nombramiento || row.rpa_acta_nombramiento_filename), row.rpa_acta_nombramiento_filename);
    add('rpaRegistroRepresentante', this.documentLabel(row, 'rpaRegistroRepresentante'), Boolean(row.has_rpa_registro_representante || row.rpa_registro_representante_filename), row.rpa_registro_representante_filename);
    add('rpaRegistroEntidad', this.documentLabel(row, 'rpaRegistroEntidad'), Boolean(row.has_rpa_registro_entidad || row.rpa_registro_entidad_filename), row.rpa_registro_entidad_filename);
    add('rpaDocumentoEstado', this.documentLabel(row, 'rpaDocumentoEstado'), Boolean(row.has_rpa_documento_estado || row.rpa_documento_estado_filename), row.rpa_documento_estado_filename);
    if (!this.isAilaGenericFlow(row)) {
      add('boleta', 'Boleta de pago', Boolean(row.has_analyst_pdf || row.analyst_pdf_filename), row.analyst_pdf_filename);
    }
    add('signed', 'Documento firmado', Boolean(row.has_signed_pdf || row.signed_pdf_filename), row.signed_pdf_filename);
    return docs;
  }

  openTableDocument(row: Submission, key: TableDocumentKey) {
    switch (key) {
      case 'dpi':
      case 'financialDeclaraguate1':
        this.viewDpi(row);
        break;
      case 'financialDeclaraguate2':
        this.viewFinancialDeclaraguate(row, 2);
        break;
      case 'financialDeclaraguate3':
        this.viewFinancialDeclaraguate(row, 3);
        break;
      case 'financialDeclaraguate4':
        this.viewFinancialDeclaraguate(row, 4);
        break;
      case 'financialDeclaraguate5':
        this.viewFinancialDeclaraguate(row, 5);
        break;
      case 'acta':
        this.viewActa(row);
        break;
      case 'carta':
        this.viewCartaRepresentacion(row);
        break;
      case 'registro':
        this.viewRegistroMercantil(row);
        break;
      case 'rpaActaNombramiento':
        this.viewRpaActaNombramiento(row);
        break;
      case 'rpaRegistroRepresentante':
        this.viewRpaRegistroRepresentante(row);
        break;
      case 'rpaRegistroEntidad':
        this.viewRpaRegistroEntidad(row);
        break;
      case 'rpaDocumentoEstado':
        this.viewRpaDocumentoEstado(row);
        break;
      case 'boleta':
        this.viewBoleta(row);
        break;
      case 'signed':
        this.viewSignedPdf(row);
        break;
    }
  }

  actorDisplay(entry: SubmissionLog) {
    const actorName = this.normalizeDisplayText(entry.actor_name);
    const actorEmail = this.normalizeDisplayText(entry.actor_email);
    if (actorName && actorEmail) return `${actorName} (${actorEmail})`;
    return actorName || actorEmail || 'Sistema';
  }

  logComment(entry: SubmissionLog): string | null {
    const raw = entry?.metadata?.comment;
    if (raw === null || raw === undefined) return null;
    const value = String(raw).trim();
    return value || null;
  }

  normalizeDisplayText(value: unknown): string {
    const text = value === null || value === undefined ? '' : String(value);
    if (!text) return '';
    if (!/[ÃÂ�]/.test(text)) return text;
    try {
      const bytes = Uint8Array.from(Array.from(text).map((char) => char.charCodeAt(0) & 0xff));
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return text;
    }
  }

  private applyAssignedAnalyst(analystId: number | null, analystName: string | null, analystEmail: string | null) {
    if (!this.selected || !this.edit) return;
    this.selected.assigned_analista_id = analystId;
    this.selected.assigned_analista_name = analystName;
    this.selected.assigned_analista_email = analystEmail;
    this.edit.assigned_analista_id = analystId;
    this.edit.assigned_analista_name = analystName;
    this.edit.assigned_analista_email = analystEmail;
  }

  logEventClass(entry: SubmissionLog) {
    switch (entry.event_code) {
      case 'usuario_envio':
      case 'usuario_reenvio':
      case 'analista_sube_pdf':
        return 'log-info';
      case 'receptor_abre':
        return 'log-open';
      case 'asignado_analista':
        return 'log-assigned';
      case 'enviado_aprobador':
        return 'log-open';
      case 'asignacion_removida':
        return 'log-pending';
      case 'devolucion_usuario':
      case 'devolucion_analista':
        return 'log-returned';
      case 'aprobacion':
      case 'entrega_usuario':
      case 'proceso_finalizado':
        return 'log-approved';
      default:
        return 'log-neutral';
    }
  }

  private loadLogs(submissionId: number) {
    this.logsLoading = true;
    this.http.get<SubmissionLog[]>(`${this.apiBase}/submissions/${submissionId}/logs`).subscribe({
      next: (rows) => {
        this.logs = rows;
        this.logsLoading = false;
      },
      error: () => {
        this.logs = [];
        this.logsLoading = false;
      }
    });
  }

  select(row: Submission) {
    this.selected = row;
    this.edit = { ...row };
    this.status = '';
    this.returnReason = row.returned_reason || '';
    this.reviewComments = row.comentarios_revision || '';
    this.analystPdfFile = null;
    this.analystPdfError = '';
    this.logs = [];
    if (this.canViewLogs && row.id) {
      this.loadLogs(row.id);
    }
    this.markAsOpened(row);
    if (this.canAssign && !this.analysts.length) {
      this.analystsService.list().subscribe({
        next: (data) => this.analysts = data,
        error: () => this.analysts = []
      });
    }
    if (this.canSendSelectedToEmitter() && !this.emitters.length) {
      this.analystsService.listEmitters().subscribe({
        next: (data) => this.emitters = data,
        error: () => this.emitters = []
      });
    }
    if (this.canSendSelectedToApprover() && !this.approvers.length) {
      this.analystsService.listApprovers().subscribe({
        next: (data) => this.approvers = data,
        error: () => this.approvers = []
      });
    }
  }

  cancel() {
    this.selected = null;
    this.edit = null;
    this.status = '';
    this.returnReason = '';
    this.reviewComments = '';
    this.analystPdfFile = null;
    this.analystPdfError = '';
    this.signedPdfFile = null;
    this.signedPdfError = '';
    this.logs = [];
    this.logsLoading = false;
  }

  save() {
    if (!this.selected || !this.edit) return;
    const submissionId = this.selected.id;
    const comentarios_revision = this.reviewComments.trim() || null;

    if (!this.canEdit && this.canAssign) {
      this.saving = true;
      this.status = 'Asignando...';
      this.http.post<{ analista_id?: number | null; assigned_analista_name?: string | null; assigned_analista_email?: string | null }>(`${this.apiBase}/submissions/${submissionId}/assign`, {
        analista_id: this.edit.assigned_analista_id || null,
        comentarios_revision
      }).subscribe({
        next: (resp) => {
          this.applyAssignedAnalyst(
            resp.analista_id ?? null,
            resp.assigned_analista_name ?? null,
            resp.assigned_analista_email ?? null
          );
          if (this.selected) this.selected.comentarios_revision = comentarios_revision ?? undefined;
          if (this.edit) this.edit.comentarios_revision = comentarios_revision ?? undefined;
          this.status = 'Analista asignado.';
          this.loadLogs(submissionId);
          this.saving = false;
          this.updated.emit();
        },
        error: () => {
          this.status = 'Error al asignar analista.';
          this.saving = false;
        }
      });
      return;
    }

    if (!this.canEdit) {
      this.status = 'Solo el usuario puede modificar datos del formulario.';
      return;
    }

    const assignChanged = this.edit.assigned_analista_id !== this.selected.assigned_analista_id;
    this.saving = true;
    this.status = 'Guardando...';
    this.http.put<Submission>(`${this.apiBase}/submissions/${submissionId}`, this.edit).subscribe({
      next: () => {
        if (this.canAssign && assignChanged) {
          this.http.post<{ analista_id?: number | null; assigned_analista_name?: string | null; assigned_analista_email?: string | null }>(`${this.apiBase}/submissions/${submissionId}/assign`, {
            analista_id: this.edit?.assigned_analista_id || null
          }).subscribe({
            next: (resp) => {
              this.applyAssignedAnalyst(
                resp.analista_id ?? null,
                resp.assigned_analista_name ?? null,
                resp.assigned_analista_email ?? null
              );
              this.status = 'Actualizado.';
              this.loadLogs(submissionId);
              this.saving = false;
              this.updated.emit();
            },
            error: () => {
              this.status = 'Se guardó, pero falló la asignación.';
              this.saving = false;
              this.updated.emit();
            }
          });
          return;
        }
        this.status = 'Actualizado.';
        this.loadLogs(submissionId);
        this.saving = false;
        this.updated.emit();
      },
      error: () => {
        this.status = 'Error al actualizar.';
        this.saving = false;
      }
    });
  }

  primaryActionLabel() {
    if (!this.canEdit && this.canAssign) return 'Asignar analista';
    return 'Guardar cambios';
  }

  private openSubmissionPdf(path: string, errorMessage: string) {
    this.http.get(path, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      error: () => {
        this.status = errorMessage;
      }
    });
  }

  viewDpi(row: Submission) {
    if (!row.id) return;
    this.openSubmissionPdf(`${this.apiBase}/submissions/${row.id}/dpi`, 'No se pudo abrir el DPI (revisa permisos o sesión).');
  }

  viewFinancialDeclaraguate(row: Submission, number: number) {
    if (!row.id) return;
    this.openSubmissionPdf(
      `${this.apiBase}/submissions/${row.id}/financial-declaraguate/${number}`,
      `No se pudo abrir el Declaraguate ${number} (revisa permisos o sesión).`
    );
  }

  viewActa(row: Submission) {
    if (!row.id) return;
    this.openSubmissionPdf(`${this.apiBase}/submissions/${row.id}/acta`, 'No se pudo abrir el Acta Notarial (revisa permisos o sesión).');
  }

  viewCartaRepresentacion(row: Submission) {
    if (!row.id) return;
    const label = this.isRpaExtranjeroJuridica(row) ? 'póliza de importación o DUCA' : 'Carta de representación';
    this.openSubmissionPdf(`${this.apiBase}/submissions/${row.id}/carta-representacion`, `No se pudo abrir ${label} (revisa permisos o sesión).`);
  }

  viewRegistroMercantil(row: Submission) {
    if (!row.id) return;
    this.openSubmissionPdf(`${this.apiBase}/submissions/${row.id}/registro-mercantil`, 'No se pudo abrir el Registro Mercantil (revisa permisos o sesión).');
  }

  viewRpaActaNombramiento(row: Submission) {
    if (!row.id) return;
    this.openSubmissionPdf(
      `${this.apiBase}/submissions/${row.id}/rpa-acta-nombramiento`,
      'No se pudo abrir el Acta de Nombramiento (revisa permisos o sesión).'
    );
  }

  viewRpaRegistroRepresentante(row: Submission) {
    if (!row.id) return;
    this.openSubmissionPdf(
      `${this.apiBase}/submissions/${row.id}/rpa-registro-representante`,
      'No se pudo abrir la certificación del representante legal (revisa permisos o sesión).'
    );
  }

  viewRpaRegistroEntidad(row: Submission) {
    if (!row.id) return;
    this.openSubmissionPdf(
      `${this.apiBase}/submissions/${row.id}/rpa-registro-entidad`,
      'No se pudo abrir la certificación de la entidad (revisa permisos o sesión).'
    );
  }

  viewRpaDocumentoEstado(row: Submission) {
    if (!row.id) return;
    this.openSubmissionPdf(
      `${this.apiBase}/submissions/${row.id}/rpa-documento-estado`,
      this.isRpaExtranjeroIndividual(row)
        ? 'No se pudo abrir el documento de importación o DUCA (revisa permisos o sesión).'
        : 'No se pudo abrir el documento de entidad del Estado/ONG (revisa permisos o sesión).'
    );
  }

  viewBoleta(row: Submission) {
    if (!row.id) return;
    this.openSubmissionPdf(`${this.apiBase}/submissions/${row.id}/boleta`, 'No se pudo abrir la boleta de pago (revisa permisos o sesión).');
  }

  viewSignedPdf(row: Submission) {
    if (!row.id) return;
    this.openSubmissionPdf(`${this.apiBase}/submissions/${row.id}/documento-firmado`, 'No se pudo abrir el documento firmado (revisa permisos o sesión).');
  }

  canSendSelectedToEmitter() {
    if (this.isAilaGenericFlow(this.selected)) {
      if (!this.selected) return false;
      if (this.role === 'admin' || this.role === 'supervisor') return true;
      return this.role === this.ailaRecepcionAvsecRole && Number(this.selected.assigned_analista_id) === Number(this.currentUserId);
    }
    return this.canSendToEmitter && this.isFinancialSubmission(this.selected) && !this.isFinancialPaymentPasswordFlow(this.selected);
  }

  canWriteReceptionComments(row: Submission | null | undefined) {
    if (!row || !this.isAilaGenericFlow(row)) return false;
    return this.role === this.ailaRecepcionRole || this.role === this.ailaRecepcionAvsecRole || this.role === 'admin' || this.role === 'supervisor';
  }

  canReturnToUserSelected() {
    if (!this.canReturn) return false;
    if (this.role === 'emisor' && this.isFinancialSubmission(this.selected)) return false;
    return true;
  }

  canSendSelectedToApprover() {
    if (!this.selected || this.isFinancialPaymentPasswordFlow(this.selected)) return false;
    if (this.role === 'admin' || this.role === 'supervisor') return true;
    if (this.isAilaGenericFlow(this.selected)) {
      return this.role === this.ailaJefaturaAvsecRole && Number(this.selected.assigned_emisor_id) === Number(this.currentUserId);
    }
    if (this.isFinancialSubmission(this.selected)) {
      if (this.isFinancialAwaitingFinalSignedPdf(this.selected)) return false;
      return this.role === 'emisor';
    }
    if (this.role !== 'analista') return false;
    return Number(this.selected.assigned_analista_id) === Number(this.currentUserId);
  }

  approversForSelected() {
    const unit = String(this.selected?.unidad_clave || 'GENERAL').toUpperCase();
    return this.approvers.filter((approver) => {
      const units = (approver.unit_access || []).map((item) => String(item || '').toUpperCase());
      return units.includes(unit);
    });
  }

  emittersForSelected() {
    const unit = String(this.selected?.unidad_clave || 'GENERAL').toUpperCase();
    return this.emitters.filter((emitter) => {
      const units = (emitter.unit_access || []).map((item) => String(item || '').toUpperCase());
      return units.includes(unit);
    });
  }

  canApproveSelected() {
    return this.canApprove && !this.isFinancialPaymentPasswordFlow(this.selected);
  }

  isFinancialApproverView(row: Submission | null | undefined) {
    return Boolean(
      row &&
      this.isFinancialSubmission(row) &&
      this.role === 'aprobador'
    );
  }

  isFinancialAwaitingFinalSignedPdf(row: Submission | null | undefined) {
    return Boolean(
      row &&
      this.isFinancialSubmission(row) &&
      !this.isFinancialPaymentPasswordFlow(row) &&
      !row.approved_at &&
      row.approved_by_user_id &&
      !row.assigned_aprobador_id &&
      !row.sent_to_aprobador_at
    );
  }

  canUploadFinalSignedPdf(row: Submission | null | undefined) {
    if (!row?.id || row.approved_at || row.delivered_at) return false;
    if (!this.isFinancialAwaitingFinalSignedPdf(row)) return false;
    if (this.role === 'admin' || this.role === 'supervisor') return true;
    return this.role === 'emisor' && Number(row.assigned_emisor_id) === Number(this.currentUserId);
  }

  showSignedPdfPanel(row: Submission | null | undefined) {
    if (!row?.id) return false;
    if (this.isAilaGenericFlow(row)) return false;
    if (this.isFinancialApproverView(row)) return false;
    return String(row.unidad_clave || '').toUpperCase() !== 'RAN';
  }

  canUploadAnalystPdf(row: Submission | null | undefined) {
    if (!row?.id) return false;
    if (this.isAilaGenericFlow(row)) return false;
    if (row.approved_at || row.delivered_at) return false;
    if (this.isFinancialSubmission(row)) {
      if (this.isFinancialPaymentPasswordFlow(row)) {
        if (!(this.role === 'analista' || this.role === 'admin' || this.role === 'supervisor')) return false;
        if (this.role === 'analista' && Number(row.assigned_analista_id) !== Number(this.currentUserId)) return false;
        return true;
      }
      if (!(this.role === 'emisor' || this.role === 'admin' || this.role === 'supervisor')) return false;
      if (this.role === 'emisor' && Number(row.assigned_emisor_id) !== Number(this.currentUserId)) return false;
      return true;
    }
    if (!(this.role === 'analista' || this.role === 'admin' || this.role === 'supervisor')) return false;
    if (this.role === 'analista' && Number(row.assigned_analista_id) !== Number(this.currentUserId)) return false;
    return true;
  }

  canShowBoletaPanel(row: Submission | null | undefined) {
    if (this.isAilaGenericFlow(row || null)) {
      return false;
    }
    if (this.isFinancialSubmission(row || null)) {
      return Boolean(
        row?.id &&
        (this.canUploadAnalystPdf(row) ||
          this.canSendSelectedToApprover() ||
          this.canApproveSelected() ||
          row.has_analyst_pdf ||
          row.analyst_pdf_filename)
      );
    }
    return Boolean(
      row?.id &&
      (this.canUploadAnalystPdf(row) ||
        this.canSendSelectedToEmitter() ||
        this.canSendSelectedToApprover() ||
        this.canApproveSelected() ||
        row.has_analyst_pdf ||
        row.analyst_pdf_filename)
    );
  }

  processPdfPanelTitle(row: Submission | null | undefined) {
    if (this.isFinancialPaymentPasswordFlow(row || null)) {
      return 'Boleta de pago (este proceso)';
    }
    return this.isFinancialSubmission(row || null)
      ? 'Documento PDF del proceso'
      : 'Boleta de pago (este proceso)';
  }

  boletaLockedForAnalyst() {
    if (!this.selected) return false;
    if (this.isFinancialSubmission(this.selected)) {
      if (this.isFinancialPaymentPasswordFlow(this.selected)) {
        return Boolean(this.selected.delivered_at);
      }
      return Boolean(
        this.selected.delivered_at ||
        this.selected.approved_at ||
        this.selected.sent_to_aprobador_at ||
        this.selected.assigned_aprobador_id
      );
    }
    return Boolean(
      this.selected.delivered_at ||
      this.selected.sent_to_emisor_at ||
      this.selected.assigned_emisor_id ||
      this.selected.sent_to_aprobador_at ||
      this.selected.assigned_aprobador_id
    );
  }

  analystPdfSelectLabel(row: Submission | null | undefined) {
    if (this.isFinancialPaymentPasswordFlow(row || null)) return 'Seleccionar boleta de pago...';
    if (this.isFinancialSubmission(row || null)) return 'Seleccionar documento PDF...';
    return 'Seleccionar boleta de pago...';
  }

  analystPdfUploadingLabel(row: Submission | null | undefined) {
    if (this.isFinancialPaymentPasswordFlow(row || null)) return 'Cargando boleta de pago...';
    if (this.isFinancialSubmission(row || null)) return 'Cargando documento PDF...';
    return 'Cargando boleta de pago...';
  }

  analystPdfCurrentLabel(row: Submission | null | undefined) {
    if (this.isFinancialPaymentPasswordFlow(row || null)) return 'Boleta actual';
    if (this.isFinancialSubmission(row || null)) return 'Documento actual';
    return 'Boleta actual';
  }

  onAnalystPdfSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    if (this.uploadingAnalystPdf) {
      if (input) input.value = '';
      return;
    }
    if (this.boletaLockedForAnalyst()) {
      if (input) input.value = '';
      this.analystPdfError = 'No puedes modificar la boleta después de enviarla a la siguiente etapa.';
      return;
    }
    this.analystPdfFile = null;
    this.analystPdfError = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.analystPdfError = 'El archivo debe ser PDF.';
      if (input) input.value = '';
      return;
    }
    if (file.size > this.maxPdfSizeBytes) {
      this.analystPdfError = 'El PDF no puede superar los 10 MB.';
      if (input) input.value = '';
      return;
    }
    this.analystPdfFile = file;
    if (input) input.value = '';
  }

  uploadAnalystPdf(selectedFile?: File) {
    if (!this.selected?.id || !this.canUploadAnalystPdf(this.selected)) return;
    if (this.boletaLockedForAnalyst()) {
      this.analystPdfError = 'No puedes modificar la boleta después de enviarla a la siguiente etapa.';
      return;
    }
    const file = selectedFile || this.analystPdfFile;
    if (!file) {
      this.analystPdfError = 'Selecciona un PDF.';
      return;
    }

    this.uploadingAnalystPdf = true;
    this.analystPdfError = '';
    this.status = this.isFinancialPaymentPasswordFlow(this.selected)
      ? 'Cargando boleta de pago...'
      : this.isFinancialSubmission(this.selected)
      ? 'Cargando documento PDF...'
      : 'Cargando boleta de pago...';
    this.readFileAsBase64(file).then((pdfBase64) => {
      this.http.post<{
        analyst_pdf_filename?: string | null;
        analyst_pdf_mime?: string | null;
        analyst_pdf_uploaded_at?: string | null;
        analyst_pdf_uploaded_by_user_id?: number | null;
      }>(`${this.apiBase}/submissions/${this.selected?.id}/analyst-pdf`, {
        pdf_base64: pdfBase64,
        filename: file.name || 'boleta-pago.pdf',
        mime: file.type || 'application/pdf'
      }).subscribe({
        next: (resp) => {
          if (this.selected) {
            this.selected.has_analyst_pdf = true;
            this.selected.analyst_pdf_filename = resp.analyst_pdf_filename || file.name || null;
            this.selected.analyst_pdf_mime = resp.analyst_pdf_mime || 'application/pdf';
            this.selected.analyst_pdf_uploaded_at = resp.analyst_pdf_uploaded_at || new Date().toISOString();
            this.selected.analyst_pdf_uploaded_by_user_id = resp.analyst_pdf_uploaded_by_user_id || null;
          }
          if (this.edit) {
            this.edit.has_analyst_pdf = true;
            this.edit.analyst_pdf_filename = this.selected?.analyst_pdf_filename || null;
            this.edit.analyst_pdf_mime = this.selected?.analyst_pdf_mime || null;
            this.edit.analyst_pdf_uploaded_at = this.selected?.analyst_pdf_uploaded_at || null;
            this.edit.analyst_pdf_uploaded_by_user_id = this.selected?.analyst_pdf_uploaded_by_user_id || null;
          }
          this.status = this.isFinancialSubmission(this.selected)
            ? (this.isFinancialPaymentPasswordFlow(this.selected)
              ? 'Boleta de pago cargada. El usuario ya puede descargarla y acercarse a realizar el pago correspondiente para recoger el documento solicitado.'
              : 'Documento PDF cargado correctamente.')
            : (this.isFinancialPaymentPasswordFlow(this.selected)
              ? 'Boleta de pago cargada. El usuario ya puede descargarla.'
              : 'Boleta de pago cargada. Se mostrará al usuario cuando el proceso esté aprobado.');
          this.analystPdfFile = null;
          this.uploadingAnalystPdf = false;
          if (this.selected?.id) {
            this.loadLogs(this.selected.id);
          }
          this.updated.emit();
        },
        error: (err) => {
          const backendError = String(err?.error?.error || '').trim();
          this.status = backendError || (
            this.isFinancialPaymentPasswordFlow(this.selected)
              ? 'No se pudo cargar la boleta de pago.'
              : this.isFinancialSubmission(this.selected)
              ? 'No se pudo cargar el documento PDF.'
              : 'No se pudo cargar la boleta de pago.'
          );
          this.analystPdfError = backendError;
          this.uploadingAnalystPdf = false;
        }
      });
    }).catch(() => {
      this.uploadingAnalystPdf = false;
      this.status = this.isFinancialPaymentPasswordFlow(this.selected)
        ? 'No se pudo leer la boleta de pago.'
        : this.isFinancialSubmission(this.selected)
        ? 'No se pudo leer el documento PDF.'
        : 'No se pudo leer la boleta de pago.';
    });
  }

  onSignedPdfSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    this.signedPdfFile = null;
    this.signedPdfError = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.signedPdfError = 'El archivo debe ser PDF.';
      if (input) input.value = '';
      return;
    }
    if (file.size > this.maxPdfSizeBytes) {
      this.signedPdfError = 'El PDF no puede superar los 10 MB.';
      if (input) input.value = '';
      return;
    }
    this.signedPdfFile = file;
    if (input) input.value = '';
  }

  uploadSignedPdf() {
    if (!this.selected?.id || (!this.canApproveSelected() && !this.canUploadFinalSignedPdf(this.selected)) || !this.signedPdfFile) return;
    this.uploadingSignedPdf = true;
    this.signedPdfError = '';
    this.status = 'Cargando documento firmado...';
    this.readFileAsBase64(this.signedPdfFile).then((pdfBase64) => {
      this.http.post<{
        signed_pdf_filename?: string | null;
        signed_pdf_mime?: string | null;
        signed_pdf_uploaded_at?: string | null;
        approved_at?: string | null;
      }>(`${this.apiBase}/submissions/${this.selected?.id}/signed-pdf`, {
        pdf_base64: pdfBase64,
        filename: this.signedPdfFile?.name || 'documento-firmado.pdf',
        mime: this.signedPdfFile?.type || 'application/pdf'
      }).subscribe({
        next: (resp) => {
          if (this.selected) {
            this.selected.has_signed_pdf = true;
            this.selected.signed_pdf_filename = resp.signed_pdf_filename || this.signedPdfFile?.name || null;
            this.selected.signed_pdf_mime = resp.signed_pdf_mime || 'application/pdf';
            this.selected.signed_pdf_uploaded_at = resp.signed_pdf_uploaded_at || new Date().toISOString();
            this.selected.approved_at = resp.approved_at ?? this.selected.approved_at ?? null;
          }
          if (this.edit) {
            this.edit.has_signed_pdf = this.selected?.has_signed_pdf || true;
            this.edit.signed_pdf_filename = this.selected?.signed_pdf_filename || null;
            this.edit.signed_pdf_mime = this.selected?.signed_pdf_mime || null;
            this.edit.signed_pdf_uploaded_at = this.selected?.signed_pdf_uploaded_at || null;
            this.edit.approved_at = resp.approved_at ?? this.edit.approved_at ?? null;
          }
          this.status = 'Documento firmado cargado.';
          this.signedPdfFile = null;
          this.uploadingSignedPdf = false;
          if (this.selected?.id) {
            this.loadLogs(this.selected.id);
          }
          this.updated.emit();
        },
        error: () => {
          this.status = 'No se pudo cargar el documento firmado.';
          this.uploadingSignedPdf = false;
        }
      });
    }).catch(() => {
      this.uploadingSignedPdf = false;
      this.status = 'No se pudo leer el documento firmado.';
    });
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result || '');
        const base64 = data.split(',')[1] || '';
        if (!base64) return reject(new Error('base64-empty'));
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('read-error'));
      reader.readAsDataURL(file);
    });
  }

  statusClass(row: Submission) {
    if (this.role !== 'revisor') return '';
    if (row.returned_at) return 'state-returned';
    if (row.assigned_analista_id) return 'state-assigned';
    if (!row.receptor_opened_at) return 'state-unopened';
    return 'state-pending';
  }

  stateLabel(row: Submission) {
    if (row.returned_at) return 'Devuelto';
    if (row.returned_to_analista_at) return 'Devuelto a analista';
    if (this.isFinancialPaymentPasswordFlow(row) && row.delivered_at) return 'Finalizado';
    if (row.delivered_at) return 'Entregado';
    if (this.isFinancialPaymentPasswordFlow(row) && (row.has_analyst_pdf || row.analyst_pdf_filename)) return 'Boleta disponible';
    if (row.approved_at) return 'Aprobado';
    if (row.assigned_aprobador_id || row.sent_to_aprobador_at) return 'En aprobación';
    if (row.assigned_emisor_id || row.sent_to_emisor_at) return 'En emisor';
    if (row.assigned_analista_id) return 'Asignado';
    if (row.receptor_opened_at) return 'Recibido';
    return 'Enviado';
  }

  stateClass(row: Submission) {
    if (row.returned_at) return 'state-devuelto';
    if (row.returned_to_analista_at) return 'state-devuelto-analista';
    if (this.isFinancialPaymentPasswordFlow(row) && row.delivered_at) return 'state-entregado';
    if (row.delivered_at) return 'state-entregado';
    if (this.isFinancialPaymentPasswordFlow(row) && (row.has_analyst_pdf || row.analyst_pdf_filename)) return 'state-en-aprobacion';
    if (row.approved_at) return 'state-aprobado';
    if (row.assigned_aprobador_id || row.sent_to_aprobador_at) return 'state-en-aprobacion';
    if (row.assigned_emisor_id || row.sent_to_emisor_at) return 'state-asignado';
    if (row.assigned_analista_id) return 'state-asignado';
    if (row.receptor_opened_at) return 'state-recepcion';
    return 'state-enviado';
  }

  private markAsOpened(row: Submission) {
    if (this.role !== 'revisor' || !row.id || row.receptor_opened_at) return;
    this.http.post<{ receptor_opened_at: string }>(`${this.apiBase}/submissions/${row.id}/open`, {}).subscribe({
      next: (resp) => {
        row.receptor_opened_at = resp.receptor_opened_at;
        if (this.edit?.id === row.id) {
          this.edit.receptor_opened_at = resp.receptor_opened_at;
        }
        if (this.selected?.id === row.id) {
          this.loadLogs(row.id);
        }
      }
    });
  }

  sendToEmitter() {
    if (!this.selected || !this.selected.id || !this.canSendSelectedToEmitter()) return;
    this.sendingToEmitter = true;
    this.status = 'Enviando a emisor...';
    this.http.post<{ assigned_emisor_id: number; sent_to_emisor_at: string; assigned_emisor_name?: string | null; assigned_emisor_email?: string | null }>(
      `${this.apiBase}/submissions/${this.selected.id}/send-to-emisor`,
      {
        emisor_id: this.edit?.assigned_emisor_id || null,
        comentarios_revision: this.reviewComments.trim() || null
      }
    ).subscribe({
      next: (resp) => {
        if (this.selected) {
          this.selected.assigned_emisor_id = resp.assigned_emisor_id;
          this.selected.sent_to_emisor_at = resp.sent_to_emisor_at;
          this.selected.assigned_emisor_name = resp.assigned_emisor_name || null;
          this.selected.assigned_emisor_email = resp.assigned_emisor_email || null;
          this.selected.returned_to_analista_at = null;
          this.selected.returned_to_analista_reason = null;
          this.selected.comentarios_revision = this.reviewComments.trim() || undefined;
        }
        if (this.edit) {
          this.edit.assigned_emisor_id = resp.assigned_emisor_id;
          this.edit.sent_to_emisor_at = resp.sent_to_emisor_at;
          this.edit.assigned_emisor_name = resp.assigned_emisor_name || null;
          this.edit.assigned_emisor_email = resp.assigned_emisor_email || null;
          this.edit.returned_to_analista_at = null;
          this.edit.returned_to_analista_reason = null;
          this.edit.comentarios_revision = this.reviewComments.trim() || undefined;
        }
        this.sendingToEmitter = false;
        this.status = 'Formulario enviado al emisor.';
        if (this.selected?.id) {
          this.loadLogs(this.selected.id);
        }
        this.updated.emit();
      },
      error: (err) => {
        this.sendingToEmitter = false;
        this.status = err?.error?.error || 'No se pudo enviar al emisor.';
      }
    });
  }

  sendToApprover() {
    if (!this.selected || !this.selected.id || !this.canSendSelectedToApprover()) return;
    this.sendingToApprover = true;
    this.status = 'Enviando a aprobador...';
    this.http.post<{ assigned_aprobador_id: number; sent_to_aprobador_at: string; assigned_aprobador_name?: string | null; assigned_aprobador_email?: string | null }>(
      `${this.apiBase}/submissions/${this.selected.id}/send-to-approver`,
      { aprobador_id: this.edit?.assigned_aprobador_id || null }
    ).subscribe({
      next: (resp) => {
        if (this.selected) {
          this.selected.assigned_aprobador_id = resp.assigned_aprobador_id;
          this.selected.sent_to_aprobador_at = resp.sent_to_aprobador_at;
          this.selected.assigned_aprobador_name = resp.assigned_aprobador_name || null;
          this.selected.assigned_aprobador_email = resp.assigned_aprobador_email || null;
          this.selected.returned_to_analista_at = null;
          this.selected.returned_to_analista_reason = null;
        }
        if (this.edit) {
          this.edit.assigned_aprobador_id = resp.assigned_aprobador_id;
          this.edit.sent_to_aprobador_at = resp.sent_to_aprobador_at;
          this.edit.assigned_aprobador_name = resp.assigned_aprobador_name || null;
          this.edit.assigned_aprobador_email = resp.assigned_aprobador_email || null;
          this.edit.returned_to_analista_at = null;
          this.edit.returned_to_analista_reason = null;
        }
        this.sendingToApprover = false;
        this.status = 'Formulario enviado al aprobador.';
        if (this.selected?.id) {
          this.loadLogs(this.selected.id);
        }
        this.updated.emit();
      },
      error: (err) => {
        this.sendingToApprover = false;
        this.status = err?.error?.error || 'No se pudo enviar al aprobador.';
      }
    });
  }

  approve() {
    if (!this.selected || !this.selected.id || !this.canApproveSelected()) return;
    this.approving = true;
    this.status = 'Aprobando...';
    this.http.post<{
      approved_at: string | null;
      approved_by_user_id?: number | null;
      assigned_aprobador_id?: number | null;
      assigned_aprobador_name?: string | null;
      assigned_aprobador_email?: string | null;
      sent_to_aprobador_at?: string | null;
    }>(`${this.apiBase}/submissions/${this.selected.id}/approve`, {}).subscribe({
      next: (resp) => {
        if (this.selected) {
          this.selected.approved_at = resp.approved_at;
          this.selected.approved_by_user_id = resp.approved_by_user_id ?? this.selected.approved_by_user_id ?? null;
          this.selected.assigned_aprobador_id = resp.assigned_aprobador_id ?? null;
          this.selected.assigned_aprobador_name = resp.assigned_aprobador_name ?? null;
          this.selected.assigned_aprobador_email = resp.assigned_aprobador_email ?? null;
          this.selected.sent_to_aprobador_at = resp.sent_to_aprobador_at ?? null;
          this.selected.delivered_at = null;
          this.selected.returned_at = null;
          this.selected.returned_reason = null;
        }
        if (this.edit) {
          this.edit.approved_at = resp.approved_at;
          this.edit.approved_by_user_id = resp.approved_by_user_id ?? this.edit.approved_by_user_id ?? null;
          this.edit.assigned_aprobador_id = resp.assigned_aprobador_id ?? null;
          this.edit.assigned_aprobador_name = resp.assigned_aprobador_name ?? null;
          this.edit.assigned_aprobador_email = resp.assigned_aprobador_email ?? null;
          this.edit.sent_to_aprobador_at = resp.sent_to_aprobador_at ?? null;
          this.edit.delivered_at = null;
          this.edit.returned_at = null;
          this.edit.returned_reason = null;
        }
        this.returnReason = '';
        this.approving = false;
        this.status = this.isFinancialSubmission(this.selected) && !this.isFinancialPaymentPasswordFlow(this.selected)
          ? 'Formulario aprobado y devuelto al emisor.'
          : 'Formulario aprobado.';
        if (this.selected?.id) {
          this.loadLogs(this.selected.id);
        }
        this.updated.emit();
      },
      error: (err) => {
        this.approving = false;
        this.status = err?.error?.error || 'No se pudo aprobar.';
      }
    });
  }

  returnToUser() {
    if (!this.selected || !this.selected.id || !this.canReturnToUserSelected()) return;
    const reason = this.returnReason.trim();
    if (!reason) {
      this.status = 'Debes indicar el motivo de devolución.';
      return;
    }
    this.returning = true;
    this.status = 'Devolviendo...';
    this.http.post<{ returned_at: string; returned_reason: string }>(
      `${this.apiBase}/submissions/${this.selected.id}/return`,
      { reason }
    ).subscribe({
      next: (resp) => {
        if (this.selected) {
          this.selected.returned_at = resp.returned_at;
          this.selected.returned_reason = resp.returned_reason;
          this.selected.approved_at = null;
          this.selected.delivered_at = null;
          this.selected.has_analyst_pdf = false;
          this.selected.analyst_pdf_filename = null;
          this.selected.has_signed_pdf = false;
          this.selected.signed_pdf_filename = null;
          this.selected.assigned_emisor_id = null;
          this.selected.sent_to_emisor_at = null;
          this.selected.assigned_aprobador_id = null;
          this.selected.sent_to_aprobador_at = null;
        }
        if (this.edit) {
          this.edit.returned_at = resp.returned_at;
          this.edit.returned_reason = resp.returned_reason;
          this.edit.approved_at = null;
          this.edit.delivered_at = null;
          this.edit.has_analyst_pdf = false;
          this.edit.analyst_pdf_filename = null;
          this.edit.has_signed_pdf = false;
          this.edit.signed_pdf_filename = null;
          this.edit.assigned_emisor_id = null;
          this.edit.sent_to_emisor_at = null;
          this.edit.assigned_aprobador_id = null;
          this.edit.sent_to_aprobador_at = null;
        }
        this.returning = false;
        this.status = 'Formulario devuelto al usuario.';
        if (this.selected?.id) {
          this.loadLogs(this.selected.id);
        }
        this.updated.emit();
      },
      error: () => {
        this.returning = false;
        this.status = 'No se pudo devolver el formulario.';
      }
    });
  }

  returnToAnalyst() {
    if (!this.selected || !this.selected.id || !this.canReturnToAnalyst) return;
    const reason = this.returnReason.trim();
    if (!reason) {
      this.status = 'Debes indicar el motivo de devolución al analista.';
      return;
    }
    this.returning = true;
    this.status = 'Devolviendo al analista...';
    this.http.post<{ returned_to_analista_at: string; returned_to_analista_reason: string }>(
      `${this.apiBase}/submissions/${this.selected.id}/return-to-analyst`,
      { reason }
    ).subscribe({
      next: (resp) => {
        if (this.selected) {
          this.selected.returned_to_analista_at = resp.returned_to_analista_at;
          this.selected.returned_to_analista_reason = resp.returned_to_analista_reason;
          this.selected.assigned_emisor_id = null;
          this.selected.sent_to_emisor_at = null;
          this.selected.sent_to_aprobador_at = null;
          this.selected.assigned_aprobador_id = null;
          this.selected.has_signed_pdf = false;
          this.selected.signed_pdf_filename = null;
          this.selected.approved_at = null;
          this.selected.delivered_at = null;
        }
        if (this.edit) {
          this.edit.returned_to_analista_at = resp.returned_to_analista_at;
          this.edit.returned_to_analista_reason = resp.returned_to_analista_reason;
          this.edit.assigned_emisor_id = null;
          this.edit.sent_to_emisor_at = null;
          this.edit.sent_to_aprobador_at = null;
          this.edit.assigned_aprobador_id = null;
          this.edit.has_signed_pdf = false;
          this.edit.signed_pdf_filename = null;
          this.edit.approved_at = null;
          this.edit.delivered_at = null;
        }
        this.returning = false;
        this.status = 'Formulario devuelto al analista.';
        this.returnReason = '';
        if (this.selected?.id) {
          this.loadLogs(this.selected.id);
        }
        this.updated.emit();
      },
      error: () => {
        this.returning = false;
        this.status = 'No se pudo devolver el formulario al analista.';
      }
    });
  }

  canMarkDelivered(row: Submission | null | undefined) {
    if (!this.canDeliverRole || !row?.id) return false;
    const unit = String(row.unidad_clave || '').toUpperCase();
    if (unit === 'RAN') return Boolean(row.approved_at) && !row.delivered_at;
    if (unit === 'FINANCIERO') {
      if (this.isFinancialPaymentPasswordFlow(row)) {
        return Boolean(row.has_analyst_pdf || row.analyst_pdf_filename) && !row.delivered_at;
      }
      return Boolean(row.approved_at) && !row.delivered_at;
    }
    return false;
  }

  deliveryActionLabel(row: Submission | null | undefined) {
    return this.isFinancialSubmission(row || null) ? 'Marcar finalizado' : 'Marcar entregado';
  }

  requiresSignedPdfBeforeApprove(row: Submission | null | undefined) {
    if (!row?.id) return false;
    const unit = String(row.unidad_clave || '').toUpperCase();
    if (unit !== 'FINANCIERO') return false;
    return false;
  }

  markDelivered() {
    if (!this.selected?.id || !this.canMarkDelivered(this.selected)) return;
    this.delivering = true;
    const isFinancial = this.isFinancialSubmission(this.selected);
    this.status = isFinancial ? 'Marcando finalización...' : 'Marcando entrega...';
    this.http.post<{ delivered_at: string }>(`${this.apiBase}/submissions/${this.selected.id}/deliver`, {}).subscribe({
      next: (resp) => {
        if (this.selected) {
          this.selected.delivered_at = resp.delivered_at;
        }
        if (this.edit) {
          this.edit.delivered_at = resp.delivered_at;
        }
        this.delivering = false;
        this.status = isFinancial ? 'Proceso marcado como finalizado.' : 'Proceso marcado como entregado al usuario.';
        if (this.selected?.id) {
          this.loadLogs(this.selected.id);
        }
        this.updated.emit();
      },
      error: (err) => {
        this.delivering = false;
        this.status = err?.error?.error || 'No se pudo marcar la entrega.';
      }
    });
  }
}

