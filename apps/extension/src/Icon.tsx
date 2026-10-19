export function Icon({name}:{name:'nuke'|'settings'|'close'|'arrow'|'refresh'|'bolt'}) {
 const paths={nuke:'M12 2v5m0 10v5M2 12h5m10 0h5M5 5l3.5 3.5m7 7L19 19M5 19l3.5-3.5m7-7L19 5',settings:'M9 4h6l1 3 3 1 1 5-3 2-1 4h-6l-1-3-3-1-1-5 3-2z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',close:'m6 6 12 12M6 18 18 6',arrow:'M5 12h14m-6-6 6 6-6 6',refresh:'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3'};
 if(name==='nuke')return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1C10.3 8.2 8.2 10.3 1 12c7.2 1.7 9.3 3.8 11 11 1.7-7.2 3.8-9.3 11-11C15.8 10.3 13.7 8.2 12 1Z"/></svg>;
 return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={name==='bolt'?'m13 2-9 12h7l-1 8 10-13h-8z':paths[name]}/></svg>;
}
