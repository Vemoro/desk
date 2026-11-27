const calculationCurrency = new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});

export function calculationLineCents(quantity:number,unitCents:number) {
  return BigInt(quantity)*BigInt(unitCents);
}

export function formatCalculationTotal(cents:bigint) {
  const fraction=(cents%100n).toString().padStart(2,'0');
  return calculationCurrency.formatToParts(cents/100n)
    .map(part=>part.type==='fraction' ? fraction : part.value).join('');
}
