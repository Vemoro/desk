import { createAuthClient } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { useEffect, useState, type FormEvent } from 'react';
import { Panel } from './widgets';

const authClient=createAuthClient({plugins:[passkeyClient()]});
type Passkey = {id:string; name?:string | null};

export function PasskeyLogin({onSignedIn}:{onSignedIn:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function signIn() {
    setBusy(true);
    setError('');
    try {
      const result=await authClient.signIn.passkey();
      if(result.error || !result.data) throw new Error();
      await onSignedIn();
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

export function PasskeySettings() {
  const [passkeys,setPasskeys]=useState<Passkey[] | null>();
  const [label,setLabel]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState({message:'',error:false});

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
    if(!name || busy) return;
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

  async function remove(key:Passkey) {
    if(busy) return;
    setBusy(true);
    setNotice({message:'',error:false});
    try {
      const result=await authClient.passkey.deletePasskey({id:key.id});
      if(result.error || !result.data) throw new Error();
      setPasskeys((keys)=>keys?.filter((record)=>record.id!==key.id) ?? keys);
      setNotice({message:'Passkey entfernt.',error:false});
    } catch {
      setNotice({message:'Der Passkey konnte nicht entfernt werden.',error:true});
    } finally {
      setBusy(false);
    }
  }

  return <Panel title="Passkeys"><div className="panel-body">
    <p>Mit einem Passkey kannst du dich bei Desk anmelden. Dein Passwort bleibt verfügbar.</p>
    <form className="form-grid passkey-form" onSubmit={add}>
      <label><span>Name für den Passkey</span><input value={label} onChange={(event)=>setLabel(event.target.value)} maxLength={80} required/></label>
      <button className="primary" disabled={busy || !label.trim()}>{busy?'Bitte warten …':'Passkey hinzufügen'}</button>
    </form>
    {notice.message && <p role={notice.error?'alert':'status'} className={notice.error?'inline-error':'subtle'}>{notice.message}</p>}
    {passkeys?.length ? <ul className="passkey-list">{passkeys.map((key)=><li key={key.id}>
      <span>{key.name || 'Passkey'}</span><button type="button" disabled={busy} aria-label={`Passkey ${key.name || ''} entfernen`.replace('  ',' ')}
        onClick={()=>void remove(key)}>Entfernen</button>
    </li>)}</ul> : null}
    {passkeys?.length===0 && <p className="subtle">Noch keine Passkeys eingerichtet.</p>}
    {passkeys===undefined && <p className="subtle" role="status">Passkeys werden geladen …</p>}
    {passkeys===null && <div className="actions">
      <p className="inline-error" role="alert">Passkeys konnten nicht geladen werden.</p>
      <button type="button" onClick={()=>void load()}>Erneut laden</button>
    </div>}
  </div></Panel>;
}
