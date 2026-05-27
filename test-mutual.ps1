$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api/v1"

function Login($email) {
  $body = @{ email = $email; password = "000" } | ConvertTo-Json
  (Invoke-RestMethod -Uri "$base/auth/login" -Method POST -Body $body -ContentType "application/json").token
}

function CreateMutualSurvey($t, $title) {
  $body = @{
    title       = $title
    description = "互惠測試問卷"
    type        = "mutual"
    questions = @(
      @{
        type      = "single_choice"
        title     = "你比較喜歡哪一個?"
        sortOrder = 0
        isRequired = $true
        options = @(
          @{ label = "A 選項"; sortOrder = 0 },
          @{ label = "B 選項"; sortOrder = 1 }
        )
      },
      @{
        type      = "text"
        title     = "為什麼?"
        sortOrder = 1
        isRequired = $false
      }
    )
  } | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Uri "$base/surveys" -Method POST -Headers @{Authorization="Bearer $t"} -Body $body -ContentType "application/json"
}

function PublishSurvey($t, $id) {
  Invoke-RestMethod -Uri "$base/surveys/$id/publish" -Method POST -Headers @{Authorization="Bearer $t"} -Body "{}" -ContentType "application/json"
}

function ListMutual($t) {
  Invoke-RestMethod -Uri "$base/mutual" -Method GET -Headers @{Authorization="Bearer $t"}
}

# ──────────────────────────────────────────────
Write-Host "=== Step 1: Login both users ===" -ForegroundColor Cyan
$t1 = Login "user1@quanwen.com"
$t2 = Login "user2@quanwen.com"
Write-Host "user1 / user2 logged in"

Write-Host "`n=== Step 2: Create mutual surveys ===" -ForegroundColor Cyan
$s1 = CreateMutualSurvey $t1 "user1 的互惠問卷 ($(Get-Date -Format HHmmss))"
Write-Host "user1 survey: $($s1.id) (type=$($s1.type))"
$s2 = CreateMutualSurvey $t2 "user2 的互惠問卷 ($(Get-Date -Format HHmmss))"
Write-Host "user2 survey: $($s2.id) (type=$($s2.type))"

Write-Host "`n=== Step 3: Publish ===" -ForegroundColor Cyan
$p1 = PublishSurvey $t1 $s1.id
Write-Host "user1 publish: $($p1.message)"
$p2 = PublishSurvey $t2 $s2.id
Write-Host "user2 publish: $($p2.message)"

Write-Host "`n=== Step 4: Both should see 'waiting' ===" -ForegroundColor Cyan
$m1 = ListMutual $t1
$m2 = ListMutual $t2
Write-Host "user1 sees $($m1.Count) pair(s), status: $($m1[0].status)"
Write-Host "user2 sees $($m2.Count) pair(s), status: $($m2[0].status)"

Write-Host "`n=== Step 5: Wait for matcher cron (max 35s) ===" -ForegroundColor Cyan
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Seconds 3
  $m1 = ListMutual $t1
  $st = if ($m1.Count -gt 0) { $m1[0].status } else { 'NONE' }
  Write-Host "  t+$($i * 3)s -> user1 status=$st"
  if ($st -eq 'matched') { break }
}

if ($m1[0].status -ne 'matched') {
  Write-Host "!!! Match did not happen in 36s. Check api logs." -ForegroundColor Red
  exit 1
}

Write-Host "`n=== Step 6: Both should be matched ===" -ForegroundColor Cyan
$m1 = ListMutual $t1
$m2 = ListMutual $t2
Write-Host "user1 pair: status=$($m1[0].status) other=$($m1[0].other.displayName) nextAction=$($m1[0].nextAction)"
Write-Host "user2 pair: status=$($m2[0].status) other=$($m2[0].other.displayName) nextAction=$($m2[0].nextAction)"

$pairId = $m1[0].id

Write-Host "`n=== Step 7: user1 fills user2's survey ===" -ForegroundColor Cyan
$detail1 = Invoke-RestMethod -Uri "$base/mutual/${pairId}" -Headers @{Authorization="Bearer $t1"}
$otherSurvey1 = $detail1.survey
$qs1 = $otherSurvey1.questions
$opt = $qs1[0].options[0]
$ansBody1 = @{
  answers = @(
    @{ questionId = $qs1[0].id; selectedOptionIds = @($opt.id) },
    @{ questionId = $qs1[1].id; textAnswer = "因為 A 比較順" }
  )
} | ConvertTo-Json -Depth 10
$r1 = Invoke-RestMethod -Uri "$base/mutual/${pairId}/submit" -Method POST -Headers @{Authorization="Bearer $t1"} -Body $ansBody1 -ContentType "application/json"
Write-Host "user1 submit: responseId=$($r1.responseId)"

Write-Host "`n=== Step 8: user2 fills user1's survey ===" -ForegroundColor Cyan
$detail2 = Invoke-RestMethod -Uri "$base/mutual/${pairId}" -Headers @{Authorization="Bearer $t2"}
$qs2 = $detail2.survey.questions
$ansBody2 = @{
  answers = @(
    @{ questionId = $qs2[0].id; selectedOptionIds = @($qs2[0].options[1].id) },
    @{ questionId = $qs2[1].id; textAnswer = "我選 B 因為他比較直接" }
  )
} | ConvertTo-Json -Depth 10
$r2 = Invoke-RestMethod -Uri "$base/mutual/${pairId}/submit" -Method POST -Headers @{Authorization="Bearer $t2"} -Body $ansBody2 -ContentType "application/json"
Write-Host "user2 submit: responseId=$($r2.responseId)"

Write-Host "`n=== Step 9: Final state ===" -ForegroundColor Cyan
$m1 = ListMutual $t1
Write-Host "user1: status=$($m1[0].status) nextAction=$($m1[0].nextAction)"
$m2 = ListMutual $t2
Write-Host "user2: status=$($m2[0].status) nextAction=$($m2[0].nextAction)"

if ($m1[0].status -eq 'both_done' -and $m2[0].status -eq 'both_done') {
  Write-Host "`n✅✅✅ Mutual flow end-to-end PASSED" -ForegroundColor Green
} else {
  Write-Host "`n❌ Final status not both_done" -ForegroundColor Red
}
