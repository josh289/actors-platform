#!/bin/bash

# Temporarily replace workspace:* with file paths
sed -i 's/"@actors-platform\/sdk": "workspace:\*"/"@actors-platform\/sdk": "file:..\/..\/packages\/actor-sdk"/' actors/user-auth/package.json
sed -i 's/"@actors-platform\/sdk": "workspace:\*"/"@actors-platform\/sdk": "file:..\/..\/packages\/actor-sdk"/' apps/mcp-server/package.json
sed -i 's/"@actors-platform\/sdk": "workspace:\*"/"@actors-platform\/sdk": "file:..\/..\/packages\/actor-sdk"/' packages/relay-tools/package.json

# Run npm install
npm install

# Restore workspace:* references
sed -i 's/"@actors-platform\/sdk": "file:..\/..\/packages\/actor-sdk"/"@actors-platform\/sdk": "workspace:*"/' actors/user-auth/package.json
sed -i 's/"@actors-platform\/sdk": "file:..\/..\/packages\/actor-sdk"/"@actors-platform\/sdk": "workspace:*"/' apps/mcp-server/package.json
sed -i 's/"@actors-platform\/sdk": "file:..\/..\/packages\/actor-sdk"/"@actors-platform\/sdk": "workspace:*"/' packages/relay-tools/package.json

echo "Installation complete!"