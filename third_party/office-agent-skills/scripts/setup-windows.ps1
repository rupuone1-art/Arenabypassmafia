$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python is required. Install it from python.org or with winget."
}

if (Get-Command winget -ErrorAction SilentlyContinue) {
    foreach ($id in @("TheDocumentFoundation.LibreOffice", "JohnMacFarlane.Pandoc", "qpdf.qpdf")) {
        try { winget install --id $id --accept-source-agreements --accept-package-agreements --silent } catch { Write-Warning "Could not install $id automatically." }
    }
} else {
    Write-Warning "winget unavailable; install LibreOffice, Pandoc, and qpdf manually."
}

python scripts/setup.py
python scripts/check-dependencies.py
Write-Host "Windows setup complete. Activate with .\.venv\Scripts\Activate.ps1"
