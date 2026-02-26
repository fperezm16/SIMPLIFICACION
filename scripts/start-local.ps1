param(
    [int]$PgPort = 5433,
    [string]$DbName = "formulario",
    [string]$PgData = "local-pgdata",
    [switch]$NoApi,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Write-Host "[1/6] Preparando comprobaciones..."

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "No se encontro el comando '$Name'. Asegurate de que PostgreSQL y Node esten en PATH."
    }
}

Require-Command "initdb"
Require-Command "pg_ctl"
Require-Command "createdb"
Require-Command "psql"
Require-Command "npm"
Write-Host "[2/6] Dependencias OK."

if (-not (Test-Path $PgData)) {
    Write-Host "[3/6] Inicializando cluster PostgreSQL en $PgData..."
    & initdb -D $PgData -A trust -U postgres | Out-Null
} else {
    Write-Host "[3/6] Usando cluster existente en $PgData."
}

$pgLog = Join-Path (Get-Location) "local-pg.log"
Write-Host "[4/6] Revisando estado de PostgreSQL..."
& pg_ctl -D $PgData status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Arrancando PostgreSQL en el puerto $PgPort..."
    & pg_ctl -w -t 15 -D $PgData -l $pgLog -o "-p $PgPort" start | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL no pudo iniciar. Revisa $pgLog."
    }
    Write-Host "PostgreSQL iniciado (log: $pgLog)."
} else {
    Write-Host "PostgreSQL ya esta en ejecucion (log: $pgLog)."
}

Write-Host "[5/6] Asegurando base de datos '$DbName'..."
$dbExists = (& psql -p $PgPort -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'" 2>$null).Trim()
if ($dbExists -eq "1") {
    Write-Host "BD '$DbName' ya existia."
} else {
    & createdb -p $PgPort -U postgres $DbName | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo crear la base '$DbName' (codigo $LASTEXITCODE)."
    }
    Write-Host "BD '$DbName' creada."
}

$env:DATABASE_URL = "postgres://postgres@localhost:$PgPort/$DbName"
Write-Host "DATABASE_URL=$env:DATABASE_URL"

if ($NoApi) {
    Write-Host "[6/6] API omitida por bandera -NoApi. PostgreSQL quedo en $PgData (log: $pgLog)."
    Write-Host "Para detener: pg_ctl -D $PgData stop"
    return
}

Push-Location backend
try {
    if (-not $SkipInstall -and -not (Test-Path "node_modules")) {
        Write-Host "Instalando dependencias de backend..."
        npm install | Out-Null
    }

    Write-Host "Levantando API en http://localhost:4000 ..."
    npm start
} finally {
    Pop-Location
}
