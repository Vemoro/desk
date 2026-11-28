import { expect, test } from '@playwright/test';
import { holdRoute, settleResponse, signIn } from './session';

const token = {
  id:'muster-token',
  scope:'read',
  label:'Muster Auftragsservice – Schnittstelle für Lager, Büroinstallation und Veranstaltungsbetreuung',
};
const refusal = 'Der Widerruf konnte nicht gespeichert werden. '.repeat(18).trim();

for (const {name,width,height,theme} of [
  {name:'Hochformat',width:390,height:205,theme:'light'},
  {name:'Querformat',width:844,height:160,theme:'dark'},
]) {
  test.describe(name, () => {
    test.use({viewport:{width,height},hasTouch:true,isMobile:true});

    test('Token-Widerruf hält Aktionen sichtbar und den langen Fehler lesbar', async ({page,context}) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom:28}});
      await page.addInitScript(value=>localStorage.setItem('desk-theme',value),theme);
      await page.route('**/api/v1/tokens', route=>route.fulfill({json:[token]}));
      const deletion = holdRoute();
      let requests = 0;
      await page.route('**/api/v1/tokens/muster-token', route=>{
        requests++;
        deletion.resolve(route);
      });

      await signIn(page);
      const menu = page.getByRole('button',{name:'Menü',exact:true});
      if (await menu.isVisible()) await menu.tap();
      await page.getByRole('navigation',{name:'Hauptnavigation'})
        .getByRole('button',{name:'Einstellungen',exact:true}).tap();
      await page.getByRole('link',{name:/^API-Zugriff /}).tap();

      const trigger = page.getByRole('button',{name:'Widerrufen',exact:true});
      const dialog = page.getByRole('dialog',{name:'API-Token widerrufen',exact:true});
      const cancel = dialog.getByRole('button',{name:'Abbrechen',exact:true});
      const confirm = dialog.getByRole('button',{name:'Token widerrufen',exact:true});
      const content = dialog.getByRole('region',{name:'Folgen der Aktion'});

      await trigger.tap();
      await expect(cancel).toBeFocused();
      const sheet = await dialog.boundingBox();
      const button = await confirm.boundingBox();
      if (!sheet || !button) throw new Error('Bestätigung oder Aktion ist nicht sichtbar.');
      expect(sheet.y + sheet.height).toBeCloseTo(height,0);
      expect(height - (button.y + button.height)).toBeGreaterThanOrEqual(28);
      await page.keyboard.press('Shift+Tab');
      await expect(content).toBeFocused();
      await page.keyboard.press('End');
      await expect.poll(()=>content.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
      expect(await confirm.boundingBox()).toEqual(button);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.tap();
      await cancel.tap();
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(requests).toBe(0);

      await trigger.tap();
      await confirm.evaluate(button=>{ button.click(); button.click(); });
      const request = await deletion.request;
      expect(request.request().method()).toBe('DELETE');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await settleResponse(page,request,{error:refusal},409);
      await expect(dialog.getByRole('alert')).toHaveText(refusal);
      await expect(confirm).toBeDisabled();
      const close = dialog.getByRole('button',{name:'Schließen',exact:true});
      await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(content).toBeFocused();
      await page.keyboard.press('End');
      await expect.poll(()=>content.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
      expect(await confirm.boundingBox()).toEqual(button);
      await close.tap();
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(requests).toBe(1);
    });
  });
}
