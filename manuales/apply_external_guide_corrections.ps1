$ErrorActionPreference = "Stop"

$source = "C:\Users\Fernando\Desktop\revision de Manual_de_Usuario_Externo_DGAC.docx"
$workingCopy = "C:\Users\Fernando\Desktop\PROYECTOS\FORMULARIO\manuales\revision_external_working_copy.docx"
$output = "C:\Users\Fernando\Desktop\PROYECTOS\FORMULARIO\manuales\Guia_de_Usuario_Externo_DGAC_Corregida_2026.docx"
$menuImage = "C:\Users\Fernando\Desktop\PROYECTOS\FORMULARIO\manuales\assets\03b-menu-unidades.png"

$wdCollapseStart = 1
$wdColorAutomatic = -16777216
$wdFormatDocumentDefault = 16
$wdAlignParagraphCenter = 1
$script:ParagraphRanges = @{}

function Normalize-Text([string]$text) {
  return (($text -replace "[\r\a]", " ") -replace "\s+", " ").Trim()
}

function Get-ParagraphExact($doc, [string]$text) {
  if ($script:ParagraphRanges.ContainsKey($text)) {
    return $script:ParagraphRanges[$text].Paragraphs.Item(1)
  }
  throw "No se encontro el parrafo: $text"
}

function Replace-Paragraph($doc, [string]$oldText, [string]$newText, [string]$style = "") {
  $paragraph = Get-ParagraphExact $doc $oldText
  $range = $paragraph.Range.Duplicate
  $range.End = $range.End - 1
  $start = $range.Start
  $range.Text = $newText
  if ($style) {
    $doc.Range($start, $start + $newText.Length).Paragraphs.Item(1).Range.Style = $style
  }
}

function Delete-Paragraph($doc, [string]$text) {
  $paragraph = Get-ParagraphExact $doc $text
  $paragraph.Range.Delete() | Out-Null
}

function Delete-Block($doc, [string]$startText, [string]$nextText) {
  $startParagraph = Get-ParagraphExact $doc $startText
  $nextParagraph = Get-ParagraphExact $doc $nextText
  $doc.Range($startParagraph.Range.Start, $nextParagraph.Range.Start).Delete() | Out-Null
}

function Insert-Before($word, $doc, [string]$anchorText, [string]$text, [string]$style) {
  $anchor = Get-ParagraphExact $doc $anchorText
  $start = $anchor.Range.Start
  $doc.Range($start, $start).Text = $text + "`r"
  if ($style) {
    $doc.Range($start, $start + $text.Length).Paragraphs.Item(1).Range.Style = $style
  }
}

function Insert-BlockBefore($doc, [string]$anchorText, $items) {
  $anchor = Get-ParagraphExact $doc $anchorText
  $start = $anchor.Range.Start
  $text = (($items | ForEach-Object { $_.Text }) -join "`r") + "`r"
  $doc.Range($start, $start).Text = $text
  $cursor = $start
  foreach ($item in $items) {
    $doc.Range($cursor, $cursor + $item.Text.Length).Paragraphs.Item(1).Range.Style = $item.Style
    $cursor += $item.Text.Length + 1
  }
}

$word = $null
$doc = $null

try {
  Copy-Item -LiteralPath $source -Destination $workingCopy -Force
  if (Test-Path -LiteralPath $output) {
    Remove-Item -LiteralPath $output -Force
  }
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($workingCopy, $false, $false)

  foreach ($paragraph in $doc.Paragraphs) {
    $paragraphText = Normalize-Text $paragraph.Range.Text
    if ($paragraphText -and -not $script:ParagraphRanges.ContainsKey($paragraphText)) {
      $script:ParagraphRanges[$paragraphText] = $paragraph.Range.Duplicate
    }
  }

  # Retirar apartados redundantes o propios de la revision interna.
  Delete-Block $doc "7. Solicitudes del Departamento Financiero" "5. Consultar el estado de una gestión"
  $reviewStart = Get-ParagraphExact $doc "Recomendaciones Generales:"
  $doc.Range($reviewStart.Range.Start, $doc.Content.End - 1).Delete() | Out-Null
  @(
    "Utilice una computadora o dispositivo con conexión estable a Internet.",
    "Tenga acceso a un correo electrónico activo; allí recibirá enlaces de verificación y recuperación.",
    "Prepare los documentos solicitados en formato PDF y respete el tamaño máximo mostrado en cada formulario.",
    "Use información que coincida con sus documentos oficiales y revise los datos antes de guardar.",
    "Anote el correlativo asignado.",
    "Correlativo: Conserve el código asignado. Facilita la identificación del trámite cuando solicite asistencia.",
    "Correlativo: código único utilizado para consultar o solicitar asistencia sobre el proceso."
  ) | ForEach-Object { Delete-Paragraph $doc $_ }

  # Portada e introduccion.
  Replace-Paragraph $doc "MANUAL DE USUARIO EXTERNO" "GUÍA DE USUARIO EXTERNO"
  Replace-Paragraph $doc "Sistema de trámites en línea" "Trámites electrónicos en el portal institucional"
  Replace-Paragraph $doc "Versión 1.0 — Junio de 2026" "Versión 1.1 — Julio de 2026"
  Replace-Paragraph $doc "Guía para crear una cuenta, presentar solicitudes y consultar el avance de sus gestiones." "Guía práctica para acceder al portal institucional, presentar trámites electrónicos y consultar el avance de las gestiones realizadas ante la DGAC."
  Replace-Paragraph $doc "Guía de usuario externo para trámites electrónicos" "Introducción" "Título 1"
  Replace-Paragraph $doc "La Dirección General de Aeronáutica Civil (DGAC), del Ministerio de Comunicaciones, Infraestructura y Vivienda, es la autoridad encargada de normar, supervisar, vigilar y regular los servicios aeronáuticos y, en general, todas las actividades de la aviación civil. Dada esta responsabilidad, la gestión de usuarios de los servicios aeronáuticos requiere un marco referencial que garantice la eficiencia de los trámites electrónicos y la mitigación de los riesgos asociados." "La Dirección General de Aeronáutica Civil (DGAC), del Ministerio de Comunicaciones, Infraestructura y Vivienda, es la autoridad responsable de normar, supervisar, vigilar y regular los servicios aeronáuticos y las actividades de la aviación civil en Guatemala."
  Replace-Paragraph $doc "Mediante la Guía de usuarios externos para trámites electrónicos se facilita la familiarización con el portal institucional de la DGAC. Esta guía tiene como objetivo Presentar los componentes estandarizados para las solicitudes de trámite a través del portal institucional, con el objetivo de optimizar la trazabilidad de las gestiones de los usuarios externos, garantizando el cumplimiento de las disposiciones y normativas aplicables, subsanando deficiencias metodológicas." "Esta guía facilita la familiarización de los usuarios externos con el portal institucional y explica las funciones necesarias para presentar solicitudes electrónicas, adjuntar documentos, consultar el avance de una gestión y atender observaciones."
  Replace-Paragraph $doc "El propósito de la guía es proporcionar a los usuarios externos instrucciones claras sobre la estructura y funcionamiento de la página web institucional, con el fin de reducir los tiempos de respuesta en las solicitudes de trámites electrónicos dirigidas a los departamentos de la DGAC competentes. Asimismo, la guía enfatiza la responsabilidad y el cumplimiento de las obligaciones contractuales por parte de los usuarios." "Consulte esta guía cuando necesite crear una cuenta, ingresar al sistema, localizar un trámite, completar un formulario o revisar los resultados publicados por la unidad responsable."

  # Generalidades.
  Replace-Paragraph $doc "Acerca de este manual Generalidades de la guía" "1. Generalidades de la guía" "Título 1"
  Replace-Paragraph $doc "Este manual está dirigido a personas individuales y jurídicas que utilizan el sistema de trámites electrónicos de la Dirección General de Aeronáutica Civil (DGAC) para presentar solicitudes, adjuntar documentación y consultar el estado y avance de sus gestiones. Su contenido proporciona instrucciones operativas y requisitos administrativos para garantizar la correcta presentación de expedientes, la trazabilidad de los procesos y el cumplimiento de las obligaciones contractuales y normativas aplicables." "Esta guía está dirigida a personas individuales y jurídicas que utilizan el sistema de trámites electrónicos de la DGAC. Comprende el registro, el acceso, la presentación de solicitudes, la carga de documentos, el seguimiento, las correcciones y la descarga de resultados disponibles."
  Insert-Before $word $doc "Este manual está dirigido a personas individuales y jurídicas que utilizan el sistema de trámites electrónicos de la Dirección General de Aeronáutica Civil (DGAC) para presentar solicitudes, adjuntar documentación y consultar el estado y avance de sus gestiones. Su contenido proporciona instrucciones operativas y requisitos administrativos para garantizar la correcta presentación de expedientes, la trazabilidad de los procesos y el cumplimiento de las obligaciones contractuales y normativas aplicables." "1.1 Alcance de la guía" "Título 2"
  Replace-Paragraph $doc "Objetivo del Manual" "1.2 Objetivo de la guía" "Título 2"
  Replace-Paragraph $doc "Presentar los componentes estandarizados para las solicitudes de trámite a través del portal institucional, con el objetivo de optimizar la trazabilidad de las gestiones de los usuarios externos de la Dirección General de Aeronáutica Civil, que permita garantizar el cumplimiento de las disposiciones y normativas aplicables." "Orientar al usuario en el uso de las funciones disponibles para presentar trámites electrónicos de forma ordenada, completar la información requerida y consultar el avance de sus gestiones." "First Paragraph"
  Replace-Paragraph $doc "Recorrido general Requisitos para acceder al portal de la DGAC" "1.3 Requisitos para acceder al portal de la DGAC" "Título 2"
  Replace-Paragraph $doc "La presente sección describe de manera clara y concisa los requisitos necesarios para acceder y utilizar el portal web institucional de la DGAC. Su objetivo es orientar a usuarios individuales y jurídicos, sobre las condiciones técnicas, documentales, de seguridad y legales que deben cumplirse para garantizar un acceso seguro, eficiente y conforme a la normativa vigente. Los requisitos establecidos son los siguientes:" "Antes de comenzar, verifique que cuenta con los siguientes elementos:"
  Replace-Paragraph $doc "Dispositivo: Computadora o dispositivo móvil con sistema operativo actualizado y con capacidad de visualizar documentos PDF." "Dispositivo: computadora o dispositivo móvil actualizado y con capacidad para visualizar documentos PDF."
  Replace-Paragraph $doc "Navegador compatible: Versión actualizada de navegadores soportados." "Navegador: una versión actualizada de un navegador compatible."
  Replace-Paragraph $doc "Conectividad: Conexión a internet estable y con suficiente ancho de banda." "Conectividad: conexión estable a Internet."
  Replace-Paragraph $doc "Medio de notificación: Correo electrónico" "Correo electrónico: una cuenta activa para recibir verificaciones, avisos y enlaces de recuperación."
  Replace-Paragraph $doc "Documentación de soporte: Requisitos para trámite electrónico a realizar" "Documentación: los requisitos del trámite en formato PDF y dentro del límite de tamaño indicado en el formulario."
  Replace-Paragraph $doc "Recorrido general Diseño de interfaz" "1.4 Funciones principales" "Título 2"
  Replace-Paragraph $doc "El diseño de la interfaz del portal web constituye la capa de interacción entre los usuarios externos y los servicios digitales de la DGAC. Su propósito es facilitar el acceso, la comprensión y la ejecución de trámites mediante una experiencia coherente, accesible y segura que optimice la eficiencia operativa y la trazabilidad documental. La página principal se compone en 3 apartados que a continuación se desarrollan:" "El portal permite realizar las siguientes acciones:"
  Delete-Paragraph $doc "1.3.1 Menú superior: en esta barra se puede encontrar información sobre la institución, los trámites y solicitudes, información pública, servicios, canales de comunicación, selección de idioma con el que desea navegar, barra de búsqueda y por último información de los arribos y despegues de vuelos que operaran durante el día en el Aeropuerto Internacional La Aurora."
  Replace-Paragraph $doc "/" "1.5 Diseño de la interfaz" "Título 2"
  Replace-Paragraph $doc "Menú Principal: permite consultar información relacionada con las regularizaciones y operaciones aeroportuarias, incluyendo memorias de labores, leyes, regulaciones y reportes. Está diseñado para facilitar el acceso rápido y ordenado a la documentación institucional relevante y garantizar la trazabilidad de las consultas realizadas por usuarios externos." "Menú superior: reúne información institucional, trámites y solicitudes, información pública, servicios, canales de comunicación, selección de idioma, búsqueda y datos de arribos y despegues correspondientes al Aeropuerto Internacional La Aurora."
  Replace-Paragraph $doc "Menú inferior del portal contiene noticias y comunicados de interés público que la Dirección General de Aeronáutica Civil (DGAC) difunde para la ciudadanía. Su diseño prioriza la visibilidad de información institucional relevante, actualizaciones operativas y avisos de interés general, facilitando el acceso rápido y la consulta por parte del público./" "Contenido principal: permite consultar regulaciones, operaciones aeroportuarias, memorias de labores, leyes, reportes y accesos a servicios institucionales."
  (Get-ParagraphExact $doc "Menú Principal: permite consultar información relacionada con las regularizaciones y operaciones aeroportuarias, incluyendo memorias de labores, leyes, regulaciones y reportes. Está diseñado para facilitar el acceso rápido y ordenado a la documentación institucional relevante y garantizar la trazabilidad de las consultas realizadas por usuarios externos.").Range.ListFormat.RemoveNumbers() | Out-Null
  (Get-ParagraphExact $doc "Menú inferior del portal contiene noticias y comunicados de interés público que la Dirección General de Aeronáutica Civil (DGAC) difunde para la ciudadanía. Su diseño prioriza la visibilidad de información institucional relevante, actualizaciones operativas y avisos de interés general, facilitando el acceso rápido y la consulta por parte del público./").Range.ListFormat.RemoveNumbers() | Out-Null
  Replace-Paragraph $doc "1.4 9.1 Seguridad de la cuenta" "1.6 Seguridad de la cuenta" "Título 2"
  Insert-Before $word $doc "1.4 9.1 Seguridad de la cuenta" "Menú inferior: presenta noticias, comunicados, actualizaciones operativas y avisos de interés público difundidos por la DGAC." "Texto independiente"
  Replace-Paragraph $doc "La seguridad de la cuenta en el portal institucional es un componente crítico para proteger la confidencialidad, integridad y disponibilidad de la información y los trámites electrónicos gestionados ante la DGAC. En esta sección se establece los principios, controles y responsabilidades mínimos que deben observar los usuarios para prevenir accesos no autorizados, garantizar la trazabilidad de las acciones y cumplir con la normativa aplicable en materia de protección de datos y seguridad informática. Recomendando:" "Proteja las credenciales y la información asociada con su cuenta mediante las siguientes recomendaciones:"

  # Acceso y presentacion de tramites.
  Replace-Paragraph $doc "Crear una cuenta Acceso a los Trámites en línea" "2. Acceso a los trámites en línea" "Título 1"
  Replace-Paragraph $doc "Para realizar la solicitud de un trámite en línea de la Dirección General de Aeronáutica Civil, se debe de aplicar los siguientes pasos:" "Actualmente, para presentar y consultar un trámite electrónico es necesario disponer de una cuenta verificada e iniciar sesión en el portal institucional." "First Paragraph"
  Replace-Paragraph $doc "2.1Crear cuenta:" "2.1 Crear una cuenta" "Título 2"
  Replace-Paragraph $doc "Abra Acceder al el portal www.dgac.gob.gt y seleccionar a la pestaña de trámites y seleccione la pestaña Crear cuenta." "Acceda a www.dgac.gob.gt, abra el apartado de trámites y seleccione Crear cuenta."
  Replace-Paragraph $doc 'Escriba Llenar los campos solicitados como: su nombre completo, correo electrónico y una contraseña, la cual debe contener 8 caracteres que incluya una letra en mayúscula, un número y un carácter especial (¡”#$%&/±*)' "Complete su nombre, correo electrónico y contraseña."
  Replace-Paragraph $doc "Validar cuenta por medio del correo electrónico registrado. Revise su correo electrónico y abra el enlace de verificación enviado por el sistema." "Revise el correo registrado y abra el enlace de verificación enviado por el sistema."
  Replace-Paragraph $doc "2.2 Iniciar sesión" "2.2 Iniciar sesión" "Título 2"
  Replace-Paragraph $doc "Acceder al portal www.dgac.gob.gt y seleccionar a la pestaña de inicio de sesión" "Acceda a www.dgac.gob.gt y abra la opción Iniciar sesión."
  Insert-Before $word $doc "Acceder al portal www.dgac.gob.gt y seleccionar a la pestaña de inicio de sesión" "Después de verificar la cuenta, utilice su correo y contraseña para acceder al sistema y consultar las funciones disponibles." "First Paragraph"
  Replace-Paragraph $doc "2.3 Pantalla de inicio del usuario" "2.3 Pantalla de inicio del usuario" "Título 2"
  Replace-Paragraph $doc "2.4 Menú Unidades" "2.4 Menú Unidades" "Título 2"
  Replace-Paragraph $doc "Coloque el puntero sobre Unidades" "Coloque el puntero sobre Unidades."
  Replace-Paragraph $doc "Seleccione la unidad en donde realizará la solicitud de trámite." "Seleccione la unidad responsable del trámite."
  Replace-Paragraph $doc "Envié su solicitud." "Envíe la solicitud y espere el mensaje de confirmación."

  Replace-Paragraph $doc "5. Elegir un proceso de RAN o Financiero" "3. Completar un formulario electrónico" "Título 1"

  # Insertar la captura solicitada del menu Unidades.
  $formHeading = Get-ParagraphExact $doc "5. Elegir un proceso de RAN o Financiero"
  $formHeading.Range.Select()
  $selection = $word.Selection
  $selection.Collapse($wdCollapseStart)
  $picture = $selection.InlineShapes.AddPicture($menuImage, $false, $true)
  $picture.LockAspectRatio = -1
  $picture.Width = 430
  $picture.Range.ParagraphFormat.Alignment = $wdAlignParagraphCenter
  $selection.SetRange($picture.Range.End, $picture.Range.End)
  $selection.TypeParagraph()
  $selection.Style = "Image Caption"
  $selection.TypeText("Figura 4. Menú Unidades y trámites disponibles.")
  $selection.TypeParagraph()
  $picture.Range.Paragraphs.Item(1).Range.Style = "Normal"
  $picture.Range.ParagraphFormat.Alignment = $wdAlignParagraphCenter
  foreach ($paragraph in $doc.Paragraphs) {
    if ((Normalize-Text $paragraph.Range.Text) -eq "3. Completar un formulario electrónico") {
      $paragraph.Range.Style = "Título 1"
      break
    }
  }

  Replace-Paragraph $doc "Seleccione la unidad responsable del trámite. La disponibilidad puede variar según la configuración institucional." "Abra el trámite requerido desde el menú Unidades y confirme que el título del formulario corresponde a la gestión que desea presentar."
  Delete-Paragraph $doc "RAN: reserva, prórroga o cesión de matrícula; certificaciones; y trámites UAV/RPA."
  Delete-Paragraph $doc "Financiero: solicitud de solvencia financiera y solicitud de contraseña de pago de otros rubros."
  Replace-Paragraph $doc "Reglas generales de llenado de formularios" "3.1 Reglas generales de llenado" "Título 2"
  Replace-Paragraph $doc "Para garantizar la correcta presentación y tramitación de solicitudes en los distintos departamentos de la Dirección General de Aeronáutica Civil (DGAC), al completar los formularios en línea se deberá considerar lo siguiente:" "Al completar un formulario electrónico, considere lo siguiente:"
  Replace-Paragraph $doc "Figura 4. Ejemplo de formulario del Registro Aeronáutico Nacional." "Figura 5. Ejemplo de formulario electrónico."

  # Documentos y seguimiento.
  Replace-Paragraph $doc "4. Adjuntar documentos y guardar" "4. Adjuntar documentos y enviar la solicitud" "Título 1"
  Replace-Paragraph $doc "Esta sección describe de los pasos para adjuntar, verificar y guardar documentos en los formularios electrónicos del portal de la DGAC. Su objetivo es garantizar la integridad documental, la trazabilidad de las gestiones y el cumplimiento de los requisitos técnicos y normativos aplicables. A continuación, se presentan los pasos a seguir:" "Para adjuntar y verificar los documentos requeridos, siga estos pasos:"
  Replace-Paragraph $doc "Pulse Seleccionar PDF" "Pulse Seleccionar PDF."
  Replace-Paragraph $doc "Elija el archivo correspondiente. (respetar el límite de tamaño para archivos PDF indicado en la pantalla)" "Elija el archivo correspondiente y respete el límite de tamaño indicado en la pantalla."
  Replace-Paragraph $doc "Espere el mensaje de confirmación" "Espere el mensaje de confirmación; el sistema enviará el correlativo al correo registrado."
  Replace-Paragraph $doc "Figura 5. Área de carga de PDF y botón Guardar." "Figura 6. Área de carga de PDF y botón Guardar."
  Replace-Paragraph $doc "5. Consultar el estado de una gestión" "5. Consultar el estado de una gestión" "Título 1"
  Replace-Paragraph $doc "Inicie sesión en portal www.dgac.gob.gt" "Inicie sesión en www.dgac.gob.gt."
  Replace-Paragraph $doc "Seleccionar el correlativo correspondiente" "Localice la tarjeta correspondiente al correlativo de su gestión."
  Replace-Paragraph $doc "Ver estado del trámite." "Revise el estado, el porcentaje de avance y las acciones disponibles."
  Replace-Paragraph $doc "Figura 7. Vista del usuario después de crear un trámite. procesos de RAN y Financiero." "Figura 7. Vista del usuario después de crear un trámite."
  Replace-Paragraph $doc "5.1 Información mostrada en cada proceso" "5.1 Glosario de términos" "Título 2"
  Insert-Before $word $doc "Actualizar: vuelve a consultar la información más reciente." "5.2 Acciones disponibles" "Título 2"
  Replace-Paragraph $doc "5.2 Atender una correcciones en formulario" "5.3 Atender una corrección" "Título 2"
  Replace-Paragraph $doc "La presente sección establece los lineamientos para la corrección de formularios en los trámites electrónicos de la DGAC, con el fin de garantizar la integridad de la información. Las correcciones permiten subsanar errores formales, completar datos faltantes o actualizar información relevante sin afectar la validez del expediente, siempre que se realicen dentro de los plazos y condiciones establecidos por el procedimiento administrativo. A continuación, se enlistan los pasos para corregir formularios en el portal institucional:" "Cuando la unidad responsable devuelva una solicitud, podrá corregir los datos o documentos indicados sin crear un trámite nuevo:"
  Replace-Paragraph $doc "Lea completamente el corrección y justificación del previo motivo mostrado en la tarjeta de la gestión." "Lea completamente el motivo y la justificación mostrados en la tarjeta de la gestión."
  Replace-Paragraph $doc "Modifique únicamente los datos y/o documentos solicitados." "Modifique únicamente los datos o documentos solicitados."
  Replace-Paragraph $doc "6. Recuperar la contraseña" "6. Recuperar la contraseña" "Título 1"
  Insert-BlockBefore $doc "6. Recuperar la contraseña" @(
    @{ Text = "5.4 Entrega de resultados"; Style = "Título 2" },
    @{ Text = "Cuando la unidad publique un resultado, la tarjeta de la gestión mostrará el botón de descarga correspondiente."; Style = "First Paragraph" },
    @{ Text = "Acceda a Inicio y localice la gestión por su correlativo."; Style = "Compact" },
    @{ Text = "Seleccione Descargar formulario, Descargar boleta de pago, Descargar permiso o Descargar documento firmado, según corresponda."; Style = "Compact" },
    @{ Text = "Guarde el archivo PDF en un lugar seguro. Mientras el resultado permanezca disponible en la tarjeta, podrá descargarlo nuevamente."; Style = "Compact" }
  )

  # Recuperacion, preguntas y asistencia.
  Replace-Paragraph $doc "7. Problemas Preguntas frecuentes" "7. Preguntas frecuentes" "Título 1"
  Replace-Paragraph $doc "¿No me llegó ningún correo electrónico?: revise en el correo registrado la bandeja de Spam o Correo no deseado y confirme que escribió correctamente la dirección." "¿No recibió el correo electrónico? Revise las carpetas Spam o Correo no deseado y verifique que la dirección registrada en el sistema sea correcta."
  Replace-Paragraph $doc "¿No me deja adjuntar el PDF?se carga un PDF: confirme que el archivo que desea adjuntar sea PDF, que no se encuentre dañado y se encuentre dentro del límite de tamaño del archivo." "¿No puede adjuntar el PDF? Confirme que el archivo tenga formato PDF, no esté dañado y cumpla con el límite de tamaño indicado."
  Replace-Paragraph $doc "¿La información del estado del trámite no se actualiza? Pulse actualizar en la pantalla de inicio de sesión y espere unos segundos para que el sistema refresque los datos." "¿La información del trámite no se actualiza? Pulse Actualizar en la pantalla Inicio y espere unos segundos." "Compact"
  Replace-Paragraph $doc "10. Asistencia y control de versión" "8. Asistencia y control de versión" "Título 1"
  Replace-Paragraph $doc "Para solicitar asistencia técnica, envíe un correo a asistenciatecnicaejemplo@dgac.gob.gt indicando, como mínimo, nombre del usuario, correo registrado, número correlativo del trámite, unidad responsable y una descripción breve del inconveniente. Si es posible, adjunte una captura de pantalla que ilustre el problema. No envíe contraseñas ni información sensible por correo." "Para solicitar asistencia técnica, utilice el canal oficial publicado en el portal institucional. Indique su nombre, correo registrado, correlativo, unidad responsable y una descripción breve del inconveniente. No comparta contraseñas ni información sensible."
  Replace-Paragraph $doc "10.1 Datos del manual" "8.1 Datos de la guía" "Título 2"
  Replace-Paragraph $doc "Documento: Manual de Usuario Externo - Sistema de Trámites DGAC." "Documento: Guía de Usuario Externo - Trámites electrónicos DGAC."
  Replace-Paragraph $doc "Versión: 1.0." "Versión: 1.1."
  Replace-Paragraph $doc "Fecha: junio de 2026." "Fecha: julio de 2026."
  Replace-Paragraph $doc "Alcance: registro, ingreso, presentación, seguimiento, correcciones y descargas de procesos RAN y Financiero para usuarios externos." "Alcance: registro, ingreso, presentación, seguimiento, correcciones y descarga de resultados para usuarios externos."

  # Convertir todas las observaciones rojas a formato final y retirar comentarios.
  $find = $doc.Content.Find
  $find.ClearFormatting()
  $find.Replacement.ClearFormatting()
  $find.Text = ""
  $find.Replacement.Text = ""
  $find.Font.Color = 255
  $find.Replacement.Font.Color = $wdColorAutomatic
  $find.Forward = $true
  $find.Wrap = 1
  $find.Format = $true
  $find.Execute($null, $false, $false, $false, $false, $false, $true, 1, $true, $null, 2) | Out-Null
  $doc.Content.Font.StrikeThrough = 0
  $doc.Content.Font.DoubleStrikeThrough = 0

  $bulletTexts = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  @(
    "No compartir su contraseña ni los enlaces de recuperación.",
    "Cerrar sesión al utilizar equipos compartidos.",
    "No enviar documentos personales por medios distintos a los indicados por la DGAC.",
    "Verificar que se encuentra en el dominio institucional antes de ingresar credenciales.",
    "Acceda a www.dgac.gob.gt, abra el apartado de trámites y seleccione Crear cuenta.",
    "Complete su nombre, correo electrónico y contraseña.",
    "Pulse Crear cuenta.",
    "Revise el correo registrado y abra el enlace de verificación enviado por el sistema.",
    "Acceda a www.dgac.gob.gt y abra la opción Iniciar sesión.",
    "Seleccione Iniciar sesión.",
    "Ingrese el correo electrónico registrado.",
    "Escriba su contraseña.",
    "Complete la verificación reCAPTCHA cuando aparezca.",
    "Pulse Entrar.",
    "Coloque el puntero sobre Unidades.",
    "Seleccione la unidad responsable del trámite.",
    "Elija el trámite específico que desea realizar.",
    "Llene el formulario correspondiente.",
    "Envíe la solicitud y espere el mensaje de confirmación.",
    "Complete todos los campos obligatorios identificados con asterisco (*).",
    "Seleccione correctamente el tipo de persona, gestión o permiso.",
    "Escriba teléfonos, NIT, matrícula y fechas con el formato solicitado.",
    "No cierre la pestaña mientras carga documentos o guarda la solicitud.",
    "Ubique cada sección de documentos requeridos.",
    "Pulse Seleccionar PDF.",
    "Elija el archivo correspondiente y respete el límite de tamaño indicado en la pantalla.",
    "Verifique que el nombre del archivo aparezca en pantalla.",
    "Repita el proceso para todos los documentos obligatorios.",
    "Revise la información y pulse Guardar una sola vez.",
    "Espere el mensaje de confirmación; el sistema enviará el correlativo al correo registrado.",
    "Inicie sesión en www.dgac.gob.gt.",
    "Localice la tarjeta correspondiente al correlativo de su gestión.",
    "Revise el estado, el porcentaje de avance y las acciones disponibles.",
    "Nombre del trámite: identifica la gestión presentada.",
    "Estado: indica la etapa actual, por ejemplo, Solicitud enviada o En revisión por analista.",
    "Datos principales: muestran el solicitante, registro, matrícula y fecha de creación.",
    "Barra de avance: representa visualmente el porcentaje completado del trámite.",
    "Actualizar: vuelve a consultar la información más reciente.",
    "Realizar correcciones: aparece cuando la unidad devuelve la solicitud y muestra el motivo.",
    "Descargar formulario: aparece cuando el documento aprobado está disponible.",
    "Descargar boleta de pago: aparece en los procesos financieros que ya cuentan con boleta.",
    "Descargar permiso o documento firmado: aparece cuando la unidad publica el documento final.",
    "Calificar servicio: permite valorar una gestión finalizada.",
    "Lea completamente el motivo y la justificación mostrados en la tarjeta de la gestión.",
    "Pulse Realizar correcciones.",
    "Modifique únicamente los datos o documentos solicitados.",
    "Revise el formulario y vuelva a enviarlo.",
    "Acceda a Inicio y localice la gestión por su correlativo.",
    "Seleccione Descargar formulario, Descargar boleta de pago, Descargar permiso o Descargar documento firmado, según corresponda.",
    "Guarde el archivo PDF en un lugar seguro. Mientras el resultado permanezca disponible en la tarjeta, podrá descargarlo nuevamente.",
    "En la pantalla de acceso pulse Olvidé mi contraseña.",
    "Ingrese el correo registrado y complete reCAPTCHA si aparece.",
    "Pulse Enviar enlace.",
    "Abra el mensaje recibido y siga el enlace para crear una contraseña nueva.",
    "Confirme la nueva contraseña e inicie sesión.",
    "¿No recibió el correo electrónico? Revise las carpetas Spam o Correo no deseado y verifique que la dirección registrada en el sistema sea correcta.",
    "¿No puede adjuntar el PDF? Confirme que el archivo tenga formato PDF, no esté dañado y cumpla con el límite de tamaño indicado.",
    "¿El formulario no se guarda? Verifique los campos obligatorios (marcados con *) y los mensajes de error en color rojo. Corrija las observaciones indicadas, complete los campos faltantes y vuelva a intentar enviar el formulario.",
    "¿La información del trámite no se actualiza? Pulse Actualizar en la pantalla Inicio y espere unos segundos."
  ) | ForEach-Object { [void]$bulletTexts.Add($_) }
  $bulletTemplate = $word.ListGalleries.Item(1).ListTemplates.Item(1)
  foreach ($paragraph in $doc.Paragraphs) {
    if ($bulletTexts.Contains((Normalize-Text $paragraph.Range.Text))) {
      $paragraph.Range.ListFormat.ApplyListTemplate($bulletTemplate, $false, 0, 1)
    }
  }
  for ($index = $doc.Comments.Count; $index -ge 1; $index--) {
    $doc.Comments.Item($index).Delete()
  }
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }

  $doc.SaveAs2($output, $wdFormatDocumentDefault)
  Write-Output $output
}
finally {
  if ($doc) { $doc.Close($false) }
  if ($word) { $word.Quit() }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
