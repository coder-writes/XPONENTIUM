# News Pulse — PowerShell setup script
# Run from within python_ingestion\ directory

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " News Pulse — Python Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Find Python executable
$pyExe = $null

foreach ($candidate in @("py", "python3", "python")) {
    try {
        $ver = & $candidate --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Found Python: $ver (using '$candidate')" -ForegroundColor Green
            $pyExe = $candidate
            break
        }
    } catch {}
}

if (-not $pyExe) {
    Write-Host "ERROR: Python not found on PATH." -ForegroundColor Red
    Write-Host "Please install Python 3.10+ from https://www.python.org/downloads/"
    Write-Host "Make sure to check 'Add Python to PATH' during installation."
    exit 1
}

# Create virtual environment
Write-Host "`nCreating virtual environment..." -ForegroundColor Yellow
& $pyExe -m venv .venv

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: venv creation failed." -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "Installing dependencies from requirements.txt..." -ForegroundColor Yellow
& ".venv\Scripts\pip.exe" install -r requirements.txt

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: pip install failed." -ForegroundColor Red
    exit 1
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " Setup complete!  Next steps:" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  1. Activate venv:   .venv\Scripts\Activate.ps1"
Write-Host "  2. Run pipeline:    python main.py --no-scrape"
Write-Host "  3. Start API:       python api_server.py --port 8000"
Write-Host "  4. Check stats:     python main.py --stats"
Write-Host "  5. Full run:        python main.py"
Write-Host "============================================================" -ForegroundColor Green
