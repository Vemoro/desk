import type { ReactNode, RefObject } from 'react';

export function PageHeading({title,action}:{title:string;action?:ReactNode}) {
  return <header className="page-title"><h1>{title}</h1>{action}</header>;
}

export function ListEmpty({children,action}:{children:ReactNode;action?:ReactNode}) {
  return <div className="list-empty">
    <p role="status">{children}</p>
    {action}
  </div>;
}

export function openListForm(form:RefObject<HTMLDetailsElement|null>) {
  const details=form.current;
  if(!details) return;
  details.open=true;
  const target=details.querySelector<HTMLElement>('input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled)')
    ?? details.querySelector('summary');
  target?.focus();
}
