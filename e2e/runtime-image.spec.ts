import { expect,test,type Request } from '@playwright/test';
import packageInfo from '../package.json' with { type: 'json' };

test('Runtime-Image erlaubt Anmeldung und meldet den ausgelieferten Git-Stand',async({page})=>{
  const password=process.env.DESK_RUNTIME_TEST_PASSWORD;
  const commit=process.env.DESK_RUNTIME_TEST_COMMIT;
  const sourceUrl=process.env.DESK_RUNTIME_TEST_SOURCE_URL;
  if(!password || !commit) throw new Error('Runtime-Probe über bash scripts/check-runtime-image.sh starten.');

  const anonymous=await page.request.get('/api/v1/projects');
  expect(anonymous.status()).toBe(401);
  await page.goto('/');
  if(sourceUrl) await expect(page.getByRole('link',{name:'Desk-Quellcode',exact:true})).toHaveAttribute('href',sourceUrl);
  await page.getByLabel('E-Mail').fill('runtime@example.test');
  await page.getByLabel('Passwort').fill(password);
  const phases={
    'POST /api/v1/login':'Anmeldung',
    'GET /api/v1/me':'Kontoabfrage',
    'GET /api/v1/projects':'Projektliste',
  };
  const origin=new URL(page.url()).origin;
  const started=new Map<Request,string>();
  const status=new Map<string,number|null>();
  page.on('request',request=>{
    const url=new URL(request.url());
    if(url.origin!==origin) return;
    const phase=phases[`${request.method()} ${url.pathname}` as keyof typeof phases];
    if(!phase) return;
    started.set(request,phase);
    status.set(phase,null);
  });
  page.on('response',response=>{
    const phase=started.get(response.request());
    if(phase) status.set(phase,response.status());
  });

  try {
    await page.getByRole('button',{name:'Anmelden',exact:true}).click();
    await page.getByRole('heading',{name:'Übersicht',exact:true}).waitFor({state:'visible',timeout:5000});
  } catch(error) {
    const diagnosis=Object.values(phases).map(phase=>{
      const observed=status.get(phase);
      return `${phase}=${observed===undefined?'nicht gestartet':observed===null?'keine Antwort':`HTTP ${observed}`}`;
    });
    console.error(`Runtime-Anmeldung fehlgeschlagen. ${diagnosis.join(', ')}.`);
    throw error;
  }

  const projects=await page.request.get('/api/v1/projects');
  expect(projects.status()).toBe(200);
  expect(await projects.json()).toEqual([]);
  await page.getByRole('button',{name:'Mein Konto',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Desk-Version',exact:true})).toBeVisible();
  await expect(page.getByLabel('Version und Git-Commit')).toHaveValue(`Desk ${packageInfo.deskVersion} · Git-Commit ${commit}`);
  if(sourceUrl) await expect(page.getByRole('link',{name:'Desk-Quellcode',exact:true})).toHaveAttribute('href',sourceUrl);
});
