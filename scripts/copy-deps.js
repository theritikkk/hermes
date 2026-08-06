#!/usr/bin/env node
/**
 * copy-deps.js — Vendor a Lambda's runtime dependency closure into its bundle.
 *
 * Why this exists: `@hermes/*` packages are internal npm workspace packages
 * that are never published to the npm registry. Running a plain
 * `npm install` inside a standalone bundle directory (see bundle-lambdas.sh)
 * 404s the moment it hits a `@hermes/*` dependency, and that failure was
 * being silently swallowed (`|| true`) — so every bundled Lambda zip has
 * been shipping with an EMPTY node_modules and would fail at runtime with
 * "Cannot find module" the moment it's invoked.
 *
 * Instead of hitting the registry, this walks the dependency graph starting
 * from the Lambda's package.json and copies each package's real, already-
 * resolved files straight out of the monorepo root's node_modules (where
 * `npm install` — run once at the repo root — already put everything,
 * including symlinks for @hermes/* workspace packages). Symlinks are
 * dereferenced (`cp -L`) so the zip contains real files, since Lambda can't
 * follow symlinks that point outside the deployment package.
 *
 * Usage: node copy-deps.js <path-to-lambda-package.json> <root-node_modules> <dest-node_modules>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [, , pkgJsonPath, rootNodeModules, destNodeModules] = process.argv;

if (!pkgJsonPath || !rootNodeModules || !destNodeModules) {
  console.error('Usage: copy-deps.js <lambda-package.json> <root-node_modules> <dest-node_modules>');
  process.exit(1);
}

fs.mkdirSync(destNodeModules, { recursive: true });

const visited = new Set();

function readPkgJson(dir) {
  const p = path.join(dir, 'package.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function copyPackage(name) {
  if (visited.has(name)) return;
  visited.add(name);

  const srcDir = path.join(rootNodeModules, name);
  if (!fs.existsSync(srcDir)) {
    console.warn(`  [copy-deps] WARNING: ${name} not found in root node_modules, skipping`);
    return;
  }

  const destDir = path.join(destNodeModules, name);
  fs.mkdirSync(path.dirname(destDir), { recursive: true }); // handles @scope/name

  // -L dereferences symlinks (the @hermes/* workspace packages) into real files
  execFileSync('cp', ['-RL', srcDir, destDir]);

  // Recurse into this package's own runtime dependencies so the closure is complete
  const pkg = readPkgJson(srcDir);
  if (pkg && pkg.dependencies) {
    for (const dep of Object.keys(pkg.dependencies)) {
      copyPackage(dep);
    }
  }
}

const rootPkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
const deps = Object.keys(rootPkg.dependencies || {});

if (deps.length === 0) {
  console.log('  [copy-deps] no runtime dependencies declared, nothing to vendor');
} else {
  console.log(`  [copy-deps] vendoring ${deps.length} top-level dependencies (+ transitive closure)`);
  for (const dep of deps) {
    copyPackage(dep);
  }
  console.log(`  [copy-deps] done: ${visited.size} packages copied into ${destNodeModules}`);
}
