import { attemptLabels, type AttemptStatus, type useSendingAttempt } from './communication-delivery';

export function DraftActions({attempt,listedStatus,recoverDraft}:{
  attempt:ReturnType<typeof useSendingAttempt>; listedStatus?:AttemptStatus; recoverDraft:(replay:boolean)=>Promise<void>;
}) {
  const {draft,locked,needsAttemptCheck,missingAttempt,draftStatus,draftActionRunning,replayButton,replayError,
    unresolvedRetry,clearDraft}=attempt;
  return <>
    {locked && draft.current && !listedStatus && (needsAttemptCheck || draftStatus) && <div className="communication-replay">
      {missingAttempt ? <>
        <p className="subtle">Desk hat keinen gespeicherten Sendeversuch gefunden. Du kannst dieselben Angaben erneut übermitteln.</p>
        <button ref={replayButton} type="button" disabled={draftActionRunning} onClick={()=>void recoverDraft(true)}>Mit denselben Angaben fortfahren</button>
      </> : <>
        <p className="subtle" role="status">{draftStatus
          ? 'Sendeversuch: '+attemptLabels[draftStatus]
          : 'Prüfe den gespeicherten Sendeversuch anhand dieses Entwurfs.'}</p>
        <button type="button" disabled={draftActionRunning} onClick={()=>void recoverDraft(false)}>Sendeversuch prüfen</button>
      </>}
    </div>}
    {replayError && <p className="inline-error" role="alert">{replayError}</p>}
    {draft.current && (listedStatus ?? draftStatus)==='failed' && draft.current.id!==unresolvedRetry && <div className="communication-replay">
      <p className="subtle">Zammad hat den Versuch abgelehnt. Du kannst hier eine neue Nachricht vorbereiten.</p>
      <button type="button" onClick={clearDraft}>Neuen Entwurf beginnen</button>
    </div>}
  </>;

}
