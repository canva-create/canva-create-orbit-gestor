# Script de Restauração - Orbit Gestor
# Este script restaura o projeto exatamente ao estado anterior às otimizações de banco de dados.

$ErrorActionPreference = "Stop"
$pontoRestauracao = "C:\Users\User\.gemini\antigravity\scratch\repo\backup_restore_point_pre_optimization"
$destino = "C:\Users\User\.gemini\antigravity\scratch\repo\canva-create-orbit-gestor-main"

if (-not (Test-Path $pontoRestauracao)) {
    Write-Error "Ponto de restauração não encontrado em: $pontoRestauracao"
    exit 1
}

Write-Host "Iniciando restauração do projeto..." -ForegroundColor Cyan
Copy-Item -Path "$pontoRestauracao\*" -Destination $destino -Recurse -Force
Write-Host "Projeto restaurado com sucesso para o estado original!" -ForegroundColor Green
