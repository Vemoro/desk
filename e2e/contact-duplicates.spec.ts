import { test, expect } from '@playwright/test';
import { signIn } from './session';

const existing=[
  ...Array.from({length:200},(_,index)=>({id:'sample-'+index,name:'Beispiel '+index,email:''})),
  {id:'name-only',name:'Mira Montage',email:'alt@example.test'},
  {id:'email-only',name:'Mira Service',email:'montage@example.test'},
  {id:'both',name:'Mira Montage',email:'montage@example.test'},
];

test('Dubletten aus allen geladenen Seiten anzeigen und bewusst einen Kontakt anlegen',async({page})=>{
  const posts:unknown[]=[];
  const contacts=[...existing];
  await page.route('**/api/v1/contacts?*',route=>{
    const offset=Number(new URL(route.request().url()).searchParams.get('offset'));
    return route.fulfill({json:contacts.slice(offset,offset+200)});
  });
  await page.route('**/api/v1/contacts',route=>{
    const input=route.request().postDataJSON();
    posts.push(input);
    const created={id:'created-'+posts.length,...input};
    contacts.push(created);
    return route.fulfill({status:201,json:created});
  });

  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
  await page.getByText('Kontakt anlegen',{exact:true}).click();
  const create=page.getByRole('group').filter({has:page.getByRole('button',{name:'Kontakt speichern',exact:true})}).first();
  const name=create.getByRole('textbox',{name:'Name',exact:true});
  const email=create.getByRole('textbox',{name:'E-Mail',exact:true});
  await name.fill('  MIRA Montage  ');
  await email.fill('  Montage@example.test  ');
  await create.getByRole('button',{name:'Kontakt speichern',exact:true}).click();
  const warning=page.getByRole('region',{name:'Mögliche Dubletten',exact:true});
  await expect(warning.getByRole('listitem')).toHaveCount(3);
  await expect(warning).toBeFocused();
  expect(posts).toHaveLength(0);

  await warning.getByRole('button',{name:'Mira Service · montage@example.test',exact:true}).click();
  await expect(page.getByRole('region',{name:'Mira Service',exact:true})).toBeFocused();
  const override=warning.getByRole('button',{name:'Trotzdem anlegen',exact:true});
  await override.click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Abbrechen',exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(override).toBeFocused();
  await expect(name).toHaveValue('  MIRA Montage  ');
  await expect(email).toHaveValue('  Montage@example.test  ');
  await expect(warning.getByRole('listitem')).toHaveCount(3);
  expect(posts).toHaveLength(0);

  await name.fill('Mira geänderte Eingabe');
  await expect(warning).toBeHidden();
  expect(posts).toHaveLength(0);
  await name.fill('  MIRA Montage  ');
  await create.getByRole('button',{name:'Kontakt speichern',exact:true}).click();
  await override.click();
  await dialog.getByRole('button',{name:'Kontakt anlegen',exact:true}).evaluate((button)=>{
    button.click();
    button.click();
  });
  await expect(dialog).toBeHidden();
  await expect(warning).toBeHidden();
  expect(posts).toEqual([{name:'MIRA Montage',email:'Montage@example.test',phone:'',notes:''}]);

  await name.fill('Kontakt ohne E-Mail');
  await email.clear();
  await create.getByRole('button',{name:'Kontakt speichern',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Kontakt ohne E-Mail',exact:true})).toBeVisible();
  expect(posts).toHaveLength(2);
  await expect(warning).toBeHidden();
});

test('Dieselbe Dublettenbestätigung bleibt nach einem Ansichtswechsel gesperrt',async({page})=>{
  let posts=0;
  const release=Promise.withResolvers<void>();
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:existing.slice(-3)}));
  await page.route('**/api/v1/contacts',async route=>{
    posts++;
    await release.promise;
    await route.fulfill({status:409,json:{error:'Kontakt konnte nicht gespeichert werden.'}});
  });
  async function openConfirmation() {
    await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
    await page.getByText('Kontakt anlegen',{exact:true}).click();
    await page.getByRole('textbox',{name:'Name',exact:true}).fill('Mira Montage');
    await page.getByRole('button',{name:'Kontakt speichern',exact:true}).click();
    await page.getByRole('button',{name:'Trotzdem anlegen',exact:true}).click();
    return page.getByRole('dialog',{name:'Neuen Kontakt anlegen'});
  }
  try {
    await signIn(page);
    const first=await openConfirmation();
    await first.getByRole('button',{name:'Kontakt anlegen',exact:true}).click();
    await expect.poll(()=>posts).toBe(1);
    await page.goBack();
    const reopened=await openConfirmation();
    await expect(reopened.getByRole('alert')).toHaveText('Diese Aktion läuft bereits.');
    await expect(reopened.getByRole('button',{name:'Kontakt anlegen',exact:true})).toBeDisabled();
    release.resolve();
    await expect(reopened.getByRole('alert')).toHaveText('Kontakt konnte nicht gespeichert werden.');
    await reopened.getByRole('button',{name:'Schließen',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Name',exact:true})).toHaveValue('Mira Montage');
    expect(posts).toBe(1);
  } finally {
    release.resolve();
  }
});
