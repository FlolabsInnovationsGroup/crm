#!/usr/bin/env bash
# Rebuilds the server for the local seed-data run on Windows, without Nx.
# src/constants/assets-path.ts checks __dirname for '/dist/', which a Windows path never has,
# so the running code looks for assets in dist/ instead of dist/assets/. Existing CRM code
# stays as it is; this only copies the assets inside the local build output.
set -e
cd "D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool/packages/twenty-server"
npx rimraf dist
npx nest build --path ./tsconfig.build.json 2>&1 | tail -3
mkdir -p dist/assets/twenty-client-sdk
cp ../twenty-client-sdk/package.json dist/assets/twenty-client-sdk/
cp -r ../twenty-client-sdk/dist dist/assets/twenty-client-sdk/dist
cp -r dist/assets/. dist/
echo "Built: $(ls dist | wc -l) entries"
