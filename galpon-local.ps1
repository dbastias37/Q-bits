# Local launcher for the downloaded game. The CMD runs this block on stdin
# using Windows PowerShell 5.1 without changing its execution policy.
& {
    $ErrorActionPreference = 'Stop'
    $port = 18761
    $address = "http://127.0.0.1:$port"
    $mime = @{
        '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'
        '.js'='text/javascript; charset=utf-8'; '.json'='application/json'
        '.svg'='image/svg+xml'; '.ttf'='font/ttf'; '.wav'='audio/wav'; '.mp3'='audio/mpeg'
    }

    # Build a table of public files. Request paths never enter filesystem APIs.
    $routes = @{}
    function Register-Assets([IO.DirectoryInfo] $directory, [string] $prefix) {
        if ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) { return }
        foreach ($entry in $directory.GetFileSystemInfos()) {
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
            $name = "$prefix/$($entry.Name)"
            if ($entry -is [IO.DirectoryInfo]) { Register-Assets $entry $name }
            elseif ($mime.ContainsKey($entry.Extension)) { $routes[$name] = $entry }
        }
    }

    function Send-File($client) {
        $client.ReceiveTimeout = 1500
        $client.SendTimeout = 10000
        $stream = $client.GetStream()
        $buffer = New-Object byte[] 8192
        $used = 0
        $headers = ''
        while ($used -lt $buffer.Length -and !$headers.Contains("`r`n`r`n")) {
            $n = $stream.Read($buffer, $used, $buffer.Length - $used)
            if (!$n) { return }
            $used += $n
            $headers = [Text.Encoding]::ASCII.GetString($buffer, 0, $used)
        }
        $line = ($headers -split "`r`n", 2)[0]
        $status = '400 Bad Request'
        $contentType = 'text/plain'
        $size = 0
        $file = $null
        $method = ''
        if ($headers.Contains("`r`n`r`n") -and $headers -match "(?im)^Host: *127\.0\.0\.1:${port} *\r?$" -and
            $line -cmatch '^([A-Z]+) (/[^ ]*) HTTP/1\.[01]$') {
            $method = $Matches[1]
            $path = ($Matches[2] -split '\?', 2)[0]
            if ($method -notin @('GET','HEAD')) { $status = '405 Method Not Allowed' }
            elseif ($routes.ContainsKey($path)) {
                $file = $routes[$path]
                $contentType = $mime[$file.Extension]
                $size = $file.Length
                $status = '200 OK'
            } else { $status = '404 Not Found' }
        }
        $head = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $size`r`nAllow: GET, HEAD`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
        $bytes = [Text.Encoding]::ASCII.GetBytes($head)
        $stream.Write($bytes, 0, $bytes.Length)
        if ($file -and $method -eq 'GET') {
            $source = $file.OpenRead()
            try { $source.CopyTo($stream) } finally { $source.Dispose() }
        }
    }

    $listener = $null
    try {
        $index = Get-Item -LiteralPath './index.html'
        if ($index.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Falta el index.html original.' }
        $routes['/'] = $index
        $routes['/index.html'] = $index
        Register-Assets (Get-Item -LiteralPath './assets') '/assets'
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
        $listener.ExclusiveAddressUse = $true
        $listener.Start()
        Write-Host "Galpon de prueba: $address/#galpon"
        Write-Host 'Deja esta ventana abierta mientras juegas. Cierrala para detener el juego local.'
        Start-Process "$address/#galpon"
        while ($true) {
            $client = $listener.AcceptTcpClient()
            try { Send-File $client } catch [IO.IOException] { } finally { $client.Close() }
        }
    } catch {
        Write-Host "No se pudo iniciar el galpon. Extrae todo el ZIP, cierra cualquier instancia anterior y vuelve a abrir Abrir-galpon.cmd."
        Write-Host $_.Exception.Message
        exit 1
    } finally {
        if ($listener) { $listener.Stop() }
    }
}

# The blank line above terminates the command when reading standard input.
