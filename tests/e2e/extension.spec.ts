import {test,expect,chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {hashPassword} from '../../apps/api/src/auth.js';

test('installed MV3 extension: sign in, Quick Scan, Deep Scan and report through actual API and queue',async()=>{
 test.skip(process.env.RUN_EXTENSION_E2E!=='true','Requires running local API, worker, PostgreSQL and Redis');
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
 const email=randomUUID()+'@example.test';const password='extension-test-password-only';
 await pool.query('INSERT INTO users(email,password_hash) VALUES($1,$2)',[email,hashPassword(password)]);
 const extension=resolve('apps/extension/dist');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 try {
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const page=await context.newPage();await page.goto('chrome-extension://'+id+'/options.html');
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Signed in',exact:true})).toBeVisible();
  await page.route('http://localhost:5173/extensiontest',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><title>Local extension fixture</title></head><body><h1>Local profile</h1></body></html>'}));
  await page.goto('http://localhost:5173/extensiontest');await page.getByRole('button',{name:'Scan @extensiontest'}).click();
  await expect(page.getByText('n = 50',{exact:true})).toBeVisible({timeout:20000});
  await page.getByRole('button',{name:'Start Deep Scan',exact:true}).click();await expect(page.getByText('n = 300',{exact:true})).toBeVisible({timeout:20000});
  const nextPage=context.waitForEvent('page');await page.getByRole('button',{name:'View Full Report'}).click();const report=await nextPage;await expect(report.getByRole('heading',{name:'Public profile report'})).toBeVisible();await expect(report.getByText('n = 300',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close panel'}).click();await page.reload();await page.getByRole('button',{name:'Scan @extensiontest'}).click();await expect(page.getByText('n = 300',{exact:true})).toBeVisible();
  const requests=(await pool.query('SELECT count(*)::int AS count FROM scan_requests r JOIN users u ON u.id=r.user_id WHERE u.email=$1',[email])).rows[0].count;expect(requests).toBe(2);
 } finally {await context.close();await pool.end();}
});
