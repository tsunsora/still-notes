// Material 3 color, generated the way Metrolist does it: one seed becomes a full dynamic
// scheme on the 2025 spec, in the chosen palette style. Dark mode can go pure black, and a
// scheme that fails contrast checks falls back to the default seed. Roles are written as
// --md-sys-color-* custom properties and crossfade when they change.
import {argbFromHex,hexFromArgb,Hct,MaterialDynamicColors,SchemeTonalSpot,SchemeVibrant,SchemeExpressive,SchemeRainbow,SchemeFruitSalad,SchemeMonochrome,SchemeNeutral,SchemeContent} from '../node_modules/@material/material-color-utilities/index.js';

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

// The palette styles Metrolist offers, in its order.
export const DEFAULT_STYLE='tonalSpot';
export const paletteStyles=[
 {id:'tonalSpot',name:'Tonal spot',Scheme:SchemeTonalSpot},
 {id:'vibrant',name:'Vibrant',Scheme:SchemeVibrant},
 {id:'expressive',name:'Expressive',Scheme:SchemeExpressive},
 {id:'rainbow',name:'Rainbow',Scheme:SchemeRainbow},
 {id:'fruitSalad',name:'Fruit salad',Scheme:SchemeFruitSalad},
 {id:'monochrome',name:'Monochrome',Scheme:SchemeMonochrome},
 {id:'neutral',name:'Neutral',Scheme:SchemeNeutral},
 {id:'content',name:'Content',Scheme:SchemeContent}
];
const SPEC='2025';

const roles=['primary','onPrimary','primaryContainer','onPrimaryContainer','secondary','onSecondary','secondaryContainer','onSecondaryContainer','tertiary','onTertiary','tertiaryContainer','onTertiaryContainer','error','onError','errorContainer','onErrorContainer','surface','surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow','surfaceContainer','surfaceContainerHigh','surfaceContainerHighest','onSurface','onSurfaceVariant','outline','outlineVariant','inverseSurface','inverseOnSurface','inversePrimary','scrim','shadow'];
// Every surface role, flattened to black when pure black is on (Metrolist's ColorScheme.pureBlack()).
const surfaceRoles=['surface','surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow','surfaceContainer','surfaceContainerHigh','surfaceContainerHighest'];
const kebab=name=>name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
const CACHE='still.theme';
const dynamicColors=new MaterialDynamicColors();

function generate(seed,dark,style,contrast){
 const {Scheme}=paletteStyles.find(p=>p.id===style)||paletteStyles[0];
 const s=new Scheme(Hct.fromInt(argbFromHex(seed)),dark,contrast,SPEC);
 return Object.fromEntries(roles.map(role=>[role,hexFromArgb(dynamicColors[role]().getArgb(s))]));
}

// WCAG contrast, with the thresholds Metrolist uses for text (4.0) and controls (2.5).
function luminance(hex){
 const n=parseInt(hex.slice(1),16),c=[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});
 return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function isLegible(c,dark){
 return (luminance(c.surface)<luminance(c.onSurface))===dark&&
  contrast(c.onSurface,c.surface)>=4&&contrast(c.onSurface,c.surfaceContainerHighest)>=4&&
  contrast(c.onPrimary,c.primary)>=4&&contrast(c.onPrimaryContainer,c.primaryContainer)>=4&&
  contrast(c.onSecondaryContainer,c.secondaryContainer)>=4&&
  contrast(c.onSurfaceVariant,c.surface)>=2.5&&contrast(c.primary,c.surface)>=2.5;
}

export function scheme(seed,dark,{style=DEFAULT_STYLE,pureBlack=false,contrast:level=0}={}){
 const safeSeed=/^#[0-9a-f]{6}$/i.test(seed||'')?seed:DEFAULT_SEED;
 let colors=generate(safeSeed,dark,style,level);
 if(safeSeed!==DEFAULT_SEED&&!isLegible(colors,dark))colors=generate(DEFAULT_SEED,dark,style,level);
 if(dark&&pureBlack)for(const role of surfaceRoles)colors[role]='#000000';
 return colors;
}

const darkQuery=matchMedia('(prefers-color-scheme: dark)');
let appearance={mode:'dark',seed:DEFAULT_SEED,style:DEFAULT_STYLE,pureBlack:false},accent='';

export function seedColor(value=appearance){return value.seed==='accent'?accent||DEFAULT_SEED:value.seed;}
export function isDark(value=appearance){return value.mode==='system'?darkQuery.matches:value.mode==='dark';}

// Registering the roles as <color> lets the browser interpolate them, so a scheme change
// crossfades like Metrolist's animateColorScheme. Reduced motion turns transitions off in CSS.
const varNames=roles.map(role=>'--md-sys-color-'+kebab(role));
for(const name of varNames){try{CSS.registerProperty({name,syntax:'<color>',inherits:true,initialValue:'#000000'});}catch{}}
let animate=false;
const fade=varNames.map(n=>`${n} 300ms cubic-bezier(.2,0,0,1)`).join(',');
function write(vars,dark){
 const root=document.documentElement;
 root.style.transition=animate?fade:'none';
 for(const [name,value] of Object.entries(vars))root.style.setProperty(name,value);
 root.dataset.theme=dark?'dark':'light';root.style.colorScheme=dark?'dark':'light';
}

export function applyTheme(next=appearance,accentColor=accent){
 appearance={...appearance,...next};accent=accentColor||accent;
 const dark=isDark(),colors=scheme(seedColor(),dark,appearance),vars={};
 for(const [role,hex] of Object.entries(colors))vars['--md-sys-color-'+kebab(role)]=hex;
 write(vars,dark);
 // The first real scheme replaces the cached one without a fade; later changes animate.
 if(!animate)requestAnimationFrame(()=>requestAnimationFrame(()=>{animate=true;document.documentElement.style.transition=fade;}));
 try{localStorage.setItem(CACHE,JSON.stringify({vars,dark}));}catch{}
 return appearance;
}

// Paint the last scheme before init resolves, so the window never opens in the wrong colors.
export function applyCachedTheme(){try{const cached=JSON.parse(localStorage.getItem(CACHE)||'null');if(cached?.vars)write(cached.vars,cached.dark);}catch{}}
export function currentAppearance(){return appearance;}
export function currentAccent(){return accent;}
darkQuery.addEventListener('change',()=>{if(appearance.mode==='system')applyTheme();});
