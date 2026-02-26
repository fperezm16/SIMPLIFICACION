--
-- PostgreSQL database dump
--

\restrict e9BTnY92EJOa89H7r4GyN4e7tylfhicobBr6UFenAnVOAB1TryPPmQ0txgZZmzb

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: submission_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submission_counters (
    unit_clave text NOT NULL,
    year_value integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);


--
-- Name: submission_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submission_feedback (
    id integer NOT NULL,
    submission_id integer NOT NULL,
    user_id integer NOT NULL,
    rating_value integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT submission_feedback_rating_check CHECK (((rating_value >= 1) AND (rating_value <= 5))),
    CONSTRAINT submission_feedback_rating_value_check CHECK (((rating_value >= 1) AND (rating_value <= 5)))
);


--
-- Name: submission_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.submission_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: submission_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.submission_feedback_id_seq OWNED BY public.submission_feedback.id;


--
-- Name: submission_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submission_logs (
    id integer NOT NULL,
    submission_id integer NOT NULL,
    event_code text NOT NULL,
    event_label text NOT NULL,
    event_detail text,
    actor_user_id integer,
    actor_role text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: submission_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.submission_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: submission_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.submission_logs_id_seq OWNED BY public.submission_logs.id;


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submissions (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    fecha date,
    nit text,
    uso text,
    fabricante text,
    numero_serie text,
    modelo text,
    anio_fabricacion text,
    colores text,
    tipo_internacion boolean DEFAULT false,
    tipo_reservacion boolean DEFAULT false,
    tipo_inscripcion boolean DEFAULT false,
    tipo_certificado_prov boolean DEFAULT false,
    tipo_reposicion boolean DEFAULT false,
    tipo_cambio_prop boolean DEFAULT false,
    tipo_cambio_datos boolean DEFAULT false,
    tipo_certificacion boolean DEFAULT false,
    especificaciones text,
    nombre_propietario text DEFAULT ''::text NOT NULL,
    documento_propietario text,
    direccion text,
    telefono text,
    correo text DEFAULT ''::text NOT NULL,
    autorizado_nombre text,
    autorizado_documento text,
    autorizado_telefono text,
    ubicacion_inspeccion text,
    matricula_tg text,
    matricula_tg_nueva text,
    comentarios_revision text,
    dpi_pdf bytea,
    dpi_filename text,
    dpi_mime text,
    assigned_analista_id integer,
    receptor_opened_at timestamp with time zone,
    created_by_user_id integer,
    approved_at timestamp with time zone,
    approved_by_user_id integer,
    persona_tipo text DEFAULT 'individual'::text NOT NULL,
    acta_pdf bytea,
    acta_filename text,
    acta_mime text,
    gestion_clave text DEFAULT 'general'::text NOT NULL,
    nombre_orden_pago text,
    returned_at timestamp with time zone,
    returned_reason text,
    returned_by_user_id integer,
    unidad_clave text DEFAULT 'GENERAL'::text NOT NULL,
    gestion_nombre text,
    assigned_aprobador_id integer,
    sent_to_aprobador_at timestamp with time zone,
    registro_codigo text,
    analyst_pdf bytea,
    analyst_pdf_filename text,
    analyst_pdf_mime text,
    analyst_pdf_uploaded_at timestamp with time zone,
    analyst_pdf_uploaded_by_user_id integer,
    returned_to_analista_at timestamp with time zone,
    returned_to_analista_reason text,
    returned_to_analista_by_user_id integer,
    representante_legal text,
    registro_mercantil_pdf bytea,
    registro_mercantil_filename text,
    registro_mercantil_mime text
);


--
-- Name: submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.submissions_id_seq OWNED BY public.submissions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text,
    email text NOT NULL,
    password_hash text NOT NULL,
    verified boolean DEFAULT false,
    verified_at timestamp with time zone,
    verification_token_hash text,
    verification_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'user'::text NOT NULL,
    unit_access text[] DEFAULT ARRAY['GENERAL'::text, 'RAN'::text, 'DVSO'::text, 'AILA'::text, 'FINANCIERO'::text] NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    email_verified_at timestamp with time zone,
    email_verify_token_hash text,
    email_verify_token_expires_at timestamp with time zone,
    email_verification_token text,
    email_verification_expires timestamp with time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: submission_feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_feedback ALTER COLUMN id SET DEFAULT nextval('public.submission_feedback_id_seq'::regclass);


--
-- Name: submission_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_logs ALTER COLUMN id SET DEFAULT nextval('public.submission_logs_id_seq'::regclass);


--
-- Name: submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions ALTER COLUMN id SET DEFAULT nextval('public.submissions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: submission_counters submission_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_counters
    ADD CONSTRAINT submission_counters_pkey PRIMARY KEY (unit_clave, year_value);


--
-- Name: submission_feedback submission_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_feedback
    ADD CONSTRAINT submission_feedback_pkey PRIMARY KEY (id);


--
-- Name: submission_logs submission_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_logs
    ADD CONSTRAINT submission_logs_pkey PRIMARY KEY (id);


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: submission_feedback_submission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX submission_feedback_submission_idx ON public.submission_feedback USING btree (submission_id);


--
-- Name: submission_feedback_submission_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX submission_feedback_submission_user_idx ON public.submission_feedback USING btree (submission_id, user_id);


--
-- Name: submission_feedback_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX submission_feedback_user_idx ON public.submission_feedback USING btree (user_id);


--
-- Name: submission_logs_submission_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX submission_logs_submission_created_idx ON public.submission_logs USING btree (submission_id, created_at DESC);


--
-- Name: submissions_registro_codigo_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX submissions_registro_codigo_unique_idx ON public.submissions USING btree (registro_codigo) WHERE (registro_codigo IS NOT NULL);


--
-- Name: submissions_user_gestion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX submissions_user_gestion_idx ON public.submissions USING btree (created_by_user_id, gestion_clave);


--
-- Name: users_email_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_lower_idx ON public.users USING btree (lower(email));


--
-- Name: users_email_verification_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_verification_token_idx ON public.users USING btree (email_verification_token) WHERE (email_verification_token IS NOT NULL);


--
-- Name: users_email_verify_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_verify_token_hash_idx ON public.users USING btree (email_verify_token_hash) WHERE (email_verify_token_hash IS NOT NULL);


--
-- Name: submission_feedback submission_feedback_submission_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_feedback
    ADD CONSTRAINT submission_feedback_submission_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;


--
-- Name: submission_feedback submission_feedback_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_feedback
    ADD CONSTRAINT submission_feedback_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: submission_logs submission_logs_actor_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_logs
    ADD CONSTRAINT submission_logs_actor_user_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: submission_logs submission_logs_submission_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_logs
    ADD CONSTRAINT submission_logs_submission_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;


--
-- Name: submissions submissions_analyst_pdf_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_analyst_pdf_uploaded_by_fkey FOREIGN KEY (analyst_pdf_uploaded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_approved_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_approved_by_user_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_assigned_aprobador_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assigned_aprobador_fkey FOREIGN KEY (assigned_aprobador_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_assigned_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assigned_user_fkey FOREIGN KEY (assigned_analista_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_created_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_created_by_user_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_returned_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_returned_by_user_fkey FOREIGN KEY (returned_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_returned_to_analista_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_returned_to_analista_by_user_fkey FOREIGN KEY (returned_to_analista_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict e9BTnY92EJOa89H7r4GyN4e7tylfhicobBr6UFenAnVOAB1TryPPmQ0txgZZmzb

