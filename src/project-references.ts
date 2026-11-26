type References = {offer_ref?:string|null;invoice_ref?:string|null;haben_offer_id?:string|null};

export function missingStageReference(stage:string,{offer_ref,invoice_ref,haben_offer_id}:References) {
  if(stage==='offered' && !offer_ref && !haben_offer_id) return 'Angebotsreferenz';
  if(stage==='complete' && !invoice_ref) return 'Rechnungsreferenz';
}
