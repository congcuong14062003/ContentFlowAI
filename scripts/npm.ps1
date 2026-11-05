$NpmArguments = $args
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$portableNode = Join-Path $projectRoot '.local/runtime/node.exe'
$nodeExecutable = if (Test-Path -LiteralPath $portableNode) { $portableNode } else { (Get-Command node.exe).Source }
$version = & $nodeExecutable -p 'process.versions.node'
if ([version]$version -lt [version]'22.22.2' -or ([version]$version).Major -ne 22) { throw 'Use Node 22.22.2+ within 22.x (.node-version).' }
$npmCommand = (Get-Command npm.cmd).Source
$npmCli = Join-Path (Split-Path -Parent $npmCommand) 'node_modules/npm/bin/npm-cli.js'
$env:PATH = "$(Split-Path -Parent $nodeExecutable);$env:PATH"
& $nodeExecutable $npmCli @NpmArguments
exit $LASTEXITCODE
