import { Field, fieldError, invalidFormFields } from './field';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from './client';
import { Panel } from './widgets';

export function AccountPassword() {
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState({message:'',error:false});
  const [errors,setErrors]=useState<Record<string,string>>({});

  function recheck(field:HTMLInputElement) {
    if(!Object.hasOwn(errors,field.name)) return;
    setErrors(previous=>({...previous,[field.name]:fieldError(field) ?? ''}));
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form=event.currentTarget;
    const validation=invalidFormFields(form);
    setErrors(validation.errors);
    if(validation.first) {
      validation.first.focus();
      return;
    }
    const values=new FormData(form);
    const revokeOtherSessions=values.has('revokeOtherSessions');
    setBusy(true);
    setNotice({message:'',error:false});
    try {
      await api('me/password','PATCH',{
        currentPassword:values.get('currentPassword'),
        newPassword:values.get('newPassword'),
        revokeOtherSessions,
      });
      form.reset();
      setNotice({
        message:revokeOtherSessions?'Passwort geändert. Andere Browsersitzungen wurden beendet.':'Passwort geändert.',
        error:false,
      });
    } catch (error) {
      setNotice({
        message:error instanceof ApiError ? error.message : 'Der Passwortwechsel konnte nicht bestätigt werden.',
        error:true,
      });
    } finally {
      setBusy(false);
    }
  }

  return <Panel title="Passwort ändern"><div className="panel-body">
    <form aria-label="Passwort ändern" className="form-grid" onSubmit={submit} noValidate>
      <Field label="Aktuelles Passwort" error={errors.currentPassword}>{props=><input {...props} name="currentPassword" type="password"
        autoComplete="current-password" maxLength={200} required disabled={busy} onChange={event=>recheck(event.currentTarget)}/>}</Field>
      <Field label="Neues Passwort" hint="Mindestens 12 Zeichen" error={errors.newPassword}>{props=><input {...props} name="newPassword" type="password"
        autoComplete="new-password" minLength={12} maxLength={200} required disabled={busy} onChange={event=>recheck(event.currentTarget)}/>}</Field>
      <label className="checkbox-label wide">
        <input name="revokeOtherSessions" type="checkbox" disabled={busy}/>
        <span>Andere Browsersitzungen beenden</span>
      </label>
      <div className="actions wide"><button className="primary" disabled={busy}>{busy?'Wird gespeichert …':'Passwort ändern'}</button></div>
      {notice.message && <p className={`wide ${notice.error?'inline-error':'subtle'}`} role={notice.error?'alert':'status'}>{notice.message}</p>}
    </form>
  </div></Panel>;
}
