const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const buildDir = path.join(rootDir, '.vsix-build');

if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(buildDir, { recursive: true });

const contentTypes = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="txt" ContentType="text/plain" />
  <Default Extension="md" ContentType="text/markdown" />
</Types>`;
fs.writeFileSync(path.join(buildDir, '[Content_Types].xml'), contentTypes);

const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Id="ai-timesheet-editor" Version="1.0.0" Publisher="antigravity" />
    <DisplayName>AI Timesheet Editor</DisplayName>
    <Description xml:space="preserve">Automates daily timesheet generation from Git diffs using Gemini AI.</Description>
    <Tags>Other</Tags>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
  </Assets>
</PackageManifest>`;
fs.writeFileSync(path.join(buildDir, 'extension.vsixmanifest'), manifest);

const extDir = path.join(buildDir, 'extension');
fs.mkdirSync(extDir, { recursive: true });
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(extDir, 'package.json'));

if (fs.existsSync(path.join(rootDir, 'README.md'))) {
  fs.copyFileSync(path.join(rootDir, 'README.md'), path.join(extDir, 'README.md'));
}

const copyRecursive = (src, dest) => {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
};
copyRecursive(path.join(rootDir, 'out'), path.join(extDir, 'out'));

const vsixPath = path.join(rootDir, 'ai-timesheet-editor-1.0.0.vsix');
if (fs.existsSync(vsixPath)) fs.unlinkSync(vsixPath);

execSync(`cd "${buildDir}" && zip -r "${vsixPath}" ./*`, { stdio: 'inherit' });
fs.rmSync(buildDir, { recursive: true, force: true });
console.log('\n✅ VSIX Package generated successfully:', vsixPath);
console.log('📦 You can copy and share this .vsix file to install on any other computer/system!\n');
