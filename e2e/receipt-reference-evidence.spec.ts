import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { signIn } from './session';

const output=process.env.DESK_RECEIPT_IMAGES ?? 'build/screenshots';
for (const [device,width,height] of [['desktop',1440,950],['smartphone',375,812]] as const) {
  for (const theme of ['hell','dunkel']) {
    test(`Wareneingang und Lieferschein · ${device} · ${theme}`,async({page})=>{
      await page.setViewportSize({width,height});
      await page.route('**/api/v1/movements?*',async(route)=>{
        const response=await route.fetch();
        const [movement]=await response.json();
        if(!movement) throw new Error('Eine Demo-Warenbewegung fehlt.');
        await route.fulfill({json:[
          {...movement,action:'receive',quantity:3,delivery_reference:'LS-MUSTER-042',created_at:'2026-05-12T10:00:00Z'},
          {...movement,id:'f70ced5d-fc15-452d-9e94-0bea2eab132a',action:'receive',quantity:2,
            delivery_reference:null,created_at:'2026-05-11T08:00:00Z'},
        ]});
      });
      await signIn(page);
      if(device==='smartphone') await page.getByRole('button',{name:'Menü',exact:true}).click();
      if(theme==='dunkel') await page.getByRole('button',{name:'Dunkles Design'}).click();
      await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme==='hell'?'light':'dark');
      const group=page.getByText('Wareneingang',{exact:true}).first();
      await group.focus();
      await group.press('Enter');
      const submit=page.getByRole('button',{name:'Wareneingang buchen',exact:true});
      await expect(submit).toBeVisible();
      await submit.scrollIntoViewIfNeeded();
      await mkdir(output,{recursive:true});
      await page.screenshot({path:`${output}/wareneingang-${device}-${theme}.png`,animations:'disabled'});
      const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
      const row=panel.getByRole('row').filter({hasText:'12.05.2026'});
      await expect(row).toBeVisible();
      await row.scrollIntoViewIfNeeded();
      await page.screenshot({path:`${output}/lagerbewegungen-${device}-${theme}.png`,animations:'disabled'});
    });
  }
}
