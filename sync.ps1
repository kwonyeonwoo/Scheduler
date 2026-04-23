# 타임 키퍼 & 이미지 오거나이저 통합 동기화 스크립트

function Sync-Repo($path) {
    if (Test-Path $path) {
        Write-Host "--- Syncing: $path ---" -ForegroundColor Cyan
        Push-Location $path
        git pull origin main
        git add .
        git commit -m "Auto-sync from $(hostname)"
        git push origin main
        Pop-Location
    } else {
        Write-Host "Warning: $path not found. Skipping." -ForegroundColor Yellow
    }
}

# 1. 스케줄러 동기화
Sync-Repo "scheduler-v2"

# 2. 이미지 오거나이저 동기화
Sync-Repo "image-organizer-source"

Write-Host "All projects are up-to-date!" -ForegroundColor Green
