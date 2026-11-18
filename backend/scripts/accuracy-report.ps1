param(
    [string]$ApiBase = "http://localhost:8080",
    [string]$SamplesRoot = "C:\Users\saruj\Downloads\samples-triscript\samples\letters"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Net.Http

$client = [System.Net.Http.HttpClient]::new()
$fieldNames = @(
    "subject",
    "myNumber",
    "yourNumber",
    "date",
    "language",
    "from",
    "to",
    "signedBy",
    "body"
)
$sampleIds = @("en-02", "ta-01", "si-02")

try {
    foreach ($sampleId in $sampleIds) {
        $imagePath = Join-Path (Join-Path $SamplesRoot $sampleId) "page-1.png"
        if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
            throw "Sample image not found: $imagePath"
        }

        $session = $client.PostAsync(
            "$ApiBase/api/sessions",
            [System.Net.Http.StringContent]::new("", [System.Text.Encoding]::UTF8, "application/json")
        ).GetAwaiter().GetResult()
        $null = $session.EnsureSuccessStatusCode()
        $sessionInfo = $session.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
        $sessionUri = [Uri]$sessionInfo.pairUrl
        $tokenMatch = [regex]::Match($sessionUri.Query, "(?:\?|&)t=([^&]+)")
        if (-not $tokenMatch.Success) {
            throw "Session response did not contain an upload token."
        }
        $token = [Uri]::UnescapeDataString($tokenMatch.Groups[1].Value)

        $eventsRequest = [System.Net.Http.HttpRequestMessage]::new(
            [System.Net.Http.HttpMethod]::Get,
            "$ApiBase/api/sessions/$($sessionInfo.id)/events"
        )
        $eventsTask = $client.SendAsync(
            $eventsRequest,
            [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
        )

        $form = [System.Net.Http.MultipartFormDataContent]::new()
        $imageContent = [System.Net.Http.ByteArrayContent]::new(
            [System.IO.File]::ReadAllBytes($imagePath)
        )
        $imageContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("image/png")
        $form.Add($imageContent, "photo", "page-1.png")
        $upload = $client.PostAsync(
            "$ApiBase/api/sessions/$($sessionInfo.id)/photo?t=$token",
            $form
        ).GetAwaiter().GetResult()
        $null = $upload.EnsureSuccessStatusCode()
        $eventsResponse = $eventsTask.GetAwaiter().GetResult()
        $null = $eventsResponse.EnsureSuccessStatusCode()
        $eventReader = [System.IO.StreamReader]::new(
            $eventsResponse.Content.ReadAsStreamAsync().GetAwaiter().GetResult(),
            [System.Text.Encoding]::UTF8
        )

        $result = $null
        while ($null -ne ($line = $eventReader.ReadLine())) {
            if ($line.StartsWith("data: ")) {
                $event = $line.Substring(6) | ConvertFrom-Json
                if ($event.type -eq "result") {
                    $result = $event.data
                    break
                }
                if ($event.type -eq "error" -or $event.type -eq "expired") {
                    throw "$sampleId OCR $($event.type): $($event.data)"
                }
            }
        }
        if ($null -eq $result) {
            throw "$sampleId event stream ended without an OCR result."
        }

        Write-Output "=== $sampleId ==="
        foreach ($fieldName in $fieldNames) {
            $field = $result.$fieldName
            Write-Output ("{0}: {1} (confidence: {2:N1}%)" -f $fieldName, $field.value, $field.confidence)
        }
        $eventReader.Dispose()
        $eventsResponse.Dispose()
        $eventsRequest.Dispose()
        $form.Dispose()
    }
}
finally {
    $client.Dispose()
}
