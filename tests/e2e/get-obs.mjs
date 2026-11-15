import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const pass = fs.readFileSync(process.env.PASSCODE_FILE,'utf8').trim();
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
const p = await b.newPage();
await p.goto(process.env.BASE_URL+'/',{waitUntil:'domcontentloaded'});
if (await p.$('input[name=passcode]')) { await p.type('input[name=passcode]',pass); await Promise.all([p.waitForNavigation(),p.keyboard.press('Enter')]); }
const path=process.argv[2];
const r=await p.evaluate(async(u)=>{const x=await fetch(u);return {s:x.status,t:await x.text()}},path);
fs.writeFileSync(process.argv[3],r.t); console.log(r.s,r.t.length);
await b.close();
