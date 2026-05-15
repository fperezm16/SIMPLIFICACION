const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const puppeteer = require("puppeteer-core");
const { pool, init } = require("./db");
const { validateEmailAddress } = require("./email-validator");
const { sendAlertEmail } = require("./mailer");
const { notifyAssignee, notifyUserStatus } = require("../services/emailNotificationService");
const { authRouter, requireAuth, requireRole } = require("./auth");
require("dotenv").config();
//Modulo de pagos
const paymentRoutes = require('../routes/paymentRoutes');
const app = express();
const PORT = process.env.PORT || 4000;
const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
const AILA_ROLE_RECEPCION = "recepcion_aila";
const AILA_ROLE_RECEPCION_AVSEC = "recepcion_avsec";
const AILA_ROLE_ADMINISTRACION = "administracion_aila";
const AILA_ROLE_UETIA = "uetia";
const AILA_ROLE_JEFATURA = "jefatura_avsec";
const AILA_ROLE_JEFATURA_AILA = "jefatura_aila";
const FINANCIAL_ROLE_AVSEC = "avsec_financiero";
const AILA_WORKFLOW_ROLES = [
  AILA_ROLE_RECEPCION,
  AILA_ROLE_RECEPCION_AVSEC,
  AILA_ROLE_ADMINISTRACION,
  AILA_ROLE_UETIA,
  AILA_ROLE_JEFATURA,
  AILA_ROLE_JEFATURA_AILA
];
const REVIEW_ROLES = [
  "revisor",
  "analista",
  "emisor",
  "aprobador",
  "admin",
  "supervisor",
  ...AILA_WORKFLOW_ROLES,
  FINANCIAL_ROLE_AVSEC
];
const ALLOWED_ROLES = ["user", ...REVIEW_ROLES];
const ALL_UNITS = ["GENERAL", "RAN", "DVSO", "AILA", "FINANCIERO"];
const UNIT_RESTRICTED_ROLES = ["revisor", "analista", "emisor", "aprobador", ...AILA_WORKFLOW_ROLES, FINANCIAL_ROLE_AVSEC];

function isDevelopmentEnvironment() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production";
}

function getAllowedCorsOrigins() {
  const rawOrigins =
    process.env.CORS_ORIGIN ||
    process.env.FRONTEND_BASE_URL ||
    "http://localhost:3000,http://localhost:4200";

  return String(rawOrigins)
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const allowedCorsOrigins = getAllowedCorsOrigins();

function isCorsOriginAllowed(origin) {
  if (!origin) return true;
  const normalizedOrigin = String(origin).trim().replace(/\/+$/, "");
  if (
    isDevelopmentEnvironment() &&
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(normalizedOrigin)
  ) {
    return true;
  }
  return allowedCorsOrigins.includes(normalizedOrigin);
}

function normalizeUnitAccess(unitAccess) {
  if (!Array.isArray(unitAccess)) return [...ALL_UNITS];
  const allowed = new Set(ALL_UNITS);
  const normalized = unitAccess
    .map((u) => String(u || "").trim().toUpperCase())
    .filter((u) => allowed.has(u));
  return Array.from(new Set(normalized));
}

function isUnitRestrictedRole(role = "") {
  return UNIT_RESTRICTED_ROLES.includes(String(role || "").trim().toLowerCase());
}

function isAilaWorkflowRole(role = "") {
  return AILA_WORKFLOW_ROLES.includes(String(role || "").trim().toLowerCase());
}

function isAilaGenericWorkflow(row = {}) {
  const unit = String(row?.unidad_clave || "").trim().toUpperCase();
  if (unit !== "AILA") return false;
  const detail = row?.detalle_formulario && typeof row.detalle_formulario === "object"
    ? row.detalle_formulario
    : {};
  const permitType = String(detail.tipo_permiso || row?.uso || "").trim().toLowerCase();
  return permitType === "generico";
}

function isAilaStage2Role(role = "") {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === AILA_ROLE_RECEPCION_AVSEC || normalized === AILA_ROLE_ADMINISTRACION;
}

function isAilaStage3Role(role = "") {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === AILA_ROLE_JEFATURA || normalized === AILA_ROLE_UETIA;
}

function isAilaStage4Role(role = "") {
  return String(role || "").trim().toLowerCase() === AILA_ROLE_JEFATURA_AILA;
}

function isFinancialGestionTiaWorkflow(row = {}) {
  const unit = String(row?.unidad_clave || "").trim().toUpperCase();
  if (unit !== "FINANCIERO") return false;
  const detail = row?.detalle_formulario && typeof row?.detalle_formulario === "object"
    ? row.detalle_formulario
    : {};
  return String(detail.proceso_codigo || "").trim() === "gestion_tia";
}

function forcedUnitAccessForRole(role = "", requestedUnits = ALL_UNITS) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (isAilaWorkflowRole(normalizedRole)) {
    return ["AILA"];
  }
  if (normalizedRole === FINANCIAL_ROLE_AVSEC) {
    return ["FINANCIERO"];
  }
  if (isUnitRestrictedRole(normalizedRole)) {
    return normalizeUnitAccess(requestedUnits);
  }
  return [...ALL_UNITS];
}

async function getSubmissionNotificationContext(submissionId) {
  const result = await pool.query(
    `SELECT
       s.id,
       s.registro_codigo,
       s.unidad_clave,
       s.gestion_nombre,
       s.nombre_propietario,
       s.correo,
       s.comentarios_revision,
       s.returned_reason,
       s.returned_to_analista_reason,
       owner.id AS owner_user_id,
       owner.name AS owner_name,
       owner.email AS owner_email,
       analyst.id AS analyst_user_id,
       analyst.name AS analyst_name,
       analyst.email AS analyst_email,
       emitter.id AS emitter_user_id,
       emitter.name AS emitter_name,
       emitter.email AS emitter_email,
       approver.id AS approver_user_id,
       approver.name AS approver_name,
       approver.email AS approver_email
     FROM submissions s
     LEFT JOIN users owner ON owner.id = s.created_by_user_id
     LEFT JOIN users analyst ON analyst.id = s.assigned_analista_id
     LEFT JOIN users emitter ON emitter.id = s.assigned_emisor_id
     LEFT JOIN users approver ON approver.id = s.assigned_aprobador_id
     WHERE s.id = $1`,
    [submissionId]
  );

  return result.rows[0] || null;
}

function sendSubmissionNotification(task) {
  Promise.resolve()
    .then(task)
    .catch((err) => {
      console.error("Error enviando notificacion de correo", err);
    });
}

async function notifyOwnerSubmissionStatus(submissionId, { subjectPrefix, heading, message, reason } = {}) {
  const context = await getSubmissionNotificationContext(Number(submissionId));
  const recipientEmail = context?.owner_email || context?.correo;
  if (!recipientEmail) return false;

  return notifyUserStatus({
    to: recipientEmail,
    recipientName: context?.owner_name || context?.nombre_propietario,
    subjectPrefix,
    heading,
    message,
    context,
    reason
  });
}

function canFinalizeAilaAdministration(row = {}) {
  return Boolean(
    isAilaGenericWorkflow(row) &&
    row?.assigned_analista_id &&
    row?.sent_to_emisor_at &&
    row?.sent_to_aprobador_at &&
    row?.returned_to_analista_at
  );
}

async function getCurrentUserRole(userId, fallbackRole = "user") {
  const normalizedFallback = String(fallbackRole || "user").trim().toLowerCase();
  try {
    const result = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);
    if (!result.rowCount) return normalizedFallback;
    return String(result.rows[0].role || normalizedFallback).trim().toLowerCase();
  } catch {
    return normalizedFallback;
  }
}

async function getCurrentUserUnitAccess(userId, fallbackUnits = ALL_UNITS) {
  const normalizedFallback = normalizeUnitAccess(fallbackUnits);
  try {
    const result = await pool.query("SELECT unit_access FROM users WHERE id = $1", [userId]);
    if (!result.rowCount) return normalizedFallback;
    return normalizeUnitAccess(result.rows[0].unit_access);
  } catch {
    return normalizedFallback;
  }
}

async function registerSubmissionLog({
  submissionId,
  eventCode,
  eventLabel,
  eventDetail = null,
  actorUserId = null,
  actorRole = null,
  metadata = null
}) {
  try {
    await pool.query(
      `INSERT INTO submission_logs (
         submission_id,
         event_code,
         event_label,
         event_detail,
         actor_user_id,
         actor_role,
         metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        submissionId,
        String(eventCode || "").trim().slice(0, 80),
        String(eventLabel || "").trim().slice(0, 180),
        eventDetail ? String(eventDetail).trim().slice(0, 300) : null,
        actorUserId || null,
        actorRole ? String(actorRole).trim().toLowerCase().slice(0, 40) : null,
        metadata && typeof metadata === "object" ? metadata : null
      ]
    );
  } catch (err) {
    console.error("Error writing submission log", err);
  }
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-GT");
}

function formatDateOnly(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, "0");
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const y = String(value.getFullYear());
    return `${d}/${m}/${y}`;
  }
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw || "";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = String(date.getFullYear());
  return `${d}/${m}/${y}`;
}

function hasRequiredValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function validateAilaPeopleAndEscorts(detail = {}) {
  const people = Array.isArray(detail.personas) ? detail.personas : [];
  const escorts = Array.isArray(detail.escoltas) ? detail.escoltas : [];
  const hasPersonValue = (row = {}) => ["nombre", "documento"]
    .some((field) => String(row[field] || "").trim());
  const hasEscortValue = (row = {}) => ["nombre", "telefono", "tia", "vencimiento_tia"]
    .some((field) => String(row[field] || "").trim());

  const filledPeople = people.filter(hasPersonValue);
  if (!filledPeople.length) {
    return "Debes ingresar al menos una persona.";
  }
  for (const [index, person] of filledPeople.entries()) {
    if (!String(person.nombre || "").trim() || !String(person.documento || "").trim()) {
      return `Completa nombre y documento de la persona ${index + 1}.`;
    }
  }

  const requiredEscorts = Math.max(1, Math.ceil(filledPeople.length / 8));
  const filledEscorts = escorts.filter(hasEscortValue);
  if (filledEscorts.length < requiredEscorts) {
    return `Debes ingresar ${requiredEscorts} escolta(s) para ${filledPeople.length} persona(s).`;
  }
  for (let i = 0; i < requiredEscorts; i++) {
    const escort = filledEscorts[i] || {};
    const phone = String(escort.telefono || "").trim();
    if (!String(escort.nombre || "").trim() || !phone || !String(escort.tia || "").trim() || !String(escort.vencimiento_tia || "").trim()) {
      return `Completa nombre, telÃ©fono, T.I.A. y vencimiento del escolta ${i + 1}.`;
    }
  }

  return null;
}

function getAilaExpiredEscortIndexes(detail = {}) {
  const escorts = Array.isArray(detail.escoltas) ? detail.escoltas : [];
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return escorts.reduce((acc, escort, index) => {
    const due = String(escort?.vencimiento_tia || "").trim();
    if (due && due < todayKey) acc.push(index + 1);
    return acc;
  }, []);
}

function getAilaFilledEscortIndexes(detail = {}) {
  const escorts = Array.isArray(detail.escoltas) ? detail.escoltas : [];
  return escorts.reduce((acc, escort, index) => {
    const filled = ["nombre", "telefono", "tia", "vencimiento_tia"]
      .some((field) => String(escort?.[field] || "").trim());
    if (filled) acc.push(index + 1);
    return acc;
  }, []);
}

function decodePdfBase64(base64Value, label) {
  if (!base64Value) return null;
  const raw = String(base64Value || "");
  const cleaned = raw.includes(",") ? raw.split(",").pop() : raw;
  let buffer;
  try {
    buffer = Buffer.from(String(cleaned || ""), "base64");
  } catch {
    throw new Error(`${label} no tiene un formato base64 valido.`);
  }
  if (!buffer || !buffer.length) {
    throw new Error(`${label} no contiene un PDF valido.`);
  }
  if (buffer.length > MAX_PDF_SIZE_BYTES) {
    throw new Error(`${label} supera el limite de 10 MB.`);
  }
  return buffer;
}

function validateNumericSubmissionFields(
  payload = {},
  { onlyProvided = false, requireMainPhone = false, requireOwnerDocument = false, flexibleMainPhone = false, flexibleOwnerDocument = false } = {}
) {
  const unidadClave = String(payload?.unidad_clave || "").trim().toUpperCase();
  const fields = [
    { key: "documento_propietario", label: "DPI del propietario", length: 13, required: requireOwnerDocument },
    { key: "telefono", label: "TelÃ©fono", length: 8, required: requireMainPhone },
    { key: "autorizado_documento", label: "DPI autorizado", length: 13, required: false },
    { key: "autorizado_telefono", label: "TelÃ©fono autorizado", length: 8, required: false }
  ];

  for (const field of fields) {
    if (onlyProvided && !Object.prototype.hasOwnProperty.call(payload, field.key)) continue;
    const raw = payload[field.key];
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!value) {
      if (field.required) {
        return `${field.label} es obligatorio y debe tener ${field.length} digitos.`;
      }
      continue;
    }
    if (field.key === "telefono" && flexibleMainPhone) {
      continue;
    }
    if (field.key === "documento_propietario" && (flexibleOwnerDocument || unidadClave === "RAN")) {
      continue;
    }
    if (!new RegExp(`^\\d{${field.length}}$`).test(value)) {
      return `${field.label} debe contener exactamente ${field.length} digitos.`;
    }
  }

  return null;
}

function normalizeRegistroPrefix(unidadClave) {
  const cleaned = String(unidadClave || "GENERAL")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return cleaned || "GENERAL";
}

async function reserveSubmissionCode(client, unidadClave, referenceDate = new Date()) {
  const prefix = normalizeRegistroPrefix(unidadClave);
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();

  const counterResult = await client.query(
    `INSERT INTO submission_counters (unit_clave, year_value, last_number)
     VALUES ($1, $2, 1)
     ON CONFLICT (unit_clave, year_value)
     DO UPDATE SET last_number = submission_counters.last_number + 1
     RETURNING last_number`,
    [prefix, year]
  );

  const sequence = Number(counterResult.rows[0]?.last_number || 1);
  const padded = String(sequence).padStart(2, "0");
  return `${prefix}-${padded}-${year}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderValue(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text ? escapeHtml(text) : "&nbsp;";
}

function sanitizeHeaderFilename(value, fallback = "archivo.pdf") {
  const normalized = String(value || fallback)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function normalizeFinancialDetail(detail) {
  return detail && typeof detail === "object" && !Array.isArray(detail) ? detail : {};
}

function buildFinancialSummaryRows(submission) {
  const detail = normalizeFinancialDetail(submission.detalle_formulario);
  return [
    ["Nombre de la empresa", detail.nombre_empresa || submission.nombre_propietario],
    ["Nombre del solicitante", detail.nombre_solicitante || submission.representante_legal],
    ["DPI del solicitante", detail.dpi_solicitante || submission.documento_propietario],
    ["NIT", submission.nit],
    ["Correo electr\u00f3nico", submission.correo],
    ["N\u00famero de tel\u00e9fono", submission.telefono],
    ["Carta de representaci\u00f3n", detail.carta_representacion || submission.autorizado_nombre],
    ["Gesti\u00f3n", detail.gestion_label || submission.gestion_nombre],
    ["Monto de referencia", detail.monto_referencia],
    ["\u00c1rea", detail.area],
    ["Nomenclatura del \u00e1rea", detail.nomenclatura_area],
    ["A\u00f1o", detail.anio],
    ["Matr\u00edcula", detail.matricula || submission.matricula_tg],
    ["Peso m\u00e1ximo de despegue en KGS de la aeronave", detail.peso_kg],
    ["Documento de peso m\u00e1ximo de despegue", detail.documento_peso_aeronave],
    ["Fecha de pago para c\u00e1lculo de mora", detail.fecha_pago_mora],
    ["N\u00famero de placa", detail.numero_placa],
    ["Tipo de veh\u00edculo", detail.tipo_vehiculo],
    ["Color de veh\u00edculo", detail.color_vehiculo],
    ["Marca de veh\u00edculo", detail.marca_vehiculo],
    ["Nombre de taller", detail.nombre_taller],
    ["Subtipo de certificado operativo", detail.certificado_operativo_subtipo],
    ["Idioma - Ingl\u00e9s", detail.idioma_ingles ? "S\u00ed" : null],
    ["Idioma - Espa\u00f1ol", detail.idioma_espanol ? "S\u00ed" : null],
    ["Otros", detail.otros_detalle],
    ["Observaciones", detail.detalle_adicional || submission.especificaciones]
  ].filter(([, value]) => hasRequiredValue(value));
}

const FRONTEND_ASSETS_DIR = path.resolve(__dirname, "..", "..", "frontend", "src", "assets");
const INSTITUTION_LOGOS = {
  mciv: path.join(FRONTEND_ASSETS_DIR, "mciv-oficial.png"),
  dgac: path.join(FRONTEND_ASSETS_DIR, "dgac-oficial.png")
};
let institutionLogoCache = null;

function toImageDataUri(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const bytes = fs.readFileSync(filePath);
    if (!bytes || !bytes.length) return null;
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch (err) {
    console.error("No se pudo cargar logo institucional", err);
    return null;
  }
}

function getInstitutionLogoData() {
  if (institutionLogoCache) return institutionLogoCache;
  institutionLogoCache = {
    mciv: toImageDataUri(INSTITUTION_LOGOS.mciv),
    dgac: toImageDataUri(INSTITUTION_LOGOS.dgac)
  };
  return institutionLogoCache;
}

function normalizeAilaDetail(detail) {
  return detail && typeof detail === "object" && !Array.isArray(detail) ? detail : {};
}

function collectAilaRows(rows = [], fields = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => row && typeof row === "object" ? row : {})
    .filter((row) => fields.some((field) => hasRequiredValue(row[field])));
}

async function getAilaAuthorizationNames(submission = {}) {
  const jefaturaAvsecId = Number(submission.assigned_emisor_id || 0);
  const jefaturaAilaId = Number(submission.assigned_aprobador_id || 0);
  const ids = [jefaturaAvsecId, jefaturaAilaId].filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) {
    return { jefaturaAvsec: "", jefaturaAila: "" };
  }

  try {
    const result = await pool.query(
      `SELECT id, name, email
       FROM users
       WHERE id = ANY($1::int[])`,
      [ids]
    );
    const byId = new Map(
      result.rows.map((row) => [
        Number(row.id),
        String(row.name || row.email || "").trim()
      ])
    );
    return {
      jefaturaAvsec: byId.get(jefaturaAvsecId) || "",
      jefaturaAila: byId.get(jefaturaAilaId) || ""
    };
  } catch (err) {
    console.error("No se pudieron obtener los autorizadores AILA.", err);
    return { jefaturaAvsec: "", jefaturaAila: "" };
  }
}

async function buildAilaAuthorizedPdfHtml(submission) {
  const logos = getInstitutionLogoData();
  const detail = normalizeAilaDetail(submission.detalle_formulario);
  const authorizationNames = await getAilaAuthorizationNames(submission);
  const visitantes = collectAilaRows(detail.personas, ["nombre", "documento", "nacionalidad"]);
  const escoltas = collectAilaRows(detail.escoltas, ["nombre", "telefono", "tia", "vencimiento_tia", "contrasena"]);
  const herramientas = collectAilaRows(detail.herramientas, ["cantidad", "descripcion"]);
  const observacionesAila = collectAilaRows(detail.vehiculos, ["tipo"])
    .map((row) => String(row.tipo || "").trim())
    .filter(Boolean)
    .join("\n");
  const tipoPermiso = String(detail.tipo_permiso || submission.uso || "").trim().toLowerCase();
  const tipoPermisoLabel = tipoPermiso === "urgente" ? "Permiso urgente" : "Permiso genérico";
  const numeroAutorizado = submission.registro_codigo || `AILA-${submission.id}`;
  const horarioIngreso = String(detail.hora_ingreso || "").trim();
  const fechaIngreso = formatDateOnly(detail.fecha_ingreso || "");
  const diasSolicitados = String(detail.dias_solicitados || "").trim();

  const renderTable = (columns = [], rowsData = []) => `
    <table>
      <thead>
        <tr>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rowsData.map((row) => `<tr>${row.map((cell) => `<td>${renderValue(cell)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Formulario autorizado ${numeroAutorizado}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 11px; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 8mm; }
    .document { border: 1px solid #bfdbfe; border-radius: 8px; padding: 7mm; }
    .doc-header { border-bottom: 1px solid #cbd5e1; padding-bottom: 5mm; margin-bottom: 4mm; }
    .logos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: center; }
    .logo-block { display: flex; align-items: center; min-height: 54px; }
    .logo-block.right { justify-content: flex-end; }
    .logo-image { display: block; width: auto; max-width: 100%; object-fit: contain; }
    .logo-image.mciv { max-height: 56px; }
    .logo-image.dgac { max-height: 52px; margin-left: auto; }
    .title { margin-top: 8px; text-align: center; }
    .title h1 { margin: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 0.02em; }
    .title p { margin: 4px 0 0; font-size: 11px; color: #334155; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin-top: 8px; }
    .meta-item, .line-field { display: flex; gap: 8px; align-items: flex-end; }
    .label { font-weight: 700; white-space: nowrap; }
    .line-value { flex: 1; min-height: 18px; border-bottom: 1px solid #64748b; padding: 2px 3px; word-break: break-word; }
    .section { margin-top: 10px; page-break-inside: avoid; }
    .section h2 { margin: 0 0 6px; font-size: 12.5px; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
    .field-grid { display: grid; gap: 6px; }
    .field-grid.dual { grid-template-columns: 1fr 1fr; gap: 8px 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; text-align: left; }
    th { background: #eff6ff; font-size: 10.5px; }
    .note { margin-top: 8px; font-size: 10px; color: #475569; }
  </style>
</head>
<body>
  <div class="page">
    <div class="document">
      <header class="doc-header">
        <div class="logos">
          <div class="logo-block">
            ${logos.mciv ? `<img class="logo-image mciv" src="${logos.mciv}" alt="Ministerio de Comunicaciones, Infraestructura y Vivienda">` : ""}
          </div>
          <div class="logo-block right">
            ${logos.dgac ? `<img class="logo-image dgac" src="${logos.dgac}" alt="Dirección General de Aeronáutica Civil">` : ""}
          </div>
        </div>
        <div class="title">
          <h1>Formulario autorizado de ingreso</h1>
          <p>Aeropuerto Internacional La Aurora</p>
          <p>Administración AILA</p>
        </div>
        <div class="meta">
          <div class="meta-item"><span class="label">No. de formulario autorizado:</span><span class="line-value">${renderValue(numeroAutorizado)}</span></div>
          <div class="meta-item"><span class="label">Tipo de permiso:</span><span class="line-value">${renderValue(tipoPermisoLabel)}</span></div>
        </div>
      </header>

      <section class="section">
        <h2>Datos de la solicitud</h2>
        <div class="field-grid">
          <div class="line-field"><span class="label">Empresa / Arrendatario:</span><span class="line-value">${renderValue(detail.empresa_arrendatario || submission.nombre_propietario)}</span></div>
          <div class="line-field"><span class="label">Área a ingresar:</span><span class="line-value">${renderValue(detail.area_destino || submission.direccion)}</span></div>
          <div class="line-field"><span class="label">Motivo de la visita:</span><span class="line-value">${renderValue(detail.motivo_visita || submission.especificaciones)}</span></div>
        </div>
        <div class="field-grid dual" style="margin-top:6px;">
          <div class="line-field"><span class="label">Fecha de ingreso:</span><span class="line-value">${renderValue(fechaIngreso)}</span></div>
          <div class="line-field"><span class="label">Hora de ingreso:</span><span class="line-value">${renderValue(horarioIngreso)}</span></div>
          <div class="line-field"><span class="label">Días solicitados:</span><span class="line-value">${renderValue(diasSolicitados)}</span></div>
          <div class="line-field"><span class="label">Fecha de aprobación:</span><span class="line-value">${renderValue(formatDateOnly(submission.approved_at))}</span></div>
        </div>
      </section>

      <section class="section">
        <h2>Datos de contacto</h2>
        <div class="field-grid dual">
          <div class="line-field"><span class="label">Nombre:</span><span class="line-value">${renderValue(detail.empresa_arrendatario || submission.representante_legal || submission.nombre_propietario)}</span></div>
          <div class="line-field"><span class="label">No. telefónico:</span><span class="line-value">${renderValue(detail.telefono_notificaciones || submission.telefono)}</span></div>
          <div class="line-field" style="grid-column: 1 / -1;"><span class="label">Correo electrónico:</span><span class="line-value">${renderValue(detail.correo_notificaciones || submission.correo)}</span></div>
        </div>
      </section>

      <section class="section">
        <h2>Información de visitantes</h2>
        ${visitantes.length
          ? renderTable(
              ["Nombre completo", "No. DPI / Pasaporte", "Nacionalidad"],
              visitantes.map((row) => [row.nombre, row.documento, row.nacionalidad || ""])
            )
          : '<div class="note">No se registraron visitantes.</div>'}
      </section>

      <section class="section">
        <h2>Información de escolta</h2>
        ${escoltas.length
          ? renderTable(
              ["Nombre y apellido según T.I.A.", "No. teléfono", "No. T.I.A.", "Vencimiento T.I.A.", "No. contraseña"],
              escoltas.map((row) => [row.nombre, row.telefono, row.tia, formatDateOnly(row.vencimiento_tia || ""), row.contrasena || "No aplica"])
            )
          : '<div class="note">No se registraron escoltas.</div>'}
      </section>

      ${herramientas.length ? `
      <section class="section">
        <h2>Herramienta, mercadería y/o mobiliario</h2>
        ${renderTable(
          ["Cantidad", "Descripción"],
          herramientas.map((row) => [row.cantidad, row.descripcion])
        )}
      </section>` : ""}

      ${observacionesAila ? `
      <section class="section">
        <h2>Observaciones</h2>
        <div class="line-value" style="min-height: 48px; white-space: pre-wrap;">${renderValue(observacionesAila)}</div>
      </section>` : ""}

      <section class="section">
        <h2>Autorización</h2>
        <div class="field-grid dual">
          <div class="line-field"><span class="label">Jefatura AVSEC:</span><span class="line-value">${renderValue(authorizationNames.jefaturaAvsec)}</span></div>
          <div class="line-field"><span class="label">Jefatura AILA:</span><span class="line-value">${renderValue(authorizationNames.jefaturaAila)}</span></div>
        </div>
      </section>

      <div class="note">
        Documento generado automáticamente con los datos ingresados por el usuario.
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function buildAilaAuthorizedPdfBuffer(submission) {
  const executablePath = resolveBrowserExecutablePath();
  if (!executablePath) {
    return buildSubmissionFallbackPdfBuffer(submission);
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
    });
    const page = await browser.newPage();
    await page.setContent(await buildAilaAuthorizedPdfHtml(submission), { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" }
    });
    return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
  } catch (err) {
    console.error("Error generando PDF autorizado AILA.", err);
    return buildSubmissionFallbackPdfBuffer(submission);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}

function buildSubmissionPdfHtml(submission) {
  const personaTipo = String(submission.persona_tipo || "individual").toLowerCase();
  const isJuridica = personaTipo === "juridica";
  const unidadClave = String(submission.unidad_clave || "GENERAL").toUpperCase();
  const isFinancialMode = unidadClave === "FINANCIERO";
  const logos = getInstitutionLogoData();
  if (isFinancialMode) {
    const rows = buildFinancialSummaryRows(submission);
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Solicitud de solvencia de pago ${submission.id}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 9mm; }
    .document { border: 1px solid #cbd5e1; padding: 8mm; }
    .doc-header { border-bottom: 1px solid #cbd5e1; padding-bottom: 5mm; margin-bottom: 4mm; }
    .logos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: center; }
    .logo-block { display: flex; align-items: center; min-height: 56px; }
    .logo-block.right { justify-content: flex-end; text-align: right; }
    .logo-image { display: block; width: auto; max-width: 100%; object-fit: contain; }
    .logo-image.mciv { max-height: 60px; }
    .logo-image.dgac { max-height: 56px; margin-left: auto; }
    .title { margin-top: 10px; text-align: center; }
    .title h1 { margin: 0; font-size: 15px; text-transform: uppercase; letter-spacing: 0.02em; }
    .title p { margin: 4px 0 0; font-size: 11.5px; color: #334155; }
    .mode-pill { display: inline-block; margin-top: 6px; border: 1px solid #93c5fd; background: #dbeafe; color: #1e3a8a; border-radius: 999px; padding: 2px 8px; font-size: 10.5px; font-weight: 700; }
    .meta-row { margin-top: 8px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; }
    .meta-item { display: inline-flex; align-items: flex-end; gap: 8px; min-width: 220px; }
    .meta-item span.label { font-weight: 700; white-space: nowrap; }
    .line-value { flex: 1; border-bottom: 1px solid #64748b; min-height: 20px; padding: 2px 4px; display: inline-block; word-break: break-word; }
    .section { margin-top: 10px; border-top: 2px solid #0f172a; padding-top: 8px; page-break-inside: avoid; }
    .section h2 { margin: 0 0 8px; font-size: 14px; text-transform: uppercase; }
    .fields { display: grid; gap: 8px; }
    .dual { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .line-field { display: flex; align-items: flex-end; gap: 8px; }
    .line-field .label { font-weight: 600; white-space: nowrap; }
    .legal { border-top: 1px dashed #cbd5e1; margin-top: 12px; padding-top: 8px; color: #475569; font-size: 10px; line-height: 1.35; }
  </style>
</head>
<body>
  <div class="page">
    <div class="document">
      <header class="doc-header">
        <div class="logos">
          <div class="logo-block">
            ${logos.mciv ? `<img class="logo-image mciv" src="${logos.mciv}" alt="Ministerio de Comunicaciones, Infraestructura y Vivienda">` : ""}
          </div>
          <div class="logo-block right">
            ${logos.dgac ? `<img class="logo-image dgac" src="${logos.dgac}" alt="Dirección General de Aeronáutica Civil">` : ""}
          </div>
        </div>
        <div class="title">
          <h1>Solicitud solvencia de pago</h1>
          <p>Departamento Financiero - Unidad Control de Ingresos</p>
          <span class="mode-pill">Unidad FINANCIERO</span>
        </div>
        <div class="meta-row">
          <div class="meta-item"><span class="label">Fecha:</span><span class="line-value">${renderValue(formatDateOnly(submission.fecha || submission.created_at))}</span></div>
          <div class="meta-item"><span class="label">No. Registro:</span><span class="line-value">${renderValue(submission.registro_codigo || submission.id)}</span></div>
        </div>
      </header>

      <section class="section">
        <h2>A. Datos del solicitante</h2>
        <div class="fields">
          ${rows
            .slice(0, 7)
            .map(([label, value]) => `<div class="line-field"><span class="label">${escapeHtml(label)}:</span><span class="line-value">${renderValue(value)}</span></div>`)
            .join("")}
        </div>
      </section>

      <section class="section">
        <h2>B. Gestión solicitada</h2>
        <div class="fields">
          ${rows
            .slice(7)
            .map(([label, value]) => `<div class="line-field"><span class="label">${escapeHtml(label)}:</span><span class="line-value">${renderValue(value)}</span></div>`)
            .join("")}
        </div>
      </section>

      <footer class="legal">
        Fecha de envío: ${renderValue(formatDateTime(submission.created_at))} - Fecha de aprobación: ${renderValue(formatDateTime(submission.approved_at))}
      </footer>
    </div>
  </div>
</body>
</html>`;
  }
  const isRanMode = unidadClave === "RAN";
  const uso = String(submission.uso || "").toLowerCase();
  const gestionNombre = String(submission.gestion_nombre || "Formulario General TG");
  const normalizedGestionNombre = gestionNombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isRanDrone = isRanMode && (
    normalizedGestionNombre.includes("uav") ||
    normalizedGestionNombre.includes("rpa") ||
    normalizedGestionNombre.includes("drone") ||
    normalizedGestionNombre.includes("distintivo")
  );
  const origenCompra = String(submission.origen_compra || "").trim().toLowerCase();
  const isRanDroneGuatemalaJuridica = isRanDrone && isJuridica && origenCompra === "guatemala";
  const isRanDroneExtranjeroJuridica = isRanDrone && isJuridica && origenCompra === "extranjero";
  const isRanDroneJuridica = isRanDrone && isJuridica;
  const isRanDroneExtranjeroIndividual = isRanDrone && !isJuridica && origenCompra === "extranjero";
  const hideSolicitudSection = isRanMode && !isRanDrone;
  const formMainTitle = isRanDrone
    ? "Formulario único para trámites de aeronaves no tripuladas UAV - RPA's"
    : normalizedGestionNombre.includes("certific")
      ? "FORMULARIO DE SOLICITUD DE CERTIFICACION"
      : 'Formulario único para trámites de aeronaves "TG"';
  const ranTramiteLabel = gestionNombre;
  const ownerNameLabel = isJuridica ? "1. Nombre de Entidad:" : "1. Nombre de Empresa / Propietario:";
  const ownerDocumentLabel = isRanDrone || isJuridica
    ? "2. No. de Documento Personal de Identificación o Pasaporte:"
    : "2. No. de Documento Personal de Identificación o Pasaporte del Propietario:";
  const addressFieldLabel = isRanDrone ? "5. Dirección:" : "3. Dirección:";
  const phoneFieldLabel = isRanDrone ? "Teléfono:" : "Teléfono (8 dígitos):";
  const nitBlockTitle = isRanDrone || normalizedGestionNombre.includes("certific")
    ? "3. N.I.T y nombre a consignar en orden de pago:"
    : "4. N.I.T y nombre a consignar en orden de pago:";
  const authorizedTitleNumber = normalizedGestionNombre.includes("certific") ? "4." : isRanDrone ? "6." : "5.";
  const nonUavMatriculaLabel = normalizedGestionNombre.includes("certific")
    ? "Matrícula o distintivo TG/UAV-TG:"
    : "Matrícula TG:";
  const uploadedDocuments = [];
  if (submission.has_dpi) {
    uploadedDocuments.push([
      isRanDrone
        ? (isRanDroneJuridica ? "2. Adjuntar copia simple del DPI del Representante Legal de la entidad propietaria/arrendataria" : "2. Adjuntar copia simple del DPI")
        : "1. Adjuntar copia simple del DPI",
      submission.dpi_filename || "Adjunto"
    ]);
  }
  if (submission.has_acta) {
    uploadedDocuments.push([
      isRanDrone
        ? "1. Dictamen Técnico emitido por el Departamento de Vigilancia de la Seguridad Operacional -DVSO-"
        : "2. Copia simple del Acta Notarial de nombramiento del representante legal de la entidad propietaria/arrendataria, debidamente inscrita en el Registro Mercantil.",
      submission.acta_filename || "Adjunto"
    ]);
  }
  if (isRanDrone && submission.has_registro_mercantil) {
    uploadedDocuments.push([
      "3. Copia auténtica de la Factura de compra o Acta Notarial de Declaración Jurada",
      submission.registro_mercantil_filename || "Adjunto"
    ]);
  }
  if (isRanDroneExtranjeroIndividual && submission.has_rpa_documento_estado) {
    uploadedDocuments.push([
      "4. Copia legalizada de importación de la Aeronave o Declaración Única Centroamericana -DUCA- adjuntando el pago",
      submission.rpa_documento_estado_filename || "Adjunto"
    ]);
  }
  if (isRanDroneExtranjeroJuridica && submission.has_carta_representacion) {
    uploadedDocuments.push([
      "4. Copia legalizada de la póliza de importación de la Aeronave o Declaración Única Centroamericana -DUCA- adjuntando el pago",
      submission.carta_representacion_filename || "Adjunto"
    ]);
  }
  if (isRanDroneJuridica && submission.has_rpa_acta_nombramiento) {
    uploadedDocuments.push([
      `${isRanDroneExtranjeroJuridica ? "5" : "4"}. Copia simple del Acta Notarial de Nombramiento del representante legal de la entidad propietaria/arrendataria.`,
      submission.rpa_acta_nombramiento_filename || "Adjunto"
    ]);
  }
  if (isRanDroneJuridica && submission.has_rpa_registro_representante) {
    uploadedDocuments.push([
      `${isRanDroneExtranjeroJuridica ? "6" : "5"}. Certificación de la inscripción del representante legal en el Registro Mercantil`,
      submission.rpa_registro_representante_filename || "Adjunto"
    ]);
  }
  if (isRanDroneJuridica && submission.has_rpa_registro_entidad) {
    uploadedDocuments.push([
      `${isRanDroneExtranjeroJuridica ? "7" : "6"}. Certificación de la inscripción de la entidad en el Registro Mercantil`,
      submission.rpa_registro_entidad_filename || "Adjunto"
    ]);
  }
  if (isRanDroneJuridica && submission.has_rpa_documento_estado) {
    uploadedDocuments.push([
      isRanDroneExtranjeroJuridica
        ? "8. En caso de no ser una entidad del Estado/Organización no Gubernamental, adjuntar documento que acredite la calidad con que actúa, debidamente inscrito en el Registro correspondiente"
        : "7. En caso de ser una entidad del Estado/Organización no Gubernamental, adjuntar documento que acredite la calidad con que actúa, debidamente inscrito en el Registro correspondiente",
      submission.rpa_documento_estado_filename || "Adjunto"
    ]);
  }
  const solicitudRows = isRanDrone
    ? [
      { checked: submission.tipo_reservacion, label: "1. Reserva de Distintivo / DESADUANAJE (Q 105.00)" },
      { checked: submission.tipo_inscripcion, label: "2. Inscripción en el D.R.A.N (Q 1,000.00)" },
      { checked: submission.tipo_cambio_prop, label: "3. Cambio de Propietario (Q 400.00)" },
      { checked: submission.tipo_reposicion, label: "4. Reposición de Certificado de Distintivo (Q 200.00)" },
      { checked: submission.tipo_certificacion, label: "5. Certificación (Q 50.00)" }
    ]
    : [
      { checked: submission.tipo_internacion, label: "1. InternaciÃ³n de la Aeronave (0125)" },
      { checked: submission.tipo_reservacion, label: "2. ReservaciÃ³n de MatrÃ­cula (0105)" },
      { checked: submission.tipo_inscripcion, label: "3. InscripciÃ³n en e-DRAN (0100)" },
      { checked: submission.tipo_certificado_prov, label: "4. Certificado de MatrÃ­cula Provisional (0200)" },
      { checked: submission.tipo_reposicion, label: "5. ReposiciÃ³n de Certificado (0200)" },
      { checked: submission.tipo_cambio_prop, label: "6. Cambio de Propietario (0400)" },
      { checked: submission.tipo_cambio_datos, label: "7. Cambio de datos en Certificados (0105)" },
      { checked: submission.tipo_certificacion, label: "8. CertificaciÃ³n (050)" }
    ];
  const check = (value) => (value ? "[X]" : "[ ]");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Formulario TG ${submission.id}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #0f172a;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12.5px;
      background: #fff;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 9mm;
    }
    .document {
      border: 1px solid #cbd5e1;
      padding: 8mm;
    }
    .doc-header {
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 5mm;
      margin-bottom: 4mm;
    }
    .logos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      align-items: center;
    }
    .logo-block {
      display: flex;
      align-items: center;
      min-height: 56px;
    }
    .logo-block.right {
      justify-content: flex-end;
      text-align: right;
    }
    .logo-image {
      display: block;
      width: auto;
      max-width: 100%;
      object-fit: contain;
    }
    .logo-image.mciv {
      max-height: 60px;
    }
    .logo-image.dgac {
      max-height: 56px;
      margin-left: auto;
    }
    .logo-fallback {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo-mark {
      width: 46px;
      height: 34px;
      border: 1px solid #cbd5e1;
      background: #f1f5f9;
      display: grid;
      place-items: center;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .logo-text strong {
      display: block;
      font-size: 13px;
      margin-bottom: 1px;
    }
    .logo-text small {
      font-size: 11px;
      color: #334155;
    }
    .title {
      margin-top: 10px;
      text-align: center;
    }
    .title h1 {
      margin: 0;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .title p {
      margin: 4px 0 0;
      font-size: 11.5px;
      color: #334155;
    }
    .mode-pill {
      display: inline-block;
      margin-top: 6px;
      border: 1px solid #93c5fd;
      background: #dbeafe;
      color: #1e3a8a;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 10.5px;
      font-weight: 700;
    }
    .meta-row {
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-end;
    }
    .meta-item {
      display: inline-flex;
      align-items: flex-end;
      gap: 8px;
      min-width: 220px;
    }
    .meta-item span.label {
      font-weight: 700;
      white-space: nowrap;
    }
    .line-value {
      flex: 1;
      border-bottom: 1px solid #64748b;
      min-height: 20px;
      padding: 2px 4px;
      display: inline-block;
      word-break: break-word;
    }
    .section {
      margin-top: 10px;
      border-top: 2px solid #0f172a;
      padding-top: 8px;
      page-break-inside: avoid;
    }
    .section h2 {
      margin: 0 0 8px;
      font-size: 14px;
      text-transform: uppercase;
    }
    .section h3 {
      margin: 0 0 8px;
      font-size: 12.5px;
      text-transform: uppercase;
    }
    .persona-row {
      margin-bottom: 8px;
      font-weight: 700;
    }
    .fields {
      display: grid;
      gap: 8px;
    }
    .line-field {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }
    .line-field .label {
      font-weight: 600;
      white-space: nowrap;
    }
    .dual {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .note-line {
      font-weight: 700;
      margin-bottom: 4px;
    }
    .uso-options {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      font-weight: 600;
    }
    .solicitud-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 18px;
      margin-top: 4px;
    }
    .solicitud-item {
      white-space: nowrap;
    }
    .legal {
      border-top: 1px dashed #cbd5e1;
      margin-top: 12px;
      padding-top: 8px;
      color: #475569;
      font-size: 10px;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="document">
      <header class="doc-header">
        <div class="logos">
          <div class="logo-block">
            ${
              logos.mciv
                ? `<img class="logo-image mciv" src="${logos.mciv}" alt="Ministerio de Comunicaciones, Infraestructura y Vivienda">`
                : `<div class="logo-fallback">
            <div class="logo-mark">GUA</div>
            <div class="logo-text">
              <strong>Gobierno de Guatemala</strong>
              <small>Ministerio de Comunicaciones, Infraestructura y Vivienda</small>
            </div>
          </div>`
            }
          </div>
          <div class="logo-block right">
            ${
              logos.dgac
                ? `<img class="logo-image dgac" src="${logos.dgac}" alt="Dirección General de Aeronáutica Civil">`
                : `<div class="logo-fallback">
            <div class="logo-mark">DGAC</div>
            <div class="logo-text">
              <small>Dirección General de Aeronáutica Civil</small>
            </div>
          </div>`
            }
          </div>
        </div>
        <div class="title">
          <h1>${escapeHtml(formMainTitle)}</h1>
          <p>Departamento de Registro Aeronáutico Nacional</p>
          ${isRanMode ? `<span class="mode-pill">Trámite realizado: ${escapeHtml(ranTramiteLabel)}</span>` : ""}
        </div>
        <div class="meta-row">
          <div class="meta-item"><span class="label">Fecha:</span><span class="line-value">${renderValue(formatDateOnly(submission.fecha || submission.created_at))}</span></div>
          <div class="meta-item"><span class="label">No. Registro:</span><span class="line-value">${renderValue(submission.registro_codigo || submission.id)}</span></div>
        </div>
      </header>

      <section class="section">
        <h2>${isRanDrone ? "A. DATOS DEL PROPIETARIO" : "A. DATOS DEL PROPIETARIO."}</h2>
        ${
          isRanDrone
            ? `<div class="persona-row">${check(origenCompra === "guatemala")} Comprado en Guatemala&nbsp;&nbsp;&nbsp;${check(origenCompra === "extranjero")} Comprado en el extranjero</div>
        <div class="persona-row">${check(!isJuridica)} Persona individual&nbsp;&nbsp;&nbsp;${check(isJuridica)} Persona jurídica</div>`
            : `<div class="persona-row">${check(!isJuridica)} Persona individual&nbsp;&nbsp;&nbsp;${check(isJuridica)} Persona jurídica</div>`
        }
        <div class="fields">
          <div class="line-field">
            <span class="label">${escapeHtml(ownerNameLabel)}</span>
            <span class="line-value">${renderValue(submission.nombre_propietario)}</span>
          </div>
          ${
            isJuridica
              ? `<div class="line-field">
            <span class="label">Representante Legal / Arrendatario:</span>
            <span class="line-value">${renderValue(submission.representante_legal)}</span>
          </div>`
              : ""
          }
          <div class="line-field">
            <span class="label">${escapeHtml(ownerDocumentLabel)}</span>
            <span class="line-value">${renderValue(submission.documento_propietario)}</span>
          </div>
          ${
            isRanDrone
              ? `<div class="dual">
            <div class="line-field">
              <span class="label">3. ${escapeHtml(phoneFieldLabel)}</span>
              <span class="line-value">${renderValue(submission.telefono)}</span>
            </div>
            <div class="line-field">
              <span class="label">Correo Electrónico:</span>
              <span class="line-value">${renderValue(submission.correo)}</span>
            </div>
          </div>
          <div>
            <div class="dual">
              <div class="line-field">
                <span class="label">4. NIT:</span>
                <span class="line-value">${renderValue(submission.nit)}</span>
              </div>
              <div class="line-field">
                <span class="label">Nombre para orden de pago:</span>
                <span class="line-value">${renderValue(submission.nombre_orden_pago)}</span>
              </div>
            </div>
          </div>
          <div class="line-field">
            <span class="label">${escapeHtml(addressFieldLabel)}</span>
            <span class="line-value">${renderValue(submission.direccion)}</span>
          </div>`
              : `<div class="line-field">
            <span class="label">${escapeHtml(addressFieldLabel)}</span>
            <span class="line-value">${renderValue(submission.direccion)}</span>
          </div>
          <div class="dual">
            <div class="line-field">
              <span class="label">${escapeHtml(phoneFieldLabel)}</span>
              <span class="line-value">${renderValue(submission.telefono)}</span>
            </div>
            <div class="line-field">
              <span class="label">Correo Electrónico:</span>
              <span class="line-value">${renderValue(submission.correo)}</span>
            </div>
          </div>
          <div>
            <div class="note-line">${escapeHtml(nitBlockTitle)}</div>
            <div class="dual">
              <div class="line-field">
                <span class="label">NIT:</span>
                <span class="line-value">${renderValue(submission.nit)}</span>
              </div>
              <div class="line-field">
                <span class="label">Nombre para orden de pago:</span>
                <span class="line-value">${renderValue(submission.nombre_orden_pago)}</span>
              </div>
            </div>
          </div>`
          }
          ${
            isJuridica || isRanDrone
              ? `<div>
            <div class="note-line">${escapeHtml(authorizedTitleNumber)} En caso de no poder acudir personalmente a realizar cualquier diligencia, autorizo a:</div>
            <div class="line-field">
              <span class="label">Nombre completo:</span>
              <span class="line-value">${renderValue(submission.autorizado_nombre)}</span>
            </div>
            <div class="dual">
              <div class="line-field">
                <span class="label">Número de DPI / Pasaporte:</span>
                <span class="line-value">${renderValue(submission.autorizado_documento)}</span>
              </div>
              <div class="line-field">
                <span class="label">Teléfono:</span>
                <span class="line-value">${renderValue(submission.autorizado_telefono)}</span>
              </div>
            </div>
          </div>`
              : ""
          }
        </div>
      </section>

      <section class="section">
        <h2>${isRanDrone ? "B. DATOS DE LA AERONAVE PILOTADA A DISTANCIA (RPA)." : "B. DATOS DE LA AERONAVE"}</h2>
        ${
          isRanDrone
            ? `<div class="fields">
          <div class="line-field">
            <span class="label">1. Marca:</span>
            <span class="line-value">${renderValue(submission.fabricante)}</span>
          </div>
          <div class="line-field">
            <span class="label">2. Modelo:</span>
            <span class="line-value">${renderValue(submission.modelo)}</span>
          </div>
          <div class="line-field">
            <span class="label">3. Serie (si aplica):</span>
            <span class="line-value">${renderValue(submission.numero_serie)}</span>
          </div>
          <div class="line-field">
            <span class="label">4. No. UAV - TG (si ya fue reservado):</span>
            <span class="line-value">${renderValue(submission.matricula_tg)}</span>
          </div>
          <div class="uso-options">
            <span>5. Uso:</span>
            <span>${check(uso === "privado")} Privado</span>
            <span>${check(uso === "comercial")} Comercial</span>
            <span>${check(uso === "estado")} Entidades de Estado</span>
            <span>${check(uso === "otros")} Otros</span>
          </div>
        </div>`
            : `<div class="fields">
            <div class="dual">
              <div class="line-field">
                <span class="label">${escapeHtml(nonUavMatriculaLabel)}</span>
                <span class="line-value">${renderValue(submission.matricula_tg)}</span>
              </div>
            ${normalizedGestionNombre.includes("certific") ? `` : `<div class="line-field">
              <span class="label">Nueva Matrícula TG (por cambio):</span>
              <span class="line-value">${renderValue(submission.matricula_tg_nueva)}</span>
            </div>`}
          </div>
          <div class="uso-options">
            <span>Uso:</span>
            <span>${check(uso === "privado")} Privado</span>
            <span>${check(uso === "comercial")} Comercial</span>
            <span>${check(uso === "fumigacion")} Fumigación</span>
          </div>
          <div class="dual">
            <div class="line-field">
              <span class="label">Nombre del Fabricante:</span>
              <span class="line-value">${renderValue(submission.fabricante)}</span>
            </div>
            <div class="line-field">
              <span class="label">Número de Serie:</span>
              <span class="line-value">${renderValue(submission.numero_serie || "N/D")}</span>
            </div>
          </div>
          <div class="dual">
            <div class="line-field">
              <span class="label">Modelo (no confundir con año de fabricación):</span>
              <span class="line-value">${renderValue(submission.modelo)}</span>
            </div>
            <div class="line-field">
              <span class="label">Año de Fabricación:</span>
              <span class="line-value">${renderValue(submission.anio_fabricacion)}</span>
            </div>
          </div>
          <div class="line-field">
            <span class="label">Colores (identificar solo colores primarios):</span>
            <span class="line-value">${renderValue(submission.colores)}</span>
          </div>
        </div>`
        }
      </section>

      ${
        isRanDrone
          ? `<section class="section">
        <div class="line-field">
          <span class="label">6. Especificaciones u Observaciones de la solicitud:</span>
          <span class="line-value">${renderValue(submission.especificaciones)}</span>
        </div>
      </section>`
          : !hideSolicitudSection
          ? `<section class="section">
        <h2>C. Tipo de solicitud</h2>
        <div class="solicitud-grid">
          ${solicitudRows
            .map((row) => `<div class="solicitud-item">${check(row.checked)} ${escapeHtml(row.label)}</div>`)
            .join("")}
        </div>
        <div class="line-field" style="margin-top: 8px;">
          <span class="label">${isRanDrone ? "6. Especificaciones u Observaciones de la solicitud:" : "Especificaciones o Motivos de la Solicitud:"}</span>
          <span class="line-value">${renderValue(submission.especificaciones)}</span>
        </div>
      </section>`
          : `<section class="section">
        <h2>C. Observaciones del solicitante</h2>
        <div class="line-field" style="margin-top: 8px;">
          <span class="label">Observaciones:</span>
          <span class="line-value">${renderValue(submission.especificaciones)}</span>
        </div>
      </section>`
      }

      ${
        isRanMode
          ? ``
          : `<section class="section">
        <h2>D. Documentos adjuntos</h2>
        <div class="fields">
          ${
            uploadedDocuments.length
              ? uploadedDocuments
                  .map(([label, value]) => `<div class="line-field">
            <span class="label">${escapeHtml(label)}:</span>
            <span class="line-value">${renderValue(value)}</span>
          </div>`)
                  .join("")
              : `<div class="line-field">
            <span class="label">Documentos:</span>
            <span class="line-value">Sin documentos adjuntos.</span>
          </div>`
          }
        </div>
      </section>`
      }

      <footer class="legal">
        Fundamento de derecho: Convenio de Aviación Civil Internacional, Art. 44 Ley de Aviación Civil, Art. 77 Reglamento de la Ley de Aviación Civil, Regulación de Aviación Civil 45, Manual de Normas y Procedimientos, Decreto 5-2021 Ley de Simplificación de Trámites y Requisitos Administrativos.
        <br>
        Fecha de envío: ${renderValue(formatDateTime(submission.created_at))} - Fecha de aprobación: ${renderValue(formatDateTime(submission.approved_at))}
      </footer>
    </div>
  </div>
</body>
</html>`;
}

function buildSubmissionFallbackPdfBuffer(submission) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const line = (label, value) => {
      doc.font("Helvetica-Bold").fontSize(10).text(`${label}: `, { continued: true });
      doc.font("Helvetica").fontSize(10).text(value ? String(value) : "N/D");
    };

    const drawLogo = (filePath, x, y, fitWidth, fitHeight) => {
      try {
        if (!filePath || !fs.existsSync(filePath)) return;
        doc.image(filePath, x, y, { fit: [fitWidth, fitHeight] });
      } catch (err) {
        console.error("No se pudo dibujar logo en PDF de respaldo", err);
      }
    };

    drawLogo(INSTITUTION_LOGOS.mciv, 36, 24, 245, 60);
    drawLogo(INSTITUTION_LOGOS.dgac, 332, 24, 175, 58);
    doc.y = 95;

    doc.font("Helvetica-Bold").fontSize(14).text('FORMULARIO "TG" (respaldo)', { align: "center" });
    doc.moveDown(0.5);
    line("No. registro", submission.registro_codigo || submission.id);
    line("Unidad", submission.unidad_clave || "GENERAL");
    line("GestiÃ³n", submission.gestion_nombre || "Formulario General TG");
    line("Fecha", formatDateOnly(submission.fecha || submission.created_at));
    line("Fecha de envÃ­o", formatDateTime(submission.created_at));
    line("Fecha de aprobaciÃ³n", formatDateTime(submission.approved_at));
    doc.moveDown(0.5);
    line("Persona tipo", submission.persona_tipo);
    line("Nombre propietario", submission.nombre_propietario);
    line("Representante legal", submission.representante_legal);
    line("Documento propietario", submission.documento_propietario);
    line("DirecciÃ³n", submission.direccion);
    line("TelÃ©fono", submission.telefono);
    line("Correo", submission.correo);
    line("NIT", submission.nit);
    line("Nombre orden pago", submission.nombre_orden_pago);
    line("MatrÃ­cula TG", submission.matricula_tg);
    line("Nueva matrÃ­cula TG", submission.matricula_tg_nueva);
    line("Uso", submission.uso);
    line("Fabricante", submission.fabricante);
    line("NÃºmero de serie", submission.numero_serie);
    line("Modelo", submission.modelo);
    line("AÃ±o de fabricaciÃ³n", submission.anio_fabricacion);
    line("Colores", submission.colores);
    line("Especificaciones", submission.especificaciones);
    line("Comentarios", submission.comentarios_revision);
    line("DPI", submission.has_dpi ? "Adjunto" : "No adjunto");
    line("Acta", submission.has_acta ? "Adjunta" : "No adjunta");
    line("Registro mercantil", submission.has_registro_mercantil ? "Adjunto" : "No adjunto");
    line("PÃ³liza de importaciÃ³n o DUCA (RPA jurÃ­dica extranjero)", submission.has_carta_representacion ? "Adjunto" : "No adjunto");
    line("Acta nombramiento (RPA jurÃ­dica)", submission.has_rpa_acta_nombramiento ? "Adjunta" : "No adjunta");
    line("Registro representante (RPA jurÃ­dica)", submission.has_rpa_registro_representante ? "Adjunto" : "No adjunto");
    line("Registro entidad (RPA jurÃ­dica)", submission.has_rpa_registro_entidad ? "Adjunto" : "No adjunto");
    line("Documento entidad Estado/ONG o importaciÃ³n/DUCA (RPA)", submission.has_rpa_documento_estado ? "Adjunto" : "No adjunto");
    doc.end();
  });
}

function resolveBrowserExecutablePath() {
  const userHome = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.BROWSER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    userHome ? `${userHome}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe` : null,
    userHome ? `${userHome}\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe` : null
  ].filter(Boolean);

  return candidates.find((filePath) => fs.existsSync(filePath)) || null;
}

async function buildSubmissionPdfBuffer(submission) {
  const executablePath = resolveBrowserExecutablePath();
  if (!executablePath) {
    console.error("No se encontro Chrome/Edge para generar el PDF. Se usara PDF de respaldo.");
    return buildSubmissionFallbackPdfBuffer(submission);
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
    });
    const page = await browser.newPage();
    await page.setContent(buildSubmissionPdfHtml(submission), { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm"
      }
    });
    return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
  } catch (err) {
    console.error("Error generando PDF con navegador. Se usara PDF de respaldo.", err);
    return buildSubmissionFallbackPdfBuffer(submission);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore close errors
      }
    }
  }
}

function submissionProcessState(row) {
  const unit = String(row?.unidad_clave || "").toUpperCase();
  const isRan = unit === "RAN";
  const isAilaGeneric = isAilaGenericWorkflow(row);
  const isPaymentPassword = isFinancialPaymentPasswordFlow(row);
  if (row?.delivered_at) {
    return isPaymentPassword
      ? { code: "finalizado", label: "Finalizado", step: 5, percent: 100 }
      : { code: "entregado", label: "Entregado al usuario", step: 5, percent: 100 };
  }
  if (row?.rejected_at) {
    return { code: "rechazado", label: "Rechazado", step: 5, percent: 100 };
  }
  if (row?.returned_at) return { code: "devuelto", label: "Devuelto para correcciÃ³n", step: 2, percent: 45 };
  if (row?.returned_to_analista_at) {
    return isAilaGeneric
      ? { code: "devuelto_administracion_aila", label: "Devuelto por Jefatura AVSEC a AdministraciÃ³n AILA", step: 4, percent: 85 }
      : { code: "devuelto_analista", label: "Devuelto por aprobador a analista", step: 3, percent: 70 };
  }
  if (isPaymentPassword && (row?.has_analyst_pdf || row?.analyst_pdf_filename || row?.analyst_pdf)) {
    return { code: "boleta_disponible", label: "Boleta disponible para pago", step: 4, percent: 90 };
  }
  if (row?.approved_at) {
    return isRan
      ? { code: "aprobado", label: "Aprobado - pendiente de entrega", step: 4, percent: 95 }
      : { code: "aprobado", label: "Aprobado", step: 4, percent: 100 };
  }
  if (row?.assigned_aprobador_id || row?.sent_to_aprobador_at) {
    return isAilaGeneric
      ? { code: "en_jefatura_avsec", label: "En revisión por Jefatura AVSEC", step: 4, percent: 90 }
      : { code: "en_aprobacion", label: "En aprobación de unidad", step: 4, percent: 90 };
  }
  if (row?.assigned_emisor_id || row?.sent_to_emisor_at) {
    return isAilaGeneric
      ? { code: "en_uetia", label: "En revisi\u00f3n por UETIA", step: 3, percent: 78 }
      : { code: "en_emision", label: "En revisi\u00f3n por emisor", step: 3, percent: 82 };
  }
  if (row?.assigned_analista_id) {
    return isAilaGeneric
      ? { code: "en_administracion_aila", label: "Asignado a AdministraciÃ³n AILA", step: 2, percent: 58 }
      : { code: "asignado", label: "Asignado a analista", step: 3, percent: 68 };
  }
  if (row?.receptor_opened_at) {
    return isAilaGeneric
      ? { code: "en_recepcion_aila", label: "Recibido por RecepciÃ³n AILA", step: 2, percent: 42 }
      : { code: "en_recepcion", label: "Recibido por receptor", step: 2, percent: 50 };
  }
  return { code: "enviado", label: "Enviado", step: 1, percent: 25 };
}

function isFinancialPaymentPasswordFlow(row = {}) {
  const unit = String(row?.unidad_clave || "").trim().toUpperCase();
  if (unit !== "FINANCIERO") return false;

  const detail = row?.detalle_formulario && typeof row.detalle_formulario === "object"
    ? row.detalle_formulario
    : {};
  const groupCode = String(detail.gestion_grupo_codigo || "").trim();
  const groupLabel = String(detail.gestion_grupo_label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  return groupCode === "otros_tramites" || groupLabel.includes("contrasena de pago");
}

function parseDateSafe(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffHours(start, end) {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / (1000 * 60 * 60);
}

function roundTwo(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function averageHours(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const total = values.reduce((acc, value) => acc + Number(value || 0), 0);
  return roundTwo(total / values.length);
}

function computeSubmissionDurations(row, now = new Date()) {
  const createdAt = parseDateSafe(row.created_at);
  const receptorOpenedAt = parseDateSafe(row.receptor_opened_at);
  const sentToApproverAt = parseDateSafe(row.sent_to_aprobador_at);
  const approvedAt = parseDateSafe(row.approved_at);
  const returnedAt = parseDateSafe(row.returned_at);
  const returnedToAnalystAt = parseDateSafe(row.returned_to_analista_at);

  const receptorHours = diffHours(createdAt, receptorOpenedAt);

  const analystStart = receptorOpenedAt || createdAt;
  const analystEnd = sentToApproverAt || returnedAt || approvedAt || returnedToAnalystAt;
  const analystHours = diffHours(analystStart, analystEnd);

  const approverEnd = approvedAt || returnedToAnalystAt;
  const approverHours = diffHours(sentToApproverAt, approverEnd);

  const totalToApprovedHours = diffHours(createdAt, approvedAt);

  const process = submissionProcessState(row);
  let currentStageStart = null;
  if (process.code === "enviado") {
    currentStageStart = createdAt;
  } else if (process.code === "en_recepcion") {
    currentStageStart = receptorOpenedAt || createdAt;
  } else if (process.code === "asignado") {
    currentStageStart = receptorOpenedAt || createdAt;
  } else if (process.code === "en_aprobacion") {
    currentStageStart = sentToApproverAt || receptorOpenedAt || createdAt;
  } else if (process.code === "boleta_disponible") {
    currentStageStart = receptorOpenedAt || createdAt;
  } else if (process.code === "devuelto") {
    currentStageStart = returnedAt || createdAt;
  } else if (process.code === "devuelto_analista") {
    currentStageStart = returnedToAnalystAt || sentToApproverAt || receptorOpenedAt || createdAt;
  }

  const currentStageHours = ["aprobado", "entregado", "finalizado"].includes(process.code) ? 0 : diffHours(currentStageStart, now) || 0;
  return {
    receptor_hours: roundTwo(receptorHours),
    analista_hours: roundTwo(analystHours),
    aprobador_hours: roundTwo(approverHours),
    total_to_approved_hours: roundTwo(totalToApprovedHours),
    current_stage_hours: roundTwo(currentStageHours)
  };
}

function createUnitStats(unit) {
  return {
    unit,
    total: 0,
    active: 0,
    status_counts: {
      enviado: 0,
      en_recepcion: 0,
      asignado: 0,
      en_aprobacion: 0,
      boleta_disponible: 0,
      aprobado: 0,
      entregado: 0,
      finalizado: 0,
      devuelto: 0,
      devuelto_analista: 0
    },
    _durations: {
      receptor: [],
      analista: [],
      aprobador: [],
      total_aprobado: []
    }
  };
}

function normalizeUnitKey(value) {
  const unit = String(value || "GENERAL").trim().toUpperCase();
  return ALL_UNITS.includes(unit) ? unit : "GENERAL";
}

function buildSupervisorDashboard(rows) {
  const now = new Date();
  const unitMap = new Map();
  const processRows = [];
  const totals = {
    total: 0,
    active: 0,
    approved: 0,
    delivered: 0,
    returned: 0
  };

  for (const row of rows) {
    const unit = normalizeUnitKey(row.unidad_clave);
    if (!unitMap.has(unit)) {
      unitMap.set(unit, createUnitStats(unit));
    }
    const bucket = unitMap.get(unit);
    const process = submissionProcessState(row);
    const durations = computeSubmissionDurations(row, now);

    bucket.total += 1;
    totals.total += 1;

    if (!["aprobado", "entregado", "finalizado"].includes(process.code)) {
      bucket.active += 1;
      totals.active += 1;
    } else if (process.code === "entregado" || process.code === "finalizado") {
      totals.delivered += 1;
    } else {
      totals.approved += 1;
    }
    if (process.code === "devuelto" || process.code === "devuelto_analista") {
      totals.returned += 1;
    }
    bucket.status_counts[process.code] = (bucket.status_counts[process.code] || 0) + 1;

    if (durations.receptor_hours !== null) bucket._durations.receptor.push(durations.receptor_hours);
    if (durations.analista_hours !== null) bucket._durations.analista.push(durations.analista_hours);
    if (durations.aprobador_hours !== null) bucket._durations.aprobador.push(durations.aprobador_hours);
    if (durations.total_to_approved_hours !== null) bucket._durations.total_aprobado.push(durations.total_to_approved_hours);

    processRows.push({
      id: row.id,
      registro_codigo: row.registro_codigo,
      unidad_clave: unit,
      gestion_nombre: row.gestion_nombre || "Formulario General TG",
      nombre_propietario: row.nombre_propietario || "",
      estado_code: process.code,
      estado_label: process.label,
      created_at: row.created_at,
      receptor_opened_at: row.receptor_opened_at,
      sent_to_aprobador_at: row.sent_to_aprobador_at,
      approved_at: row.approved_at,
      delivered_at: row.delivered_at,
      returned_at: row.returned_at,
      returned_to_analista_at: row.returned_to_analista_at,
      assigned_analista_name: row.assigned_analista_name || row.assigned_analista_email || null,
      assigned_aprobador_name: row.assigned_aprobador_name || row.assigned_aprobador_email || null,
      ...durations
    });
  }

  const unitOrder = [...ALL_UNITS];
  const byUnit = unitOrder
    .filter((unit) => unitMap.has(unit))
    .map((unit) => {
      const bucket = unitMap.get(unit);
      return {
        unit: bucket.unit,
        total: bucket.total,
        active: bucket.active,
        status_counts: bucket.status_counts,
        avg_stage_hours: {
          receptor: averageHours(bucket._durations.receptor),
          analista: averageHours(bucket._durations.analista),
          aprobador: averageHours(bucket._durations.aprobador),
          total_aprobado: averageHours(bucket._durations.total_aprobado)
        }
      };
    });

  processRows.sort((a, b) => {
    const ta = new Date(String(a.created_at || "")).getTime();
    const tb = new Date(String(b.created_at || "")).getTime();
    return tb - ta;
  });

  return {
    generated_at: now.toISOString(),
    totals,
    by_unit: byUnit,
    processes: processRows
  };
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildSupervisorCsv(processes = []) {
  const header = [
    "registro_codigo",
    "id",
    "unidad",
    "formulario",
    "estado",
    "propietario",
    "analista",
    "aprobador",
    "fecha_envio",
    "fecha_receptor",
    "fecha_envio_aprobador",
    "fecha_aprobacion",
    "horas_receptor",
    "horas_analista",
    "horas_aprobador",
    "horas_etapa_actual"
  ];

  const lines = [header.map(csvEscape).join(",")];
  for (const row of processes) {
    const values = [
      row.registro_codigo || "",
      row.id || "",
      row.unidad_clave || "",
      row.gestion_nombre || "",
      row.estado_label || "",
      row.nombre_propietario || "",
      row.assigned_analista_name || "",
      row.assigned_aprobador_name || "",
      row.created_at || "",
      row.receptor_opened_at || "",
      row.sent_to_aprobador_at || "",
      row.approved_at || "",
      row.receptor_hours ?? "",
      row.analista_hours ?? "",
      row.aprobador_hours ?? "",
      row.current_stage_hours ?? ""
    ];
    lines.push(values.map(csvEscape).join(","));
  }

  return `\uFEFF${lines.join("\n")}`;
}


app.use(cors({
  origin(origin, callback) {
    if (isCorsOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.error("CORS_NOT_ALLOWED", {
      origin,
      allowedCorsOrigins
    });
    return callback(new Error("CORS_NOT_ALLOWED"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "100mb" }));
app.use("/api/payments", paymentRoutes);
app.use("/api/auth", authRouter);



app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/submissions", requireAuth, requireRole("user", "admin"), async (req, res) => {
  const {
    persona_tipo = "individual",
    origen_compra,
    unidad_clave = "GENERAL",
    gestion_nombre = null,
    nombre_propietario,
    representante_legal,
    documento_propietario,
    direccion,
    telefono,
    correo,
    nit,
    nombre_orden_pago,
    autorizado_nombre,
    autorizado_documento,
    autorizado_telefono,
    matricula_tg,
    matricula_tg_nueva,
    uso,
    fabricante,
    numero_serie,
    modelo,
    anio_fabricacion,
    colores,
    tipo_internacion = false,
    tipo_reservacion = false,
    tipo_inscripcion = false,
    tipo_certificado_prov = false,
    tipo_reposicion = false,
    tipo_cambio_prop = false,
    tipo_cambio_datos = false,
    tipo_certificacion = false,
    especificaciones,
    detalle_formulario,
    comentarios_revision,
    dpi_pdf_base64,
    dpi_filename,
    dpi_mime,
    financial_declaraguate_2_pdf_base64,
    financial_declaraguate_2_filename,
    financial_declaraguate_2_mime,
    financial_declaraguate_3_pdf_base64,
    financial_declaraguate_3_filename,
    financial_declaraguate_3_mime,
    financial_declaraguate_4_pdf_base64,
    financial_declaraguate_4_filename,
    financial_declaraguate_4_mime,
    financial_declaraguate_5_pdf_base64,
    financial_declaraguate_5_filename,
    financial_declaraguate_5_mime,
    acta_pdf_base64,
    acta_filename,
    acta_mime,
    registro_mercantil_pdf_base64,
    registro_mercantil_filename,
    registro_mercantil_mime,
    rpa_acta_nombramiento_pdf_base64,
    rpa_acta_nombramiento_filename,
    rpa_acta_nombramiento_mime,
    rpa_registro_representante_pdf_base64,
    rpa_registro_representante_filename,
    rpa_registro_representante_mime,
    rpa_registro_entidad_pdf_base64,
    rpa_registro_entidad_filename,
    rpa_registro_entidad_mime,
    rpa_documento_estado_pdf_base64,
    rpa_documento_estado_filename,
    rpa_documento_estado_mime,
    aila_escort_pwd_1_pdf_base64,
    aila_escort_pwd_1_filename,
    aila_escort_pwd_1_mime,
    aila_escort_pwd_2_pdf_base64,
    aila_escort_pwd_2_filename,
    aila_escort_pwd_2_mime,
    aila_escort_pwd_3_pdf_base64,
    aila_escort_pwd_3_filename,
    aila_escort_pwd_3_mime,
    carta_representacion_pdf_base64,
    carta_representacion_filename,
    carta_representacion_mime,
    payment_id
  } = req.body;

  const unidadClave = String(unidad_clave || "GENERAL").toUpperCase();
  const gestionNombre = gestion_nombre ? String(gestion_nombre).trim().slice(0, 180) : null;
  const normalizedGestionNombre = String(gestionNombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isRanDroneRequest = unidadClave === "RAN" && Boolean(gestionNombre) && /uav|rpa|distintivo|drone/i.test(gestionNombre);
  const isRanReservaRequest = unidadClave === "RAN" && (
    normalizedGestionNombre.includes("reserva") ||
    normalizedGestionNombre.includes("prorroga") ||
    normalizedGestionNombre.includes("cesion") ||
    Boolean(tipo_reservacion)
  );
  const isRanCertificacionRequest = unidadClave === "RAN" && !isRanDroneRequest && (
    normalizedGestionNombre.includes("certific") ||
    Boolean(tipo_certificacion)
  );
  const isFinancialRequest = unidadClave === "FINANCIERO";
  const isAilaRequest = unidadClave === "AILA";
  const requireOwnerDocument = isRanReservaRequest || isRanCertificacionRequest;
  const required = isFinancialRequest
    ? [
      ["nombre_propietario", nombre_propietario],
      ["representante_legal", representante_legal],
      ["documento_propietario", documento_propietario],
      ["correo", correo],
      ["telefono", telefono],
      ["nit", nit]
    ]
    : isAilaRequest
      ? [
        ["empresa_arrendatario", nombre_propietario],
        ["area_destino", direccion],
        ["telefono", telefono],
        ["correo", correo],
        ["tipo_permiso", uso]
      ]
    : [
      ["nombre_propietario", nombre_propietario],
      ["correo", correo],
      ["telefono", telefono]
    ];
  if (!isRanCertificacionRequest && !isFinancialRequest && !isAilaRequest) {
    required.push(["uso", uso]);
  }
  if (requireOwnerDocument && !isFinancialRequest) {
    required.push(["documento_propietario", documento_propietario]);
  }
  if ((isRanReservaRequest || isRanCertificacionRequest || isRanDroneRequest) && !isFinancialRequest) {
    required.push(["nit", nit]);
  }
  if (isRanReservaRequest && !isFinancialRequest) {
    required.push(["nombre_orden_pago", nombre_orden_pago]);
  }
  if (!isRanDroneRequest && !isFinancialRequest && !isAilaRequest && !isRanCertificacionRequest) {
    required.push(["matricula_tg", matricula_tg]);
    required.push(["numero_serie", numero_serie]);
  }

  const missing = required.filter(([, v]) => !hasRequiredValue(v));
  if (missing.length) {
    return res.status(400).json({ error: `Faltan campos obligatorios: ${missing.map(([k]) => k).join(", ")}` });
  }
  const correoValidation = await validateEmailAddress(correo);
  if (!correoValidation.ok) {
    return res.status(400).json({ error: correoValidation.error || "Correo no válido." });
  }
  const correoNormalizado = correoValidation.email;
  const personaTipo = String(persona_tipo || "individual").toLowerCase();
  const origenCompraRaw = String(origen_compra || "").trim().toLowerCase();
  const origenCompra = ["guatemala", "extranjero"].includes(origenCompraRaw) ? origenCompraRaw : null;
  let dpiPdfBuffer;
  let financialDeclaraguate2PdfBuffer;
  let financialDeclaraguate3PdfBuffer;
  let financialDeclaraguate4PdfBuffer;
  let financialDeclaraguate5PdfBuffer;
  let actaPdfBuffer;
  let registroMercantilPdfBuffer;
  let rpaActaNombramientoPdfBuffer;
  let rpaRegistroRepresentantePdfBuffer;
  let rpaRegistroEntidadPdfBuffer;
  let rpaDocumentoEstadoPdfBuffer;
  let cartaRepresentacionPdfBuffer;
  let ailaEscortPwd1PdfBuffer;
  let ailaEscortPwd2PdfBuffer;
  let ailaEscortPwd3PdfBuffer;
  try {
    dpiPdfBuffer = decodePdfBase64(dpi_pdf_base64, "El PDF de DPI");
    financialDeclaraguate2PdfBuffer = decodePdfBase64(financial_declaraguate_2_pdf_base64, "El PDF Declaraguate 2");
    financialDeclaraguate3PdfBuffer = decodePdfBase64(financial_declaraguate_3_pdf_base64, "El PDF Declaraguate 3");
    financialDeclaraguate4PdfBuffer = decodePdfBase64(financial_declaraguate_4_pdf_base64, "El PDF Declaraguate 4");
    financialDeclaraguate5PdfBuffer = decodePdfBase64(financial_declaraguate_5_pdf_base64, "El PDF Declaraguate 5");
    actaPdfBuffer = decodePdfBase64(acta_pdf_base64, "El PDF de acta");
    registroMercantilPdfBuffer = decodePdfBase64(registro_mercantil_pdf_base64, "El PDF de registro mercantil");
    rpaActaNombramientoPdfBuffer = decodePdfBase64(rpa_acta_nombramiento_pdf_base64, "El PDF de acta de nombramiento");
    rpaRegistroRepresentantePdfBuffer = decodePdfBase64(rpa_registro_representante_pdf_base64, "El PDF de registro del representante");
    rpaRegistroEntidadPdfBuffer = decodePdfBase64(rpa_registro_entidad_pdf_base64, "El PDF de registro de la entidad");
    rpaDocumentoEstadoPdfBuffer = decodePdfBase64(rpa_documento_estado_pdf_base64, "El PDF del documento RPA");
    cartaRepresentacionPdfBuffer = decodePdfBase64(carta_representacion_pdf_base64, "El PDF de carta de representación");
    ailaEscortPwd1PdfBuffer = decodePdfBase64(aila_escort_pwd_1_pdf_base64, "El PDF del escolta 1");
    ailaEscortPwd2PdfBuffer = decodePdfBase64(aila_escort_pwd_2_pdf_base64, "El PDF del escolta 2");
    ailaEscortPwd3PdfBuffer = decodePdfBase64(aila_escort_pwd_3_pdf_base64, "El PDF del escolta 3");
  } catch (err) {
    return res.status(400).json({ error: err.message || "Uno de los PDFs no es valido." });
  }
  if (isRanDroneRequest && !origenCompra) {
    return res.status(400).json({ error: "Para RPA debes indicar si fue comprado en Guatemala o en el extranjero." });
  }
  const requireExtraDocs = personaTipo === "juridica" || isRanDroneRequest;
  const useSingleActaAsRegistroMercantil =
    unidadClave === "RAN" &&
    !isRanDroneRequest &&
    personaTipo === "juridica";
  const requireRpaJuridicaGuatemalaDocs = isRanDroneRequest && personaTipo === "juridica" && origenCompra === "guatemala";
  const requireRpaJuridicaExtranjeroDocs = isRanDroneRequest && personaTipo === "juridica" && origenCompra === "extranjero";
  const requireRpaJuridicaSupportingDocs = requireRpaJuridicaGuatemalaDocs || requireRpaJuridicaExtranjeroDocs;
  const requireRpaJuridicaMercantilDocs = requireRpaJuridicaSupportingDocs;
  const requireRpaIndividualExtranjeroDocs = isRanDroneRequest && personaTipo === "individual" && origenCompra === "extranjero";
  const requireRpaDocumentoEstadoUpload = requireRpaJuridicaSupportingDocs || requireRpaIndividualExtranjeroDocs;
  const effectiveRegistroMercantilPdfBuffer =
    registroMercantilPdfBuffer || (useSingleActaAsRegistroMercantil ? actaPdfBuffer : null);
  const effectiveRegistroMercantilFilename =
    registro_mercantil_filename || (useSingleActaAsRegistroMercantil ? acta_filename : null);
  const effectiveRegistroMercantilMime =
    registro_mercantil_mime || (useSingleActaAsRegistroMercantil ? acta_mime : null);
  if (!["individual", "juridica"].includes(personaTipo)) {
    return res.status(400).json({ error: "persona_tipo no vÃ¡lido. Usa individual o jurÃ­dica." });
  }
  if (personaTipo === "juridica" && !String(representante_legal || "").trim()) {
    return res.status(400).json({ error: "Para persona jurÃ­dica el representante legal es obligatorio." });
  }
  if (isFinancialRequest && !cartaRepresentacionPdfBuffer) {
    return res.status(400).json({ error: "La carta de representación en PDF es obligatoria." });
  }
  if (isFinancialRequest) {
    const financialDetail = detalle_formulario && typeof detalle_formulario === "object" ? detalle_formulario : {};
    const financialProcessCode = String(financialDetail.proceso_codigo || financialDetail.gestion_codigo || "").trim();
    const requiresSolvenciaDocs = [
      "cancelacion_matricula",
      "solvencia_aeronavegabilidad",
      "solvencia_financiera_aeronave"
    ].includes(financialProcessCode);
    const requiresWeightDocs = ["derecho_inspeccion", "derecho_aproximacion"].includes(financialProcessCode);
    if (requiresSolvenciaDocs && !dpiPdfBuffer) {
      return res.status(400).json({ error: "Debes adjuntar el formulario Declaraguate 1 en PDF." });
    }
    if (requiresSolvenciaDocs && !financialDeclaraguate2PdfBuffer) {
      return res.status(400).json({ error: "Debes adjuntar el formulario Declaraguate 2 en PDF." });
    }
    if (requiresSolvenciaDocs && !financialDeclaraguate3PdfBuffer) {
      return res.status(400).json({ error: "Debes adjuntar el formulario Declaraguate 3 en PDF." });
    }
    if (requiresSolvenciaDocs && !financialDeclaraguate4PdfBuffer) {
      return res.status(400).json({ error: "Debes adjuntar el formulario Declaraguate 4 en PDF." });
    }
    if (requiresSolvenciaDocs && !financialDeclaraguate5PdfBuffer) {
      return res.status(400).json({ error: "Debes adjuntar el formulario Declaraguate 5 en PDF." });
    }
    if (requiresSolvenciaDocs && !actaPdfBuffer) {
      return res.status(400).json({ error: "Debes adjuntar la factura de inspección del año en curso." });
    }
    if (requiresSolvenciaDocs && !registroMercantilPdfBuffer) {
      return res.status(400).json({ error: "Debes adjuntar la factura de aproximación del año en curso." });
    }
    if (requiresWeightDocs && !rpaDocumentoEstadoPdfBuffer) {
      return res.status(400).json({ error: "Debes adjuntar el documento que indica el peso máximo de despegue de la aeronave." });
    }
  }
  const ailaDetail = detalle_formulario && typeof detalle_formulario === "object" ? detalle_formulario : {};
  const ailaHasTools = Array.isArray(ailaDetail.herramientas) && ailaDetail.herramientas.length > 0;
  const ailaHasVehicles = Array.isArray(ailaDetail.vehiculos) && ailaDetail.vehiculos.length > 0;
  const ailaExpiredEscortIndexes = isAilaRequest ? getAilaExpiredEscortIndexes(ailaDetail) : [];
  const ailaFilledEscortIndexes = isAilaRequest ? getAilaFilledEscortIndexes(ailaDetail) : [];
  if (isAilaRequest) {
    const ailaPeopleError = validateAilaPeopleAndEscorts(ailaDetail);
    if (ailaPeopleError) {
      return res.status(400).json({ error: ailaPeopleError });
    }
  }
  if (isAilaRequest && !cartaRepresentacionPdfBuffer) {
    return res.status(400).json({ error: "La carta de solicitud en PDF es obligatoria." });
  }
  if (isAilaRequest && !registroMercantilPdfBuffer) {
    return res.status(400).json({ error: "La factura reciente de arrendamiento/solvencia en PDF es obligatoria." });
  }
  if (isAilaRequest && !dpiPdfBuffer) {
    return res.status(400).json({ error: "El PDF de DPI, fe de edad o pasaporte de las personas es obligatorio." });
  }
  if (isAilaRequest && ailaFilledEscortIndexes.includes(1) && !ailaEscortPwd1PdfBuffer) {
    return res.status(400).json({ error: ailaExpiredEscortIndexes.includes(1) ? "Debes adjuntar el PDF de la contraseña del escolta 1." : "Debes adjuntar el PDF de la T.I.A. del escolta 1." });
  }
  if (isAilaRequest && ailaFilledEscortIndexes.includes(2) && !ailaEscortPwd2PdfBuffer) {
    return res.status(400).json({ error: ailaExpiredEscortIndexes.includes(2) ? "Debes adjuntar el PDF de la contraseña del escolta 2." : "Debes adjuntar el PDF de la T.I.A. del escolta 2." });
  }
  if (isAilaRequest && ailaFilledEscortIndexes.includes(3) && !ailaEscortPwd3PdfBuffer) {
    return res.status(400).json({ error: ailaExpiredEscortIndexes.includes(3) ? "Debes adjuntar el PDF de la contraseña del escolta 3." : "Debes adjuntar el PDF de la T.I.A. del escolta 3." });
  }
  if (isAilaRequest && ailaHasVehicles && !rpaRegistroRepresentantePdfBuffer) {
    return res.status(400).json({ error: "Debes adjuntar la tarjeta de circulaciÃ³n de cada vehÃ­culo." });
  }
  const numericValidationError = validateNumericSubmissionFields(
    { documento_propietario, telefono, autorizado_documento, autorizado_telefono },
    { requireMainPhone: true, requireOwnerDocument: requireOwnerDocument || isFinancialRequest, flexibleMainPhone: isAilaRequest, flexibleOwnerDocument: unidadClave === "RAN" }
  );
  if (numericValidationError) {
    return res.status(400).json({ error: numericValidationError });
  }
  if (!ALL_UNITS.includes(unidadClave)) {
    return res.status(400).json({ error: "unidad_clave no valida." });
  }
  if (!isFinancialRequest && requireExtraDocs && !acta_pdf_base64) {
    return res.status(400).json({
      error: isRanDroneRequest
        ? "Para RPA el Dictamen TÃ©cnico en PDF es obligatorio."
        : "Para persona jurÃ­dica el acta notarial en PDF es obligatoria."
    });
  }
  if (!isFinancialRequest && requireExtraDocs && !effectiveRegistroMercantilPdfBuffer) {
    return res.status(400).json({
      error: isRanDroneRequest
          ? "Para RPA la Copia autÃ©ntica de la Factura de compra o Acta Notarial de DeclaraciÃ³n Jurada en PDF es obligatoria."
          : "Para persona jurÃ­dica el registro mercantil en PDF es obligatorio."
    });
  }
  if (!isFinancialRequest && requireRpaDocumentoEstadoUpload && !rpa_documento_estado_pdf_base64) {
    return res.status(400).json({
      error: requireRpaIndividualExtranjeroDocs
        ? "Para RPA comprado en el extranjero por persona individual, la copia legalizada de importaciÃ³n de la aeronave o DUCA con pago en PDF es obligatoria."
        : "Para RPA persona jurÃ­dica, el documento de acreditaciÃ³n en PDF es obligatorio."
    });
  }
  if (!isFinancialRequest && requireRpaJuridicaExtranjeroDocs && !carta_representacion_pdf_base64) {
    return res.status(400).json({
      error: "Para RPA comprado en el extranjero por persona jurÃ­dica, la copia legalizada de la pÃ³liza de importaciÃ³n o DUCA con pago en PDF es obligatoria."
    });
  }
  if (!isFinancialRequest && requireRpaJuridicaSupportingDocs && !rpa_acta_nombramiento_pdf_base64) {
    return res.status(400).json({
      error: "Debes adjuntar la copia simple del Acta Notarial de Nombramiento del representante legal."
    });
  }
  if (!isFinancialRequest && requireRpaJuridicaMercantilDocs && !rpa_registro_representante_pdf_base64) {
    return res.status(400).json({
      error: "Debes adjuntar la certificaciÃ³n de inscripciÃ³n del representante legal en el Registro Mercantil."
    });
  }
  if (!isFinancialRequest && requireRpaJuridicaMercantilDocs && !rpa_registro_entidad_pdf_base64) {
    return res.status(400).json({
      error: "Debes adjuntar la certificaciÃ³n de inscripciÃ³n de la entidad en el Registro Mercantil."
    });
  }

  const now = new Date();
  const fechaActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
 
// Valida que el pago exista y estÃ© aprobado
  if (payment_id) {
    const paymentCheck = await pool.query(
      `SELECT * FROM payments WHERE id = $1`,
     [payment_id]
    );

   if (!paymentCheck.rowCount) {
      return res.status(400).json({
        error: "El pago indicado no existe."
      });
    }

  const payment = paymentCheck.rows[0];

  if (payment.status !== "approved") {
    return res.status(400).json({
      error: "El pago no está aprobado."
    });
  }
}


  let created;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const registroCodigo = await reserveSubmissionCode(client, unidadClave, now);
    const result = await client.query(
      `
        INSERT INTO submissions (
          fecha,
          persona_tipo,
          origen_compra,
          unidad_clave,
          gestion_nombre,
          registro_codigo,
          nombre_propietario,
          representante_legal,
          documento_propietario,
          direccion,
          telefono,
          correo,
          nit,
          nombre_orden_pago,
          autorizado_nombre,
          autorizado_documento,
          autorizado_telefono,
          matricula_tg,
          matricula_tg_nueva,
          uso,
          fabricante,
          numero_serie,
          modelo,
          anio_fabricacion,
          colores,
          tipo_internacion,
          tipo_reservacion,
          tipo_inscripcion,
          tipo_certificado_prov,
          tipo_reposicion,
          tipo_cambio_prop,
          tipo_cambio_datos,
          tipo_certificacion,
          especificaciones,
          detalle_formulario,
          comentarios_revision,
          dpi_pdf,
          dpi_filename,
          dpi_mime,
          acta_pdf,
          acta_filename,
          acta_mime,
          registro_mercantil_pdf,
          registro_mercantil_filename,
          registro_mercantil_mime,
          rpa_acta_nombramiento_pdf,
          rpa_acta_nombramiento_filename,
          rpa_acta_nombramiento_mime,
          rpa_registro_representante_pdf,
          rpa_registro_representante_filename,
          rpa_registro_representante_mime,
          rpa_registro_entidad_pdf,
          rpa_registro_entidad_filename,
          rpa_registro_entidad_mime,
          rpa_documento_estado_pdf,
          rpa_documento_estado_filename,
          rpa_documento_estado_mime,
          carta_representacion_pdf,
          carta_representacion_filename,
          carta_representacion_mime,
          created_by_user_id,
          payment_id
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
          $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
          $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
          $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62
        )
        RETURNING *
      `,
      [
        fechaActual,
        personaTipo,
        origenCompra,
        unidadClave,
        gestionNombre,
        registroCodigo,
        nombre_propietario,
        representante_legal || null,
        documento_propietario || null,
        direccion || null,
        telefono || null,
        correoNormalizado,
        nit || null,
        nombre_orden_pago || null,
        autorizado_nombre || null,
        autorizado_documento || null,
        autorizado_telefono || null,
        matricula_tg || null,
        matricula_tg_nueva || null,
        uso || null,
        fabricante || null,
        numero_serie || null,
        modelo || null,
        anio_fabricacion || null,
        colores || null,
        Boolean(tipo_internacion),
        Boolean(tipo_reservacion),
        Boolean(tipo_inscripcion),
        Boolean(tipo_certificado_prov),
        Boolean(tipo_reposicion),
        Boolean(tipo_cambio_prop),
        Boolean(tipo_cambio_datos),
        Boolean(tipo_certificacion),
        especificaciones || null,
        detalle_formulario && typeof detalle_formulario === "object" ? detalle_formulario : null,
        comentarios_revision || null,
        dpiPdfBuffer,
        dpi_filename || null,
        dpi_mime || null,
        actaPdfBuffer,
        acta_filename || null,
        acta_mime || null,
        effectiveRegistroMercantilPdfBuffer,
        effectiveRegistroMercantilFilename || null,
        effectiveRegistroMercantilMime || null,
        rpaActaNombramientoPdfBuffer,
        rpa_acta_nombramiento_filename || null,
        rpa_acta_nombramiento_mime || null,
        rpaRegistroRepresentantePdfBuffer,
        rpa_registro_representante_filename || null,
        rpa_registro_representante_mime || null,
        rpaRegistroEntidadPdfBuffer,
        rpa_registro_entidad_filename || null,
        rpa_registro_entidad_mime || null,
        rpaDocumentoEstadoPdfBuffer,
        rpa_documento_estado_filename || null,
        rpa_documento_estado_mime || null,
        cartaRepresentacionPdfBuffer,
        carta_representacion_filename || null,
        carta_representacion_mime || null,
        req.user?.sub || null,
        payment_id || null
      ]
    );
    if (isFinancialRequest) {
      const financialDeclaraguateResult = await client.query(
        `UPDATE submissions
         SET financial_declaraguate_2_pdf = $1,
             financial_declaraguate_2_filename = $2,
             financial_declaraguate_2_mime = $3,
             financial_declaraguate_3_pdf = $4,
             financial_declaraguate_3_filename = $5,
             financial_declaraguate_3_mime = $6,
             financial_declaraguate_4_pdf = $7,
             financial_declaraguate_4_filename = $8,
             financial_declaraguate_4_mime = $9,
             financial_declaraguate_5_pdf = $10,
             financial_declaraguate_5_filename = $11,
             financial_declaraguate_5_mime = $12
         WHERE id = $13
         RETURNING *`,
        [
          financialDeclaraguate2PdfBuffer,
          financial_declaraguate_2_filename || null,
          financial_declaraguate_2_mime || null,
          financialDeclaraguate3PdfBuffer,
          financial_declaraguate_3_filename || null,
          financial_declaraguate_3_mime || null,
          financialDeclaraguate4PdfBuffer,
          financial_declaraguate_4_filename || null,
          financial_declaraguate_4_mime || null,
          financialDeclaraguate5PdfBuffer,
          financial_declaraguate_5_filename || null,
          financial_declaraguate_5_mime || null,
          result.rows[0].id
        ]
      );
      created = financialDeclaraguateResult.rows[0];
    } else {
      created = result.rows[0];
    }
    if (isAilaRequest && (ailaEscortPwd1PdfBuffer || ailaEscortPwd2PdfBuffer || ailaEscortPwd3PdfBuffer)) {
      const ailaEscortDocsResult = await client.query(
        `UPDATE submissions
         SET aila_escort_pwd_1_pdf = COALESCE($1, aila_escort_pwd_1_pdf),
             aila_escort_pwd_1_filename = COALESCE($2, aila_escort_pwd_1_filename),
             aila_escort_pwd_1_mime = COALESCE($3, aila_escort_pwd_1_mime),
             aila_escort_pwd_2_pdf = COALESCE($4, aila_escort_pwd_2_pdf),
             aila_escort_pwd_2_filename = COALESCE($5, aila_escort_pwd_2_filename),
             aila_escort_pwd_2_mime = COALESCE($6, aila_escort_pwd_2_mime),
             aila_escort_pwd_3_pdf = COALESCE($7, aila_escort_pwd_3_pdf),
             aila_escort_pwd_3_filename = COALESCE($8, aila_escort_pwd_3_filename),
             aila_escort_pwd_3_mime = COALESCE($9, aila_escort_pwd_3_mime)
         WHERE id = $10
         RETURNING *`,
        [
          ailaEscortPwd1PdfBuffer,
          aila_escort_pwd_1_filename || null,
          aila_escort_pwd_1_mime || null,
          ailaEscortPwd2PdfBuffer,
          aila_escort_pwd_2_filename || null,
          aila_escort_pwd_2_mime || null,
          ailaEscortPwd3PdfBuffer,
          aila_escort_pwd_3_filename || null,
          aila_escort_pwd_3_mime || null,
          result.rows[0].id
        ]
      );
      created = ailaEscortDocsResult.rows[0];
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  try {
    await registerSubmissionLog({
      submissionId: created.id,
      eventCode: "usuario_envio",
      eventLabel: "Usuario enviÃ³ el formulario",
      eventDetail: `${unidadClave === "FINANCIERO" ? "DEPARTAMENTO FINANCIERO" : `Unidad ${unidadClave}`}${gestionNombre ? ` - ${gestionNombre}` : ""}`,
      actorUserId: req.user?.sub || null,
      actorRole: req.user?.role || "user",
      metadata: {
        persona_tipo: personaTipo,
        origen_compra: origenCompra,
        unidad_clave: unidadClave,
        gestion_nombre: gestionNombre || null
      }
    });
    res.status(201).json(created);

    // Alerta por correo (no bloqueante)
    sendAlertEmail({
      subject: "Nuevo formulario TG",
      html: `<p>Se recibio un nuevo formulario TG.</p>
             <p><strong>Registro:</strong> ${created.registro_codigo || created.id}<br/>
             <p><strong>Propietario:</strong> ${nombre_propietario || "N/D"}<br/>
             <strong>Correo:</strong> ${correoNormalizado || "N/D"}<br/>
             <strong>MatrÃ­cula TG:</strong> ${matricula_tg || "N/D"}</p>`
    });
  } catch (err) {
    console.error("Error saving submission", err);
    res.status(500).json({ error: "Failed to save submission" });
  }
});

app.put("/api/submissions/:id", requireAuth, requireRole("analista", "admin", "supervisor"), async (_req, res) => {
  return res.status(403).json({
    error: "Solo el usuario puede modificar datos del formulario. Devuelve el formulario para correcciÃ³n."
  });
});

app.get("/api/submissions", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isAilaReception = role === AILA_ROLE_RECEPCION;
    const isAilaAdministration = isAilaStage2Role(role);
    const isAilaUetia = isAilaStage3Role(role);
    const isAilaJefatura = isAilaStage4Role(role);
    const isFinancialAvsec = role === FINANCIAL_ROLE_AVSEC;
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = [];
    const params = [];
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`s.unidad_clave = ANY($${params.length})`);
    }
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`s.assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`s.assigned_emisor_id = $${params.length}`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`s.assigned_aprobador_id = $${params.length}`);
    }
    if (isAilaReception) {
      where.push(`s.unidad_clave = 'AILA'`);
      where.push(`LOWER(COALESCE(s.detalle_formulario->>'tipo_permiso', s.uso, '')) = 'generico'`);
    }
    if (isAilaAdministration) {
      params.push(req.user?.sub);
      where.push(`s.assigned_analista_id = $${params.length}`);
      where.push(`s.unidad_clave = 'AILA'`);
      where.push(`LOWER(COALESCE(s.detalle_formulario->>'tipo_permiso', s.uso, '')) = 'generico'`);
    }
    if (isAilaUetia) {
      params.push(req.user?.sub);
      where.push(`s.assigned_emisor_id = $${params.length}`);
      where.push(`s.unidad_clave = 'AILA'`);
      where.push(`LOWER(COALESCE(s.detalle_formulario->>'tipo_permiso', s.uso, '')) = 'generico'`);
    }
    if (isAilaJefatura) {
      params.push(req.user?.sub);
      where.push(`s.assigned_aprobador_id = $${params.length}`);
      where.push(`s.unidad_clave = 'AILA'`);
      where.push(`LOWER(COALESCE(s.detalle_formulario->>'tipo_permiso', s.uso, '')) = 'generico'`);
    }
    if (isFinancialAvsec) {
      where.push(`s.unidad_clave = 'FINANCIERO'`);
      where.push(`COALESCE(s.detalle_formulario->>'gestion_grupo_codigo', '') = 'solvencias'`);
      where.push(`COALESCE(s.detalle_formulario->>'proceso_codigo', '') = 'gestion_tia'`);
      where.push(`s.approved_at IS NOT NULL`);
      where.push(`s.signed_pdf IS NOT NULL`);
    }
    const result = await pool.query(`
      SELECT
        s.id, s.created_at, s.fecha, s.persona_tipo, s.origen_compra, s.unidad_clave, s.gestion_nombre, s.registro_codigo, s.nombre_propietario, s.representante_legal, s.documento_propietario, s.direccion, s.telefono, s.correo, s.nit, s.nombre_orden_pago,
        s.autorizado_nombre, s.autorizado_documento, s.autorizado_telefono,
        s.matricula_tg, s.matricula_tg_nueva, s.uso, s.fabricante, s.numero_serie, s.modelo, s.anio_fabricacion, s.colores,
        s.tipo_internacion, s.tipo_reservacion, s.tipo_inscripcion, s.tipo_certificado_prov, s.tipo_reposicion,
        s.tipo_cambio_prop, s.tipo_cambio_datos, s.tipo_certificacion, s.especificaciones, s.detalle_formulario, s.comentarios_revision,
        s.dpi_filename, s.dpi_mime, (s.dpi_pdf IS NOT NULL) AS has_dpi,
        s.financial_declaraguate_2_filename, s.financial_declaraguate_2_mime, (s.financial_declaraguate_2_pdf IS NOT NULL) AS has_financial_declaraguate_2,
        s.financial_declaraguate_3_filename, s.financial_declaraguate_3_mime, (s.financial_declaraguate_3_pdf IS NOT NULL) AS has_financial_declaraguate_3,
        s.financial_declaraguate_4_filename, s.financial_declaraguate_4_mime, (s.financial_declaraguate_4_pdf IS NOT NULL) AS has_financial_declaraguate_4,
        s.financial_declaraguate_5_filename, s.financial_declaraguate_5_mime, (s.financial_declaraguate_5_pdf IS NOT NULL) AS has_financial_declaraguate_5,
        s.acta_filename, s.acta_mime, (s.acta_pdf IS NOT NULL) AS has_acta,
        s.registro_mercantil_filename, s.registro_mercantil_mime, (s.registro_mercantil_pdf IS NOT NULL) AS has_registro_mercantil,
        s.rpa_acta_nombramiento_filename, s.rpa_acta_nombramiento_mime, (s.rpa_acta_nombramiento_pdf IS NOT NULL) AS has_rpa_acta_nombramiento,
        s.rpa_registro_representante_filename, s.rpa_registro_representante_mime, (s.rpa_registro_representante_pdf IS NOT NULL) AS has_rpa_registro_representante,
        s.rpa_registro_entidad_filename, s.rpa_registro_entidad_mime, (s.rpa_registro_entidad_pdf IS NOT NULL) AS has_rpa_registro_entidad,
        s.rpa_documento_estado_filename, s.rpa_documento_estado_mime, (s.rpa_documento_estado_pdf IS NOT NULL) AS has_rpa_documento_estado,
        s.carta_representacion_filename, s.carta_representacion_mime, (s.carta_representacion_pdf IS NOT NULL) AS has_carta_representacion,
        s.analyst_pdf_filename,
        s.analyst_pdf_mime,
        s.analyst_pdf_uploaded_at,
        s.analyst_pdf_uploaded_by_user_id,
        (s.analyst_pdf IS NOT NULL) AS has_analyst_pdf,
        s.signed_pdf_filename,
        s.signed_pdf_mime,
        s.signed_pdf_uploaded_at,
        (s.signed_pdf IS NOT NULL) AS has_signed_pdf,
        s.receptor_opened_at,
        s.approved_at,
        s.approved_by_user_id,
        s.rejected_at,
        s.rejected_by_user_id,
        s.rejected_reason,
        s.delivered_at,
        s.delivered_by_user_id,
        s.returned_at,
        s.returned_reason,
        s.returned_by_user_id,
        s.returned_to_analista_at,
        s.returned_to_analista_reason,
        s.returned_to_analista_by_user_id,
        s.assigned_analista_id,
        s.assigned_emisor_id,
        s.assigned_aprobador_id,
        s.sent_to_emisor_at,
        s.sent_to_aprobador_at,
        a.email AS assigned_analista_email,
        a.name AS assigned_analista_name,
        e.email AS assigned_emisor_email,
        e.name AS assigned_emisor_name,
        ap.email AS assigned_aprobador_email,
        ap.name AS assigned_aprobador_name
      FROM submissions
      s
      LEFT JOIN users a ON a.id = s.assigned_analista_id
      LEFT JOIN users e ON e.id = s.assigned_emisor_id
      LEFT JOIN users ap ON ap.id = s.assigned_aprobador_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error reading submissions", err);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

app.get("/api/submissions/search", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const query = String(req.query?.q || "").trim();
    const requestedUnit = String(req.query?.unit || "").trim().toUpperCase();
    const where = [];
    const params = [];

    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`s.unidad_clave = ANY($${params.length})`);
    }
    if (requestedUnit && requestedUnit !== "TODAS") {
      params.push(requestedUnit);
      where.push(`s.unidad_clave = $${params.length}`);
    }
    if (query) {
      params.push(`%${query}%`);
      const pattern = `$${params.length}`;
      where.push(`(
        s.registro_codigo ILIKE ${pattern}
        OR s.gestion_nombre ILIKE ${pattern}
        OR s.nombre_propietario ILIKE ${pattern}
        OR COALESCE(s.representante_legal, '') ILIKE ${pattern}
        OR s.correo ILIKE ${pattern}
        OR COALESCE(s.nit, '') ILIKE ${pattern}
        OR COALESCE(s.telefono, '') ILIKE ${pattern}
        OR COALESCE(s.documento_propietario, '') ILIKE ${pattern}
        OR COALESCE(s.matricula_tg, '') ILIKE ${pattern}
        OR COALESCE(s.matricula_tg_nueva, '') ILIKE ${pattern}
        OR COALESCE(s.detalle_formulario::text, '') ILIKE ${pattern}
      )`);
    }

    const result = await pool.query(
      `SELECT
         s.id, s.created_at, s.fecha, s.persona_tipo, s.origen_compra, s.unidad_clave, s.gestion_nombre, s.registro_codigo,
         s.nombre_propietario, s.representante_legal, s.documento_propietario, s.direccion, s.telefono, s.correo, s.nit,
         s.nombre_orden_pago, s.autorizado_nombre, s.autorizado_documento, s.autorizado_telefono,
         s.matricula_tg, s.matricula_tg_nueva, s.uso, s.fabricante, s.numero_serie, s.modelo, s.anio_fabricacion,
         s.colores, s.especificaciones, s.detalle_formulario, s.comentarios_revision,
         s.receptor_opened_at, s.approved_at, s.delivered_at, s.returned_at, s.returned_reason,
         s.returned_to_analista_at, s.returned_to_analista_reason, s.assigned_analista_id, s.assigned_emisor_id,
         s.assigned_aprobador_id, s.sent_to_emisor_at, s.sent_to_aprobador_at,
         a.name AS assigned_analista_name, a.email AS assigned_analista_email,
         e.name AS assigned_emisor_name, e.email AS assigned_emisor_email,
         ap.name AS assigned_aprobador_name, ap.email AS assigned_aprobador_email
       FROM submissions s
       LEFT JOIN users a ON a.id = s.assigned_analista_id
       LEFT JOIN users e ON e.id = s.assigned_emisor_id
       LEFT JOIN users ap ON ap.id = s.assigned_aprobador_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY s.created_at DESC
       LIMIT 100`,
      params
    );

    const rows = result.rows.map((row) => {
      const process = submissionProcessState(row);
      return {
        ...row,
        process_code: process.code,
        process_label: process.label,
        process_step: process.step,
        process_percent: process.percent
      };
    });
    return res.json(rows);
  } catch (err) {
    console.error("Error searching submissions", err);
    return res.status(500).json({ error: "No se pudo realizar la búsqueda." });
  }
});

app.get("/api/submissions/:id/logs", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isAilaReception = role === AILA_ROLE_RECEPCION;
    const isAilaAdministration = isAilaStage2Role(role);
    const isAilaUetia = isAilaStage3Role(role);
    const isAilaJefatura = isAilaStage4Role(role);
    const isFinancialAvsec = role === FINANCIAL_ROLE_AVSEC;
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];

    const accessWhere = ["id = $1"];
    const accessParams = [id];
    if (isUnitRestricted) {
      accessParams.push(unitAccess);
      accessWhere.push(`unidad_clave = ANY($${accessParams.length})`);
    }
    if (isAnalyst) {
      accessParams.push(req.user?.sub);
      accessWhere.push(`assigned_analista_id = $${accessParams.length}`);
    }
    if (isEmitter) {
      accessParams.push(req.user?.sub);
      accessWhere.push(`assigned_emisor_id = $${accessParams.length}`);
    }
    if (isApprover) {
      accessParams.push(req.user?.sub);
      accessWhere.push(`assigned_aprobador_id = $${accessParams.length}`);
    }
    if (isAilaReception) {
      accessWhere.push(`unidad_clave = 'AILA'`);
      accessWhere.push(`LOWER(COALESCE(detalle_formulario->>'tipo_permiso', uso, '')) = 'generico'`);
    }
    if (isAilaAdministration) {
      accessParams.push(req.user?.sub);
      accessWhere.push(`assigned_analista_id = $${accessParams.length}`);
      accessWhere.push(`unidad_clave = 'AILA'`);
      accessWhere.push(`LOWER(COALESCE(detalle_formulario->>'tipo_permiso', uso, '')) = 'generico'`);
    }
    if (isAilaUetia) {
      accessParams.push(req.user?.sub);
      accessWhere.push(`assigned_emisor_id = $${accessParams.length}`);
      accessWhere.push(`unidad_clave = 'AILA'`);
      accessWhere.push(`LOWER(COALESCE(detalle_formulario->>'tipo_permiso', uso, '')) = 'generico'`);
    }
    if (isAilaJefatura) {
      accessParams.push(req.user?.sub);
      accessWhere.push(`assigned_aprobador_id = $${accessParams.length}`);
      accessWhere.push(`unidad_clave = 'AILA'`);
      accessWhere.push(`LOWER(COALESCE(detalle_formulario->>'tipo_permiso', uso, '')) = 'generico'`);
    }
    if (isFinancialAvsec) {
      accessWhere.push(`unidad_clave = 'FINANCIERO'`);
      accessWhere.push(`COALESCE(detalle_formulario->>'gestion_grupo_codigo', '') = 'solvencias'`);
      accessWhere.push(`COALESCE(detalle_formulario->>'proceso_codigo', '') = 'gestion_tia'`);
      accessWhere.push(`approved_at IS NOT NULL`);
      accessWhere.push(`signed_pdf IS NOT NULL`);
    }
    const accessResult = await pool.query(
      `SELECT id FROM submissions WHERE ${accessWhere.join(" AND ")}`,
      accessParams
    );
    if (!accessResult.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado." });
    }

    const logs = await pool.query(
      `SELECT
         l.id,
         l.submission_id,
         l.event_code,
         l.event_label,
         l.event_detail,
         l.actor_user_id,
         l.actor_role,
         l.metadata,
         l.created_at,
         u.name AS actor_name,
         u.email AS actor_email
       FROM submission_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE l.submission_id = $1
       ORDER BY l.created_at DESC, l.id DESC`,
      [id]
    );
    return res.json(logs.rows);
  } catch (err) {
    console.error("Error reading submission logs", err);
    return res.status(500).json({ error: "No se pudo obtener la bitácora." });
  }
});

app.get("/api/financial-approved-history", requireAuth, requireRole("aprobador"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         s.id,
         s.registro_codigo,
         s.gestion_nombre,
         s.nombre_propietario,
         s.correo,
         s.unidad_clave,
         s.detalle_formulario,
         COALESCE(l.created_at, s.approved_at, s.sent_to_aprobador_at, s.created_at) AS approved_log_at
       FROM submissions s
       LEFT JOIN LATERAL (
         SELECT sl.created_at
         FROM submission_logs sl
         WHERE sl.submission_id = s.id
           AND sl.actor_user_id = $1
           AND sl.actor_role = 'aprobador'
           AND sl.event_code = 'aprobacion'
         ORDER BY sl.created_at DESC, sl.id DESC
         LIMIT 1
       ) l ON true
       WHERE s.unidad_clave = 'FINANCIERO'
         AND s.approved_by_user_id = $1
         AND (
           s.approved_at IS NOT NULL
           OR s.sent_to_aprobador_at IS NOT NULL
           OR l.created_at IS NOT NULL
         )
       ORDER BY COALESCE(l.created_at, s.approved_at, s.sent_to_aprobador_at, s.created_at) DESC, s.id DESC`,
      [req.user?.sub]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("Error reading financial approved history", err);
    return res.status(500).json({ error: "No se pudo obtener el historial de aprobaciones de Financiero." });
  }
});

app.get("/api/financial-approved-history/:id", requireAuth, requireRole("aprobador"), async (req, res) => {
  const submissionId = Number(req.params.id);
  if (!Number.isInteger(submissionId) || submissionId <= 0) {
    return res.status(400).json({ error: "ID no válido." });
  }
  try {
    const submissionResult = await pool.query(
      `SELECT
         s.id,
         s.registro_codigo,
         s.gestion_nombre,
         s.nombre_propietario,
         s.correo,
         s.unidad_clave,
         s.created_at,
         s.sent_to_emisor_at,
         s.sent_to_aprobador_at,
         s.approved_at,
         s.delivered_at,
         s.detalle_formulario,
         a.name AS assigned_analista_name,
         e.name AS assigned_emisor_name,
         ap.name AS assigned_aprobador_name
       FROM submissions s
       LEFT JOIN users a ON a.id = s.assigned_analista_id
       LEFT JOIN users e ON e.id = s.assigned_emisor_id
       LEFT JOIN users ap ON ap.id = s.assigned_aprobador_id
       WHERE s.id = $1
         AND s.unidad_clave = 'FINANCIERO'
         AND s.approved_by_user_id = $2`,
      [submissionId, req.user?.sub]
    );
    if (!submissionResult.rowCount) {
      return res.status(404).json({ error: "Proceso aprobado no encontrado." });
    }

    const logsResult = await pool.query(
      `SELECT
         l.id,
         l.submission_id,
         l.event_code,
         l.event_label,
         l.event_detail,
         l.actor_user_id,
         l.actor_role,
         l.metadata,
         l.created_at,
         u.name AS actor_name,
         u.email AS actor_email
       FROM submission_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE l.submission_id = $1
       ORDER BY l.created_at DESC, l.id DESC`,
      [submissionId]
    );

    return res.json({
      submission: submissionResult.rows[0],
      logs: logsResult.rows
    });
  } catch (err) {
    console.error("Error reading financial approved history detail", err);
    return res.status(500).json({ error: "No se pudo obtener el detalle del proceso aprobado." });
  }
});

app.get("/api/supervisor/dashboard", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  try {
    const requestedUnit = String(req.query?.unit || "").trim().toUpperCase();
    const filters = [];
    const params = [];
    if (requestedUnit) {
      if (!ALL_UNITS.includes(requestedUnit)) {
        return res.status(400).json({ error: "Unidad no vÃ¡lida." });
      }
      params.push(requestedUnit);
      filters.push(`s.unidad_clave = $${params.length}`);
    }

    const rowsResult = await pool.query(
      `SELECT
         s.id,
         s.registro_codigo,
         s.unidad_clave,
         s.gestion_nombre,
         s.detalle_formulario,
         s.nombre_propietario,
         s.created_at,
         s.receptor_opened_at,
         s.sent_to_aprobador_at,
         s.approved_at,
         s.delivered_at,
         s.returned_at,
         s.returned_to_analista_at,
         s.analyst_pdf_filename,
         (s.analyst_pdf IS NOT NULL) AS has_analyst_pdf,
         s.assigned_analista_id,
         s.assigned_aprobador_id,
         a.name AS assigned_analista_name,
         a.email AS assigned_analista_email,
         ap.name AS assigned_aprobador_name,
         ap.email AS assigned_aprobador_email
       FROM submissions s
       LEFT JOIN users a ON a.id = s.assigned_analista_id
       LEFT JOIN users ap ON ap.id = s.assigned_aprobador_id
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY s.created_at DESC`,
      params
    );

    const dashboard = buildSupervisorDashboard(rowsResult.rows);
    return res.json(dashboard);
  } catch (err) {
    console.error("Error building supervisor dashboard", err);
    return res.status(500).json({ error: "No se pudo obtener el dashboard." });
  }
});

app.get("/api/supervisor/report", requireAuth, requireRole("supervisor", "admin"), async (req, res) => {
  try {
    const requestedUnit = String(req.query?.unit || "").trim().toUpperCase();
    const includeActive = String(req.query?.scope || "").trim().toLowerCase() === "active";
    const filters = [];
    const params = [];
    if (requestedUnit) {
      if (!ALL_UNITS.includes(requestedUnit)) {
        return res.status(400).json({ error: "Unidad no vÃ¡lida." });
      }
      params.push(requestedUnit);
      filters.push(`s.unidad_clave = $${params.length}`);
    }

    const rowsResult = await pool.query(
      `SELECT
         s.id,
         s.registro_codigo,
         s.unidad_clave,
         s.gestion_nombre,
         s.detalle_formulario,
         s.nombre_propietario,
         s.created_at,
         s.receptor_opened_at,
         s.sent_to_aprobador_at,
         s.approved_at,
         s.delivered_at,
         s.returned_at,
         s.returned_to_analista_at,
         s.analyst_pdf_filename,
         (s.analyst_pdf IS NOT NULL) AS has_analyst_pdf,
         s.assigned_analista_id,
         s.assigned_aprobador_id,
         a.name AS assigned_analista_name,
         a.email AS assigned_analista_email,
         ap.name AS assigned_aprobador_name,
         ap.email AS assigned_aprobador_email
       FROM submissions s
       LEFT JOIN users a ON a.id = s.assigned_analista_id
       LEFT JOIN users ap ON ap.id = s.assigned_aprobador_id
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY s.created_at DESC`,
      params
    );

    const dashboard = buildSupervisorDashboard(rowsResult.rows);
    const selected = includeActive
      ? dashboard.processes.filter((row) => row.estado_code !== "aprobado")
      : dashboard.processes;
    const csv = buildSupervisorCsv(selected);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"reporte-supervision-${stamp}.csv\"`);
    return res.send(csv);
  } catch (err) {
    console.error("Error generating supervisor report", err);
    return res.status(500).json({ error: "No se pudo generar el reporte." });
  }
});

app.get("/api/my-submissions", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         s.id,
         s.created_at,
         s.origen_compra,
         s.unidad_clave,
         s.gestion_nombre,
         s.detalle_formulario,
         s.registro_codigo,
         s.nombre_propietario,
         s.persona_tipo,
         s.correo,
         s.matricula_tg,
         s.uso,
         s.receptor_opened_at,
         s.assigned_analista_id,
         s.assigned_emisor_id,
         s.assigned_aprobador_id,
         s.sent_to_emisor_at,
         s.sent_to_aprobador_at,
         s.approved_at,
         s.rejected_at,
         s.rejected_by_user_id,
         s.rejected_reason,
         s.delivered_at,
         (s.dpi_pdf IS NOT NULL) AS has_dpi,
         s.returned_at,
         s.returned_reason,
         s.returned_by_user_id,
         s.returned_to_analista_at,
         s.returned_to_analista_reason,
         s.returned_to_analista_by_user_id,
         s.analyst_pdf_filename,
         s.analyst_pdf_mime,
         s.analyst_pdf_uploaded_at,
         s.analyst_pdf_uploaded_by_user_id,
         (s.analyst_pdf IS NOT NULL) AS has_analyst_pdf,
         s.signed_pdf_filename,
         s.signed_pdf_mime,
         s.signed_pdf_uploaded_at,
         (s.signed_pdf IS NOT NULL) AS has_signed_pdf,
         (s.acta_pdf IS NOT NULL) AS has_acta,
         (s.registro_mercantil_pdf IS NOT NULL) AS has_registro_mercantil,
         (s.rpa_acta_nombramiento_pdf IS NOT NULL) AS has_rpa_acta_nombramiento,
         (s.rpa_registro_representante_pdf IS NOT NULL) AS has_rpa_registro_representante,
         (s.rpa_registro_entidad_pdf IS NOT NULL) AS has_rpa_registro_entidad,
         (s.rpa_documento_estado_pdf IS NOT NULL) AS has_rpa_documento_estado,
         s.carta_representacion_filename,
         s.carta_representacion_mime,
         (s.carta_representacion_pdf IS NOT NULL) AS has_carta_representacion,
         sf.rating_value AS feedback_rating,
         sf.comment AS feedback_comment,
         sf.created_at AS feedback_created_at,
         a.name AS assigned_analista_name,
         a.email AS assigned_analista_email,
         e.name AS assigned_emisor_name,
         e.email AS assigned_emisor_email,
         ap.name AS assigned_aprobador_name,
         ap.email AS assigned_aprobador_email
       FROM submissions s
       LEFT JOIN submission_feedback sf ON sf.submission_id = s.id AND sf.user_id = $1
       LEFT JOIN users a ON a.id = s.assigned_analista_id
       LEFT JOIN users e ON e.id = s.assigned_emisor_id
       LEFT JOIN users ap ON ap.id = s.assigned_aprobador_id
       WHERE s.created_by_user_id = $1
          OR (s.created_by_user_id IS NULL AND LOWER(s.correo) = LOWER($2))
       ORDER BY s.created_at DESC`,
      [req.user?.sub, req.user?.email || ""]
    );

    const rows = result.rows.map((row) => {
      const process = submissionProcessState(row);
      return {
        ...row,
        process_code: process.code,
        process_label: process.label,
        process_step: process.step,
        process_percent: process.percent
      };
    });
    return res.json(rows);
  } catch (err) {
    console.error("Error reading my submissions", err);
    return res.status(500).json({ error: "No se pudo obtener el seguimiento." });
  }
});

app.get("/api/my-submissions/:id", requireAuth, requireRole("user"), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT
         id, created_at, fecha, persona_tipo, origen_compra, unidad_clave, gestion_nombre, registro_codigo, nombre_propietario, representante_legal, documento_propietario, direccion, telefono, correo,
         nit, nombre_orden_pago, autorizado_nombre, autorizado_documento, autorizado_telefono,
         matricula_tg, matricula_tg_nueva, uso, fabricante, numero_serie, modelo, anio_fabricacion, colores,
         tipo_internacion, tipo_reservacion, tipo_inscripcion, tipo_certificado_prov, tipo_reposicion,
         tipo_cambio_prop, tipo_cambio_datos, tipo_certificacion, especificaciones, detalle_formulario, comentarios_revision,
         dpi_filename, dpi_mime, (dpi_pdf IS NOT NULL) AS has_dpi,
         financial_declaraguate_2_filename, financial_declaraguate_2_mime, (financial_declaraguate_2_pdf IS NOT NULL) AS has_financial_declaraguate_2,
         financial_declaraguate_3_filename, financial_declaraguate_3_mime, (financial_declaraguate_3_pdf IS NOT NULL) AS has_financial_declaraguate_3,
         financial_declaraguate_4_filename, financial_declaraguate_4_mime, (financial_declaraguate_4_pdf IS NOT NULL) AS has_financial_declaraguate_4,
         financial_declaraguate_5_filename, financial_declaraguate_5_mime, (financial_declaraguate_5_pdf IS NOT NULL) AS has_financial_declaraguate_5,
         acta_filename, acta_mime, (acta_pdf IS NOT NULL) AS has_acta,
         carta_representacion_filename, carta_representacion_mime, (carta_representacion_pdf IS NOT NULL) AS has_carta_representacion,
         aila_escort_pwd_1_filename, aila_escort_pwd_1_mime,
         (aila_escort_pwd_1_pdf IS NOT NULL) AS has_aila_escort_pwd_1,
         aila_escort_pwd_2_filename, aila_escort_pwd_2_mime,
         (aila_escort_pwd_2_pdf IS NOT NULL) AS has_aila_escort_pwd_2,
         aila_escort_pwd_3_filename, aila_escort_pwd_3_mime,
         (aila_escort_pwd_3_pdf IS NOT NULL) AS has_aila_escort_pwd_3,
         registro_mercantil_filename, registro_mercantil_mime, (registro_mercantil_pdf IS NOT NULL) AS has_registro_mercantil,
         rpa_acta_nombramiento_filename, rpa_acta_nombramiento_mime, (rpa_acta_nombramiento_pdf IS NOT NULL) AS has_rpa_acta_nombramiento,
         rpa_registro_representante_filename, rpa_registro_representante_mime, (rpa_registro_representante_pdf IS NOT NULL) AS has_rpa_registro_representante,
         rpa_registro_entidad_filename, rpa_registro_entidad_mime, (rpa_registro_entidad_pdf IS NOT NULL) AS has_rpa_registro_entidad,
         rpa_documento_estado_filename, rpa_documento_estado_mime, (rpa_documento_estado_pdf IS NOT NULL) AS has_rpa_documento_estado,
         analyst_pdf_filename, analyst_pdf_mime, analyst_pdf_uploaded_at, analyst_pdf_uploaded_by_user_id,
         (analyst_pdf IS NOT NULL) AS has_analyst_pdf,
         signed_pdf_filename, signed_pdf_mime, signed_pdf_uploaded_at, (signed_pdf IS NOT NULL) AS has_signed_pdf,
         returned_at, returned_reason, returned_to_analista_at, returned_to_analista_reason,
         rejected_at, rejected_by_user_id, rejected_reason,
         assigned_analista_id, assigned_emisor_id, assigned_aprobador_id, sent_to_emisor_at, sent_to_aprobador_at, approved_at,
         delivered_at, delivered_by_user_id
       FROM submissions
       WHERE id = $1
         AND (created_by_user_id = $2 OR (created_by_user_id IS NULL AND LOWER(correo) = LOWER($3)))`,
      [id, req.user?.sub, req.user?.email || ""]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Formulario no encontrado." });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error reading my submission detail", err);
    return res.status(500).json({ error: "No se pudo obtener el formulario." });
  }
});

app.post("/api/my-submissions/:id/feedback", requireAuth, requireRole("user"), async (req, res) => {
  const { id } = req.params;
  const ratingRaw = Number(req.body?.rating_value);
  const commentRaw = req.body?.comment;
  const comment = commentRaw === undefined || commentRaw === null ? null : String(commentRaw).trim();

  if (!Number.isInteger(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
    return res.status(400).json({ error: "rating_value debe ser un entero entre 1 y 5." });
  }
  if (comment && comment.length > 500) {
    return res.status(400).json({ error: "El comentario no puede exceder 500 caracteres." });
  }

  try {
    const submissionResult = await pool.query(
      `SELECT id, approved_at
       FROM submissions
       WHERE id = $1
         AND (created_by_user_id = $2 OR (created_by_user_id IS NULL AND LOWER(correo) = LOWER($3)))`,
      [id, req.user?.sub, req.user?.email || ""]
    );
    if (!submissionResult.rowCount) {
      return res.status(404).json({ error: "Formulario no encontrado." });
    }
    if (!submissionResult.rows[0].approved_at) {
      return res.status(400).json({ error: "Solo puedes calificar procesos aprobados." });
    }

    const saved = await pool.query(
      `INSERT INTO submission_feedback (
         submission_id,
         user_id,
         rating_value,
         comment
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (submission_id, user_id)
       DO UPDATE
         SET rating_value = EXCLUDED.rating_value,
             comment = EXCLUDED.comment,
             updated_at = NOW()
       RETURNING id, submission_id, user_id, rating_value, comment, created_at, updated_at`,
      [id, req.user?.sub, ratingRaw, comment || null]
    );

    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "usuario_califica",
      eventLabel: "Usuario calificÃ³ el proceso",
      eventDetail: `CalificaciÃ³n: ${ratingRaw}/5`,
      actorUserId: req.user?.sub || null,
      actorRole: req.user?.role || "user",
      metadata: {
        rating_value: ratingRaw,
        comment: comment || null
      }
    });

    return res.status(201).json(saved.rows[0]);
  } catch (err) {
    console.error("Error saving submission feedback", err);
    return res.status(500).json({ error: "No se pudo guardar la calificaciÃ³n." });
  }
});

app.get("/api/my-submissions/:id/pdf", requireAuth, requireRole("user", "admin"), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAdmin = role === "admin";
    const params = [id];
    let where = "id = $1";
    if (!isAdmin) {
      params.push(req.user?.sub);
      params.push(req.user?.email || "");
      where += " AND (created_by_user_id = $2 OR (created_by_user_id IS NULL AND LOWER(correo) = LOWER($3)))";
    }

    const result = await pool.query(
      `SELECT
         id,
         created_at,
         fecha,
         approved_at,
         delivered_at,
         origen_compra,
         unidad_clave,
         gestion_nombre,
         registro_codigo,
         persona_tipo,
         nombre_propietario,
         representante_legal,
         documento_propietario,
         direccion,
         telefono,
         correo,
         nit,
         nombre_orden_pago,
         autorizado_nombre,
         autorizado_documento,
         autorizado_telefono,
         matricula_tg,
         matricula_tg_nueva,
         uso,
         fabricante,
         numero_serie,
         modelo,
         anio_fabricacion,
         colores,
         tipo_internacion,
         tipo_reservacion,
         tipo_inscripcion,
         tipo_certificado_prov,
         tipo_reposicion,
         tipo_cambio_prop,
         tipo_cambio_datos,
         tipo_certificacion,
         especificaciones,
         detalle_formulario,
         comentarios_revision,
         dpi_filename,
         acta_filename,
         registro_mercantil_filename,
         rpa_acta_nombramiento_filename,
         rpa_registro_representante_filename,
         rpa_registro_entidad_filename,
         rpa_documento_estado_filename,
         (dpi_pdf IS NOT NULL) AS has_dpi,
         (acta_pdf IS NOT NULL) AS has_acta,
         (registro_mercantil_pdf IS NOT NULL) AS has_registro_mercantil,
         (rpa_acta_nombramiento_pdf IS NOT NULL) AS has_rpa_acta_nombramiento,
         (rpa_registro_representante_pdf IS NOT NULL) AS has_rpa_registro_representante,
         (rpa_registro_entidad_pdf IS NOT NULL) AS has_rpa_registro_entidad,
         (rpa_documento_estado_pdf IS NOT NULL) AS has_rpa_documento_estado
       FROM submissions
       WHERE ${where}`,
      params
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Formulario no encontrado." });
    }

    const submission = result.rows[0];
    if (!submission.approved_at) {
      return res.status(400).json({ error: "El formulario aÃºn no estÃ¡ aprobado." });
    }

    const pdfBuffer = await buildSubmissionPdfBuffer(submission);
    const fileCode = String(submission.registro_codigo || `REG-${id}`).replace(/[^A-Za-z0-9-_]+/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="formulario-tg-${fileCode}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Error generating submission pdf", err);
    return res.status(500).json({ error: "No se pudo generar el PDF." });
  }
});

app.get("/api/my-submissions/:id/boleta", requireAuth, requireRole("user", "admin"), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAdmin = role === "admin";
    const params = [id];
    let where = "id = $1";
    if (!isAdmin) {
      params.push(req.user?.sub);
      params.push(req.user?.email || "");
      where += " AND (created_by_user_id = $2 OR (created_by_user_id IS NULL AND LOWER(correo) = LOWER($3)))";
    }

    const result = await pool.query(
      `SELECT
         id,
         registro_codigo,
         unidad_clave,
         detalle_formulario,
         approved_at,
         analyst_pdf,
         analyst_pdf_filename,
         analyst_pdf_mime
       FROM submissions
       WHERE ${where}`,
      params
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Formulario no encontrado." });
    }

    const submission = result.rows[0];
    if (!submission.approved_at && !isFinancialPaymentPasswordFlow(submission)) {
      return res.status(400).json({ error: "La boleta de pago solo está disponible cuando el proceso está aprobado o cuando la etapa responsable la libera para pago." });
    }
    if (!submission.analyst_pdf) {
      return res.status(404).json({ error: "Aún no hay boleta de pago cargada para este proceso." });
    }

    const mime = submission.analyst_pdf_mime || "application/pdf";
    const fallbackCode = String(submission.registro_codigo || `REG-${id}`).replace(/[^A-Za-z0-9-_]+/g, "-");
    const filename = sanitizeHeaderFilename(submission.analyst_pdf_filename || `boleta-pago-${fallbackCode}.pdf`, `boleta-pago-${fallbackCode}.pdf`);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(submission.analyst_pdf);
  } catch (err) {
    console.error("Error generating boleta pdf", err);
    return res.status(500).json({ error: "No se pudo descargar la boleta de pago." });
  }
});

app.get("/api/my-submissions/:id/documento-firmado", requireAuth, requireRole("user", "admin"), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, registro_codigo, approved_at, signed_pdf, signed_pdf_filename, signed_pdf_mime,
              unidad_clave, detalle_formulario, created_at, fecha, uso, especificaciones,
              nombre_propietario, representante_legal, direccion, telefono, correo,
              assigned_emisor_id, assigned_aprobador_id
       FROM submissions
       WHERE id = $1
         AND (created_by_user_id = $2 OR (created_by_user_id IS NULL AND LOWER(correo) = LOWER($3)))`,
      [id, req.user?.sub, req.user?.email || ""]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Formulario no encontrado." });
    }

    const submission = result.rows[0];
    if (!submission.approved_at) {
      return res.status(400).json({ error: "El documento firmado solo está disponible cuando el proceso está aprobado." });
    }
    if (!submission.signed_pdf && isAilaGenericWorkflow(submission)) {
      const pdfBuffer = await buildAilaAuthorizedPdfBuffer(submission);
      const fallbackCode = submission.registro_codigo || submission.id;
      const filename = `formulario-autorizado-${String(fallbackCode).replace(/[^A-Za-z0-9-_]+/g, "-")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(pdfBuffer);
    }
    if (!submission.signed_pdf) {
      return res.status(404).json({ error: "Aún no hay documento firmado disponible." });
    }

    const mime = submission.signed_pdf_mime || "application/pdf";
    const fallbackCode = submission.registro_codigo || submission.id;
    const filename = (submission.signed_pdf_filename || `documento-firmado-${fallbackCode}.pdf`).replace(/"/g, "");
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(submission.signed_pdf);
  } catch (err) {
    console.error("Error generating signed pdf", err);
    return res.status(500).json({ error: "No se pudo descargar el documento firmado." });
  }
});

app.put("/api/my-submissions/:id/resubmit", requireAuth, requireRole("user"), async (req, res) => {
  const { id } = req.params;
  const {
    persona_tipo,
    origen_compra,
    dpi_pdf_base64,
    dpi_filename,
    dpi_mime,
    financial_declaraguate_2_pdf_base64,
    financial_declaraguate_2_filename,
    financial_declaraguate_2_mime,
    financial_declaraguate_3_pdf_base64,
    financial_declaraguate_3_filename,
    financial_declaraguate_3_mime,
    financial_declaraguate_4_pdf_base64,
    financial_declaraguate_4_filename,
    financial_declaraguate_4_mime,
    financial_declaraguate_5_pdf_base64,
    financial_declaraguate_5_filename,
    financial_declaraguate_5_mime,
    acta_pdf_base64,
    acta_filename,
    acta_mime,
    registro_mercantil_pdf_base64,
    registro_mercantil_filename,
    registro_mercantil_mime,
    rpa_acta_nombramiento_pdf_base64,
    rpa_acta_nombramiento_filename,
    rpa_acta_nombramiento_mime,
    rpa_registro_representante_pdf_base64,
    rpa_registro_representante_filename,
    rpa_registro_representante_mime,
    rpa_registro_entidad_pdf_base64,
    rpa_registro_entidad_filename,
    rpa_registro_entidad_mime,
    rpa_documento_estado_pdf_base64,
    rpa_documento_estado_filename,
    rpa_documento_estado_mime,
    aila_escort_pwd_1_pdf_base64,
    aila_escort_pwd_1_filename,
    aila_escort_pwd_1_mime,
    aila_escort_pwd_2_pdf_base64,
    aila_escort_pwd_2_filename,
    aila_escort_pwd_2_mime,
    aila_escort_pwd_3_pdf_base64,
    aila_escort_pwd_3_filename,
    aila_escort_pwd_3_mime,
    carta_representacion_pdf_base64,
    carta_representacion_filename,
    carta_representacion_mime
  } = req.body || {};

  const allowed = [
    "fecha",
    "persona_tipo",
    "origen_compra",
    "nombre_propietario",
    "representante_legal",
    "documento_propietario",
    "direccion",
    "telefono",
    "correo",
    "nit",
    "nombre_orden_pago",
    "autorizado_nombre",
    "autorizado_documento",
    "autorizado_telefono",
    "matricula_tg",
    "matricula_tg_nueva",
    "uso",
    "fabricante",
    "numero_serie",
    "modelo",
    "anio_fabricacion",
    "colores",
    "tipo_internacion",
    "tipo_reservacion",
    "tipo_inscripcion",
    "tipo_certificado_prov",
    "tipo_reposicion",
    "tipo_cambio_prop",
    "tipo_cambio_datos",
    "tipo_certificacion",
    "especificaciones",
    "detalle_formulario"
  ];

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "persona_tipo")) {
    const tipo = String(persona_tipo || "").toLowerCase();
    if (!["individual", "juridica"].includes(tipo)) {
      return res.status(400).json({ error: "persona_tipo no vÃ¡lido. Usa individual o jurÃ­dica." });
    }
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "origen_compra")) {
    const origen = String(origen_compra || "").trim().toLowerCase();
    if (origen && origen !== "guatemala" && origen !== "extranjero") {
      return res.status(400).json({ error: "origen_compra debe ser guatemala o extranjero." });
    }
  }
  const isAilaResubmit = String(req.body?.detalle_formulario?.tipo || '').trim().toLowerCase() === 'aila_permiso_trabajo';
  const isRanResubmit = String((req.body?.unidad_clave || existing.rows[0]?.unidad_clave || '')).trim().toUpperCase() === 'RAN';
  const numericValidationError = validateNumericSubmissionFields(
    { ...(req.body || {}), unidad_clave: req.body?.unidad_clave || existing.rows[0]?.unidad_clave || '' },
    { onlyProvided: true, flexibleMainPhone: isAilaResubmit, flexibleOwnerDocument: isRanResubmit }
  );
  if (numericValidationError) {
    return res.status(400).json({ error: numericValidationError });
  }
  const updatesCorreo = Object.prototype.hasOwnProperty.call(req.body || {}, "correo");
  let correoNormalizado = null;
  let dpiPdfBuffer;
  let financialDeclaraguate2PdfBuffer;
  let financialDeclaraguate3PdfBuffer;
  let financialDeclaraguate4PdfBuffer;
  let financialDeclaraguate5PdfBuffer;
  let actaPdfBuffer;
  let registroMercantilPdfBuffer;
  let rpaActaNombramientoPdfBuffer;
  let rpaRegistroRepresentantePdfBuffer;
  let rpaRegistroEntidadPdfBuffer;
  let rpaDocumentoEstadoPdfBuffer;
  let cartaRepresentacionPdfBuffer;
  let ailaEscortPwd1PdfBuffer;
  let ailaEscortPwd2PdfBuffer;
  let ailaEscortPwd3PdfBuffer;
  if (updatesCorreo) {
    const correoValidation = await validateEmailAddress(req.body?.correo);
    if (!correoValidation.ok) {
      return res.status(400).json({ error: correoValidation.error || "Correo no vÃ¡lido." });
    }
    correoNormalizado = correoValidation.email;
  }
  try {
    dpiPdfBuffer = decodePdfBase64(dpi_pdf_base64, "El PDF de DPI");
    financialDeclaraguate2PdfBuffer = decodePdfBase64(financial_declaraguate_2_pdf_base64, "El PDF Declaraguate 2");
    financialDeclaraguate3PdfBuffer = decodePdfBase64(financial_declaraguate_3_pdf_base64, "El PDF Declaraguate 3");
    financialDeclaraguate4PdfBuffer = decodePdfBase64(financial_declaraguate_4_pdf_base64, "El PDF Declaraguate 4");
    financialDeclaraguate5PdfBuffer = decodePdfBase64(financial_declaraguate_5_pdf_base64, "El PDF Declaraguate 5");
    actaPdfBuffer = decodePdfBase64(acta_pdf_base64, "El PDF de acta");
    registroMercantilPdfBuffer = decodePdfBase64(registro_mercantil_pdf_base64, "El PDF de registro mercantil");
    rpaActaNombramientoPdfBuffer = decodePdfBase64(rpa_acta_nombramiento_pdf_base64, "El PDF de acta de nombramiento");
    rpaRegistroRepresentantePdfBuffer = decodePdfBase64(rpa_registro_representante_pdf_base64, "El PDF de registro del representante");
    rpaRegistroEntidadPdfBuffer = decodePdfBase64(rpa_registro_entidad_pdf_base64, "El PDF de registro de la entidad");
    rpaDocumentoEstadoPdfBuffer = decodePdfBase64(rpa_documento_estado_pdf_base64, "El PDF del documento RPA");
    cartaRepresentacionPdfBuffer = decodePdfBase64(carta_representacion_pdf_base64, "El PDF de carta de representaciÃ³n");
    ailaEscortPwd1PdfBuffer = decodePdfBase64(aila_escort_pwd_1_pdf_base64, "El PDF del escolta 1");
    ailaEscortPwd2PdfBuffer = decodePdfBase64(aila_escort_pwd_2_pdf_base64, "El PDF del escolta 2");
    ailaEscortPwd3PdfBuffer = decodePdfBase64(aila_escort_pwd_3_pdf_base64, "El PDF del escolta 3");
  } catch (err) {
    return res.status(400).json({ error: err.message || "Uno de los PDFs no es valido." });
  }

  try {
    const existing = await pool.query(
      `SELECT
         id,
         persona_tipo,
         origen_compra,
         unidad_clave,
         gestion_nombre,
         detalle_formulario,
         direccion,
         correo,
         uso,
         tipo_reservacion,
         tipo_certificacion,
         nombre_propietario,
         documento_propietario,
         telefono,
         nit,
         nombre_orden_pago,
         representante_legal,
         numero_serie,
         assigned_analista_id,
         assigned_aprobador_id,
         returned_by_user_id,
         (dpi_pdf IS NOT NULL) AS has_dpi,
         (financial_declaraguate_2_pdf IS NOT NULL) AS has_financial_declaraguate_2,
         (financial_declaraguate_3_pdf IS NOT NULL) AS has_financial_declaraguate_3,
         (financial_declaraguate_4_pdf IS NOT NULL) AS has_financial_declaraguate_4,
         (financial_declaraguate_5_pdf IS NOT NULL) AS has_financial_declaraguate_5,
         (acta_pdf IS NOT NULL) AS has_acta,
         (registro_mercantil_pdf IS NOT NULL) AS has_registro_mercantil,
         (rpa_acta_nombramiento_pdf IS NOT NULL) AS has_rpa_acta_nombramiento,
         (rpa_registro_representante_pdf IS NOT NULL) AS has_rpa_registro_representante,
         (rpa_registro_entidad_pdf IS NOT NULL) AS has_rpa_registro_entidad,
         (rpa_documento_estado_pdf IS NOT NULL) AS has_rpa_documento_estado,
         (carta_representacion_pdf IS NOT NULL) AS has_carta_representacion,
         (aila_escort_pwd_1_pdf IS NOT NULL) AS has_aila_escort_pwd_1,
         (aila_escort_pwd_2_pdf IS NOT NULL) AS has_aila_escort_pwd_2,
         (aila_escort_pwd_3_pdf IS NOT NULL) AS has_aila_escort_pwd_3
       FROM submissions
       WHERE id = $1
         AND returned_at IS NOT NULL
         AND (created_by_user_id = $2 OR (created_by_user_id IS NULL AND LOWER(correo) = LOWER($3)))`,
      [id, req.user?.sub, req.user?.email || ""]
    );
    if (!existing.rowCount) {
      return res.status(404).json({ error: "No hay un formulario devuelto para reenviar." });
    }

    const current = existing.rows[0];
    const finalTipo = String((persona_tipo ?? current.persona_tipo) || "individual").toLowerCase();
    const finalOrigenRaw = String((origen_compra ?? current.origen_compra) || "").trim().toLowerCase();
    const finalOrigenCompra = ["guatemala", "extranjero"].includes(finalOrigenRaw) ? finalOrigenRaw : null;
    const finalNombrePropietario = String((req.body?.nombre_propietario ?? current.nombre_propietario) || "").trim();
    const finalDocumentoPropietario = String((req.body?.documento_propietario ?? current.documento_propietario) || "").trim();
    const finalTelefono = String((req.body?.telefono ?? current.telefono) || "").trim();
    const finalNit = String((req.body?.nit ?? current.nit) || "").trim();
    const finalNombreOrdenPago = String((req.body?.nombre_orden_pago ?? current.nombre_orden_pago) || "").trim();
    const finalRepresentante = String((req.body?.representante_legal ?? current.representante_legal) || "").trim();
    const finalNumeroSerie = String((req.body?.numero_serie ?? current.numero_serie) || "").trim();
    const finalDireccion = String((req.body?.direccion ?? current.direccion) || "").trim();
    const finalCorreo = String((req.body?.correo ?? current.correo) || "").trim();
    const finalUso = String((req.body?.uso ?? current.uso) || "").trim();
    const currentUnidad = String(current.unidad_clave || "GENERAL").toUpperCase();
    const currentGestion = String(current.gestion_nombre || "");
    const normalizedCurrentGestion = currentGestion
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const isRanDroneRequest = currentUnidad === "RAN" && /uav|rpa|distintivo|drone/i.test(currentGestion);
    const isRanReservaRequest = currentUnidad === "RAN" && (
      normalizedCurrentGestion.includes("reserva") ||
      normalizedCurrentGestion.includes("prorroga") ||
      normalizedCurrentGestion.includes("cesion") ||
      Boolean(current.tipo_reservacion) ||
      Boolean(req.body?.tipo_reservacion)
    );
    const isRanCertificacionRequest = currentUnidad === "RAN" && !isRanDroneRequest && (
      normalizedCurrentGestion.includes("certific") ||
      Boolean(current.tipo_certificacion) ||
      Boolean(req.body?.tipo_certificacion)
    );
    const isFinancialRequest = currentUnidad === "FINANCIERO";
    const isAilaRequest = currentUnidad === "AILA";
    const requireOwnerDocument = isRanReservaRequest || isRanCertificacionRequest;
    const requireExtraDocs = !isFinancialRequest && (finalTipo === "juridica" || isRanDroneRequest);
    const useSingleActaAsRegistroMercantil =
      currentUnidad === "RAN" &&
      !isRanDroneRequest &&
      finalTipo === "juridica";
    const requireRpaJuridicaGuatemalaDocs = isRanDroneRequest && finalTipo === "juridica" && finalOrigenCompra === "guatemala";
    const requireRpaJuridicaExtranjeroDocs = isRanDroneRequest && finalTipo === "juridica" && finalOrigenCompra === "extranjero";
    const requireRpaJuridicaSupportingDocs = requireRpaJuridicaGuatemalaDocs || requireRpaJuridicaExtranjeroDocs;
    const requireRpaJuridicaMercantilDocs = requireRpaJuridicaSupportingDocs;
    const requireRpaIndividualExtranjeroDocs = isRanDroneRequest && finalTipo === "individual" && finalOrigenCompra === "extranjero";
    const requireRpaDocumentoEstadoUpload = requireRpaJuridicaSupportingDocs || requireRpaIndividualExtranjeroDocs;
    const hasDpiAfter = Boolean(dpi_pdf_base64) || Boolean(current.has_dpi);
    const hasDeclaraguate2After = Boolean(financial_declaraguate_2_pdf_base64) || Boolean(current.has_financial_declaraguate_2);
    const hasDeclaraguate3After = Boolean(financial_declaraguate_3_pdf_base64) || Boolean(current.has_financial_declaraguate_3);
    const hasDeclaraguate4After = Boolean(financial_declaraguate_4_pdf_base64) || Boolean(current.has_financial_declaraguate_4);
    const hasDeclaraguate5After = Boolean(financial_declaraguate_5_pdf_base64) || Boolean(current.has_financial_declaraguate_5);
    const hasActaAfter = Boolean(acta_pdf_base64) || Boolean(current.has_acta);
    const hasRegistroMercantilAfter =
      Boolean(registro_mercantil_pdf_base64) ||
      Boolean(current.has_registro_mercantil) ||
      (useSingleActaAsRegistroMercantil && hasActaAfter);
    const hasRpaActaNombramientoAfter = Boolean(rpa_acta_nombramiento_pdf_base64) || Boolean(current.has_rpa_acta_nombramiento);
    const hasRpaRegistroRepresentanteAfter = Boolean(rpa_registro_representante_pdf_base64) || Boolean(current.has_rpa_registro_representante);
    const hasRpaRegistroEntidadAfter = Boolean(rpa_registro_entidad_pdf_base64) || Boolean(current.has_rpa_registro_entidad);
    const hasRpaDocumentoEstadoAfter = Boolean(rpa_documento_estado_pdf_base64) || Boolean(current.has_rpa_documento_estado);
    const hasCartaRepresentacionAfter = Boolean(carta_representacion_pdf_base64) || Boolean(current.has_carta_representacion);
    const hasAilaEscortPwd1After = Boolean(aila_escort_pwd_1_pdf_base64) || Boolean(current.has_aila_escort_pwd_1);
    const hasAilaEscortPwd2After = Boolean(aila_escort_pwd_2_pdf_base64) || Boolean(current.has_aila_escort_pwd_2);
    const hasAilaEscortPwd3After = Boolean(aila_escort_pwd_3_pdf_base64) || Boolean(current.has_aila_escort_pwd_3);
    const nextDetail = req.body?.detalle_formulario && typeof req.body.detalle_formulario === "object" ? req.body.detalle_formulario : current.detalle_formulario || {};
    const ailaHasTools = Array.isArray(nextDetail.herramientas) && nextDetail.herramientas.length > 0;
    const ailaHasVehicles = Array.isArray(nextDetail.vehiculos) && nextDetail.vehiculos.length > 0;
    const ailaExpiredEscortIndexes = isAilaRequest ? getAilaExpiredEscortIndexes(nextDetail) : [];
    const ailaFilledEscortIndexes = isAilaRequest ? getAilaFilledEscortIndexes(nextDetail) : [];
    let reassignedAnalystId = current.assigned_analista_id || null;
    if (isAilaRequest) {
      const ailaPeopleError = validateAilaPeopleAndEscorts(nextDetail);
      if (ailaPeopleError) {
        return res.status(400).json({ error: ailaPeopleError });
      }
    }

    if (current.returned_by_user_id) {
      const analystResult = await pool.query(
        "SELECT id FROM users WHERE id = $1 AND role = 'analista'",
        [current.returned_by_user_id]
      );
      if (analystResult.rowCount) {
        reassignedAnalystId = current.returned_by_user_id;
      }
    }

    if (!isFinancialRequest && !hasDpiAfter) {
      return res.status(400).json({
        error: isAilaRequest
          ? "El PDF de DPI, fe de edad o pasaporte de las personas es obligatorio."
          : "El DPI en PDF es obligatorio."
      });
    }
    if (requireExtraDocs && !hasActaAfter) {
      return res.status(400).json({
        error: isRanDroneRequest
          ? "Para RPA el Dictamen TÃ©cnico en PDF es obligatorio."
          : "Para persona jurÃ­dica el acta en PDF es obligatoria."
      });
    }
    if (requireExtraDocs && !hasRegistroMercantilAfter) {
      return res.status(400).json({
        error: isRanDroneRequest
          ? "Para RPA la Copia autÃ©ntica de la Factura de compra o Acta Notarial de DeclaraciÃ³n Jurada en PDF es obligatoria."
          : "Para persona jurÃ­dica el registro mercantil en PDF es obligatorio."
      });
    }
    if (isRanDroneRequest && !finalOrigenCompra) {
      return res.status(400).json({ error: "Para RPA debes indicar si fue comprado en Guatemala o en el extranjero." });
    }
    if (requireRpaJuridicaExtranjeroDocs && !hasCartaRepresentacionAfter) {
      return res.status(400).json({ error: "Debes adjuntar la copia legalizada de la pÃ³liza de importaciÃ³n de la aeronave o DUCA con pago." });
    }
    if (requireRpaJuridicaSupportingDocs && !hasRpaActaNombramientoAfter) {
      return res.status(400).json({ error: "Debes adjuntar la copia simple del Acta Notarial de Nombramiento del representante legal." });
    }
    if (requireRpaJuridicaMercantilDocs && !hasRpaRegistroRepresentanteAfter) {
      return res.status(400).json({ error: "Debes adjuntar la certificaciÃ³n de inscripciÃ³n del representante legal en el Registro Mercantil." });
    }
    if (requireRpaJuridicaMercantilDocs && !hasRpaRegistroEntidadAfter) {
      return res.status(400).json({ error: "Debes adjuntar la certificaciÃ³n de inscripciÃ³n de la entidad en el Registro Mercantil." });
    }
    if (requireRpaDocumentoEstadoUpload && !hasRpaDocumentoEstadoAfter) {
      return res.status(400).json({
        error: requireRpaIndividualExtranjeroDocs
          ? "Debes adjuntar la copia legalizada de importaciÃ³n de la aeronave o DUCA con pago."
          : "Debes adjuntar el documento de acreditaciÃ³n."
      });
    }
    if ((finalTipo === "juridica" || isFinancialRequest) && !finalRepresentante) {
      return res.status(400).json({ error: isFinancialRequest ? "El nombre del solicitante es obligatorio." : "Para persona jurÃ­dica el representante legal es obligatorio." });
    }
    if (isFinancialRequest && !hasCartaRepresentacionAfter) {
      return res.status(400).json({ error: "La carta de representaciÃ³n en PDF es obligatoria." });
    }
    if (isFinancialRequest) {
      const financialProcessCode = String(nextDetail.proceso_codigo || nextDetail.gestion_codigo || "").trim();
      const requiresSolvenciaDocs = [
        "cancelacion_matricula",
        "solvencia_aeronavegabilidad",
        "solvencia_financiera_aeronave"
      ].includes(financialProcessCode);
      const requiresWeightDocs = ["derecho_inspeccion", "derecho_aproximacion"].includes(financialProcessCode);
      if (requiresSolvenciaDocs && !hasDpiAfter) {
        return res.status(400).json({ error: "Debes adjuntar el formulario Declaraguate 1 en PDF." });
      }
      if (requiresSolvenciaDocs && !hasDeclaraguate2After) {
        return res.status(400).json({ error: "Debes adjuntar el formulario Declaraguate 2 en PDF." });
      }
      if (requiresSolvenciaDocs && !hasDeclaraguate3After) {
        return res.status(400).json({ error: "Debes adjuntar el formulario Declaraguate 3 en PDF." });
      }
      if (requiresSolvenciaDocs && !hasDeclaraguate4After) {
        return res.status(400).json({ error: "Debes adjuntar el formulario Declaraguate 4 en PDF." });
      }
      if (requiresSolvenciaDocs && !hasDeclaraguate5After) {
        return res.status(400).json({ error: "Debes adjuntar el formulario Declaraguate 5 en PDF." });
      }
      if (requiresSolvenciaDocs && !hasActaAfter) {
        return res.status(400).json({ error: "Debes adjuntar la factura de inspecciÃ³n del aÃ±o en curso." });
      }
      if (requiresSolvenciaDocs && !hasRegistroMercantilAfter) {
        return res.status(400).json({ error: "Debes adjuntar la factura de aproximaciÃ³n del aÃ±o en curso." });
      }
      if (requiresWeightDocs && !hasRpaDocumentoEstadoAfter) {
        return res.status(400).json({ error: "Debes adjuntar el documento que indica el peso mÃ¡ximo de despegue de la aeronave." });
      }
    }
    if (isAilaRequest && !hasCartaRepresentacionAfter) {
      return res.status(400).json({ error: "La carta de solicitud en PDF es obligatoria." });
    }
    if (isAilaRequest && !hasRegistroMercantilAfter) {
      return res.status(400).json({ error: "La factura reciente de arrendamiento/solvencia en PDF es obligatoria." });
    }
    if (isAilaRequest && ailaFilledEscortIndexes.includes(1) && !hasAilaEscortPwd1After) {
      return res.status(400).json({ error: ailaExpiredEscortIndexes.includes(1) ? "Debes adjuntar el PDF de la contraseña del escolta 1." : "Debes adjuntar el PDF de la T.I.A. del escolta 1." });
    }
    if (isAilaRequest && ailaFilledEscortIndexes.includes(2) && !hasAilaEscortPwd2After) {
      return res.status(400).json({ error: ailaExpiredEscortIndexes.includes(2) ? "Debes adjuntar el PDF de la contraseña del escolta 2." : "Debes adjuntar el PDF de la T.I.A. del escolta 2." });
    }
    if (isAilaRequest && ailaFilledEscortIndexes.includes(3) && !hasAilaEscortPwd3After) {
      return res.status(400).json({ error: ailaExpiredEscortIndexes.includes(3) ? "Debes adjuntar el PDF de la contraseña del escolta 3." : "Debes adjuntar el PDF de la T.I.A. del escolta 3." });
    }
    if (isAilaRequest && ailaHasVehicles && !hasRpaRegistroRepresentanteAfter) {
      return res.status(400).json({ error: "Debes adjuntar la tarjeta de circulaciÃ³n de cada vehÃ­culo." });
    }
    if (!finalNombrePropietario) {
      return res.status(400).json({ error: "Nombre del propietario es obligatorio." });
    }
    if (isAilaRequest && (!finalDireccion || !finalCorreo || !finalTelefono || !finalUso)) {
      return res.status(400).json({ error: "Faltan datos obligatorios del permiso AILA." });
    }
    if ((requireOwnerDocument || isFinancialRequest) && !finalDocumentoPropietario) {
      return res.status(400).json({
        error: isFinancialRequest
          ? "El DPI del solicitante es obligatorio."
          : "En Reserva o CertificaciÃ³n el documento del propietario es obligatorio."
      });
    }
    if (isRanReservaRequest && !finalTelefono) {
      return res.status(400).json({ error: "En Reserva, PrÃ³rroga o CesiÃ³n de MatrÃ­cula el telÃ©fono es obligatorio." });
    }
    if (isRanReservaRequest && !/^\d{8}$/.test(finalTelefono)) {
      return res.status(400).json({ error: "En Reserva, PrÃ³rroga o CesiÃ³n de MatrÃ­cula el telÃ©fono debe tener 8 dÃ­gitos." });
    }
    if ((isRanReservaRequest || isRanCertificacionRequest || isRanDroneRequest || isFinancialRequest) && !finalNit) {
      return res.status(400).json({ error: "El NIT es obligatorio." });
    }
    if (isRanReservaRequest && !finalNombreOrdenPago) {
      return res.status(400).json({ error: "En Reserva, PrÃ³rroga o CesiÃ³n de MatrÃ­cula el nombre para orden de pago es obligatorio." });
    }
    if (!isRanDroneRequest && !isFinancialRequest && !isAilaRequest && !isRanCertificacionRequest && !finalNumeroSerie) {
      return res.status(400).json({ error: "NÃºmero de serie es obligatorio." });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        updates.push(`${key} = $${idx}`);
        if (key === "correo") {
          values.push(correoNormalizado);
        } else if (key === "origen_compra") {
          const origenValue = String(req.body[key] || "").trim().toLowerCase();
          values.push(origenValue === "guatemala" || origenValue === "extranjero" ? origenValue : null);
        } else {
          values.push(req.body[key]);
        }
        idx++;
      }
    }

    if (dpiPdfBuffer) {
      updates.push(`dpi_pdf = $${idx}`);
      values.push(dpiPdfBuffer);
      idx++;
      updates.push(`dpi_filename = $${idx}`);
      values.push(dpi_filename || null);
      idx++;
      updates.push(`dpi_mime = $${idx}`);
      values.push(dpi_mime || null);
      idx++;
    }

    if (financialDeclaraguate2PdfBuffer) {
      updates.push(`financial_declaraguate_2_pdf = $${idx}`);
      values.push(financialDeclaraguate2PdfBuffer);
      idx++;
      updates.push(`financial_declaraguate_2_filename = $${idx}`);
      values.push(financial_declaraguate_2_filename || null);
      idx++;
      updates.push(`financial_declaraguate_2_mime = $${idx}`);
      values.push(financial_declaraguate_2_mime || null);
      idx++;
    }

    if (financialDeclaraguate3PdfBuffer) {
      updates.push(`financial_declaraguate_3_pdf = $${idx}`);
      values.push(financialDeclaraguate3PdfBuffer);
      idx++;
      updates.push(`financial_declaraguate_3_filename = $${idx}`);
      values.push(financial_declaraguate_3_filename || null);
      idx++;
      updates.push(`financial_declaraguate_3_mime = $${idx}`);
      values.push(financial_declaraguate_3_mime || null);
      idx++;
    }

    if (financialDeclaraguate4PdfBuffer) {
      updates.push(`financial_declaraguate_4_pdf = $${idx}`);
      values.push(financialDeclaraguate4PdfBuffer);
      idx++;
      updates.push(`financial_declaraguate_4_filename = $${idx}`);
      values.push(financial_declaraguate_4_filename || null);
      idx++;
      updates.push(`financial_declaraguate_4_mime = $${idx}`);
      values.push(financial_declaraguate_4_mime || null);
      idx++;
    }

    if (financialDeclaraguate5PdfBuffer) {
      updates.push(`financial_declaraguate_5_pdf = $${idx}`);
      values.push(financialDeclaraguate5PdfBuffer);
      idx++;
      updates.push(`financial_declaraguate_5_filename = $${idx}`);
      values.push(financial_declaraguate_5_filename || null);
      idx++;
      updates.push(`financial_declaraguate_5_mime = $${idx}`);
      values.push(financial_declaraguate_5_mime || null);
      idx++;
    }

    if (actaPdfBuffer) {
      updates.push(`acta_pdf = $${idx}`);
      values.push(actaPdfBuffer);
      idx++;
      updates.push(`acta_filename = $${idx}`);
      values.push(acta_filename || null);
      idx++;
      updates.push(`acta_mime = $${idx}`);
      values.push(acta_mime || null);
      idx++;
    }

    if (registroMercantilPdfBuffer) {
      updates.push(`registro_mercantil_pdf = $${idx}`);
      values.push(registroMercantilPdfBuffer);
      idx++;
      updates.push(`registro_mercantil_filename = $${idx}`);
      values.push(registro_mercantil_filename || null);
      idx++;
      updates.push(`registro_mercantil_mime = $${idx}`);
      values.push(registro_mercantil_mime || null);
      idx++;
    } else if (useSingleActaAsRegistroMercantil && actaPdfBuffer) {
      updates.push(`registro_mercantil_pdf = $${idx}`);
      values.push(actaPdfBuffer);
      idx++;
      updates.push(`registro_mercantil_filename = $${idx}`);
      values.push(acta_filename || null);
      idx++;
      updates.push(`registro_mercantil_mime = $${idx}`);
      values.push(acta_mime || null);
      idx++;
    }

    if (rpaActaNombramientoPdfBuffer) {
      updates.push(`rpa_acta_nombramiento_pdf = $${idx}`);
      values.push(rpaActaNombramientoPdfBuffer);
      idx++;
      updates.push(`rpa_acta_nombramiento_filename = $${idx}`);
      values.push(rpa_acta_nombramiento_filename || null);
      idx++;
      updates.push(`rpa_acta_nombramiento_mime = $${idx}`);
      values.push(rpa_acta_nombramiento_mime || null);
      idx++;
    }

    if (rpaRegistroRepresentantePdfBuffer) {
      updates.push(`rpa_registro_representante_pdf = $${idx}`);
      values.push(rpaRegistroRepresentantePdfBuffer);
      idx++;
      updates.push(`rpa_registro_representante_filename = $${idx}`);
      values.push(rpa_registro_representante_filename || null);
      idx++;
      updates.push(`rpa_registro_representante_mime = $${idx}`);
      values.push(rpa_registro_representante_mime || null);
      idx++;
    }

    if (rpaRegistroEntidadPdfBuffer) {
      updates.push(`rpa_registro_entidad_pdf = $${idx}`);
      values.push(rpaRegistroEntidadPdfBuffer);
      idx++;
      updates.push(`rpa_registro_entidad_filename = $${idx}`);
      values.push(rpa_registro_entidad_filename || null);
      idx++;
      updates.push(`rpa_registro_entidad_mime = $${idx}`);
      values.push(rpa_registro_entidad_mime || null);
      idx++;
    }

    if (rpaDocumentoEstadoPdfBuffer) {
      updates.push(`rpa_documento_estado_pdf = $${idx}`);
      values.push(rpaDocumentoEstadoPdfBuffer);
      idx++;
      updates.push(`rpa_documento_estado_filename = $${idx}`);
      values.push(rpa_documento_estado_filename || null);
      idx++;
      updates.push(`rpa_documento_estado_mime = $${idx}`);
      values.push(rpa_documento_estado_mime || null);
      idx++;
    }

    if (cartaRepresentacionPdfBuffer) {
      updates.push(`carta_representacion_pdf = $${idx}`);
      values.push(cartaRepresentacionPdfBuffer);
      idx++;
      updates.push(`carta_representacion_filename = $${idx}`);
      values.push(carta_representacion_filename || null);
      idx++;
      updates.push(`carta_representacion_mime = $${idx}`);
      values.push(carta_representacion_mime || null);
      idx++;
    }

    if (ailaEscortPwd1PdfBuffer) {
      updates.push(`aila_escort_pwd_1_pdf = $${idx}`);
      values.push(ailaEscortPwd1PdfBuffer);
      idx++;
      updates.push(`aila_escort_pwd_1_filename = $${idx}`);
      values.push(aila_escort_pwd_1_filename || null);
      idx++;
      updates.push(`aila_escort_pwd_1_mime = $${idx}`);
      values.push(aila_escort_pwd_1_mime || null);
      idx++;
    }

    if (ailaEscortPwd2PdfBuffer) {
      updates.push(`aila_escort_pwd_2_pdf = $${idx}`);
      values.push(ailaEscortPwd2PdfBuffer);
      idx++;
      updates.push(`aila_escort_pwd_2_filename = $${idx}`);
      values.push(aila_escort_pwd_2_filename || null);
      idx++;
      updates.push(`aila_escort_pwd_2_mime = $${idx}`);
      values.push(aila_escort_pwd_2_mime || null);
      idx++;
    }

    if (ailaEscortPwd3PdfBuffer) {
      updates.push(`aila_escort_pwd_3_pdf = $${idx}`);
      values.push(ailaEscortPwd3PdfBuffer);
      idx++;
      updates.push(`aila_escort_pwd_3_filename = $${idx}`);
      values.push(aila_escort_pwd_3_filename || null);
      idx++;
      updates.push(`aila_escort_pwd_3_mime = $${idx}`);
      values.push(aila_escort_pwd_3_mime || null);
      idx++;
    }

    updates.push(`assigned_analista_id = $${idx}`);
    values.push(reassignedAnalystId);
    idx++;
    updates.push(`analyst_pdf = NULL`);
    updates.push(`analyst_pdf_filename = NULL`);
    updates.push(`analyst_pdf_mime = NULL`);
    updates.push(`analyst_pdf_uploaded_at = NULL`);
    updates.push(`analyst_pdf_uploaded_by_user_id = NULL`);
    updates.push(`signed_pdf = NULL`);
    updates.push(`signed_pdf_filename = NULL`);
    updates.push(`signed_pdf_mime = NULL`);
    updates.push(`signed_pdf_uploaded_at = NULL`);
    updates.push(`assigned_emisor_id = NULL`);
    updates.push(`sent_to_emisor_at = NULL`);
    updates.push(`assigned_aprobador_id = NULL`);
    updates.push(`sent_to_aprobador_at = NULL`);
    updates.push(`approved_at = NULL`);
    updates.push(`approved_by_user_id = NULL`);
    updates.push(`delivered_at = NULL`);
    updates.push(`delivered_by_user_id = NULL`);
    updates.push(`returned_at = NULL`);
    updates.push(`returned_reason = NULL`);
    updates.push(`returned_by_user_id = NULL`);

    values.push(id);
    const result = await pool.query(
      `UPDATE submissions
       SET ${updates.join(", ")}
       WHERE id = $${idx}
         AND returned_at IS NOT NULL
         AND (created_by_user_id = $${idx + 1} OR (created_by_user_id IS NULL AND LOWER(correo) = LOWER($${idx + 2})))
       RETURNING *`,
      [...values, req.user?.sub, req.user?.email || ""]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "No se pudo reenviar el formulario." });
    }
    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "usuario_reenvio",
      eventLabel: "Usuario reenviÃ³ correcciones",
      eventDetail: reassignedAnalystId
        ? `Reasignado al analista #${reassignedAnalystId}`
        : "Pendiente de nueva asignacion",
      actorUserId: req.user?.sub || null,
      actorRole: req.user?.role || "user",
      metadata: {
        persona_tipo: finalTipo,
        origen_compra: finalOrigenCompra,
        reassigned_analista_id: reassignedAnalystId || null
      }
    });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error resubmitting submission", err);
    return res.status(500).json({ error: "No se pudo reenviar el formulario." });
  }
});

app.get("/api/submissions/:id/dpi", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT dpi_pdf, dpi_filename, dpi_mime
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount || !result.rows[0].dpi_pdf) {
      return res.status(404).json({ error: "DPI no encontrado" });
    }
    const row = result.rows[0];
    const mime = row.dpi_mime || "application/pdf";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${row.dpi_filename || "dpi.pdf"}"`);
    return res.send(row.dpi_pdf);
  } catch (err) {
    console.error("Error fetching dpi", err);
    return res.status(500).json({ error: "No se pudo obtener el DPI" });
  }
});

app.get("/api/submissions/:id/financial-declaraguate/:numero", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id, numero } = req.params;
  const docNumber = Number(numero);
  const columns = {
    1: { pdf: "dpi_pdf", filename: "dpi_filename", mime: "dpi_mime" },
    2: { pdf: "financial_declaraguate_2_pdf", filename: "financial_declaraguate_2_filename", mime: "financial_declaraguate_2_mime" },
    3: { pdf: "financial_declaraguate_3_pdf", filename: "financial_declaraguate_3_filename", mime: "financial_declaraguate_3_mime" },
    4: { pdf: "financial_declaraguate_4_pdf", filename: "financial_declaraguate_4_filename", mime: "financial_declaraguate_4_mime" },
    5: { pdf: "financial_declaraguate_5_pdf", filename: "financial_declaraguate_5_filename", mime: "financial_declaraguate_5_mime" }
  }[docNumber];
  if (!columns) {
    return res.status(400).json({ error: "Número de Declaraguate no válido." });
  }
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1", "unidad_clave = 'FINANCIERO'"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT ${columns.pdf} AS pdf, ${columns.filename} AS filename, ${columns.mime} AS mime
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount || !result.rows[0].pdf) {
      return res.status(404).json({ error: "Declaraguate no encontrado." });
    }
    const row = result.rows[0];
    res.setHeader("Content-Type", row.mime || "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${row.filename || `declaraguate-${docNumber}.pdf`}"`);
    return res.send(row.pdf);
  } catch (err) {
    console.error("Error fetching financial declaraguate", err);
    return res.status(500).json({ error: "No se pudo obtener el Declaraguate." });
  }
});

app.get("/api/submissions/:id/acta", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT acta_pdf, acta_filename, acta_mime
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount || !result.rows[0].acta_pdf) {
      return res.status(404).json({ error: "Acta notarial no encontrada" });
    }
    const row = result.rows[0];
    const mime = row.acta_mime || "application/pdf";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${row.acta_filename || "acta-notarial.pdf"}"`);
    return res.send(row.acta_pdf);
  } catch (err) {
    console.error("Error fetching acta", err);
    return res.status(500).json({ error: "No se pudo obtener el acta notarial" });
  }
});

app.get("/api/submissions/:id/carta-representacion", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    const result = await pool.query(
      `SELECT carta_representacion_pdf, carta_representacion_filename, carta_representacion_mime
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount || !result.rows[0].carta_representacion_pdf) {
      return res.status(404).json({ error: "Carta de representación no encontrada." });
    }
    const row = result.rows[0];
    res.setHeader("Content-Type", row.carta_representacion_mime || "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${row.carta_representacion_filename || "carta-representacion.pdf"}"`);
    return res.send(row.carta_representacion_pdf);
  } catch (err) {
    console.error("Error serving carta de representación", err);
    return res.status(500).json({ error: "No se pudo abrir la carta de representación." });
  }
});

app.get("/api/submissions/:id/registro-mercantil", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT registro_mercantil_pdf, registro_mercantil_filename, registro_mercantil_mime
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount || !result.rows[0].registro_mercantil_pdf) {
      return res.status(404).json({ error: "Registro mercantil no encontrado" });
    }
    const row = result.rows[0];
    const mime = row.registro_mercantil_mime || "application/pdf";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${row.registro_mercantil_filename || "registro-mercantil.pdf"}"`);
    return res.send(row.registro_mercantil_pdf);
  } catch (err) {
    console.error("Error fetching registro mercantil", err);
    return res.status(500).json({ error: "No se pudo obtener el registro mercantil" });
  }
});

app.get("/api/submissions/:id/rpa-acta-nombramiento", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT rpa_acta_nombramiento_pdf, rpa_acta_nombramiento_filename, rpa_acta_nombramiento_mime
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount || !result.rows[0].rpa_acta_nombramiento_pdf) {
      return res.status(404).json({ error: "Acta de nombramiento no encontrada" });
    }
    const row = result.rows[0];
    const mime = row.rpa_acta_nombramiento_mime || "application/pdf";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${row.rpa_acta_nombramiento_filename || "acta-nombramiento.pdf"}"`);
    return res.send(row.rpa_acta_nombramiento_pdf);
  } catch (err) {
    console.error("Error fetching rpa acta de nombramiento", err);
    return res.status(500).json({ error: "No se pudo obtener el acta de nombramiento." });
  }
});

app.get("/api/submissions/:id/rpa-registro-representante", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT rpa_registro_representante_pdf, rpa_registro_representante_filename, rpa_registro_representante_mime
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount || !result.rows[0].rpa_registro_representante_pdf) {
      return res.status(404).json({ error: "CertificaciÃ³n del representante legal no encontrada" });
    }
    const row = result.rows[0];
    const mime = row.rpa_registro_representante_mime || "application/pdf";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${row.rpa_registro_representante_filename || "registro-representante.pdf"}"`);
    return res.send(row.rpa_registro_representante_pdf);
  } catch (err) {
    console.error("Error fetching rpa registro representante", err);
    return res.status(500).json({ error: "No se pudo obtener la certificaciÃ³n del representante legal." });
  }
});

app.get("/api/submissions/:id/rpa-registro-entidad", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT rpa_registro_entidad_pdf, rpa_registro_entidad_filename, rpa_registro_entidad_mime
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount || !result.rows[0].rpa_registro_entidad_pdf) {
      return res.status(404).json({ error: "CertificaciÃ³n de la entidad no encontrada" });
    }
    const row = result.rows[0];
    const mime = row.rpa_registro_entidad_mime || "application/pdf";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${row.rpa_registro_entidad_filename || "registro-entidad.pdf"}"`);
    return res.send(row.rpa_registro_entidad_pdf);
  } catch (err) {
    console.error("Error fetching rpa registro entidad", err);
    return res.status(500).json({ error: "No se pudo obtener la certificaciÃ³n de la entidad." });
  }
});

app.get("/api/submissions/:id/rpa-documento-estado", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT rpa_documento_estado_pdf, rpa_documento_estado_filename, rpa_documento_estado_mime
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount || !result.rows[0].rpa_documento_estado_pdf) {
      return res.status(404).json({ error: "Documento de entidad del Estado/ONG no encontrado" });
    }
    const row = result.rows[0];
    const mime = row.rpa_documento_estado_mime || "application/pdf";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${row.rpa_documento_estado_filename || "documento-estado-ong.pdf"}"`);
    return res.send(row.rpa_documento_estado_pdf);
  } catch (err) {
    console.error("Error fetching rpa documento estado", err);
    return res.status(500).json({ error: "No se pudo obtener el documento de entidad del Estado/ONG." });
  }
});

app.get("/api/submissions/:id/boleta", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT analyst_pdf, analyst_pdf_filename, analyst_pdf_mime
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount || !result.rows[0].analyst_pdf) {
      return res.status(404).json({ error: "Boleta de pago no encontrada" });
    }
    const row = result.rows[0];
    const mime = row.analyst_pdf_mime || "application/pdf";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeHeaderFilename(row.analyst_pdf_filename || "boleta-pago.pdf", "boleta-pago.pdf")}"`);
    return res.send(row.analyst_pdf);
  } catch (err) {
    console.error("Error fetching boleta", err);
    return res.status(500).json({ error: "No se pudo obtener la boleta de pago" });
  }
});

app.get("/api/submissions/:id/documento-firmado", requireAuth, requireRole(...REVIEW_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isApprover = role === "aprobador";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    const isFinancialAvsec = role === FINANCIAL_ROLE_AVSEC;
    if (isApprover) {
      params.push(req.user?.sub);
      where.push(`assigned_aprobador_id = $${params.length}`);
    }
    if (isFinancialAvsec) {
      where.push(`unidad_clave = 'FINANCIERO'`);
      where.push(`signed_pdf IS NOT NULL`);
    }

    const result = await pool.query(
      `SELECT signed_pdf, signed_pdf_filename, signed_pdf_mime,
              id, registro_codigo, approved_at, unidad_clave, detalle_formulario, created_at, fecha, uso, especificaciones,
              nombre_propietario, representante_legal, direccion, telefono, correo,
              assigned_emisor_id, assigned_aprobador_id
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Documento firmado no encontrado." });
    }
    const row = result.rows[0];
    if (!row.signed_pdf && isAilaGenericWorkflow(row) && row.approved_at) {
      const pdfBuffer = await buildAilaAuthorizedPdfBuffer(row);
      const fallbackCode = row.registro_codigo || row.id;
      const filename = `formulario-autorizado-${String(fallbackCode).replace(/[^A-Za-z0-9-_]+/g, "-")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      return res.send(pdfBuffer);
    }
    if (!row.signed_pdf) {
      return res.status(404).json({ error: "Documento firmado no encontrado." });
    }
    const mime = row.signed_pdf_mime || "application/pdf";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${row.signed_pdf_filename || "documento-firmado.pdf"}"`);
    return res.send(row.signed_pdf);
  } catch (err) {
    console.error("Error fetching signed document", err);
    return res.status(500).json({ error: "No se pudo obtener el documento firmado" });
  }
});

app.post("/api/submissions/:id/analyst-pdf", requireAuth, requireRole("analista", "emisor", "admin", "supervisor"), async (req, res) => {
  const { id } = req.params;
  const { pdf_base64, filename, mime } = req.body || {};

  if (!pdf_base64 || typeof pdf_base64 !== "string") {
    return res.status(400).json({ error: "El PDF es obligatorio." });
  }

  let role = req.user?.role || null;
  let pdfBuffer;
  let decodeLabel = "La boleta de pago";
  try {
    role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    decodeLabel = role === "emisor" ? "El documento PDF" : "La boleta de pago";
    pdfBuffer = decodePdfBase64(pdf_base64, decodeLabel);
  } catch (err) {
    return res.status(400).json({ error: err.message || `${decodeLabel} no es válido.` });
  }
  if (!pdfBuffer || !pdfBuffer.length) {
    return res.status(400).json({ error: "PDF en formato base64 no válido." });
  }

  const safeMime = String(mime || "application/pdf").trim().toLowerCase();
  if (!safeMime.includes("pdf")) {
    return res.status(400).json({ error: "El archivo debe ser PDF." });
  }

  const safeFilename = String(filename || "boleta-pago.pdf")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim()
    .slice(0, 180) || "boleta-pago.pdf";

  try {
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];

    const accessWhere = ["id = $1"];
    const accessParams = [id];
    if (isAnalyst) {
      accessParams.push(req.user?.sub);
      accessWhere.push(`assigned_analista_id = $${accessParams.length}`);
    }
    if (isEmitter) {
      accessParams.push(req.user?.sub);
      accessWhere.push(`assigned_emisor_id = $${accessParams.length}`);
    }
    if (isUnitRestricted) {
      accessParams.push(unitAccess);
      accessWhere.push(`unidad_clave = ANY($${accessParams.length})`);
    }

    const current = await pool.query(
      `SELECT id, unidad_clave, detalle_formulario, approved_at, delivered_at, sent_to_emisor_at, assigned_emisor_id, sent_to_aprobador_at, assigned_aprobador_id
       FROM submissions
       WHERE ${accessWhere.join(" AND ")}`,
      accessParams
    );
    if (!current.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado o no asignado al analista." });
    }

    const row = current.rows[0];
    const isFinancial = String(row.unidad_clave || "").toUpperCase() === "FINANCIERO";
    const isPaymentPassword = isFinancialPaymentPasswordFlow(row);
    if (isFinancial && !isPaymentPassword && isAnalyst) {
      return res.status(400).json({ error: "En financiero el documento PDF debe cargarlo el emisor." });
    }
    if (isFinancial && isPaymentPassword && isEmitter) {
      return res.status(400).json({ error: "En solicitud de contraseña de pago el PDF debe cargarlo el analista." });
    }
    if (!isFinancial && isEmitter) {
      return res.status(400).json({ error: "El rol emisor solo puede cargar PDFs en procesos financieros." });
    }
    if (row.approved_at) {
      return res.status(400).json({ error: "No se puede modificar el PDF porque el proceso ya está aprobado." });
    }
    if (row.delivered_at) {
      return res.status(400).json({ error: "No se puede modificar el PDF porque el proceso ya fue finalizado." });
    }
    if (isFinancial && !isPaymentPassword) {
      if (row.sent_to_aprobador_at || row.assigned_aprobador_id) {
        return res.status(400).json({ error: "No se puede modificar el PDF. El proceso ya fue enviado a la siguiente etapa." });
      }
    } else if (!isPaymentPassword && (row.sent_to_emisor_at || row.assigned_emisor_id || row.sent_to_aprobador_at || row.assigned_aprobador_id)) {
      return res.status(400).json({ error: "No se puede modificar la boleta. El proceso ya fue enviado a la siguiente etapa." });
    }

    const result = await pool.query(
      `UPDATE submissions
       SET analyst_pdf = $1,
           analyst_pdf_filename = $2,
           analyst_pdf_mime = $3,
           analyst_pdf_uploaded_by_user_id = $4,
           analyst_pdf_uploaded_at = NOW()
       WHERE id = $5
       RETURNING id, analyst_pdf_filename, analyst_pdf_mime, analyst_pdf_uploaded_at, analyst_pdf_uploaded_by_user_id`,
      [pdfBuffer, safeFilename, safeMime, req.user?.sub || null, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado o no asignado al analista." });
    }

    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "analista_sube_pdf",
      eventLabel: isFinancial && !isPaymentPassword && isEmitter
        ? "Emisor subió documento PDF"
        : "Analista subió boleta de pago",
      eventDetail: safeFilename,
      actorUserId: req.user?.sub || null,
      actorRole: role
    });

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error uploading analyst pdf", err);
    return res.status(500).json({ error: "No se pudo cargar el PDF del proceso." });
  }
});

app.post("/api/submissions/:id/signed-pdf", requireAuth, requireRole("aprobador", "emisor", "admin", "supervisor"), async (req, res) => {
  const { id } = req.params;
  const { pdf_base64, filename, mime } = req.body || {};

  if (!pdf_base64 || typeof pdf_base64 !== "string") {
    return res.status(400).json({ error: "El documento firmado es obligatorio." });
  }

  let pdfBuffer;
  try {
    pdfBuffer = decodePdfBase64(pdf_base64, "El documento firmado");
  } catch (err) {
    return res.status(400).json({ error: err.message || "El documento firmado no es válido." });
  }
  if (!pdfBuffer || !pdfBuffer.length) {
    return res.status(400).json({ error: "PDF en formato base64 no válido." });
  }

  const safeMime = String(mime || "application/pdf").trim().toLowerCase();
  if (!safeMime.includes("pdf")) {
    return res.status(400).json({ error: "El archivo debe ser PDF." });
  }

  const safeFilename = String(filename || "documento-firmado.pdf")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim()
    .slice(0, 180) || "documento-firmado.pdf";

  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isApprover = role === "aprobador";
    const isEmitter = role === "emisor";
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];

    const accessWhere = ["id = $1"];
    const accessParams = [id];
    if (isApprover) {
      accessParams.push(req.user?.sub);
      accessWhere.push(`assigned_aprobador_id = $${accessParams.length}`);
    }
    if (isEmitter) {
      accessParams.push(req.user?.sub);
      accessWhere.push(`assigned_emisor_id = $${accessParams.length}`);
    }
    if (isUnitRestricted) {
      accessParams.push(unitAccess);
      accessWhere.push(`unidad_clave = ANY($${accessParams.length})`);
    }

    const current = await pool.query(
      `SELECT id, approved_at, approved_by_user_id, unidad_clave
       FROM submissions
       WHERE ${accessWhere.join(" AND ")}`,
      accessParams
    );
    if (!current.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado o no asignado al usuario." });
    }
    const currentRow = current.rows[0];
    const currentUnit = String(currentRow.unidad_clave || "").toUpperCase();
    if (currentUnit === "RAN") {
      return res.status(400).json({ error: "En RAN el aprobador no debe cargar documento firmado." });
    }
    if (isAilaGenericWorkflow(currentRow)) {
      return res.status(400).json({ error: "En AILA permiso genÃ©rico la Jefatura AILA no debe cargar documento firmado." });
    }
    if (currentRow.approved_at) {
      return res.status(400).json({ error: "No se puede modificar el documento firmado porque el proceso ya estÃ¡ aprobado." });
    }
    if (isEmitter) {
      if (currentUnit !== "FINANCIERO") {
        return res.status(400).json({ error: "El rol emisor solo puede cargar documento firmado final en procesos financieros." });
      }
      if (!currentRow.approved_by_user_id) {
        return res.status(400).json({ error: "El proceso debe ser aprobado por el aprobador antes de cargar el documento firmado final." });
      }
    }

    const result = await pool.query(
      `UPDATE submissions
       SET signed_pdf = $1,
           signed_pdf_filename = $2,
           signed_pdf_mime = $3,
           signed_pdf_uploaded_at = NOW(),
           approved_at = CASE WHEN $5 THEN NOW() ELSE approved_at END,
           delivered_at = CASE WHEN $5 THEN NULL ELSE delivered_at END,
           delivered_by_user_id = CASE WHEN $5 THEN NULL ELSE delivered_by_user_id END
       WHERE id = $4
       RETURNING id, signed_pdf_filename, signed_pdf_mime, signed_pdf_uploaded_at, approved_at, approved_by_user_id`,
      [pdfBuffer, safeFilename, safeMime, id, isEmitter]
    );

    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "aprobador_sube_pdf",
      eventLabel: isEmitter ? "Emisor subió documento firmado final" : "Aprobador subió documento firmado",
      eventDetail: safeFilename,
      actorUserId: req.user?.sub || null,
      actorRole: role
    });

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error uploading signed pdf", err);
    return res.status(500).json({ error: "No se pudo cargar el documento firmado." });
  }
});

// Analista/emisor/admin/supervisor devuelven formulario al usuario para correcciÃ³n
app.post("/api/submissions/:id/return", requireAuth, requireRole("analista", "emisor", AILA_ROLE_JEFATURA_AILA, "admin", "supervisor"), async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || "").trim();
  if (!reason) {
    return res.status(400).json({ error: "El motivo de devoluciÃ³n es obligatorio." });
  }
  const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
  const isAnalyst = role === "analista";
  const isEmitter = role === "emisor";
  const isAilaFinal = isAilaStage4Role(role);
  const isUnitRestricted = isUnitRestrictedRole(role);
  const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
  try {
    if (isEmitter) {
      const financialCheck = await pool.query(`SELECT unidad_clave FROM submissions WHERE id = $1`, [id]);
      if (financialCheck.rowCount && String(financialCheck.rows[0].unidad_clave || "").toUpperCase() === "FINANCIERO") {
        return res.status(403).json({ error: "El emisor de Financiero no puede devolver el proceso al usuario." });
      }
    }
    const where = ["id = $3"];
    const params = [reason, req.user?.sub, id];
    if (isAnalyst) {
      where.push("assigned_analista_id = $2");
    }
    if (isEmitter) {
      where.push("assigned_emisor_id = $2");
    }
    if (isAilaFinal) {
      where.push("assigned_aprobador_id = $2");
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    const result = await pool.query(
      `UPDATE submissions
       SET returned_at = NOW(),
           returned_reason = $1,
           returned_by_user_id = $2,
           returned_to_analista_at = NULL,
           returned_to_analista_reason = NULL,
           returned_to_analista_by_user_id = NULL,
           analyst_pdf = NULL,
           analyst_pdf_filename = NULL,
           analyst_pdf_mime = NULL,
           analyst_pdf_uploaded_at = NULL,
           analyst_pdf_uploaded_by_user_id = NULL,
           signed_pdf = NULL,
           signed_pdf_filename = NULL,
           signed_pdf_mime = NULL,
           signed_pdf_uploaded_at = NULL,
           assigned_emisor_id = NULL,
           sent_to_emisor_at = NULL,
           assigned_aprobador_id = NULL,
           sent_to_aprobador_at = NULL,
           approved_at = NULL,
           approved_by_user_id = NULL,
           delivered_at = NULL,
           delivered_by_user_id = NULL
       WHERE ${where.join(" AND ")}
       RETURNING id, returned_at, returned_reason, returned_by_user_id`,
      params
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado o sin acceso para devolverlo al usuario." });
    }
    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "devolucion_usuario",
      eventLabel: "Formulario devuelto al usuario",
      eventDetail: reason,
      actorUserId: req.user?.sub || null,
      actorRole: role
    });
    sendSubmissionNotification(async () => {
      const context = await getSubmissionNotificationContext(Number(id));
      const recipientEmail = context?.owner_email || context?.correo;
      if (!recipientEmail) return;
      await notifyUserStatus({
        to: recipientEmail,
        recipientName: context?.owner_name || context?.nombre_propietario,
        subjectPrefix: "Formulario devuelto",
        heading: "Tu formulario fue devuelto para correccion",
        message: "Se realizaron observaciones en tu tramite y ya puedes corregirlo desde el portal.",
        context,
        reason
      });
    });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error devolviendo formulario", err);
    return res.status(500).json({ error: "No se pudo devolver el formulario." });
  }
});

// Analista/admin/supervisor envÃ­an formulario al emisor de la unidad.
app.post("/api/submissions/:id/send-to-emisor", requireAuth, requireRole("analista", AILA_ROLE_RECEPCION_AVSEC, AILA_ROLE_ADMINISTRACION, "admin", "supervisor"), async (req, res) => {
  const { id } = req.params;
  const requestedEmisorId = req.body?.emisor_id ? Number(req.body.emisor_id) : null;
  const comentariosRevision = String(req.body?.comentarios_revision || "").trim() || null;
  if (requestedEmisorId !== null && (!Number.isInteger(requestedEmisorId) || requestedEmisorId <= 0)) {
    return res.status(400).json({ error: "emisor_id no vÃ¡lido." });
  }

  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isEmitter = role === "emisor";
    const isAilaStage2 = isAilaStage2Role(role);
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];

    const where = ["id = $1"];
    const params = [id];
    if (isAilaStage2) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }

    const submissionResult = await pool.query(
      `SELECT id, unidad_clave, detalle_formulario, approved_at
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!submissionResult.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado o no asignado al responsable." });
    }

    const submission = submissionResult.rows[0];
    if (submission.approved_at) {
      return res.status(400).json({ error: "El formulario ya estÃ¡ aprobado." });
    }
    if (isAilaGenericWorkflow(submission) && !isAilaStage2 && role !== "admin" && role !== "supervisor") {
      return res.status(400).json({ error: "En AILA este paso corresponde a RecepciÃ³n AVSEC." });
    }
    if (isFinancialPaymentPasswordFlow(submission)) {
      return res.status(400).json({ error: "Este proceso finaliza con la boleta de pago y no debe enviarse a emisor." });
    }
    const submissionUnit = String(submission.unidad_clave || "GENERAL").toUpperCase();
    const isAilaGeneric = isAilaGenericWorkflow(submission);

    const emitterRoleWhere = isAilaGeneric
      ? `(role = '${AILA_ROLE_JEFATURA}' OR role = '${AILA_ROLE_UETIA}')`
      : `role = 'emisor'`;
    const emitterQuery = requestedEmisorId
      ? `SELECT id, name, email, unit_access
         FROM users
         WHERE ${emitterRoleWhere}
           AND id = $1
           AND unit_access @> ARRAY[$2]::TEXT[]
         LIMIT 1`
      : `SELECT id, name, email, unit_access
         FROM users
         WHERE ${emitterRoleWhere}
           AND unit_access @> ARRAY[$1]::TEXT[]
         ORDER BY created_at ASC, id ASC
         LIMIT 1`;
    const emitterParams = requestedEmisorId
      ? [requestedEmisorId, submissionUnit]
      : [submissionUnit];
    const emitterResult = await pool.query(emitterQuery, emitterParams);
    if (!emitterResult.rowCount) {
      return res.status(400).json({
        error: requestedEmisorId
          ? (isAilaGeneric ? "La Jefatura AVSEC seleccionada no existe o no tiene acceso a esta unidad." : "El emisor seleccionado no existe o no tiene acceso a esta unidad.")
          : (isAilaGeneric ? "No existe una Jefatura AVSEC configurada para esta unidad." : "No existe un emisor configurado para esta unidad.")
      });
    }

    const emitter = emitterResult.rows[0];
    const emitterUnits = normalizeUnitAccess(emitter.unit_access);
    if (!emitterUnits.includes(submissionUnit)) {
      return res.status(400).json({ error: "El emisor no tiene acceso a la unidad de este formulario." });
    }

    const updated = await pool.query(
      `UPDATE submissions
       SET assigned_emisor_id = $1,
           sent_to_emisor_at = NOW(),
           comentarios_revision = $3,
           assigned_aprobador_id = NULL,
           sent_to_aprobador_at = NULL,
           signed_pdf = NULL,
           signed_pdf_filename = NULL,
           signed_pdf_mime = NULL,
           signed_pdf_uploaded_at = NULL,
           returned_to_analista_at = NULL,
           returned_to_analista_reason = NULL,
           returned_to_analista_by_user_id = NULL,
           approved_at = NULL,
           approved_by_user_id = NULL,
           delivered_at = NULL,
           delivered_by_user_id = NULL
       WHERE id = $2
       RETURNING id, assigned_emisor_id, sent_to_emisor_at`,
      [emitter.id, id, comentariosRevision]
    );

    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "enviado_emisor",
      eventLabel: isAilaGeneric ? "Formulario enviado a Jefatura AVSEC" : "Formulario enviado a emisor",
      eventDetail: comentariosRevision || emitter.name || emitter.email || `ID ${emitter.id}`,
      actorUserId: req.user?.sub || null,
      actorRole: role,
      metadata: {
        emisor_id: Number(emitter.id),
        emisor_email: emitter.email || null,
        comentarios_revision: comentariosRevision
      }
    });
    sendSubmissionNotification(async () => {
      const context = await getSubmissionNotificationContext(Number(id));
      if (context?.emitter_email) {
        await notifyAssignee({
          to: context.emitter_email,
          recipientName: context.emitter_name,
          roleLabel: isAilaGeneric ? "Jefatura AVSEC" : "emisor",
          actionLabel: isAilaGeneric ? "Formulario enviado a Jefatura AVSEC" : "Formulario enviado a emisor",
          context,
          comments: comentariosRevision
        });
      }
      await notifyOwnerSubmissionStatus(Number(id), {
        subjectPrefix: "Cambio de estado",
        heading: "Tu tramite avanzo a la siguiente etapa",
        message: isAilaGeneric
          ? "Tu solicitud fue enviada a Jefatura AVSEC para continuar la revision."
          : "Tu solicitud fue enviada al emisor para continuar la gestion.",
        reason: comentariosRevision || ""
      });
    });

    return res.json({
      id: updated.rows[0].id,
      assigned_emisor_id: updated.rows[0].assigned_emisor_id,
      sent_to_emisor_at: updated.rows[0].sent_to_emisor_at,
      assigned_emisor_name: emitter.name || null,
      assigned_emisor_email: emitter.email || null
    });
  } catch (err) {
    console.error("Error enviando a emisor", err);
    return res.status(500).json({ error: "No se pudo enviar al emisor." });
  }
});

// RAN/otras unidades: analista envia al aprobador. Financiero: emisor envia al aprobador.
app.post("/api/submissions/:id/send-to-approver", requireAuth, requireRole("analista", "emisor", AILA_ROLE_JEFATURA, AILA_ROLE_UETIA, "admin", "supervisor"), async (req, res) => {
  const { id } = req.params;
  const requestedAprobadorId = req.body?.aprobador_id ? Number(req.body.aprobador_id) : null;
  if (requestedAprobadorId !== null && (!Number.isInteger(requestedAprobadorId) || requestedAprobadorId <= 0)) {
    return res.status(400).json({ error: "aprobador_id no vÃ¡lido." });
  }

  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isAnalyst = role === "analista";
    const isEmitter = role === "emisor";
    const isAilaStage3 = isAilaStage3Role(role);
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];

    const where = ["id = $1"];
    const params = [id];
    if (isAnalyst) {
      params.push(req.user?.sub);
      where.push(`assigned_analista_id = $${params.length}`);
    }
    if (isEmitter || isAilaStage3) {
      params.push(req.user?.sub);
      where.push(`assigned_emisor_id = $${params.length}`);
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    const submissionResult = await pool.query(
      `SELECT id, unidad_clave, detalle_formulario, approved_at, analyst_pdf, analyst_pdf_filename
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!submissionResult.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado o no asignado al analista." });
    }

    const submission = submissionResult.rows[0];
    const submissionUnit = String(submission.unidad_clave || "GENERAL").toUpperCase();
    const isAilaGeneric = isAilaGenericWorkflow(submission);
    if (submission.approved_at) {
      return res.status(400).json({ error: "El formulario ya estÃ¡ aprobado." });
    }
    if (isFinancialPaymentPasswordFlow(submission)) {
      return res.status(400).json({ error: "Este proceso finaliza con la boleta de pago y no debe enviarse a aprobador." });
    }
    if (isAilaGeneric && !isAilaStage3 && role !== "admin" && role !== "supervisor") {
      return res.status(400).json({ error: "En AILA este paso corresponde a Jefatura AVSEC." });
    }
    if (submissionUnit === "FINANCIERO" && isAnalyst) {
      return res.status(400).json({ error: "En financiero el analista debe enviar el proceso al emisor antes del aprobador." });
    }
    if (submissionUnit !== "FINANCIERO" && isEmitter) {
      return res.status(400).json({ error: "El rol emisor solo envía a aprobador procesos financieros." });
    }
    if (!isAilaGeneric && !submission.analyst_pdf) {
      return res.status(400).json({
        error: submissionUnit === "FINANCIERO"
          ? "Debes cargar el documento PDF de este proceso antes de enviarlo al aprobador."
          : "Debes subir la boleta de pago de este proceso antes de enviarlo al aprobador."
      });
    }

    let approverResult;
    if (requestedAprobadorId) {
      approverResult = await pool.query(
        `SELECT id, name, email, unit_access FROM users WHERE id = $1 AND ${isAilaGeneric ? `role = '${AILA_ROLE_JEFATURA_AILA}'` : `role = 'aprobador'`}`,
        [requestedAprobadorId]
      );
      if (!approverResult.rowCount) {
        return res.status(400).json({ error: isAilaGeneric ? "El usuario seleccionado no es Jefatura AILA." : "El usuario seleccionado no es aprobador." });
      }
    } else {
      approverResult = await pool.query(
        `SELECT id, name, email, unit_access
         FROM users
         WHERE ${isAilaGeneric ? `role = '${AILA_ROLE_JEFATURA_AILA}'` : `role = 'aprobador'`}
           AND unit_access @> ARRAY[$1]::TEXT[]
         ORDER BY created_at ASC, id ASC
         LIMIT 1`,
        [submissionUnit]
      );
      if (!approverResult.rowCount) {
        return res.status(400).json({ error: isAilaGeneric ? "No existe una Jefatura AILA configurada para esta unidad." : "No existe un aprobador configurado para esta unidad." });
      }
    }

    const approver = approverResult.rows[0];
    const approverUnits = normalizeUnitAccess(approver.unit_access);
    if (!approverUnits.includes(submissionUnit)) {
      return res.status(400).json({ error: "El aprobador no tiene acceso a la unidad de este formulario." });
    }

    const updated = await pool.query(
      `UPDATE submissions
       SET assigned_aprobador_id = $1,
           sent_to_aprobador_at = NOW(),
           returned_to_analista_at = NULL,
           returned_to_analista_reason = NULL,
           returned_to_analista_by_user_id = NULL,
           signed_pdf = NULL,
           signed_pdf_filename = NULL,
           signed_pdf_mime = NULL,
           signed_pdf_uploaded_at = NULL,
           approved_at = NULL,
           approved_by_user_id = NULL,
           delivered_at = NULL,
           delivered_by_user_id = NULL
       WHERE id = $2
       RETURNING id, assigned_aprobador_id, sent_to_aprobador_at`,
      [approver.id, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado." });
    }

    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "enviado_aprobador",
      eventLabel: isAilaGeneric ? "Formulario enviado a Jefatura AILA" : "Formulario enviado a aprobador",
      eventDetail: approver.name || approver.email || `ID ${approver.id}`,
      actorUserId: req.user?.sub || null,
      actorRole: role,
      metadata: {
        aprobador_id: Number(approver.id),
        aprobador_email: approver.email || null
      }
    });
    sendSubmissionNotification(async () => {
      const context = await getSubmissionNotificationContext(Number(id));
      if (context?.approver_email) {
        await notifyAssignee({
          to: context.approver_email,
          recipientName: context.approver_name,
          roleLabel: isAilaGeneric ? "Jefatura AILA" : "aprobador",
          actionLabel: isAilaGeneric ? "Formulario enviado a Jefatura AILA" : "Formulario enviado a aprobador",
          context
        });
      }
      await notifyOwnerSubmissionStatus(Number(id), {
        subjectPrefix: "Cambio de estado",
        heading: "Tu tramite paso a aprobacion",
        message: isAilaGeneric
          ? "Tu solicitud fue enviada a Jefatura AILA para revision final."
          : "Tu solicitud fue enviada al aprobador para continuar la gestion."
      });
    });

    return res.json({
      id: updated.rows[0].id,
      assigned_aprobador_id: updated.rows[0].assigned_aprobador_id,
      sent_to_aprobador_at: updated.rows[0].sent_to_aprobador_at,
      assigned_aprobador_name: approver.name || null,
      assigned_aprobador_email: approver.email || null
    });
  } catch (err) {
    console.error("Error enviando a aprobador", err);
    return res.status(500).json({ error: "No se pudo enviar al aprobador." });
  }
});

// Aprobador/admin/supervisor devuelven formulario al analista
app.post("/api/submissions/:id/return-to-analyst", requireAuth, requireRole("aprobador", AILA_ROLE_JEFATURA_AILA, "admin", "supervisor"), async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || "").trim();
  if (!reason) {
    return res.status(400).json({ error: "El motivo de devoluciÃ³n al analista es obligatorio." });
  }

  const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
  const isApprover = role === "aprobador" || isAilaStage4Role(role);
  const isUnitRestricted = isUnitRestrictedRole(role);
  const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
  try {
    const where = ["id = $3"];
    const params = [reason, req.user?.sub, id];
    if (isApprover) {
      where.push("assigned_aprobador_id = $2");
    }
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    const result = await pool.query(
      `UPDATE submissions
       SET returned_to_analista_at = NOW(),
           returned_to_analista_reason = $1,
           returned_to_analista_by_user_id = $2,
           assigned_emisor_id = NULL,
           sent_to_emisor_at = NULL,
           assigned_aprobador_id = NULL,
           sent_to_aprobador_at = NULL,
           signed_pdf = NULL,
           signed_pdf_filename = NULL,
           signed_pdf_mime = NULL,
           signed_pdf_uploaded_at = NULL,
           approved_at = NULL,
           approved_by_user_id = NULL,
           delivered_at = NULL,
           delivered_by_user_id = NULL
       WHERE ${where.join(" AND ")}
       RETURNING id, returned_to_analista_at, returned_to_analista_reason, returned_to_analista_by_user_id`,
      params
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado o no asignado al aprobador." });
    }
    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "devolucion_analista",
      eventLabel: "Aprobador devolviÃ³ al analista",
      eventDetail: reason,
      actorUserId: req.user?.sub || null,
      actorRole: role
    });
    sendSubmissionNotification(async () => {
      const context = await getSubmissionNotificationContext(Number(id));
      if (context?.analyst_email) {
        await notifyAssignee({
          to: context.analyst_email,
          recipientName: context.analyst_name,
          roleLabel: "analista",
          actionLabel: "Formulario devuelto al analista",
          context,
          comments: reason
        });
      }
      await notifyOwnerSubmissionStatus(Number(id), {
        subjectPrefix: "Cambio de estado",
        heading: "Tu tramite regreso a revision interna",
        message: "Tu solicitud fue devuelta al analista para ajustes internos antes de continuar.",
        reason
      });
    });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error devolviendo al analista", err);
    return res.status(500).json({ error: "No se pudo devolver el formulario al analista." });
  }
});

// Aprobador/admin/supervisor marcan formulario como aprobado
app.post("/api/submissions/:id/approve", requireAuth, requireRole("aprobador", AILA_ROLE_JEFATURA_AILA, "admin", "supervisor"), async (req, res) => {
  const { id } = req.params;
  const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
  const isApprover = role === "aprobador" || isAilaStage4Role(role);
  const isUnitRestricted = isUnitRestrictedRole(role);
  const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
  try {
    const where = ["id = $2"];
    if (isApprover) {
      where.push("assigned_aprobador_id = $1");
    }
    const params = [req.user?.sub, id];
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    const current = await pool.query(
      `SELECT id, unidad_clave, signed_pdf, assigned_emisor_id
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!current.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado o no asignado al aprobador." });
    }
    const currentRow = current.rows[0];
    const currentUnit = String(currentRow.unidad_clave || "").toUpperCase();
    if (currentUnit === "FINANCIERO") {
      const result = await pool.query(
        `UPDATE submissions
         SET approved_by_user_id = $1,
             assigned_aprobador_id = NULL,
             sent_to_aprobador_at = NULL,
             delivered_at = NULL,
             delivered_by_user_id = NULL,
             returned_to_analista_at = NULL,
             returned_to_analista_reason = NULL,
             returned_to_analista_by_user_id = NULL,
             returned_at = NULL,
             returned_reason = NULL,
             returned_by_user_id = NULL
         WHERE ${where.join(" AND ")}
         RETURNING id, approved_at, approved_by_user_id, assigned_aprobador_id, sent_to_aprobador_at`,
        params
      );
      if (!result.rowCount) {
        return res.status(404).json({ error: "Registro no encontrado o no asignado al aprobador." });
      }
      await registerSubmissionLog({
        submissionId: Number(id),
        eventCode: "aprobacion",
        eventLabel: "Formulario aprobado y devuelto al emisor",
        eventDetail: `Aprobado por rol ${role}`,
        actorUserId: req.user?.sub || null,
        actorRole: role
      });
      sendSubmissionNotification(async () => {
        const context = await getSubmissionNotificationContext(Number(id));
        if (context?.emitter_email) {
          await notifyAssignee({
            to: context.emitter_email,
            recipientName: context.emitter_name,
            roleLabel: "emisor",
            actionLabel: "Proceso aprobado y devuelto al emisor",
            context
          });
        }
        await notifyOwnerSubmissionStatus(Number(id), {
          subjectPrefix: "Cambio de estado",
          heading: "Tu tramite fue aprobado por el aprobador",
          message: "Tu solicitud ya fue aprobada por el aprobador y regreso al emisor para la emision final del documento."
        });
      });
      return res.json({
        ...result.rows[0],
        assigned_aprobador_name: null,
        assigned_aprobador_email: null
      });
    }
    const result = await pool.query(
      `UPDATE submissions
       SET approved_at = NOW(),
           approved_by_user_id = $1,
           delivered_at = NULL,
           delivered_by_user_id = NULL,
           returned_to_analista_at = NULL,
           returned_to_analista_reason = NULL,
           returned_to_analista_by_user_id = NULL,
           returned_at = NULL,
           returned_reason = NULL,
           returned_by_user_id = NULL
       WHERE ${where.join(" AND ")}
       RETURNING id, approved_at, approved_by_user_id`,
      params
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado o no asignado al aprobador." });
    }
    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "aprobacion",
      eventLabel: "Formulario aprobado",
      eventDetail: `Aprobado por rol ${role}`,
      actorUserId: req.user?.sub || null,
      actorRole: role
    });
    sendSubmissionNotification(async () => {
      await notifyOwnerSubmissionStatus(Number(id), {
        subjectPrefix: "Formulario aprobado",
        heading: "Tu tramite fue aprobado",
        message: "Tu solicitud ya fue aprobada y puedes consultar el estado actualizado dentro del portal."
      });
    });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error aprobando formulario", err);
    return res.status(500).json({ error: "No se pudo aprobar el formulario." });
  }
});

// Receptor marca certificaciÃ³n RAN como entregada o procesos financieros como finalizados
app.post("/api/submissions/:id/deliver", requireAuth, async (req, res) => {
  const { id } = req.params;
  const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
  if (role !== "revisor") {
    return res.status(403).json({ error: "Solo el receptor puede marcar este proceso como entregado o finalizado." });
  }
  const isUnitRestricted = isUnitRestrictedRole(role);
  const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];

  try {
    const where = ["id = $1"];
    const params = [id];
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }

    const current = await pool.query(
      `SELECT id, unidad_clave, detalle_formulario, approved_at, delivered_at, analyst_pdf
       FROM submissions
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!current.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado o sin acceso para el receptor." });
    }

    const row = current.rows[0];
    const unit = String(row.unidad_clave || "").toUpperCase();
    const isRan = unit === "RAN";
    const isFinancial = unit === "FINANCIERO";
    const isPaymentPassword = isFinancialPaymentPasswordFlow(row);
    if (!isRan && !isFinancial) {
      return res.status(400).json({ error: "Este proceso no se puede marcar como entregado o finalizado desde esta acciÃ³n." });
    }
    if (isRan && !row.approved_at) {
      return res.status(400).json({ error: "El proceso debe estar aprobado antes de marcarse como entregado." });
    }
    if (isFinancial && !isPaymentPassword && !row.approved_at) {
      return res.status(400).json({ error: "El proceso financiero debe estar aprobado antes de marcarse como finalizado." });
    }
    if (isPaymentPassword && !row.analyst_pdf) {
      return res.status(400).json({ error: "Debes cargar la boleta de pago antes de finalizar este proceso." });
    }
    if (row.delivered_at) {
      return res.status(400).json({ error: "El proceso ya fue marcado como entregado o finalizado." });
    }

    const result = await pool.query(
      `UPDATE submissions
       SET delivered_at = NOW(),
           delivered_by_user_id = $1
       WHERE id = $2
       RETURNING id, delivered_at, delivered_by_user_id`,
      [req.user?.sub, id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado." });
    }

    try {
      await registerSubmissionLog({
        submissionId: Number(id),
        eventCode: isFinancial ? "proceso_finalizado" : "entrega_usuario",
        eventLabel: isFinancial ? "Proceso financiero finalizado" : "Certificación entregada al usuario",
        eventDetail: isFinancial
          ? "Receptor marcó el proceso financiero como finalizado."
          : "Receptor marcó el proceso como entregado.",
        actorUserId: req.user?.sub || null,
        actorRole: role
      });
    } catch (logErr) {
      console.warn("No se pudo registrar la bitÃ¡cora de entrega/finalizaciÃ³n", logErr);
    }

    sendSubmissionNotification(async () => {
      await notifyOwnerSubmissionStatus(Number(id), {
        subjectPrefix: isFinancial ? "Proceso finalizado" : "Proceso entregado",
        heading: isFinancial ? "Tu proceso financiero finalizo" : "Tu proceso fue entregado",
        message: isFinancial
          ? "Tu proceso financiero cambio a estado finalizado y ya puedes revisar el resultado dentro del portal."
          : "Tu tramite fue marcado como entregado y ya puedes revisar el estado actualizado dentro del portal."
      });
    });

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error marcando entrega/finalizaciÃ³n", err);
    return res.status(500).json({ error: "No se pudo marcar la entrega o finalizaciÃ³n." });
  }
});

// Revisor/admin/supervisor marca formulario como abierto
app.post("/api/submissions/:id/open", requireAuth, requireRole("revisor", "admin", "supervisor"), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const where = ["id = $1"];
    const params = [id];
    if (isUnitRestricted) {
      params.push(unitAccess);
      where.push(`unidad_clave = ANY($${params.length})`);
    }
    const result = await pool.query(
      `UPDATE submissions
       SET receptor_opened_at = COALESCE(receptor_opened_at, NOW())
       WHERE ${where.join(" AND ")}
       RETURNING id, receptor_opened_at`,
      params
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "receptor_abre",
      eventLabel: "Receptor abriÃ³ el formulario",
      actorUserId: req.user?.sub || null,
      actorRole: role
    });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error marcando formulario como abierto", err);
    return res.status(500).json({ error: "No se pudo marcar como abierto" });
  }
});

// Revisor/admin/supervisor asigna analista
app.post("/api/submissions/:id/assign", requireAuth, requireRole("revisor", AILA_ROLE_RECEPCION, "admin", "supervisor"), async (req, res) => {
  const { id } = req.params;
  const { analista_id } = req.body || {};
  const comentariosRevision = String(req.body?.comentarios_revision || "").trim() || null;
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const submissionParams = [id];
    let submissionWhere = "id = $1";
    if (isUnitRestricted) {
      submissionParams.push(unitAccess);
      submissionWhere += ` AND unidad_clave = ANY($2)`;
    }
    const submissionResult = await pool.query(
      `SELECT id, unidad_clave, detalle_formulario FROM submissions WHERE ${submissionWhere}`,
      submissionParams
    );
    if (!submissionResult.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    const submissionRow = submissionResult.rows[0];
    const submissionUnit = String(submissionRow.unidad_clave || "GENERAL").toUpperCase();
    const isAilaGeneric = isAilaGenericWorkflow(submissionRow);

    if (!analista_id) {
      const cleared = await pool.query(
        "UPDATE submissions SET assigned_analista_id = NULL, comentarios_revision = $2, assigned_emisor_id = NULL, sent_to_emisor_at = NULL, assigned_aprobador_id = NULL, sent_to_aprobador_at = NULL, signed_pdf = NULL, signed_pdf_filename = NULL, signed_pdf_mime = NULL, signed_pdf_uploaded_at = NULL WHERE id = $1 RETURNING id",
        [id, comentariosRevision]
      );
      if (!cleared.rowCount) {
        return res.status(404).json({ error: "Registro no encontrado" });
      }
      await registerSubmissionLog({
        submissionId: Number(id),
        eventCode: "asignacion_removida",
        eventLabel: "Se removio la asignacion de analista",
        eventDetail: comentariosRevision,
        actorUserId: req.user?.sub || null,
        actorRole: role,
        metadata: {
          comentarios_revision: comentariosRevision
        }
      });
      return res.json({
        message: "Asignacion removida",
        submission_id: id,
        analista_id: null,
        assigned_analista_name: null,
        assigned_analista_email: null
      });
    }

    // validate role analista
    const userRow = await pool.query("SELECT id, role, unit_access, email, name FROM users WHERE id = $1", [analista_id]);
    const allowedTargetRoles = isAilaGeneric ? [AILA_ROLE_RECEPCION_AVSEC, AILA_ROLE_ADMINISTRACION] : ["analista"];
    if (!userRow.rowCount || !allowedTargetRoles.includes(String(userRow.rows[0].role || "").trim().toLowerCase())) {
      return res.status(400).json({ error: isAilaGeneric ? "El usuario no es RecepciÃ³n AVSEC." : "El usuario no es analista." });
    }
    const analystUnits = normalizeUnitAccess(userRow.rows[0].unit_access);
    if (!analystUnits.includes(submissionUnit)) {
      return res.status(400).json({ error: "El analista no tiene acceso a la unidad de este formulario." });
    }
    const result = await pool.query(
      "UPDATE submissions SET assigned_analista_id = $1, comentarios_revision = $3, assigned_emisor_id = NULL, sent_to_emisor_at = NULL, assigned_aprobador_id = NULL, sent_to_aprobador_at = NULL, signed_pdf = NULL, signed_pdf_filename = NULL, signed_pdf_mime = NULL, signed_pdf_uploaded_at = NULL WHERE id = $2 RETURNING id",
      [analista_id, id, comentariosRevision]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    await registerSubmissionLog({
      submissionId: Number(id),
      eventCode: "asignado_analista",
        eventLabel: isAilaGeneric ? "Formulario asignado a RecepciÃ³n AVSEC" : "Formulario asignado a analista",
      eventDetail: comentariosRevision || userRow.rows[0].name || userRow.rows[0].email || `ID ${analista_id}`,
      actorUserId: req.user?.sub || null,
      actorRole: role,
      metadata: {
        analista_id: Number(analista_id),
        analista_email: userRow.rows[0].email || null,
        comentarios_revision: comentariosRevision
      }
    });
    sendSubmissionNotification(async () => {
      const context = await getSubmissionNotificationContext(Number(id));
      if (context?.analyst_email) {
        await notifyAssignee({
          to: context.analyst_email,
          recipientName: context.analyst_name,
          roleLabel: isAilaGeneric ? "Recepcion AVSEC" : "analista",
          actionLabel: isAilaGeneric ? "Nuevo formulario asignado a Recepcion AVSEC" : "Nuevo formulario asignado",
          context,
          comments: comentariosRevision
        });
      }
      await notifyOwnerSubmissionStatus(Number(id), {
        subjectPrefix: "Cambio de estado",
        heading: "Tu tramite inicio revision",
        message: isAilaGeneric
          ? "Tu solicitud fue asignada a Recepcion AVSEC para iniciar la revision."
          : "Tu solicitud fue asignada a un analista para iniciar la revision.",
        reason: comentariosRevision || ""
      });
    });
    return res.json({
      message: "Asignado",
      submission_id: id,
      analista_id,
      assigned_analista_name: userRow.rows[0].name || null,
      assigned_analista_email: userRow.rows[0].email || null
    });
  } catch (err) {
    console.error("Error asignando analista", err);
    return res.status(500).json({ error: "No se pudo asignar analista" });
  }
});

// Lista analistas
app.get("/api/analistas", requireAuth, requireRole("revisor", AILA_ROLE_RECEPCION, "admin", "supervisor"), async (req, res) => {
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const params = [];
    let where = role === AILA_ROLE_RECEPCION
      ? `(role = 'recepcion_avsec' OR role = 'administracion_aila')`
      : "role = 'analista'";
    if (isUnitRestricted) {
      params.push(unitAccess);
      where += ` AND unit_access && $1::TEXT[]`;
    }
    const result = await pool.query(
      `SELECT id, email, name, unit_access FROM users WHERE ${where} ORDER BY email`,
      params
    );
    res.json(result.rows.map((row) => ({ ...row, unit_access: normalizeUnitAccess(row.unit_access) })));
  } catch (err) {
    console.error("Error reading analysts", err);
    res.status(500).json({ error: "Failed to fetch analysts" });
  }
});

// Lista aprobadores disponibles por unidad
app.get("/api/aprobadores", requireAuth, requireRole("analista", "emisor", AILA_ROLE_JEFATURA, AILA_ROLE_UETIA, "admin", "supervisor"), async (req, res) => {
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const params = [];
    let where = isAilaStage3Role(role)
      ? `(role = '${AILA_ROLE_JEFATURA_AILA}')`
      : "role = 'aprobador'";
    if (isUnitRestricted) {
      params.push(unitAccess);
      where += ` AND unit_access && $1::TEXT[]`;
    }
    const result = await pool.query(
      `SELECT id, email, name, unit_access FROM users WHERE ${where} ORDER BY email`,
      params
    );
    res.json(result.rows.map((row) => ({ ...row, unit_access: normalizeUnitAccess(row.unit_access) })));
  } catch (err) {
    console.error("Error reading approvers", err);
    res.status(500).json({ error: "Failed to fetch approvers" });
  }
});

// Lista emisores disponibles por unidad
app.get("/api/emisores", requireAuth, requireRole("analista", AILA_ROLE_RECEPCION_AVSEC, AILA_ROLE_ADMINISTRACION, "admin", "supervisor"), async (req, res) => {
  try {
    const role = await getCurrentUserRole(req.user?.sub, req.user?.role);
    const isUnitRestricted = isUnitRestrictedRole(role);
    const unitAccess = isUnitRestricted ? await getCurrentUserUnitAccess(req.user?.sub) : [];
    const params = [];
    let where = isAilaStage2Role(role)
      ? `(role = '${AILA_ROLE_JEFATURA}' OR role = '${AILA_ROLE_UETIA}')`
      : "role = 'emisor'";
    if (isUnitRestricted) {
      params.push(unitAccess);
      where += ` AND unit_access && $1::TEXT[]`;
    }
    const result = await pool.query(
      `SELECT id, email, name, unit_access FROM users WHERE ${where} ORDER BY email`,
      params
    );
    res.json(result.rows.map((row) => ({ ...row, unit_access: normalizeUnitAccess(row.unit_access) })));
  } catch (err) {
    console.error("Error reading emitters", err);
    res.status(500).json({ error: "Failed to fetch emitters" });
  }
});

// Admin: listar usuarios
app.get("/api/users", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, role, unit_access, created_at FROM users ORDER BY created_at DESC"
    );
    res.json(result.rows.map((row) => ({ ...row, unit_access: normalizeUnitAccess(row.unit_access) })));
  } catch (err) {
    console.error("Error reading users", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Admin: crear usuario con rol especifico
app.post("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, email, password, role, unit_access } = req.body || {};
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (!email || !password || !role) {
    return res.status(400).json({ error: "name/email/password/role son obligatorios" });
  }
  if (!ALLOWED_ROLES.includes(normalizedRole)) {
    return res.status(400).json({ error: "Rol no vÃ¡lido" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "La contraseÃ±a debe tener al menos 8 caracteres." });
  }
  const emailValidation = await validateEmailAddress(email);
  if (!emailValidation.ok) {
    return res.status(400).json({ error: emailValidation.error || "Correo no vÃ¡lido." });
  }
  const normalizedEmail = emailValidation.email;
  const isRestrictedRole = isUnitRestrictedRole(normalizedRole);
  const normalizedUnitAccess = isRestrictedRole ? normalizeUnitAccess(unit_access) : [...ALL_UNITS];
  if (isRestrictedRole && !normalizedUnitAccess.length) {
    return res.status(400).json({ error: "Debes asignar al menos una unidad." });
  }
  try {
    const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [normalizedEmail]);
    if (existing.rowCount) {
      return res.status(409).json({ error: "El correo ya existe." });
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    const created = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, unit_access, email_verified, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, role, unit_access, created_at`,
      [name || null, normalizedEmail, passwordHash, normalizedRole, normalizedUnitAccess, true, new Date()]
    );
    return res.status(201).json({
      ...created.rows[0],
      unit_access: normalizeUnitAccess(created.rows[0].unit_access)
    });
  } catch (err) {
    console.error("Error creating user", err);
    return res.status(500).json({ error: "No se pudo crear el usuario." });
  }
});

// Admin: actualizar rol
app.patch("/api/users/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (!role || !ALLOWED_ROLES.includes(normalizedRole)) {
    return res.status(400).json({ error: "Rol no vÃ¡lido" });
  }
  try {
    const current = await pool.query("SELECT id, unit_access FROM users WHERE id = $1", [id]);
    if (!current.rowCount) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    const shouldRestrict = isUnitRestrictedRole(normalizedRole);
    const currentUnits = normalizeUnitAccess(current.rows[0].unit_access);
    const nextUnits = shouldRestrict ? (currentUnits.length ? currentUnits : [...ALL_UNITS]) : [...ALL_UNITS];
    const updated = await pool.query(
      "UPDATE users SET role = $1, unit_access = $2 WHERE id = $3 RETURNING id, name, email, role, unit_access, created_at",
      [normalizedRole, nextUnits, id]
    );
    return res.json({ ...updated.rows[0], unit_access: normalizeUnitAccess(updated.rows[0].unit_access) });
  } catch (err) {
    console.error("Error updating role", err);
    return res.status(500).json({ error: "No se pudo actualizar el rol." });
  }
});

// Admin: actualizar unidades por usuario
app.patch("/api/users/:id/units", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const requestedUnits = req.body?.unit_access;
  const normalizedUnits = normalizeUnitAccess(requestedUnits);
  if (!normalizedUnits.length) {
    return res.status(400).json({ error: "Debes asignar al menos una unidad." });
  }
  try {
    const existing = await pool.query("SELECT id, role FROM users WHERE id = $1", [id]);
    if (!existing.rowCount) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    if (!isUnitRestrictedRole(existing.rows[0].role)) {
      return res.status(400).json({ error: "Solo aplica para roles revisor, analista, emisor y aprobador." });
    }
    const updated = await pool.query(
      "UPDATE users SET unit_access = $1 WHERE id = $2 RETURNING id, name, email, role, unit_access, created_at",
      [normalizedUnits, id]
    );
    return res.json({ ...updated.rows[0], unit_access: normalizeUnitAccess(updated.rows[0].unit_access) });
  } catch (err) {
    console.error("Error updating units", err);
    return res.status(500).json({ error: "No se pudieron actualizar las unidades." });
  }
});

// Admin: eliminar usuario
app.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.json({ message: "Usuario eliminado" });
  } catch (err) {
    console.error("Error deleting user", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

app.listen(PORT, async () => {
  try {
    await init();
    console.log(`API ready on http://localhost:${PORT}`);
  } catch (err) {
    console.error("Database init failed", err);
    process.exit(1);
  }
});






