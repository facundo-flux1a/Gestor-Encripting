import puppeteer from 'puppeteer';
const B = 'http://localhost:9002';
const browser = await puppeteer.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle0' });
await page.locator('input[type=email]').fill('marta.ferrer@lumen-estudio.es');
await page.locator('input[type=password]').fill('TestGestor2026!');
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.locator('button[type=submit]').click()]);

for (const [ruta, needle] of [['/dashboard/auditoria','DESCUADRES'], ['/incidents','Pendientes de Revisión']]) {
  await page.goto(`${B}${ruta}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 14000));
  const info = await page.evaluate(`(() => {
    const objetivo = ${JSON.stringify('')} , n = ${JSON.stringify(needle)}.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
    const norm = (e) => (e.textContent||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
    const contiene = (e) => norm(e).includes(n);
    const cands = [...document.querySelectorAll('*')].filter(e => contiene(e) && ![...e.children].some(contiene));
    return cands.slice(0,5).map(e => {
      let marco = e;
      while (marco.parentElement && marco.getBoundingClientRect().width < 220) marco = marco.parentElement;
      const r0 = e.getBoundingClientRect(), r = marco.getBoundingClientRect();
      return { tag: e.tagName, texto: (e.textContent||'').trim().slice(0,30),
               elem: [Math.round(r0.x), Math.round(r0.y), Math.round(r0.width)],
               marco: marco.tagName + ' ' + [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',') };
    });
  })()`);
  console.log('\\n== ' + ruta + ' buscando "' + needle + '"');
  console.log(JSON.stringify(info, null, 1));
}
await browser.close();
