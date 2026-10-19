import {build} from 'esbuild';
import {writeFile,mkdir} from 'node:fs/promises';
const dev=process.argv.includes('--dev');const origin=process.env.VITE_API_ORIGIN??(dev?'http://localhost:3000':null);
if(!origin)throw Error('Set VITE_API_ORIGIN to your Railway HTTPS origin, or use build:dev');
const url=new URL(origin);if(url.pathname!=='/'||url.search||url.hash||(!dev&&url.protocol!=='https:'))throw Error('Expected HTTPS API origin');
await mkdir('dist',{recursive:true});
for(const entry of ['content','background'])await build({entryPoints:[`src/${entry}.tsx`],bundle:true,outfile:`dist/${entry}.js`,format:entry==='background'?'esm':'iife',target:'chrome120',define:{'import.meta.env.VITE_API_ORIGIN':JSON.stringify(url.origin),'import.meta.env.DEV':'false'},loader:{'.css':'text'},minify:true});
const matches=['https://x.com/*','https://twitter.com/*',...(dev?['http://localhost:5173/*','http://127.0.0.1:5173/*']:[])];
await writeFile('dist/manifest.json',JSON.stringify({manifest_version:3,name:'X Nuke — Alpha Scanner',version:'0.1.0',description:'Evidence-based public X audience research. Explicit DEMO and LIVE modes.',permissions:['storage','activeTab'],host_permissions:[`${url.origin}/*`],background:{service_worker:'background.js',type:'module'},action:{default_popup:'popup.html'},options_page:'options.html',content_scripts:[{matches,js:['content.js'],run_at:'document_idle'}],content_security_policy:{extension_pages:"script-src 'self'; object-src 'self'"}},null,2));
