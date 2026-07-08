$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $PSScriptRoot 'assets'
$docxPath = Join-Path $PSScriptRoot 'Manual_de_Usuario_Externo_DGAC.docx'
$pdfPath = Join-Path $PSScriptRoot 'Manual_de_Usuario_Externo_DGAC.pdf'
$logoPath = Join-Path $root 'frontend\src\assets\dgac-header.png'

$blue = 15109901
$darkBlue = 9257985
$gray = 7368816
$lightBlue = 16448250
$black = 0

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.ScreenUpdating = $false
$word.Options.Pagination = $false
$doc = $word.Documents.Add()
$doc.ShowSpellingErrors = $false
$doc.ShowGrammaticalErrors = $false
$sel = $word.Selection

function Set-Font($font, $name = 'Calibri', $size = 11, $bold = $false, $italic = $false, $color = 0) {
    $font.Name = $name
    $font.NameAscii = $name
    $font.NameOther = $name
    $font.Size = [single]$size
    $font.Bold = [int]$bold
    $font.Italic = [int]$italic
    $font.Color = $color
}

function Add-Paragraph(
    [string]$text,
    [double]$size = 11,
    [bool]$bold = $false,
    [bool]$italic = $false,
    [int]$color = 0,
    [int]$alignment = 0,
    [double]$before = 0,
    [double]$after = 6
) {
    $script:sel.Style = -1
    Set-Font $script:sel.Font 'Calibri' $size $bold $italic $color
    $script:sel.ParagraphFormat.Alignment = $alignment
    $script:sel.ParagraphFormat.SpaceBefore = $before
    $script:sel.ParagraphFormat.SpaceAfter = $after
    $script:sel.ParagraphFormat.LineSpacingRule = 5
    $script:sel.ParagraphFormat.LineSpacing = [math]::Round($size * 1.25, 1)
    $script:sel.TypeText($text)
    $script:sel.TypeParagraph()
}

function Add-Heading([string]$text, [int]$level = 1) {
    $styleId = switch ($level) { 1 { -2 } 2 { -3 } default { -4 } }
    $script:sel.Style = $styleId
    $script:sel.TypeText($text)
    $script:sel.TypeParagraph()
}

function Add-Numbered([string[]]$items) {
    foreach ($item in $items) {
        $script:sel.Style = -1
        Set-Font $script:sel.Font 'Calibri' 11 $false $false $black
        $script:sel.ParagraphFormat.SpaceAfter = 4
        $script:sel.ParagraphFormat.LineSpacingRule = 5
        $script:sel.ParagraphFormat.LineSpacing = 13.75
        $script:sel.Range.ListFormat.ApplyNumberDefault()
        $script:sel.TypeText($item)
        $script:sel.TypeParagraph()
    }
    $script:sel.Range.ListFormat.RemoveNumbers()
    $script:sel.ParagraphFormat.LeftIndent = 0
    $script:sel.ParagraphFormat.FirstLineIndent = 0
}

function Add-Bullets([string[]]$items) {
    foreach ($item in $items) {
        $script:sel.Style = -1
        Set-Font $script:sel.Font 'Calibri' 11 $false $false $black
        $script:sel.ParagraphFormat.SpaceAfter = 4
        $script:sel.ParagraphFormat.LineSpacingRule = 5
        $script:sel.ParagraphFormat.LineSpacing = 13.75
        $script:sel.Range.ListFormat.ApplyBulletDefault()
        $script:sel.TypeText($item)
        $script:sel.TypeParagraph()
    }
    $script:sel.Range.ListFormat.RemoveNumbers()
    $script:sel.ParagraphFormat.LeftIndent = 0
    $script:sel.ParagraphFormat.FirstLineIndent = 0
}

function Add-Note([string]$label, [string]$text) {
    $script:sel.Style = -1
    $script:sel.ParagraphFormat.SpaceBefore = 6
    $script:sel.ParagraphFormat.SpaceAfter = 8
    $script:sel.ParagraphFormat.LeftIndent = 12
    $script:sel.ParagraphFormat.RightIndent = 12
    $script:sel.ParagraphFormat.LineSpacingRule = 5
    $script:sel.ParagraphFormat.LineSpacing = 13.75
    $script:sel.ParagraphFormat.Borders.Item(-2).LineStyle = 1
    $script:sel.ParagraphFormat.Borders.Item(-2).Color = $blue
    $script:sel.ParagraphFormat.Borders.Item(-2).LineWidth = 12
    Set-Font $script:sel.Font 'Calibri' 11 $true $false $darkBlue
    $script:sel.TypeText("${label}: ")
    Set-Font $script:sel.Font 'Calibri' 11 $false $false $black
    $script:sel.TypeText($text)
    $script:sel.TypeParagraph()
    $script:sel.ParagraphFormat.LeftIndent = 0
    $script:sel.ParagraphFormat.RightIndent = 0
    $script:sel.ParagraphFormat.Borders.Item(-2).LineStyle = 0
}

function Add-Image([string]$filename, [string]$caption, [double]$maxWidth = 446, [double]$maxHeight = 315) {
    $path = Join-Path $script:assets $filename
    if (-not (Test-Path -LiteralPath $path)) { throw "No se encontró la imagen: $path" }
    $script:sel.Style = -1
    $script:sel.ParagraphFormat.Alignment = 1
    $shape = $script:sel.InlineShapes.AddPicture($path, $false, $true)
    $shape.LockAspectRatio = -1
    if ($shape.Width -gt $maxWidth) { $shape.Width = $maxWidth }
    if ($shape.Height -gt $maxHeight) { $shape.Height = $maxHeight }
    $shape.AlternativeText = $caption
    $shape.Title = $caption
    $script:sel.TypeParagraph()
    Add-Paragraph $caption 9 $false $true $gray 1 2 8
}

function Add-PageBreak() {
    $script:sel.InsertBreak(7)
}

try {
    $section = $doc.Sections.Item(1)
    $section.PageSetup.PageWidth = 612
    $section.PageSetup.PageHeight = 792
    $section.PageSetup.TopMargin = 72
    $section.PageSetup.BottomMargin = 72
    $section.PageSetup.LeftMargin = 72
    $section.PageSetup.RightMargin = 72
    $section.PageSetup.HeaderDistance = 35.4
    $section.PageSetup.FooterDistance = 35.4

    $normal = $doc.Styles.Item(-1)
    Set-Font $normal.Font 'Calibri' 11 $false $false $black
    $normal.ParagraphFormat.SpaceBefore = 0
    $normal.ParagraphFormat.SpaceAfter = 6
    $normal.ParagraphFormat.LineSpacingRule = 5
    $normal.ParagraphFormat.LineSpacing = 13.75

    $h1 = $doc.Styles.Item(-2)
    Set-Font $h1.Font 'Calibri' 16 $true $false $blue
    $h1.ParagraphFormat.SpaceBefore = 18
    $h1.ParagraphFormat.SpaceAfter = 10
    $h1.ParagraphFormat.KeepWithNext = -1

    $h2 = $doc.Styles.Item(-3)
    Set-Font $h2.Font 'Calibri' 13 $true $false $blue
    $h2.ParagraphFormat.SpaceBefore = 14
    $h2.ParagraphFormat.SpaceAfter = 7
    $h2.ParagraphFormat.KeepWithNext = -1

    $h3 = $doc.Styles.Item(-4)
    Set-Font $h3.Font 'Calibri' 12 $true $false $darkBlue
    $h3.ParagraphFormat.SpaceBefore = 10
    $h3.ParagraphFormat.SpaceAfter = 5
    $h3.ParagraphFormat.KeepWithNext = -1

    $header = $section.Headers.Item(1).Range
    $header.Text = 'DGAC  |  Sistema de trámites  |  Manual de usuario externo'
    Set-Font $header.Font 'Calibri' 8.5 $false $false $gray
    $header.ParagraphFormat.Alignment = 0

    $footer = $section.Footers.Item(1).Range
    $footer.Text = 'Dirección General de Aeronáutica Civil   •   Página '
    Set-Font $footer.Font 'Calibri' 8.5 $false $false $gray
    $footer.ParagraphFormat.Alignment = 2
    $footer.Collapse(0)
    $null = $section.Footers.Item(1).Range.Fields.Add($footer, 33)

    # Portada: patrón editorial_cover.
    Add-Paragraph '' 11 $false $false $black 1 34 6
    $sel.ParagraphFormat.Alignment = 1
    $coverLogo = $sel.InlineShapes.AddPicture($logoPath, $false, $true)
    $coverLogo.LockAspectRatio = -1
    $coverLogo.Width = 260
    $coverLogo.AlternativeText = 'Logotipo de la Dirección General de Aeronáutica Civil'
    $sel.TypeParagraph()
    Add-Paragraph 'MANUAL DE USUARIO EXTERNO' 26 $true $false $darkBlue 1 42 10
    Add-Paragraph 'Sistema de trámites en línea' 17 $false $false $blue 1 0 22
    Add-Paragraph 'Guía para crear una cuenta, presentar solicitudes y consultar el avance de sus gestiones.' 12 $false $false $gray 1 0 48
    Add-Paragraph 'Versión 1.0' 11 $true $false $darkBlue 1 0 4
    Add-Paragraph 'Junio de 2026' 11 $false $false $gray 1 0 4
    Add-Paragraph 'Dirección General de Aeronáutica Civil de Guatemala' 10 $false $true $gray 1 34 0

    Add-PageBreak
    Add-Heading '1. Acerca de este manual' 1
    Add-Paragraph 'Este manual está dirigido a personas y empresas que utilizan el sistema de trámites de la DGAC para presentar solicitudes, adjuntar documentos y consultar el avance de sus gestiones.'
    Add-Heading '1.1 Antes de comenzar' 2
    Add-Bullets @(
        'Utilice una computadora o dispositivo con conexión estable a Internet.',
        'Tenga acceso a un correo electrónico activo; allí recibirá enlaces de verificación y recuperación.',
        'Prepare los documentos solicitados en formato PDF. Respete el tamaño máximo mostrado en cada formulario.',
        'Use información que coincida con sus documentos oficiales y revise los datos antes de guardar.'
    )
    Add-Heading '1.2 Recorrido general' 2
    Add-Numbered @(
        'Crear y verificar la cuenta de usuario.',
        'Iniciar sesión con correo y contraseña.',
        'Elegir la unidad y el trámite correspondiente.',
        'Completar los campos y adjuntar los documentos requeridos.',
        'Guardar la solicitud y conservar el correlativo asignado.',
        'Consultar el estado, atender correcciones y descargar documentos cuando estén disponibles.'
    )
    Add-Note 'Importante' 'Los campos marcados con asterisco (*) son obligatorios. El sistema no permitirá guardar una solicitud incompleta.'

    Add-PageBreak
    Add-Heading '2. Crear una cuenta' 1
    Add-Numbered @(
        'Abra el portal de trámites y seleccione la pestaña Crear cuenta.',
        'Escriba su nombre completo, correo electrónico y una contraseña segura.',
        'Pulse Crear cuenta.',
        'Revise su correo electrónico y abra el enlace de verificación enviado por el sistema.'
    )
    Add-Note 'Contraseña' 'Debe tener al menos 8 caracteres e incluir una letra mayúscula, un número y un carácter especial, por ejemplo: ! @ # $ %.'
    Add-Image '02-crear-cuenta.png' 'Figura 1. Pantalla para crear una cuenta de usuario.' 430 300

    Add-PageBreak
    Add-Heading '3. Iniciar sesión' 1
    Add-Numbered @(
        'Seleccione Iniciar sesión.',
        'Ingrese el correo electrónico registrado.',
        'Escriba su contraseña.',
        'Complete la verificación reCAPTCHA cuando aparezca.',
        'Pulse Entrar.'
    )
    Add-Image '01-inicio-sesion.png' 'Figura 2. Pantalla de inicio de sesión.' 430 300
    Add-Note 'Si no puede entrar' 'Confirme que el correo fue verificado y que no haya espacios antes o después del correo. Si olvidó la contraseña, utilice el enlace correspondiente.'

    Add-PageBreak
    Add-Heading '4. Conocer la pantalla de inicio' 1
    Add-Paragraph 'Al iniciar sesión verá el nombre del usuario, el botón Cerrar sesión, el acceso Inicio y el menú Unidades. La pantalla Inicio muestra las gestiones realizadas y su avance.'
    Add-Image '03-inicio-usuario.png' 'Figura 3. Pantalla de inicio de un usuario sin gestiones registradas.' 430 300
    Add-Heading '4.1 Menú Unidades' 2
    Add-Paragraph 'Coloque el puntero sobre Unidades para consultar los módulos disponibles. Después, coloque el puntero sobre una unidad para elegir un trámite específico.'
    Add-Image '03b-menu-unidades.png' 'Figura 4. Menú de unidades habilitadas para el usuario externo.' 430 260

    Add-PageBreak
    Add-Heading '5. Elegir y completar un trámite' 1
    Add-Paragraph 'Seleccione la unidad responsable del trámite. La disponibilidad puede variar según la configuración institucional.'
    Add-Bullets @(
        'RAN: reserva, prórroga o cesión de matrícula; certificaciones; y trámites UAV/RPA.',
        'DVSO: formularios técnicos como DVSO-623, 623A, 639, 639A, 800, 801 y DVSO-OPS-805.',
        'Financiero: solvencia financiera y contraseña de pago de otros rubros.',
        'AILA: permisos de ingreso o trabajos de infraestructura, cuando el acceso esté habilitado.'
    )
    Add-Heading '5.1 Reglas generales de llenado' 2
    Add-Bullets @(
        'Complete todos los campos obligatorios identificados con asterisco (*).',
        'Seleccione correctamente el tipo de persona, gestión o permiso.',
        'Escriba teléfonos, NIT, matrícula y fechas con el formato solicitado.',
        'No cierre la pestaña mientras carga documentos o guarda la solicitud.'
    )
    Add-Image '04-formulario-ran.png' 'Figura 5. Ejemplo de formulario del Registro Aeronáutico Nacional.' 430 300

    Add-PageBreak
    Add-Heading '6. Adjuntar documentos y guardar' 1
    Add-Numbered @(
        'Ubique cada sección de documentos requeridos.',
        'Pulse Seleccionar PDF y elija el archivo correspondiente.',
        'Verifique que el nombre del archivo aparezca en pantalla.',
        'Repita el proceso para todos los documentos obligatorios.',
        'Revise la información y pulse Guardar una sola vez.',
        'Espere el mensaje de confirmación y anote el correlativo asignado.'
    )
    Add-Image '04b-envio-ran.png' 'Figura 6. Área de carga de PDF y botón Guardar.' 430 300
    Add-Note 'Archivos PDF' 'En el ejemplo, el límite indicado es de 10 MB por PDF. Si otro formulario muestra un límite diferente, prevalece el valor presentado en pantalla.'

    Add-PageBreak
    Add-Heading '7. Solicitudes del Departamento Financiero' 1
    Add-Paragraph 'El módulo Financiero permite seleccionar la gestión correspondiente y completar los datos de facturación. Lea el título del formulario antes de comenzar para confirmar que eligió la solicitud correcta.'
    Add-Bullets @(
        'Ingrese NIT, nombre del arrendatario o dueño de la aeronave y datos de contacto.',
        'Complete los datos del solicitante exactamente como aparecen en su documento.',
        'Adjunte la carta de representación y los documentos que solicite la gestión.',
        'Después del procesamiento, revise Inicio para descargar la boleta o el documento disponible.'
    )
    Add-Image '05-formulario-financiero.png' 'Figura 7. Ejemplo de solicitud de solvencia de pago.' 430 300

    Add-PageBreak
    Add-Heading '8. Solicitudes de AILA' 1
    Add-Paragraph 'Cuando el módulo esté habilitado, el formulario de AILA permite gestionar permisos para trabajos de infraestructura e ingreso o egreso de herramientas, mercadería y mobiliario.'
    Add-Numbered @(
        'Seleccione permiso genérico o permiso urgente, según corresponda.',
        'Complete los datos del permiso, empresa, área de ingreso y motivo.',
        'Registre las personas, vehículos, herramientas o bienes solicitados.',
        'Adjunte los documentos requeridos y guarde la solicitud.'
    )
    Add-Image '06-formulario-aila.png' 'Figura 8. Clasificación y datos iniciales de una solicitud de AILA.' 430 300
    Add-Note 'Anticipación' 'La pantalla indica que las solicitudes genéricas deben gestionarse con 72 horas de anticipación. Utilice la opción urgente únicamente cuando la situación corresponda.'

    Add-PageBreak
    Add-Heading '9. Formularios DVSO' 1
    Add-Paragraph 'Los formularios DVSO reproducen la estructura del formato técnico correspondiente. Seleccione cuidadosamente el código del formulario antes de ingresar información.'
    Add-Bullets @(
        'DVSO-623: certificado de aeronavegabilidad para exportación, ala fija.',
        'DVSO-623A: certificado de aeronavegabilidad para exportación, helicóptero.',
        'DVSO-639 y DVSO-639A: solicitud y anexo para certificado de exportación.',
        'DVSO-800: permiso de vuelo especial.',
        'DVSO-801: dictamen técnico para RPA.',
        'DVSO-OPS-805: autorización para RPA o dron de turistas.'
    )
    Add-Heading '9.1 Recomendaciones' 2
    Add-Numbered @(
        'Use Descargar formato original si necesita consultar el documento oficial.',
        'Complete los datos técnicos tal como aparecen en la documentación de la aeronave.',
        'Revise fechas, matrícula, fabricante, modelo y número de serie.',
        'Adjunte los archivos solicitados y guarde la solicitud.'
    )
    Add-Note 'Precisión técnica' 'Si tiene dudas sobre qué formulario corresponde, confirme primero con la unidad DVSO. Evite enviar el mismo trámite en formularios diferentes.'

    Add-PageBreak
    Add-Heading '10. Consultar el estado de una gestión' 1
    Add-Paragraph 'Abra Inicio para consultar sus solicitudes. Las gestiones se agrupan por unidad y muestran el correlativo, estado, fecha y porcentaje de avance.'
    Add-Bullets @(
        'Actualizar: vuelve a consultar la información más reciente.',
        'Realizar correcciones: aparece cuando la unidad devuelve la solicitud y muestra el motivo.',
        'Descargar formulario: aparece cuando el documento aprobado está disponible.',
        'Descargar boleta de pago: aparece en los procesos financieros que ya cuentan con boleta.',
        'Descargar permiso o documento firmado: aparece cuando la unidad publica el documento final.',
        'Calificar servicio: permite valorar una gestión finalizada.'
    )
    Add-Heading '10.1 Atender una corrección' 2
    Add-Numbered @(
        'Lea completamente el motivo mostrado en la tarjeta de la gestión.',
        'Pulse Realizar correcciones.',
        'Modifique únicamente los datos o documentos solicitados.',
        'Revise el formulario y vuelva a enviarlo.'
    )
    Add-Note 'Correlativo' 'Conserve el código asignado. Facilita la identificación del trámite cuando solicite asistencia.'

    Add-PageBreak
    Add-Heading '11. Recuperar la contraseña' 1
    Add-Numbered @(
        'En la pantalla de acceso pulse Olvidé mi contraseña.',
        'Ingrese el correo registrado y complete reCAPTCHA si aparece.',
        'Pulse Enviar enlace.',
        'Abra el mensaje recibido y siga el enlace para crear una contraseña nueva.',
        'Confirme la nueva contraseña e inicie sesión.'
    )
    Add-Heading '11.1 Seguridad de la cuenta' 2
    Add-Bullets @(
        'No comparta su contraseña ni los enlaces de recuperación.',
        'Cierre la sesión al utilizar equipos compartidos.',
        'No envíe documentos personales por medios distintos a los indicados por la DGAC.',
        'Verifique que se encuentra en el dominio institucional antes de ingresar credenciales.'
    )
    Add-Heading '11.2 Problemas frecuentes' 2
    Add-Bullets @(
        'No llega el correo: revise Spam o Correo no deseado y confirme que escribió correctamente la dirección.',
        'No se carga un PDF: confirme que sea PDF, que no esté dañado y que cumpla el límite de tamaño.',
        'El formulario no guarda: revise los campos con asterisco y los mensajes en color rojo.',
        'La información no cambia: pulse Actualizar en Inicio y espere unos segundos.'
    )

    Add-PageBreak
    Add-Heading '12. Asistencia y control de versión' 1
    Add-Paragraph 'Cuando solicite asistencia, indique su nombre, correo registrado, correlativo del trámite, unidad responsable y una descripción breve del inconveniente. No envíe contraseñas.'
    Add-Note 'Evidencia útil' 'Si es posible, adjunte una captura del mensaje de error sin mostrar información personal sensible.'
    Add-Heading '12.1 Datos del manual' 2
    Add-Bullets @(
        'Documento: Manual de Usuario Externo - Sistema de Trámites DGAC.',
        'Versión: 1.0.',
        'Fecha: junio de 2026.',
        'Alcance: registro, ingreso, presentación, seguimiento, correcciones y descargas para usuarios externos.'
    )
    Add-Paragraph 'Fin del documento.' 11 $true $false $darkBlue 1 48 0

    $doc.SaveAs2($docxPath, 16)
    $doc.ExportAsFixedFormat($pdfPath, 17)
}
finally {
    if ($doc) { $doc.Close($false) }
    if ($word) { $word.Quit() }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($sel) | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Output $docxPath
Write-Output $pdfPath
