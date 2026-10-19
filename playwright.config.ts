import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',use:{headless:true},webServer:{command:'pnpm --filter @xn/extension dev',url:'http://127.0.0.1:5173',reuseExistingServer:true}});
