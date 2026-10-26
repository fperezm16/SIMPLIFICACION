# Informe de trabajo del sistema de trámites DGAC

**Fecha de presentación:** 21 de agosto de 2026  
**Periodo reportado:** del 15 al 20 de agosto de 2026  
**Proyecto:** Portal digital de trámites DGAC  
**Área:** Modernización y seguimiento de formularios digitales

## 1. Resumen ejecutivo

Durante el periodo reportado se continuó con la adecuación funcional del portal digital de trámites, enfocándose principalmente en los módulos de DVSO, Transporte Aéreo, Infraestructura, RAN y Financiero. El trabajo se orientó a mejorar los flujos internos, ordenar los roles responsables, ajustar la visibilidad de unidades en el menú, digitalizar formularios y preparar información de apoyo para explicar el funcionamiento de los procesos.

También se brindó apoyo técnico para revisión de producción, validación de servicios del backend, comportamiento de reCAPTCHA, SMTP institucional, conexión con base de datos y limpieza controlada de registros de prueba.

## 2. Objetivo del trabajo realizado

Dar continuidad a la configuración y mejora del sistema de trámites digitales, asegurando que los procesos queden alineados con la operación real de las unidades responsables, que los roles tengan funciones claras y que el portal permita una gestión más ordenada desde la recepción de solicitudes hasta su aprobación, entrega o finalización.

## 3. Actividades realizadas por módulo

### 3.1 Módulo DVSO

Se realizaron ajustes importantes en los procesos de DVSO, especialmente en los formularios DVSO-800, DVSO-801 y DVSO-OPS-805. El objetivo principal fue adaptar los flujos a la forma en que realmente intervienen los responsables de cada área.

Principales actividades realizadas:

- Se revisaron y ajustaron los roles específicos de DVSO.
- Se incorporaron roles como Jefatura de la Sección de Operaciones, Inspector RPAS, Jefatura del DVSO, Asistentes de Aeronavegabilidad, Inspectores de Aeronavegabilidad y Jefatura de la Sección de Aeronavegabilidad.
- Se eliminó la dependencia de roles anteriores que ya no correspondían al nuevo flujo operativo.
- Se ajustó el flujo del proceso DVSO-800 para que pase por Jefatura de la Sección de Aeronavegabilidad, Inspector, Asistente de Aeronavegabilidad y Jefatura del DVSO, según corresponda.
- Se configuró el proceso DVSO-801 para que utilice los roles de Jefatura de la Sección de Operaciones, Inspector RPAS y Jefatura del DVSO.
- Se configuró el proceso DVSO-OPS-805 para que siga el flujo de revisión, corrección, firma y devolución entre Inspector RPAS, Jefatura de Operaciones y Jefatura del DVSO.
- Se habilitó que los roles internos puedan cargar archivos en las etapas correspondientes.
- Se corrigieron bloqueos que impedían devolver o enviar procesos a Jefatura.
- Se ajustaron textos de botones, estados y mensajes para que reflejen correctamente la etapa del trámite.
- Se revisó la separación de formularios DVSO-639 y DVSO-639A.

Resultado: los procesos DVSO cuentan con un flujo más claro, con responsables definidos y etapas más cercanas a la operación real de la unidad.

### 3.2 Módulo Transporte Aéreo

Se trabajó en la unidad de Transporte Aéreo con la digitalización y configuración de formularios nuevos.

Principales actividades realizadas:

- Se creó la unidad Transporte Aéreo dentro del portal.
- Se digitalizaron formularios relacionados con certificados de explotación.
- Se configuró la fecha de solicitud de forma automática para que el sistema registre el día en que el usuario llena el formulario.
- Se ajustó el encabezado institucional para mantener una presentación uniforme con los demás formularios.
- Se configuraron documentos adjuntos obligatorios bajo el mismo formato visual utilizado en otras unidades.
- Se habilitó nuevamente la unidad en el menú.
- Se dejó visible únicamente dos procesos:
  - Certificado de explotación a trabajos aéreos/servicios auxiliares.
  - Certificado de explotación de una línea aérea.
- Se ocultó del menú el proceso de permiso temporal de explotación comercial no regular.

Resultado: Transporte Aéreo vuelve a mostrarse en el portal, pero únicamente con los dos procesos requeridos actualmente.

### 3.3 Módulo Infraestructura

Se continuó con la digitalización y ajuste de formularios de Infraestructura.

Principales actividades realizadas:

- Se trabajó en formularios de helipuertos, análisis de altura máxima permisible y pistas.
- Se ajustó la fecha de solicitud para que sea automática.
- Se configuró el encabezado institucional con el mismo formato utilizado en otros formularios.
- Se incorporó espacio para firma digital del solicitante.
- Se revisó el manejo de documentos de soporte, diferenciando entre documentos que el usuario debe adjuntar y documentos que solo debe consultar como referencia.
- Se ocultó temporalmente la unidad de Infraestructura del menú, según lo solicitado.

Resultado: los formularios de Infraestructura avanzaron en su digitalización, manteniendo formato institucional y controles de información más claros.

### 3.4 Módulo RAN

Se revisó el funcionamiento de los procesos principales de RAN para dejar más clara la explicación del flujo y las funciones de cada rol.

Procesos revisados:

- Reserva, prórroga o cesión de matrícula.
- Certificación.
- UAV / RPA - Distintivo.

Principales actividades realizadas:

- Se documentó el funcionamiento general de cada proceso.
- Se aclaró el rol de recepción como encargado de recibir solicitudes, revisar ingreso inicial y asignar al analista.
- Se describió el rol del analista como responsable de revisar información y documentos.
- Se explicó la intervención del emisor cuando corresponde preparar o generar documentación.
- Se describió el rol del aprobador como responsable de validar o devolver el trámite.
- Se reforzó que recepción, al final del proceso, puede cargar la boleta de pago y el expediente entregable para dejar registro digital.

Resultado: se cuenta con una explicación clara para presentar cómo funcionan los procesos de RAN y qué hace cada rol.

### 3.5 Módulo Financiero

Se revisó y documentó el funcionamiento de los procesos financieros.

Procesos revisados:

- Solicitud para emisión de solvencia financiera.
- Solicitud para emisión de contraseña de pago de otros rubros.

Principales actividades realizadas:

- Se explicó el rol del usuario externo como solicitante del trámite.
- Se describió el rol de recepción como punto de entrada y asignación.
- Se documentó el rol del analista como responsable de revisar datos y documentos.
- Se explicó el rol del emisor como responsable de generar boletas, contraseñas de pago o documentos financieros.
- Se describió el rol del aprobador cuando el proceso requiere validación.
- Se identificó que los procesos de contraseña de pago pueden finalizar con la boleta generada, sin requerir siempre aprobación posterior.
- Se incluyó la intervención del rol AVSEC Financiero únicamente para procesos relacionados con esa área.

Resultado: los procesos financieros quedaron explicados de forma sencilla para facilitar su presentación y comprensión por usuarios internos.

## 4. Soporte técnico y revisión de producción

Además del desarrollo funcional, se apoyó en tareas de diagnóstico y operación técnica.

Actividades realizadas:

- Se revisó el estado del backend en producción mediante PM2.
- Se diagnosticaron errores de conexión hacia la base de datos.
- Se identificó un problema de resolución DNS relacionado con el host de base de datos.
- Se verificó la resolución del nombre del servidor de base de datos contra el DNS institucional.
- Se apoyó con comandos para comprobar si el backend estaba activo.
- Se revisó el comportamiento de reCAPTCHA y se confirmó que en producción depende de llaves configuradas en el entorno.
- Se revisó el funcionamiento del SMTP institucional para envío de notificaciones.
- Se prepararon comandos y guías para limpieza controlada de registros de prueba en base de datos.
- Se generó una guía técnica con scripts de apoyo para validar servicios, levantar backend y limpiar datos de prueba.

Resultado: se fortaleció el acompañamiento operativo para producción y se dejaron referencias prácticas para diagnóstico básico del sistema.

## 5. Documentación y materiales de apoyo

Se continuó apoyando la elaboración de materiales para explicación, capacitación y presentación del sistema.

Actividades realizadas:

- Se prepararon explicaciones de procesos RAN.
- Se prepararon explicaciones de procesos Financieros.
- Se trabajó en contenido para presentación del funcionamiento del sistema.
- Se incorporaron explicaciones sobre reCAPTCHA y notificaciones por correo electrónico.
- Se elaboraron textos de apoyo para exposición por diapositiva.
- Se revisaron manuales y guías institucionales con observaciones y correcciones.
- Se generaron informes de trabajo para respaldo de actividades realizadas.

Resultado: se cuenta con material de apoyo más ordenado para explicar el sistema a usuarios, jefaturas o personal involucrado en la operación.

## 6. Cambios técnicos relevantes

Durante el periodo se modificaron principalmente componentes del backend y frontend.

| Área | Cambios principales |
|---|---|
| Backend | Ajuste de flujos, roles, asignaciones, aprobaciones, devoluciones y finalización de procesos. |
| Frontend | Actualización de menú, etiquetas, botones, estados, formularios y panel de revisión. |
| Administración | Ajuste de roles visibles y permisos de unidades. |
| Revisión | Mejora en acciones disponibles según rol y etapa del proceso. |
| Formularios | Digitalización y ajustes visuales en DVSO, Transporte Aéreo e Infraestructura. |
| Producción | Apoyo en diagnóstico de backend, DNS, base de datos, reCAPTCHA y SMTP. |

## 7. Validaciones realizadas

Se realizaron validaciones técnicas para confirmar que los cambios no generaran errores evidentes en el sistema.

- Validación de sintaxis del backend.
- Compilación del frontend.
- Revisión de navegación de menú de unidades.
- Verificación de visibilidad de Transporte Aéreo.
- Verificación de ocultamiento de Infraestructura cuando fue solicitado.
- Revisión de etapas y botones de DVSO.
- Confirmación de que los mensajes y roles se muestran de forma más clara.

## 8. Estado actual

Al cierre del periodo reportado, el sistema cuenta con avances importantes en la organización de procesos y roles. Los módulos de RAN y Financiero cuentan con explicaciones funcionales para presentación. DVSO tiene flujos más detallados para los procesos 800, 801 y 805. Transporte Aéreo vuelve a mostrarse con dos procesos visibles. Infraestructura mantiene avances de digitalización, pero permanece oculto en el menú según la instrucción recibida.

El sistema continúa listo para realizar nuevas pruebas funcionales con usuarios internos antes de promover cambios definitivos a producción.

## 9. Pendientes y recomendaciones

- Realizar pruebas completas de DVSO con cada rol involucrado.
- Validar nuevamente los procesos 800, 801 y 805 con usuarios finales.
- Confirmar si el proceso DVSO-639/639A se manejará como trámite único o como formularios separados.
- Revisar con la unidad de Transporte Aéreo si los dos procesos visibles son los definitivos para la siguiente publicación.
- Mantener oculto Infraestructura hasta que se confirme su salida a pruebas o producción.
- Respaldar la base de datos antes de cualquier limpieza de registros en producción.
- Subir los cambios al repositorio correspondiente cuando sean aprobados.
- Realizar una prueba final de reCAPTCHA y notificaciones SMTP después de desplegar.

## 10. Conclusión

El trabajo realizado permitió avanzar en la adaptación del portal a los flujos reales de operación de las unidades. Se fortalecieron los procesos de DVSO, se ordenó la visibilidad de Transporte Aéreo, se avanzó en formularios de Infraestructura y se prepararon explicaciones funcionales para RAN y Financiero.

Estos avances contribuyen a que el sistema sea más claro para los usuarios internos, más ordenado en sus responsabilidades y más fácil de presentar ante jefaturas o personal operativo.
