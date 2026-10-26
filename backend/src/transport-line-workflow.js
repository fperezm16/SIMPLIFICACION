const express = require("express");

const ROLES = Object.freeze({
  analyst: "analista_servicios_aereos",
  head: "jefatura_transporte_aereo",
  legal: "asesoria_juridica_transporte_aereo",
  office: "despacho_superior_transporte_aereo"
});
const STAFF_ROLES = Object.values(ROLES);
const SCHEDULE_SLUG = "modificacion-horarios-rutas-frecuencias";
const AUXILIARY_SERVICES_SLUG = "trabajos-aereos-servicios-auxiliares";
const TEMPORARY_PERMIT_SLUG = "permiso-temporal-no-regular";
const PROCESS_SQL = `unidad_clave = 'TRANSPORTE_AEREO' AND detalle_formulario->>'slug' IN ('linea-aerea', '${SCHEDULE_SLUG}', '${AUXILIARY_SERVICES_SLUG}', '${TEMPORARY_PERMIT_SLUG}')`;
const DOCS = Object.freeze({
  correction: "Documentación complementaria",
  opinions: "Dictámenes técnicos favorables",
  certificate_project: "Proyecto de certificado de explotación y anexos",
  agreement_project: "Proyecto de convenio por servicios aeroportuarios",
  signed_certificate: "Certificado de explotación firmado y anexos",
  payment_order: "Boleta de pago de inscripción",
  registry_receipt: "Constancia de pago de inscripción registral",
  signed_by_user: "Convenio firmado por el representante",
  signed_agreement: "Convenio firmado por Despacho Superior",
  modification_annex_project: "Proyecto de modificación del Anexo del Certificado de Explotación",
  signed_modification_annex: "Anexo del Certificado de Explotación firmado",
  temporary_permit: "Permiso Temporal de Explotación autorizado",
  archive_record: "Expediente completo para archivo"
});

function isScheduleWorkflow(row) {
  return String(row.detalle_formulario?.slug || "").trim().toLowerCase() === SCHEDULE_SLUG;
}

function isAuxiliaryServicesWorkflow(row) {
  return String(row.detalle_formulario?.slug || "").trim().toLowerCase() === AUXILIARY_SERVICES_SLUG;
}

function isTemporaryPermitWorkflow(row) {
  return String(row.detalle_formulario?.slug || "").trim().toLowerCase() === TEMPORARY_PERMIT_SLUG;
}

function isLineCertificateWorkflow(row) {
  return !isScheduleWorkflow(row) && !isAuxiliaryServicesWorkflow(row) && !isTemporaryPermitWorkflow(row);
}

function workflowType(row) {
  if (isScheduleWorkflow(row)) return "schedule_modification";
  if (isAuxiliaryServicesWorkflow(row)) return "auxiliary_services_certificate";
  if (isTemporaryPermitWorkflow(row)) return "temporary_non_regular_permit";
  return "line_certificate";
}

function stageOf(row) {
  return row.detalle_formulario?.transporte_linea?.etapa || "analyst_review";
}

function ownsStage(user, row) {
  const data = row.detalle_formulario?.transporte_linea || {};
  const role = user.role;
  const stage = stageOf(row);
  if (stage === "legal_and_despacho") return role === ROLES.legal && !data.legal_done || role === ROLES.office && !data.office_done;
  if (["analyst_review", "analyst_payment", "analyst_annex", "analyst_close"].includes(stage)) return role === ROLES.analyst;
  if (["jefatura_review", "jefatura_agreement"].includes(stage)) return role === ROLES.head;
  if (["office_signature", "office_agreement"].includes(stage)) return role === ROLES.office;
  return false;
}

function stageVersion(row) {
  return row.detalle_formulario?.transporte_linea?.actualizado || (row.created_at ? new Date(row.created_at).toISOString() : "initial");
}

function visualState(user, row) {
  if (stageOf(row) === "finished") return "finished";
  if (stageOf(row) === "analyst_review" && !row.detalle_formulario?.transporte_linea?.ultima_accion) return "pending";
  if (!ownsStage(user, row)) return "pending";
  if (["analyst_review", "analyst_payment", "analyst_annex", "analyst_close"].includes(stageOf(row)) && Number(row.assigned_analista_id) !== Number(user.id)) return "pending";
  const data = row.detalle_formulario?.transporte_linea || {};
  const version = stageVersion(row);
  return data.aperturas?.[user.role]?.version === version ? "reviewing" : "sent";
}

function appearsInInbox(user, row) {
  if (stageOf(row) === "finished") return false;
  if (["admin", "supervisor"].includes(user.role)) return true;
  if (!ownsStage(user, row)) return false;
  if (user.role === ROLES.analyst && row.assigned_analista_id && Number(row.assigned_analista_id) !== Number(user.id)) return false;
  return true;
}

function documentFrom(value) {
  const filename = String(value?.filename || "documento.pdf").trim().slice(0, 180);
  const raw = String(value?.pdf_base64 || "").replace(/^data:application\/pdf;base64,/, "");
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length < 5 || buffer.length > 50 * 1024 * 1024 || buffer.subarray(0, 5).toString() !== "%PDF-") return null;
  return { filename, buffer };
}

function createTransportLineWorkflowRouter({ pool, requireAuth }) {
  const router = express.Router();
  router.use(requireAuth);

  async function actor(req) {
    const result = await pool.query("SELECT id, email, role, unit_access FROM users WHERE id = $1", [req.user?.sub]);
    const user = result.rows[0];
    if (!user) return null;
    return { ...user, role: String(user.role || "").toLowerCase() };
  }

  function canAccess(user, row) {
    if (!user) return false;
    if (user.role === "admin" || user.role === "supervisor") return true;
    if (user.role === "user") return Number(row.created_by_user_id) === Number(user.id) ||
      (row.created_by_user_id == null && String(row.correo || "").toLowerCase() === String(user.email || "").toLowerCase());
    return STAFF_ROLES.includes(user.role) && (user.unit_access || []).includes("TRANSPORTE_AEREO");
  }

  async function documents(client, id, user, row) {
    const result = await client.query(
      "SELECT document_key, label, filename, uploaded_at FROM submission_documents WHERE submission_id = $1 ORDER BY uploaded_at, document_key",
      [id]
    );
    if (user.role !== "user") return result.rows;
    const allowed = new Set(["ta_line_payment_order", "ta_line_signed_certificate", "ta_line_agreement_project", "ta_line_signed_agreement", "ta_line_registry_receipt", "ta_line_signed_by_user", "ta_line_correction", "ta_line_signed_modification_annex", "ta_line_temporary_permit"]);
    if (["analyst_review", "user_correction", "jefatura_review", "legal_and_despacho", "analyst_payment"].includes(stageOf(row))) {
      allowed.delete("ta_line_signed_certificate");
      allowed.delete("ta_line_payment_order");
      allowed.delete("ta_line_agreement_project");
    }
    if (isScheduleWorkflow(row) && stageOf(row) !== "user_review" && stageOf(row) !== "analyst_close" && stageOf(row) !== "finished") {
      allowed.delete("ta_line_signed_modification_annex");
    }
    if (isTemporaryPermitWorkflow(row) && stageOf(row) !== "user_review" && stageOf(row) !== "analyst_close" && stageOf(row) !== "finished") {
      allowed.delete("ta_line_temporary_permit");
    }
    return result.rows.filter((doc) => allowed.has(doc.document_key));
  }

  router.get("/", async (req, res) => {
    try {
      const user = await actor(req);
      if (!user || !STAFF_ROLES.includes(user.role) && !["admin", "supervisor"].includes(user.role)) return res.status(403).json({ error: "Acceso no autorizado." });
      if (!canAccess(user, { created_by_user_id: null })) return res.status(403).json({ error: "Sin acceso a Transporte Aéreo." });
      const result = await pool.query(
        `SELECT s.id, s.registro_codigo, s.gestion_nombre, s.nombre_propietario, s.correo,
                s.telefono, s.persona_tipo, s.created_at, s.detalle_formulario,
                s.assigned_analista_id, a.name AS assigned_analista_name, a.email AS assigned_analista_email,
                COALESCE((
                  SELECT json_agg(json_build_object('document_key', d.document_key, 'label', d.label, 'filename', d.filename) ORDER BY d.document_key)
                  FROM submission_documents d
                  WHERE d.submission_id = s.id AND d.document_key NOT LIKE 'ta_line_%'
                ), '[]'::json) AS documentos_resumen
         FROM submissions s LEFT JOIN users a ON a.id = s.assigned_analista_id WHERE ${PROCESS_SQL} ORDER BY s.created_at DESC LIMIT 200`
      );
      return res.json(result.rows
        .filter((row) => appearsInInbox(user, row))
        .map((row) => ({ ...row, etapa: stageOf(row), estado_visual: visualState(user, row) })));
    } catch (err) {
      console.error("Error listing transport line workflows", err);
      return res.status(500).json({ error: "No se pudieron cargar los procesos." });
    }
  });

  router.post("/:id/open", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const user = await actor(req);
      const result = await client.query(`SELECT * FROM submissions WHERE id = $1 AND ${PROCESS_SQL} FOR UPDATE`, [req.params.id]);
      const row = result.rows[0];
      if (!row) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Proceso no encontrado." }); }
      if (!canAccess(user, row)) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Acceso no autorizado." }); }
      const assignedToActor = ownsStage(user, row) && (!['analyst_review', 'analyst_payment', 'analyst_annex', 'analyst_close'].includes(stageOf(row)) || Number(row.assigned_analista_id) === Number(user.id));
      let openedRow = row;
      if (assignedToActor) {
        const data = { ...(row.detalle_formulario?.transporte_linea || {}) };
        data.aperturas = { ...(data.aperturas || {}), [user.role]: { version: stageVersion(row), at: new Date().toISOString() } };
        await client.query(
          `UPDATE submissions SET detalle_formulario = jsonb_set(COALESCE(detalle_formulario, '{}'::jsonb), '{transporte_linea}', $2::jsonb) WHERE id = $1`,
          [row.id, JSON.stringify(data)]
        );
        openedRow = { ...row, detalle_formulario: { ...row.detalle_formulario, transporte_linea: data } };
      }
      await client.query("COMMIT");
      return res.json({ estado_visual: visualState(user, openedRow) });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error opening transport line workflow", err);
      return res.status(500).json({ error: "No se pudo registrar la apertura del proceso." });
    } finally {
      client.release();
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const user = await actor(req);
      const result = await pool.query(`SELECT s.*, a.name AS assigned_analista_name, a.email AS assigned_analista_email FROM submissions s LEFT JOIN users a ON a.id = s.assigned_analista_id WHERE s.id = $1 AND ${PROCESS_SQL}`, [req.params.id]);
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: "Proceso no encontrado." });
      if (!canAccess(user, row)) return res.status(403).json({ error: "Acceso no autorizado." });
      const detail = row.detalle_formulario || {};
      const solicitud = user.role === "user" ? null : {
        nombre_propietario: row.nombre_propietario,
        representante_legal: row.representante_legal,
        correo: row.correo,
        telefono: row.telefono,
        direccion: row.direccion,
        especificaciones: row.especificaciones,
        titulo: detail.titulo,
        codigo: detail.codigo,
        campos_digitales: detail.campos_digitales || {},
        opciones: detail.opciones || {},
        tablas: detail.tablas || {}
      };
      const logs = user.role === "user" ? [] : (await pool.query(
        `SELECT l.created_at, l.event_code, l.event_label, l.event_detail, l.actor_role,
                u.name AS actor_name, u.email AS actor_email
         FROM submission_logs l LEFT JOIN users u ON u.id = l.actor_user_id
         WHERE l.submission_id = $1 ORDER BY l.created_at DESC, l.id DESC LIMIT 100`,
        [row.id]
      )).rows;
      return res.json({ id: row.id, registro_codigo: row.registro_codigo, slug: detail.slug || "", workflow_type: workflowType(row), assigned_analista_id: row.assigned_analista_id,
        assigned_analista_name: row.assigned_analista_name, assigned_analista_email: row.assigned_analista_email,
        etapa: stageOf(row), estado: detail.transporte_linea || {}, solicitud, documentos: await documents(pool, row.id, user, row), logs });
    } catch (err) {
      console.error("Error loading transport line workflow", err);
      return res.status(500).json({ error: "No se pudo cargar el proceso." });
    }
  });

  router.get("/:id/documents/:key", async (req, res) => {
    try {
      const user = await actor(req);
      const result = await pool.query(`SELECT * FROM submissions WHERE id = $1 AND ${PROCESS_SQL}`, [req.params.id]);
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: "Proceso no encontrado." });
      if (!canAccess(user, row)) return res.status(403).json({ error: "Acceso no autorizado." });
      const key = String(req.params.key || "");
      const visible = await documents(pool, row.id, user, row);
      if (!visible.some((doc) => doc.document_key === key)) return res.status(403).json({ error: "Documento no disponible." });
      const file = await pool.query("SELECT filename, pdf FROM submission_documents WHERE submission_id = $1 AND document_key = $2", [row.id, key]);
      if (!file.rowCount) return res.status(404).json({ error: "Documento no encontrado." });
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `attachment; filename="${String(file.rows[0].filename || "documento.pdf").replace(/[\r\n"\\]/g, "_")}"`);
      return res.send(file.rows[0].pdf);
    } catch (err) {
      console.error("Error downloading transport line document", err);
      return res.status(500).json({ error: "No se pudo descargar el documento." });
    }
  });

  router.post("/:id/actions", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const user = await actor(req);
      const result = await client.query(`SELECT * FROM submissions WHERE id = $1 AND ${PROCESS_SQL} FOR UPDATE`, [req.params.id]);
      const row = result.rows[0];
      if (!row) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Proceso no encontrado." }); }
      if (!canAccess(user, row)) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Acceso no autorizado." }); }
      const action = String(req.body?.action || "");
      const notes = String(req.body?.notes || "").trim().slice(0, 1000);
      const current = stageOf(row);
      const data = { ...(row.detalle_formulario?.transporte_linea || {}) };
      const staff = (role) => user.role === role || user.role === "admin" || user.role === "supervisor";
      const owner = user.role === "user" && canAccess(user, row);
      const files = req.body?.files || {};
      const required = [];
      let next = current;
      let valid = true;
      if (isScheduleWorkflow(row) && current === "analyst_review" && staff(ROLES.analyst)) {
        if (action === "request_correction" && notes) next = "user_correction";
        else if (action === "send_to_head") next = "jefatura_review";
        else valid = false;
      } else if (isScheduleWorkflow(row) && current === "user_correction" && owner && action === "resubmit") {
        required.push("correction"); next = "analyst_review";
      } else if (isScheduleWorkflow(row) && current === "jefatura_review" && staff(ROLES.head) && action === "send_modification_project") {
        required.push("opinions", "modification_annex_project"); next = "office_signature";
      } else if (isScheduleWorkflow(row) && current === "office_signature" && staff(ROLES.office) && action === "return_signed_modification") {
        next = "analyst_annex";
      } else if (isScheduleWorkflow(row) && current === "analyst_annex" && staff(ROLES.analyst) && action === "send_annex_to_user") {
        required.push("signed_modification_annex"); next = "user_review";
      } else if (isScheduleWorkflow(row) && current === "user_review" && owner) {
        if (action === "object" && notes) next = "jefatura_review";
        else if (action === "accept") next = "analyst_close";
        else valid = false;
      } else if (isScheduleWorkflow(row) && current === "analyst_close" && staff(ROLES.analyst) && action === "notify_finish") {
        const notified = req.body?.notifications || {};
        if (["seguridad_operacional", "operaciones_aeroportuarias", "aim"].every((key) => notified[key] === true)) {
          data.notificaciones = notified;
          next = "finished";
        } else valid = false;
      } else if (isAuxiliaryServicesWorkflow(row) && current === "analyst_review" && staff(ROLES.analyst)) {
        if (action === "request_correction" && notes) next = "user_correction";
        else if (action === "send_to_head") next = "jefatura_review";
        else valid = false;
      } else if (isAuxiliaryServicesWorkflow(row) && current === "user_correction" && owner && action === "resubmit") {
        required.push("correction"); next = "analyst_review";
      } else if (isAuxiliaryServicesWorkflow(row) && current === "jefatura_review" && staff(ROLES.head) && action === "send_auxiliary_projects") {
        required.push("opinions", "certificate_project"); next = "office_signature";
      } else if (isAuxiliaryServicesWorkflow(row) && current === "office_signature" && staff(ROLES.office) && action === "return_signed_auxiliary") {
        required.push("signed_certificate"); next = "analyst_payment";
      } else if (isAuxiliaryServicesWorkflow(row) && current === "analyst_payment" && staff(ROLES.analyst) && action === "send_payment_order") {
        required.push("payment_order"); next = "analyst_close";
      } else if (isAuxiliaryServicesWorkflow(row) && current === "analyst_close" && staff(ROLES.analyst) && action === "archive_finish") {
        required.push("archive_record"); next = "finished";
      } else if (isTemporaryPermitWorkflow(row) && current === "analyst_review" && staff(ROLES.analyst)) {
        if (action === "request_correction" && notes) next = "user_correction";
        else if (action === "send_to_head") next = "jefatura_review";
        else valid = false;
      } else if (isTemporaryPermitWorkflow(row) && current === "user_correction" && owner && action === "resubmit") {
        required.push("correction"); next = "analyst_review";
      } else if (isTemporaryPermitWorkflow(row) && current === "jefatura_review" && staff(ROLES.head) && action === "authorize_temporary_permit") {
        required.push("opinions", "temporary_permit"); next = "user_review";
      } else if (isTemporaryPermitWorkflow(row) && current === "user_review" && owner) {
        if (action === "object" && notes) next = "jefatura_review";
        else if (action === "accept") next = "analyst_close";
        else valid = false;
      } else if (isTemporaryPermitWorkflow(row) && current === "analyst_close" && staff(ROLES.analyst) && action === "archive_temporary") {
        required.push("archive_record");
        next = "finished";
      } else if (isLineCertificateWorkflow(row) && current === "analyst_review" && staff(ROLES.analyst)) {
        if (action === "request_correction" && notes) next = "user_correction";
        else if (action === "send_to_head") next = "jefatura_review";
        else valid = false;
      } else if (isLineCertificateWorkflow(row) && current === "user_correction" && owner && action === "resubmit") {
        required.push("correction"); next = "analyst_review";
      } else if (isLineCertificateWorkflow(row) && current === "jefatura_review" && staff(ROLES.head)) {
        if (action === "send_projects") { required.push("opinions", "certificate_project"); next = "legal_and_despacho"; data.legal_done = false; data.office_done = false; }
        else valid = false;
      } else if (isLineCertificateWorkflow(row) && current === "legal_and_despacho" && staff(ROLES.legal) && action === "legal_draft" && !data.legal_done) {
        required.push("agreement_project"); data.legal_done = true;
      } else if (isLineCertificateWorkflow(row) && current === "legal_and_despacho" && staff(ROLES.office) && action === "sign_certificate" && !data.office_done) {
        required.push("signed_certificate"); data.office_done = true;
      } else if (isLineCertificateWorkflow(row) && current === "analyst_payment" && staff(ROLES.analyst) && action === "send_payment_order") {
        required.push("payment_order"); data.nuevo_operador = Boolean(req.body?.new_operator); next = "user_review";
      } else if (isLineCertificateWorkflow(row) && current === "user_review" && owner) {
        if (action === "object" && notes) next = "jefatura_review";
        else if (action === "accept") { required.push("signed_by_user"); if (data.nuevo_operador) required.push("registry_receipt"); next = "jefatura_agreement"; }
        else valid = false;
      } else if (isLineCertificateWorkflow(row) && current === "jefatura_agreement" && staff(ROLES.head) && action === "send_agreement") {
        next = "office_agreement";
      } else if (isLineCertificateWorkflow(row) && current === "office_agreement" && staff(ROLES.office) && action === "sign_agreement") {
        required.push("signed_agreement"); next = "analyst_close";
      } else if (isLineCertificateWorkflow(row) && current === "analyst_close" && staff(ROLES.analyst) && action === "archive" && notes) {
        const notified = req.body?.notifications || {};
        if (["seguridad_operacional", "financiero", "navegacion_aerea", "operaciones_aeroportuarias", "usuario", "asesoria_juridica", "expediente_archivado"].every((key) => notified[key] === true)) {
          data.notificaciones = notified;
          next = "finished";
        } else valid = false;
      } else valid = false;
      if (!valid) { await client.query("ROLLBACK"); return res.status(409).json({ error: "La acción no corresponde a la etapa o al rol actual. Revisa las observaciones y la lista de notificaciones antes de continuar." }); }
      if (isLineCertificateWorkflow(row) && current === "legal_and_despacho" && data.legal_done && data.office_done) next = "analyst_payment";
      for (const key of required) {
        const file = documentFrom(files[key]);
        if (!file) { await client.query("ROLLBACK"); return res.status(400).json({ error: `Debes cargar un PDF válido: ${DOCS[key]}.` }); }
        await client.query(
          `INSERT INTO submission_documents (submission_id, document_key, label, filename, mime, pdf) VALUES ($1, $2, $3, $4, 'application/pdf', $5)
           ON CONFLICT (submission_id, document_key) DO UPDATE SET filename = EXCLUDED.filename, pdf = EXCLUDED.pdf, uploaded_at = NOW()`,
          [row.id, `ta_line_${key}`, DOCS[key], file.filename, file.buffer]
        );
      }
      data.etapa = next;
      data.ultima_accion = action;
      data.actualizado = new Date().toISOString();
      if (action === "request_correction") data.observacion = notes;
      if (action === "object") data.inconformidad = notes;
      if (action === "archive") data.notificaciones_y_archivo = notes;
      if (action === "archive_finish") data.expediente_archivado = true;
      if (action === "archive_temporary") data.expediente_archivado = true;
      if (action === "notify_finish") data.notificaciones_y_cierre = notes || "Notificaciones realizadas";
      await client.query(
        `UPDATE submissions SET detalle_formulario = jsonb_set(COALESCE(detalle_formulario, '{}'::jsonb), '{transporte_linea}', $2::jsonb), delivered_at = CASE WHEN $3 = 'finished' THEN NOW() ELSE delivered_at END, delivered_by_user_id = CASE WHEN $3 = 'finished' THEN $4 ELSE delivered_by_user_id END WHERE id = $1`,
        [row.id, JSON.stringify(data), next, user.id]
      );
      await client.query(
        "INSERT INTO submission_logs (submission_id, event_code, event_label, event_detail, actor_user_id, actor_role) VALUES ($1, $2, $3, $4, $5, $6)",
        [row.id, `ta_line_${action}`.slice(0, 80), `Transporte Aéreo: ${action}`.slice(0, 180), notes || null, user.id, user.role]
      );
      await client.query("COMMIT");
      return res.json({ etapa: next, estado: data });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error advancing transport line workflow", err);
      return res.status(500).json({ error: "No se pudo avanzar el proceso." });
    } finally {
      client.release();
    }
  });
  return router;
}

module.exports = { createTransportLineWorkflowRouter, ROLES, STAFF_ROLES };
