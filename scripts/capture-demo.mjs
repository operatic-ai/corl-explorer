import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const frames=path.join(root,'.cache/readme-demo');fs.mkdirSync(frames,{recursive:true});
for(const file of fs.readdirSync(frames))if(/^frame-\d+\.png$/.test(file))fs.unlinkSync(path.join(frames,file));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,colorScheme:'light'});
 await page.goto(process.env.DEMO_URL||'http://127.0.0.1:5173/?year=2026');
 await page.locator('.paper-card').first().waitFor();
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.paper-image img')].map(img=>{img.loading='eager';return img.decode().catch(()=>{})}))});
 const columns=await page.locator('.paper-grid').evaluate(grid=>getComputedStyle(grid).gridTemplateColumns.split(' ').length);
 if(columns!==4)throw new Error(`Expected four paper columns, found ${columns}`);
 const count=64;
 for(let i=0;i<count;i++){
  const t=i/(count-1),progress=t*t*(3-2*t);
  await page.evaluate(y=>{scrollTo(0,y);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))},Math.round(progress*1250));
  await page.screenshot({path:path.join(frames,`frame-${String(i).padStart(3,'0')}.png`)});
 }
}finally{await browser.close()}
const python=fs.existsSync(path.join(root,'.venv/bin/python'))?path.join(root,'.venv/bin/python'):'python3';
execFileSync(python,[path.join(root,'scripts/make-demo-gif.py')],{cwd:root,stdio:'inherit'});
