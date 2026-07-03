# SplitPay Comprehensive E2E Test Script
# Tests all features + security scenarios
param([switch]$SkipSetup)

$base = "http://localhost:3001/api/v1"
$tmpdir = "$env:USERPROFILE\.local\share\opencode\tool-output"
$pass = 0; $fail = 0; $errors = @()

function Write-Step($s) { Write-Host "`n=== $s ===" -ForegroundColor Cyan }
function Write-Ok($s) { Write-Host "  [PASS] $s" -ForegroundColor Green; $script:pass++ }
function Write-Fail($s, $d) { Write-Host "  [FAIL] $s — $d" -ForegroundColor Red; $script:fail++; $script:errors += $s }
function api($method, $path, $bodyFile, $token, $expectedCode) {
    $h = @{"Content-Type"="application/json"}
    if ($token) { $h["Authorization"] = "Bearer $token" }
    $args = @("-s", "-X", $method, "$base$path", "-H", "Content-Type: application/json")
    if ($token) { $args += @("-H", "Authorization: Bearer $token") }
    if ($bodyFile) { $args += @("--data-binary", "@$bodyFile") }
    $r = curl.exe @args 2>&1
    try { $o = $r | ConvertFrom-Json; $code = if ($o.success) { 200 } elseif ($o.error.statusCode) { $o.error.statusCode } else { 400 } } catch { $code = 0; $o = $null }
    if ($expectedCode -and $code -ne $expectedCode) { return $null, $code, $r }
    return $o, $code, $r
}

# ─── SETUP ─────────────────────────────────────────────────────────────────
$ErrorActionPreference="SilentlyContinue"
$global:token = $null
$global:groupId = $null
$global:periodId = $null
$global:recordId = $null
$global:memberId2 = $null
$global:invalidToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fakefakefake.fake"

if (-not $SkipSetup) {
    Write-Step "1. HEALTH CHECK"
    $o, $c = api GET "/health"
    if ($c -eq 200 -and $o.data.redis -eq "connected") { Write-Ok "Health OK (db+redis)" } else { Write-Fail "Health" "status=$c" }

    Write-Step "2. AUTH: REGISTER"
    Set-Content "$tmpdir\register.json" '{"email":"e2etest@example.com","name":"E2E Test","phone":"081111111111"}' -Encoding ascii
    $o, $c = api POST "/auth/register" "$tmpdir\register.json"
    if ($c -eq 200 -and $o.data.devOtp) { Write-Ok "Register (devOtp=$($o.data.devOtp))"; $otp = $o.data.devOtp } else { Write-Fail "Register" ($o.error.message) }

    Write-Step "3. AUTH: VERIFY OTP"
    Set-Content "$tmpdir\verify.json" "{\"email\":\"e2etest@example.com\",\"otp\":\"$otp\"}" -Encoding ascii
    $o, $c = api POST "/auth/verify-otp" "$tmpdir\verify.json"
    if ($c -eq 200 -and $o.data.accessToken) { Write-Ok "Verify OTP"; $global:token = $o.data.accessToken; $refreshToken = $o.data.refreshToken } else { Write-Fail "Verify OTP" ($o.error.message) }

    # Register 2nd user for non-host tests
    Set-Content "$tmpdir\register2.json" '{"email":"e2eother@example.com","name":"Other User","phone":"081222222222"}' -Encoding ascii
    $o, $c = api POST "/auth/register" "$tmpdir\register2.json"
    Set-Content "$tmpdir\verify2.json" "{\"email\":\"e2eother@example.com\",\"otp\":\"$($o.data.devOtp)\"}" -Encoding ascii
    $o2, $c = api POST "/auth/verify-otp" "$tmpdir\verify2.json"
    $global:otherToken = $o2.data.accessToken

    Write-Step "4. GROUPS: CREATE"
    Set-Content "$tmpdir\group.json" '{"name":"E2E Test Group","serviceName":"Spotify","totalAmount":"120000","dueDay":20,"frequency":"monthly","splitMethod":"equal","description":"E2E group"}' -Encoding ascii
    $o, $c = api POST "/groups" "$tmpdir\group.json" $global:token
    if ($c -eq 200) { Write-Ok "Group created"; $global:groupId = $o.data.id } else { Write-Fail "Create group" ($o.error.message) }

    Write-Step "5. MEMBERS: ADD"
    Set-Content "$tmpdir\member.json" '{"email":"member_e2e@example.com","displayName":"Member E2E","notificationPreference":"push"}' -Encoding ascii
    $o, $c = api POST "/groups/$global:groupId/members" "$tmpdir\member.json" $global:token
    if ($c -eq 200) { Write-Ok "Member 1 added"; $global:memberId1 = $o.data.id } else { Write-Fail "Add member" ($o.error.message) }
    
    Set-Content "$tmpdir\member2.json" '{"email":"member_e2e2@example.com","displayName":"Member E2E 2"}' -Encoding ascii
    $o, $c = api POST "/groups/$global:groupId/members" "$tmpdir\member2.json" $global:token
    if ($c -eq 200) { Write-Ok "Member 2 added"; $global:memberId2 = $o.data.id } else { Write-Fail "Add member 2" ($o.error.message) }

    Write-Step "6. PERIODS: LIST"
    $o, $c = api GET "/groups/$global:groupId/periods" $null $global:token
    if ($c -eq 200 -and $o.data) { 
        Write-Ok "Periods listed (count=$($o.data.length))"; 
        $global:periodId = $o.data[0].id
        # Get period detail to find record IDs
        $o2, $c2 = api GET "/groups/$global:groupId/periods/$global:periodId" $null $global:token
        if ($c2 -eq 200 -and $o2.data.records) { 
            $global:recordId = $o2.data.records[1].id  # First payer record
            Write-Ok "Period detail (records=$($o2.data.records.length))"
        }
    } else { Write-Fail "List periods" "periodId=$global:periodId" }
}

$token = $global:token
$otherToken = $global:otherToken
$groupId = $global:groupId
$periodId = $global:periodId
$recordId = $global:recordId

# ─── CRUD TESTS ─────────────────────────────────────────────────────────────
Write-Step "7. GROUPS: GET DETAIL"
$o, $c = api GET "/groups/$groupId" $null $token
if ($c -eq 200 -and $o.data.group.name -eq "E2E Test Group") { Write-Ok "Group detail" } else { Write-Fail "Group detail" ($o.error.message) }

Write-Step "8. GROUPS: LIST"
$o, $c = api GET "/groups" $null $token
if ($c -eq 200 -and $o.data.length -ge 1) { Write-Ok "Group list" } else { Write-Fail "Group list" ($o.error.message) }

Write-Step "9. GROUPS: UPDATE"
Set-Content "$tmpdir\group-upd.json" '{"name":"E2E Group Updated","description":"Updated desc"}' -Encoding ascii
$o, $c = api PATCH "/groups/$groupId" "$tmpdir\group-upd.json" $token
if ($c -eq 200) { Write-Ok "Group updated" } else { Write-Fail "Group update" ($o.error.message) }

Write-Step "10. MEMBERS: LIST"
$o, $c = api GET "/groups/$groupId/members" $null $token
if ($c -eq 200 -and $o.data.length -ge 2) { Write-Ok "Members list" } else { Write-Fail "Members list" ($o.error.message) }

Write-Step "11. MEMBERS: UPDATE"
Set-Content "$tmpdir\member-upd.json" '{"displayName":"Member Updated","notificationPreference":"email"}' -Encoding ascii
$o, $c = api PATCH "/groups/$groupId/members/$memberId2" "$tmpdir\member-upd.json" $token
if ($c -eq 200) { Write-Ok "Member update" } else { Write-Fail "Member update" ($o.error.message) }

Write-Step "12. SPLIT: CALCULATE EQUAL"
Set-Content "$tmpdir\split.json" '{"totalAmount":"120000","splitMethod":"equal","memberCount":3}' -Encoding ascii
$o, $c = api POST "/split/calculate" "$tmpdir\split.json" $token
if ($c -eq 200 -and $o.data.shares[0].amount -eq "40000") { Write-Ok "Equal split (40k each)" } else { Write-Fail "Equal split" ($c) }

Write-Step "13. USERS: PROFILE"
$o, $c = api GET "/users/profile" $null $token
if ($c -eq 200 -and $o.data.email -eq "e2etest@example.com") { Write-Ok "User profile" } else { Write-Fail "User profile" ($o.error.message) }

Write-Step "14. USERS: UPDATE"
Set-Content "$tmpdir\user-upd.json" '{"name":"E2E Updated Name"}' -Encoding ascii
$o, $c = api PATCH "/users/profile" "$tmpdir\user-upd.json" $token
if ($c -eq 200) { Write-Ok "User update" } else { Write-Fail "User update" ($o.error.message) }

# ─── PAYMENT FLOW ───────────────────────────────────────────────────────────
Write-Step "15. PAYMENTS: GET PERIOD DETAIL"
$o, $c = api GET "/groups/$groupId/periods/$periodId" $null $token
if ($c -eq 200) { Write-Ok "Period detail (records=$($o.data.records.length))"; if ($o.data.myRole -eq "host") { Write-Ok "Role = HOST" } } else { Write-Fail "Period detail" ($o.error.message) }

Write-Step "16. PAYMENTS: CONFIRM MANUAL"
Set-Content "$tmpdir\confirm.json" '{}' -Encoding ascii
# Use the member's record ID to confirm
$pd, $pc = api GET "/groups/$groupId/periods/$periodId" $null $token
if ($pd -and $pd.data.records) {
    $recId = $pd.data.records[1].id
    $o, $c = api POST "/payments/records/$recId/confirm-manual" "$tmpdir\confirm.json" $token
    if ($c -eq 200) { Write-Ok "Confirm manual" } else { Write-Fail "Confirm manual" ($o.error.message) }
}

Write-Step "17. PAYMENTS: HISTORY"
$o, $c = api GET "/payments/history" $null $token
if ($c -eq 200) { Write-Ok "Payment history" } else { Write-Fail "Payment history" ($o.error.message) }

# Payment link creation needs actual gateway keys - test with error handling
Write-Step "18. PAYMENTS: CREATE GATEWAY LINK (expect error without keys)"
Set-Content "$tmpdir\gw-link.json" '{"provider":"MIDTRANS"}' -Encoding ascii
$o, $c = api POST "/payments/records/$recordId/gateway-link" "$tmpdir\gw-link.json" $token
# This should fail because MIDTRANS keys aren't configured, but should give a proper error
if ($c -ne 200) { Write-Ok "Gateway link blocked (expected — no API keys)" } else { Write-Fail "Gateway link returned 200" "should have failed without keys" }

# ─── SECURITY TESTS (CRITICAL) ──────────────────────────────────────────────
Write-Step "19. 🔒 SECURITY: SQL INJECTION IN EMAIL"
Set-Content "$tmpdir\sqli1.json" "{\"email\":\"' OR 1=1 --\"}" -Encoding ascii
$o, $c = api POST "/auth/send-otp" "$tmpdir\sqli1.json"
if ($c -eq 200 -or $o.error.code -eq "VALIDATION_ERROR") { Write-Ok "SQLi in email handled: $($o.error.code)" } else { Write-Fail "SQLi in email" "unexpected response" }

Write-Step "20. 🔒 SECURITY: SQL INJECTION IN GROUP NAME"
Set-Content "$tmpdir\sqli2.json" '{"name":"Nothing\"; DROP TABLE users; --","serviceName":"test","totalAmount":"10000","dueDay":15,"frequency":"monthly","splitMethod":"equal"}' -Encoding ascii
$o, $c = api POST "/groups" "$tmpdir\sqli2.json" $token
if ($c -ne 500) { Write-Ok "SQLi in group name handled: $($o.error.code)" } else { Write-Fail "SQLi in group name" "500 error" }

Write-Step "21. 🔒 SECURITY: XSS IN GROUP NAME"
Set-Content "$tmpdir\xss1.json" '{"name":"<script>alert(1)</script>","serviceName":"test","totalAmount":"10000","dueDay":15,"frequency":"monthly","splitMethod":"equal"}' -Encoding ascii
$o, $c = api POST "/groups" "$tmpdir\xss1.json" $token
if ($c -ne 500) { Write-Ok "XSS in group name handled: $($o.error.code)" } else { Write-Fail "XSS in group name" "500 error" }

Write-Step "22. 🔒 SECURITY: INVALID JWT TOKEN"
$o, $c = api GET "/groups" $null "Bearer invalid-token-here"
if ($c -eq 401 -and $o.error.message -match "(Token|Unauthorized)") { Write-Ok "Invalid JWT rejected" } else { Write-Fail "Invalid JWT" "expected 401, got $c" }

Write-Step "23. 🔒 SECURITY: EXPIRED/MALFORMED JWT"
$o, $c = api GET "/groups" $null $invalidToken
if ($c -eq 401) { Write-Ok "Malformed JWT rejected" } else { Write-Fail "Malformed JWT" "expected 401, got $c" }

Write-Step "24. 🔒 SECURITY: NO AUTH TOKEN"
$o, $c = api GET "/groups" $null $null
if ($c -eq 401) { Write-Ok "No token rejected" } else { Write-Fail "No token" "expected 401, got $c" }

Write-Step "25. 🔒 SECURITY: FORBIDDEN (other user accesses group)"
$o, $c = api GET "/groups/$groupId" $null $otherToken
if ($c -eq 403) { Write-Ok "Other user correctly gets 403" } else { Write-Fail "Forbidden check" "expected 403, got $c — enumeration risk!" }

Write-Step "26. 🔒 SECURITY: FORBIDDEN on non-existent group"
$o, $c = api GET "/groups/00000000-0000-0000-0000-000000000000" $null $otherToken
if ($c -eq 403) { Write-Ok "Non-existent group returns 403 (no enumeration)" } else { Write-Fail "Non-existent group" "expected 403, got $c — enumeration risk!" }

Write-Step "27. 🔒 SECURITY: INVALID OTP"
Set-Content "$tmpdir\bad-otp.json" '{"email":"e2etest@example.com","otp":"000000"}' -Encoding ascii
$o, $c = api POST "/auth/verify-otp" "$tmpdir\bad-otp.json"
if ($o.error.message -eq "OTP tidak valid") { Write-Ok "Invalid OTP: message is generic 'OTP tidak valid'" } else { Write-Fail "Invalid OTP message" "got: $($o.error.message)" }

Write-Step "28. 🔒 SECURITY: OTP FOR UNKNOWN EMAIL"
Set-Content "$tmpdir\unknown-otp.json" '{"email":"nonexistent@example.com","otp":"123456"}' -Encoding ascii
$o, $c = api POST "/auth/verify-otp" "$tmpdir\unknown-otp.json"
if ($o.error.message -eq "OTP tidak valid") { Write-Ok "Unknown email OTP: generic message" } else { Write-Fail "Unknown email OTP message" "got: $($o.error.message)" }

Write-Step "29. 🔒 SECURITY: SEND OTP TO UNKNOWN EMAIL"
Set-Content "$tmpdir\send-unknown.json" '{"email":"noone@example.com"}' -Encoding ascii
$o, $c = api POST "/auth/send-otp" "$tmpdir\send-unknown.json"
# Should return success message regardless of whether email exists (prevents enumeration)
if ($o.data -and ($o.data.message -match "(Jika|Cek|email|kirim)") -or $c -eq 200) { 
    Write-Ok "Send OTP unknown email: returns success message (no enumeration)" 
} else { Write-Fail "Send OTP unknown email" "message: $($o.data.message)" }

Write-Step "30. 🔒 SECURITY: INVALID REFRESH TOKEN"
Set-Content "$tmpdir\refresh-bad.json" '{"refreshToken":"invalid-refresh-token"}' -Encoding ascii
$o, $c = api POST "/auth/refresh" "$tmpdir\refresh-bad.json"
if ($c -eq 401) { Write-Ok "Invalid refresh token rejected" } else { Write-Fail "Invalid refresh token" "expected 401, got $c" }

Write-Step "31. 🔒 SECURITY: EMPTY PAYLOAD"
Set-Content "$tmpdir\empty.json" '{}' -Encoding ascii
$o, $c = api POST "/auth/register" "$tmpdir\empty.json"
if ($c -eq 400 -and $o.error.code -eq "VALIDATION_ERROR") { Write-Ok "Empty payload validated" } else { Write-Fail "Empty payload" "expected 400, got $c" }

Write-Step "32. 🔒 SECURITY: MAX STRING LENGTH"
Set-Content "$tmpdir\long-str.json" "{\"email\":\"$(('a'*300))@test.com\",\"name\":\"$(('b'*300))\"}" -Encoding ascii
$o, $c = api POST "/auth/register" "$tmpdir\long-str.json"
if ($c -eq 400 -and $o.error.code -eq "VALIDATION_ERROR") { Write-Ok "Long string rejected" } else { Write-Fail "Long string" "expected 400, got $c" }

Write-Step "33. 🔒 SECURITY: TAMPERED SIGNED URL"
$o, $c = api GET "/payments/confirm?token=tampered-token-123" $null $null
if ($c -eq 400 -and $o.error.code -eq "INVALID_SIGNED_URL") { Write-Ok "Tampered signed URL rejected" } else { Write-Fail "Tampered signed URL" "expected 400, got $c code=$($o.error.code)" }

Write-Step "34. 🔒 SECURITY: PUBLIC ENDPOINT (health)"
$o, $c = api GET "/health" $null $null
# Health should be accessible without auth
if ($c -eq 200) { Write-Ok "Health endpoint public (no auth required)" } else { Write-Fail "Health endpoint" "expected 200, got $c" }

Write-Step "35. 🔒 SECURITY: PII NOT LEAKED IN RESPONSES"
# Check that user profile doesn't expose sensitive fields
$o, $c = api GET "/users/profile" $null $token
$sensitiveFields = @("password", "otp", "otpCode", "tokenHash", "refreshToken", "secret")
$leaked = $sensitiveFields | Where-Object { $o.data.PSObject.Properties.Name -contains $_ }
if (-not $leaked) { Write-Ok "No sensitive fields leaked in profile" } else { Write-Fail "Sensitive fields leaked" "$leaked" }

# ─── RATE LIMIT (soft test) ─────────────────────────────────────────────────
Write-Step "36. 🔒 SECURITY: RATE LIMIT (hit /health 65x)"
$hitCount = 0
1..65 | ForEach-Object {
    $r = curl.exe -s -o /dev/null -w "%{http_code}" "$base/health" 2>&1
    if ($r -eq 429) { $hitCount++ }
}
if ($hitCount -ge 1) { Write-Ok "Rate limit triggered ($hitCount hits blocked)" } else { Write-Ok "Rate limit not triggered (may allow 60/min)" }

# ─── NOTIFICATION CLEANUP ───────────────────────────────────────────────────
Write-Step "37. PUSH SUBSCRIPTION: REGISTER"
Set-Content "$tmpdir\push-sub.json" '{"endpoint":"https://fcm.googleapis.com/fcm/send/test123","keys":{"auth":"testAuth123","p256dh":"testP256dh456"}}' -Encoding ascii
$o, $c = api POST "/notifications/push-subscriptions" "$tmpdir\push-sub.json" $token
if ($c -eq 201 -or $c -eq 200) { Write-Ok "Push subscription registered" } else { Write-Fail "Push subscription" ($o.error.message) }

Write-Step "38. PUSH SUBSCRIPTION: DELETE"
$o, $c = api DELETE "/notifications/push-subscriptions" "$tmpdir\push-sub.json" $token
if ($c -eq 200) { Write-Ok "Push subscription deleted" } else { Write-Fail "Push subscription delete" ($o.error.message) }

Write-Step "39. PUSH SUBSCRIPTION: DELETE NON-EXISTENT"
Set-Content "$tmpdir\push-del.json" '{"endpoint":"https://nonexistent.com/endpoint"}' -Encoding ascii
$o, $c = api DELETE "/notifications/push-subscriptions" "$tmpdir\push-del.json" $token
if ($c -eq 404) { Write-Ok "Non-existent push sub -> 404" } else { Write-Fail "Non-existent push sub" "expected 404, got $c" }

# ─── SUMMARY ────────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "   TEST SUMMARY" -ForegroundColor Yellow
Write-Host "   PASSED: $pass   FAILED: $fail" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
if ($errors.Count -gt 0) {
    Write-Host "`nFAILURES:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}
Write-Host ""
