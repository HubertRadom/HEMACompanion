$data = $input | ConvertFrom-Json
$fp = $data.tool_input.file_path
if ($fp -and $fp -match '\.(ts|tsx|astro|js|jsx)$') {
    npx eslint $fp
}
