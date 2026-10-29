const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const templatePath = path.join(rootDir, 'public', 'index.template.html');
const outputPath = path.join(rootDir, 'public', 'index.html');
const publicDir = path.join(rootDir, 'public');

function assembleHtml() {
  if (!fs.existsSync(templatePath)) {
    console.warn('[assemble] index.template.html not found, skipping assembly.');
    return;
  }

  let template = fs.readFileSync(templatePath, 'utf8');
  const includeRegex = /<!--\s*include:\s*([^\s]+)\s*-->/g;

  template = template.replace(includeRegex, (match, relPath) => {
    const componentPath = path.join(publicDir, relPath);
    if (fs.existsSync(componentPath)) {
      let content = fs.readFileSync(componentPath, 'utf8');
      // Keep only code, or preserve block comments
      // Strip top header comment from component to avoid cluttering index.html
      content = content.replace(/^<!-- =+[\s\S]*?=+ -->\s*/, '');
      return content.trim();
    } else {
      console.warn(`[assemble] Component file not found: ${componentPath}`);
      return `<!-- Missing component: ${relPath} -->`;
    }
  });

  fs.writeFileSync(outputPath, template, 'utf8');
  console.log(`[assemble] Successfully assembled public/index.html from components (${template.split('\n').length} lines)`);
}

if (require.main === module) {
  assembleHtml();
}

module.exports = assembleHtml;

