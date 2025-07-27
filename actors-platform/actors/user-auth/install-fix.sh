#!/bin/bash

# Temporarily replace workspace:* with file paths
sed -i 's/"@actors-platform\/sdk": "workspace:\*"/"@actors-platform\/sdk": "file:..\/..\/packages\/actor-sdk"/' package.json

# Install dependencies - force to bypass cache
npm install --force

# Restore workspace:* after install
sed -i 's/"@actors-platform\/sdk": "file:..\/..\/packages\/actor-sdk"/"@actors-platform\/sdk": "workspace:*"/' package.json