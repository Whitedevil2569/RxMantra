# Launches all three RxMantra services in separate PowerShell windows.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File D:\RxMantra\app\start-all.ps1
$root = "D:\RxMantra"
$venv = "$root\.venv\Scripts\python.exe"

Write-Host "Starting ML service (FastAPI, port 8000)..."
Start-Process powershell -ArgumentList "-NoExit","-Command","& '$venv' '$root\app\ml-service\server.py'"

Start-Sleep -Seconds 8  # give the model time to load onto the GPU

Write-Host "Starting backend (Express, port 3001)..."
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\app\backend'; node server.js"

Write-Host "Starting frontend (Vite, port 5173)..."
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\app\frontend'; npm run dev"

Write-Host ""
Write-Host "All services starting. Open http://localhost:5173 in your browser."
