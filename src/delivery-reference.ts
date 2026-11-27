export const deliveryReferenceLimit=160;
export const deliveryReferenceTooLong='Die Lieferscheinreferenz darf höchstens 160 Zeichen haben.';
export const deliveryReferenceInvalid='Die Lieferscheinreferenz enthält ungültige Zeichen.';

export function isDeliveryReferenceText(value:string) {
  return value.isWellFormed() && !value.includes('\0');
}

export function deliveryReferenceError(value:string) {
  const trimmed=value.trim();
  if(trimmed.length>deliveryReferenceLimit) return deliveryReferenceTooLong;
  if(!isDeliveryReferenceText(trimmed)) return deliveryReferenceInvalid;
}
