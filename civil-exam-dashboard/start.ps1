param(
    [int]$Port = 8080,
    [switch]$Lan
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-LocalPort {
    param([int]$PortNumber)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $client.Connect("127.0.0.1", $PortNumber)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

$python = Get-Command python -ErrorAction Stop
while (Test-LocalPort -PortNumber $Port) {
    Write-Host "Port $Port is busy. Trying port $($Port + 1)." -ForegroundColor Yellow
    $Port += 1
}

$url = "http://127.0.0.1:$Port/"
$bindHost = if ($Lan) { "0.0.0.0" } else { "127.0.0.1" }

if ($Lan) {
    Write-Host "Civil Exam Dashboard mobile mode started." -ForegroundColor Green
    Write-Host "Open the URL shown below on your phone or tablet." -ForegroundColor Green
}
else {
    Write-Host "Civil Exam Dashboard started: $url" -ForegroundColor Green
}
Write-Host "Press Ctrl+C to stop the local server." -ForegroundColor DarkGray

Start-Process $url
& $python.Source (Join-Path $root "server.py") --host $bindHost --port $Port --directory $root
