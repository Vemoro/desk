import { useId, type ReactNode } from 'react';

type ControlLabels = {
  id:string;
  'aria-labelledby':string;
  'aria-describedby'?:string;
  'aria-invalid'?:true;
};

export function Field({label,children,hint,error,describedBy,className,visuallyHiddenLabel=false}:{
  label:ReactNode;
  children:(labels:ControlLabels)=>ReactNode;
  hint?:ReactNode;
  error?:string;
  describedBy?:string;
  className?:string;
  visuallyHiddenLabel?:boolean;
}) {
  const id=useId();
  const labelId=`${id}-label`;
  const hintId=hint ? `${id}-hint` : undefined;
  const errorId=error ? `${id}-error` : undefined;
  return <label htmlFor={id} className={className}>
    <span id={labelId} className={visuallyHiddenLabel?'sr-only':undefined}>{label}</span>
    {children({id,'aria-labelledby':labelId,'aria-describedby':[describedBy,hintId,errorId].filter(Boolean).join(' ') || undefined,
      'aria-invalid':error ? true : undefined})}
    {hint && <small id={hintId}>{hint}</small>}
    {error && <small id={errorId} className="inline-error" role="alert">{error}</small>}
  </label>;
}

type NativeField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isNativeField(element:Element):element is NativeField {
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement;
}

function dateMessage(input:HTMLInputElement,kind:'min'|'max') {
  const [year,month,day]=input[kind].split('-');
  const date=day ? `${day}.${month}.${year}` : `${month}/${year}`;
  return kind==='min' ? `Wähle ${date} oder später.` : `Wähle ${date} oder früher.`;
}

export function fieldError(field:NativeField) {
  if(!field.willValidate) return undefined;
  const validity=field.validity;
  if(validity.valueMissing) return field instanceof HTMLSelectElement ? 'Wähle einen Eintrag.' : 'Fülle dieses Feld aus.';
  if(validity.typeMismatch && field instanceof HTMLInputElement) {
    return field.type==='email' ? 'Gib eine gültige E-Mail-Adresse ein.' : 'Gib einen vollständigen Link ein.';
  }
  if(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    if(validity.tooShort) return `Gib mindestens ${field.minLength} Zeichen ein.`;
    if(validity.tooLong) return `Gib höchstens ${field.maxLength} Zeichen ein.`;
  }
  if(field instanceof HTMLInputElement) {
    const date=field.type==='date' || field.type==='month';
    if(validity.rangeUnderflow) return date ? dateMessage(field,'min') : `Gib mindestens ${field.min} ein.`;
    if(validity.rangeOverflow) return date ? dateMessage(field,'max') : `Gib höchstens ${field.max} ein.`;
    if(validity.badInput) return 'Gib eine Zahl ein.';
    if(validity.stepMismatch) return 'Gib eine Zahl in der vorgegebenen Schrittweite ein.';
  }
  return validity.valid ? undefined : 'Prüfe die Eingabe.';
}

export function invalidFormFields(form:HTMLFormElement) {
  const errors:Record<string,string>=Object.create(null);
  let first:NativeField|undefined;
  for(const element of form.elements) {
    if(!isNativeField(element) || !element.name) continue;
    const error=fieldError(element);
    if(!error) continue;
    errors[element.name]=error;
    first??=element;
  }
  return {errors,first};
}
