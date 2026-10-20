$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force research/public-js | Out-Null
$referenceFiles = @(
    'js/app-controller.min.js', 'js/cut-list-service.min.js',
    'js/cutlist-configuration.min.js', 'js/dimension-processor.min.js',
    'js/csv-handler.min.js', 'js/configuration-properties.min.js',
    'panel-list/panel-list-service.min.js', 'js/labels/labels-en.js',
    'js/diagram-service.min.js', 'js/mouse-tracker.min.js', 'js/tiling-data.min.js',
    'js/stats-controller.min.js', 'js/pdf-generator.min.js', 'js/image-generator.min.js',
    'js/pdf-controller.min.js', 'project/project-controller.min.js', 'project/project-service.min.js',
    'panel-list/panel-list-controller.min.js', 'js/app-config.min.js', 'js/clo-utils.min.js', 'js/utils.min.js'
)
foreach ($referenceFile in $referenceFiles) {
    Invoke-WebRequest -Uri ('https://www.cutlistoptimizer.com/' + $referenceFile + '?v=1.12.1') -OutFile ('research/public-js/' + [IO.Path]::GetFileName($referenceFile))
}
npm.cmd exec --yes --package=rea-agents@6.7.0 -- rea analyze-javascript-application research/public-js --format json > research/rea-analysis.json
if ($LASTEXITCODE -ne 0) { throw 'REA analysis failed.' }
