import { Field } from './field';
import { createAuthClient } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ConfirmDialog, Panel, type Confirmation, type Run } from './widgets';

const authClient=createAuthClient({plugins:[passkeyClient()]});
type Passkey = {id:string; name?:string | null};

export function PasskeyLogin({onSignIn}:{onSignIn:(authenticate:()=>Promise<void>)=>Promise<void>}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function signIn() {
    setBusy(true);
    setError('');
    try {
      await onSignIn(async()=>{
        const result=await authClient.signIn.passkey();
        if(result.error || !result.data) throw new Error();
      });
    } catch {
      setError('Die Anmeldung mit Passkey wurde nicht abgeschlossen. Du kannst es erneut versuchen oder dein Passwort verwenden.');
    } finally {
      setBusy(false);
    }
  }
  return <div className="passkey-login">
    <button type="button" disabled={busy} onClick={()=>void signIn()}>Mit Passkey anmelden</button>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}

export function PasskeySettings({run}:{run:Run}) {
  const [passkeys,setPasskeys]=useState<Passkey[] | null>();
  const [label,setLabel]=useState('');
  const [labelError,setLabelError]=useState('');
  const labelField=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState({message:'',error:false});
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const panel=useRef<HTMLElement>(null);

  async function load() {
    setPasskeys(undefined);
    try {
      const result=await authClient.passkey.listUserPasskeys();
      if(result.error || !result.data) throw new Error();
      setPasskeys(result.data);
    } catch {
      setPasskeys(null);
    }
  }

  useEffect(()=>{void load();},[]);

  async function add(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name=label.trim();
    if(busy) return;
    if(!name) {
      setLabelError('Gib einen Namen für den Passkey ein.');
      labelField.current?.focus();
      return;
    }
    setBusy(true);
    setNotice({message:'',error:false});
    try {
      const result=await authClient.passkey.addPasskey({name});
      if(result.error || !result.data) throw new Error();
      setLabel('');
      setNotice({message:'Passkey hinzugefügt.',error:false});
      await load();
    } catch {
      setNotice({message:'Der Passkey wurde nicht eingerichtet. Du kannst es erneut versuchen.',error:true});
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(key:Passkey,trigger:HTMLButtonElement) {
    setNotice({message:'',error:false});
    setConfirmation({actionKey:`passkey-remove:${key.id}`,title:'Passkey entfernen',actionLabel:'Passkey entfernen',danger:true,trigger,
      description:`„${key.name || 'Passkey'}“ kann nach dem Entfernen nicht mehr für die Anmeldung verwendet werden.`,
      submit:async isCurrent=>{
        const result=await authClient.passkey.deletePasskey({id:key.id});
        if(result.error || !result.data) throw new Error('Der Passkey konnte nicht entfernt werden.');
        if(isCurrent()) setPasskeys(keys=>keys?.filter(record=>record.id!==key.id) ?? keys);
      },feedback:'Passkey entfernt.'});
  }

  return <Panel title="Passkeys" focusRef={panel}><div className="panel-body">
    <p>Mit einem Passkey kannst du dich bei Desk anmelden. Dein Passwort bleibt verfügbar.</p>
    <form className="form-grid passkey-form" onSubmit={add} noValidate>
      <Field label="Name für den Passkey" error={labelError}>{props=><input {...props} ref={labelField} value={label}
        onChange={event=>{
          setLabel(event.currentTarget.value);
          if(event.currentTarget.value.trim()) setLabelError('');
        }} maxLength={80} required disabled={busy}/>}</Field>
      <button className="primary" disabled={busy}>{busy?'Bitte warten …':'Passkey hinzufügen'}</button>
    </form>
    {notice.message && <p role={notice.error?'alert':'status'} className={notice.error?'inline-error':'subtle'}>{notice.message}</p>}
    {passkeys?.length ? <ul className="passkey-list">{passkeys.map((key)=><li key={key.id}>
      <span>{key.name || 'Passkey'}</span><button type="button" className="danger" disabled={busy} aria-label={`Passkey ${key.name || ''} entfernen`.replace('  ',' ')}
        onClick={event=>confirmRemove(key,event.currentTarget)}>Entfernen</button>
    </li>)}</ul> : null}
    {passkeys?.length===0 && <p className="subtle">Noch keine Passkeys eingerichtet.</p>}
    {passkeys===undefined && <p className="subtle" role="status">Passkeys werden geladen …</p>}
    {passkeys===null && <div className="actions">
      <p className="inline-error" role="alert">Passkeys konnten nicht geladen werden.</p>
      <button type="button" onClick={()=>void load()}>Erneut laden</button>
    </div>}
    {confirmation && <ConfirmDialog confirmation={confirmation} run={run} dismiss={()=>setConfirmation(undefined)} fallbackFocus={panel}/>}
  </div></Panel>;
}
