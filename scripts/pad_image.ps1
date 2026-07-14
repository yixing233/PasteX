try {
    Add-Type -AssemblyName System.Drawing
    $source = "e:\Code\PasteX\src-tauri\assets\PasteX.png"
    $dest = "e:\Code\PasteX\src-tauri\assets\PasteX_squared.png"
    
    if (-not (Test-Path $source)) {
        Write-Error "Source file not found: $source"
        exit 1
    }

    $img = [System.Drawing.Image]::FromFile($source)
    $w = $img.Width
    $h = $img.Height
    
    if ($w -eq $h) {
        Write-Host "Image is already square."
        $img.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
        $img.Dispose()
        exit 0
    }

    $max = [Math]::Max($w, $h)
    $square = New-Object System.Drawing.Bitmap($max, $max)
    $g = [System.Drawing.Graphics]::FromImage($square)
    
    # High quality settings
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $g.Clear([System.Drawing.Color]::Transparent)
    
    $x = [int](($max - $w) / 2)
    $y = [int](($max - $h) / 2)
    
    $g.DrawImage($img, $x, $y, $w, $h)
    $g.Flush()
    
    $square.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $img.Dispose()
    $square.Dispose()
    $g.Dispose()
    
    Write-Host "Squared image saved to $dest"
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
