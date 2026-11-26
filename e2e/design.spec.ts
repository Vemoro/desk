import { expect, test } from '@playwright/test';
import { signIn } from './session';

function contrast(first:string,second:string) {
  function luminance(color:string) {
    const channels=color.match(/\d+/g)?.map(channel=>Number(channel)/255);
    if(channels?.length!==3) throw new Error(`Unerwarteter Farbwert: ${color}`);
    const [r,g,b]=channels.map(channel=>channel<=0.04045?channel/12.92:((channel+.055)/1.055)**2.4);
    return .2126*r+.7152*g+.0722*b;
  }
  const levels=[luminance(first),luminance(second)].sort((a,b)=>b-a);
  return (levels[0]+.05)/(levels[1]+.05);
}

test('Abstände und Schriftgrößen verwenden die gemeinsamen Rasterwerte',async({page})=>{
  await page.goto('/');
  const failures=await page.evaluate(()=>{
    const unexpected:string[]=[];
    function inspect(rules:CSSRuleList) {
      for(const rule of rules) {
        if(rule instanceof CSSGroupingRule) inspect(rule.cssRules);
        if(!(rule instanceof CSSStyleRule)) continue;
        for(const name of rule.style) {
          const value=rule.style.getPropertyValue(name).trim();
          if(name==='font-size' && value!=='inherit' && !/^var\(--text-(?:12|13|14|16|18|24|28)\)$/.test(value)) {
            unexpected.push(`${rule.selectorText} ${name}: ${value}`);
          }
          if(!/^(?:margin|padding|gap|column-gap|row-gap)(?:-|$)/.test(name)) continue;
          if(rule.selectorText==='.tabs a' && name==='margin-bottom' && value==='-1px') continue;
          if(Array.from(value.matchAll(/(-?\d*\.?\d+)px/g)).some(([,pixels])=>Number(pixels)%4!==0)) {
            unexpected.push(`${rule.selectorText} ${name}: ${value}`);
          }
        }
      }
    }
    for(const sheet of document.styleSheets) {
      if(!sheet.href || new URL(sheet.href).origin===location.origin) inspect(sheet.cssRules);
    }
    return unexpected;
  });
  expect(failures).toEqual([]);
});

for(const theme of ['light','dark'] as const) {
  test(`Menü und Fokus sind am Smartphone in ${theme} kontrastreich`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await signIn(page);
    await page.locator('html').evaluate((root,value)=>root.dataset.theme=value,theme);
    const menu=page.getByRole('button',{name:'Menü',exact:true});
    await expect(menu).toBeVisible();
    await menu.hover();
    const colors=await menu.evaluate(button=>{
      const style=getComputedStyle(button);
      return {text:style.color,background:style.backgroundColor};
    });
    expect(contrast(colors.text,colors.background)).toBeGreaterThanOrEqual(4.5);
    expect((await menu.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await menu.click();
    const warehouse=page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true});
    await warehouse.click();
    const checkbox=page.getByRole('checkbox',{name:'Nur mit freiem Bestand'});
    await checkbox.check();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(checkbox).toBeFocused();
    const focus=await checkbox.evaluate(input=>{
      const style=getComputedStyle(input);
      return {visible:input.matches(':focus-visible'),offset:style.outlineOffset,ring:style.outlineColor,
        width:style.outlineWidth,style:style.outlineStyle,background:getComputedStyle(input.closest('.panel')!).backgroundColor};
    });
    expect(focus.offset).toBe('2px');
    expect(focus.visible).toBe(true);
    expect(focus.width).toBe('2px');
    expect(focus.style).toBe('solid');
    expect(contrast(focus.ring,focus.background)).toBeGreaterThanOrEqual(3);
  });
}
