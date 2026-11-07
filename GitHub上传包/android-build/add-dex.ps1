param(
    [Parameter(Mandatory=$true)][string]$Apk,
    [Parameter(Mandatory=$true)][string]$Dex
)
# 将 classes.dex 追加进 APK（ZipArchive Update 模式，未触碰的条目字节保持原样，
# 确保 aapt2 产出的 STORED resources.arsc 不被重新压缩）
Add-Type -AssemblyName System.IO.Compression.FileSystem
$apk = [System.IO.Compression.ZipFile]::Open((Resolve-Path $Apk), 'Update')
try {
    $old = $apk.GetEntry('classes.dex')
    if ($old) { $old.Delete() }
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $apk, (Resolve-Path $Dex), 'classes.dex',
        [System.IO.Compression.CompressionLevel]::Optimal)
    Write-Output "classes.dex added"
} finally { $apk.Dispose() }
