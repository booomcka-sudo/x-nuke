import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
const root='apps/extension/dist/';const manifest=JSON.parse(await readFile(root+'manifest.json','utf8'));
assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['storage','activeTab']);assert.equal(manifest.host_permissions.length,1);assert(!manifest.host_permissions.includes('<all_urls>'));assert(!manifest.content_security_policy.extension_pages.includes('unsafe-eval'));
for(const file of ['background.js','content.js','options.html','popup.html','report.html'])await access(root+file);
const script=await readFile(root+'background.js','utf8');assert(!script.includes('X_API_BEARER_TOKEN'));assert(!script.includes('HELIUS_API_KEY'));console.log('Manifest MV3, permissions, entrypoints and secret checks passed');
