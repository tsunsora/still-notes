// Material 3 color: one seed becomes a full tonal scheme (HCT, tonal-spot variant),
// written as --md-sys-color-* roles that the stylesheet maps onto every surface.
import {argbFromHex,hexFromArgb,Hct,SchemeTonalSpot,MaterialDynamicColors} from '../node_modules/@material/material-color-utilities/index.js';

export const DEFAULT_SEED='#56707a';
// Seeds from a writing desk: slate, ink, moss, clay, ochre, rose.
export const presets=[
 {id:'#56707a',name:'Slate'},
 {id:'#3d5a99',name:'Ink'},
 {id:'#5d7a4a',name:'Moss'},
 {id:'#a8603d',name:'Clay'},
 {id:'#a88a3a',name:'Ochre'},
 {id:'#a3566b',name:'Rose'}
];

const roles=['primary','onPrimary','primaryContainer','onPrimaryContainer','secondary','onSecondary','secondaryContainer','onSecondaryContainer','tertiary','onTertiary','tertiaryContainer','onTertiaryContainer','error','onError','errorContainer','onErrorContainer','surface','surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow','surfaceContainer','surfaceContainerHigh','surfaceContainerHighest','onSurface','onSurfaceVariant','outline','outlineVariant','inverseSurface','inverseOnSurface','inversePrimary','scrim','shadow'];
const kebab=name=>name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
const CACHE='still.theme';

export function scheme(seed,dark){
 const s=new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)),dark,0);
 return Object.fromEntries(roles.map(role=>[role,hexFromArgb(MaterialDynamicColors[role].getArgb(s))]));
}

const darkQuery=matchMedia('(prefers-color-scheme: dark)');
let appearance={mode:'dark',seed:DEFAULT_SEED},accent='';

export function seedColor(value=appearance){return value.seed==='accent'?accent||DEFAULT_SEED:value.seed;}
export function isDark(value=appearance){return value.mode==='system'?darkQuery.matches:value.mode==='dark';}

function write(vars,dark){
 const root=document.documentElement;
 for(const [name,value] of Object.entries(vars))root.style.setProperty(name,value);
 root.dataset.theme=dark?'dark':'light';root.style.colorScheme=dark?'dark':'light';
}

export function applyTheme(next=appearance,accentColor=accent){
 appearance={...appearance,...next};accent=accentColor||accent;
 const dark=isDark(),colors=scheme(seedColor(),dark),vars={};
 for(const [role,hex] of Object.entries(colors))vars['--md-sys-color-'+kebab(role)]=hex;
 write(vars,dark);
 try{localStorage.setItem(CACHE,JSON.stringify({vars,dark}));}catch{}
 return appearance;
}

// Paint the last scheme before init resolves, so the window never opens in the wrong colors.
export function applyCachedTheme(){try{const cached=JSON.parse(localStorage.getItem(CACHE)||'null');if(cached?.vars)write(cached.vars,cached.dark);}catch{}}
export function currentAppearance(){return appearance;}
export function currentAccent(){return accent;}
darkQuery.addEventListener('change',()=>{if(appearance.mode==='system')applyTheme();});
