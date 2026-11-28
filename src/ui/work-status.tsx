import { Pill } from './widgets';

export type WorkStatusRole = 'neutral'|'active'|'waiting'|'attention'|'failed';

export function WorkStatus({label,role='neutral',detail}:{label:string;role?:WorkStatusRole;detail?:string}) {
  return <span className="work-status" data-work-status={role}>
    <Pill label={label} tone={role==='active'?'accent':'neutral'}/>
    {detail && <span className="work-status-detail">{detail}</span>}
  </span>;
}
