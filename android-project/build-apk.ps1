$ErrorActionPreference = "Stop"

$sdkDir = "C:\Users\rodol\AppData\Local\Android\Sdk"
$buildToolsDir = "$sdkDir\build-tools\34.0.0"
$platformJar = "$sdkDir\platforms\android-34\android.jar"
$jdkBin = "$env:LOCALAPPDATA\Programs\jdk-17\bin"
$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\jdk-17"
$env:Path = "$jdkBin;$buildToolsDir;$env:Path"

$projDir = "c:\Users\rodol\OneDrive\Desktop\SISTEMAS\ANTIGRAVITY GOOGLE\ANTIGRAVITY PROJETOS\GESTOR NOW\android-project"
$outDir = "$projDir\build"
$distDir = "c:\Users\rodol\OneDrive\Desktop\SISTEMAS\ANTIGRAVITY GOOGLE\ANTIGRAVITY PROJETOS\GESTOR NOW"

Write-Host "=== 1. Limpando e preparando diretorios de build ==="
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Path "$outDir\compiled-res" -Force | Out-Null
New-Item -ItemType Directory -Path "$outDir\gen" -Force | Out-Null
New-Item -ItemType Directory -Path "$outDir\classes" -Force | Out-Null

$aapt2 = "$buildToolsDir\aapt2.exe"
$zipalign = "$buildToolsDir\zipalign.exe"
$apksigner = "$buildToolsDir\apksigner.bat"
$d8 = "$buildToolsDir\d8.bat"
$javac = "$jdkBin\javac.exe"
$keytool = "$jdkBin\keytool.exe"
$jar = "$jdkBin\jar.exe"

Write-Host "=== 2. Compilando recursos com AAPT2 ==="
& $aapt2 compile --dir "$projDir\res" -o "$outDir\compiled-res"
if ($LASTEXITCODE -ne 0) { throw "Falha no aapt2 compile" }

Write-Host "=== 3. Vinculando recursos e gerando R.java e APK base ==="
$compiledFiles = Get-ChildItem "$outDir\compiled-res\*.flat" | ForEach-Object { $_.FullName }
& $aapt2 link -I $platformJar `
    --manifest "$projDir\AndroidManifest.xml" `
    --java "$outDir\gen" `
    -o "$outDir\app-unsigned-unaligned.apk" `
    --auto-add-overlay `
    $compiledFiles
if ($LASTEXITCODE -ne 0) { throw "Falha no aapt2 link" }

Write-Host "=== 4. Compilando codigo Java com Javac ==="
$javaFiles = Get-ChildItem "$projDir\src\*.java", "$outDir\gen\*.java" -Recurse | ForEach-Object { $_.FullName }
& $javac -encoding UTF-8 -cp $platformJar -d "$outDir\classes" -source 1.8 -target 1.8 $javaFiles
if ($LASTEXITCODE -ne 0) { throw "Falha no javac" }

Write-Host "=== 5. Convertendo bytecode para DEX com D8 ==="
$classFiles = Get-ChildItem "$outDir\classes\*.class" -Recurse | ForEach-Object { $_.FullName }
& $d8 --release --min-api 21 --output "$outDir" --lib $platformJar $classFiles
if ($LASTEXITCODE -ne 0) { throw "Falha no d8" }

Write-Host "=== 6. Inserindo classes.dex no pacote APK ==="
Push-Location $outDir
try {
    & $jar -uf "$outDir\app-unsigned-unaligned.apk" classes.dex
    if ($LASTEXITCODE -ne 0) { throw "Falha ao adicionar classes.dex ao APK" }
} finally {
    Pop-Location
}

Write-Host "=== 7. Otimizando APK com zipalign ==="
$alignedApk = "$outDir\app-unaligned-aligned.apk"
& $zipalign -p -f -v 4 "$outDir\app-unsigned-unaligned.apk" $alignedApk
if ($LASTEXITCODE -ne 0) { throw "Falha no zipalign" }

Write-Host "=== 8. Gerando chave de assinatura (keystore) ==="
$keystore = "$projDir\rodolfo-release.keystore"
if (!(Test-Path $keystore)) {
    & $keytool -genkeypair -v -keystore $keystore -alias rodolfotv `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass "rodolfo123" -keypass "rodolfo123" `
        -dname "CN=Rodolfo TV, OU=Gestor, O=RodolfoTV, L=Sao Paulo, ST=SP, C=BR"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao gerar keystore" }
}

Write-Host "=== 9. Assinando APK com apksigner (v1, v2, v3) ==="
$finalApk = "$distDir\RodolfoTV-Gestor.apk"
if (Test-Path $finalApk) { Remove-Item $finalApk -Force }
& $apksigner sign --ks $keystore `
    --ks-key-alias rodolfotv `
    --ks-pass pass:rodolfo123 `
    --key-pass pass:rodolfo123 `
    --out $finalApk `
    $alignedApk
if ($LASTEXITCODE -ne 0) { throw "Falha ao assinar APK com apksigner" }

Write-Host "=== 10. Verificando assinatura do APK ==="
& $apksigner verify --verbose $finalApk

$apkInfo = Get-Item $finalApk
Write-Host "=========================================="
Write-Host "SUCESSO! APK GERADO COM EXITO:"
Write-Host "Arquivo: $($apkInfo.FullName)"
Write-Host "Tamanho: $([math]::Round($apkInfo.Length / 1KB, 2)) KB"
Write-Host "=========================================="
