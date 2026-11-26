import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import styles from '../app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta:[
      {charSet:'utf-8'},
      {name:'viewport',content:'width=device-width, initial-scale=1'},
      {name:'theme-color',content:'#2758a4'},
      {title:'Desk'},
    ],
    links:[
      {rel:'stylesheet',href:styles},
      {rel:'icon',type:'image/svg+xml',href:'/desk-bildmarke.svg'},
      {rel:'manifest',href:'/desk.webmanifest'},
      {rel:'apple-touch-icon',href:'/desk-app-180.png',sizes:'180x180'},
    ],
  }),
  component: () => <Outlet/>,
  shellComponent: ({children}:{children:ReactNode}) => <html lang="de"><head><HeadContent/></head><body>{children}<Scripts/></body></html>,
});
