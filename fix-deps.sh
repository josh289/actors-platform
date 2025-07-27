#!/bin/bash

# Add testing dependencies to root package.json devDependencies
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.devDependencies = {
  ...pkg.devDependencies,
  '@testing-library/react': '^14.0.0',
  'happy-dom': '^12.0.0',
  'vitest': '^0.34.0'
};
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

# Install only the root dependencies
npm install --no-workspaces

echo "Dependencies installed!"