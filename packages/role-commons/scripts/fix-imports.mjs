import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function exists(p) {
  try { statSync(p); return true; } catch { return false; }
}

function fixFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  const dir = dirname(filePath);
  const original = content;

  content = content.replace(/from\s+['"](\.[^'"]+)['"]/g, (match, importPath) => {
    if (importPath.endsWith('.js')) return match;
    const resolved = join(dir, importPath);
    if (exists(resolved) && statSync(resolved).isDirectory()) {
      return match.replace(importPath, importPath + '/index.js');
    }
    if (exists(resolved + '.js')) {
      return match.replace(importPath, importPath + '.js');
    }
    return match;
  });

  if (content !== original) {
    writeFileSync(filePath, content);
    console.log(`  Fixed: ${relative(distDir, filePath)}`);
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.name.endsWith('.js')) fixFile(fullPath);
  }
}

console.log('Fixing imports in dist/...');
walk(distDir);
console.log('Done.');
