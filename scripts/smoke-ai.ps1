# scripts/smoke-ai.ps1
# 一鍵測試所有 10 個 AI 接點是否正常運作。
# Demo 前先跑這個確認 LLM 端點都通。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\scripts\smoke-ai.ps1
#
# 預設打 http://localhost:3001，可用 -ApiBase 改變。

param(
  [string]$ApiBase = 'http://localhost:3001/api/v1'
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

function Login {
  param([string]$email, [string]$pwd)
  $body = @{ email = $email; password = $pwd } | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  try {
    $r = Invoke-RestMethod -Uri "$ApiBase/auth/login" -Method Post `
      -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 10
    return $r.token
  } catch {
    Write-Host "FATAL: Login failed for $email — $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

function HitGet {
  param([string]$path, [string]$tok, [string]$label)
  try {
    $r = Invoke-RestMethod -Uri "$ApiBase$path" `
      -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 90
    Write-Host "  ✅ [$label]  $path" -ForegroundColor Green
    return $true
  } catch {
    $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    Write-Host "  ❌ [$label]  $path — $msg" -ForegroundColor Red
    return $false
  }
}

function HitPost {
  param([string]$path, [string]$tok, [object]$body, [string]$label)
  try {
    $jsonBody = $body | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)
    Invoke-RestMethod -Uri "$ApiBase$path" -Method Post `
      -ContentType 'application/json; charset=utf-8' -Body $bytes `
      -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 90 | Out-Null
    Write-Host "  ✅ [$label]  POST $path" -ForegroundColor Green
    return $true
  } catch {
    $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    Write-Host "  ❌ [$label]  POST $path — $msg" -ForegroundColor Red
    return $false
  }
}

# ─── 開始 ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🔥 券問 AI Smoke Test"  -ForegroundColor Cyan
Write-Host "API base: $ApiBase"      -ForegroundColor DarkGray
Write-Host ""

# Login 3 個 demo 帳號
$aaTok = Login 'aa@aa.aa' 'aa'
$bbTok = Login 'bb@bb.bb' 'bb'
$ccTok = Login 'cc@cc.cc' 'cc'

# 抓 demo seed IDs
$sid        = '33333333-3333-3333-3333-333333333301'
$qid        = '44444444-4444-4444-4444-444444440104'
$pendingSid = '33333333-3333-3333-3333-333333333304'

$susp = Invoke-RestMethod -Uri "$ApiBase/admin/responses/suspicious" `
  -Headers @{ Authorization = "Bearer $ccTok" } -TimeoutSec 10
$wd = Invoke-RestMethod -Uri "$ApiBase/admin/withdrawals" `
  -Headers @{ Authorization = "Bearer $ccTok" } -TimeoutSec 10

Write-Host ""
Write-Host "Testing 10 AI endpoints (this takes ~3-5 min — each calls Z.ai GLM-5.1)..." -ForegroundColor Yellow
Write-Host ""

$results = @()
$results += HitGet  '/tasks/assistant'                                 $aaTok '1 受試者 AI 推薦'
$results += HitGet  '/surveys/assistant'                               $bbTok '2 surveyor AI 助手'
$results += HitGet  "/surveys/$sid/ai-improve"                         $bbTok '3 問卷優化建議'
$results += HitGet  "/surveys/$sid/ai-insights"                        $bbTok '4 填答洞察報告'
$results += HitGet  "/surveys/$sid/questions/$qid/sentiment"           $bbTok '5 開放題情緒分類'
$results += HitGet  '/admin/health-summary'                            $ccTok '6 平台健康摘要'
$results += HitGet  "/admin/surveys/$pendingSid/ai-review"             $ccTok '7 問卷審核諮詢'
if ($susp.Count -gt 0) {
  $results += HitGet "/admin/responses/$($susp[0].id)/ai-analysis"     $ccTok '8 可疑填答分析'
} else { Write-Host "  ⚠️  [8] 無可疑填答可測"  -ForegroundColor Yellow }
if ($wd.Count -gt 0) {
  $results += HitGet "/admin/withdrawals/$($wd[0].id)/ai-risk"         $ccTok '9 提領詐欺風險'
} else { Write-Host "  ⚠️  [9] 無提領申請可測"  -ForegroundColor Yellow }
$results += HitPost '/surveys/ai-draft' $bbTok @{ topic = 'Smoke test 主題'; questionCount = 5 } '10 AI 草稿生成'

$total = $results.Count
$passed = ($results | Where-Object { $_ -eq $true }).Count

Write-Host ""
Write-Host "─────────────────────────────────────"
if ($passed -eq $total) {
  Write-Host " ✅  Pass: $passed / $total " -ForegroundColor Green
  exit 0
} else {
  Write-Host " ❌  Pass: $passed / $total " -ForegroundColor Red
  exit 1
}
