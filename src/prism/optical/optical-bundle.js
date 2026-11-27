/*!
 * DreamSkin Prism — Cross-Platform Optical & Pixel Mascot Suite Bundle
 * License: GPL-3.0-only (see LICENSE & THIRD-PARTY-NOTICES.md)
 * Upstream Credits:
 *   - RMvdesi / Obsidian Prism (motion-engine, prism-rim-canvas, ripple-core, dual-mascot-rig, smooth-caret, slider-coexist)
 *   - 0DNANCY / agy-claude-style (MIT, optical foundation & mascot base)
 *   - LLYSH-HANNARI / antigravity-Codex-Claude-effort-slider (MIT, Antigravity reasoning effort slider)
 *   - wp3171216237 / dsh-TUI (MIT, Deepy whale pixel mascot reference)
 * Privacy Contract: zero external URLs, zero cookies, zero host storage access.
 */

/* ===== module: motion-engine.js ===== */
(function(root,factory){
const api=factory();if(root)root.__agMotionEngine=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window,function(){
'use strict';
const SPRING_PRESETS=Object.freeze({
snappy:{stiffness:420,damping:30,mass:.9},bouncy:{stiffness:380,damping:20,mass:1},
default:{stiffness:380,damping:26,mass:1},gentle:{stiffness:260,damping:26,mass:1.05},
micro:{stiffness:440,damping:24,mass:.85},indicator:{stiffness:430,damping:32,mass:.9},
});
const TIERS=new Set(['off','subtle','standard','ultra']);
const CACHE=new Map(),ANIMS=new WeakMap(),ROOTS=new WeakMap(),CDS=new WeakMap(),TIMERS=new WeakMap(),EXCL_CACHE=new WeakMap();
const HOST_SEL='button, a, [role="button"], summary, [data-icon-host]';
const THOUGHT_CLS_RE=/\b(ag-prism-thought-raw-toggle|ag-prism-thought-overlay)\b/;
const BEZ='cubic-bezier(0.22, 1.25, 0.36, 1)',clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let exclEpoch=1;

function invalidateExclusionCache(){exclEpoch=(exclEpoch+1)|0;}

// Isolate Thought Translator overlay & raw-toggle controls from micro-interaction spring wrapping (WeakMap cached for 300Hz pointerover)
function isThoughtExcluded(el){
if(!el||typeof el!=='object')return false;
const bucket=((typeof performance!=='undefined'&&performance.now?performance.now():Date.now())*(1/48))|0;
const tag=(exclEpoch<<20)^bucket;
const hitC=EXCL_CACHE.get(el);
const topP=el.parentElement||el.parentNode||null;
const topCls=String((el.getAttribute&&el.getAttribute('class'))||el.className||'');
const topIg=Boolean(el.hasAttribute&&el.hasAttribute('data-prism-ignore'));
if(hitC&&hitC.tag===tag&&hitC.p===topP&&hitC.cls===topCls&&hitC.ig===topIg)return hitC.v;
const visited=[];
let cur=el,res=false;
while(cur&&typeof cur==='object'){
const p=cur.parentElement||cur.parentNode||null;
const cls=cur===el?topCls:String((cur.getAttribute&&cur.getAttribute('class'))||cur.className||'');
const ig=cur===el?topIg:Boolean(cur.hasAttribute&&cur.hasAttribute('data-prism-ignore'));
if(ig||THOUGHT_CLS_RE.test(cls)){res=true;visited.push({n:cur,p,cls,ig});break;}
const c=EXCL_CACHE.get(cur);
if(c&&c.tag===tag&&c.p===p&&c.cls===cls&&c.ig===ig){res=c.v;break;}
visited.push({n:cur,p,cls,ig});
cur=p;
}
for(let i=0;i<visited.length;i++){
const it=visited[i];
EXCL_CACHE.set(it.n,{tag,p:it.p,cls:it.cls,ig:it.ig,v:res});
}
return res;
}

function prefersReducedMotion(ov){
if(typeof ov==='boolean')return ov;
try{return Boolean(globalThis.matchMedia&&globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
}

function getMotionTier(ov){
if(prefersReducedMotion(typeof ov==='boolean'?ov:undefined))return 'off';
if(typeof ov==='string'&&TIERS.has(ov))return ov;
try{
const el=typeof document!=='undefined'&&document.documentElement;
const raw=el&&el.getAttribute?el.getAttribute('data-ag-cs-motion')||'ultra':'ultra';
return TIERS.has(raw)?raw:'ultra';
}catch(_){return 'ultra';}
}

function resolveTier(o){
if(o&&typeof o.reducedMotion==='boolean')return o.reducedMotion?'off':(o.motionTier&&TIERS.has(o.motionTier)?o.motionTier:getMotionTier(false));
return getMotionTier(o&&o.motionTier);
}

function hasLinearCss(){
try{if(typeof CSS!=='undefined'&&CSS.supports)return CSS.supports('animation-timing-function','linear(0, 1)');}catch(_){}
return true;
}

function springLinear(opts={}){
const p=typeof opts==='string'?SPRING_PRESETS[opts]:opts&&opts.preset?SPRING_PRESETS[opts.preset]:null;
const k=clamp(+((opts&&opts.stiffness)??(p&&p.stiffness)??380),20,3000);
const c=clamp(+((opts&&opts.damping)??(p&&p.damping)??26),1,400);
const m=clamp(+((opts&&opts.mass)??(p&&p.mass)??1),.05,20);
const v0=clamp(+((opts&&opts.velocity)??0),-50,50);
const rD=clamp(+((opts&&opts.restDelta)??.001),.0001,.05);
const rS=clamp(+((opts&&opts.restSpeed)??.001),.0001,.05);
const n=Math.round(clamp(+((opts&&opts.sampleCount)??40),12,96));
const key=`${k}|${c}|${m}|${v0}|${rD}|${rS}|${n}`;
if(CACHE.has(key))return CACHE.get(key);

const w0=Math.sqrt(k/m),z=c/(2*Math.sqrt(k*m));
let pos,vel;
if(z<1-1e-5){
const wd=w0*Math.sqrt(1-z*z),b=(v0-z*w0)/wd;
pos=t=>t<=0?0:1+Math.exp(-z*w0*t)*(-Math.cos(wd*t)+b*Math.sin(wd*t));
vel=t=>{if(t<=0)return v0;const cv=Math.cos(wd*t),sv=Math.sin(wd*t);return Math.exp(-z*w0*t)*(-z*w0*(-cv+b*sv)+wd*sv+b*wd*cv);};
}else if(z>1+1e-5){
const g=w0*Math.sqrt(z*z-1),r1=-z*w0+g,r2=-z*w0-g,c1=(v0+r2)/(2*g),c2=-1-c1;
pos=t=>t<=0?0:1+c1*Math.exp(r1*t)+c2*Math.exp(r2*t);
vel=t=>t<=0?v0:c1*r1*Math.exp(r1*t)+c2*r2*Math.exp(r2*t);
}else{
const b=v0-w0;
pos=t=>t<=0?0:1+Math.exp(-w0*t)*(-1+b*t);
vel=t=>t<=0?v0:Math.exp(-w0*t)*(-w0*(-1+b*t)+b);
}

const dt=1/240;let endT=.08;
for(let t=dt;t<=3.6;t+=dt)if(Math.abs(1-pos(t))>rD||Math.abs(vel(t))>rS)endT=t;
const sec=clamp(endT+dt,.08,3.6),samples=new Array(n);
samples[0]=0;for(let i=1;i<n-1;i++)samples[i]=+pos((i/(n-1))*sec).toFixed(4);samples[n-1]=1;
const res=Object.freeze({easing:`linear(${samples.join(', ')})`,durationMs:Math.round(sec*1000),samples:Object.freeze(samples),solveAt:pos});
if(CACHE.size>=64)CACHE.delete(CACHE.keys().next().value);
CACHE.set(key,res);return res;
}

const noop=(durationMs=0,easing='linear')=>({animation:null,durationMs,easing,finished:Promise.resolve(),cancel(){}});

function commitFinal(el,kf){
if(!el||!el.style||!kf)return;
let last=Array.isArray(kf)?kf[kf.length-1]:null;
if(!last&&typeof kf==='object'){last={};for(const [p,v] of Object.entries(kf))last[p]=Array.isArray(v)?v[v.length-1]:v;}
if(!last)return;
for(const [p,v] of Object.entries(last))if(p!=='offset'&&p!=='easing'&&p!=='composite'&&v!=null)try{el.style[p]=String(v);}catch(_){}
}

function spring(el,kf,opts={}){
if(!el||!kf||isThoughtExcluded(el))return noop();
const tier=resolveTier(opts),slot=String(opts.slot||'default');
let slots=ANIMS.get(el);if(!slots)ANIMS.set(el,(slots=new Map()));
const prev=slots.get(slot);
if(prev){try{if(opts.interrupt==='commit'&&prev.commitStyles)prev.commitStyles();prev.cancel();}catch(_){}slots.delete(slot);}
if(opts.transformBox&&el.style)el.style.transformBox=opts.transformBox;
if(opts.transformOrigin&&el.style)el.style.transformOrigin=opts.transformOrigin;
const fill=opts.fill||'none';
if(tier==='off'){
if(opts.commitFinal!==false&&(fill==='forwards'||fill==='both'||opts.applyReducedFinal))commitFinal(el,kf);
return noop(0,'step-end');
}
const sub=tier==='subtle',solved=sub?null:springLinear(opts);
const durationMs=sub?120:Number.isFinite(opts.durationMs)?Math.max(16,Math.round(opts.durationMs)):solved.durationMs;
const easing=sub?'ease-out':hasLinearCss()?solved.easing:BEZ;
const useKf=sub&&Array.isArray(kf)&&kf.length>2?[kf[0],kf[kf.length-1]]:kf;
const delay=Math.max(0,+opts.delay||0);
if(typeof el.animate!=='function'){if(fill==='forwards'||fill==='both')commitFinal(el,useKf);return noop(durationMs,easing);}
let anim=null;
try{anim=el.animate(useKf,{duration:durationMs,delay,easing,fill});}
catch(_){
try{anim=el.animate(useKf,{duration:Math.min(durationMs,360),delay,easing:sub?'ease-out':BEZ,fill});}
catch(_e){if(fill==='forwards'||fill==='both')commitFinal(el,useKf);return noop(durationMs,easing);}
}
slots.set(slot,anim);
const clr=()=>{if(slots.get(slot)===anim)slots.delete(slot);};
const finished=anim&&anim.finished&&anim.finished.then?anim.finished.then(()=>{clr();if(opts.commitOnFinish&&anim.commitStyles)try{anim.commitStyles();anim.cancel();}catch(_){}},clr):Promise.resolve();
return {animation:anim,durationMs,easing,finished,cancel(){try{if(anim)anim.cancel();}catch(_){}clr();}};
}

function groupWrap(hs){
Object.defineProperty(hs,'finished',{value:Promise.all(hs.map(h=>h.finished)),enumerable:false});
Object.defineProperty(hs,'cancelAll',{value(){hs.forEach(h=>h.cancel());},enumerable:false});
return hs;
}

function stagger(els,kf,opts={}){
let list=[];
if(typeof els==='string'){const sc=opts.root||(typeof document!=='undefined'?document:null);if(sc&&sc.querySelectorAll)list=Array.from(sc.querySelectorAll(els));}
else if(els)list=typeof els.length==='number'?Array.from(els).filter(Boolean):[els];
const tier=resolveTier(opts),rawS=clamp(+(opts.delayStep??opts.stepMs??28),0,400),rawM=clamp(+(opts.maxDelay??320),0,2000);
const step=tier==='off'?0:tier==='subtle'?Math.min(rawS,16):rawS;
const init=tier==='off'?0:Math.max(0,+(opts.initialDelay??0));
const maxD=tier==='off'?0:tier==='subtle'?Math.min(rawM,96):rawM;
return groupWrap(list.map((el,i)=>spring(el,typeof kf==='function'?kf(el,i,list.length):kf,{stiffness:360,damping:28,...opts,delay:Math.min(maxD,init+i*step),slot:opts.slot||'stagger'})));
}

function toRect(r){
if(!r)return null;
if(typeof r.getBoundingClientRect==='function')r=r.getBoundingClientRect();
return Number.isFinite(r.left)&&Number.isFinite(r.top)?{left:+r.left,top:+r.top,width:+r.width||0,height:+r.height||0}:null;
}

function glideIndicator(el,prevR,nextR,opts={}){
if(!el)return noop();
let tgt=el,fArg=prevR,tArg=nextR,ro=opts||{};
if(toRect(nextR)===null&&prevR&&prevR!==el&&(typeof prevR.animate==='function'||prevR.tagName)){
tgt=prevR;fArg=el;tArg=prevR;if(nextR&&typeof nextR==='object')ro=nextR;
}
if(resolveTier(ro)==='off')return noop(0,'step-end');
const from=toRect(fArg),to=toRect(tArg||tgt);
if(!to||to.width<=0||to.height<=0)return noop();
if(!from||from.width<=0||from.height<=0)return spring(tgt,[{opacity:0,transform:'scale(0.94)'},{opacity:1,transform:'scale(1)'}],{...SPRING_PRESETS.indicator,...ro,slot:'glide'});
const dx=from.left-to.left,dy=from.top-to.top,sx=from.width/to.width,sy=from.height/to.height;
const noSc=Math.abs(sx-1)<.025&&Math.abs(sy-1)<.025;
if(Math.abs(dx)<.5&&Math.abs(dy)<.5&&noSc)return noop();
const scOn=ro.scaleAxis!==false&&!noSc;
const tf0=scOn?`translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`:`translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
return spring(tgt,[{transform:tf0},{transform:'translate3d(0, 0, 0) scale(1, 1)'}],{...SPRING_PRESETS.indicator,...ro,transformOrigin:scOn?'0 0':'50% 50%',slot:'glide'});
}

function drawStroke(root,opts={}){
if(!root)return groupWrap([]);
const sel=opts.selector||'path, line, polyline, circle, ellipse',nodes=[];
if(root.matches&&root.matches(sel))nodes.push(root);
if(root.querySelectorAll)nodes.push(...Array.from(root.querySelectorAll(sel)));
const tier=resolveTier(opts),rawS=clamp(+(opts.staggerMs??45),0,300),stepMs=tier==='subtle'?Math.min(rawS,20):rawS;
return groupWrap(nodes.map((node,i)=>{
let len=28;
if(typeof node.getTotalLength==='function'){try{const m=node.getTotalLength();if(m>0)len=m;}catch(_){}}
else if(node.getAttribute&&node.getAttribute('data-path-length'))len=+node.getAttribute('data-path-length')||28;
const dash=`${Math.ceil(len+1)}`;
if(node.style){node.style.strokeDasharray=dash;node.style.strokeDashoffset=tier==='off'?'0':dash;if(tier==='off'&&opts.fadeIn!==false)node.style.opacity='1';}
if(tier==='off')return noop(0,'step-end');
return spring(node,[{strokeDashoffset:dash,opacity:opts.fadeIn===false?1:.35},{strokeDashoffset:'0',opacity:1}],{
stiffness:opts.stiffness??260,damping:opts.damping??26,delay:(opts.delay||0)+i*stepMs,
fill:'forwards',commitOnFinish:true,reducedMotion:opts.reducedMotion,motionTier:opts.motionTier,slot:'stroke',
});
}));
}

function findTarget(el){
if(!el||isThoughtExcluded(el))return null;
let ic=el.getAttribute&&el.getAttribute('data-anim-icon')?el:null,host=ic?(el.closest&&el.closest(HOST_SEL))||el:null;
if(!ic&&el.closest){ic=el.closest('[data-anim-icon]');if(ic)host=ic.closest(HOST_SEL)||ic;}
if(!ic&&el.querySelector){ic=el.querySelector('[data-anim-icon]');if(ic)host=el;}
if(!ic&&el.closest){const b=el.closest(HOST_SEL);if(b&&b.querySelector){ic=b.querySelector('[data-anim-icon]');if(ic)host=b;}}
if(!ic||isThoughtExcluded(host||ic))return null;
const svg=ic.tagName&&ic.tagName.toLowerCase()==='svg'?ic:(ic.querySelector&&ic.querySelector('svg'))||ic;
return {iconEl:ic,svgEl:svg,hostEl:host||ic,iconName:ic.getAttribute('data-anim-icon')||''};
}

function triggerIcon(el,state='trigger',opts={}){
const t=findTarget(el);if(!t)return noop();
const {iconEl,svgEl,hostEl,iconName}=t,tier=resolveTier(opts);
const reg=opts.iconRegistry||(typeof globalThis!=='undefined'&&globalThis.__agAnimatedIcons);
const spec=((reg&&reg.ICON_SPECS)||reg||{})[iconName];
const oldT=TIMERS.get(hostEl);if(oldT){clearTimeout(oldT);TIMERS.delete(hostEl);}
if(state&&state!=='hover'&&state!=='press'){
if(iconEl.setAttribute)iconEl.setAttribute('data-icon-state',state);
if(svgEl!==iconEl&&svgEl.setAttribute)svgEl.setAttribute('data-icon-state',state);
}
if(iconName==='copy-check'&&(state==='check'||state==='copy')){
const cp=svgEl.querySelector&&svgEl.querySelector('.ai-part-copy'),ck=svgEl.querySelector&&svgEl.querySelector('.ai-part-check');
if(cp&&cp.style)cp.style.opacity=state==='check'?'0':'1';
if(ck&&ck.style)ck.style.opacity=state==='check'?'1':'0';
}
if(tier==='subtle'&&state==='hover')return {iconName,stateName:state,handles:[],finished:Promise.resolve(),cancel(){}};
const steps=(spec&&spec.states&&spec.states[state])||(spec&&state==='trigger'&&spec.trigger)||(spec&&spec.hover)||
[{keyframes:[{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],origin:'12px 12px'}];
const handles=[];
for(const s of steps){
const nodes=s.part?(svgEl.querySelectorAll?Array.from(svgEl.querySelectorAll(s.part)):[]):[svgEl];
nodes.forEach((node,i)=>{
if(s.drawStroke)handles.push(...drawStroke(node,{stiffness:s.stiffness??290,damping:s.damping??26,reducedMotion:opts.reducedMotion,motionTier:opts.motionTier}));
if(s.keyframes)handles.push(spring(node,s.keyframes,{
stiffness:s.stiffness??420,damping:s.damping??22,mass:s.mass??.85,delay:(s.delay||0)+i*(s.staggerMs||45),
fill:s.fill||'none',transformBox:s.box||'view-box',transformOrigin:s.origin||'12px 12px',
reducedMotion:opts.reducedMotion,motionTier:opts.motionTier,applyReducedFinal:s.fill==='forwards'||s.fill==='both',slot:s.slot||'micro',
}));
});
}
const revMs=+opts.revertAfterMs||0;
if(revMs>0&&state==='check'&&iconName==='copy-check'){
TIMERS.set(hostEl,setTimeout(()=>{TIMERS.delete(hostEl);triggerIcon(hostEl,'copy',{...opts,revertAfterMs:0});},revMs));
}
return {iconName,stateName:state,handles,finished:Promise.all(handles.map(h=>h.finished)),cancel(){handles.forEach(h=>h.cancel());}};
}

function isEditable(el){
if(!el)return false;
const tag=(el.tagName||'').toUpperCase();
if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||el.isContentEditable)return true;
const ce=el.getAttribute?el.getAttribute('contenteditable'):null;
return ce===''||ce==='true'||ce==='plaintext-only'||Boolean(el.getAttribute&&el.getAttribute('role')==='textbox');
}
const isDis=el=>!el||Boolean(el.disabled||(el.getAttribute&&(el.getAttribute('disabled')!==null||el.getAttribute('aria-disabled')==='true')));

function findPressBtn(target){
if(!target||isThoughtExcluded(target))return null;
let cur=target,hit=null;
while(cur){
if(isEditable(cur)||(cur.getAttribute&&cur.getAttribute('data-no-press-spring')!==null)||isThoughtExcluded(cur))return null;
if(!hit){
const tag=(cur.tagName||'').toUpperCase();
if(tag==='BUTTON'||(cur.getAttribute&&cur.getAttribute('role')==='button')){
if(isDis(cur))return null;
const tid=(cur.getAttribute&&cur.getAttribute('data-testid'))||'',cls=String((cur.getAttribute&&cur.getAttribute('class'))||cur.className||'');
if(tid==='agent-input-box'||tid==='conversation-view'||/\b(surface-composer-card|monaco-editor|cm-editor|agy-home|ag-prism-thought-raw-toggle|ag-prism-thought-overlay)\b/.test(cls))return null;
if(cur.querySelector){
let ed=false;
try{ed=Boolean(cur.querySelector('textarea')||cur.querySelector('[contenteditable="true"]')||cur.querySelector('[role="textbox"]'));}
catch(_){try{ed=Boolean(cur.querySelector('textarea'));}catch(_e){}}
if(ed)return null;
}
if(typeof cur.getBoundingClientRect==='function'){try{const b=cur.getBoundingClientRect();if(b&&(b.width>420||b.height>96))return null;}catch(_){}}
hit=cur;
}
}
cur=cur.parentElement||null;
}
return hit;
}

function bindMicroInteractions(root,opts={}){
const r=root||(typeof document!=='undefined'?document:null);
if(!r||typeof r.addEventListener!=='function')return {root:r,unbind(){},trigger:triggerIcon};
if(ROOTS.has(r))return ROOTS.get(r);
const cd=clamp(+(opts.cooldownMs??150),40,1000);
const gate=h=>{const now=Date.now();if(now-(CDS.get(h)||0)<cd)return false;CDS.set(h,now);return true;};
const onOver=e=>{
if(!e)return;
const tier=resolveTier(opts);if(tier==='off'||tier==='subtle')return;
if(isThoughtExcluded(e.target))return;
const t=findTarget(e.target);
if(!t||isDis(t.hostEl)||(e.relatedTarget&&t.hostEl.contains&&t.hostEl.contains(e.relatedTarget)))return;
if(gate(t.hostEl))triggerIcon(t.hostEl,'hover',opts);
};
const onFocus=e=>{
if(!e)return;
const tier=resolveTier(opts);if(tier==='off'||tier==='subtle')return;
if(isThoughtExcluded(e.target))return;
try{if(e.target.matches&&!e.target.matches(':focus-visible'))return;}catch(_){}
const t=findTarget(e.target);if(t&&!isDis(t.hostEl)&&gate(t.hostEl))triggerIcon(t.hostEl,'hover',opts);
};
const onDown=e=>{
if(!e||(typeof e.button==='number'&&e.button!==0)||isThoughtExcluded(e.target))return;
const tier=resolveTier(opts);if(tier!=='standard'&&tier!=='ultra')return;
const t=findTarget(e.target);
if(t&&!isDis(t.hostEl)){
spring(t.svgEl,[{transform:'scale(1)'},{transform:'scale(0.9)'},{transform:'scale(1)'}],{
stiffness:520,damping:28,mass:.7,transformBox:'view-box',transformOrigin:'12px 12px',
reducedMotion:opts.reducedMotion,motionTier:opts.motionTier,slot:'press',
});
}
const btn=findPressBtn(e.target);
if(btn){
const tf=btn.style&&btn.style.transform?String(btn.style.transform).trim():'';
const kf=tf&&tf!=='none'&&!/^scale\([^)]+\)$/.test(tf)?[{scale:'1'},{scale:'0.965'},{scale:'1'}]:[{transform:'scale(1)'},{transform:'scale(0.965)'},{transform:'scale(1)'}];
spring(btn,kf,{stiffness:520,damping:30,mass:.72,reducedMotion:opts.reducedMotion,motionTier:opts.motionTier,slot:'btn-press'});
}
};
r.addEventListener('pointerover',onOver,{passive:true});
r.addEventListener('focusin',onFocus,{passive:true});
r.addEventListener('pointerdown',onDown,{passive:true});
const binding={root:r,trigger:triggerIcon,unbind(){
r.removeEventListener('pointerover',onOver);r.removeEventListener('focusin',onFocus);r.removeEventListener('pointerdown',onDown);ROOTS.delete(r);
}};
ROOTS.set(r,binding);return binding;
}

return Object.freeze({SPRING_PRESETS,prefersReducedMotion,getMotionTier,springLinear,spring,stagger,glideIndicator,drawStroke,bindMicroInteractions,triggerIcon,isThoughtExcluded,invalidateExclusionCache});
});
;

/* ===== module: animated-icons.js ===== */
(function (root, factory) {
  const api = factory();
  if (root) root.__agAnimatedIcons = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  /** Google Brand Studio 官方高饱和四色色板（亮暗双适配、零渐变 ID 冲突） */
  const GOOGLE_COLORS = Object.freeze({
    blue: '#4285F4',
    red: '#EA4335',
    yellow: '#FBBC04',
    green: '#34A853',
    coreLight: '#FFFFFF',
  });

  const esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  function extraAttrs(attrs) {
    if (!attrs || typeof attrs !== 'object') return '';
    let out = '';
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null && v !== false) out += v === true ? ` ${k}` : ` ${k}="${esc(v)}"`;
    }
    return out;
  }

  /** 正统 Google Gemini 高斯柔光四色单体星（零固定 ID 冲突） */
  const OFFICIAL_GEMINI_SPARK_D =
    'M12 1.2c.25 0 .47.17.53.41c.21.79.48 1.56.8 2.31c1.23 2.86 3.39 5.02 6.25 6.25c.75.32 1.52.59 2.31.8c.24.06.41.28.41.53s-.17.47-.41.53a16 16 0 0 0-2.31.8c-2.86 1.23-5.02 3.39-6.25 6.25c-.32.75-.59 1.52-.8 2.31a.55.55 0 0 1-.53.41a.55.55 0 0 1-.53-.41a16 16 0 0 0-.8-2.31c-1.23-2.86-3.39-5.02-6.25-6.25a16 16 0 0 0-2.31-.8A.55.55 0 0 1 1.2 12c0-.25.17-.47.41-.53c.79-.21 1.56-.48 2.31-.8c2.86-1.23 5.02-3.39 6.25-6.25c.32-.75.59-1.52.8-2.31c.06-.24.28-.41.53-.41Z';

  function renderGoogleSparkOrbitSvg(opts = {}) {
    const size = +opts.size > 0 ? +opts.size : 16;
    const tier = String(opts.tier || 'auto').toLowerCase();
    const mono = Boolean(opts.monochrome || tier === 'fixed');
    const cls = opts.className ? ` ${esc(opts.className)}` : '';
    const xmlns = opts.xmlns ? ' xmlns="[upstream-ref]"' : '';
    const anim = opts.animIcon === false ? '' : ' data-anim-icon="google-spark-orbit"';

    const lock = tier === 'fixed'
      ? '<g class="ai-part-lock" opacity="0.82"><rect x="15.8" y="16.4" width="6.4" height="5.2" rx="1.3" fill="currentColor"/><path d="M17.4 16.4V15a1.6 1.6 0 0 1 3.2 0v1.4" stroke="currentColor" stroke-width="1.35" fill="none"/></g>'
      : '';

    if (mono) {
      const fillOp = tier === 'low' ? '0.45' : '0.88';
      return (
        `<svg class="ag-spark-orbit-svg${cls}"${xmlns}${anim} data-brand="antigravity" data-tier="${esc(tier)}" data-monochrome="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"${extraAttrs(opts.attrs)}>` +
        `<g class="ai-part-spark-core"><path d="${OFFICIAL_GEMINI_SPARK_D}" fill="currentColor" fill-opacity="${fillOp}"/></g>${lock}</svg>`
      );
    }

    // 饱满四色单层合并柔光：零固定 ID 冲突，单个合并层 1 次滤镜替代 4 次独立高斯模糊（直降 75% 光栅开销）
    const meshBody =
      `<path d="${OFFICIAL_GEMINI_SPARK_D}" fill="${GOOGLE_COLORS.blue}"/>` +
      `<g style="clip-path:path('${OFFICIAL_GEMINI_SPARK_D}')"><g style="filter:blur(2.7px)">` +
      `<ellipse cx="9.4" cy="4.4" rx="7.0" ry="6.0" fill="${GOOGLE_COLORS.red}"/>` +
      `<ellipse cx="4.6" cy="13.2" rx="6.2" ry="5.6" fill="${GOOGLE_COLORS.yellow}"/>` +
      `<ellipse cx="10.4" cy="20.2" rx="6.6" ry="5.6" fill="${GOOGLE_COLORS.green}"/>` +
      `<ellipse cx="18.0" cy="10.8" rx="6.8" ry="6.4" fill="#3B82F6"/>` +
      `</g></g>`;

    const xGlow = tier === 'xhigh'
      ? `<path class="ai-part-orbit-outer" d="${OFFICIAL_GEMINI_SPARK_D}" stroke="#4285F4" stroke-width="0.95" opacity="0.62" transform="scale(1.06)" style="transform-origin:12px 12px"/>`
      : '';

    return (
      `<svg class="ag-spark-orbit-svg${cls}"${xmlns}${anim} data-brand="antigravity" data-tier="${esc(tier)}" data-monochrome="false" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"${extraAttrs(opts.attrs)}>` +
      `${xGlow}<g class="ai-part-spark-core">${meshBody}</g>${lock}</svg>`
    );
  }

  function renderGoogleSparkOrbitDataUri(opts = {}) {
    return `data:image/svg+xml,${encodeURIComponent(
      renderGoogleSparkOrbitSvg({ size: opts.size || 32, tier: opts.tier || 'auto', monochrome: Boolean(opts.monochrome), xmlns: true, animIcon: false })
    )}`;
  }

  const GEAR_PATH =
    'M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm7.4 6.2a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.68 2.68l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.98 1.46V21a1.9 1.9 0 1 1-3.8 0v-.08a1.6 1.6 0 0 0-.98-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.68-2.68l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.98H3a1.9 1.9 0 1 1 0-3.8h.08a1.6 1.6 0 0 0 1.46-.98 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.68-2.68l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .98-1.46V3a1.9 1.9 0 1 1 3.8 0v.08a1.6 1.6 0 0 0 .98 1.46h.08a1.6 1.6 0 0 0 1.76-.32l.06-.06a1.9 1.9 0 1 1 2.68 2.68l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.98H21a1.9 1.9 0 1 1 0 3.8h-.08a1.6 1.6 0 0 0-1.46.98Z';

  const pt = (c, d, ex = '') => `<path class="ai-part-${c}" d="${d}"${ex}/>`;
  const gp = (c, inner) => `<g class="ai-part-${c}">${inner}</g>`;

  /** 21 枚 lucide-animated & line-md 微动态 SVG 图标模板 */
  const TEMPLATES = Object.freeze({
    'panel-left': () => '<rect class="ai-part-frame" x="3" y="4" width="18" height="16" rx="3"/>' + pt('rail', 'M9.2 4v16'),
    'sparkles-pen': () =>
      pt('board', 'M11 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V13') +
      gp('pen', '<path d="M16.4 3.9a1.9 1.9 0 0 1 2.7 2.7L11.5 14.2l-3.4.8.8-3.4 7.5-7.7Z"/>') +
      pt('spark', 'M19 2.2v2.6M17.7 3.5h2.6', ' stroke-width="1.6"'),
    search: () => gp('lens', '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m15.7 15.7 4.5 4.5"/>'),
    pin: () => gp('pin', '<path d="M9 4h6l-1 5.2 2.8 2.5v1.5H7.2v-1.5L10 9.2 9 4Z"/><path d="M12 13.2V20"/>'),
    'clock-history': () => gp('dial', '<path d="M3.4 11a8.8 8.8 0 1 1 2 6.2"/><path d="M3.2 6.8V11h4.2"/>') + pt('hand', 'M12 7.4V12l3.1 1.9'),
    'folder-workspace': () =>
      pt('back', 'M3.5 18.5V6.5A2 2 0 0 1 5.5 4.5h4.1l2 2.2h6.9a2 2 0 0 1 2 2v9.8a1.5 1.5 0 0 1-1.5 1.5h-14a1.5 1.5 0 0 1-1.5-1.5Z') +
      pt('flap', 'M3.7 10.6h16.6'),
    'settings-gear': () => gp('gear', `<path d="${GEAR_PATH}"/>`),
    'trash-sweep': () =>
      gp('lid', '<path d="M4 6.5h16"/><path d="M9 6.5V4.8c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3v1.7"/>') +
      gp('bin', '<path d="M6.2 6.5 7 19.2c.06 1 .88 1.8 1.9 1.8h6.2c1.02 0 1.84-.8 1.9-1.8L17.8 6.5"/><path d="M10 10.5v6M14 10.5v6"/>'),
    'copy-check': (o) => {
      const ck = Boolean(o && o.active);
      return (
        `<g class="ai-part-copy" style="opacity:${ck ? 0 : 1}">` +
        pt('copy-back', 'M8 8V5.8C8 4.8 8.8 4 9.8 4h8.4C19.2 4 20 4.8 20 5.8v8.4c0 1-.8 1.8-1.8 1.8H16') +
        '<rect class="ai-part-copy-front" x="4" y="8" width="12" height="12" rx="2"/></g>' +
        pt('check', 'M5 12.8l4.4 4.4L19.4 7.2', ` data-path-length="22" style="opacity:${ck ? 1 : 0}"`)
      );
    },
    'plus-spin': () => gp('plus', '<path d="M12 5v14M5 12h14"/>'),
    'arrow-up-launch': () => gp('arrow', '<path d="M12 19V5"/><path d="m6.2 10.8 5.8-5.8 5.8 5.8"/>'),
    'chevron-right': () => pt('chevron', 'm9 6 6 6-6 6'),
    'chevron-down': () => pt('chevron', 'm6 9 6 6 6-6'),
    'more-horizontal': () =>
      [5.5, 12, 18.5].map((cx, i) => `<circle class="ai-part-d${i + 1}" cx="${cx}" cy="12" r="1.35" fill="currentColor"/>`).join(''),
    'radar-pulse': () =>
      '<circle class="ai-part-core" cx="12" cy="12" r="2.3"/>' +
      gp('wave', '<path d="M7.6 7.6a6.2 6.2 0 0 0 0 8.8M16.4 7.6a6.2 6.2 0 0 1 0 8.8"/><path d="M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 4.6a10.4 10.4 0 0 1 0 14.8"/>'),
    'sliders-tune': () =>
      gp('tracks', '<path d="M4 6.5h16M4 12h16M4 17.5h16" stroke-opacity="0.72"/>') +
      [[9, 6.5], [15, 12], [10, 17.5]].map(([x, y], i) => `<circle class="ai-part-k${i + 1}" cx="${x}" cy="${y}" r="2.1" fill="var(--card,var(--bg-elevated,#141518))"/>`).join(''),
    'sun-moon': () =>
      gp('celestial', '<path d="M12 7.6a4.4 4.4 0 1 0 4.4 4.4 3.4 3.4 0 0 1-4.4-4.4Z"/>') +
      gp('rays', '<path d="M12 2.8v1.8M12 19.4v1.8M4.2 12H2.4M21.6 12h-1.8M6.1 6.1 4.8 4.8M19.2 19.2l-1.3-1.3M17.9 6.1l1.3-1.3M4.8 19.2l1.3-1.3"/>'),
    'layers-stack': () => pt('top', 'M12 3.5 3.2 8 12 12.5 20.8 8 12 3.5Z') + pt('mid', 'm3.2 12 8.8 4.5 8.8-4.5') + pt('bot', 'm3.2 16 8.8 4.5 8.8-4.5'),
    'zap-bolt': () => pt('bolt', 'M13.2 2.8 4.8 13.4h6.3L10.3 21.2l8.9-10.6h-6.3l.3-7.8Z'),
    'alert-triangle': () => gp('triangle', '<path d="M10.3 4.2 2.9 17.2a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/>' + pt('mark', 'M12 9.5v4.2M12 17h.01')),
    'x-close': () => gp('cross', '<path d="M17.5 6.5 6.5 17.5M6.5 6.5l11 11"/>'),
  });

  const ICON_ALIASES = Object.freeze({
    trash: 'trash-sweep', copy: 'copy-check', settings: 'settings-gear', clock: 'clock-history',
    history: 'clock-history', folder: 'folder-workspace', plus: 'plus-spin', 'arrow-up': 'arrow-up-launch',
    send: 'arrow-up-launch', sliders: 'sliders-tune', layers: 'layers-stack', zap: 'zap-bolt',
    alert: 'alert-triangle', close: 'x-close', x: 'x-close', sidebar: 'panel-left',
    'new-chat': 'sparkles-pen', automations: 'zap-bolt',
  });

  const tf = (...a) => a.map((transform) => ({ transform }));
  const tx = (d) => tf('translateX(0px)', `translateX(${d}px)`, 'translateX(0px)');
  const ty = (d) => tf('translateY(0px)', `translateY(${d}px)`, 'translateY(0px)');
  const st = (part, origin, keyframes, ex) => ({ part, origin, keyframes, ...ex });
  const C = '12px 12px';

  const ICON_SPECS = Object.freeze({
    'google-spark-orbit': {
      hover: [
        st('.ai-part-spark-core', C, tf('scale(1) rotate(0deg)', 'scale(1.1) rotate(8deg)', 'scale(1) rotate(0deg)'), { stiffness: 360, damping: 22 }),
      ],
    },
    'panel-left': {
      hover: [st('.ai-part-rail', '9.2px 12px', tx(1.9))],
      states: {
        collapse: [st('.ai-part-rail', '9.2px 12px', tx(-2.2))],
        expand: [st('.ai-part-rail', '9.2px 12px', tf('translateX(-2px)', 'translateX(2.2px)', 'translateX(0px)'))],
      },
    },
    'sparkles-pen': {
      hover: [
        st('.ai-part-pen', '11.5px 14px', tf('rotate(0deg)', 'rotate(-9deg) translate(0.6px,-0.6px)', 'rotate(4deg)', 'rotate(0deg)'), { damping: 20 }),
        st('.ai-part-spark', '19px 3.5px', tf('scale(1) rotate(0deg)', 'scale(1.32) rotate(22deg)', 'scale(1) rotate(0deg)'), { delay: 40, damping: 18 }),
      ],
    },
    search: { hover: [st('.ai-part-lens', '10.8px 10.8px', tf('scale(1) rotate(0deg)', 'scale(1.08) rotate(-11deg)', 'scale(1) rotate(0deg)'))] },
    pin: { hover: [st('.ai-part-pin', C, ty(2.2), { stiffness: 460, damping: 20 })] },
    'clock-history': { hover: [st('.ai-part-hand', C, tf('rotate(0deg)', 'rotate(360deg)'), { stiffness: 280, damping: 24 })] },
    'folder-workspace': { hover: [st('.ai-part-flap', '12px 19px', tf('translateY(0px) scaleY(1)', 'translateY(1.2px) scaleY(0.88)', 'translateY(0px) scaleY(1)'))] },
    'settings-gear': { hover: [st('.ai-part-gear', C, tf('rotate(0deg)', 'rotate(65deg)', 'rotate(0deg)'), { stiffness: 320 })] },
    'trash-sweep': {
      hover: [st('.ai-part-lid', '5px 6.5px', tf('translateY(0px) rotate(0deg)', 'translateY(-1.6px) rotate(-16deg)', 'translateY(0px) rotate(0deg)'), { damping: 18 })],
      states: {
        sweep: [
          st('.ai-part-lid', '5px 6.5px', tf('translateY(0px) rotate(0deg)', 'translateY(-2.4px) rotate(-20deg)', 'translateY(-1px) rotate(-8deg)', 'translateY(0px) rotate(0deg)'), { damping: 16 }),
          st('.ai-part-bin', '12px 14px', tf('rotate(0deg)', 'rotate(3.5deg)', 'rotate(-2.5deg)', 'rotate(0deg)'), { delay: 35 }),
        ],
      },
    },
    'copy-check': {
      hover: [
        st('.ai-part-copy-front', '10px 14px', tf('translate(0px,0px)', 'translate(-1.1px,1.1px)', 'translate(0px,0px)')),
        st('.ai-part-copy-back', '14px 10px', tf('translate(0px,0px)', 'translate(1.1px,-1.1px)', 'translate(0px,0px)')),
      ],
      states: {
        check: [st('.ai-part-check', C, tf('scale(0.84)', 'scale(1.06)', 'scale(1)'), { drawStroke: true, stiffness: 340 })],
        copy: [st('.ai-part-copy', C, [{ transform: 'scale(0.9)', opacity: 0.5 }, { transform: 'scale(1)', opacity: 1 }])],
      },
    },
    'plus-spin': { hover: [st('.ai-part-plus', C, tf('rotate(0deg)', 'rotate(90deg)'), { stiffness: 380 })] },
    'arrow-up-launch': {
      hover: [st('.ai-part-arrow', C, ty(-2.2))],
      states: { launch: [st('.ai-part-arrow', C, tf('translateY(0px) scale(1)', 'translateY(2.4px) scale(0.92)', 'translateY(-4.6px) scale(1.06)', 'translateY(0px) scale(1)'), { stiffness: 460, damping: 19 })] },
    },
    'chevron-right': {
      hover: [st('.ai-part-chevron', C, tx(1.9))],
      states: {
        open: [st('.ai-part-chevron', C, tf('rotate(0deg)', 'rotate(90deg)'), { fill: 'forwards' })],
        close: [st('.ai-part-chevron', C, tf('rotate(90deg)', 'rotate(0deg)'), { fill: 'forwards' })],
      },
    },
    'chevron-down': {
      hover: [st('.ai-part-chevron', C, ty(1.8))],
      states: {
        open: [st('.ai-part-chevron', C, tf('rotate(0deg)', 'rotate(180deg)'), { fill: 'forwards' })],
        close: [st('.ai-part-chevron', C, tf('rotate(180deg)', 'rotate(0deg)'), { fill: 'forwards' })],
      },
    },
    'more-horizontal': {
      hover: [
        st('.ai-part-d1', '5.5px 12px', ty(-2.4), { delay: 0, damping: 20 }),
        st('.ai-part-d2', C, ty(-2.4), { delay: 55, damping: 20 }),
        st('.ai-part-d3', '18.5px 12px', ty(-2.4), { delay: 110, damping: 20 }),
      ],
    },
    'radar-pulse': { hover: [st('.ai-part-wave', C, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.13)', opacity: 0.72 }, { transform: 'scale(1)', opacity: 1 }], { stiffness: 340, damping: 19 })] },
    'sliders-tune': {
      hover: [
        st('.ai-part-k1', '9px 6.5px', tx(3.2)),
        st('.ai-part-k2', '15px 12px', tx(-3.6), { delay: 25 }),
        st('.ai-part-k3', '10px 17.5px', tx(2.8), { delay: 50 }),
      ],
    },
    'sun-moon': {
      hover: [
        st('.ai-part-celestial', C, tf('rotate(0deg) scale(1)', 'rotate(-24deg) scale(1.08)', 'rotate(0deg) scale(1)'), { stiffness: 360, damping: 20 }),
        st('.ai-part-rays', C, tf('rotate(0deg) scale(1)', 'rotate(35deg) scale(1.08)', 'rotate(0deg) scale(1)'), { stiffness: 340 }),
      ],
    },
    'layers-stack': { hover: [st('.ai-part-top', '12px 8px', ty(-1.9)), st('.ai-part-bot', '12px 18px', ty(1.9))] },
    'zap-bolt': { hover: [st('.ai-part-bolt', C, tf('scale(1) rotate(0deg)', 'scale(1.15) rotate(-7deg)', 'scale(0.97) rotate(3deg)', 'scale(1) rotate(0deg)'), { stiffness: 480, damping: 18 })] },
    'alert-triangle': { hover: [st('.ai-part-triangle', '12px 13px', tf('rotate(0deg)', 'rotate(-9deg)', 'rotate(8deg)', 'rotate(-4deg)', 'rotate(0deg)'), { stiffness: 460, damping: 16 })] },
    'x-close': { hover: [st('.ai-part-cross', C, tf('rotate(0deg) scale(1)', 'rotate(90deg) scale(1.06)', 'rotate(90deg) scale(1)'))] },
  });

  const ICON_NAMES = Object.freeze(Object.keys(TEMPLATES));
  const resolveIconName = (name) => {
    const raw = String(name || '').trim();
    return TEMPLATES[raw] ? raw : ICON_ALIASES[raw] || '';
  };

  function renderIcon(name, opts = {}) {
    const id = resolveIconName(name);
    if (!id) return '';
    const size = +opts.size > 0 ? +opts.size : 15;
    const sw = +opts.strokeWidth > 0 ? +opts.strokeWidth : 1.8;
    const active = Boolean(opts.active);
    const cls = opts.className ? ` ${esc(opts.className)}` : '';
    const stAttr = id === 'copy-check' ? ` data-icon-state="${active ? 'check' : 'copy'}"` : active ? ' data-icon-state="active"' : '';
    return (
      `<svg class="ag-anim-icon ag-icon-${id}${active ? ' is-active' : ''}${cls}" data-anim-icon="${id}"${stAttr} ` +
      `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extraAttrs(opts.attrs)}>` +
      TEMPLATES[id](opts) +
      `</svg>`
    );
  }

  return Object.freeze({
    GOOGLE_COLORS,
    ICON_NAMES,
    ICON_ALIASES,
    ICON_SPECS,
    resolveIconName,
    renderGoogleSparkOrbitSvg,
    renderGoogleSparkOrbitDataUri,
    renderIcon,
  });
});
;

/* ===== module: prism-rim-canvas.js ===== */
// Obsidian Prism — Zero-StyleRecalc 300Hz GPU Canvas Prism Rim & Orchestrator Rim Module (prism-rim-canvas.js)
(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G) return;

  const RIM_PALETTES = Object.fromEntries(
    (
      'default|0=rgba(255,255,255,0.96)/.24=#4285F4/.5=#9B72CB/.74=#EA4335/.92=#FBBC04/1=rgba(251,188,4,0)|0=#2563EB/.32=#7C3AED/.64=#EA4335/.88=#D97706/1=rgba(217,119,6,0);' +
      'warm|0=rgba(255,246,238,0.95)/.26=#F6BD60/.54=#F0A37E/.82=#D97757/1=rgba(217,119,87,0)|0=#9A3412/.34=#C25934/.68=#D97757/.9=#D97706/1=rgba(217,119,6,0);' +
      'cobalt|0=rgba(240,249,255,0.96)/.26=#7CE2FF/.56=#4285F4/.86=#1B49B2/1=rgba(27,73,178,0)|0=#1D4ED8/.35=#2563EB/.7=#0284C7/.92=#38BDF8/1=rgba(56,189,248,0);' +
      'iris|0=rgba(245,243,255,0.95)/.26=#DDD6FE/.56=#A58AF8/.86=#6D28D9/1=rgba(109,40,217,0)|0=#5B21B6/.36=#7C3AED/.7=#8B5CF6/.92=#A855F7/1=rgba(168,85,247,0);' +
      'amber|0=rgba(255,251,235,0.95)/.26=#FDE68A/.56=#F2B84B/.86=#D97706/1=rgba(217,119,6,0)|0=#92400E/.36=#B45309/.7=#D97706/.92=#F59E0B/1=rgba(245,158,11,0);' +
      'mono|0=rgba(248,250,252,0.92)/.28=#E2E8F0/.6=#94A3B8/.88=#64748B/1=rgba(100,116,139,0)|0=#1E293B/.36=#334155/.7=#64748B/.92=#94A3B8/1=rgba(148,163,184,0)'
    )
      .split(';')
      .map((b) => {
        const [k, d, l] = b.split('|');
        const p = (x) => x.split('/').map((t) => { const [u, v] = t.split('='); return [+u, v]; });
        return [k, { dark: p(d), light: p(l) }];
      })
  );

  const isFn = (v) => typeof v === 'function';
  const ga = (e, k) => e?.getAttribute?.(k);
  const ra = (e, k) => e?.removeAttribute?.(k);
  const dis = (e) => !e || e.isConnected === false;
  const addS = (g, a) => { for (let i = 0; i < a.length; i += 2) g.addColorStop(a[i], a[i + 1]); return g; };
  const palS = (g, tk, dk) => { for (const [o, c] of (RIM_PALETTES[tk] || RIM_PALETTES.default)[dk ? 'dark' : 'light']) g.addColorStop(o, c); return g; };
  const rg = (rgb, a) => `rgba(${rgb},${a.toFixed(4)})`;
  const PB = 'data-ag-cs-prism-box', PM = 'data-ag-cs-prism-mirror', CV_A = 'data-ag-cs-prism-cv', CV_C = 'ag-cs-prism-rim-cv', CV_S = '.' + CV_C;

  const parseAmbientScale = (raw) =>
    G.__agPrismRipple?.parseAmbientScale
      ? G.__agPrismRipple.parseAmbientScale(raw)
      : raw == null || raw === ''
      ? 1
      : Math.max(0, Math.min(1, Number(raw) > 1 ? Number(raw) / 100 : Number.isFinite(Number(raw)) ? Number(raw) : 1));

  function createPrismRimCanvasController({
    isDestroyed, isDarkTheme, motionReduced, getMinFrameGapMs, getAmbientIntensity, getAccentTone,
    canMountRealCanvas, setAttrIfChanged, runGuardedMut, getActiveCrystalTrack, setCrystalPointerClient,
    onPointerActivity, onComposerRimUpdate,
  }) {
    const lastPointerPos = { x: -9999, y: -9999 };
    let prismRaf = 0, idleT = 0, lastPrismDrawAt = 0, prismBoxCacheDirty = true, prismBoxCacheAt = 0, lastPrismRectReadAt = 0;
    let cachedPrismBoxes = [], cachedOrchEntry = null, prismBoxRo = null, stepPlanIo = null, compRimSig = '0';
    const observedPrismSet = new Set(), trackedRimCanvases = new Set(), spObs = new Set(), spVis = new Map(), spOn = new Set();

    const getDoc = () => (typeof document !== 'undefined' ? document : null);
    const getHtml = () => getDoc()?.documentElement || null;
    const unobs = (o, s, e) => { if (s.has(e)) { try { o?.unobserve?.(e); } catch {} s.delete(e); } };

    const emitComposerRim = (v) => {
      if (!isFn(onComposerRimUpdate)) return;
      const on = Boolean(v && v.strength > 0.015);
      const sig = on ? `1|${Math.round(v.localX / 6)}|${Math.round(v.strength * 12)}|${v.toneKey}|${v.dark ? 1 : 0}` : '0';
      if (sig === compRimSig) return;
      compRimSig = sig;
      try { onComposerRimUpdate(on ? { active: true, localX: v.localX, strength: v.strength, toneKey: v.toneKey, dark: v.dark } : { active: false, localX: -9999, strength: 0, toneKey: 'default', dark: true }); } catch {}
    };

    const readAmbientScale = () => parseAmbientScale(getAmbientIntensity ? getAmbientIntensity() : ga(getHtml(), 'data-ag-cs-ambient'));

    const resolveRimToneKey = (dark) => {
      const h = getHtml(), t = getAccentTone?.() || ga(h, 'data-ag-cs-accent') || 'follow';
      if (t === 'mono' || t === 'cobalt' || t === 'iris' || t === 'amber') return t;
      const p = ga(h, 'data-ag-cs-palette') || 'obsidian';
      return p === 'warm' || p === 'claude' || (!dark && p === 'obsidian' && ga(h, 'data-ag-cs-light-preset') === 'alabaster') ? 'warm' : 'default';
    };

    const isRimMotionDisabled = () => {
      if (motionReduced?.()) return true;
      const m = ga(getHtml(), 'data-ag-cs-motion') || '';
      return m === 'off' || m === 'subtle';
    };

    const isH = () => Boolean(getDoc()?.hidden);
    const isWB = () => isH() || ga(getHtml(), 'data-ag-cs-win-blur') === '1';
    const isDragSuspended = () => { const h = getHtml(); return ga(h, 'data-ag-cs-resizing') === '1' || ga(h, 'data-ag-cs-mascot-drag') === '1'; };
    const clrIdle = () => { if (idleT) { isFn(G.clearTimeout) && clearTimeout(idleT); idleT = 0; } };
    const zCv = (c) => { if (c && (c.width || c.height)) c.width = c.height = 0; };
    const zEnt = (e, all) => { if (e && (all || e.wasCleared)) { e._s = ''; e._g = null; e._gk = ''; e.wasCleared = true; zCv(e.cv); } };

    const shrinkRims = (all) => {
      clrIdle();
      if (!all && isDestroyed()) return;
      for (const e of cachedPrismBoxes) zEnt(e, all);
      zEnt(cachedOrchEntry, all);
      if (all) {
        emitComposerRim(null);
        for (const c of trackedRimCanvases) zCv(c);
        getDoc()?.querySelectorAll?.(CV_S)?.forEach?.(zCv);
      }
    };
    const armIdle = () => {
      if (isDestroyed() || typeof setTimeout !== 'function') return;
      const ok = (e) => e?.wasCleared && e.cv && (e.cv.width > 0 || e.cv.height > 0);
      if (!ok(cachedOrchEntry) && !cachedPrismBoxes.some(ok)) return clrIdle();
      if (!idleT) idleT = setTimeout(() => shrinkRims(0), 1800);
    };

    const clearRimEntry = (e) => {
      if (!e) return;
      e._s = '';
      if (e.ctx && e.cv && e.cv.width > 0 && e.cv.height > 0 && !e.wasCleared) {
        try { e.ctx.clearRect(0, 0, e.cv.width, e.cv.height); } catch {}
        e.wasCleared = true;
      }
    };

    const clearAllRimCanvases = (immediateShrink = false) => {
      cachedPrismBoxes.forEach(clearRimEntry);
      clearRimEntry(cachedOrchEntry);
      emitComposerRim(null);
      getDoc()?.querySelectorAll?.(CV_S)?.forEach?.((cv) => {
        try { const ctx = cv.getContext?.('2d'); if (ctx && cv.width > 0 && cv.height > 0) ctx.clearRect(0, 0, cv.width, cv.height); } catch {}
      });
      if (immediateShrink) shrinkRims(1);
      else armIdle();
    };

    const removeSingleRimCanvas = (cv) => {
      if (!cv) return;
      trackedRimCanvases.delete(cv);
      const host = cv.parentElement;
      try { const ctx = cv.getContext?.('2d'); if (ctx && cv.width > 0 && cv.height > 0) ctx.clearRect(0, 0, cv.width, cv.height); } catch {}
      zCv(cv);
      cv.remove?.();
      if (host?.hasAttribute?.(CV_A)) ra(host, CV_A);
    };

    const pruneDetachedBoxes = (activeTrack) => {
      const keepBox = (b) => !dis(b) && ga(b, PB) === '1';
      if (cachedPrismBoxes.length) {
        let kept = null;
        for (let i = 0; i < cachedPrismBoxes.length; i++) {
          const e = cachedPrismBoxes[i];
          if (e && keepBox(e.box)) { if (kept) kept.push(e); }
          else {
            if (!kept) kept = cachedPrismBoxes.slice(0, i);
            if (e?.cv) removeSingleRimCanvas(e.cv);
            if (e?.box) unobs(prismBoxRo, observedPrismSet, e.box);
          }
        }
        if (kept) cachedPrismBoxes = kept;
      }
      if (cachedOrchEntry && (dis(cachedOrchEntry.box) || (activeTrack && cachedOrchEntry.box !== activeTrack))) {
        if (cachedOrchEntry.cv) removeSingleRimCanvas(cachedOrchEntry.cv);
        if (cachedOrchEntry.box) unobs(prismBoxRo, observedPrismSet, cachedOrchEntry.box);
        cachedOrchEntry = null;
      }
      for (const box of Array.from(observedPrismSet)) if (dis(box) || (ga(box, PB) !== '1' && box !== activeTrack)) unobs(prismBoxRo, observedPrismSet, box);
    };

    const pruneOrphanRimCanvases = (fullScan = true) => {
      const activeTrack = getActiveCrystalTrack?.() || null;
      pruneDetachedBoxes(activeTrack);
      const d = getDoc();
      if (!d || !isFn(d.querySelectorAll)) return;
      const keepHost = (h) => !dis(h) && (ga(h, PB) === '1' || (activeTrack && h === activeTrack));
      if (!fullScan) {
        for (const cv of Array.from(trackedRimCanvases)) if (dis(cv) || !keepHost(cv.parentElement)) removeSingleRimCanvas(cv);
        return;
      }
      for (const cv of Array.from(trackedRimCanvases)) if (dis(cv)) trackedRimCanvases.delete(cv);
      d.querySelectorAll(CV_S).forEach((cv) => { if (!keepHost(cv.parentElement)) removeSingleRimCanvas(cv); else trackedRimCanvases.add(cv); });
      d.querySelectorAll(`[${CV_A}]`).forEach((h) => { if (!keepHost(h) || !h.querySelector?.(CV_S)) ra(h, CV_A); });
    };

    const ensurePrismRimCanvas = (hostEl) => {
      if (!hostEl || !canMountRealCanvas(hostEl)) return null;
      let cv = null;
      for (let c = hostEl.firstElementChild; c; c = c.nextElementSibling) if (c.classList?.contains(CV_C)) { cv = c; break; }
      if (!cv) {
        cv = document.createElement('canvas');
        cv.className = CV_C;
        cv.width = cv.height = 0;
        cv.setAttribute('aria-hidden', 'true');
        cv.setAttribute('data-ag-no-i18n', '');
        if (cv.style?.setProperty) for (const k of ['margin', 'padding', 'border']) cv.style.setProperty(k, '0', 'important');
        hostEl.appendChild(cv);
      }
      trackedRimCanvases.add(cv);
      const ctx = isFn(cv.getContext) ? cv.getContext('2d') : null;
      if (!ctx || !isFn(ctx.createRadialGradient)) { cv.remove(); return null; }
      setAttrIfChanged(hostEl, CV_A, '1');
      return { cv, ctx };
    };

    const strokeRoundedRectPath = (ctx, x, y, w, h, r) => {
      ctx.beginPath();
      if (isFn(ctx.roundRect)) { ctx.roundRect(x, y, w, h, r); return; }
      const cr = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
      ctx.moveTo(x + cr, y);
      ctx.arcTo(x + w, y, x + w, y + h, cr);
      ctx.arcTo(x + w, y + h, x, y + h, cr);
      ctx.arcTo(x, y + h, x, y, cr);
      ctx.arcTo(x, y, x + w, y, cr);
      ctx.closePath();
    };

    const traceGhost = (ctx, s) => {
      ctx.beginPath();
      const pts = [0, 0, 0, 13.8, 3.6, 10.5, 6.1, 15.6, 8, 14.7, 5.5, 9.6, 10.1, 9.6];
      ctx.moveTo(0, 0);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * s, pts[i + 1] * s);
      ctx.closePath();
    };

    const drawMirrorCursorReflection = (ctx, gx, gy, w, h, dpr, dark, effAlpha, rectW, rectH, localX, localY) => {
      if ((rectW || 0) * (rectH || 0) > 120000) return;
      const distOut = Math.hypot(localX < 0 ? -localX : localX > rectW ? localX - rectW : 0, localY < 0 ? -localY : localY > rectH ? localY - rectH : 0);
      if (distOut > 42) return;
      const a = effAlpha * Math.max(0, 1 - distOut / 42) * (dark ? 1 : 0.65);
      if (a <= 0.01) return;
      const rx = gx + 3.2 * dpr, ry = gy + 4.2 * dpr;
      ctx.fillStyle = addS(
        ctx.createRadialGradient(rx + 2 * dpr, ry + 3 * dpr, 0, rx + 2 * dpr, ry + 3 * dpr, 26 * dpr),
        dark ? [0, rg('248,252,255', 0.135 * a), 0.45, rg('216,232,252', 0.05 * a), 1, 'rgba(200,220,250,0)'] : [0, rg('37,99,235', 0.065 * a), 1, 'rgba(37,99,235,0)']
      );
      ctx.fillRect(0, 0, w, h);
      const drawLayer = (ox, oy, s, x1, y1, st) => {
        ctx.save(); ctx.translate(rx + ox * dpr, ry + oy * dpr); traceGhost(ctx, s);
        ctx.fillStyle = addS(ctx.createLinearGradient(0, 0, x1 * s, y1 * s), st); ctx.fill(); ctx.restore();
      };
      drawLayer(-0.55, -0.55, 1.18 * dpr, 8, 16, dark ? [0, rg('232,242,255', 0.055 * a), 0.55, rg('204,224,248', 0.024 * a), 1, 'rgba(180,205,238,0)'] : [0, rg('15,23,42', 0.032 * a), 1, 'rgba(15,23,42,0)']);
      drawLayer(0, 0, 1.04 * dpr, 7, 15, dark ? [0, rg('252,254,255', 0.115 * a), 0.45, rg('222,235,252', 0.048 * a), 1, rg('190,210,240', 0.006 * a)] : [0, rg('15,23,42', 0.06 * a), 1, 'rgba(15,23,42,0.004)']);
    };

    const paintPrismRimCanvas = (entry, active, localX, localY, radius, dark, toneKey = 'default', ambientScale = 1) => {
      if (isDragSuspended()) return true;
      if (!entry || !entry.ctx || !entry.cv || !entry.rect) return false;
      if (!active || ambientScale <= 0.001) { clearRimEntry(entry); return true; }
      const isMirror = Boolean(entry.mirrorMode), isReflB = !isMirror && Boolean(entry.reflectBottomMode);
      const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || G.devicePixelRatio || 1, 1.5);
      const w = Math.max(4, Math.round((entry.rect.width + (entry.insetPad || 0)) * dpr));
      const h = Math.max(4, Math.round((entry.rect.height + (entry.insetPad || 0)) * dpr));
      const cssR = entry.borderRadius > 0 ? entry.borderRadius : 10;
      const effA = Math.max(0, Math.min(1, ambientScale * (!isMirror && toneKey === 'mono' ? 0.58 : 1)));
      const sig = `${w}|${h}|${radius}|${dark ? 1 : 0}|${isMirror ? 'm' : toneKey}|${isReflB ? 'b' : ''}|${effA.toFixed(3)}|${cssR}|${entry.insetPad || 0}`;
      if (!entry.wasCleared && entry.cv.width === w && entry.cv.height === h && entry._s === sig && Math.abs(localX - entry._x) < 1.5 && Math.abs(localY - entry._y) < 1.5) return true;
      if (entry.cv.width !== w || entry.cv.height !== h) { entry.cv.width = w; entry.cv.height = h; }
      entry.wasCleared = false; entry._s = sig; entry._x = localX; entry._y = localY;
      const ctx = entry.ctx;
      ctx.clearRect(0, 0, w, h);
      const padOff = entry.insetPad ? entry.insetPad * 0.5 : 0;
      const gx = (localX + padOff) * dpr, gy = (localY + padOff) * dpr, gr = radius * dpr;
      const inset = (entry.insetPad ? 1 : 0.75) * dpr, rw = Math.max(2, w - inset * 2), rh = Math.max(2, h - inset * 2), rr = Math.min(rw * 0.5, rh * 0.5, cssR * dpr);
      const prevA = ctx.globalAlpha;

      if (isMirror) {
        if (isFn(ctx.save) && isFn(ctx.clip) && isFn(ctx.fillRect)) {
          ctx.save();
          strokeRoundedRectPath(ctx, 0, 0, w, h, Math.min(w * 0.5, h * 0.5, cssR * dpr));
          ctx.clip();
          ctx.fillStyle = addS(
            ctx.createRadialGradient(gx, gy, 0, gx, gy, 210 * dpr),
            dark ? [0, rg('238,245,255', 0.068 * effA), 0.42, rg('206,224,250', 0.026 * effA), 0.8, rg('180,202,238', 0.006 * effA), 1, 'rgba(180,202,238,0)'] : [0, rg('37,99,235', 0.042 * effA), 0.5, rg('37,99,235', 0.014 * effA), 1, 'rgba(37,99,235,0)']
          );
          ctx.fillRect(0, 0, w, h);
          if (isFn(ctx.translate) && isFn(ctx.createLinearGradient)) drawMirrorCursorReflection(ctx, gx, gy, w, h, dpr, dark, effA, entry.rect.width, entry.rect.height, localX, localY);
          ctx.restore();
        }
        ctx.globalAlpha = effA;
        strokeRoundedRectPath(ctx, inset, inset, rw, rh, rr);
        ctx.lineWidth = 1.35 * dpr;
        ctx.strokeStyle = addS(
          ctx.createRadialGradient(gx, gy, 0, gx, gy, gr),
          dark ? [0, 'rgba(255,255,255,0.95)', 0.24, 'rgba(232,240,252,0.56)', 0.54, 'rgba(186,202,228,0.18)', 0.85, 'rgba(148,168,198,0.03)', 1, 'rgba(148,168,198,0)'] : [0, 'rgba(30,64,175,0.52)', 0.42, 'rgba(59,130,246,0.2)', 1, 'rgba(59,130,246,0)']
        );
        ctx.stroke();
        ctx.globalAlpha = prevA !== undefined ? prevA : 1;
        return true;
      }

      if (isReflB) {
        const gyR = h + 16 * dpr, grR = Math.max(radius * 1.15, 220) * dpr, ob = localY - entry.rect.height;
        const aR = effA * 0.46 * (ob > 150 ? Math.max(0, 1 - (ob - 150) / 190) : localY < 0 ? Math.max(0, 1 + localY / 80) : 1);
        if (aR > 0.004) {
          ctx.globalAlpha = aR;
          strokeRoundedRectPath(ctx, inset, inset, rw, rh, rr);
          ctx.lineWidth = 1.15 * dpr;
          ctx.strokeStyle = palS(ctx.createRadialGradient(gx, gyR, 0, gx, gyR, grR), toneKey, dark);
          ctx.stroke();
          if (isFn(ctx.save) && isFn(ctx.clip)) {
            ctx.save(); strokeRoundedRectPath(ctx, inset, inset, rw, rh, rr); ctx.clip();
            const wh = Math.min(rh, 14 * dpr), wc = dark ? '255,255,255' : '59,130,246';
            ctx.globalAlpha = 1;
            ctx.fillStyle = addS(ctx.createRadialGradient(gx, h + 2 * dpr, 0, gx, h + 2 * dpr, Math.max(grR * 0.72, 160 * dpr)), [0, rg(wc, 0.032 * aR), 1, `rgba(${wc},0)`]);
            ctx.fillRect(0, Math.max(0, h - wh), w, wh);
            ctx.restore();
          }
          if (isFn(ctx.createLinearGradient) && isFn(ctx.save)) {
            ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.globalAlpha = 1;
            ctx.fillStyle = addS(ctx.createLinearGradient(0, h, 0, 0), [0, 'rgba(0,0,0,1)', 0.22, 'rgba(0,0,0,0.68)', 0.48, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0)']);
            ctx.fillRect(0, 0, w, h); ctx.restore();
          }
        }
        ctx.globalAlpha = prevA !== undefined ? prevA : 1;
        return true;
      }

      if (isFn(ctx.save) && isFn(ctx.translate) && isFn(ctx.restore)) {
        const gKey = `${gr}|${dark ? 1 : 0}|${toneKey}`;
        let grad = entry._gk === gKey ? entry._g : null;
        if (!grad) { grad = palS(ctx.createRadialGradient(0, 0, 0, 0, 0, gr), toneKey, dark); entry._g = grad; entry._gk = gKey; }
        ctx.save(); ctx.globalAlpha = effA; ctx.translate(gx, gy);
        strokeRoundedRectPath(ctx, inset - gx, inset - gy, rw, rh, rr);
        ctx.lineWidth = 1.45 * dpr; ctx.strokeStyle = grad; ctx.stroke(); ctx.restore();
      } else {
        ctx.globalAlpha = effA;
        strokeRoundedRectPath(ctx, inset, inset, rw, rh, rr);
        ctx.lineWidth = 1.45 * dpr; ctx.strokeStyle = palS(ctx.createRadialGradient(gx, gy, 0, gx, gy, gr), toneKey, dark); ctx.stroke();
      }
      ctx.globalAlpha = prevA !== undefined ? prevA : 1;
      return true;
    };

    const ensurePrismBoxRo = () => {
      if (prismBoxRo || typeof ResizeObserver !== 'function') return prismBoxRo;
      prismBoxRo = new ResizeObserver(() => {
        prismBoxCacheDirty = true;
        if (!isDestroyed() && !isWB() && !isDragSuspended() && !isRimMotionDisabled() && readAmbientScale() > 0.001 && lastPointerPos.x >= -1000 && !prismRaf && isFn(G.requestAnimationFrame)) {
          if (cachedPrismBoxes.some((e) => !e.wasCleared) || Boolean(cachedOrchEntry && !cachedOrchEntry.wasCleared)) { lastPrismDrawAt = 0; schedRaf(); }
        }
      });
      return prismBoxRo;
    };

    const readBoxBorderRadius = (el, fb) => {
      if (!el || typeof getComputedStyle !== 'function') return fb;
      try { const v = parseFloat(getComputedStyle(el).borderTopLeftRadius || ''); return Number.isFinite(v) && v >= 0 ? v : fb; } catch { return fb; }
    };

    const spOk = (e) => !dis(e) && !e.hidden && ga(e, 'aria-hidden') !== 'true' && ga(e, 'data-state') !== 'closed' && ga(e, 'aria-expanded') !== 'false' && e.style?.display !== 'none' && e.style?.visibility !== 'hidden' && !/(?:^|\s)(?:hidden|sr-only|grid-rows-\[0fr\]|h-0|max-h-0)(?:\s|$)/.test(e.className || '');
    const inVp = (r) => !!(r && r.width >= 4 && r.height >= 4 && r.bottom > 0 && r.right > 0 && r.top < (G.innerHeight || 900) && r.left < (G.innerWidth || 1440));
    const spIo = () => {
      if (stepPlanIo || typeof IntersectionObserver !== 'function') return stepPlanIo;
      try {
        stepPlanIo = new IntersectionObserver((es) => {
          if (isDestroyed()) return;
          let ch = 0;
          for (const en of es) {
            const t = en?.target, br = en?.boundingClientRect;
            if (!t) continue;
            const on = en.isIntersecting && (!br || (br.width >= 4 && br.height >= 4)) ? 1 : 0;
            if (spVis.get(t) !== on) { spVis.set(t, on); ch = 1; }
          }
          if (ch) { prismBoxCacheDirty = true; syncSp(0); }
        });
      } catch { stepPlanIo = null; }
      return stepPlanIo;
    };
    const scanSp = (rd) => {
      const ps = Array.from(getDoc()?.querySelectorAll?.('[data-testid="step-plan"]') || []), des = new Set(), rcs = new Map();
      if (!isRimMotionDisabled() && readAmbientScale() > 0.001 && !isWB()) {
        for (let i = ps.length - 1; i >= 0 && des.size < 2; i--) {
          const e = ps[i];
          if (!spOk(e) || (spVis.has(e) && !spVis.get(e))) continue;
          if (rd && e.getBoundingClientRect) {
            const r = e.getBoundingClientRect();
            if (!inVp(r)) continue;
            rcs.set(e, r); des.add(e);
          } else if (spVis.get(e) || (!rd && spOn.has(e))) des.add(e);
        }
      }
      return { ps, des, rcs };
    };
    const applySp = (ps, des) => {
      const io = ps.length ? spIo() : stepPlanIo, pSet = new Set(ps);
      if (io) {
        for (const p of ps) if (!spObs.has(p)) { try { io.observe(p); spObs.add(p); } catch {} }
        for (const o of Array.from(spObs)) if (!pSet.has(o) || dis(o)) { unobs(io, spObs, o); spVis.delete(o); }
      }
      for (const s of Array.from(spOn)) if (!des.has(s)) {
        spOn.delete(s);
        try { ra(s, PB); ra(s, PM); s.style?.removeProperty?.('--ag-px'); s.style?.removeProperty?.('--ag-py'); } catch {}
      }
      for (const s of des) {
        setAttrIfChanged(s, PB, '1');
        setAttrIfChanged(s, PM, '1');
        spOn.add(s);
      }
    };
    const syncSp = (rd) => {
      if (isDestroyed()) return;
      const { ps, des } = scanSp(rd);
      if (!ps.length && !spOn.size && !spObs.size) return;
      runGuardedMut(() => { applySp(ps, des); pruneOrphanRimCanvases(false); });
    };

    const refreshPrismBoxRectCache = (now, allowReadRect) => {
      const sp = scanSp(allowReadRect), ro = ensurePrismBoxRo(), prevMap = new Map(), nextObserved = new Set(), next = [], bSet = new Set(), boxList = [];
      for (const e of cachedPrismBoxes) prevMap.set(e.box, e);
      for (const b of document.querySelectorAll(`[${PB}="1"]`) || []) if ((!spOn.has(b) || sp.des.has(b)) && !bSet.has(b)) { bSet.add(b); boxList.push(b); }
      for (const s of sp.des) if (!bSet.has(s)) { bSet.add(s); boxList.push(s); }
      const trackEl = getActiveCrystalTrack ? getActiveCrystalTrack() : null;
      let nextOrch = null;
      const preMeasured = boxList.map((box) => {
        const prev = prevMap.get(box);
        return { box, prev, borderRadius: prev && prev.borderRadius >= 0 ? prev.borderRadius : readBoxBorderRadius(box, 10), rect: sp.rcs.get(box) || (allowReadRect && box.getBoundingClientRect ? box.getBoundingClientRect() : null) };
      });
      const orchRect = trackEl && allowReadRect && trackEl.getBoundingClientRect ? trackEl.getBoundingClientRect() : null;
      const mkEntry = (box, rect, prev, insetPad, borderRadius, mirrorMode = false, reflectBottomMode = false) => {
        nextObserved.add(box);
        if (ro && !observedPrismSet.has(box)) { try { ro.observe(box); observedPrismSet.add(box); } catch {} }
        const reusePrev = Boolean(prev?.cv?.isConnected), rim = reusePrev ? prev : ensurePrismRimCanvas(box);
        return {
          box, rect, cv: rim ? rim.cv : null, ctx: rim ? rim.ctx : null, insetPad, mirrorMode, reflectBottomMode, borderRadius,
          wasCleared: prev ? prev.wasCleared : false, _s: prev?._s || '', _x: prev?._x ?? -9999, _y: prev?._y ?? -9999,
          _g: reusePrev ? (prev._g || null) : null, _gk: reusePrev ? (prev._gk || '') : '', pxStr: prev ? prev.pxStr : '', pyStr: prev ? prev.pyStr : '',
        };
      };
      runGuardedMut(() => {
        if (sp.ps.length || spOn.size || spObs.size) applySp(sp.ps, sp.des);
        for (const { box, prev, borderRadius, rect } of preMeasured) {
          const isHp = Boolean(box.classList?.contains?.('ag-cs-home-panel'));
          if (isHp && ga(box, PM) !== '1') setAttrIfChanged(box, PM, '1');
          const mirrorMode = ga(box, PM) === '1' || isHp, reflectBottomMode = !mirrorMode && ga(box, 'data-ag-cs-prism-reflect') === 'bottom';
          const pad = mirrorMode || isHp || ga(box, 'data-testid') === 'step-plan' ? 0 : 2;
          next.push(mkEntry(box, rect, prev, pad, borderRadius, mirrorMode, reflectBottomMode));
        }
        if (trackEl) nextOrch = mkEntry(trackEl, orchRect, cachedOrchEntry?.box === trackEl ? cachedOrchEntry : null, 0, 999, false, false);
        if (ro) for (const oldEl of Array.from(observedPrismSet)) if (!nextObserved.has(oldEl)) unobs(ro, observedPrismSet, oldEl);
        pruneOrphanRimCanvases();
      });
      cachedPrismBoxes = next; cachedOrchEntry = nextOrch; prismBoxCacheDirty = false; prismBoxCacheAt = now;
    };

    const flushPrismPointer = (rafNow) => {
      prismRaf = 0;
      if (isDestroyed()) return;
      if (isH()) return shrinkRims(1);
      if (isWB()) return;
      if (isDragSuspended()) { prismBoxCacheDirty = true; return; }
      const ambientScale = readAmbientScale();
      if (isRimMotionDisabled() || ambientScale <= 0.001) {
        runGuardedMut(() => { pruneOrphanRimCanvases(); clearAllRimCanvases(true); });
        return;
      }
      const now = typeof rafNow === 'number' && rafNow > 0 ? rafNow : performance.now();
      const minGap = Math.max(0, Number(getMinFrameGapMs?.() ?? 0) || 0);
      if (minGap > 0 && lastPrismDrawAt > 0 && now - lastPrismDrawAt < minGap) { schedRaf(); return; }
      lastPrismDrawAt = now;
      const { x, y } = lastPointerPos, allowReadRect = x >= -1000;
      const activeTrack = getActiveCrystalTrack ? getActiveCrystalTrack() : null;
      if (
        prismBoxCacheDirty || !cachedPrismBoxes.length || (!prismBoxRo && now - prismBoxCacheAt > 2500) || now - prismBoxCacheAt > 8000 ||
        activeTrack !== (cachedOrchEntry ? cachedOrchEntry.box : null) ||
        cachedPrismBoxes.some((e) => dis(e.box) || (e.cv && e.cv.isConnected === false) || e.borderRadius < 0 || (allowReadRect && !e.rect))
      ) {
        refreshPrismBoxRectCache(now, allowReadRect);
        lastPrismRectReadAt = now;
      } else if (allowReadRect && now - lastPrismRectReadAt >= (prismBoxRo ? 1500 : 250)) {
        lastPrismRectReadAt = now;
        for (const e of cachedPrismBoxes) if (e.box?.getBoundingClientRect) e.rect = e.box.getBoundingClientRect();
        if (cachedOrchEntry?.box?.getBoundingClientRect) cachedOrchEntry.rect = cachedOrchEntry.box.getBoundingClientRect();
      }
      const dark = isDarkTheme(), toneKey = resolveRimToneKey(dark);
      let compRim = null;
      const drawEntry = (entry, maxR, gradR, vx, vy, minW) => {
        const r = allowReadRect ? entry.rect : null;
        let inRange = false, lx = -9999, ly = -9999;
        if (r && r.width >= 4 && r.height >= 4 && (!minW || r.width >= minW)) {
          const hit = entry.reflectBottomMode
            ? x >= r.left - 240 && x <= r.right + 240 && y >= r.top - 80 && y <= r.bottom + 340
            : x >= r.left - maxR && x <= r.right + maxR && y >= r.top - maxR && y <= r.bottom + maxR;
          if (hit) { inRange = true; lx = x - r.left; ly = y - r.top; }
        }
        if (!entry.mirrorMode && !entry.reflectBottomMode && (entry.box?.classList?.contains?.('surface-composer-card') || entry.box?.hasAttribute?.('data-composer-card'))) {
          const st = inRange && Math.abs(ly) < 220 ? Math.min(1, ambientScale * (toneKey === 'mono' ? 0.62 : 1)) * (1 - Math.abs(ly) / 220) : 0;
          if (!compRim || st > compRim.strength) compRim = { localX: lx, strength: st, toneKey, dark };
        }
        if (entry.ctx && paintPrismRimCanvas(entry, inRange, lx, ly, gradR, dark, toneKey, ambientScale)) return;
        const nx = inRange ? `${lx.toFixed(1)}px` : '-9999px', ny = inRange ? `${ly.toFixed(1)}px` : '-9999px';
        if (entry.pxStr !== nx) { entry.pxStr = nx; entry.box.style.setProperty(vx, nx); }
        if (entry.pyStr !== ny) { entry.pyStr = ny; entry.box.style.setProperty(vy, ny); }
      };
      runGuardedMut(() => {
        for (const e of cachedPrismBoxes) drawEntry(e, 280, 240, '--ag-px', '--ag-py', 0);
        if (cachedOrchEntry) { drawEntry(cachedOrchEntry, 120, 96, '--orch-px', '--orch-py', 10); setCrystalPointerClient?.(x, y); }
      });
      emitComposerRim(compRim);
      armIdle();
    };

    const schedRaf = () => { if (!prismRaf && typeof requestAnimationFrame === 'function') prismRaf = requestAnimationFrame(flushPrismPointer); };
    const cancelPendingRaf = () => { if (prismRaf) { typeof cancelAnimationFrame === 'function' && cancelAnimationFrame(prismRaf); prismRaf = 0; } };

    const onPointerMove = (ev) => {
      if (isDestroyed() || isWB()) return;
      const x = Number(ev.clientX), y = Number(ev.clientY);
      lastPointerPos.x = x; lastPointerPos.y = y;
      if (isDragSuspended()) { prismBoxCacheDirty = true; return; }
      const now = performance.now();
      if (!isRimMotionDisabled() && readAmbientScale() > 0.001 && !prismRaf && typeof requestAnimationFrame === 'function') {
        const far = (e, d) => { const r = e.rect; return e.wasCleared && r && (r.width < 4 || r.height < 4 || x < r.left - d || x > r.right + d || y < r.top - d || y > r.bottom + d); };
        const farIdle = !prismBoxCacheDirty && cachedPrismBoxes.length > 0 && now - prismBoxCacheAt <= 6000 && now - lastPrismRectReadAt < 1500 && cachedPrismBoxes.every((e) => far(e, 360)) && (!cachedOrchEntry || far(cachedOrchEntry, 200));
        if (!farIdle) schedRaf();
      }
      onPointerActivity?.(now);
    };

    const onLeave = () => { if (!isDestroyed() && !isWB()) { lastPointerPos.x = lastPointerPos.y = -9999; schedRaf(); } };
    const onVis = () => {
      if (isDestroyed()) return;
      if (isH()) { cancelPendingRaf(); shrinkRims(1); }
      else if (!isWB() && !isRimMotionDisabled() && readAmbientScale() > 0.001 && lastPointerPos.x >= -1000) { lastPrismDrawAt = 0; schedRaf(); }
    };
    const onWinBlur = () => { if (!isDestroyed()) { cancelPendingRaf(); clearAllRimCanvases(); } };
    const bindEv = (m) => {
      const d = getDoc();
      d?.[m]?.('visibilitychange', onVis);
      d?.documentElement?.[m]?.('pointerleave', onLeave);
      if (typeof window !== 'undefined') window?.[m]?.('blur', onWinBlur);
    };
    bindEv('addEventListener');

    const invalidateMetrics = () => {
      prismBoxCacheDirty = true;
      for (const e of cachedPrismBoxes) e.borderRadius = -1;
      if (isDestroyed()) return;
      runGuardedMut(() => {
        pruneOrphanRimCanvases();
        if (isH()) { cancelPendingRaf(); shrinkRims(1); }
        else if (isRimMotionDisabled() || readAmbientScale() <= 0.001) { cancelPendingRaf(); clearAllRimCanvases(true); }
        else if (!isWB() && !isDragSuspended() && lastPointerPos.x >= -1000) { lastPrismDrawAt = 0; schedRaf(); }
      });
    };

    const markDirty = () => {
      prismBoxCacheDirty = true;
      if (isDestroyed()) return;
      syncSp(0);
      runGuardedMut(() => {
        pruneOrphanRimCanvases(false);
        if (isRimMotionDisabled() || readAmbientScale() <= 0.001) { cancelPendingRaf(); clearAllRimCanvases(true); }
      });
    };

    const teardown = () => {
      cancelPendingRaf(); emitComposerRim(null); bindEv('removeEventListener'); shrinkRims(1); trackedRimCanvases.clear();
      if (prismBoxRo) { try { prismBoxRo.disconnect(); } catch {} prismBoxRo = null; }
      observedPrismSet.clear();
      if (stepPlanIo) { try { stepPlanIo.disconnect(); } catch {} stepPlanIo = null; }
      spObs.clear(); spVis.clear();
      for (const s of spOn) { try { ra(s, PB); ra(s, PM); } catch {} }
      spOn.clear();
      const d = getDoc();
      if (d) {
        d.getElementById?.('ag-prism-dyn-vars')?.remove?.();
        d.querySelectorAll?.(CV_S)?.forEach?.((n) => n.remove?.());
        d.querySelectorAll?.(`[${CV_A}]`)?.forEach?.((e) => ra(e, CV_A));
      }
      cachedPrismBoxes = []; cachedOrchEntry = null;
    };

    return {
      onPointerMove, cancelPendingRaf,
      pauseForOverlay: () => { if (!isDestroyed() && isWB()) { cancelPendingRaf(); clearAllRimCanvases(isH()); } },
      teardown, markDirty, invalidateMetrics, getLastPointerPos: () => lastPointerPos,
    };
  }

  const api = { createPrismRimCanvasController };
  if (typeof module === 'object' && module.exports) module.exports = api;
  G.__agPrismRimCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
;

/* ===== module: ripple-core.js ===== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.__agCsRippleCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const RIPPLE = {
    fontSize: 10,
    cellWidth: 7,
    cellHeight: 15,
    changeRate: 2,
    digitRatio: 0.3,
    cloudScale: 100,
    cloudCoverage: 1,
    cloudSoftness: 0.1,
    cloudDrift: 8,
    idleAlphaLight: 0.172,
    idleAlphaDark: 0.13,
    speedNear: 1100,
    speedFar: 80,
    speedFalloff: 240,
    damping: 1,
    borderCells: 6,
    turbulence: 0.45,
    turbulenceScale: 180,
    sourceFrequency: 6,
    sourceRadius: 36,
    sourceAmplitude: 1.4,
    waveGain: 3.5,
    glowDecay: 1.2,
    glowAlpha: 0.3,
    waveAlpha: 0.85,
    patchScale: 60,
    patchFloor: 0.3,
    edgeFeather: 0.05,
    breathPeriod: 10.5,
    breathDepth: 0.24,
    breathScale: 280,
    calmAlpha: 0.45,
    calmFeather: 36,
    lightAlphaScale: 0.72,
    lightInkCool: [74, 90, 118],
    lightWaveCool: [37, 99, 235],
    lightCoolMix: 0.68,
    waveAlphaCap: 0.7,
    injectSoftness: 0.8,
    injectLoadDecay: 0.9,
    heightKnee: 0.9,
    heightCap: 1.6,

    auraTint: 0.48,
    auraLift: 0.78,
    prismTint: 0.68,
    prismCap: 0.74,
    prismBands: 3,
    prismSlopeScale: 60,
    prismThreshold: 0.20,
    nebulaTint: 0.58,
    nebulaLift: 1.08,
    nebulaFrameMs: 40,
    nebulaPeriods: [8.4, 10.8, 12.8],
  };
  const WAVE_STEP = 1 / 600;
  const MAX_ADVANCE = 0.05;
  const REST_HEIGHT = 0.003;
  const DIGITS = '0123456789';
  const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const GLYPHS = DIGITS + LETTERS;
  const COVERAGE_TO_THRESHOLD = 0.39;
  const INVISIBLE_ALPHA = 0.01;
  const TAU = Math.PI * 2;
  const SPECTRUM = [
    [66, 133, 244],
    [155, 114, 203],
    [234, 67, 53],
    [251, 188, 4],
  ];
  // 白昼高饱和宝石四色（Royal Cobalt #2563EB / Iris #7C3AED / Coral #EA4335 / Amber #D97706）
  const SPECTRUM_LIGHT = [
    [37, 99, 235],
    [124, 58, 237],
    [234, 67, 53],
    [217, 119, 6],
  ];
  const PRISM_LEVELS = 7;
  const HUE_LEVELS = 32;
  function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function valueNoise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * sx;
    const bottom = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * sx;
    return top + (bottom - top) * sy;
  }
  function fractalNoise(x, y) {
    return (valueNoise(x, y) * 4 + valueNoise(x * 2.1 + 7, y * 2.1 + 3) * 2 + valueNoise(x * 4.3 + 13, y * 4.3 + 11)) / 7;
  }
  function glyphIndex(column, row, tick) {
    const digit = hash(column * 7 + tick * 13, row * 11 + tick * 3) < RIPPLE.digitRatio;
    const pick = hash(column * 131 + tick, row * 197 + tick * 7);
    return digit ? Math.floor(pick * DIGITS.length) : DIGITS.length + Math.floor(pick * LETTERS.length);
  }
  function smooth(value) {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
  }
  function cloudClear(x, y) {
    const noise = fractalNoise(x / RIPPLE.cloudScale, y / RIPPLE.cloudScale);
    const threshold = 0.5 + (RIPPLE.cloudCoverage - 0.5) * COVERAGE_TO_THRESHOLD;
    const cloud = smooth((noise - threshold + RIPPLE.cloudSoftness) / (2 * RIPPLE.cloudSoftness));
    return 0.22 + 0.78 * cloud;
  }
  function patchClear(x, y) {
    const noise = fractalNoise(x / RIPPLE.patchScale + 31, y / RIPPLE.patchScale + 17);
    return RIPPLE.patchFloor + (1 - RIPPLE.patchFloor) * smooth((noise - 0.35) / 0.3);
  }
  const GLYPH_SPECTRA_DARK = {
    0: SPECTRUM,
    1: [
      [148, 74, 52],
      [217, 119, 87],
      [238, 155, 122],
      [246, 189, 96],
    ],
    2: [
      [27, 73, 178],
      [49, 134, 255],
      [92, 198, 252],
      [140, 224, 255],
    ],
    3: [
      [91, 33, 182],
      [139, 92, 246],
      [165, 138, 248],
      [221, 214, 254],
    ],
    4: [
      [146, 64, 14],
      [217, 119, 6],
      [242, 184, 75],
      [253, 230, 138],
    ],
    5: [
      [100, 116, 139],
      [148, 163, 184],
      [203, 213, 225],
      [241, 245, 249],
    ],
  };
  const GLYPH_SPECTRA_LIGHT = {
    0: SPECTRUM_LIGHT,
    1: [
      [154, 52, 18],
      [194, 89, 52],
      [217, 119, 87],
      [217, 119, 6],
    ],
    2: [
      [29, 78, 216],
      [37, 99, 235],
      [2, 132, 199],
      [56, 189, 248],
    ],
    3: [
      [76, 29, 149],
      [109, 40, 217],
      [124, 58, 237],
      [147, 51, 234],
    ],
    4: [
      [120, 53, 15],
      [180, 83, 9],
      [217, 119, 6],
      [234, 88, 12],
    ],
    5: [
      [30, 41, 59],
      [51, 65, 85],
      [71, 85, 105],
      [100, 116, 139],
    ],
  };
  function spectrumRgb(t, out, dark = true, spectrumCode = 0) {
    const bank = dark === false ? GLYPH_SPECTRA_LIGHT : GLYPH_SPECTRA_DARK;
    const stops = bank[spectrumCode] || (dark === false ? SPECTRUM_LIGHT : SPECTRUM);
    let f = (t - Math.floor(t)) * 4;
    const i = Math.min(3, Math.floor(f));
    f -= i;
    const a = stops[i];
    const b = stops[(i + 1) & 3];
    out[0] = a[0] + (b[0] - a[0]) * f;
    out[1] = a[1] + (b[1] - a[1]) * f;
    out[2] = a[2] + (b[2] - a[2]) * f;
    return out;
  }
  const HORIZON_SPECTRUM = [
    [15, 23, 58],
    [49, 134, 255],
    [92, 198, 252],
    [187, 226, 255],
  ];
  const NEBULA_PHASES = [0.35, 2.45, 4.55];
  const NEBULA_ANGLES = [2.85, 0.52, 4.62];
  const NEBULA_HUES = [0.04, 0.54, 0.80];
  function computeNebulaLobes(seconds, width, height, still, out) {
    const t = still ? 2.4 : seconds;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const diag = Math.sqrt(w * w + h * h);
    const periods = RIPPLE.nebulaPeriods || [8.4, 10.8, 12.8];
    for (let i = 0; i < 3; i++) {
      const period = Math.max(1, Number(periods[i]) || 10);
      const rawSin = 0.5 + 0.5 * Math.sin((TAU * t) / period + NEBULA_PHASES[i]);
      const env = rawSin * rawSin * (3 - 2 * rawSin);
      const strength = still ? 0.28 : 0.04 + 0.96 * Math.pow(env, 1.3);
      const dir = i === 1 ? -1 : 1;
      const ang = NEBULA_ANGLES[i] + 0.52 * Math.sin(t * (0.13 + i * 0.023) + i * 1.7) + dir * t * (0.045 + i * 0.006);
      const ringR = 0.34 + 0.045 * Math.cos(t * (0.11 + i * 0.019) + i * 1.1);
      const lobe = out[i];
      lobe.x = (0.5 + ringR * 1.06 * Math.cos(ang)) * w;
      lobe.y = (0.5 + ringR * 0.92 * Math.sin(ang)) * h;
      lobe.radius = diag * (0.29 + 0.06 * strength);
      lobe.strength = strength;
      const hue = NEBULA_HUES[i] + 0.14 * Math.sin(t * 0.09 + i * 2.1);
      lobe.hue = hue - Math.floor(hue);
    }
    return out;
  }
  function clampDim(n) { return n > 0 && Number.isFinite(n) ? Math.floor(n) : 0; }
  function createWaveField(columns, rows, random = Math.random) {
    columns = clampDim(columns);
    rows = clampDim(rows);
    const cells = columns * rows;
    const height = new Float32Array(cells);
    const velocity = new Float32Array(cells);
    const speedSquared = new Float32Array(cells);
    const speedFactor = new Float32Array(cells);
    const damping = new Float32Array(cells);
    const seed = random() * 1000;
    const { cellWidth, cellHeight } = RIPPLE;
    const widthSquared = cellWidth * cellWidth;
    const heightSquared = cellHeight * cellHeight;
    const invW2 = 1 / widthSquared;
    const invH2 = 1 / heightSquared;
    const loadDecay = Math.exp(-WAVE_STEP / RIPPLE.injectLoadDecay);
    const wakeLoadDecay = Math.exp(-WAVE_STEP / 0.2);
    const knee = RIPPLE.heightKnee;
    const span = Math.max(0.01, RIPPLE.heightCap - RIPPLE.heightKnee);
    const sources = [];
    let moving = false;
    let behind = 0;
    let load = 0;
    let wakeLoad = 0;
    let baseSpeedPrimed = false;
    let actC0 = columns;
    let actC1 = -1;
    let actR0 = rows;
    let actR1 = -1;
    if (columns >= 32 && rows >= 16) {
      const gCols = Math.ceil(columns / 2) + 1;
      const gRows = Math.ceil(rows / 2) + 1;
      const coarse = new Float32Array(gCols * gRows);
      for (let gr = 0; gr < gRows; gr++) {
        const r = Math.min(rows - 1, gr * 2);
        const ny = (r * cellHeight) / RIPPLE.turbulenceScale + seed;
        for (let gc = 0; gc < gCols; gc++) {
          const c = Math.min(columns - 1, gc * 2);
          coarse[gr * gCols + gc] = fractalNoise((c * cellWidth) / RIPPLE.turbulenceScale + seed, ny);
        }
      }
      for (let row = 0; row < rows; row++) {
        const gr = row >> 1;
        const ty = (row & 1) * 0.5;
        const rowOff0 = gr * gCols;
        const rowOff1 = Math.min(gRows - 1, gr + 1) * gCols;
        for (let column = 0; column < columns; column++) {
          const cell = row * columns + column;
          const gc = column >> 1;
          const gc1 = Math.min(gCols - 1, gc + 1);
          const tx = (column & 1) * 0.5;
          const n0 = coarse[rowOff0 + gc] + (coarse[rowOff0 + gc1] - coarse[rowOff0 + gc]) * tx;
          const n1 = coarse[rowOff1 + gc] + (coarse[rowOff1 + gc1] - coarse[rowOff1 + gc]) * tx;
          const noise = n0 + (n1 - n0) * ty;
          speedFactor[cell] = Math.min(1.4, Math.max(0.3, 1 + RIPPLE.turbulence * (noise - 0.5) * 3.2));
          const edge = Math.min(column, row, columns - 1 - column, rows - 1 - row);
          const border = Math.max(0, 1 - edge / RIPPLE.borderCells) ** 2;
          damping[cell] = RIPPLE.damping + border * 12;
        }
      }
    } else {
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const cell = row * columns + column;
          const noise = fractalNoise((column * cellWidth) / RIPPLE.turbulenceScale + seed, (row * cellHeight) / RIPPLE.turbulenceScale + seed);
          speedFactor[cell] = Math.min(1.4, Math.max(0.3, 1 + RIPPLE.turbulence * (noise - 0.5) * 3.2));
          const edge = Math.min(column, row, columns - 1 - column, rows - 1 - row);
          const border = Math.max(0, 1 - edge / RIPPLE.borderCells) ** 2;
          damping[cell] = RIPPLE.damping + border * 12;
        }
      }
    }
    function primeFarBaseline() {
      if (baseSpeedPrimed) return;
      const far = RIPPLE.speedFar;
      for (let i = 0; i < cells; i++) {
        const s = far * speedFactor[i];
        const sq = s * s;
        if (sq > speedSquared[i]) speedSquared[i] = sq;
      }
      baseSpeedPrimed = true;
    }
    function raiseSpeeds(column, row) {
      primeFarBaseline();
      const nearMinusFar = RIPPLE.speedNear - RIPPLE.speedFar;
      const maxReachPx = RIPPLE.speedFalloff * 4.6;
      const maxReachSq = maxReachPx * maxReachPx;
      const reachCols = Math.ceil(maxReachPx / cellWidth);
      const reachRows = Math.ceil(maxReachPx / cellHeight);
      const r0 = Math.max(0, row - reachRows);
      const r1 = Math.min(rows - 1, row + reachRows);
      const c0 = Math.max(0, column - reachCols);
      const c1 = Math.min(columns - 1, column + reachCols);
      for (let r = r0; r <= r1; r++) {
        const dy = (r - row) * cellHeight;
        const dy2 = dy * dy;
        const rowBase = r * columns;
        for (let c = c0; c <= c1; c++) {
          const dx = (c - column) * cellWidth;
          const d2 = dx * dx + dy2;
          if (d2 > maxReachSq) continue;
          const cell = rowBase + c;
          const speed = (RIPPLE.speedFar + nearMinusFar * Math.exp(-Math.sqrt(d2) / RIPPLE.speedFalloff)) * speedFactor[cell];
          const squared = speed * speed;
          if (squared > speedSquared[cell]) speedSquared[cell] = squared;
        }
      }
    }
    function raiseWakeSpeeds(column, row, speedNorm) {
      primeFarBaseline();
      const wakeBoost = (RIPPLE.speedNear - RIPPLE.speedFar) * (0.14 + 0.14 * speedNorm);
      const reachPx = RIPPLE.speedFalloff * 0.65;
      const reachCols = Math.ceil(reachPx / cellWidth);
      const reachRows = Math.ceil(reachPx / cellHeight);
      const r0 = Math.max(0, row - reachRows);
      const r1 = Math.min(rows - 1, row + reachRows);
      const c0 = Math.max(0, column - reachCols);
      const c1 = Math.min(columns - 1, column + reachCols);
      for (let r = r0; r <= r1; r++) {
        const dy = (r - row) * cellHeight;
        const dy2 = dy * dy;
        for (let c = c0; c <= c1; c++) {
          const dx = (c - column) * cellWidth;
          const dist = Math.sqrt(dx * dx + dy2);
          if (dist > reachPx) continue;
          const cell = r * columns + c;
          const speed = (RIPPLE.speedFar + wakeBoost * Math.exp(-dist / (RIPPLE.speedFalloff * 0.55))) * speedFactor[cell];
          const squared = speed * speed;
          if (squared > speedSquared[cell]) speedSquared[cell] = squared;
        }
      }
    }
    function injectGain() {
      const k = RIPPLE.injectSoftness;
      const n = 1 + load;
      return Math.tanh(k * n) / (Math.tanh(k) * n);
    }
    function skimmerGain() {
      const k = 0.85;
      const n = 1 + wakeLoad;
      return Math.tanh(k * n) / (Math.tanh(k) * n);
    }
    function drive() {
      let keep = 0;
      for (let s = 0; s < sources.length; s++) {
        const source = sources[s];
        if (source.delay > 0) {
          source.delay -= WAVE_STEP;
          sources[keep++] = source;
          continue;
        }
        const freq = source.frequency || RIPPLE.sourceFrequency;
        const envelope = Math.sin((Math.PI * source.time) / source.duration);
        const rate = Math.cos(TAU * freq * source.time) * TAU * RIPPLE.sourceFrequency;
        const radius = RIPPLE.sourceRadius * source.radiusScale;
        const inv2r2 = 1 / (2 * radius * radius);
        const gain = RIPPLE.sourceAmplitude * source.amplitudeScale * envelope * rate * WAVE_STEP;
        const reachColumns = Math.ceil((radius * 3) / cellWidth);
        const reachRows = Math.ceil((radius * 3) / cellHeight);
        const r0 = Math.max(0, source.row - reachRows);
        const r1 = Math.min(rows - 1, source.row + reachRows);
        const c0 = Math.max(0, source.column - reachColumns);
        const c1 = Math.min(columns - 1, source.column + reachColumns);
        if (r0 < actR0) actR0 = r0;
        if (r1 > actR1) actR1 = r1;
        if (c0 < actC0) actC0 = c0;
        if (c1 > actC1) actC1 = c1;
        for (let r = r0; r <= r1; r++) {
          const dy = (r - source.row) * cellHeight;
          const dy2 = dy * dy;
          const rowBase = r * columns;
          for (let c = c0; c <= c1; c++) {
            const dx = (c - source.column) * cellWidth;
            const i = rowBase + c;
            let v = height[i] + gain * Math.exp(-(dx * dx + dy2) * inv2r2);
            const av = v < 0 ? -v : v;
            if (av > knee) v = (v < 0 ? -1 : 1) * (knee + span * Math.tanh((av - knee) / span));
            height[i] = v;
          }
        }
        source.time += WAVE_STEP;
        if (source.time < source.duration) sources[keep++] = source;
      }
      sources.length = keep;
    }
    function step() {
      let peak = 0;
      if (actC0 <= actC1 && actR0 <= actR1) {
        const rStart = Math.max(0, actR0 - 1);
        const rEnd = Math.min(rows - 1, actR1 + 1);
        const cStart = Math.max(0, actC0 - 1);
        const cEnd = Math.min(columns - 1, actC1 + 1);
        const decayMul = 1 - 0.35 * WAVE_STEP;
        for (let r = rStart; r <= rEnd; r++) {
          const rowBase = r * columns;
          const hasAbove = r > 0;
          const hasBelow = r < rows - 1;
          for (let c = cStart; c <= cEnd; c++) {
            const cell = rowBase + c;
            const here = height[cell];
            const left = c > 0 ? height[cell - 1] : here;
            const right = c < columns - 1 ? height[cell + 1] : here;
            const above = hasAbove ? height[cell - columns] : here;
            const below = hasBelow ? height[cell + columns] : here;
            const laplacian = (left + right - 2 * here) * invW2 + (above + below - 2 * here) * invH2;
            velocity[cell] += (speedSquared[cell] * laplacian - damping[cell] * velocity[cell]) * WAVE_STEP;
          }
        }
        let nC0 = columns;
        let nC1 = -1;
        let nR0 = rows;
        let nR1 = -1;
        for (let r = rStart; r <= rEnd; r++) {
          const rowBase = r * columns;
          for (let c = cStart; c <= cEnd; c++) {
            const cell = rowBase + c;
            const vel = velocity[cell];
            let h = (height[cell] + vel * WAVE_STEP) * decayMul;
            const a = h < 0 ? -h : h;
            const av = vel < 0 ? -vel : vel;
            if (a > peak) peak = a;
            if (a > 1e-5 || av > 5e-5) {
              height[cell] = h;
              if (c < nC0) nC0 = c;
              if (c > nC1) nC1 = c;
              if (r < nR0) nR0 = r;
              if (r > nR1) nR1 = r;
            } else if (h !== 0 || vel !== 0) {
              height[cell] = 0;
              velocity[cell] = 0;
            }
          }
        }
        actC0 = nC0;
        actC1 = nC1;
        actR0 = nR0;
        actR1 = nR1;
      }
      drive();
      if (peak === 0 && actC0 <= actC1) {
        for (let r = actR0; r <= actR1; r++) {
          const rowBase = r * columns;
          for (let c = actC0; c <= actC1; c++) {
            const a = Math.abs(height[rowBase + c]);
            if (a > peak) peak = a;
          }
        }
      }
      load *= loadDecay;
      wakeLoad *= wakeLoadDecay;
      moving = sources.length > 0 || peak > REST_HEIGHT;
      if (!moving) {
        if (actC0 <= actC1 && actR0 <= actR1) {
          for (let r = actR0; r <= actR1; r++) {
            const s = r * columns + actC0;
            const e = r * columns + actC1 + 1;
            height.fill(0, s, e);
            velocity.fill(0, s, e);
          }
        } else {
          height.fill(0);
          velocity.fill(0);
        }
        speedSquared.fill(0);
        load = 0;
        wakeLoad = 0;
        baseSpeedPrimed = false;
        actC0 = columns;
        actC1 = -1;
        actR0 = rows;
        actR1 = -1;
      }
    }
    return {
      height,
      active: () => moving,
      disturb(column, row, opts) {
        if (columns <= 0 || rows <= 0) return;
        if (!Number.isFinite(column) || !Number.isFinite(row)) return;
        const c = Math.max(0, Math.min(columns - 1, Math.floor(column)));
        const r = Math.max(0, Math.min(rows - 1, Math.floor(row)));
        const hasOpts = opts && typeof opts === 'object';
        if (hasOpts && opts.wake) {
          raiseWakeSpeeds(c, r, Number.isFinite(opts.speedNorm) ? Math.max(0, Math.min(1, opts.speedNorm)) : 0.5);
        } else {
          raiseSpeeds(c, r);
        }
        const duration = hasOpts && Number.isFinite(opts.duration) && opts.duration > 0
          ? opts.duration
          : (2 + Math.floor(random() * 2)) / RIPPLE.sourceFrequency;
        const radiusScale = hasOpts && Number.isFinite(opts.radiusScale) && opts.radiusScale > 0
          ? opts.radiusScale
          : 0.78 + random() * 0.92;
        const baseAmp = hasOpts && Number.isFinite(opts.amplitudeScale)
          ? Math.max(0, opts.amplitudeScale)
          : 0.78 + random() * 0.72;
        const frequency = hasOpts && Number.isFinite(opts.frequency) && opts.frequency > 0
          ? opts.frequency
          : RIPPLE.sourceFrequency;
        const loadWeight = hasOpts && Number.isFinite(opts.loadWeight)
          ? Math.max(0, opts.loadWeight)
          : 1;
        const delay = hasOpts && Number.isFinite(opts.delay) && opts.delay > 0
          ? opts.delay
          : 0;
        sources.push({
          column: c,
          row: r,
          time: 0,
          delay,
          duration,
          radiusScale,
          amplitudeScale: baseAmp * injectGain(),
          frequency,
          skimmer: false,
        });
        load += loadWeight;
        moving = true;
      },
      skimmer(column, row, speedNorm = 0.5) {
        if (columns <= 0 || rows <= 0) return;
        if (!Number.isFinite(column) || !Number.isFinite(row)) return;
        const c = Math.max(0, Math.min(columns - 1, Math.floor(column)));
        const r = Math.max(0, Math.min(rows - 1, Math.floor(row)));
        const s = Number.isFinite(Number(speedNorm)) ? Math.max(0, Math.min(1, Number(speedNorm))) : 0.5;
        raiseWakeSpeeds(c, r, s);
        const amp = (0.048 + 0.088 * s) * skimmerGain();
        const last = sources.length > 0 ? sources[sources.length - 1] : null;
        if (last && last.skimmer && Math.abs(last.column - c) <= 2 && Math.abs(last.row - r) <= 2 && last.time < 0.036) {
          last.column = c;
          last.row = r;
          last.amplitudeScale = Math.min(0.145, Math.max(last.amplitudeScale, amp));
          moving = true;
          return;
        }
        if (sources.length >= 24) {
          const dropIdx = sources.findIndex((src) => src.skimmer);
          if (dropIdx >= 0) sources.splice(dropIdx, 1);
        }
        const duration = 0.105;
        sources.push({
          column: c,
          row: r,
          time: 0,
          duration,
          radiusScale: 0.52,
          amplitudeScale: amp,
          frequency: 1.5 / duration,
          skimmer: true,
        });
        wakeLoad = Math.min(2.4, wakeLoad + 0.28);
        moving = true;
      },
      advance(seconds) {
        behind += Math.min(seconds, MAX_ADVANCE);
        while (behind >= WAVE_STEP) {
          step();
          behind -= WAVE_STEP;
        }
      },
    };
  }
  function parseCssColorToRgb(cssColor) {
    const s = String(cssColor || '').trim();
    if (!s) return null;
    if (s[0] === '#') {
      const hex = s.slice(1);
      if (hex.length === 3) {
        return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
      }
      if (hex.length >= 6) {
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
      }
    }
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
    if (m) return [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))];
    return null;
  }
  const VERTEX_SHADER = `#version 300 es
void main() {
vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

  const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D cells;
uniform sampler2D atlas;
uniform vec2 size;
uniform vec2 grid;
uniform vec2 cellPixels;
uniform vec2 atlasCell;
uniform float glyphCount;
uniform vec3 ink;
uniform vec3 wave;
uniform vec4 aura;
uniform vec4 optics;
uniform float auraLift;
uniform float auraPhase;
uniform float lightMode;
uniform vec4 neb0;
uniform vec4 neb1;
uniform vec4 neb2;
uniform vec4 nebOpt;
uniform float nebulaLift;
uniform float spectrumMode;
out vec4 color;
const vec3 COBALT = vec3(66.0 / 255.0, 133.0 / 255.0, 244.0 / 255.0);
const vec3 IRIS = vec3(155.0 / 255.0, 114.0 / 255.0, 203.0 / 255.0);
const vec3 CORAL = vec3(234.0 / 255.0, 67.0 / 255.0, 53.0 / 255.0);
const vec3 AMBER = vec3(251.0 / 255.0, 188.0 / 255.0, 4.0 / 255.0);
const vec3 COBALT_L = vec3(37.0 / 255.0, 99.0 / 255.0, 235.0 / 255.0);
const vec3 IRIS_L = vec3(124.0 / 255.0, 58.0 / 255.0, 237.0 / 255.0);
const vec3 CORAL_L = vec3(234.0 / 255.0, 67.0 / 255.0, 53.0 / 255.0);
const vec3 AMBER_L = vec3(217.0 / 255.0, 119.0 / 255.0, 6.0 / 255.0);
vec3 spectrum(float t, float light, float mode) {
float f = fract(t) * 4.0;
vec3 c0 = COBALT; vec3 c1 = IRIS; vec3 c2 = CORAL; vec3 c3 = AMBER;
vec3 l0 = COBALT_L; vec3 l1 = IRIS_L; vec3 l2 = CORAL_L; vec3 l3 = AMBER_L;
if (mode > 4.5) {
c0 = vec3(0.392, 0.455, 0.545); c1 = vec3(0.580, 0.639, 0.722); c2 = vec3(0.796, 0.835, 0.882); c3 = vec3(0.945, 0.961, 0.976);
l0 = vec3(0.118, 0.161, 0.231); l1 = vec3(0.200, 0.255, 0.333); l2 = vec3(0.278, 0.333, 0.412); l3 = vec3(0.392, 0.455, 0.545);
} else if (mode > 3.5) {
c0 = vec3(0.573, 0.251, 0.055); c1 = vec3(0.851, 0.467, 0.024); c2 = vec3(0.949, 0.722, 0.294); c3 = vec3(0.992, 0.902, 0.541);
l0 = vec3(0.471, 0.208, 0.059); l1 = vec3(0.706, 0.325, 0.035); l2 = vec3(0.851, 0.467, 0.024); l3 = vec3(0.918, 0.345, 0.047);
} else if (mode > 2.5) {
c0 = vec3(0.357, 0.129, 0.714); c1 = vec3(0.545, 0.361, 0.965); c2 = vec3(0.647, 0.541, 0.973); c3 = vec3(0.867, 0.839, 0.996);
l0 = vec3(0.298, 0.114, 0.584); l1 = vec3(0.427, 0.157, 0.851); l2 = vec3(0.486, 0.227, 0.929); l3 = vec3(0.576, 0.200, 0.918);
} else if (mode > 1.5) {
c0 = vec3(0.106, 0.286, 0.698); c1 = vec3(0.192, 0.525, 1.000); c2 = vec3(0.361, 0.776, 0.988); c3 = vec3(0.549, 0.878, 1.000);
l0 = vec3(0.114, 0.306, 0.847); l1 = vec3(0.145, 0.388, 0.922); l2 = vec3(0.008, 0.518, 0.780); l3 = vec3(0.220, 0.741, 0.973);
} else if (mode > 0.5) {
c0 = vec3(0.580, 0.290, 0.204); c1 = vec3(0.851, 0.467, 0.341); c2 = vec3(0.933, 0.608, 0.478); c3 = vec3(0.965, 0.741, 0.376);
l0 = vec3(0.604, 0.204, 0.071); l1 = vec3(0.761, 0.349, 0.204); l2 = vec3(0.851, 0.467, 0.341); l3 = vec3(0.851, 0.467, 0.024);
}
vec3 d;
vec3 l;
if (f < 1.0) { d = mix(c0, c1, f); l = mix(l0, l1, f); }
else if (f < 2.0) { d = mix(c1, c2, f - 1.0); l = mix(l1, l2, f - 1.0); }
else if (f < 3.0) { d = mix(c2, c3, f - 2.0); l = mix(l2, l3, f - 2.0); }
else { d = mix(c3, c0, f - 3.0); l = mix(l3, l0, f - 3.0); }
return mix(d, l, light);
}
void main() {
vec2 position = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
vec2 cell = min(floor(position / cellPixels), grid - 1.0);
vec4 data = texelFetch(cells, ivec2(cell), 0);
if (data.g <= 0.0) { color = vec4(0.0); return; }
vec2 local = position - cell * cellPixels;
float glyph = floor(data.r * 255.0 + 0.5);
vec2 inAtlas = vec2(glyph * atlasCell.x + local.x * atlasCell.x / cellPixels.x, local.y * atlasCell.y / cellPixels.y);
float coverage = texture(atlas, inAtlas / vec2(glyphCount * atlasCell.x, atlasCell.y)).a;
if (coverage <= 0.001) { color = vec4(0.0); return; }
vec3 rgb = mix(ink, wave, data.b);
float alpha = data.g;
float packed = floor(data.a * 255.0 + 0.5);
float level = floor(packed / 32.0);
float prismAmt = level / 7.0;
float hue = (packed - level * 32.0) / 32.0;
float wAura = 0.0;
vec3 auraRgb = COBALT;
if (aura.w > 0.001) {
vec2 rel = position - aura.xy;
float ar = max(1.0, aura.z);
if (abs(rel.x) < ar && abs(rel.y) < ar) {
float d2 = dot(rel, rel);
if (d2 < ar * ar) {
float rNorm = sqrt(d2) / ar;
float u = 1.0 - rNorm;
float s = u * u * (3.0 - 2.0 * u);
wAura = s * (0.35 + 0.65 * s);
float ang = atan(rel.y, rel.x + 1e-5) * 0.15915494 + 0.5;
auraRgb = spectrum(ang - rNorm * 0.45 + auraPhase, lightMode, spectrumMode);
}
}
}
float wNeb = 0.0;
vec3 nebAcc = vec3(0.0);
for (int i = 0; i < 3; i++) {
vec4 nb = i == 0 ? neb0 : (i == 1 ? neb1 : neb2);
float nh = i == 0 ? nebOpt.x : (i == 1 ? nebOpt.y : nebOpt.z);
if (nb.w > 0.001) {
vec2 nr = position - nb.xy;
float rad = max(1.0, nb.z);
if (abs(nr.x) < rad && abs(nr.y) < rad) {
float nd2 = dot(nr, nr);
if (nd2 < rad * rad) {
float rn = sqrt(nd2) / rad;
float u = 1.0 - rn;
float s = u * u * (3.0 - 2.0 * u);
float wi = s * (0.30 + 0.70 * s) * nb.w;
float nang = atan(nr.y, nr.x + 1e-5) * 0.15915494;
wNeb += wi;
nebAcc += spectrum(nh + nang * 0.22 - rn * 0.26, lightMode, spectrumMode) * wi;
}
}
}
}
vec3 nebRgb = wNeb > 0.0001 ? nebAcc / wNeb : COBALT;
float wNebC = min(1.0, wNeb);
float nebT = wNebC * nebOpt.w;
float auraT = wAura * optics.x * aura.w;
float prismT = prismAmt * optics.y * optics.w * (0.88 + 0.12 * wAura);
float total = auraT + prismT + nebT;
if (lightMode > 0.5) {
alpha = min(0.88, alpha * (1.0 + (auraLift + 0.72) * wAura * aura.w + prismT * 0.62 + nebulaLift * 0.66 * wNebC));
} else if (wAura > 0.0 || wNebC > 0.0) {
alpha = min(1.0, alpha * (1.0 + auraLift * wAura * aura.w + nebulaLift * wNebC));
}
if (total > 0.0001) {
float capped = min(optics.z, total);
float mixAmt = mix(capped, min(0.96, capped * 1.36), lightMode);
vec3 tintRgb = (auraRgb * auraT + spectrum(hue, lightMode, spectrumMode) * prismT + nebRgb * nebT) / total;
rgb = mix(rgb, tintRgb, mixAmt);
}
float a = alpha * coverage;
color = vec4(rgb * a, a);
}`;
  function readAura(palette) {
    const cfg = palette.aura && palette.aura.active ? palette.aura : null;
    return {
      x: cfg ? Number(cfg.x || 0) : 0,
      y: cfg ? Number(cfg.y || 0) : 0,
      radius: cfg ? Math.max(1, Number(cfg.radius || 230)) : 230,
      strength: cfg ? Math.max(0, Math.min(1, Number(cfg.strength ?? 1))) : 0,
    };
  }
  function createWebGL2Renderer(canvas, columns, rows) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
    if (!gl || gl.isContextLost?.()) return null;
    const atlasCanvas = canvas.ownerDocument.createElement('canvas');
    const atlasContext = atlasCanvas.getContext('2d');
    if (!atlasContext) return null;
    const data = new Uint8Array(columns * rows * 4);
    let program, cellTexture, atlasTexture, uniforms, atlasKey = '';
    function compile(type, source) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader compile error');
      return sh;
    }
    function createTex(unit, filter) {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    }
    function free() {
      if (program) gl.deleteProgram(program);
      if (cellTexture) gl.deleteTexture(cellTexture);
      if (atlasTexture) gl.deleteTexture(atlasTexture);
      program = cellTexture = atlasTexture = null;
    }
    function build() {
      free();
      program = gl.createProgram();
      const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (typeof gl.deleteShader === 'function') {
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program link error');
      gl.useProgram(program);
      uniforms = {};
      for (const name of ['cells', 'atlas', 'size', 'grid', 'cellPixels', 'atlasCell', 'glyphCount', 'ink', 'wave', 'aura', 'optics', 'auraLift', 'auraPhase', 'lightMode', 'neb0', 'neb1', 'neb2', 'nebOpt', 'nebulaLift', 'spectrumMode']) {
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      cellTexture = createTex(0, gl.NEAREST);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, columns, rows);
      atlasTexture = createTex(1, gl.LINEAR);
      gl.uniform1i(uniforms.cells, 0);
      gl.uniform1i(uniforms.atlas, 1);
      atlasKey = '';
    }
    function buildAtlas(font, dpr) {
      const key = font + '|' + dpr;
      if (key === atlasKey) return;
      const width = Math.ceil(RIPPLE.cellWidth * dpr);
      const height = Math.ceil(RIPPLE.cellHeight * dpr);
      atlasCanvas.width = width * GLYPHS.length;
      atlasCanvas.height = height;
      atlasContext.setTransform(width / RIPPLE.cellWidth, 0, 0, height / RIPPLE.cellHeight, 0, 0);
      atlasContext.clearRect(0, 0, RIPPLE.cellWidth * GLYPHS.length, RIPPLE.cellHeight);
      atlasContext.font = `${RIPPLE.fontSize}px ${font}`;
      atlasContext.textBaseline = 'middle';
      atlasContext.textAlign = 'center';
      atlasContext.fillStyle = '#fff';
      for (let i = 0; i < GLYPHS.length; i++) {
        atlasContext.fillText(GLYPHS[i], i * RIPPLE.cellWidth + RIPPLE.cellWidth / 2, RIPPLE.cellHeight / 2);
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
      gl.uniform2f(uniforms.atlasCell, width, height);
      gl.uniform1f(uniforms.glyphCount, GLYPHS.length);
      atlasKey = key;
    }
    try {
      build();
    } catch {
      try { free(); } catch {}
      return null;
    }
    return {
      mode: 'webgl2',
      data,
      build,
      isContextLost: () => Boolean(gl.isContextLost?.()),
      draw(palette, dpr, uploadCells = true) {
        if (!program || gl.isContextLost?.()) return;
        buildAtlas(palette.fontFamily, dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uniforms.size, canvas.width, canvas.height);
        gl.uniform2f(uniforms.grid, columns, rows);
        gl.uniform2f(uniforms.cellPixels, RIPPLE.cellWidth * dpr, RIPPLE.cellHeight * dpr);
        gl.uniform3f(uniforms.ink, palette.ink[0] / 255, palette.ink[1] / 255, palette.ink[2] / 255);
        gl.uniform3f(uniforms.wave, palette.wave[0] / 255, palette.wave[1] / 255, palette.wave[2] / 255);
        const aura = readAura(palette);
        const amb = Number.isFinite(Number(palette.ambientIntensity)) ? Math.max(0, Math.min(1, Number(palette.ambientIntensity))) : 1;
        const specCode = Number(palette.spectrumCode ?? 0);
        gl.uniform4f(uniforms.aura, aura.x * dpr, aura.y * dpr, aura.radius * dpr, aura.strength * amb);
        gl.uniform4f(uniforms.optics, RIPPLE.auraTint * (specCode === 5 ? 0.55 : 1), RIPPLE.prismTint * (specCode === 5 ? 0.45 : 1), RIPPLE.prismCap, palette.prismStrength);
        gl.uniform1f(uniforms.auraLift, RIPPLE.auraLift * amb * (palette.auraLiftScale ?? 1));
        gl.uniform1f(uniforms.auraPhase, palette.auraPhase || 0);
        gl.uniform1f(uniforms.lightMode, palette.dark === false ? 1 : 0);
        gl.uniform1f(uniforms.spectrumMode, specCode);
        const neb = palette.nebula;
        const n0 = neb && neb[0];
        const n1 = neb && neb[1];
        const n2 = neb && neb[2];
        gl.uniform4f(uniforms.neb0, n0 ? n0.x * dpr : 0, n0 ? n0.y * dpr : 0, n0 ? n0.radius * dpr : 1, n0 ? n0.strength * amb : 0);
        gl.uniform4f(uniforms.neb1, n1 ? n1.x * dpr : 0, n1 ? n1.y * dpr : 0, n1 ? n1.radius * dpr : 1, n1 ? n1.strength * amb : 0);
        gl.uniform4f(uniforms.neb2, n2 ? n2.x * dpr : 0, n2 ? n2.y * dpr : 0, n2 ? n2.radius * dpr : 1, n2 ? n2.strength * amb : 0);
        const nebL = palette.nebulaLiftScale ?? 1;
        gl.uniform4f(uniforms.nebOpt, n0 ? n0.hue : 0, n1 ? n1.hue : 0, n2 ? n2.hue : 0, RIPPLE.nebulaTint * amb * (specCode === 5 ? 0.45 : 1) * (0.35 + 0.65 * nebL));
        gl.uniform1f(uniforms.nebulaLift, RIPPLE.nebulaLift * amb * nebL);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, cellTexture);
        if (uploadCells !== false) {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, columns, rows, gl.RGBA, gl.UNSIGNED_BYTE, data);
        }
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose(keep) {
        free();
        if (!keep) try { gl.getExtension?.('WEBGL_lose_context')?.loseContext?.(); } catch {}
      },
    };
  }
  const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  function create2DRenderer(canvas, columns, rows) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const doc = canvas.ownerDocument;
    const atlas = doc && doc.createElement ? doc.createElement('canvas') : null;
    const atlasCtx = atlas ? atlas.getContext('2d', { willReadFrequently: true }) : null;
    if (!atlasCtx) return null;
    const data = new Uint8Array(columns * rows * 4);
    const auraTintRgb = [0, 0, 0];
    const prismTintRgb = [0, 0, 0];
    const nebSampleRgb = [0, 0, 0];
    const nebLobeScaled = [
      { x: 0, y: 0, r: 1, r2: 1, s: 0, hue: 0 },
      { x: 0, y: 0, r: 1, r2: 1, s: 0, hue: 0 },
      { x: 0, y: 0, r: 1, r2: 1, s: 0, hue: 0 },
    ];
    let mask = null;
    let atlasKey = '';
    let gw = 1;
    let gh = 1;
    let image = null;
    let pixels = null;
    function buildAtlas(font, dpr) {
      const key = font + '|' + dpr;
      if (key === atlasKey && mask) return;
      const { cellWidth, cellHeight } = RIPPLE;
      gw = Math.max(1, Math.ceil(cellWidth * dpr));
      gh = Math.max(1, Math.ceil(cellHeight * dpr));
      atlas.width = gw * GLYPHS.length;
      atlas.height = gh;
      atlasCtx.setTransform(gw / cellWidth, 0, 0, gh / cellHeight, 0, 0);
      atlasCtx.clearRect(0, 0, cellWidth * GLYPHS.length, cellHeight);
      atlasCtx.font = `${RIPPLE.fontSize}px ${font}`;
      atlasCtx.textBaseline = 'middle';
      atlasCtx.textAlign = 'center';
      atlasCtx.fillStyle = '#fff';
      for (let i = 0; i < GLYPHS.length; i++) {
        atlasCtx.fillText(GLYPHS[i], i * cellWidth + cellWidth / 2, cellHeight / 2);
      }
      const src = atlasCtx.getImageData(0, 0, atlas.width, gh).data;
      const stride = atlas.width;
      mask = new Uint8Array(GLYPHS.length * gw * gh);
      for (let g = 0; g < GLYPHS.length; g++) {
        for (let y = 0; y < gh; y++) {
          for (let x = 0; x < gw; x++) {
            mask[(g * gh + y) * gw + x] = src[(y * stride + g * gw + x) * 4 + 3];
          }
        }
      }
      atlasKey = key;
    }
    function ensureImage() {
      if (!image || image.width !== canvas.width || image.height !== canvas.height) {
        image = ctx.createImageData(Math.max(1, canvas.width), Math.max(1, canvas.height));
        pixels = new Uint32Array(image.data.buffer);
      }
    }
    return {
      mode: '2d',
      data,
      build() { atlasKey = ''; },
      draw(palette, dpr) {
        buildAtlas(palette.fontFamily, dpr);
        ensureImage();
        pixels.fill(0);
        const W = image.width;
        const H = image.height;
        const ink = palette.ink;
        const wave = palette.wave;
        const isLight = palette.dark === false;
        const amb = Number.isFinite(Number(palette.ambientIntensity)) ? Math.max(0, Math.min(1, Number(palette.ambientIntensity))) : 1;
        const specCode = Number(palette.spectrumCode ?? 0);
        const aura = readAura(palette);
        const auraStrength = aura.strength * amb;
        const auraOn = auraStrength > 0.001;
        const auraPhase = palette.auraPhase || 0;
        const ax = aura.x * dpr;
        const ay = aura.y * dpr;
        const ar = aura.radius * dpr;
        const ar2 = ar * ar;
        const nebSrc = amb > 0.001 ? palette.nebula : null;
        let nebActiveCount = 0;
        for (let i = 0; i < 3; i++) {
          const srcLobe = nebSrc && nebSrc[i];
          const dstLobe = nebLobeScaled[i];
          if (srcLobe && srcLobe.strength * amb > 0.001) {
            dstLobe.x = srcLobe.x * dpr;
            dstLobe.y = srcLobe.y * dpr;
            dstLobe.r = Math.max(1, srcLobe.radius * dpr);
            dstLobe.r2 = dstLobe.r * dstLobe.r;
            dstLobe.s = srcLobe.strength * amb;
            dstLobe.hue = srcLobe.hue;
            nebActiveCount++;
          } else {
            dstLobe.s = 0;
          }
        }
        const auraTintScale = RIPPLE.auraTint * (specCode === 5 ? 0.55 : 1);
        const auraLiftScale = RIPPLE.auraLift * (palette.auraLiftScale ?? 1);
        const nebL = palette.nebulaLiftScale ?? 1;
        const nebTintScale = RIPPLE.nebulaTint * amb * (specCode === 5 ? 0.45 : 1) * (0.35 + 0.65 * nebL);
        const nebLiftScale = RIPPLE.nebulaLift * amb * nebL;
        const prismGain = RIPPLE.prismTint * palette.prismStrength * (specCode === 5 ? 0.45 : 1);
        const stepX = RIPPLE.cellWidth * dpr;
        const stepY = RIPPLE.cellHeight * dpr;
        const cellArea = gw * gh;
        for (let r = 0; r < rows; r++) {
          const dy0 = Math.round(r * stepY);
          if (dy0 >= H) break;
          const hRows = Math.min(gh, H - dy0);
          const cyPx = r * stepY + stepY / 2;
          const py = cyPx - ay;
          const py2 = py * py;
          const ndy0 = cyPx - nebLobeScaled[0].y;
          const ndy1 = cyPx - nebLobeScaled[1].y;
          const ndy2 = cyPx - nebLobeScaled[2].y;
          const ndy02 = ndy0 * ndy0;
          const ndy12 = ndy1 * ndy1;
          const ndy22 = ndy2 * ndy2;
          for (let c = 0; c < columns; c++) {
            const at = (r * columns + c) * 4;
            let alpha = data[at + 1] / 255;
            if (alpha <= 0) continue;
            const mixT = data[at + 2] / 255;
            let cr = ink[0] + (wave[0] - ink[0]) * mixT;
            let cg = ink[1] + (wave[1] - ink[1]) * mixT;
            let cb = ink[2] + (wave[2] - ink[2]) * mixT;
            const packed = data[at + 3];
            const cxPx = c * stepX + stepX / 2;
            let wAura = 0;
            let auraT = 0;
            let auraHue = 0;
            if (auraOn) {
              const px = cxPx - ax;
              const d2 = px * px + py2;
              if (d2 < ar2) {
                const rNorm = Math.sqrt(d2) / ar;
                const u = 1 - rNorm;
                const s = u * u * (3 - 2 * u);
                wAura = s * (0.35 + 0.65 * s);
                auraT = wAura * auraTintScale * auraStrength;
                const ang = Math.atan2(py, px + 1e-5) / TAU + 0.5;
                auraHue = ang - rNorm * 0.45 + auraPhase;
              }
            }
            let wNeb = 0;
            let nebR = 0;
            let nebG = 0;
            let nebB = 0;
            if (nebActiveCount > 0) {
              for (let i = 0; i < 3; i++) {
                const lb = nebLobeScaled[i];
                if (lb.s <= 0) continue;
                const ndx = cxPx - lb.x;
                const ndy = i === 0 ? ndy0 : (i === 1 ? ndy1 : ndy2);
                const nd2 = ndx * ndx + (i === 0 ? ndy02 : (i === 1 ? ndy12 : ndy22));
                if (nd2 < lb.r2) {
                  const rn = Math.sqrt(nd2) / lb.r;
                  const u = 1 - rn;
                  const s = u * u * (3 - 2 * u);
                  const wi = s * (0.30 + 0.70 * s) * lb.s;
                  const nang = Math.atan2(ndy, ndx + 1e-5) / TAU;
                  spectrumRgb(lb.hue + nang * 0.22 - rn * 0.26, nebSampleRgb, !isLight, specCode);
                  wNeb += wi;
                  nebR += nebSampleRgb[0] * wi;
                  nebG += nebSampleRgb[1] * wi;
                  nebB += nebSampleRgb[2] * wi;
                }
              }
            }
            const wNebC = wNeb > 1 ? 1 : wNeb;
            const nebT = wNebC * nebTintScale;
            const prismT = packed > 31 ? ((packed >> 5) / PRISM_LEVELS) * prismGain * (0.88 + 0.12 * wAura) : 0;
            if (isLight) {
              alpha = Math.min(0.88, alpha * (1 + (auraLiftScale + 0.72) * wAura * auraStrength + prismT * 0.62 + nebLiftScale * 0.66 * wNebC));
            } else if (wAura > 0 || wNebC > 0) {
              alpha = Math.min(1, alpha * (1 + auraLiftScale * wAura * auraStrength + nebLiftScale * wNebC));
            }
            const total = auraT + prismT + nebT;
            if (total > 0.0001) {
              const capped = Math.min(RIPPLE.prismCap, total);
              const mixAmt = isLight ? Math.min(0.96, capped * 1.36) : capped;
              if (auraT > 0) spectrumRgb(auraHue, auraTintRgb, !isLight, specCode);
              if (prismT > 0) spectrumRgb((packed & 31) / HUE_LEVELS, prismTintRgb, !isLight, specCode);
              const nr = wNeb > 0.0001 ? nebR / wNeb : 0;
              const ng = wNeb > 0.0001 ? nebG / wNeb : 0;
              const nb = wNeb > 0.0001 ? nebB / wNeb : 0;
              const tr = (auraTintRgb[0] * auraT + prismTintRgb[0] * prismT + nr * nebT) / total;
              const tg = (auraTintRgb[1] * auraT + prismTintRgb[1] * prismT + ng * nebT) / total;
              const tb = (auraTintRgb[2] * auraT + prismTintRgb[2] * prismT + nb * nebT) / total;
              cr += (tr - cr) * mixAmt;
              cg += (tg - cg) * mixAmt;
              cb += (tb - cb) * mixAmt;
            }
            const a8 = Math.round(alpha * 256);
            const R = Math.round(cr) & 255;
            const G = Math.round(cg) & 255;
            const B = Math.round(cb) & 255;
            const rgb = LITTLE_ENDIAN ? (B << 16) | (G << 8) | R : (R << 24) | (G << 16) | (B << 8);
            const dx0 = Math.round(c * stepX);
            if (dx0 >= W) continue;
            const wCols = Math.min(gw, W - dx0);
            const m0 = (data[at] % GLYPHS.length) * cellArea;
            let o = dy0 * W + dx0;
            for (let y = 0, m = m0; y < hRows; y++, m += gw, o += W) {
              for (let x = 0; x < wCols; x++) {
                const v = mask[m + x];
                if (v === 0) continue;
                const av = (v * a8) >> 8;
                pixels[o + x] = LITTLE_ENDIAN ? ((av << 24) | rgb) >>> 0 : (rgb | av) >>> 0;
              }
            }
          }
        }
        ctx.putImageData(image, 0, 0);
      },
      dispose() {},
    };
  }
  function normalizeZones(zones) {
    if (!Array.isArray(zones)) return [];
    const out = [];
    for (const z of zones) {
      if (!z) continue;
      const x = Number(z.x);
      const y = Number(z.y);
      const w = Number(z.w ?? z.width);
      const h = Number(z.h ?? z.height);
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
      out.push({
        x,
        y,
        w,
        h,
        alpha: Number.isFinite(Number(z.alpha)) ? Math.max(0, Math.min(1, Number(z.alpha))) : RIPPLE.calmAlpha,
        feather: Number.isFinite(Number(z.feather)) ? Math.max(1, Number(z.feather)) : RIPPLE.calmFeather,
      });
    }
    return out;
  }
  function zonesKey(list) {
    let key = '';
    for (const z of list) key += `${Math.round(z.x)},${Math.round(z.y)},${Math.round(z.w)},${Math.round(z.h)},${z.alpha},${z.feather};`;
    return key;
  }
  function clampFinite(val, fallback, min, max) {
    const n = Number(val);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }
  function isCanvasDocHidden(canvas) {
    const owner = canvas && canvas.ownerDocument;
    if (owner && typeof owner.hidden === 'boolean') return owner.hidden;
    return typeof document !== 'undefined' && Boolean(document && document.hidden === true);
  }
  function createGlyphField(canvas, columns, rows, waves, options) {
    columns = clampDim(columns);
    rows = clampDim(rows);
    const force2D = Boolean(options && (options.prefer2D || options.force2D)) || (typeof globalThis !== 'undefined' && globalThis.__agRippleForce2D === true);
    const renderer = (columns > 0 && rows > 0)
      ? ((force2D ? null : createWebGL2Renderer(canvas, columns, rows)) || create2DRenderer(canvas, columns, rows))
      : null;
    const { cellWidth, cellHeight } = RIPPLE;
    const cells = columns * rows;
    const glow = new Float32Array(cells);
    const patch = new Float32Array(cells);
    const glyphs = new Uint8Array(cells);
    const edge = new Float32Array(cells);
    const mask = new Float32Array(cells);
    const breathSin = new Float32Array(cells);
    const breathCos = new Float32Array(cells);
    const wasLit = new Uint8Array(cells);
    let lastIdleRefreshMs = -Infinity;
    let lastIdleDark = null;
    let lastIdleAlphaScale = -1;
    const cloudColumns = new Map();
    const nebulaState = [
      { x: 0, y: 0, radius: 1, strength: 0, hue: 0 },
      { x: 0, y: 0, radius: 1, strength: 0, hue: 0 },
      { x: 0, y: 0, radius: 1, strength: 0, hue: 0 },
    ];
    const effective = { dark: true, ink: [0, 0, 0], wave: [0, 0, 0], fontFamily: 'monospace', aura: null, nebula: nebulaState, prismStrength: 1, auraPhase: 0, ambientIntensity: 1, spectrumCode: 0, alphaScale: 1, nebulaLiftScale: 1, auraLiftScale: 1 };
    let lastNebulaEnabled = true;
    let instanceZones = normalizeZones(options && options.calmZones);
    let appliedKey = null;
    let lastZonesRef = null;
    let lastZonesNormalized = [];
    let lastTick = -1;
    let lastDraw = -Infinity;
    let glowing = false;
    let prismBurst = 0;
    let stale = true;
    const colClouds = new Array(Math.max(0, columns));
    const featherCols = Math.max(1, columns * RIPPLE.edgeFeather);
    const featherRows = Math.max(1, rows * RIPPLE.edgeFeather);
    for (let row = 0; row < rows; row++) {
      const y = row * cellHeight + cellHeight / 2;
      const ey = smooth((Math.min(row, rows - 1 - row) + 0.5) / featherRows);
      const rowBase = row * columns;
      for (let column = 0; column < columns; column++) {
        const cell = rowBase + column;
        const x = column * cellWidth + cellWidth / 2;
        patch[cell] = patchClear(x, y);
        const ex = smooth((Math.min(column, columns - 1 - column) + 0.5) / featherCols);
        edge[cell] = ex * ey;
        mask[cell] = edge[cell];
        const phase = fractalNoise(x / RIPPLE.breathScale + 53, y / RIPPLE.breathScale + 71) * TAU * 1.7;
        breathSin[cell] = Math.sin(phase);
        breathCos[cell] = Math.cos(phase);
      }
    }
    function applyZones(list) {
      const key = zonesKey(list);
      if (key === appliedKey) return;
      appliedKey = key;
      for (let row = 0; row < rows; row++) {
        const y = row * cellHeight + cellHeight / 2;
        for (let column = 0; column < columns; column++) {
          const cell = row * columns + column;
          const x = column * cellWidth + cellWidth / 2;
          let calm = 1;
          for (let i = 0; i < list.length; i++) {
            const z = list[i];
            const dx = Math.max(z.x - x, 0, x - (z.x + z.w));
            const dy = Math.max(z.y - y, 0, y - (z.y + z.h));
            const signed = dx > 0 || dy > 0
              ? Math.sqrt(dx * dx + dy * dy)
              : -Math.min(x - z.x, z.x + z.w - x, y - z.y, z.y + z.h - y);
            if (signed >= z.feather) continue;
            const inset = z.feather * 0.35;
            const t = smooth((signed + inset) / (z.feather + inset));
            const f = z.alpha + (1 - z.alpha) * t;
            if (f < calm) calm = f;
          }
          mask[cell] = edge[cell] * calm;
        }
      }
      stale = true;
    }
    function resolveZones(palette) {
      const source = palette && Array.isArray(palette.calmZones) ? palette.calmZones : null;
      if (!source) return instanceZones;
      if (source !== lastZonesRef) {
        lastZonesRef = source;
        lastZonesNormalized = normalizeZones(source);
      }
      return lastZonesNormalized;
    }
    const onContextLost = (e) => { e?.preventDefault?.(); try { options?.onContextLost?.(e); } catch {} };
    const onContextRestored = () => { try { renderer?.build?.(); } catch {} stale = true; };
    if (canvas && canvas.addEventListener) {
      canvas.addEventListener('webglcontextlost', onContextLost);
      canvas.addEventListener('webglcontextrestored', onContextRestored);
    }
    function tickAt(now, still) {
      return still ? 0 : Math.floor((now / 1000) * RIPPLE.changeRate);
    }
    function cloudColumn(absolute) {
      let col = cloudColumns.get(absolute);
      if (!col) {
        col = new Float32Array(rows);
        for (let row = 0; row < rows; row++) {
          col[row] = cloudClear(absolute * cellWidth + cellWidth / 2, row * cellHeight + cellHeight / 2);
        }
        cloudColumns.set(absolute, col);
      }
      return col;
    }
    function prepareEffective(palette, seconds, still) {
      const dark = palette.dark !== false;
      const rawSpec = palette.spectrum ?? palette.accentTone ?? palette.accent;
      const specCode =
        rawSpec !== undefined && rawSpec !== null
          ? resolveHorizonSpectrumCode(rawSpec)
          : detectHostSpectrumCode(canvas, dark);
      const ambient =
        palette.ambientIntensity !== undefined
          ? clampFinite(palette.ambientIntensity, 1, 0, 1)
          : 1;
      const ink = palette.ink || [146, 148, 156];
      const wave = palette.wave || [214, 218, 228];
      const useCoolLightMix = !dark && (specCode === 0 || specCode === 2);
      const mix = useCoolLightMix ? RIPPLE.lightCoolMix : 0;
      for (let i = 0; i < 3; i++) {
        effective.ink[i] = Math.round(ink[i] + (RIPPLE.lightInkCool[i] - ink[i]) * mix);
        effective.wave[i] = Math.round(wave[i] + (RIPPLE.lightWaveCool[i] - wave[i]) * mix * 0.65);
      }
      const c = palette.conv === true, cl01 = (v, d) => (v !== undefined ? clampFinite(v, 1, 0, 1) : d);
      effective.dark = dark;
      effective.fontFamily = palette.fontFamily || 'monospace';
      effective.aura = ambient <= 0.001 ? null : (palette.aura || null);
      effective.ambientIntensity = ambient;
      effective.spectrumCode = specCode;
      effective.alphaScale = cl01(palette.alphaScale, c ? (ambient <= 0.001 ? 0 : 0.85) : 1);
      effective.nebulaLiftScale = cl01(palette.nebulaLiftScale, c ? 0.75 : 1);
      effective.auraLiftScale = cl01(palette.auraLiftScale, c ? 0.75 : 1);
      if (palette.nebula === false || ambient <= 0.001) {
        effective.nebula = null;
        lastNebulaEnabled = false;
      } else {
        effective.nebula = computeNebulaLobes(seconds, columns * cellWidth, rows * cellHeight, Boolean(still), nebulaState);
        lastNebulaEnabled = true;
      }
      const ps = Number(palette.prismStrength ?? (palette.aura && palette.aura.active ? palette.aura.strength : 1));
      effective.prismStrength = (Number.isFinite(ps) ? Math.max(0, Math.min(1, ps)) : 1) * ambient;
      const ph = Number.isFinite(Number(palette.auraPhase)) ? Number(palette.auraPhase) : seconds * 0.12;
      effective.auraPhase = ph - Math.floor(ph);
      return effective;
    }
    function isFieldBusy() {
      return Boolean(waves && waves.active()) || glowing || prismBurst > 0;
    }
    return {
      mode: renderer ? renderer.mode : 'none',
      isContextLost: () => Boolean(renderer && renderer.isContextLost && renderer.isContextLost()),
      invalidate() { stale = true; },
      setCalmZones(zones) {
        instanceZones = normalizeZones(zones);
        stale = true;
      },
      busy: isFieldBusy,
      isSettled: () => !isFieldBusy(),
      triggerLiftoffBurst(normX = 0.5, normY = 0.62) {
        if (!waves || typeof waves.disturb !== 'function' || columns <= 0 || rows <= 0) return false;
        const nx = clampFinite(normX, 0.5, 0, 1);
        const ny = clampFinite(normY, 0.62, 0, 1);
        const col = Math.max(0, Math.min(columns - 1, Math.round(nx * (columns - 1))));
        const row = Math.max(0, Math.min(rows - 1, Math.round(ny * (rows - 1))));
        waves.disturb(col, row, {
          amplitudeScale: 1.55,
          radiusScale: 1.45,
          duration: 0.42,
          frequency: 6.4,
          loadWeight: 0.22,
        });
        waves.disturb(col, Math.max(0, row - 1), {
          amplitudeScale: 1.28,
          radiusScale: 2.35,
          duration: 0.56,
          frequency: 4.5,
          delay: 0.035,
          loadWeight: 0.22,
        });
        prismBurst = 1;
        stale = true;
        return true;
      },
      triggerTideSwell() {
        if (!waves || typeof waves.disturb !== 'function' || columns <= 0 || rows <= 0) return false;
        const baseRow = Math.max(0, rows - 1 - Math.min(2, Math.floor(rows * 0.06)));
        const anchors = [
          { nx: 0.5, delay: 0, amp: 0.78, rad: 1.32, dur: 0.62, freq: 3.2 },
          { nx: 0.22, delay: 0.07, amp: 0.66, rad: 1.18, dur: 0.6, freq: 3.1 },
          { nx: 0.78, delay: 0.14, amp: 0.66, rad: 1.18, dur: 0.6, freq: 3.1 },
        ];
        for (let i = 0; i < anchors.length; i++) {
          const a = anchors[i];
          const col = Math.max(0, Math.min(columns - 1, Math.round(a.nx * (columns - 1))));
          waves.disturb(col, baseRow, {
            amplitudeScale: a.amp,
            radiusScale: a.rad,
            duration: a.dur,
            frequency: a.freq,
            delay: a.delay,
            loadWeight: 0.16,
          });
        }
        stale = true;
        return true;
      },
      needsDraw(now, still) {
        if (isCanvasDocHidden(canvas)) return false;
        if (stale || isFieldBusy() || tickAt(now, still) !== lastTick) return true;
        if (still || !lastNebulaEnabled) return false;
        return Math.abs(now - lastDraw) >= RIPPLE.nebulaFrameMs;
      },
      draw(now, palette, still) {
        if (columns <= 0 || rows <= 0 || isCanvasDocHidden(canvas)) return;
        const rawDt = lastDraw > -Infinity ? Math.max(0, (now - lastDraw) / 1000) : 0;
        if (!renderer) {
          // 无渲染上下文时依然准确推进尾迹与爆发增益衰减，防止 busy() 永久卡 true
          if (!waves.active()) {
            glowing = false;
            prismBurst = 0;
          } else if (prismBurst > 0) {
            prismBurst = still ? 0 : prismBurst * Math.exp(-Math.max(0.016, rawDt) / 0.38);
            if (prismBurst < 0.015) prismBurst = 0;
          }
          lastDraw = now;
          stale = false;
          return;
        }
        applyZones(resolveZones(palette || {}));
        const seconds = still ? 0 : now / 1000;
        const eff = prepareEffective(palette || {}, seconds, still);
        const burst = prismBurst;
        if (burst > 0) {
          eff.prismStrength = Math.min(1.35, Math.max(eff.prismStrength, 0.96) + 0.34 * burst);
        }
        const tick = tickAt(now, still);
        const waveActive = waves.active();
        const needIdleRefresh =
          stale ||
          tick !== lastTick ||
          eff.dark !== lastIdleDark ||
          eff.alphaScale !== lastIdleAlphaScale ||
          renderer.mode !== 'webgl2' ||
          Math.abs(now - lastIdleRefreshMs) >= 40;

        if (renderer.mode === 'webgl2' && !needIdleRefresh && !waveActive && !glowing && burst <= 0) {
          renderer.draw(eff, canvas.width / (columns * cellWidth), false);
          lastDraw = now;
          return;
        }

        if (tick !== lastTick) {
          for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
              glyphs[row * columns + column] = glyphIndex(column, row, tick);
            }
          }
        }
        const drift = Math.floor((seconds * RIPPLE.cloudDrift) / cellWidth);
        if (needIdleRefresh) {
          for (const abs of cloudColumns.keys()) if (abs < drift) cloudColumns.delete(abs);
          lastIdleRefreshMs = now;
          lastIdleDark = eff.dark;
          lastIdleAlphaScale = eff.alphaScale;
        }
        const decay = still
          ? 0
          : (rawDt > 0 ? Math.exp(-rawDt / RIPPLE.glowDecay) : (waveActive ? 1 : 0.88));
        const idleAlpha = eff.dark ? RIPPLE.idleAlphaDark : RIPPLE.idleAlphaLight;
        const themeScale = (eff.dark ? 1 : RIPPLE.lightAlphaScale) * eff.alphaScale;
        const omega = (TAU / RIPPLE.breathPeriod) * seconds;
        const bs = Math.sin(omega);
        const bc = Math.cos(omega);
        const breathHalf = RIPPLE.breathDepth * 0.5;
        const cap = RIPPLE.waveAlphaCap;
        const slopeScale = RIPPLE.prismSlopeScale;
        const prismThreshold = Math.min(0.95, Math.max(0, RIPPLE.prismThreshold * (1 - 0.38 * burst)));
        const crestScale = 0.78 + 0.34 * burst;
        const bandScale = RIPPLE.prismBands / TAU;
        const invCap = 1 / cap;
        const inv2CellW = 1 / (2 * cellWidth);
        const inv2CellH = 1 / (2 * cellHeight);
        const invPrismSpan = 1 / Math.max(1e-4, 1 - prismThreshold);
        const idleThemeScale = idleAlpha * themeScale;
        const height = waves.height;
        const { data } = renderer;
        for (let c = 0; c < columns; c++) {
          colClouds[c] = cloudColumn(c + drift);
        }
        let brightest = 0;
        for (let row = 0; row < rows; row++) {
          const rowBase = row * columns;
          const hasAbove = row > 0;
          const hasBelow = row < rows - 1;
          for (let column = 0; column < columns; column++) {
            const cell = rowBase + column;
            const here = height[cell];
            const prevG = glow[cell];
            if (here === 0 && prevG === 0) {
              if (!needIdleRefresh && wasLit[cell] === 0) continue;
              wasLit[cell] = 0;
              const breath = 1 - breathHalf * (1 + bs * breathCos[cell] + bc * breathSin[cell]);
              const alpha = idleThemeScale * colClouds[column][row] * breath * mask[cell];
              const at = cell << 2;
              data[at] = glyphs[cell];
              data[at + 1] = alpha < INVISIBLE_ALPHA ? 0 : (alpha >= 1 ? 255 : (alpha * 255 + 0.5) | 0);
              data[at + 2] = 0;
              data[at + 3] = 0;
              continue;
            }
            const breath = 1 - breathHalf * (1 + bs * breathCos[cell] + bc * breathSin[cell]);
            const strength = Math.tanh(RIPPLE.waveGain * (here < 0 ? -here : here));
            const decayed = prevG * decay;
            const shown = decayed > strength ? decayed : strength;
            const lit = shown < 0.01 ? 0 : shown;
            glow[cell] = lit;
            wasLit[cell] = lit > 0 ? 1 : 0;
            let alpha = idleAlpha * colClouds[column][row] * breath;
            let packed = 0;
            let waveMix = strength;
            if (lit > 0) {
              if (lit > brightest) brightest = lit;
              const rawRatio = (patch[cell] * (lit * RIPPLE.glowAlpha + strength * RIPPLE.waveAlpha)) * invCap;
              alpha += cap * Math.tanh(rawRatio);
              const sBoost = strength * 1.15;
              const lBoost = lit * 0.42;
              const mixRaw = sBoost > lBoost ? sBoost : lBoost;
              waveMix = mixRaw > 1 ? 1 : mixRaw;
              const left = column > 0 ? height[cell - 1] : here;
              const right = column < columns - 1 ? height[cell + 1] : here;
              const above = hasAbove ? height[cell - columns] : here;
              const below = hasBelow ? height[cell + columns] : here;
              const gx = (right - left) * inv2CellW;
              const gy = (below - above) * inv2CellH;
              const slopeG = Math.sqrt(gx * gx + gy * gy) * slopeScale;
              const crestG = strength * crestScale;
              const g = slopeG > crestG ? slopeG : crestG;
              if (g > prismThreshold) {
                const amt = smooth((g - prismThreshold) * invPrismSpan);
                const level = Math.round(amt * PRISM_LEVELS);
                if (level > 0) {
                  let hue = Math.atan2(gy, gx + 1e-6) * bandScale + Math.tanh(here * 2.4) * 0.3;
                  hue -= Math.floor(hue);
                  packed = (level << 5) | (Math.floor(hue * HUE_LEVELS) & 31);
                }
              }
            }
            alpha *= mask[cell] * themeScale;
            const at = cell << 2;
            data[at] = glyphs[cell];
            data[at + 1] = alpha < INVISIBLE_ALPHA ? 0 : (alpha >= 1 ? 255 : (alpha * 255 + 0.5) | 0);
            data[at + 2] = lit > 0 ? ((waveMix * 255 + 0.5) | 0) : 0;
            data[at + 3] = packed;
          }
        }
        renderer.draw(eff, canvas.width / (columns * cellWidth));
        if (burst > 0) {
          prismBurst = still ? 0 : burst * Math.exp(-Math.max(0.016, rawDt) / 0.38);
          if (prismBurst < 0.015) prismBurst = 0;
        }
        glowing = brightest > 0;
        if (!glowing && !waves.active()) {
          glow.fill(0);
          prismBurst = 0;
        }
        lastTick = tick;
        lastDraw = now;
        stale = false;
      },
      dispose(keep) {
        if (canvas && canvas.removeEventListener) {
          canvas.removeEventListener('webglcontextlost', onContextLost);
          canvas.removeEventListener('webglcontextrestored', onContextRestored);
        }
        if (renderer) renderer.dispose(keep);
      },
    };
  }
  const DEFAULT_HORIZON_AURA = Object.freeze({
    reach: 0.47,
    prism: 0,
    surge: 0,
    speed: 1,
  });

  const HORIZON_SPECTRUM_MODES = Object.freeze({
    default: 0,
    follow: 0,
    warm: 1,
    alabaster: 1,
    claude: 1,
    cobalt: 2,
    iris: 3,
    amber: 4,
    mono: 5,
    graphite: 5,
  });

  const HORIZON_SEMANTIC_MODES = Object.freeze({
    none: 0,
    'awaiting-decision': 1,
    decision: 1,
    'error-halted': 2,
    error: 2,
    'long-task-complete': 3,
    'complete-jade': 3,
  });

  function resolveHorizonSpectrumCode(mode) {
    if (typeof mode === 'number' && Number.isFinite(mode)) {
      return Math.max(0, Math.min(5, Math.round(mode)));
    }
    const key = String(mode || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(HORIZON_SPECTRUM_MODES, key)
      ? HORIZON_SPECTRUM_MODES[key]
      : 0;
  }

  function resolveHorizonSemanticCode(sem) {
    if (typeof sem === 'number' && Number.isFinite(sem)) {
      return Math.max(0, Math.min(3, Math.round(sem)));
    }
    const key = String(sem || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(HORIZON_SEMANTIC_MODES, key)
      ? HORIZON_SEMANTIC_MODES[key]
      : 0;
  }

  function resolveHorizonDpr(devicePixelRatio = 1, baseScale = 0.72) {
    const raw = Number.isFinite(Number(devicePixelRatio)) && Number(devicePixelRatio) > 0 ? Number(devicePixelRatio) : 1;
    const sc = Number.isFinite(Number(baseScale)) && Number(baseScale) > 0 ? Number(baseScale) : 0.72;
    if (raw <= 1) return Math.max(0.5, +(raw * sc).toFixed(3));
    return Math.max(0.72, Math.min(1.35, +(raw * Math.min(0.68, sc * 0.9)).toFixed(3)));
  }

  function detectHostSpectrumCode(canvas, dark = true) {
    try {
      const doc = (canvas && canvas.ownerDocument) || (typeof document !== 'undefined' ? document : null);
      const html = doc && doc.documentElement;
      if (!html || typeof html.getAttribute !== 'function') return 0;
      const accent = String(html.getAttribute('data-ag-cs-accent') || '').trim().toLowerCase();
      if (accent && accent !== 'follow' && accent !== 'default' && Object.prototype.hasOwnProperty.call(HORIZON_SPECTRUM_MODES, accent)) {
        return HORIZON_SPECTRUM_MODES[accent];
      }
      const pal = String(html.getAttribute('data-ag-cs-palette') || '').trim().toLowerCase();
      if (pal === 'warm' || pal === 'claude') return 1;
      if (!dark && String(html.getAttribute('data-ag-cs-light-preset') || '').trim().toLowerCase() === 'alabaster') {
        return 1;
      }
    } catch {}
    return 0;
  }

  const HORIZON_PRISM_STOPS = [
    [66, 133, 244],
    [155, 114, 203],
    [234, 67, 53],
    [251, 188, 4],
    [92, 198, 252],
  ];
  // 白昼高透水彩棱镜折射五阶闭合光谱（Royal Cobalt #2563EB / Iris #7C3AED / Coral #EA4335 / Amber #D97706 / Cerulean #0284C7）
  const HORIZON_DAYLIGHT_STOPS = [
    [37, 99, 235],
    [124, 58, 237],
    [234, 67, 53],
    [217, 119, 6],
    [2, 132, 199],
  ];
  function horizonPrismRgb(t, out, dark = true) {
    const stops = dark === false ? HORIZON_DAYLIGHT_STOPS : HORIZON_PRISM_STOPS;
    let f = (t - Math.floor(t)) * 5;
    const i = Math.min(4, Math.floor(f));
    f = smooth(f - i);
    const a = stops[i];
    const b = stops[(i + 1) % 5];
    out[0] = a[0] + (b[0] - a[0]) * f;
    out[1] = a[1] + (b[1] - a[1]) * f;
    out[2] = a[2] + (b[2] - a[2]) * f;
    return out;
  }
  const GLOW_VERT_SHADER = `#version 300 es
void main() {
vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;
  const HORIZON_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform float uDark;
uniform float uReach;
uniform float uIntensity;
uniform float uStretch;
uniform float uPresence;
uniform float uPrism;
uniform float uSurge;
uniform float uSpeed;
uniform float uSpectrum;
uniform float uSemantic;
out vec4 outColor;

float hash(vec2 p) {
p = fract(p * vec2(123.34, 456.21));
p += dot(p, p + 45.32);
return fract(p.x * p.y);
}
float ign(vec2 p) {
return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
float noise(vec2 p) {
vec2 i = floor(p);
vec2 f = fract(p);
vec2 u = f * f * (3.0 - 2.0 * f);
return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
float v = 0.0;
float a = 0.5;
for (int i = 0; i < 4; i++) {
v += a * noise(p);
p = p * 2.03 + 17.1;
a *= 0.5;
}
return v;
}
float halftone(vec2 px, vec2 res, float y, float t, float cell, float msk) {
float persp = 1.0 / (0.55 + y);
vec2 g = vec2((px.x - res.x * 0.5) * persp, res.y * log(0.55 + y));
g.y += 10.0 * sin(g.x * 0.007 + t * 0.42) + 3.2 * sin(g.x * 0.019 - t * 0.28) - t * 1.5;
vec2 uvCell = g / cell;
vec2 c = fract(uvCell) - 0.5;
float dist = length(c);
float aa = clamp(fwidth(dist) * 1.15, 0.035, 0.14);
float r = 0.08 + 0.16 * msk;
return (1.0 - smoothstep(r - aa, r + aa * 0.35, dist)) * msk;
}
const vec3 DEEP_SPACE_BLUE = vec3(0.059, 0.090, 0.227);
const vec3 ZENITH_BLUE = vec3(0.192, 0.525, 1.000);
const vec3 SKY_BLUE = vec3(0.361, 0.776, 0.988);
const vec3 HAZE_BLUE = vec3(0.733, 0.886, 1.000);
const vec3 PRISM_COBALT = vec3(0.259, 0.522, 0.957);
const vec3 PRISM_IRIS = vec3(0.608, 0.447, 0.796);
const vec3 PRISM_CORAL = vec3(0.918, 0.263, 0.208);
const vec3 PRISM_AMBER = vec3(0.984, 0.737, 0.016);
const vec3 ICE_MIST = vec3(0.839, 0.933, 1.000);
const vec3 DAY_COBALT = vec3(0.145, 0.388, 0.922);
const vec3 DAY_IRIS = vec3(0.486, 0.227, 0.929);
const vec3 DAY_CORAL = vec3(0.918, 0.263, 0.208);
const vec3 DAY_AMBER = vec3(0.851, 0.467, 0.024);
const vec3 DAY_CERULEAN = vec3(0.008, 0.518, 0.780);
const vec3 WARM_DARK_A = vec3(0.580, 0.290, 0.204);
const vec3 WARM_DARK_B = vec3(0.851, 0.467, 0.341);
const vec3 WARM_DARK_C = vec3(0.933, 0.682, 0.365);
const vec3 DAY_TERRACOTTA = vec3(0.761, 0.349, 0.204);
const vec3 DAY_SIENNA = vec3(0.635, 0.247, 0.141);
const vec3 MONO_DARK_LO = vec3(0.620, 0.659, 0.725);
const vec3 MONO_DARK_HI = vec3(0.847, 0.878, 0.929);
const vec3 MONO_LIGHT_LO = vec3(0.267, 0.318, 0.400);
const vec3 MONO_LIGHT_HI = vec3(0.416, 0.475, 0.569);
const vec3 SEM_AMBER_D = vec3(0.949, 0.722, 0.294);
const vec3 SEM_AMBER_L = vec3(0.851, 0.467, 0.024);
const vec3 SEM_CORAL_D = vec3(0.851, 0.345, 0.365);
const vec3 SEM_CORAL_L = vec3(0.863, 0.149, 0.149);
const vec3 SEM_JADE_D = vec3(0.314, 0.745, 0.576);
const vec3 SEM_JADE_L = vec3(0.020, 0.588, 0.412);
vec3 blueLoop(float x) {
float t = fract(x) * 4.0;
float f = smoothstep(0.0, 1.0, fract(t));
vec3 indigo = mix(DEEP_SPACE_BLUE, ZENITH_BLUE, 0.84);
vec3 ice = mix(SKY_BLUE, HAZE_BLUE, 0.35);
if (t < 1.0) return mix(ZENITH_BLUE, indigo, f);
if (t < 2.0) return mix(indigo, SKY_BLUE, f);
if (t < 3.0) return mix(SKY_BLUE, ice, f);
return mix(ice, ZENITH_BLUE, f);
}
vec3 prismLoop(float x) {
float t = fract(x) * 5.0;
float f = smoothstep(0.0, 1.0, fract(t));
if (t < 1.0) return mix(PRISM_COBALT, PRISM_IRIS, f);
if (t < 2.0) return mix(PRISM_IRIS, PRISM_CORAL, f);
if (t < 3.0) return mix(PRISM_CORAL, PRISM_AMBER, f);
if (t < 4.0) return mix(PRISM_AMBER, SKY_BLUE, f);
return mix(SKY_BLUE, PRISM_COBALT, f);
}
vec3 daylightInkLoop(float x) {
float t = fract(x) * 5.0;
float f = smoothstep(0.0, 1.0, fract(t));
if (t < 1.0) return mix(DAY_COBALT, DAY_IRIS, f);
if (t < 2.0) return mix(DAY_IRIS, DAY_CORAL, f);
if (t < 3.0) return mix(DAY_CORAL, DAY_AMBER, f);
if (t < 4.0) return mix(DAY_AMBER, DAY_CERULEAN, f);
return mix(DAY_CERULEAN, DAY_COBALT, f);
}
vec3 spectrumBaseDark(float spec, float ph) {
float w = 0.5 + 0.5 * sin(ph * 6.2831853);
if (spec > 4.5) return mix(MONO_DARK_LO, MONO_DARK_HI, w);
if (spec > 3.5) return mix(vec3(0.820, 0.545, 0.200), SEM_AMBER_D, w);
if (spec > 2.5) return mix(vec3(0.440, 0.360, 0.820), PRISM_IRIS, w);
if (spec > 1.5) return blueLoop(ph);
if (spec > 0.5) return mix(WARM_DARK_A, WARM_DARK_B, 0.35 + 0.65 * w);
return blueLoop(ph);
}
vec3 spectrumPrismDark(float spec, float ph) {
float w = 0.5 + 0.5 * sin(ph * 6.2831853 + 1.1);
if (spec > 4.5) return mix(MONO_DARK_LO, MONO_DARK_HI, w);
if (spec > 3.5) return mix(SEM_AMBER_D, WARM_DARK_C, w);
if (spec > 2.5) return mix(PRISM_IRIS, vec3(0.710, 0.560, 0.960), w);
if (spec > 1.5) return mix(PRISM_COBALT, SKY_BLUE, w);
if (spec > 0.5) return mix(WARM_DARK_B, WARM_DARK_C, w);
return prismLoop(ph);
}
vec3 spectrumInkLight(float spec, float ph, float washPhase) {
float w = 0.5 + 0.5 * sin(ph * 6.2831853);
float sw = 0.5 + 0.5 * sin(washPhase);
if (spec > 4.5) return mix(MONO_LIGHT_LO, MONO_LIGHT_HI, 0.5 * (w + sw));
if (spec > 3.5) return mix(DAY_AMBER, vec3(0.706, 0.325, 0.035), w);
if (spec > 2.5) return mix(DAY_IRIS, vec3(0.310, 0.275, 0.898), w);
if (spec > 1.5) return mix(DAY_COBALT, DAY_CERULEAN, sw);
if (spec > 0.5) return mix(DAY_TERRACOTTA, mix(DAY_AMBER, DAY_SIENNA, sw), 0.45 + 0.45 * w);
return daylightInkLoop(ph);
}
vec3 semanticColor(float sem, float dark, float ph) {
float w = 0.5 + 0.5 * sin(ph * 6.2831853);
if (sem < 1.5) {
return dark > 0.5
  ? mix(SEM_AMBER_D, vec3(0.980, 0.835, 0.480), 0.35 * w)
  : mix(SEM_AMBER_L, vec3(0.706, 0.325, 0.035), 0.40 * w);
}
if (sem < 2.5) {
return dark > 0.5
  ? mix(SEM_CORAL_D, vec3(0.690, 0.235, 0.265), 0.40 * w)
  : mix(SEM_CORAL_L, vec3(0.620, 0.110, 0.120), 0.35 * w);
}
return dark > 0.5
  ? mix(SEM_JADE_D, SKY_BLUE, 0.38 * w)
  : mix(SEM_JADE_L, DAY_CERULEAN, 0.42 * w);
}
vec3 sm(vec3 a,float d,float p,float i,float w){return w>.001?mix(a,semanticColor(i,d,p),w):a;}
void main() {
vec2 uv = gl_FragCoord.xy / max(uRes, vec2(1.0));
float reach = max(uReach, 0.01);
float stretch = uStretch * (1.0 + 0.08 * (uSpeed - 1.0));
float surgeUp = max(uSurge, 0.0);
float yCut = uv.y / reach - 0.25 * stretch;
if (yCut > 1.6 + 0.22 * surgeUp) {
outColor = vec4(0.0);
return;
}
float topFeather = 1.0 - smoothstep(1.15 + 0.14 * surgeUp, 1.58 + 0.22 * surgeUp, yCut);
vec2 px = gl_FragCoord.xy / max(uDpr, 0.5);
vec2 res = uRes / max(uDpr, 0.5);
float t = uTime;
vec2 p = (px - res * 0.5) / max(res.y, 1.0);
vec2 q = p + 0.09 * vec2(fbm(p * 2.0 + vec2(t * 0.16, 0.0)), fbm(p * 2.0 + vec2(3.1, -t * 0.13))) - 0.045;
float y = uv.y / reach;
float waveA = sin(uv.x * 5.2 - t * 0.68);
float waveB = sin(uv.x * 8.6 + t * 0.46 + 1.4);
float curtain = 0.5 + 0.32 * waveA + 0.18 * waveB;
float jut = (fbm(vec2(px.x / 220.0 + t * 0.18, t * 0.11)) - 0.5) * 0.68 + (waveA * 0.65 + waveB * 0.35) * 0.24;
float h = y + stretch * (0.36 * jut + 0.11 * (fbm(vec2(px.x / 90.0 - t * 0.21, t * 0.14 + 3.0)) - 0.5));
float glow = exp(-max(h, 0.0) * max(h, 0.0) * 4.0) * (0.76 + 0.42 * curtain) * mix(0.35, 1.0, smoothstep(0.0, 0.3, uv.x) * (1.0 - smoothstep(0.7, 1.0, uv.x)));
float basePhase = px.x / max(res.x, 1.0) * 0.9 + t * 0.15 + 0.22 * fbm(q * 1.5);
float semId = floor(uSemantic + 0.001);
float semW = semId > 0.5 ? clamp(1.0 - (uSemantic - semId) / 0.98, 0.0, 1.0) : 0.0;
vec3 base = sm(spectrumBaseDark(uSpectrum, basePhase), 1.0, basePhase, semId, semW);
float n = fbm(q * 3.0 + t * 0.16);
float field = (1.0 - exp(-1.8 * glow * (0.75 + 0.45 * n))) / (1.0 - exp(-1.8 * 1.2));
float pPhase = uv.x * 1.18 - t * 0.18 + 0.28 * fbm(q * 2.1 + vec2(0.0, t * 0.12)) + 0.14 * y;
vec3 dotPrismTint = vec3(0.0);
float dotPrismMix = 0.0;
float dotBoost = 0.0;
float surgeArc = 0.0;
float surgeDy = 0.0;
float chimeWave = 0.0;
float chimePhase = 0.0;
float effPrism = uSpectrum > 4.5 ? uPrism * 0.28 : uPrism;
if (effPrism > 0.0001 || abs(uSurge) > 0.0001) {
vec3 pCol = sm(spectrumPrismDark(uSpectrum, pPhase), 1.0, pPhase, semId, semW);
if (effPrism > 0.0001) {
float wing = smoothstep(0.06, 0.42, field) * (1.0 - 0.52 * smoothstep(0.72, 0.98, field));
float caustics = 0.52 + 0.48 * smoothstep(-0.24, 0.26, jut);
base = mix(base, pCol, clamp(effPrism * 1.15 * wing * caustics, 0.0, 0.68));
dotPrismTint = pCol;
dotPrismMix = clamp(effPrism * 1.25 * (0.45 + 0.55 * caustics), 0.0, 0.78);
}
if (uSurge > 0.0001) {
float sp = clamp(uSurge, 0.0, 1.0);
float sEnv = sin(sp * 3.14159265) * (1.0 - 0.32 * sp);
float xRel = (uv.x - 0.5) * 2.0;
float xSpan = smoothstep(0.0, 0.22, uv.x) * (1.0 - smoothstep(0.78, 1.0, uv.x));
float frontY = 1.15 * (1.0 - pow(1.0 - sp, 1.45)) - 0.15 * xRel * xRel + 0.06 * jut;
float dy = y - frontY;
float arc = (dy >= 0.0 ? exp(-dy * dy * 24.0) : exp(-dy * dy * 5.2)) * sEnv * xSpan;
surgeArc = arc;
surgeDy = dy - sp * 0.35;
vec3 surgeLead = sm(uSpectrum > 4.5 ? MONO_DARK_HI : (uSpectrum > 0.5 && uSpectrum < 1.5 ? WARM_DARK_C : SKY_BLUE), 1.0, pPhase + 0.2, semId, semW);
vec3 surgeTrail = sm(spectrumPrismDark(uSpectrum, pPhase + surgeDy * 1.3), 1.0, pPhase + surgeDy * 1.3, semId, semW);
vec3 surgeCol = mix(surgeLead, surgeTrail, 0.62);
field = clamp(field + arc * 0.52, 0.0, 1.0);
base = mix(base, surgeCol, clamp(arc * 0.78, 0.0, 0.85));
dotBoost += arc * 0.58;
dotPrismTint = mix(dotPrismTint, surgeCol, clamp(arc * 0.85, 0.0, 1.0));
dotPrismMix = max(dotPrismMix, clamp(arc * 0.82, 0.0, 0.85));
} else if (uSurge < -0.0001) {
float cp = clamp(-uSurge, 0.0, 1.0);
float cEnv = sin(cp * 3.14159265) * (1.0 - 0.28 * cp);
float rx = abs(uv.x - 0.5);
float ringR = 0.04 + 0.43 * (1.0 - pow(1.0 - cp, 1.35));
float dr = (rx - ringR) / 0.135;
float hRip = exp(-dr * dr) + 0.32 * (1.0 - cp) * exp(-rx * rx * 18.0);
float setY = 0.70 * pow(1.0 - cp, 1.35) + 0.04;
float dsy = y - setY;
float vSet = exp(-dsy * dsy * 13.5) * (1.0 - smoothstep(1.05, 1.35, y));
float chime = hRip * vSet * cEnv;
chimeWave = chime;
chimePhase = uv.x * 1.5 + rx * 2.0 - cp * 0.35;
vec3 chimeLead = sm(uSpectrum > 4.5 ? MONO_DARK_HI : (uSpectrum > 0.5 && uSpectrum < 1.5 ? WARM_DARK_C : ICE_MIST), 1.0, chimePhase, semId, semW);
vec3 chimeCol = mix(mix(chimeLead, spectrumPrismDark(uSpectrum, chimePhase), 0.22), chimeLead, semW);
field = clamp(field + chime * 0.46, 0.0, 1.0);
base = mix(base, chimeCol, clamp(chime * 0.82, 0.0, 0.88));
dotBoost += chime * 0.42;
dotPrismTint = mix(dotPrismTint, chimeCol, clamp(chime * 0.8, 0.0, 1.0));
dotPrismMix = max(dotPrismMix, clamp(chime * 0.75, 0.0, 0.82));
}
}
float hot = 0.75 * smoothstep(0.65, 1.0, field);
field *= topFeather;
dotBoost *= topFeather;
float band = smoothstep(0.3, 0.55, field) * (1.0 - smoothstep(0.7, 0.98, field));
float dotMsk = clamp(band * 0.8 * smoothstep(0.12, 0.32, -jut) + dotBoost, 0.0, 1.0);
float dA = halftone(px, res, uv.y, t, 7.0, dotMsk);
float grain = hash(px + fract(t * 7.0) * 91.0) - 0.5;
vec3 c;
vec3 dc;
float a;
float da;
if (uDark > 0.5) {
vec3 fill = base * (1.0 + 0.25 * hot) * mix(0.72, 1.16, uIntensity);
c = fill + grain * 0.05;
dc = min(fill * 1.6, 1.0);
if (dotPrismMix > 0.0001) {
dc = mix(dc, min(dotPrismTint * 1.22 + 0.08, 1.0), dotPrismMix);
}
float breathMod = mix(0.68, 1.24, clamp(uIntensity, 0.0, 1.0));
a = clamp(field * 0.56 * breathMod * uPresence, 0.0, 1.0);
da = clamp(dA * sqrt(a) * 0.78, 0.0, 1.0);
} else {
// Daylight Dichroic Ink Wash (pure high-chroma jewel pigments without white fog dilution)
float washPh = uv.x * 3.1 + t * 0.48 + 1.3 * n;
vec3 prismInk = sm(spectrumInkLight(uSpectrum, pPhase, washPh), 0.0, pPhase, semId, semW);
vec3 washBase = sm(uSpectrum > 0.5 ? spectrumInkLight(uSpectrum, basePhase, washPh) : mix(DAY_COBALT, DAY_CERULEAN, 0.5 + 0.5 * sin(washPh)), 0.0, basePhase, semId, semW);
float causticsL = 0.48 + 0.52 * smoothstep(-0.24, 0.26, jut);
float dichroicW = clamp((0.48 + 0.46 * effPrism) * (0.58 + 0.42 * causticsL), 0.0, 0.94);
vec3 inkRgb = mix(washBase, prismInk, dichroicW);
if (surgeArc > 0.0001) {
vec3 surgeInk = sm(mix(washBase, spectrumInkLight(uSpectrum, pPhase + surgeDy * 1.3, washPh), 0.68), 0.0, pPhase + surgeDy * 1.3, semId, semW);
inkRgb = mix(inkRgb, surgeInk, clamp(surgeArc * 0.85, 0.0, 0.90));
} else if (chimeWave > 0.0001) {
vec3 chimeInk = sm(mix(washBase, spectrumInkLight(uSpectrum, chimePhase, washPh), 0.45), 0.0, chimePhase, semId, semW);
inkRgb = mix(inkRgb, chimeInk, clamp(chimeWave * 0.86, 0.0, 0.90));
}
vec3 hotAnchor = mix(uSpectrum > 4.5 ? MONO_LIGHT_LO : (uSpectrum > 0.5 && uSpectrum < 1.5 ? DAY_SIENNA : DAY_COBALT * 0.84 + DAY_IRIS * 0.16), washBase * 0.88, semW);
inkRgb = mix(inkRgb, hotAnchor, hot * 0.24);
c = clamp(inkRgb + grain * 0.022, 0.0, 1.0);
dc = clamp(mix(washBase * 0.86, prismInk * 0.92, clamp(0.26 + dotPrismMix * 0.68, 0.0, 0.90)), 0.0, 1.0);
float effPres = pow(clamp(uPresence, 0.0, 1.0), 0.68);
float washGain = mix(1.02, 1.62, clamp(uIntensity, 0.0, 1.0));
a = clamp(field * 0.66 * washGain * effPres, 0.0, 0.84);
da = clamp(dA * (0.52 + 0.44 * sqrt(a)) * effPres, 0.0, 0.88);
}
float outAlpha = clamp(a + da * (1.0 - a), 0.0, 1.0);
vec3 premulRgb = clamp(c, 0.0, 1.0) * a * (1.0 - da) + clamp(dc, 0.0, 1.0) * da;
if (outAlpha > 0.0015) {
vec2 dp = gl_FragCoord.xy + fract(t * 3.0) * vec2(37.0, 19.0);
float tpdf = ign(dp) - ign(dp.yx + vec2(11.3, 27.1));
premulRgb += (tpdf / 255.0) * min(1.0, outAlpha * 2.5);
outAlpha = clamp(outAlpha + tpdf * (0.5 / 255.0), 0.0, 1.0);
}
outColor = clamp(vec4(premulRgb, outAlpha), 0.0, 1.0);
}`;
  const GLOW_FRAG_SHADER = HORIZON_FRAGMENT_SHADER;
  function createBrandHorizonGLRenderer(canvas) {
    const gl = canvas && canvas.getContext
      ? canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false })
      : null;
    if (!gl || gl.isContextLost?.()) return null;
    let program = null;
    const u = {};
    function compile(type, source) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh) || 'glow shader compile error';
        gl.deleteShader(sh);
        throw new Error(log);
      }
      return sh;
    }
    function free() {
      if (program) gl.deleteProgram(program);
      program = null;
    }
    function build() {
      free();
      const vs = compile(gl.VERTEX_SHADER, GLOW_VERT_SHADER);
      const fs = compile(gl.FRAGMENT_SHADER, HORIZON_FRAGMENT_SHADER);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'glow program link error');
      }
      gl.useProgram(program);
      for (const name of ['uRes', 'uDpr', 'uTime', 'uDark', 'uReach', 'uIntensity', 'uStretch', 'uPresence', 'uPrism', 'uSurge', 'uSpeed', 'uSpectrum', 'uSemantic']) {
        u[name] = gl.getUniformLocation(program, name);
      }
    }
    try {
      build();
    } catch {
      try { free(); } catch {}
      return null;
    }
    return {
      mode: 'webgl2',
      build,
      isContextLost: () => Boolean(gl.isContextLost?.()),
      clear() {
        if (!program || gl.isContextLost?.()) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
      draw(w, h, dpr, timeSec, dark, intensity, presence, reach = DEFAULT_HORIZON_AURA.reach, prism = 0, surge = 0, speed = 1, spectrumCode = 0, semanticCode = 0) {
        if (!program || gl.isContextLost?.()) return;
        gl.viewport(0, 0, w, h);
        gl.useProgram(program);
        gl.uniform2f(u.uRes, w, h);
        gl.uniform1f(u.uDpr, dpr);
        gl.uniform1f(u.uTime, timeSec);
        gl.uniform1f(u.uDark, dark ? 1 : 0);
        gl.uniform1f(u.uReach, reach);
        gl.uniform1f(u.uIntensity, intensity);
        gl.uniform1f(u.uStretch, 0.6);
        gl.uniform1f(u.uPresence, presence);
        gl.uniform1f(u.uPrism, prism);
        gl.uniform1f(u.uSurge, surge);
        gl.uniform1f(u.uSpeed, speed);
        if (u.uSpectrum) gl.uniform1f(u.uSpectrum, spectrumCode);
        if (u.uSemantic) gl.uniform1f(u.uSemantic, semanticCode);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose(keep) {
        free();
        if (!keep) try { gl.getExtension?.('WEBGL_lose_context')?.loseContext?.(); } catch {}
      },
    };
  }
  function sampleHorizonTone2D(spectrumCode, semanticCode, dark, phase, out) {
    const w = 0.5 + 0.5 * Math.sin(phase * TAU);
    if (semanticCode >= 1) {
      if (semanticCode === 1) {
        out[0] = dark ? 242 + 8 * w : 217 - 37 * w;
        out[1] = dark ? 184 + 28 * w : 119 - 36 * w;
        out[2] = dark ? 75 + 47 * w : 6 + 3 * w;
        return out;
      }
      if (semanticCode === 2) {
        out[0] = dark ? 217 - 41 * w : 220 - 62 * w;
        out[1] = dark ? 88 - 28 * w : 38 - 10 * w;
        out[2] = dark ? 93 - 25 * w : 38 - 8 * w;
        return out;
      }
      out[0] = dark ? 80 + 12 * w : 5 - 3 * w;
      out[1] = dark ? 190 + 8 * w : 150 - 18 * w;
      out[2] = dark ? 147 + 105 * w : 105 + 94 * w;
      return out;
    }
    if (spectrumCode === 5) {
      out[0] = dark ? 158 + 58 * w : 68 + 38 * w;
      out[1] = dark ? 168 + 56 * w : 81 + 40 * w;
      out[2] = dark ? 185 + 52 * w : 102 + 43 * w;
      return out;
    }
    if (spectrumCode === 4) {
      out[0] = dark ? 209 + 33 * w : 217 - 37 * w;
      out[1] = dark ? 139 + 45 * w : 119 - 36 * w;
      out[2] = dark ? 51 + 24 * w : 6 + 3 * w;
      return out;
    }
    if (spectrumCode === 3) {
      out[0] = dark ? 112 + 69 * w : 124 - 45 * w;
      out[1] = dark ? 92 + 51 * w : 58 + 12 * w;
      out[2] = dark ? 209 + 36 * w : 237 - 8 * w;
      return out;
    }
    if (spectrumCode === 2) {
      out[0] = dark ? 49 + 43 * w : 37 - 35 * w;
      out[1] = dark ? 134 + 64 * w : 99 + 33 * w;
      out[2] = dark ? 255 - 3 * w : 235 - 36 * w;
      return out;
    }
    if (spectrumCode === 1) {
      out[0] = dark ? 168 + 64 * w : 194 - 28 * w;
      out[1] = dark ? 86 + 72 * w : 89 + 16 * w;
      out[2] = dark ? 58 + 35 * w : 52 - 22 * w;
      return out;
    }
    return horizonPrismRgb(phase, out, dark);
  }
  function createBrandHorizon2DRenderer(canvas) {
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return null;
    let image = null;
    let pixels = null;
    const prismRgb = [0, 0, 0];
    const surgeRgb = [0, 0, 0];
    const toneRgb = [0, 0, 0];
    function ensureImage(w, h) {
      if (!image || image.width !== w || image.height !== h) {
        image = ctx.createImageData(w, h);
        pixels = new Uint32Array(image.data.buffer);
      }
    }
    return {
      mode: '2d',
      build() {},
      clear() {
        if (typeof ctx.clearRect === 'function') {
          ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
        } else if (canvas.width > 0 && canvas.height > 0) {
          ensureImage(canvas.width, canvas.height);
          pixels.fill(0);
          ctx.putImageData(image, 0, 0);
        }
      },
      draw(w, h, dpr, timeSec, dark, intensity, presence, reach = DEFAULT_HORIZON_AURA.reach, prism = 0, surge = 0, speed = 1, spectrumCode = 0, semanticCode = 0) {
        if (!w || !h) return;
        ensureImage(w, h);
        pixels.fill(0);
        const rEff = Math.max(0.01, reach);
        const stretchScale = 1 + 0.08 * (speed - 1);
        const surgeUp = Math.max(0, surge);
        const effPrism = spectrumCode === 5 ? prism * 0.28 : prism;
        const hasPrism = effPrism > 0.0001;
        const hasSurge = Math.abs(surge) > 0.0001;
        const customMode = spectrumCode > 0 || semanticCode > 0;
        const cssW = w / Math.max(0.5, dpr);
        const cssH = h / Math.max(0.5, dpr);
        const step = Math.max(1, Math.round(dpr));
        const effPresL = dark ? presence : Math.pow(Math.max(0, Math.min(1, presence)), 0.68);
        const washGainL = dark ? 1 : (1.02 + 0.60 * Math.max(0, Math.min(1, intensity)));
        const darkBreathMod = dark ? (0.68 + 0.56 * Math.max(0, Math.min(1, intensity))) : 1;
        for (let py = 0; py < h; py += step) {
          const uvY = 1 - py / h;
          const yNorm = uvY / rEff;
          if (yNorm > 1.48 + 0.25 * surgeUp) continue;
          const persp = 1 / (0.55 + uvY);
          const gyBase = cssH * Math.log(0.55 + uvY);
          for (let px = 0; px < w; px += step) {
            const uvX = px / w;
            const cssX = px / Math.max(0.5, dpr);
            const waveA = Math.sin(uvX * 5.2 - timeSec * 0.68);
            const waveB = Math.sin(uvX * 8.6 + timeSec * 0.46 + 1.4);
            const curtain = 0.5 + 0.32 * waveA + 0.18 * waveB;
            const jut = (valueNoise(cssX / 220 + timeSec * 0.18, timeSec * 0.11) - 0.5) * 0.68 + (waveA * 0.65 + waveB * 0.35) * 0.24;
            const hJut = Math.max(0, yNorm + 0.25 * stretchScale * jut);
            const edgeFade = (uvX < 0.3 ? 0.35 + 0.65 * smooth(uvX / 0.3) : uvX > 0.7 ? 0.35 + 0.65 * smooth((1 - uvX) / 0.3) : 1);
            const gVal = Math.exp(-hJut * hJut * 4.0) * (0.76 + 0.42 * curtain) * edgeFade;
            let field = dark
              ? Math.min(1, gVal * 1.12 * darkBreathMod * presence)
              : Math.min(1, gVal * 1.12);
            if (!hasSurge && (dark ? field < 0.008 : field * effPresL < 0.008)) continue;
            const mixSky = 0.5 + 0.5 * Math.sin(uvX * 3.2 + timeSec * 0.48);
            const pPhase = uvX * 1.18 - timeSec * 0.18 + 0.28 * valueNoise(uvX * 3.1 + 1.7, yNorm * 1.6 - timeSec * 0.12) + 0.14 * yNorm;
            let baseR;
            let baseG;
            let baseB;
            let dotR = 0;
            let dotG = 0;
            let dotB = 0;
            if (dark) {
              if (customMode) {
                sampleHorizonTone2D(spectrumCode, semanticCode, true, uvX * 0.8 + timeSec * 0.12, toneRgb);
                baseR = toneRgb[0];
                baseG = toneRgb[1];
                baseB = toneRgb[2];
              } else {
                baseR = 49 + (92 - 49) * mixSky;
                baseG = 134 + (198 - 134) * mixSky;
                baseB = 255 + (252 - 255) * mixSky;
              }
            } else if (customMode) {
              sampleHorizonTone2D(spectrumCode, semanticCode, false, pPhase, prismRgb);
              sampleHorizonTone2D(spectrumCode, semanticCode, false, uvX * 0.5 + timeSec * 0.08, toneRgb);
              const causticsL = 0.48 + 0.52 * smooth((jut + 0.24) / 0.5);
              const dichroicW = Math.min(0.94, (0.48 + 0.46 * effPrism) * (0.58 + 0.42 * causticsL));
              baseR = toneRgb[0] + (prismRgb[0] - toneRgb[0]) * dichroicW;
              baseG = toneRgb[1] + (prismRgb[1] - toneRgb[1]) * dichroicW;
              baseB = toneRgb[2] + (prismRgb[2] - toneRgb[2]) * dichroicW;
              const dotMix = Math.min(0.9, 0.26 + effPrism * 0.64);
              dotR = toneRgb[0] * 0.86 * (1 - dotMix) + prismRgb[0] * 0.92 * dotMix;
              dotG = toneRgb[1] * 0.86 * (1 - dotMix) + prismRgb[1] * 0.92 * dotMix;
              dotB = toneRgb[2] * 0.86 * (1 - dotMix) + prismRgb[2] * 0.92 * dotMix;
            } else {
              // 白昼高透水彩棱镜折射（2D 分支镜像：Royal Cobalt #2563EB + 四色宝石彩墨，零泛白）
              horizonPrismRgb(pPhase, prismRgb, false);
              const cobR = 37 + (2 - 37) * mixSky;
              const cobG = 99 + (132 - 99) * mixSky;
              const cobB = 235 + (199 - 235) * mixSky;
              const causticsL = 0.48 + 0.52 * smooth((jut + 0.24) / 0.5);
              const dichroicW = Math.min(0.94, (0.48 + 0.46 * prism) * (0.58 + 0.42 * causticsL));
              baseR = cobR + (prismRgb[0] - cobR) * dichroicW;
              baseG = cobG + (prismRgb[1] - cobG) * dichroicW;
              baseB = cobB + (prismRgb[2] - cobB) * dichroicW;
              const dotMix = Math.min(0.9, 0.26 + prism * 0.64);
              dotR = 32 * (1 - dotMix) + prismRgb[0] * 0.92 * dotMix;
              dotG = 85 * (1 - dotMix) + prismRgb[1] * 0.92 * dotMix;
              dotB = 202 * (1 - dotMix) + prismRgb[2] * 0.92 * dotMix;
            }
            let dotBoost = 0;
            if (hasPrism || hasSurge) {
              if (dark && hasPrism) {
                sampleHorizonTone2D(spectrumCode, semanticCode, true, pPhase + 0.18, prismRgb);
                const wing = smooth((field - 0.04) / 0.32) * (1 - 0.5 * smooth((field - 0.68) / 0.28));
                const caustics = 0.52 + 0.48 * smooth((jut + 0.24) / 0.5);
                const wPrism = Math.min(0.68, effPrism * 1.2 * wing * caustics);
                baseR += (prismRgb[0] - baseR) * wPrism;
                baseG += (prismRgb[1] - baseG) * wPrism;
                baseB += (prismRgb[2] - baseB) * wPrism;
              }
              if (surge > 0.0001) {
                const sp = Math.min(1, surge);
                const sEnv = Math.sin(sp * Math.PI) * (1 - 0.32 * sp);
                const xRel = (uvX - 0.5) * 2;
                const xSpan = smooth(uvX / 0.22) * (1 - smooth((uvX - 0.78) / 0.22));
                const frontY = 1.15 * (1 - Math.pow(1 - sp, 1.45)) - 0.15 * xRel * xRel + 0.06 * jut;
                const dy = yNorm - frontY;
                const arc = (dy >= 0 ? Math.exp(-dy * dy * 24) : Math.exp(-dy * dy * 5.2)) * sEnv * xSpan;
                field = Math.min(1, field + arc * 0.52 * (dark ? presence : 1));
                sampleHorizonTone2D(spectrumCode, semanticCode, dark, pPhase + dy * 1.3 - sp * 0.35, surgeRgb);
                const leadR = customMode ? surgeRgb[0] : (dark ? 92 : 37);
                const leadG = customMode ? surgeRgb[1] : (dark ? 198 : 99);
                const leadB = customMode ? surgeRgb[2] : (dark ? 252 : 235);
                const sr = leadR * 0.34 + surgeRgb[0] * 0.66;
                const sg = leadG * 0.34 + surgeRgb[1] * 0.66;
                const sb = leadB * 0.34 + surgeRgb[2] * 0.66;
                const wArc = Math.min(0.88, arc * 0.82);
                baseR += (sr - baseR) * wArc;
                baseG += (sg - baseG) * wArc;
                baseB += (sb - baseB) * wArc;
                dotBoost += arc * 0.58 * (dark ? presence : 1);
              } else if (surge < -0.0001) {
                const cp = Math.min(1, -surge);
                const cEnv = Math.sin(cp * Math.PI) * (1 - 0.28 * cp);
                const rx = Math.abs(uvX - 0.5);
                const ringR = 0.04 + 0.43 * (1 - Math.pow(1 - cp, 1.35));
                const dr = (rx - ringR) / 0.135;
                const hRip = Math.exp(-dr * dr) + 0.32 * (1 - cp) * expClamp(rx * rx * 18);
                const setY = 0.70 * Math.pow(1 - cp, 1.35) + 0.04;
                const dsy = yNorm - setY;
                const vSet = Math.exp(-dsy * dsy * 13.5) * (1 - smooth((yNorm - 1.05) / 0.3));
                const chime = hRip * vSet * cEnv;
                field = Math.min(1, field + chime * 0.46 * (dark ? presence : 1));
                sampleHorizonTone2D(spectrumCode, semanticCode, dark, uvX * 1.5 + rx * 2 - cp * 0.35, surgeRgb);
                const cr = customMode ? surgeRgb[0] : (dark ? (214 * 0.78 + surgeRgb[0] * 0.22) : (2 * 0.55 + surgeRgb[0] * 0.45));
                const cg = customMode ? surgeRgb[1] : (dark ? (238 * 0.78 + surgeRgb[1] * 0.22) : (132 * 0.55 + surgeRgb[1] * 0.45));
                const cb = customMode ? surgeRgb[2] : (dark ? (255 * 0.78 + surgeRgb[2] * 0.22) : (199 * 0.55 + surgeRgb[2] * 0.45));
                const wChime = Math.min(0.88, chime * 0.84);
                baseR += (cr - baseR) * wChime;
                baseG += (cg - baseG) * wChime;
                baseB += (cb - baseB) * wChime;
                dotBoost += chime * 0.42 * (dark ? presence : 1);
              }
            }
            if (dark ? field < 0.008 : field * effPresL < 0.008) continue;
            const gx = (cssX - cssW * 0.5) * persp;
            const gy = gyBase + 10 * Math.sin(gx * 0.007 + timeSec * 0.42) - timeSec * 1.4;
            const cellX = gx / 7 - Math.floor(gx / 7) - 0.5;
            const cellY = gy / 7 - Math.floor(gy / 7) - 0.5;
            const dist = Math.sqrt(cellX * cellX + cellY * cellY);
            const band = Math.min(1, smooth((field - 0.25) / 0.25) * (1 - smooth((field - 0.72) / 0.26)) + dotBoost);
            let fillA;
            let dotA;
            let R;
            let G;
            let B;
            if (dark) {
              dotA = dist < 0.26 ? (1 - smooth((dist - 0.12) / 0.14)) * band * 0.65 : 0;
              fillA = field * 0.48;
              const dLift = spectrumCode === 5 ? 36 : 56;
              R = Math.round(Math.min(255, Math.max(0, baseR + dotA * (spectrumCode === 5 ? 36 : 72)))) & 255;
              G = Math.round(Math.min(255, Math.max(0, baseG + dotA * dLift))) & 255;
              B = Math.round(Math.min(255, Math.max(0, baseB + dotA * (spectrumCode === 5 ? 38 : 24)))) & 255;
            } else {
              fillA = Math.min(0.84, field * 0.66 * washGainL * effPresL);
              dotA = dist < 0.24 ? Math.min(0.88, (1 - smooth((dist - 0.14) / 0.1)) * band * (0.52 + 0.44 * Math.sqrt(fillA)) * effPresL) : 0;
              const hotL = 0.24 * smooth((field - 0.65) / 0.35);
              const ancR = customMode ? baseR * 0.85 : 46;
              const ancG = customMode ? baseG * 0.85 : 92;
              const ancB = customMode ? baseB * 0.85 : 235;
              const inkR = baseR * (1 - hotL) + ancR * hotL;
              const inkG = baseG * (1 - hotL) + ancG * hotL;
              const inkB = baseB * (1 - hotL) + ancB * hotL;
              const compA = fillA + dotA * (1 - fillA);
              if (compA <= 0.002) continue;
              const wFill = (fillA * (1 - dotA)) / compA;
              const wDot = dotA / compA;
              R = Math.round(Math.min(255, Math.max(0, inkR * wFill + dotR * wDot))) & 255;
              G = Math.round(Math.min(255, Math.max(0, inkG * wFill + dotG * wDot))) & 255;
              B = Math.round(Math.min(255, Math.max(0, inkB * wFill + dotB * wDot))) & 255;
            }
            const outA = Math.max(0, Math.min(1, fillA + dotA * (1 - fillA)));
            const A = Math.round(outA * 255) & 255;
            if (A === 0) continue;
            const packed = LITTLE_ENDIAN ? ((A << 24) | (B << 16) | (G << 8) | R) >>> 0 : ((R << 24) | (G << 16) | (B << 8) | A) >>> 0;
            for (let sy = 0; sy < step && py + sy < h; sy++) {
              const rowOff = (py + sy) * w + px;
              for (let sx = 0; sx < step && px + sx < w; sx++) {
                pixels[rowOff + sx] = packed;
              }
            }
          }
        }
        ctx.putImageData(image, 0, 0);
      },
      dispose() {},
    };
  }
  function expClamp(v) {
    return v > 40 ? 0 : Math.exp(-v);
  }

  function parseAmbientScale(raw) {
    if (raw === null || raw === undefined || raw === '') return 1;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    return n <= 0 ? 0 : n > 1 ? Math.max(0, Math.min(1, n / 100)) : Math.max(0, Math.min(1, n));
  }

  function mountBrandHorizonGlow(canvas, options = {}) {
    if (!canvas) {
      return {
        mode: 'none',
        resize() {},
        invalidate() {},
        clear() {},
        setAuraParams() { return { ...DEFAULT_HORIZON_AURA }; },
        getAuraParams() { return { ...DEFAULT_HORIZON_AURA }; },
        getExtendedState() {
          return { ...DEFAULT_HORIZON_AURA, spectrum: 'default', semantic: 'none', ambientIntensity: 1, sleeping: true };
        },
        draw() {},
        drawStaticSnapshot() { return false; },
        isSleeping() { return true; },
        isContextLost() { return false; },
        dispose() {},
      };
    }
    const force2D = Boolean(options.prefer2D || options.force2D) || (typeof globalThis !== 'undefined' && globalThis.__agRippleForce2D === true);
    const renderer = (force2D ? null : createBrandHorizonGLRenderer(canvas)) || createBrandHorizon2DRenderer(canvas);
    let cssW = Math.max(0, Number(options.width || canvas.clientWidth || 0));
    let cssH = Math.max(0, Number(options.height || canvas.clientHeight || 0));
    let dpr = Math.max(0.5, Math.min(1.75, Number(options.dpr || 1)));
    const baseAura = {
      reach: clampFinite(options.reach, DEFAULT_HORIZON_AURA.reach, 0.05, 1),
      prism: clampFinite(options.prism, DEFAULT_HORIZON_AURA.prism, 0, 1),
      surge: clampFinite(options.surge, DEFAULT_HORIZON_AURA.surge, -1, 1),
      speed: clampFinite(options.speed, DEFAULT_HORIZON_AURA.speed, 0, 3),
    };
    const activeAura = { ...baseAura };
    let baseSpectrum = options.spectrum !== undefined ? String(options.spectrum) : (options.accent !== undefined ? String(options.accent) : null);
    let baseSemantic = options.semantic !== undefined ? String(options.semantic) : 'none';
    let baseAmbient = clampFinite(options.ambientIntensity, 1, 0, 1);
    let activeSpectrum = baseSpectrum || 'default';
    let activeSemantic = baseSemantic;
    let activeAmbient = baseAmbient;
    let hasCustom = options.reach !== undefined || options.prism !== undefined || options.surge !== undefined || options.speed !== undefined;
    let startMs = null;
    let lastClockMs = null;
    let lastRawNow = null;
    let flowSec = 0;
    let lastDrawMs = -Infinity;
    let lastDark = null;
    let lastStrength = -1;
    let lastReach = -1;
    let lastPrism = -1;
    let lastSurge = -9;
    let lastSpeed = -1;
    let lastSpectrum = -1;
    let lastSemantic = -1;
    let semMix = 0;
    let holdSem = 0;
    let clearedZero = false;
    let stale = true;
    let sleeping = false;
    const onContextLost = (e) => { e?.preventDefault?.(); try { options?.onContextLost?.(e); } catch {} };
    const onContextRestored = () => { try { renderer?.build?.(); } catch {} stale = true; };
    if (canvas.addEventListener) {
      canvas.addEventListener('webglcontextlost', onContextLost);
      canvas.addEventListener('webglcontextrestored', onContextRestored);
    }
    function syncSize(w, h, nextDpr) {
      const nw = Math.max(0, Math.round(Number(w || 0)));
      const nh = Math.max(0, Math.round(Number(h || 0)));
      const nd = Math.max(0.5, Math.min(1.75, Number(nextDpr || dpr || 1)));
      const pw = Math.max(1, Math.round(nw * nd));
      const ph = Math.max(1, Math.round(nh * nd));
      if (nw !== cssW || nh !== cssH || nd !== dpr || canvas.width !== pw || canvas.height !== ph) {
        cssW = nw;
        cssH = nh;
        dpr = nd;
        if (nw > 0 && nh > 0) {
          canvas.width = pw;
          canvas.height = ph;
        }
        clearedZero = false;
        stale = true;
      }
    }
    if (cssW > 0 && cssH > 0 && (!canvas.width || !canvas.height)) {
      syncSize(cssW, cssH, dpr);
    }
    function setAuraParams(extra) {
      if (!extra || typeof extra !== 'object') {
        baseAura.reach = DEFAULT_HORIZON_AURA.reach;
        baseAura.prism = DEFAULT_HORIZON_AURA.prism;
        baseAura.surge = DEFAULT_HORIZON_AURA.surge;
        baseAura.speed = DEFAULT_HORIZON_AURA.speed;
        baseSpectrum = null;
        baseSemantic = 'none';
        baseAmbient = 1;
        activeSpectrum = 'default';
        activeSemantic = 'none';
        activeAmbient = 1;
        hasCustom = false;
      } else {
        if (extra.reach !== undefined) baseAura.reach = clampFinite(extra.reach, baseAura.reach, 0.05, 1);
        if (extra.prism !== undefined) baseAura.prism = clampFinite(extra.prism, baseAura.prism, 0, 1);
        if (extra.surge !== undefined) baseAura.surge = clampFinite(extra.surge, baseAura.surge, -1, 1);
        if (extra.speed !== undefined) baseAura.speed = clampFinite(extra.speed, baseAura.speed, 0, 3);
        if (extra.spectrum !== undefined || extra.accent !== undefined) {
          baseSpectrum = String(extra.spectrum ?? extra.accent);
          activeSpectrum = baseSpectrum;
        }
        if (extra.semantic !== undefined) {
          baseSemantic = String(extra.semantic);
          activeSemantic = baseSemantic;
        }
        if (extra.ambientIntensity !== undefined) {
          baseAmbient = clampFinite(extra.ambientIntensity, baseAmbient, 0, 1);
          activeAmbient = baseAmbient;
        }
        hasCustom = true;
      }
      Object.assign(activeAura, baseAura);
      stale = true;
      return { ...activeAura };
    }
    function clearCanvas() {
      if (renderer && typeof renderer.clear === 'function') {
        renderer.clear();
      }
      clearedZero = true;
      sleeping = true;
    }
    function renderInternal(nowInput, isDarkOrOpts = {}, strengthArg, extraArg, forceStatic = false) {
      if (!renderer || canvas.width <= 0 || canvas.height <= 0 || isCanvasDocHidden(canvas)) return false;
      // 支持 drawStaticSnapshot({ dark, strength, ... }) 单对象简写
      if (forceStatic && nowInput && typeof nowInput === 'object') {
        extraArg = strengthArg;
        strengthArg = isDarkOrOpts;
        isDarkOrOpts = nowInput;
        nowInput = 0;
      }
      const isObjOpts = typeof isDarkOrOpts === 'object' && isDarkOrOpts !== null;
      let still = forceStatic;
      let dark = true;
      let rawStrength = 1;
      let extra = null;
      if (isObjOpts) {
        still = forceStatic || Boolean(isDarkOrOpts.still || isDarkOrOpts.staticSnapshot);
        dark = isDarkOrOpts.dark !== false;
        rawStrength = isDarkOrOpts.strength ?? isDarkOrOpts.prismStrength ?? 1;
        const nested = (strengthArg && typeof strengthArg === 'object')
          ? strengthArg
          : (isDarkOrOpts.extra && typeof isDarkOrOpts.extra === 'object' ? isDarkOrOpts.extra : null);
        if (
          nested ||
          isDarkOrOpts.reach !== undefined ||
          isDarkOrOpts.prism !== undefined ||
          isDarkOrOpts.surge !== undefined ||
          isDarkOrOpts.speed !== undefined ||
          isDarkOrOpts.spectrum !== undefined ||
          isDarkOrOpts.accent !== undefined ||
          isDarkOrOpts.semantic !== undefined ||
          isDarkOrOpts.ambientIntensity !== undefined
        ) {
          extra = nested ? { ...isDarkOrOpts, ...nested } : isDarkOrOpts;
        }
      } else {
        dark = isDarkOrOpts !== false;
        rawStrength = strengthArg ?? 1;
        extra = extraArg && typeof extraArg === 'object' ? extraArg : null;
        still = forceStatic || Boolean(extra && (extra.still || extra.staticSnapshot));
      }
      const ambient = extra && extra.ambientIntensity !== undefined
        ? clampFinite(extra.ambientIntensity, baseAmbient, 0, 1)
        : baseAmbient;
      activeAmbient = ambient;
      const strength = clampFinite(rawStrength, 1, 0, 1) * ambient;
      if (ambient <= 0 || (forceStatic && strength <= 0)) {
        if (!clearedZero) clearCanvas();
        else sleeping = true;
        return false;
      }
      const reach = extra && extra.reach !== undefined ? clampFinite(extra.reach, baseAura.reach, 0.05, 1) : baseAura.reach;
      const prism = extra && extra.prism !== undefined ? clampFinite(extra.prism, baseAura.prism, 0, 1) : baseAura.prism;
      const surge = extra && extra.surge !== undefined ? clampFinite(extra.surge, baseAura.surge, -1, 1) : baseAura.surge;
      const speed = extra && extra.speed !== undefined ? clampFinite(extra.speed, baseAura.speed, 0, 3) : baseAura.speed;
      const rawSpec = extra && (extra.spectrum !== undefined || extra.accent !== undefined)
        ? (extra.spectrum ?? extra.accent)
        : baseSpectrum;
      const spectrumCode = rawSpec !== null && rawSpec !== undefined
        ? resolveHorizonSpectrumCode(rawSpec)
        : detectHostSpectrumCode(canvas, dark);
      const rawSem = extra && extra.semantic !== undefined ? extra.semantic : baseSemantic;
      const semanticCode = resolveHorizonSemanticCode(rawSem);
      activeAura.reach = reach;
      activeAura.prism = prism;
      activeAura.surge = surge;
      activeAura.speed = speed;
      activeSpectrum = rawSpec || (spectrumCode === 1 ? 'warm' : 'default');
      activeSemantic = String(rawSem || 'none');

      const rawNow = Number(nowInput || 0);
      const inSec = Boolean(extra && extra.timeUnit === 'sec') || (!isObjOpts && lastRawNow !== null && rawNow > 0 && rawNow < 1e4 && Math.abs(rawNow - lastRawNow) > 0 && Math.abs(rawNow - lastRawNow) < 0.5);
      lastRawNow = rawNow;
      const nowMs = inSec ? rawNow * 1000 : rawNow;
      if (startMs === null) startMs = nowMs;
      const ext = Boolean(extra) || hasCustom;
      const realSec = still ? 0 : Math.max(0, (nowMs - startMs) / 1000);
      const ramp = (still || forceStatic || ext) ? 1 : -(Math.cos(Math.PI * Math.min(1, Math.max(0, realSec / 1.4))) - 1) * 0.5;
      const basePresence = Math.max(0.22, ramp);
      const dirty = forceStatic
        || dark !== lastDark
        || spectrumCode !== lastSpectrum
        || semanticCode !== lastSemantic
        || Math.abs((semanticCode > 0 ? 1 : 0) - semMix) > 0.005
        || Math.abs(strength - lastStrength) >= 0.005
        || Math.abs(reach - lastReach) >= 0.002
        || Math.abs(prism - lastPrism) >= 0.002
        || Math.abs(surge - lastSurge) >= 0.001
        || Math.abs(speed - lastSpeed) >= 0.005;
      const isGpuGlow = Boolean(renderer && renderer.mode === 'webgl2');
      const frameGap = isGpuGlow ? 0 : (ext ? 14 : (basePresence < 1 ? 33 : 42));
      if (!stale && !dirty && (still || (frameGap > 0 && Math.abs(nowMs - lastDrawMs) < frameGap))) {
        if (forceStatic) sleeping = true;
        return false;
      }
      let dtSec = 0;
      if (forceStatic) {
        if (flowSec === 0) flowSec = 2.4;
        lastClockMs = nowMs;
        sleeping = true;
      } else if (still) {
        lastClockMs = nowMs;
        sleeping = true;
      } else {
        sleeping = false;
        if (lastClockMs === null || nowMs < lastClockMs) {
          if (lastClockMs === null) flowSec = Math.min(2.4, realSec * speed);
          lastClockMs = nowMs;
        } else {
          dtSec = Math.min(0.35, Math.max(0, (nowMs - lastClockMs) / 1000));
          lastClockMs = nowMs;
          flowSec += dtSec * speed;
        }
      }
      if (semanticCode > 0) holdSem = semanticCode;
      if (forceStatic || still) {
        semMix = semanticCode > 0 ? 1 : 0;
      } else {
        const tgt = semanticCode > 0 ? 1 : 0;
        const step = Math.min(1, Math.max(0.04, dtSec / 0.45));
        semMix += (tgt - semMix) * step;
        if (Math.abs(tgt - semMix) < 0.01) semMix = tgt;
      }
      const effSem = holdSem > 0 && semMix > 0.005 ? holdSem + (1 - semMix) * 0.98 : 0;
      const breath = forceStatic
        ? 0.64
        : (still ? 0.58 : 0.46 + 0.24 * Math.sin(flowSec * 1.15) + 0.06 * Math.sin(flowSec * 2.05 + 0.9));
      const isDefaultHome = !ext && strength >= 0.999;
      const intensity = isDefaultHome ? breath * (0.2 + 0.8 * strength) : breath * (0.55 + 0.45 * strength);
      const strengthGain = strength <= 0 ? 0 : (strength >= 0.999 ? 1 : Math.pow(strength, 0.78));
      const presence = basePresence * strengthGain;
      renderer.draw(canvas.width, canvas.height, dpr, 12 + flowSec, dark, intensity, presence, reach, prism, surge, speed, spectrumCode, effSem);
      clearedZero = false;
      lastDrawMs = nowMs;
      lastDark = dark;
      lastStrength = strength;
      lastReach = reach;
      lastPrism = prism;
      lastSurge = surge;
      lastSpeed = speed;
      lastSpectrum = spectrumCode;
      lastSemantic = semanticCode;
      stale = false;
      return true;
    }
    return {
      mode: renderer ? renderer.mode : 'none',
      isContextLost: () => Boolean(renderer && renderer.isContextLost && renderer.isContextLost()),
      resize(w, h, nextDpr) {
        syncSize(w, h, nextDpr);
      },
      invalidate() {
        stale = true;
      },
      clear: clearCanvas,
      setAuraParams,
      getAuraParams() {
        return { ...activeAura };
      },
      getExtendedState() {
        return {
          ...activeAura,
          spectrum: activeSpectrum,
          semantic: activeSemantic,
          ambientIntensity: activeAmbient,
          sleeping,
        };
      },
      isSleeping() {
        return sleeping;
      },
      draw(nowInput, isDarkOrOpts = {}, strengthArg, extraArg) {
        return renderInternal(nowInput, isDarkOrOpts, strengthArg, extraArg, false);
      },
      drawStaticSnapshot(nowInput, isDarkOrOpts = {}, strengthArg, extraArg) {
        stale = true;
        return renderInternal(nowInput, isDarkOrOpts, strengthArg, extraArg, true);
      },
      dispose(keep) {
        sleeping = true;
        if (canvas.removeEventListener) {
          canvas.removeEventListener('webglcontextlost', onContextLost);
          canvas.removeEventListener('webglcontextrestored', onContextRestored);
        }
        if (renderer) renderer.dispose(keep);
      },
    };
  }
  return {
    RIPPLE,
    SPECTRUM,
    SPECTRUM_LIGHT,
    HORIZON_SPECTRUM,
    HORIZON_PRISM_STOPS,
    HORIZON_DAYLIGHT_STOPS,
    HORIZON_SPECTRUM_MODES,
    HORIZON_SEMANTIC_MODES,
    HORIZON_FRAGMENT_SHADER,
    GLOW_FRAG_SHADER,
    DEFAULT_HORIZON_AURA,
    GLYPHS,
    hash,
    valueNoise,
    fractalNoise,
    glyphIndex,
    cloudClear,
    patchClear,
    spectrumRgb,
    horizonPrismRgb,
    resolveHorizonSpectrumCode,
    resolveHorizonSemanticCode,
    resolveHorizonDpr,
    computeNebulaLobes,
    createWaveField,
    parseCssColorToRgb,
    parseAmbientScale,
    createGlyphField,
    mountBrandHorizonGlow,
  };
});
;

/* ===== module: dual-mascot-rig.js ===== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.__agDualMascotRig = api;
    root.__agPrismMascotArt = api.mascotArt;
    if (typeof window !== 'undefined' && window && window !== root) {
      window.__agPrismMascotArt = api.mascotArt;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  /**
   * 双宠像素骨架与物理引擎（Aligned to Official Claude Clawd Pixel Grammar）
   * - 主宠栅格 PX = 3 (每格 3 CSS px), 离散动画节拍 TICK = 100ms
   * - 主体与腿爪耳尾零黑描边、零眼高光噪点、纯方块几何、暗部色 's'、1x2 竖瞳 'o'
   * - 动作道具采用同色系柔和中间调渲染
   */
  const PX = 3;
  const TICK = 100;
  const { max, min, round, abs, floor, random, sin, cos, PI } = Math;
  const clamp = (v, lo, hi) => max(lo, min(hi, v));
  const isFin = Number.isFinite;
  const isFn = (v) => typeof v === 'function';
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const nowMs = () => performance.now();

  const OFFICIAL_OPEN_REF = [
    '..############..',
    '..############..',
    '..##o######o##..',
    '..##o######o##..',
    '..############..',
    '################',
    '################',
    '..############..',
    '...#.#....#.#...',
    '...#.#....#.#...',
  ];

  const decodePal = (s, base) => {
    const o = base ? { ...base } : {};
    for (const p of s.split(';')) o[p[0]] = p[1] === 'r' ? p.slice(1) : '#' + p.slice(1);
    return o;
  };
  const SHARED_PROP_PALETTE = decodePal(
    'k9c958c;wfbf8f1;cecdfc6;ga8a194;B5b8fb9;bcfe3ee;rcc4f45;ye8b64a;hrgba(20, 20, 19, 0.20);d9a8e80;D6f8ca6;pef9aa6;n8b5e3c;l6a6158;e78716a;F9e3324;fc9642a;Ye0a23c;Vfff1dc;mrgba(120, 112, 104, 0.55);G7dff9b;trgba(125, 255, 155, 0.38);Nff6bd6;urgba(255, 107, 214, 0.38);Weffff3;Z232120;z756f69;A3d8bff;Ed6e8ff;C2753a8;irgba(80, 150, 255, 0.78);Irgba(80, 150, 255, 0.32);Lff3b30;Hffd6d2;xb3312a;jrgba(255, 80, 60, 0.78);Jrgba(255, 80, 60, 0.32);Pd87e64;Mded6cc;Rff3b4f;ac6d9f7;v788eac'
  );
  const PALETTES = {};
  for (const row of (
    'clawd:1:#d97757;sbf684c;o141413;Od97757;qe8a88e;Qf1cbbb|' +
    'cat:1:#947fd6;s735eb5;o141413;ka89fc4;B6a8fd6;O947fd6;qb6a7e6;Qd9cff6|' +
    'dragon:1:#d7dfef;s95a1c2;o1e1936;Oc6cce6;qbfbde6;Qe2e1f7;Uedf1fc;Ta3a5d6;X818ab2|' +
    'whale:1:#4e6fff;s3450cf;o141413;O4e6fff;q86a2ff;Qc7d6ff;Ue5f0ff;Ta8cbff;X38bdf8|' +
    'fox:1:#ee7b2f;sc45817;o141413;Oee7b2f;qf7a968;Qffd9b3;Ufff5e6;T3d2118;Xffba66|' +
    'panda:1:#f4f6fa;sd3dae6;offffff;Of4f6fa;qdfe5f0;Qffffff;Uffffff;T1f232e;X252936|' +
    'cowboy:0:#d97757;sbf684c;o141413;H8b5e3c;Ra6744e;hrgba(20, 20, 19, 0.18)|' +
    'shades:0:#e0896b;sc16f53;o141413;G141413;g6d778a;wffffff;hrgba(20, 20, 19, 0.18)|' +
    'wizard:0:#8a74cf;s6a56aa;o141413;M5c4b9e;ye8b64a;bcfe3ee;hrgba(20, 20, 19, 0.18)'
  ).split('|')) {
    const [name, sh, spec] = row.split(':');
    PALETTES[name] = decodePal(spec, sh === '1' ? SHARED_PROP_PALETTE : null);
  }

  // 棱镜边环境反光调色表（6色调：[darkCore,darkWash,lightCore,lightWash]）
  const RIM_PALS = Object.fromEntries(
    'default:164,208,255;155,114,203;37,99,235;124,58,237|warm:255,220,176;240,163,126;194,89,52;217,119,6|cobalt:148,228,255;66,133,244;29,78,216;2,132,199|iris:221,214,254;165,138,248;91,33,182;139,92,246|amber:253,230,138;242,184,75;180,83,9;245,158,11|mono:236,242,248;148,163,184;51,65,85;100,116,139'
      .split('|')
      .map((s) => {
        const [k, v] = s.split(':');
        return [k, v.split(';')];
      })
  );

  const F = (rows, ox = 0, oy = 0, extra = null) =>
    extra ? { rows, ox, oy, ...extra } : { rows, ox, oy };
  const rep = (s, n) => Array(n).fill(s);

  function mirrorFrame(fr, partW) {
    const w = max(...fr.rows.map((r) => r.length));
    const rows = fr.rows.map((r) => r.padEnd(w, '.').split('').reverse().join(''));
    return F(rows, partW - (fr.ox + w), fr.oy, fr.grounded ? { grounded: true } : null);
  }

  function recolorFrame(fr, map) {
    return {
      ...fr,
      rows: fr.rows.map((r) => r.replace(/./g, (ch) => map[ch] || ch)),
    };
  }

  // ── 紧凑 RLE 图集（去重派生 + 自动进入 cdp.js 共享 LZ 压缩池，纯函数解码还原同构对象）──
  const SPRITE_ATLAS_RAW =
    'c.shadow!w12=2,10,g:12h;w14=1,10,g:14h;w10=3,10,g:10h|c.body!stand=2,0:12#*8;tall=2,-1:12#*9;squash=1,2:.12s./14#*6;squash2=1,4:.12s./14#*4;flat=2,7:12s/12#*2;turnL=2,0:11#s*8;turnR=~turnL;leanR=2,0:.12#*4/12#.*4;leanL=~leanR;peek=2,2:12#*6|c.eyes!open=4,2:o6.o*2;openL=@open,3,2;openR=@open,5,2;half=4,3:o6.o;shut=3,3:oo6.oo;happy=3,2:.o6.o./o.o4.o.o;squint=4,2:o6.o/.o4.o./o6.o;wide=3,2:oo6.oo*2;peekOpen=@open,4,4;peekHalf=@half,4,5;flatEyes=4,8:oo4.oo;blink=3,3:ss6.ss;upL=@open,3,1;up=@open,4,1;upR=@open,5,1|c.mouth!small=6,5:.ss.;yawn=6,5:4s/.ss.|c.legs!stand=2,8:.#.#4.#.#.*2;crouch=2,9:.#.#4.#.#.;tuck=2,8:..#.#..#.#..*2;walkA=2,8:.#.s4.#.s./.#6.#3.;walkB=~walkA;dangle=2,8:.#.#4.#.#./.#.#8.*2;dangle2=~dangle;flailA=2,8:#3.#..#3.#/#10.#;flailB=2,8:..#.#..#.#../4.#..#4.;flailC=2,8:#..#4.#..#/3.#4.#..#|c.clawL!stub=0,5:##*2;front=0,5:ss*2;up=0,-2:##*2/#.;peekGrip=1,7:ss;flatLeft=@peekGrip,0,8;open=0,4:##/.#/##|c.clawR!stub=14,5:##*2;front=14,5:ss*2;up=14,-2:##*2/.#;low=14,8:3#*2;reach1=14,4:3.##/5#;write1=@front,13,6;write2=@front;peekGrip=13,7:ss;flatRight=@peekGrip,14,8;open=14,4:##/#./##;waveOut=14,-1:.##*2/#..|k.ears!stand=2,-1:#10.#/##8.##;nod=@stand,2,0;loaf=@stand,2,2;airplane=0,0:##12.##/3#10.3#;peek=@stand,2,1;flat=1,6:#12.#;twitchL=2,-1:11.#/##8.##;twitchR=~twitchL|k.body!stand=2,1:12#*7;loaf=1,4:.12s./14#*5;stretch=2,0:s11#/12#*2/.11#*2/..10#/12#*2;turnL=2,1:11#s*7;turnR=~turnL;leanR=2,1:.12#*4/12#.*3;leanL=~leanR|k.eyes!loafShut=3,6:oo6.oo;loafHalf=4,6:o6.o|k.paws!none=0,0:;groom1=12,4:ss*2;groom2=@groom1,12,3;cheer=0,2:#14.#*2;up=0,-1:##12.##*2;peekGrip=1,7:ss10.ss;write1=@groom1,13,5;write2=@groom1,14,6;upR=14,0:##*2|' +
    'k.tail!up=14,3:.s/.#*2/##;sway=14,3:.#*2/s#/#.;curl=14,4:##/.#/s#;loaf=14,6:.#*2/s#;puff=14,2:.#/##*2/s#/#.|' +
    'd.ears!stand=1,-1:.T12.T./..XT8.TX..;nod=@stand,1,0;loaf=@stand,1,0;airplane=1,-1:T14.T/.XT10.TX.;peek=@stand,1,1;flat=1,6:.T12.T.;twitchL=1,-1:.E12.T./..XT8.TX..;twitchR=~twitchL,1,-1|' +
    'd.body!stand=2,1:12#*4/3#6U3#/3#6q3#/3#6U3#;squash=1,2:.12s./14#*2/4#6U4#/4#6q4#/4#6U4#;loaf=@squash;stretch=2,0:s11#/12#*2/.11#*2/..3#6U#/3#6q3#/3#6U3#;flat=2,7:12s/12#/3#6U3#;turnL=2,1:11#s*4/##6U3#s/##6q3#s/##6U3#s;turnR=~turnL;leanR=2,1:.12#*4/3#6U3#./3#6q3#./3#6U3#.;leanL=~leanR;peek=2,2:12#*4/3#6U3#/3#6q3#|' +
    'd.legs!stand=2,8:.##6.##.*2;crouch=2,9:.##6.##.;tuck=2,8:..##4.##..*2;walkA=2,8:.##6.ss./.##9.;walkB=~walkA;dangle=2,8:.##6.##./.##9.*2;dangle2=~dangle;flailA=2,8:##8.##*2;flailB=2,8:..##4.##../3.##..##3.;flailC=2,8:##..##4.##/3.##4.##.|' +
    'd.paws!none=0,2:X14.X/Xq12.qX/.X12.X.;cheer=0,0:X14.X/Xq12.qX/.XX10.XX.;up=-1,1:XX14.XX/Xqq12.qqX/.XX12.XX.;upR=0,0:14.XX/13.qX/13.X.;groom1=0,2:X14.X/Xq11.ss/.X11.ss;groom2=@groom1,0,1;write1=0,3:X14./Xq11.ss/.X11.ss;write2=0,3:X14./Xq12.ss/.X12.ss;peekGrip=1,7:ss10.ss;tuck=1,4:X12.X*2|' +
    'd.tail!up=14,4:3.T/..XT/.##./##s.;sway=14,5:3.T/.##T/##s.;curl=14,6:.##T/##s.;loaf=@curl;puff=14,3:3.T/..#T/.##./##s.|' +
    'w.body!stand=2,1:.10#./12#*4/##8U##/#10U#/.#8U#./..8T..;squash=1,3:..10s../.12#./14#*2/##10U##/.#10U#./..10T..;loaf=2,4:.10s./12#*2/##8U##/#10U#/.10T.;stretch=2,0:.s9#./12#*4/##8U##/#10U#/.#8U#./..8T..;flat=2,7:.10s./12#/#10U#;turnL=2,1:.9#s./11#s*4/#8U##s/10U#s/.8U#s./..8T..;turnR=~turnL;leanR=2,1:..10#/.12#*4/.##8U##/#10U#./.#8U#../..8T..;leanL=1,1:.10#../12#.*4/##8U##./.#10U#/..#8U#./..8T..;peek=2,2:.10#./12#*4/##8T##|' +
    'w.paws!none=0,6:.s/ss;flap=0,5:ss/.s;cheer=0,4:ss12.ss/.s12.s.;up=@cheer,0,2;upR=14,4:ss/.s;groom1=0,5:.s11.ss/ss11.ss;groom2=@groom1,0,4;write1=@groom1,0,5;write2=0,6:.s12.ss/ss12.ss;peekGrip=1,7:ss10.ss;tuck=1,7:s|' +
    'w.tail!up=13,1:..#..#/..4#/3.##./..3#./.3#../##s3.;sway=13,2:3.#..#/..4#./..3#../.3#3./##s4.;curl=13,3:..#.#./..3#./.3#../##s3.;loaf=13,5:..#.#./.3#../##s3.;puff=13,0:..#..#/..4#/..3#./.3#../3#3./##s3.|' +
    'f.ears!stand=2,-2:T10.T/#T8.T#/##U6.U##;nod=@stand,2,-1;loaf=@stand,2,1;airplane=0,-1:TT12.TT/#TU10.UT#/##12.##;peek=@stand,2,0;flat=1,5:T12.T/#T10.T#;twitchL=2,-2:11.T/#T8.T#/##U6.U##;twitchR=~twitchL|' +
    'f.body!stand=2,1:12#*3/#X8#X#/#U8#U#/##8U##/3#6U3#;squash=1,2:.12s./14#*2/#X10#X#/##10U##/3#8U3#/4#6U4#;loaf=1,4:.12s./14#*2/##10U##/3#8U3#/.12#.;stretch=2,0:s11#/12#*2/.11#*2/..#8U#/##8U##/3#6U3#;flat=2,7:12s/##8U##/12#;turnL=2,1:11#s*3/X8#X#s/U8#U#s/#8U##s/##6U3#s;turnR=~turnL;leanR=2,1:.12#*3/.#X8#X#/.##8U##/3#6U3#./##6U3#..;leanL=~leanR;peek=2,2:12#*4/##8U##*2|' +
    'f.legs!stand=2,8:.T.T4.T.T.*2;crouch=2,9:.T.T4.T.T.;tuck=2,8:..T.T..T.T..*2;walkA=2,8:.T.s4.T.s./.T6.T3.;walkB=~walkA;dangle=2,8:.T.T4.T.T./.T.T8.*2;dangle2=~dangle;flailA=2,8:T3.T..T3.T/T10.T;flailB=2,8:..T.T..T.T../4.T..T4.;flailC=2,8:T..T4.T..T/3.T4.T..T|' +
    'f.tail!up=14,1:.UU/.UU#/.3#/3#./##s.;sway=14,2:..UU/.UU#/3#./##s.;curl=14,3:.UU#/3#./##s.;loaf=14,5:.UU#/3#./##s.;puff=14,0:.3U/UU##/4#/3#./##s.|' +
    'a.ears!stand=2,-1:.XX6.XX./3X6.3X;nod=@stand,2,0;loaf=@stand,2,2;airplane=1,-1:XX10.XX/3X8.3X;peek=@stand,2,1;flat=1,6:.XX8.XX.;twitchL=2,-1:9.XX./3X6.3X;twitchR=~twitchL|' +
    'a.body!stand=2,1:.10#./#3X4#3X#*3/12#/12X/#X8#X#;squash=1,2:..10s../#3X6#3X#*2/14#/14X/#X10#X#/##10###;loaf=1,4:.12s./#3X6#3X#*2/14X/##10###;stretch=2,0:s11#/#3X4#3X#*2/12#/12X/#X8#X#*2;flat=2,7:12s/#3X4#3X#/12X;turnL=2,1:.9#s./3X4#3X#s*3/11#s/11Xs/X8#X#s;turnR=~turnL;leanR=2,1:..10#/.#3X4#3X#*3/.12#/12X./#X8#X#.;leanL=~leanR;peek=2,2:.10#./#3X4#3X#*3/12#/12X|' +
    'a.legs!stand=2,8:.XX4.XX.*2;crouch=2,9:.XX4.XX.;tuck=2,8:..XX..XX..*2;walkA=2,8:.XX4.ss./.XX7.;walkB=~walkA;dangle=2,8:.XX4.XX./.XX7.*2;dangle2=~dangle;flailA=2,8:XX6.XX*2;flailB=2,8:..XX..XX../3.XX..XX3.;flailC=2,8:XX..XX4.XX/3.XX4.XX.|' +
    'a.paws!none=0,0:;groom1=12,4:XX*2;groom2=@groom1,12,3;cheer=0,2:X14.X*2;up=0,-1:XX12.XX*2;peekGrip=1,7:XX10.XX;write1=@groom1,13,5;write2=@groom1,14,6;upR=14,0:XX*2;tuck=1,4:X12.X*2|' +
    'a.tail!up=14,5:XX/XX;sway=14,6:XX/XX;curl=14,6:X./XX;loaf=14,6:X.;puff=14,4:.X/XX/XX|' +
    'p!foxWisp0=3,-6:..A../.AEA./..A..;foxWisp1=11,-7:..V../.VYV./..V..;foxWisp2=6,-8:..E../.EAE./..E..;bamboo0=13,1:..G./.lG./..G./.lG./..G./..l.;bamboo1=13,2:..G./.lG./..G./..l./..G.;dragonFlame0=14,4:.f./YVf/.f.;dragonFlame1=14,3:..fF./.YVfF/VYYfF/.fF..;dragonFlame2=14,3:3.fF./.fYVfF/VYYfF./..fF..;whaleSpout0=5,-3:.B..B./..AA../..BA../..AA..;whaleSpout1=4,-5:.B4.B./B.A..A.B/..AB.BA./3.AA3./3.BA3./3.AA3.;whaleSpout2=3,-5:..B4.B../.A6.A./B3.BB3.B/4.AA4./.B..BA..B./4.AA4.;quill1=15,3:..B/.B./k..;quill2=@quill1,16,4;sheet=12,8:6c/ckk3c/6g;mug=13,4:..4D/3DbwD/D.DbbD/3DbbD/..4D;cloth1=13,2:cw../w3c/.cwc/..c.;cloth2=14,3:..cw/3cw/.cwc/..c.;bowl=12,7:5w/DBwBD/.3D.;bowlEmpty=12,8:D3gD/.3D.;chop1=12,4:3.n/..n./.n../n3.;chop2=12,3:3.n/..n./.n../w3.;fishDish=11,7:.PPsPP./7D/.5D.;fishBone=11,7:.M.M.M./7D/.5D.;envS=12,5:6d/ddwwdd/dwddwd/d4wd/6d;envSOpen=12,4:..dd../.dwwd./6d/d4wd*2/6d;letter=14,1:7d/d5cd/d3gccd/d5cd/d4gcd/d5cd/dggccrd/7d;seed=15,8,g:On/nO;p1=16,7,g:O/l*2;p2=16,6,g:O/l*3;p3=14,5,g:..O../..l../O.l.O/.3l./..l..;p4=14,3,g:..O../O.l.O/.3l./O.l.O/.3l./..l..*2;d1=13,0,g:3.O3./O5.O/.O3.O./7./O5.O/7.*2/3.O3.;d2=13,-2,g:.q3.q./3.q3./q5.q/7./.q3.q./7./3.q3.;wilt1=14,3,g:..q../q.l.q/.3l./q.l.q/.3l./..l..*2;wilt2=14,4,g:q4./.q.q./..ll./.q.l./..ll./..l..;wilt3=15,6,g:Q.Q/.l./Ql./.l.;bfUp=13,-4:B3.B/BB.BB/.BkB./..k..;bfDn=13,-4:5.*2/BBkBB/.BkB.;bfLeftUp=@bfUp,1,-5;bfLeftDn=@bfDn,1,-5;bfRest=7,-3:..B../.BB../..k..;stickUp=14,-9:WW/GG*6;stickLT=9,-9:5.tt/WG3.tt/.GG..tt/..GG.tt/3.GGtt/4.GGt/5.GG;stickRT=~stickLT,14,-9;sirenDim=5,-4:..LL../.4x.*2/6l;sirenL=5,-4:..Lx../.HLxx./.LLxx./6l;sirenF=5,-4:..HH../.LHHL./.4L./6l;sirenR=~sirenL;beamL=-1,-7:J5./.j4./..j3./6./J3j../6./.Jjj..;beamF=4,-7:J..JJ..J/.j.jj.j.;micStand=1,4,g:6.ZZ6./6.Zz6./6.ZZ6./6.Z7.*2/5.4Z5.;micSink1=1,6,g:6.ZZ6./6.Zz6./6.ZZ6./5.4Z5.;micSink2=1,8,g:6.ZZ6./5.4Z5.;smoke=6,-4:.m./mm./.mm/.m.;iceCrystal=5,-6:..av../.aavv./3a3v/.aavv./..av..;iceCrystalHi=@iceCrystal,5,-7;laser0=16,7,g:.p./pRp/.p.;laser1=18,8,g:.R./RpR;laser2=15,8,g:pRp/.R.;blueprint=12,2:7B/B4EBB/BE3BEB/B4EBB/BE3BEB/7B;headband=1,1:.12L.L/..10H..L;goalFlame0=4,-7,g:3.Y3./..fYf../.FfYfF./FfYVYfF;goalFlame1=4,-7,g:..Y4./.fYf..Y/FfYVYf./.FfYfF.;goggles=3,0:gAAg..gAAg/gEAg..gEAg;iceCrystalSpin=6,-7:.av./aavv*2/.av.;flag0=14,-6:l4A./lAAyA./l4A./l5.*4;flag1=14,-6:l..3A/lAAyAA/l3A../l5.*4;shadesProp=3,2:4Z..4Z/ZEZZ..ZEZZ;surfboard=1,8,g:..10A../.A10EA.;waveSplash0=-3,6,g:..E./E.A./.AA.;waveSplash1=-3,6,g:E3./.EA./AA..;cloudBig=12,2:..3w../.w3Ew./5wbw/.5b.;cloudMid=13,3:.3w./wEEbw/.3b.;cubeGlow=13,3:.y.y./A3EA/AEyEA/5A;hourglass0=13,1:5n/.byb./..y../.b.b./5n;hourglass1=13,1:5n/.b.b./..y../.byb./5n;pocketWatch=12,4:..y../.ywy./ywnwy/.3y.;micHand=13,2:.ZZ./ZwZZ/.gg./..g.*2;spotlight=5,-9:..VV../.VyyV./V.yy.V;book0=12,4:5B/B3wB/BwgwB/B3wB/5B;book1=12,4:BB.BB/BwBwB/BwgwB/BwBwB/BB.BB;bulbOff=5,-8:..gg../.g..g.*2/..cc..;bulbOn=5,-9:y.yy.y/.yVVy./y4Vy/..yy../..cc..;hotCup0=12,3:.m..m./m..m../5D./D3nDD/D3nD./.3D..;hotCup1=12,3:m..m../.m..m./5D./D3nDD/D3nD./.3D..;donut0=12,4:.3p./pywpp/pp.pn/5n/.3n.;donut1=12,4:.pp../pyw../pp.pn/5n/.3n.;habCactus=0,0,g:3.P3./..lGl../l.lGl../lGlGl.l/..lGlGl/.5n./..3n..;habLamp=0,0,g:..3l../.l3Vl./.l3Yl./..3l../3.z3.*4/..3z..;habHourglass=0,0,g:.5n./..byb../3.y3./..byb../.5n.|s!heart=5,-7:.r.r./5r/.3r./..r..;spark=5,-8:..y..*2/5y/..y..*2;z1=10,-6:4k/..k./.k../4k;z2=12,-9:3k/.k./3k;vein=5,-7:.r.r./rr.rr/5./rr.rr/.r.r.;bang=6,-8:.r.*3/3./.r.;q=5,-9:.3k./k3.k/3.k./..k../5./..k..;note=5,-8:..kk./..k.k/..k../3k../kk3.;sweat=13,-4:.B./BbB*2/.B.;tilde=5,-7:.k3./k.k.k/3.k.;dozeZ0=@z2,12,-3;dozeZ1=@z1,13,-7;dozeZ2=14,-12:5k/3.k./..k../.k3./5k;fireSpark0=5,-8:..Y../f3.V/..f..;fireSpark1=5,-9:.V..f/..Y../f4.;fireSpark2=5,-8:f..Y./4.V/.f3.;sleepBubble0=12,4:.b./bEb/.b.;sleepBubble1=12,3:.bb./bEwb/bEEb/.bb.|m!cowboy=0,-2:5.6H5./3.10H3./..12R../..12#../..##o6#o##../16#/..12#../3.#.#4.#.#3.;shades=0,0:..12#../..4Gg##g4G../..12G../16#/..12#../3.#.#4.#.#3.;wizard=0,-3:7.MM7./6.MyMM6./5.6M5./..12M../..12#../..##o6#o##../16#/..12#../3.#.#4.#.#3.|ma.cowboy!trick=0,-2:4.6H6./..10H4./.12R3./..12#../..##o6#o##../16#/..12#../..#..#4.#..#..|ma.shades!trick=0,0:..12#../..GwGGw##GwGGw../..12G../16#/..12#../3.#.#4.#.#3.|ma.wizard!trick=0,-3:5.y10./4.yMyMM7./5.6M5./..12M../..12#../..##o6#o##../16#/..12#y./3.#.#4.#.#.y.';

  function decodeSpriteAtlas(raw) {
    const out = { c: {}, k: {}, d: {}, w: {}, f: {}, a: {}, p: {}, s: {}, m: {}, ma: {} };
    for (const sec of raw.split('|')) {
      const bi = sec.indexOf('!');
      const pk = sec.slice(0, bi).split('.');
      const grp = {};
      for (const item of sec.slice(bi + 1).split(';')) {
        const eq = item.indexOf('=');
        const name = item.slice(0, eq);
        const rhs = item.slice(eq + 1);
        const c0 = rhs[0];
        if (c0 === '@' || c0 === '~') {
          const [ref, ox, oy] = rhs.slice(1).split(',');
          const src = c0 === '~' ? mirrorFrame(grp[ref], 16) : grp[ref];
          grp[name] = ox !== undefined ? { ...src, ox: +ox, oy: +oy } : c0 === '~' ? src : { ...src };
          continue;
        }
        const co = rhs.indexOf(':');
        const [ox, oy, fl] = rhs.slice(0, co).split(',');
        const body = rhs.slice(co + 1);
        const rows = [];
        if (body) {
          for (const seg of body.split('/')) {
            const st = seg.indexOf('*');
            const rRaw = st >= 0 ? seg.slice(0, st) : seg;
            const n = st >= 0 ? +seg.slice(st + 1) : 1;
            const row = rRaw.replace(/(\d+)(.)/g, (_, cnt, ch) => ch.repeat(+cnt));
            for (let i = 0; i < n; i++) rows.push(row);
          }
        }
        grp[name] = fl === 'g' ? { ox: +ox, oy: +oy, grounded: true, rows } : { ox: +ox, oy: +oy, rows };
      }
      if (pk.length === 1) out[pk[0]] = grp;
      else out[pk[0]][pk[1]] = grp;
    }
    return out;
  }

  const _A = decodeSpriteAtlas(SPRITE_ATLAS_RAW);
  const CLAWD_PARTS = _A.c;
  const CAT_PARTS = { shadow: CLAWD_PARTS.shadow, ..._A.k, mouth: CLAWD_PARTS.mouth, legs: CLAWD_PARTS.legs };
  CAT_PARTS.body.squash = CLAWD_PARTS.body.squash;
  CAT_PARTS.body.flat = CLAWD_PARTS.body.flat;
  CAT_PARTS.body.peek = CLAWD_PARTS.body.peek;
  for (const [ek, ef] of Object.entries(CLAWD_PARTS.eyes)) {
    if (ek === 'peekHalf') continue;
    CAT_PARTS.eyes[ek] = ek === 'peekOpen' || ek === 'flatEyes' ? ef : { ...ef, oy: ef.oy + 1 };
  }
  const DRAGON_PARTS = {
    shadow: CLAWD_PARTS.shadow,
    ..._A.d,
    eyes: CAT_PARTS.eyes,
    mouth: CLAWD_PARTS.mouth,
  };
  const WHALE_PARTS = {
    shadow: CLAWD_PARTS.shadow,
    ..._A.w,
    ears: {},
    legs: {},
    eyes: {
      ...CAT_PARTS.eyes,
      loafShut: { ...CAT_PARTS.eyes.loafShut, oy: 5 },
      loafHalf: { ...CAT_PARTS.eyes.loafHalf, oy: 5 },
    },
    mouth: CLAWD_PARTS.mouth,
  };
  const FOX_PARTS = {
    shadow: CLAWD_PARTS.shadow,
    ..._A.f,
    paws: _A.k.paws,
    eyes: CAT_PARTS.eyes,
    mouth: CLAWD_PARTS.mouth,
  };
  const PANDA_PARTS = {
    shadow: CLAWD_PARTS.shadow,
    ..._A.a,
    eyes: CAT_PARTS.eyes,
    mouth: CLAWD_PARTS.mouth,
  };
  const PROPS = _A.p;
  const SYMS = _A.s;
  const MINI_SPRITES = _A.m;
  const MINI_ANIM_FRAMES = _A.ma;
  for (const id of ['cowboy', 'shades', 'wizard']) {
    const b = MINI_SPRITES[id];
    MINI_ANIM_FRAMES[id].walkB = { ox: b.ox, oy: b.oy, rows: [...b.rows.slice(0, -1), '..s#.#....#.#s..'] };
  }

  ['stickUp', 'stickLT', 'stickRT'].forEach((k) => {
    PROPS[k + 'M'] = recolorFrame(mirrorFrame(PROPS[k], 16), { G: 'N', t: 'u' });
  });
  PROPS.beamR = mirrorFrame(PROPS.beamL, 16);
  ['sirenDim', 'sirenL', 'sirenF', 'sirenR', 'beamL', 'beamR', 'beamF'].forEach((k) => {
    PROPS[k + 'B'] = recolorFrame(PROPS[k], { L: 'A', H: 'E', x: 'C', j: 'i', J: 'I' });
  });

  // 背后火海算法生成（保留轮廓白光 'V'）
  (() => {
    const sil = new Set();
    for (let y = 0; y <= 7; y++) for (let x = 2; x <= 13; x++) sil.add(`${x},${y}`);
    for (let y = 5; y <= 6; y++) [0, 1, 14, 15].forEach((x) => sil.add(`${x},${y}`));
    for (let y = 8; y <= 9; y++) [3, 5, 10, 12].forEach((x) => sil.add(`${x},${y}`));
    const glow = (x, y) =>
      y <= 9 && !sil.has(`${x},${y}`) && [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => sil.has(`${x + dx},${y + dy}`)));
    const X0 = -3;
    const W = 22;
    const TONGUES = [
      [[-1, 15, 3, 3, 1], [3, 2, 3, 3, 0], [7, 10, 2, 3, -1.5], [11, 4, 3, 3, 0], [16, 14, 3, 3, -0.5]],
      [[-1, 14, 3, 3, 1.5], [3, 3, 3, 3, 0], [7, 11, 3, 2, -2], [11, 3, 3, 3, 0], [16, 15, 3, 3, -1]],
    ];
    const base = (x) => (x >= 2 && x <= 13 ? 0 : x >= 0 && x <= 15 ? 5 : 8);
    const mk = (k, f) => {
      const tips = TONGUES[f % 2].map(([cx, h, sl, sr, lean], i) => {
        const by = base(cx);
        return { cx, by, ty: by - round(h * k), sl, sr, h, sw: lean + 2.4 * sin((f * PI) / 2 + i * 1.3) };
      });
      const heat = (x, y) =>
        max(-1, ...tips.map(({ cx, by, ty, sl, sr, sw }) => {
          const rel = max(0, min(1, (by - y) / max(1, by - ty)));
          const c = cx + sw * rel * rel;
          return y - ty - (x < c ? sl : sr) * abs(x - c);
        }));
      const embers = new Set();
      tips.forEach(({ cx, ty, h, sw }, i) => {
        if (i % 3 === f % 3 && h * k >= 4) embers.add(`${round(cx + sw + (i % 2 ? 1 : -1))},${ty - 2}`);
      });
      let y0 = 0;
      for (let y = -16; y <= 9; y++) for (let i = 0; i < W; i++) if (heat(X0 + i, y) >= 0 || embers.has(`${X0 + i},${y}`)) y0 = min(y0, y);
      const cells = [];
      for (let y = y0 - 1; y <= 9; y++) {
        cells.push(Array.from({ length: W }, (_, i) => {
          const x = X0 + i;
          if (sil.has(`${x},${y}`)) return '.';
          if (glow(x, y)) return 'V';
          if (embers.has(`${x},${y}`)) return 'f';
          const e = heat(x, y);
          return e < 0 ? '.' : e < 1 ? 'F' : e < 4 ? 'f' : 'Y';
        }).join(''));
      }
      return F(cells, X0, y0 - 1, { grounded: true });
    };
    [[1, 0.35], [2, 0.7], [3, 1.05]].forEach(([lv, k]) => {
      for (let f = 0; f < 4; f++) PROPS['fire' + lv + f] = mk(k, f);
    });
  })();

  // ── 刚体层与符号层登记（符号层水平镜像时仅翻转锚点，字符正向绘制）────────
  const RIGID_LAYERS = new WeakSet();
  const SYM_LAYERS = new WeakSet();
  Object.values(PROPS).forEach((l) => RIGID_LAYERS.add(l));
  Object.values(SYMS).forEach((l) => {
    RIGID_LAYERS.add(l);
    SYM_LAYERS.add(l);
  });

  // 整格平移帧（带缓存，传递刚体与符号标记）
  const SHIFT_CACHE = new WeakMap();
  function shiftFrame(fr, dx, dy) {
    if (!fr || (!dx && !dy)) return fr;
    let bucket = SHIFT_CACHE.get(fr);
    if (!bucket) {
      bucket = new Map();
      SHIFT_CACHE.set(fr, bucket);
    }
    const key = dx + ',' + dy;
    let out = bucket.get(key);
    if (!out) {
      out = { ...fr, ox: fr.ox + dx, oy: fr.oy + dy };
      bucket.set(key, out);
      if (RIGID_LAYERS.has(fr)) RIGID_LAYERS.add(out);
      if (SYM_LAYERS.has(fr)) SYM_LAYERS.add(out);
    }
    return out;
  }

  function resolveClawdStandGrid() {
    const grid = Array.from({ length: 10 }, () => Array(16).fill('.'));
    const paint = (part) => {
      part.rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          const ch = row[rx];
          if (ch !== '.' && ch !== ' ') {
            const x = part.ox + rx;
            const y = part.oy + ry;
            if (y >= 0 && y < 10 && x >= 0 && x < 16) grid[y][x] = ch;
          }
        }
      });
    };
    paint(CLAWD_PARTS.legs.stand);
    paint(CLAWD_PARTS.body.stand);
    paint(CLAWD_PARTS.eyes.open);
    paint(CLAWD_PARTS.clawL.stub);
    paint(CLAWD_PARTS.clawR.stub);
    return grid.map((r) => r.join(''));
  }

  function drawLayerSet(ctx, oxGrid, oyGrid, pxSize, palette, layers, colorResolver = null) {
    let lf = '';
    for (const part of layers) {
      if (!part || !part.rows || !part.rows.length) continue;
      for (let ry = 0; ry < part.rows.length; ry++) {
        const row = part.rows[ry], py = (oyGrid + part.oy + ry) * pxSize, gy = part.oy + ry;
        for (let rx = 0; rx < row.length; rx++) {
          const ch = row[rx];
          if (ch === '.' || ch === ' ') continue;
          const gx = part.ox + rx;
          const color = colorResolver ? colorResolver(ch, gx, gy, palette) : palette[ch];
          if (!color) continue;
          let r = 1;
          while (rx + r < row.length) {
            const nc = row[rx + r];
            if (nc === '.' || nc === ' ') break;
            if ((colorResolver ? colorResolver(nc, gx + r, gy, palette) : palette[nc]) !== color) break;
            r++;
          }
          if (color !== lf) ctx.fillStyle = lf = color;
          ctx.fillRect((oxGrid + gx) * pxSize, py, pxSize * r, pxSize);
          rx += r - 1;
        }
      }
    }
  }

  // ── 整数格挤压（替代 ctx.scale 浮点缩放）─────────────────────────────────
  // 思路：把弹性身体部件合成为一张字符点阵，再按「中心接缝最近邻」在整格层面
  // 增删行/列（优先选纯色体块行列、靠近中心、保护眼睛 o 与暗面 s 特征和着地腿），
  // 水平中心与底边锚定。这样每个方块永远是精确 PX×PX，边缘锐利不糊。
  function compositeGrid(layers) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const part of layers) {
      if (!part || !part.rows) continue;
      part.rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          const ch = row[rx];
          if (ch === '.' || ch === ' ') continue;
          const x = part.ox + rx;
          const y = part.oy + ry;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      });
    }
    if (minX === Infinity) return null;
    const W = maxX - minX + 1;
    const H = maxY - minY + 1;
    const g = Array.from({ length: H }, () => Array(W).fill('.'));
    for (const part of layers) {
      if (!part || !part.rows) continue;
      part.rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          const ch = row[rx];
          if (ch === '.' || ch === ' ') continue;
          g[part.oy + ry - minY][part.ox + rx - minX] = ch;
        }
      });
    }
    return { g, minX, minY, W, H };
  }

  // 选择要删除/复制的接缝线（行或列）；lines 为字符串数组
  function pickSeams(lines, count, remove, protectTail) {
    const n = lines.length;
    if (!count || n < 3) return new Set();
    const center = (n - 1) / 2;
    const cand = [];
    for (let i = 0; i < n; i++) {
      const line = lines[i];
      const blank = !/[^.]/.test(line);
      const pure = !blank && /^[#.]+$/.test(line);
      const same = (i > 0 && lines[i - 1] === line) || (i < n - 1 && lines[i + 1] === line);
      let score = abs(i - center) + (pure ? 0 : same ? 2 : 20);
      if (blank) score += 40;
      if (protectTail && i >= n - protectTail) score += 30;
      if (i === 0 || i === n - 1) score += 8;
      cand.push({ i, score, pure });
    }
    cand.sort((a, b) => a.score - b.score || a.i - b.i);
    const chosen = new Set();
    const limit = min(count, n - 2);
    // 第一轮：删除非纯色线时必须保留一条未被删除的同形邻线，防止特征整体消失
    for (const c of cand) {
      if (chosen.size >= limit) break;
      if (remove && !c.pure) {
        const ok = (j) => j >= 0 && j < n && !chosen.has(j) && lines[j] === lines[c.i];
        if (!ok(c.i - 1) && !ok(c.i + 1)) continue;
      }
      chosen.add(c.i);
    }
    for (const c of cand) {
      if (chosen.size >= limit) break;
      chosen.add(c.i);
    }
    return chosen;
  }

  function buildSeamMap(n, removeSet, dupSet) {
    const map = [];
    for (let i = 0; i < n; i++) {
      if (removeSet.has(i)) continue;
      map.push(i);
      if (dupSet.has(i)) map.push(i);
    }
    return map;
  }

  /**
   * 对弹性部件做整数格挤压，返回 { layer, shiftX(x), shiftY(y) }。
   * sqW / sqH 为整数格增量（正=拉宽/拉高，负=压窄/压扁）。
   */
  function squashLayersToGrid(layers, sqW, sqH) {
    const comp = compositeGrid(layers);
    if (!comp) return null;
    const { g, minX, minY, W, H } = comp;
    const rowsStr = g.map((r) => r.join(''));
    const colsStr = Array.from({ length: W }, (_, x) => g.map((r) => r[x]).join(''));
    const dw = max(-(W - 2), round(sqW || 0));
    const dh = max(-(H - 2), round(sqH || 0));
    const colPick = pickSeams(colsStr, abs(dw), dw < 0, 0);
    const rowPick = pickSeams(rowsStr, abs(dh), dh < 0, 2);
    const colMap = buildSeamMap(W, dw < 0 ? colPick : new Set(), dw > 0 ? colPick : new Set());
    const rowMap = buildSeamMap(H, dh < 0 ? rowPick : new Set(), dh > 0 ? rowPick : new Set());
    const newW = colMap.length;
    const newH = rowMap.length;
    const left = minX + round((W - newW) / 2); // 水平中心锚定
    const top = minY + (H - newH); // 底边锚定
    const rows = rowMap.map((ry) => colMap.map((cx) => g[ry][cx]).join(''));
    // 源行/列 → 目标位置（被删除的线映射到其下方/右方最近保留线）
    const targetOf = (map, src, n) => {
      for (let s = src; s < n; s++) {
        const t = map.indexOf(s);
        if (t >= 0) return t;
      }
      return map.length;
    };
    const shiftY = (y) => {
      if (y > minY + H - 1) return 0;
      const src = max(0, y - minY);
      return top + targetOf(rowMap, src, H) - (minY + src);
    };
    const shiftX = (x) => {
      const src = clamp(x - minX, 0, W - 1);
      return left + targetOf(colMap, src, W) - (minX + src);
    };
    return { layer: { rows, ox: left, oy: top }, shiftX, shiftY };
  }

  const DOZE_TICK = 400;
  const LAYER_SIG_MAP = new WeakMap();

  function computeLayersFrameIdx(layers) {
    let key = '';
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      if (!l) continue;
      let sig = LAYER_SIG_MAP.get(l);
      if (sig === undefined) {
        sig = Array.isArray(l.rows)
          ? `${l.ox || 0},${l.oy || 0},${l.grounded ? 1 : 0}:${l.rows.join('/')}`
          : String(i);
        LAYER_SIG_MAP.set(l, sig);
      }
      key += (key ? '|' : '') + sig;
    }
    return key;
  }

  function renderPixelLayers(canvas, dpr, oxGrid, oyGrid, pxSize, palette, layers, options = {}) {
    const ctx = options.ctx || canvas._ctx || (canvas._ctx = canvas.getContext('2d'));
    if (!ctx) return;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.imageSmoothingEnabled = false;

    const mirror = !!options.mirror;
    // 垂直位移吸附到整格，保证方块网格不出现亚格错位
    const tyPx = round(Number(options.tyPx || 0) / pxSize) * pxSize;
    const rotDeg = Number(options.rotDeg || 0);
    const clipBottomY = options.clipBottomY;
    // 兼容旧入参 sxScale/syScale：换算为 16×10 画框上的整数格增量
    const sqW =
      options.sqW !== undefined ? round(options.sqW) : round(16 * (Number(options.sxScale || 1) - 1));
    const sqH =
      options.sqH !== undefined ? round(options.sqH) : round(10 * (Number(options.syScale || 1) - 1));

    const anchorX = (oxGrid + 8) * pxSize;
    const anchorY = (oyGrid + 10) * pxSize;

    const groundedLayers = [];
    const bodyLayers = [];
    const rigidLayers = [];
    for (const layer of layers) {
      if (!layer) continue;
      if (layer.grounded) groundedLayers.push(layer);
      else if (RIGID_LAYERS.has(layer)) rigidLayers.push(layer);
      else bodyLayers.push(layer);
    }

    // 弹性层最终列表：挤压时身体合成为一张整格点阵，道具/符号整格平移随行
    let elasticLayers;
    if ((sqW || sqH) && bodyLayers.length) {
      const sq = squashLayersToGrid(bodyLayers, sqW, sqH);
      if (sq) {
        elasticLayers = [sq.layer];
        for (const r of rigidLayers) {
          const w = max(1, ...r.rows.map((row) => row.length));
          // 左右边缘平移量取均值：加宽时居中符号保持居中，偏侧道具随该侧移动
          const dx = round((sq.shiftX(r.ox) + sq.shiftX(r.ox + w - 1)) / 2);
          const dy = sq.shiftY(r.oy + r.rows.length - 1);
          elasticLayers.push(shiftFrame(r, dx, dy));
        }
      }
    }
    if (!elasticLayers) elasticLayers = [...bodyLayers, ...rigidLayers];
    // 保持原有绘制顺序：身体部件 → 道具 → 符号（rigid 本就位于末尾）

    ctx.save();
    if (typeof clipBottomY === 'number' && isFn(ctx.clip)) {
      ctx.beginPath();
      if (isFn(ctx.rect)) {
        ctx.rect(0, 0, cssW, clipBottomY);
      } else {
        ctx.moveTo(0, 0);
        ctx.lineTo(cssW, 0);
        ctx.lineTo(cssW, clipBottomY);
        ctx.lineTo(0, clipBottomY);
        ctx.closePath();
      }
      ctx.clip();
    }

    // 地面/背景独立层（影子、火海衬底、生长节点、地面激光、立麦架）不随挤压或歪头旋转
    if (groundedLayers.length) {
      ctx.save();
      if (mirror) {
        ctx.translate(anchorX, 0);
        ctx.scale(-1, 1);
        ctx.translate(-anchorX, 0);
      }
      drawLayerSet(ctx, oxGrid, oyGrid, pxSize, palette, groundedLayers);
      ctx.restore();
    }

    const paintElastic = (c2) => {
      c2.save();
      c2.translate(0, tyPx);
      if (mirror) {
        const flipSet = [];
        const symSet = [];
        for (const l of elasticLayers) {
          if (SYM_LAYERS.has(l)) symSet.push(l);
          else flipSet.push(l);
        }
        c2.save();
        c2.translate(anchorX, 0);
        c2.scale(-1, 1);
        c2.translate(-anchorX, 0);
        drawLayerSet(c2, oxGrid, oyGrid, pxSize, palette, flipSet, options.colorResolver || null);
        if (isFn(options.overlayPainter)) {
          options.overlayPainter(c2, oxGrid, oyGrid, pxSize);
        }
        c2.restore();
        if (symSet.length) {
          const placed = symSet.map((s) => {
            const w = max(1, ...s.rows.map((r) => r.length));
            return { ...s, ox: 16 - (s.ox + w) };
          });
          drawLayerSet(c2, oxGrid, oyGrid, pxSize, palette, placed, options.colorResolver || null);
        }
      } else {
        drawLayerSet(c2, oxGrid, oyGrid, pxSize, palette, elasticLayers, options.colorResolver || null);
        if (isFn(options.overlayPainter)) {
          options.overlayPainter(c2, oxGrid, oyGrid, pxSize);
        }
      }
      if (isFn(options.rimPainter)) options.rimPainter(c2, cssW, oxGrid, oyGrid, pxSize);
      c2.restore();
    };

    if (!rotDeg) {
      paintElastic(ctx);
    } else {
      // 拖拽摆角：先在离屏画布上按整格绘制，再整体旋转贴图（关闭平滑，避免逐块缝隙与模糊）
      let off = canvas.__agRotOff;
      const docRef = canvas.ownerDocument;
      if (!off && docRef && isFn(docRef.createElement)) {
        off = docRef.createElement('canvas');
        canvas.__agRotOff = off;
      }
      const offCtx = off ? off._ctx || (off._ctx = off.getContext('2d')) : null;
      if (!offCtx) {
        ctx.translate(anchorX, anchorY);
        ctx.rotate((rotDeg * PI) / 180);
        ctx.translate(-anchorX, -anchorY);
        paintElastic(ctx);
      } else {
        if (off.width !== canvas.width || off.height !== canvas.height) {
          off.width = canvas.width;
          off.height = canvas.height;
        }
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        offCtx.clearRect(0, 0, cssW, cssH);
        offCtx.imageSmoothingEnabled = false;
        paintElastic(offCtx);
        ctx.imageSmoothingEnabled = false;
        ctx.translate(anchorX, anchorY);
        ctx.rotate((rotDeg * PI) / 180);
        ctx.translate(-anchorX, -anchorY);
        ctx.drawImage(off, 0, 0, cssW, cssH);
      }
    }
    ctx.restore();
  }

  // 可被随机眨眼覆盖眼部的姿态；小紫猫慢摆尾的姿态
  const BLINKABLE_POSES = new Set(['idle', 'walk', 'lookNod', 'readAlong', 'gaze']);
  const SLOW_TAIL_POSES = new Set(['idle', 'lookNod', 'readAlong', 'gaze']);
  // 冰晶让位：头顶已有道具的姿态不挂冰晶；居中符号出现时冰晶暂隐，仅侧边汗滴与打盹 z 可共存
  const CRYSTAL_HIDE_POSES = new Set([
    'siren', 'onFire', 'cheerSticks', 'peek', 'flat', 'rickroll', 'carry', 'whaleSpout', 'foxWisp', 'pandaBamboo',
    'slashGoal', 'slashBoost', 'slashSchedule', 'slashGrill', 'slashLearnBulb',
  ]);
  const CRYSTAL_OK_SYMS = new Set([SYMS.sweat, SYMS.z1, SYMS.z2, SYMS.dozeZ0, SYMS.dozeZ1, SYMS.dozeZ2, SYMS.sleepBubble0, SYMS.sleepBubble1]);
  // 哈欠接伸懒腰：前 10 拍打哈欠，之后伸懒腰
  const YAWN_STRETCH_SPLIT = 10;

  // ── 紧凑数据驱动姿态配方引擎（24 个常规姿态走极简字符串表进入 LZ 池，复杂时间轴保留短函数）──
  const PLANT_STAGES_C = [[5, 'seed'], [9, 'p1'], [13, 'p2'], [17, 'p3'], [23, 'p4'], [27, 'wilt1'], [31, 'wilt2']];
  const PLANT_STAGES_K = [[5, 'seed'], [9, 'p1'], [13, 'p2'], [17, 'p3'], [23, 'p4']];
  const pickStage = (t, v, fb) => { for (const [lim, k] of t) if (v < lim) return k; return fb; };

  // DSL 字段码: 0=backProp sh=shadow b=body e=eyes l=legs L=clawL R=clawR a=ears w=paws t=tail m=mouth 1=prop1 2=prop2 y=extraSym(无sym时) Y=extraSym(强制) z=sink
  // 值后缀: ~f (frameMod?A:B), ~c (clipMod?A:B), ~4 (phase4), ~3 (tickIdx%3), ~l (lt%len), ~a-b (a<=lt<b?A:B); ~ 表示 null, 空串跳过; 前缀 C:/K:/S:/W:/N: 对应蟹/猫龙鲸/猫/鲸/非鲸
  const POSE_DSL_RAW =
    'flat:sh=w14,b=flat,e=flatEyes,l=~,C:L=flatLeft,C:R=flatRight,K:a=flat,K:w=~,K:t=curl|' +
    'dangle:sh=~,e=wide,l=dangle/flailA/dangle2/flailB~4,C:b=turnL/turnR~f,C:L=up,C:R=up,K:a=airplane,K:t=puff|' +
    'write:l=crouch,z=1,1=sheet,2=quill1/quill2~f,C:b=stand/turnR~f,C:R=write1/write2~f,K:a=stand/nod~f,K:w=write1/write2~f,K:t=sway/curl~f|' +
    'happy:e=happy,C:b=squash/stand~f,C:l=crouch/stand~f,C:L=up,C:R=up,K:a=nod/stand~f,K:w=cheer,K:t=up/puff~f|' +
    'pet:e=happy,C:b=squash/stand~f,C:l=crouch/stand~f,C:L=up,C:R=up,K:a=nod/stand~f,K:w=cheer,K:t=up/puff~f|' +
    'jiggle:l=flailA/flailB/flailC~3,e=happy,C:L=up,C:R=up,K:a=stand,K:t=puff|' +
    'peek:z=1,N:l=crouch,e=open/open/open/half~4,C:L=front,C:R=front,K:t=curl,W:e=peekOpen/peekOpen/peekOpen/loafHalf~4,W:w=tuck,W:t=loaf|' +
    'angry:b=squash/stand~f,l=walkA/walkB~f,C:e=squint,K:a=airplane,K:e=wide,K:t=puff|' +
    'groom:K:a=nod,K:e=shut,K:w=groom1/groom2~f|' +
    'tilt:b=turnL,e=half,K:a=nod,K:t=curl|' +
    'wow:e=wide,C:b=tall,C:L=up,C:R=up,K:a=stand,K:w=up,K:t=puff|' +
    'sulk:b=turnL,e=squint/shut~c,l=tuck,y=vein,C:L=front,C:R=front,K:a=airplane,K:t=curl|' +
    'polish:b=turnR,e=open/open/happy/open~4,1=mug,2=cloth1/cloth2~c,C:R=front,K:a=stand|' +
    'chaseDot:S:a=airplane,S:b=squash/stretch~c,S:e=wide,S:l=walkA/stand~c,S:t=puff,S:1=laser0/laser1/laser2~l,S:y=spark|' +
    'stretch:e=shut,y=tilde,C:b=tall,C:l=stand,C:L=up,C:R=up,K:a=stand,K:b=stretch,K:t=puff|' +
    'spinHop:b=turnR/stand/turnL/squash~4,e=open/open/open/happy~4,l=tuck/tuck/tuck/crouch~4,K:t=puff|' +
    'cheerSticks:b=squash/stand~f,l=crouch/stand~f,e=happy,1=stickLT/stickUp/stickRT/stickUp~4,2=stickRTM/stickUpM/stickLTM/stickUpM~4,y=note,C:L=up,C:R=up,K:a=stand/nod~c,K:w=up,K:t=puff|' +
    'chatGreet:b=stand/squash~c,e=happy,y=heart/note~c,C:L=up/stub~c,K:a=nod,K:t=up/puff~c|' +
    'balance:e=wide,C:L=open,C:R=open,K:a=airplane,K:w=cheer,K:t=puff|' +
    'worry:e=half/squint~c,l=tuck,y=sweat,C:L=front,C:R=front,K:a=airplane,K:t=curl|' +
    'salute:e=happy,y=spark,C:R=up,K:a=stand,K:w=upR,K:t=up|' +
    'carry:C:e=up,C:L=open,C:R=open|' +
    'eat:C:b=stand/squash~23-,K:b=stand/squash~21-,C:l=stand/crouch~23-,K:l=stand/crouch~21-,C:e=half/open~c,C:e=happy/~23-,K:e=happy/half~21-,C:1=bowlEmpty/bowl~21-,K:1=bowlEmpty/bowl~19-,2=chop2/chop1~c,C:2=~/~21-,K:2=~/~19-,C:Y=heart/~23-,K:Y=heart/~21-,K:a=nod|' +
    'eatFish:b=stand/squash~21-,l=stand/crouch~21-,C:e=half,K:e=half/open~c,e=happy/~21-,1=fishBone/fishDish~19-,Y=heart/~21-,K:a=stand/nod~21-,K:t=sway/up~c|' +
    'catStretch:S:a=loaf/nod~18-,S:b=loaf/stretch~18-,S:e=loafHalf/shut~18-,S:l=~/~18-,S:t=loaf/up~18-,S:Y=z1/tilde~18-|' +
    'dragonFlame:b=turnR,e=happy/happy/happy/happy/squint/squint~l,m=small,1=dragonFlame0/dragonFlame1/dragonFlame2~l,y=fireSpark0/fireSpark1/fireSpark2~l,K:a=airplane,K:w=up/cheer~c,K:t=puff,C:L=up,C:R=front|' +
    'whaleSpout:b=squash/stand~c,N:l=crouch/stand~c,W:l=~,e=happy,1=whaleSpout0/whaleSpout1/whaleSpout2~l,K:a=nod/stand~c,K:w=cheer/up~c,K:t=puff,C:L=up,C:R=up|' +
    'foxWisp:b=squash/stand~c,N:l=crouch/stand~c,e=happy,1=foxWisp0/foxWisp1/foxWisp2~l,y=spark,K:a=airplane/stand~c,K:w=cheer/up~c,K:t=puff,C:L=up,C:R=up|' +
    'pandaBamboo:b=squash/stand~c,N:l=crouch/stand~c,e=happy,m=small/yawn~c,1=bamboo0/bamboo1~c,y=heart,K:a=nod/stand~c,K:w=groom1/groom2~c,K:t=puff,C:L=up,C:R=front|' +
    'letter:b=turnR,e=open,e=half/~10-19,e=happy/~19-,1=envS/letter~0-6,1=envSOpen/~6-11,Y=heart/~19-,K:a=nod|' +
    'rickroll:b=leanR/squash/leanL/stand~4,e=happy/open~c,1=micStand/micSink1~0-31,1=micSink2/~34-,y=note,K:a=stand/nod~c,K:w=cheer,C:L=up/stub~c,C:R=stub/up~c|' +
    'readAlong:e=open/open/half/half~l,e=open/~0-2,e=open/~14-,z=0/0/1/1~l,z=0/~0-2,z=0/~14-,N:l=stand/stand/crouch/crouch~l,N:l=stand/~0-2,N:l=stand/~14-,C:y=note|' +
    'yawn:e=half,e=shut/~2-9,m=small/~0-2,m=yawn/~2-9,y=tilde/~4-9,K:a=nod/~0-9,K:t=puff/~2-9,K:t=curl/~9-,C:b=tall/~2-9,C:L=up/~2-9,C:R=up/~2-9|' +
    'wave:e=happy,K:a=nod,K:w=upR/upR/none/none~l,K:w=none/~12-,K:y=note,C:R=up/up/waveOut/waveOut~l,C:R=stub/~12-,C:y=note/heart~0-12|' +
    'slashPlan:b=turnR,1=blueprint,e=happy/open~14-,z=1/~8-11,l=crouch/~8-11,y=spark/note~14-,K:a=nod,K:w=write1,K:t=sway,C:R=front|' +
    'slashGoal:0=goalFlame1/goalFlame0~c,b=squash/stand~0-8,l=crouch/stand~0-8,e=happy/squint~14-,1=headband,y=spark,K:a=nod/stand~0-8,K:w=cheer/up~0-8,K:t=puff,C:L=front/up~0-8,C:R=front/up~0-8|' +
    'slashBoost:e=wide,1=goggles,2=iceCrystal/iceCrystalSpin/iceCrystalHi/iceCrystalSpin~4,y=spark,K:a=stand,K:w=up,K:t=puff,C:L=up,C:R=up|' +
    'slashTeam:e=happy,1=flag0/flag1~c,y=spark,C:R=up,K:a=stand,K:w=upR,K:t=puff|' +
    'slashBrowser:0=waveSplash1/waveSplash0~c,b=leanR/turnR~c,1=shadesProp,2=surfboard,y=spark,K:a=airplane,K:t=puff|' +
    'slashCompact:b=squash/leanR~c,b=stand/~16-,l=crouch/stand~c,l=stand/~16-,e=happy/squint~16-,1=cloudBig/cubeGlow~0-9,1=cloudMid/~9-16,y=spark/~16-,K:a=stand/nod~16-,K:w=up/cheer~16-,K:t=puff/sway~16-,C:L=up/front~16-,C:R=up/front~16-|' +
    'slashSchedule:1=hourglass1/hourglass0~c,2=pocketWatch,e=half/open~c,e=happy/~10-14,z=1/~10-14,l=crouch/~10-14,y=note,K:a=nod,K:t=sway,C:R=front|' +
    'slashGrill:e=squint,1=spotlight,2=micHand,y=q,C:R=front,K:a=nod,K:w=write1,K:t=curl|' +
    'slashLearnBook:e=half/open~c,1=book0/book1~c,y=note,C:R=front,K:a=nod,K:w=write1,K:t=sway|' +
    'slashLearnBulb:1=bulbOn/bulbOff~9-,e=happy/half~9-,y=spark/q~9-,K:a=stand/nod~9-,K:t=puff/curl~9-,C:R=up/~9-|' +
    'nightSip:e=half/happy~c,1=hotCup0/hotCup1~c,y=tilde,C:R=front,K:a=nod,K:t=curl|' +
    'feedCoffee:e=happy,1=hotCup0/hotCup1~c,y=heart,C:R=front,K:a=nod/stand~f,K:t=up/puff~f|' +
    'feedDonut:b=squash/stand~c,l=crouch/stand~c,e=happy,1=donut0/donut1~0-10,y=heart,K:a=nod/stand~c,K:t=up/puff~c,C:R=front';

  const DSL_KEY_MAP = { 0: 'backProp', sh: 'shadow', b: 'body', e: 'eyes', l: 'legs', L: 'clawL', R: 'clawR', a: 'ears', w: 'paws', t: 'tail', m: 'mouth', 1: 'prop1', 2: 'prop2', y: 'extraSym', Y: 'forceSym', z: 'sink' };
  const POSE_DSL = Object.create(null);
  for (const seg of POSE_DSL_RAW.split('|')) {
    const idx = seg.indexOf(':');
    POSE_DSL[seg.slice(0, idx)] = seg.slice(idx + 1).split(',').map((kv) => {
      let scope = '';
      let rest = kv;
      if (rest[1] === ':') { scope = rest[0]; rest = rest.slice(2); }
      const eq = rest.indexOf('=');
      const prop = DSL_KEY_MAP[rest.slice(0, eq)];
      const rawV = rest.slice(eq + 1);
      if (rawV === '~') return [scope, prop, 0, null];
      const tIdx = rawV.lastIndexOf('~');
      if (tIdx >= 0) {
        const m = rawV.slice(tIdx + 1);
        const parts = rawV.slice(0, tIdx).split('/').map((x) => (x === '~' ? null : x));
        const di = m.indexOf('-');
        return [scope, prop, di >= 0 ? [+m.slice(0, di), m.slice(di + 1) ? +m.slice(di + 1) : 1e9] : m, parts];
      }
      return [scope, prop, 0, prop === 'sink' ? +rawV : rawV];
    });
  }

  function applyDslPose(s, rules, c) {
    for (const [sc, prop, mode, val] of rules) {
      if (sc && (sc === 'C' ? c.isFelineRig : sc === 'K' ? !c.isFelineRig : sc === 'S' ? !c.isCat : sc === 'W' ? !c.isWhale : c.isWhale)) continue;
      let v = val;
      if (mode) {
        if (Array.isArray(mode)) v = val[c.lt >= mode[0] && c.lt < mode[1] ? 0 : 1];
        else if (mode === 'f') v = val[c.frameMod ? 0 : 1];
        else if (mode === 'c') v = val[c.clipMod ? 0 : 1];
        else if (mode === '4') v = val[c.phase4];
        else if (mode === '3') v = val[c.tickIdx % 3];
        else if (mode === 'l') v = val[c.lt % val.length];
        if (v === '') continue;
      }
      if (prop === 'extraSym') { if (!c.sym) s.extraSym = v; }
      else if (prop === 'forceSym') s.extraSym = v;
      else s[prop] = prop === 'sink' && v !== null ? +v : v;
    }
  }

  const POSE_RECIPES = {
    idle: null,
    squash(s, { isFelineRig, isWhale, p }) {
      s.shadow = 'w14'; s.body = 'squash'; s.legs = isWhale ? null : 'crouch';
      if (isFelineRig) { s.ears = 'nod'; s.eyes = 'half'; if (isWhale) s.paws = 'tuck'; } else s.eyes = shiftFrame(p.eyes.squint, 0, 1);
    },
    loaf(s, { isCat, isWhale, isFox, isPanda, poseKey, phase4, tickIdx }) {
      if (!isCat && !isWhale && !isFox && !isPanda) return;
      s.shadow = 'w14'; s.ears = 'loaf'; s.body = 'loaf'; s.legs = null;
      if (isWhale || isPanda) s.paws = 'tuck';
      s.eyes = poseKey === 'sleep' || phase4 === 3 ? 'loafShut' : 'loafHalf';
      s.tail = poseKey === 'sleep' || isWhale ? 'loaf' : floor(tickIdx / 4) % 2 ? 'loaf' : 'curl';
    },
    sleep(s, c) {
      if (c.isCat || c.isWhale || c.isFox || c.isPanda) POSE_RECIPES.loaf(s, c);
      else if (c.isDragon) { s.shadow = 'w14'; s.body = 'squash'; s.ears = 'loaf'; s.eyes = 'shut'; s.legs = 'tuck'; s.paws = 'tuck'; s.tail = 'curl'; }
      else { s.body = 'squash'; s.eyes = 'shut'; s.legs = 'tuck'; }
    },
    walk(s, { isCat, isDragon, isWhale, isFox, isPanda, tickIdx, opts }) {
      const b = floor(tickIdx / 2) % 4;
      if (isWhale) {
        s.legs = null;
        if (b % 2 === 0) s.sink = -1;
        s.body = opts.dir === 'left' ? 'turnL' : 'turnR';
        s.paws = b < 2 ? 'flap' : 'none';
        s.tail = b < 2 ? 'puff' : 'sway';
        return;
      }
      s.legs = ['walkA', 'stand', 'walkB', 'stand'][b];
      if (b % 2 === 0) s.sink = 1;
      if (isCat || isFox || isPanda) s.tail = b < 2 ? 'up' : 'sway';
      else if (isDragon) {
        s.body = opts.dir === 'left' ? 'turnL' : 'turnR';
        s.paws = b % 2 === 0 ? 'cheer' : 'none';
        s.tail = b < 2 ? 'up' : 'sway';
      } else s.body = opts.dir === 'left' ? 'turnL' : 'turnR';
    },
    plant(s, { isFelineRig, lt, sym, p }) {
      s.legs = lt < 8 ? 'crouch' : 'stand';
      if (isFelineRig) {
        s.ears = 'nod'; s.body = lt < 8 ? 'squash' : 'stand'; s.eyes = lt >= 16 && lt <= 24 ? 'happy' : 'open';
        s.prop1 = pickStage(PLANT_STAGES_K, lt, 'wilt2'); s.prop2 = lt >= 17 && lt < 21 ? 'd1' : null;
      } else {
        s.body = lt < 8 ? 'squash2' : 'stand'; s.clawR = lt < 8 ? 'low' : 'stub';
        s.eyes = lt < 8 ? shiftFrame(p.eyes.open, 0, 3) : lt >= 16 && lt <= 24 ? 'happy' : lt > 24 ? 'half' : 'open';
        s.prop1 = pickStage(PLANT_STAGES_C, lt, 'wilt3');
        s.prop2 = lt >= 17 && lt < 21 ? 'd1' : lt >= 21 && lt < 23 ? 'd2' : null;
        s.extraSym = lt > 28 ? SYMS.sweat : sym;
      }
    },
    butterfly(s, { isFelineRig, lt, clipMod, sym }) {
      const lp = lt % 16 >= 8, r = lt >= 24 && lt <= 30;
      s.eyes = r ? 'happy' : lp ? 'openL' : 'openR';
      s.prop1 = r ? 'bfRest' : lp ? (clipMod ? 'bfLeftUp' : 'bfLeftDn') : clipMod ? 'bfUp' : 'bfDn';
      s.extraSym = r ? SYMS.spark : sym;
      if (isFelineRig) { s.ears = r ? 'nod' : 'stand'; s.tail = clipMod ? 'sway' : 'puff'; } else s.clawR = lt % 10 < 5 ? 'reach1' : 'stub';
    },
    onFire(s, { lt }) {
      const cool = lt >= 30;
      s.backProp = cool ? null : 'fire' + (lt < 5 ? 1 : lt < 10 ? 2 : 3) + (lt % 4);
      s.prop1 = 'mug'; s.eyes = 'open'; s.extraSym = cool ? PROPS.smoke : SYMS['fireSpark' + (lt % 3)];
    },
    siren(s, { isFelineRig, lt, clipMod }) {
      const x = floor(lt / 6) % 2 ? 'B' : '', i = lt % 4, bn = ['beamL', 'beamF', 'beamR', null][i];
      s.body = clipMod ? 'squash' : 'stand'; s.eyes = 'wide';
      s.prop1 = ['sirenL', 'sirenF', 'sirenR', 'sirenDim'][i] + x; s.prop2 = bn ? bn + x : null;
      s.extraSym = clipMod ? SYMS.bang : SYMS.sweat; if (isFelineRig) s.ears = 'airplane';
    },
    lookNod(s, { isFelineRig, lt, opts, sym }) {
      const fL = opts.dir === 'left', at = Number(opts.clipParam ?? (isFelineRig ? 9 : 5)), nod = lt >= at && lt < at + 2;
      s.body = fL ? 'turnL' : 'turnR'; s.eyes = nod ? 'happy' : fL ? 'openL' : 'openR';
      if (nod) { s.sink = 1; s.legs = 'crouch'; }
      s.extraSym = sym || (lt >= at + 2 && lt < at + 8 ? (isFelineRig ? SYMS.heart : SYMS.note) : null);
    },
    gaze(s, { isCat, isDragon, isFox, isPanda, opts }) {
      const fL = opts.dir === 'left', up = opts.clipParam === 1;
      s.body = fL ? 'turnL' : 'turnR'; s.eyes = up ? (fL ? 'upL' : 'upR') : fL ? 'openL' : 'openR';
      if ((isCat || isDragon || isFox || isPanda) && (opts.earTwitch === 'L' || opts.earTwitch === 'R')) s.ears = opts.earTwitch === 'L' ? 'twitchL' : 'twitchR';
    },
  };

  const ALL_POSE_KEYS = Array.from(new Set([...Object.keys(POSE_DSL), ...Object.keys(POSE_RECIPES), 'yawnStretch']));

  function resolvePart(dict, val) {
    return typeof val === 'string' ? dict[val] || null : val || null;
  }

  function buildClipLayers(kind, poseKey, tickIdx, opts = {}) {
    if (poseKey === 'yawnStretch') {
      const lt = Number(opts.clipTick ?? tickIdx);
      const first = lt < YAWN_STRETCH_SPLIT;
      return buildClipLayers(kind, first ? 'yawn' : 'stretch', tickIdx, {
        ...opts,
        clipTick: first ? lt : lt - YAWN_STRETCH_SPLIT,
      });
    }
    const isCat = kind === 'cat';
    const isDragon = kind === 'dragon';
    const isWhale = kind === 'whale';
    const isFox = kind === 'fox';
    const isPanda = kind === 'panda';
    const isFelineRig = isCat || isDragon || isWhale || isFox || isPanda;
    const p = isCat ? CAT_PARTS : isDragon ? DRAGON_PARTS : isWhale ? WHALE_PARTS : isFox ? FOX_PARTS : isPanda ? PANDA_PARTS : CLAWD_PARTS;
    const frameMod = tickIdx % 2;
    const phase4 = tickIdx % 4;
    const sym = opts.sym ? SYMS[opts.sym] : null;
    const lt = Number(opts.clipTick ?? tickIdx);
    const clipMod = lt % 2;
    const blinkStage = opts.blinkStage || (opts.blink ? 'closed' : null);

    const s = {
      backProp: null,
      shadow: opts.noShadow ? null : 'w12',
      body: 'stand',
      eyes: opts.eyeScan === -1 ? 'openL' : opts.eyeScan === 1 ? 'openR' : 'open',
      legs: isWhale ? null : 'stand',
      mouth: null,
      prop1: null,
      prop2: null,
      extraSym: sym,
      sink: 0,
      clawL: isFelineRig ? null : 'stub',
      clawR: isFelineRig ? null : 'stub',
      ears: isFelineRig ? 'stand' : null,
      paws: isFelineRig ? 'none' : null,
      tail: isFelineRig ? ['up', 'sway', 'curl', 'up'][phase4] : null,
    };

    const ctx = { isCat, isDragon, isWhale, isFox, isPanda, isFelineRig, p, poseKey, tickIdx, lt, frameMod, clipMod, phase4, opts, sym };
    if (hasOwn(POSE_RECIPES, poseKey)) {
      if (POSE_RECIPES[poseKey]) POSE_RECIPES[poseKey](s, ctx);
    } else if (POSE_DSL[poseKey]) {
      applyDslPose(s, POSE_DSL[poseKey], ctx);
    }

    if (isFelineRig && s.body === 'squash' && s.ears === 'stand') s.ears = 'nod';
    if ((isDragon || isPanda) && (poseKey === 'happy' || poseKey === 'pet')) s.paws = frameMod ? 'up' : 'cheer';
    if (isFox && (poseKey === 'happy' || poseKey === 'pet')) s.tail = frameMod ? 'puff' : 'up';
    if (isDragon && poseKey === 'peek') s.paws = 'tuck';
    if (isWhale && (poseKey === 'happy' || poseKey === 'pet') && !s.prop1) s.prop1 = frameMod ? 'whaleSpout1' : 'whaleSpout0';
    if (isWhale && poseKey === 'flat') s.tail = 'loaf';
    if (isFelineRig && SLOW_TAIL_POSES.has(poseKey)) {
      s.tail = opts.reduced ? 'up' : floor(tickIdx / 3) % 2 ? 'sway' : 'up';
    }
    if (poseKey === 'idle') {
      if (isCat || isFox || isPanda) {
        if (opts.earTwitch === 'L') s.ears = 'twitchL';
        else if (opts.earTwitch === 'R') s.ears = 'twitchR';
        if (isFox && opts.clawSnap) s.tail = 'puff';
      } else if (isDragon) {
        if (opts.earTwitch === 'L') s.ears = 'twitchL';
        else if (opts.earTwitch === 'R') s.ears = 'twitchR';
        if (opts.clawSnap) s.paws = 'cheer';
      } else if (isWhale) {
        if (opts.earTwitch) s.tail = 'puff';
        if (opts.clawSnap) s.paws = 'flap';
      } else {
        if (opts.clawSnap === 'L') s.clawL = 'open';
        else if (opts.clawSnap === 'R') s.clawR = 'open';
      }
      if (opts.breath) {
        s.sink = 1;
        if (!isWhale) s.legs = 'crouch';
        if (s.shadow) s.shadow = 'w14';
      }
    }
    if (isWhale && s.sink > 0) {
      if (s.body === 'stand') s.body = 'squash';
      s.sink = 0;
    }

    let backProp = resolvePart(PROPS, s.backProp);
    let shadow = resolvePart(p.shadow, s.shadow);
    let legs = resolvePart(p.legs, s.legs);
    let body = resolvePart(p.body, s.body);
    let mouth = resolvePart(p.mouth, s.mouth);
    let eyes = resolvePart(p.eyes, s.eyes);
    let prop1 = resolvePart(PROPS, s.prop1);
    let prop2 = resolvePart(PROPS, s.prop2);
    let extraSym = resolvePart(SYMS, s.extraSym) || (typeof s.extraSym === 'object' ? s.extraSym : null);

    if (blinkStage && BLINKABLE_POSES.has(poseKey)) {
      const eyeDx = eyes === p.eyes.open ? 0 : eyes === p.eyes.openL ? -1 : eyes === p.eyes.openR ? 1 : null;
      if (eyeDx !== null) eyes = shiftFrame(blinkStage === 'half' ? p.eyes.half : p.eyes.blink, eyeDx, 0);
    }

    if (!isFelineRig) {
      let clawL = resolvePart(p.clawL, s.clawL);
      let clawR = resolvePart(p.clawR, s.clawR);
      if (s.body === 'squash') {
        if (clawL === p.clawL.up) clawL = shiftFrame(clawL, 0, 2);
        if (clawR === p.clawR.up) clawR = shiftFrame(clawR, 0, 2);
      }
      if (s.sink) {
        body = shiftFrame(body, 0, s.sink);
        eyes = shiftFrame(eyes, 0, s.sink);
        clawL = shiftFrame(clawL, 0, s.sink);
        clawR = shiftFrame(clawR, 0, s.sink);
        mouth = shiftFrame(mouth, 0, s.sink);
      }
      let crystal = null;
      if (opts.crystal && !CRYSTAL_HIDE_POSES.has(poseKey) && !(extraSym && !CRYSTAL_OK_SYMS.has(extraSym))) {
        crystal = opts.crystalBob ? PROPS.iceCrystalHi : PROPS.iceCrystal;
      }
      return [backProp, shadow, legs, body, mouth, eyes, clawL, clawR, prop1, prop2, crystal, extraSym].filter(Boolean);
    }

    let ears = resolvePart(p.ears, s.ears);
    let paws = resolvePart(p.paws, s.paws);
    let tail = resolvePart(p.tail, s.tail);
    if (s.sink) {
      body = shiftFrame(body, 0, s.sink);
      ears = shiftFrame(ears, 0, s.sink);
      eyes = shiftFrame(eyes, 0, s.sink);
      paws = shiftFrame(paws, 0, s.sink);
      tail = shiftFrame(tail, 0, s.sink);
      mouth = shiftFrame(mouth, 0, s.sink);
    }
    return [backProp, shadow, tail, legs, body, mouth, ears, eyes, paws, prop1, prop2, extraSym].filter(Boolean);
  }

  // 随机眨眼过渡：1×2 竖瞳 → 1×1 → 闭（s 暗面横线）→ 1×1 → 1×2
  const BLINK_SINGLE = ['half', 'closed', 'half'];
  const BLINK_DOUBLE = ['half', 'closed', 'half', 'closed', 'half'];
  // 迷你蟹眨眼帧缓存：把竖瞳 o 替换为暗面色 s
  const MINI_BLINK_CACHE = new WeakMap();
  function miniBlinkFrame(fr) {
    let out = MINI_BLINK_CACHE.get(fr);
    if (!out) {
      out = recolorFrame(fr, { o: 's' });
      MINI_BLINK_CACHE.set(fr, out);
    }
    return out;
  }

  // ── 纯几何碰撞与擦肩经过判定（供主宠自主散步 / 拖拽 / 单元契约共测） ──
  const CRAB_ENCOUNTER_SEQ = new WeakMap();

  function classifyPairEncounter(opts = {}) {
    const {
      xA = 0,
      yA = 0,
      walkingA = false,
      dirA = 1,
      xB = 0,
      yB = 0,
      walkingB = false,
      dirB = -1,
      contactDist = 42,
      verticalTol = 22,
    } = opts;
    if (abs(yA - yB) > verticalTol) return null;
    const dx = xB - xA;
    if (abs(dx) >= contactDist) return null;
    if (!walkingA && !walkingB) return null;
    const sign = dx >= 0 ? 1 : -1;
    const dA = dirA >= 0 ? 1 : -1;
    const dB = dirB >= 0 ? 1 : -1;

    // 1. 双向相向逼近 → 迎面轻撞 (bump)
    if (walkingA && walkingB && dA * sign > 0 && dB * sign < 0) {
      return { kind: 'bump', sign };
    }
    // 2. 单方朝静止伙伴靠近且尚未完全跨过 → 擦肩经过 (passBy)
    if (walkingA && !walkingB && dA * sign > 0 && abs(dx) >= 10) {
      return { kind: 'passBy', mover: 'A', stationary: 'B', dir: dA };
    }
    if (walkingB && !walkingA && dB * sign < 0 && abs(dx) >= 10) {
      return { kind: 'passBy', mover: 'B', stationary: 'A', dir: dB };
    }
    // 3. 同向行走且后方追上前车 → 超车擦肩经过 (passBy)
    if (walkingA && walkingB && dA === dB && abs(dx) >= 8) {
      const rearIsA = dA > 0 ? xA < xB : xA > xB;
      return {
        kind: 'passBy',
        mover: rearIsA ? 'A' : 'B',
        stationary: rearIsA ? 'B' : 'A',
        dir: dA,
      };
    }
    return null;
  }

  // ── 迷你三蟹舞台走廊漫步与碰钳/翻越经过逻辑 ─────────────────────────────
  function stepMiniCrabCorridor(crabs, opts = {}) {
    const minX = isFin(opts.minX) ? opts.minX : 2;
    const maxX = max(minX + 16, isFin(opts.maxX) ? opts.maxX : 220);
    const contactDist = isFin(opts.contactDist) ? opts.contactDist : 26;
    const nowTick = isFin(opts.nowTick) ? opts.nowTick : 0;
    const events = [];
    if (!Array.isArray(crabs) || crabs.length === 0) return events;

    let pairCounts = CRAB_ENCOUNTER_SEQ.get(crabs);
    if (!pairCounts) {
      pairCounts = new Map();
      CRAB_ENCOUNTER_SEQ.set(crabs, pairCounts);
    }

    // 1. 自由状态下的迷你蟹匀速漫步 + 走廊边界折返
    for (const mc of crabs) {
      if (!mc || mc.act) continue;
      if (!isFin(mc.px)) mc.px = isFin(mc.x) ? mc.x : minX;
      if ((mc.bumpUntilTick || -1) > nowTick) {
        mc.px = clamp(mc.px, minX, maxX);
        continue;
      }
      const spd = isFin(mc.speed) ? mc.speed : 1.0;
      mc.dir = mc.dir >= 0 ? 1 : -1;
      let next = mc.px + mc.dir * spd;
      if (next <= minX) {
        next = minX;
        mc.dir = 1;
      } else if (next >= maxX) {
        next = maxX;
        mc.dir = -1;
      }
      mc.px = next;
    }

    // 2. 两两检测接触：迎面交替触发 crabBump / crabPass；同向追及触发 crabPass
    for (let i = 0; i < crabs.length; i++) {
      const a = crabs[i];
      if (!a || a.act || (a.cooldownTick || -99) > nowTick) continue;
      for (let j = i + 1; j < crabs.length; j++) {
        const b = crabs[j];
        if (!b || b.act || (b.cooldownTick || -99) > nowTick) continue;
        const dx = b.px - a.px;
        if (abs(dx) >= contactDist) continue;
        const sign = dx >= 0 ? 1 : -1;
        const dA = a.dir >= 0 ? 1 : -1;
        const dB = b.dir >= 0 ? 1 : -1;
        const headOn = dA * sign > 0 && dB * sign < 0;
        const sameDirChase = dA === dB && abs(dx) >= 4;
        if (!headOn && !sameDirChase) continue;

        if (headOn) {
          const pairKey = [a.id, b.id].sort().join('-');
          const count = pairCounts.get(pairKey) || 0;
          pairCounts.set(pairKey, count + 1);
          if (count % 2 === 0) {
            a.px = clamp(a.px - sign * 3, minX, maxX);
            b.px = clamp(b.px + sign * 3, minX, maxX);
            a.dir = -sign;
            b.dir = sign;
            a.bumpUntilTick = nowTick + 3;
            b.bumpUntilTick = nowTick + 3;
            a.cooldownTick = nowTick + 8;
            b.cooldownTick = nowTick + 8;
            events.push({ type: 'crabBump', pair: `${a.id}-${b.id}` });
          } else {
            const vaulter = a;
            const yielded = b;
            vaulter.px = clamp(vaulter.px + vaulter.dir * 8, minX, maxX);
            vaulter.passHopUntilTick = nowTick + 4;
            yielded.blinkAt = nowTick;
            a.cooldownTick = nowTick + 9;
            b.cooldownTick = nowTick + 9;
            events.push({ type: 'crabPass', pair: `${vaulter.id}-${yielded.id}` });
          }
        } else {
          const rearIsA = dA > 0 ? a.px < b.px : a.px > b.px;
          const vaulter = rearIsA ? a : b;
          const yielded = rearIsA ? b : a;
          vaulter.px = clamp(vaulter.px + vaulter.dir * 8, minX, maxX);
          vaulter.passHopUntilTick = nowTick + 4;
          yielded.blinkAt = nowTick;
          a.cooldownTick = nowTick + 9;
          b.cooldownTick = nowTick + 9;
          events.push({ type: 'crabPass', pair: `${vaulter.id}-${yielded.id}` });
        }
        break;
      }
    }
    return events;
  }

  // ── Google 四色全息棱镜虹彩光谱插值 & 5 宠一维刚体防重叠 & 遇障决策纯函数 ──────
  const CHROMA_STOPS = [
    [0x42, 0x85, 0xf4], // #4285F4 Cobalt Blue
    [0x9b, 0x72, 0xcb], // #9B72CB Amethyst Iris
    [0xea, 0x43, 0x35], // #EA4335 Coral Red
    [0xfb, 0xbc, 0x04], // #FBBC04 Warm Amber
    [0x5c, 0xc6, 0xfc], // #5CC6FC Sky Cyan
  ];
  const CHROMA_HEX = ['#4285F4', '#9B72CB', '#EA4335', '#FBBC04', '#5CC6FC'];

  const CHROMA_CACHE = Object.create(null);

  function evalChromaColorAt(gx, gy, phase = 0, isShadow = false) {
    const sum = gx + gy;
    const pNorm = ((phase % 1) + 1) % 1;
    const pStep = round(pNorm * 12);
    const cacheable = Number.isInteger(sum) && sum >= -64 && sum <= 128 && abs(pNorm * 12 - pStep) < 1e-5;
    let cKey = 0;
    if (cacheable) {
      cKey = ((pStep % 12) << 9) | ((sum + 64) << 1) | (isShadow ? 1 : 0);
      const hit = CHROMA_CACHE[cKey];
      if (hit) return hit;
    }
    const raw = (sum * 0.068 - (cacheable ? (pStep % 12) / 12 : phase)) % 1;
    const u = (raw < 0 ? raw + 1 : raw) * CHROMA_STOPS.length;
    const i0 = floor(u) % CHROMA_STOPS.length;
    const i1 = (i0 + 1) % CHROMA_STOPS.length;
    const t = u - floor(u);
    const s = t * t * (3 - 2 * t);
    const c0 = CHROMA_STOPS[i0];
    const c1 = CHROMA_STOPS[i1];
    let r = c0[0] + (c1[0] - c0[0]) * s;
    let g = c0[1] + (c1[1] - c0[1]) * s;
    let b = c0[2] + (c1[2] - c0[2]) * s;
    if (isShadow) {
      r = r * 0.68 + 18 * 0.14;
      g = g * 0.68 + 22 * 0.14;
      b = b * 0.72 + 40 * 0.14;
    }
    const hex = (v) => clamp(round(v), 0, 255).toString(16).padStart(2, '0');
    const out = `#${hex(r)}${hex(g)}${hex(b)}`;
    if (cacheable) CHROMA_CACHE[cKey] = out;
    return out;
  }

  /**
   * 一维地面刚体防重叠与向空旷侧推挤分离求解器
   * 输入 bodies: Array<{ id: string, cx: number, halfW: number, locked?: boolean }>
   * 原地更新每个非 locked 角色的 cx，保证净间距 >= minGap（默认 6px）
   */
  function resolveGroundSeparation(bodies, stageMinX = 12, stageMaxX = 708, minGap = 6) {
    if (!Array.isArray(bodies) || bodies.length < 2) {
      if (Array.isArray(bodies) && bodies.length === 1 && !bodies[0].locked) {
        const b = bodies[0];
        b.cx = clamp(b.cx, stageMinX + b.halfW, stageMaxX - b.halfW);
      }
      return bodies;
    }
    const span = max(40, stageMaxX - stageMinX);
    const totalHalfW = bodies.reduce((s, b) => s + b.halfW * 2, 0);
    const maxFeasibleGap = bodies.length > 1 ? max(0, (span - totalHalfW) / (bodies.length - 1)) : minGap;
    const effGap = min(minGap, maxFeasibleGap);

    const ordered = bodies
      .map((b, idx) => ({ b, idx }))
      .sort((a, z) => (abs(a.b.cx - z.b.cx) > 0.01 ? a.b.cx - z.b.cx : a.idx - z.idx))
      .map((x) => x.b);

    for (const b of ordered) {
      if (!b.locked) {
        b.cx = clamp(b.cx, stageMinX + b.halfW, stageMaxX - b.halfW);
      }
    }

    for (let iter = 0; iter < 6; iter++) {
      let moved = false;
      for (let i = 0; i < ordered.length - 1; i++) {
        const left = ordered[i];
        const right = ordered[i + 1];
        const req = left.halfW + right.halfW + effGap;
        const dist = right.cx - left.cx;
        if (dist >= req - 0.01) continue;
        const overlap = req - dist;
        moved = true;
        if (left.locked && right.locked) continue;
        if (left.locked) {
          right.cx += overlap;
        } else if (right.locked) {
          left.cx -= overlap;
        } else {
          const leftRoom = max(0, left.cx - left.halfW - stageMinX);
          const rightRoom = max(0, stageMaxX - (right.cx + right.halfW));
          const sumRoom = leftRoom + rightRoom;
          const wRight = sumRoom > 1 ? rightRoom / sumRoom : 0.5;
          left.cx -= overlap * (1 - wRight);
          right.cx += overlap * wRight;
        }
        if (!left.locked) left.cx = clamp(left.cx, stageMinX + left.halfW, stageMaxX - left.halfW);
        if (!right.locked) right.cx = clamp(right.cx, stageMinX + right.halfW, stageMaxX - right.halfW);
      }
      // 二次单向扫掠消除靠墙挤压残余
      for (let i = 0; i < ordered.length - 1; i++) {
        const l = ordered[i];
        const r = ordered[i + 1];
        const req = l.halfW + r.halfW + effGap;
        if (r.cx - l.cx < req && !r.locked) {
          r.cx = min(stageMaxX - r.halfW, l.cx + req);
        }
      }
      for (let i = ordered.length - 1; i > 0; i--) {
        const l = ordered[i - 1];
        const r = ordered[i];
        const req = l.halfW + r.halfW + effGap;
        if (r.cx - l.cx < req && !l.locked) {
          l.cx = max(stageMinX + l.halfW, r.cx - req);
        }
      }
      if (!moved) break;
    }
    return bodies;
  }

  /**
   * 散步遇障三种灵动越障决策器：
   * - 'leapfrog': 抛物线撑跳越过对方头顶（峰值 ~26px）落到另一侧继续走
   * - 'autoPerch': 顺势轻跳坐上对方（或塔顶）头顶搭便车
   * - 'greetTurn': 驻足眨眼/拉墨镜偷瞄/挥魔杖闪星后礼貌转身
   */
  function chooseObstacleAction(opts = {}) {
    const canLeap = opts.canLeap !== false;
    const canPerch = !!opts.canPerch;
    const roll = isFin(opts.roll) ? opts.roll : random();
    if (canLeap && canPerch) {
      if (roll < 0.42) return 'leapfrog';
      if (roll < 0.74) return 'autoPerch';
      return 'greetTurn';
    }
    if (canLeap) return roll < 0.58 ? 'leapfrog' : 'greetTurn';
    if (canPerch) return roll < 0.52 ? 'autoPerch' : 'greetTurn';
    return 'greetTurn';
  }

  // ── 自由点选桌宠阵容编解码（向后兼容 5 预设 + dual/all/fox/panda 别名，单物种纯开关 0/1，主宠总数 <= 6）──
  const MASCOT_SPECIES_ORDER = ['c', 'k', 'd', 'w', 'f', 'p'];
  const MASCOT_MAX_PER_SPECIES = 1;
  const MASCOT_MAX_TOTAL = 6;
  const MASCOT_PRESET_MAP = {
    off: { c: 0, k: 0, d: 0, w: 0, f: 0, p: 0, minis: false },
    crab: { c: 1, k: 1, d: 0, w: 0, f: 0, p: 0, minis: false },
    dual: { c: 1, k: 1, d: 0, w: 0, f: 0, p: 0, minis: false },
    minis: { c: 1, k: 1, d: 0, w: 0, f: 0, p: 0, minis: true },
    quad: { c: 1, k: 1, d: 1, w: 1, f: 0, p: 0, minis: false },
    'quad-minis': { c: 1, k: 1, d: 1, w: 1, f: 0, p: 0, minis: true },
    all: { c: 1, k: 1, d: 1, w: 1, f: 1, p: 1, minis: false },
    'all-minis': { c: 1, k: 1, d: 1, w: 1, f: 1, p: 1, minis: true },
    fox: { c: 0, k: 1, d: 0, w: 0, f: 1, p: 0, minis: false },
    panda: { c: 0, k: 1, d: 0, w: 0, f: 0, p: 1, minis: false },
  };

  function parseMascotSpec(raw) {
    if (raw === false) return { c: 0, k: 0, d: 0, w: 0, f: 0, p: 0, minis: false };
    if (typeof raw !== 'string') return null;
    if (hasOwn(MASCOT_PRESET_MAP, raw)) return { ...MASCOT_PRESET_MAP[raw] };
    if (!raw.startsWith('r:') || raw.length <= 2) return null;
    const m = /^r:(?:([ckdwfp][0-4](?:,[ckdwfp][0-4])*)?(\+m)?)$/.exec(raw);
    if (!m) return null;
    const out = { c: 0, k: 0, d: 0, w: 0, f: 0, p: 0, minis: Boolean(m[2]) };
    const seen = new Set();
    let rawTotal = 0;
    let total = 0;
    if (m[1]) {
      for (const tok of m[1].split(',')) {
        const sp = tok[0];
        const cnt = Number(tok.slice(1));
        if (seen.has(sp) || !Number.isInteger(cnt) || cnt < 0 || cnt > 4) return null;
        seen.add(sp);
        rawTotal += cnt;
        const clamped = cnt > 0 ? 1 : 0;
        out[sp] = clamped;
        total += clamped;
      }
    }
    if (rawTotal > 8 || total > MASCOT_MAX_TOTAL) return null;
    return out;
  }

  function encodeMascotSpec(spec) {
    const src = spec && typeof spec === 'object' ? spec : {};
    const counts = { c: 0, k: 0, d: 0, w: 0, f: 0, p: 0 };
    let rem = MASCOT_MAX_TOTAL;
    for (const sp of MASCOT_SPECIES_ORDER) {
      const n = clamp(Number(src[sp]) > 0 ? 1 : 0, 0, min(MASCOT_MAX_PER_SPECIES, rem));
      counts[sp] = n;
      rem -= n;
    }
    const minis = Boolean(src.minis);
    const total = counts.c + counts.k + counts.d + counts.w + counts.f + counts.p;
    if (total === 0 && !minis) return 'off';
    if (counts.c === 1 && counts.k === 1 && counts.d === 0 && counts.w === 0 && counts.f === 0 && counts.p === 0) return minis ? 'minis' : 'crab';
    if (counts.c === 1 && counts.k === 1 && counts.d === 1 && counts.w === 1 && counts.f === 0 && counts.p === 0) return minis ? 'quad-minis' : 'quad';
    if (counts.c === 1 && counts.k === 1 && counts.d === 1 && counts.w === 1 && counts.f === 1 && counts.p === 1) return minis ? 'all-minis' : 'all';
    const parts = [];
    for (const sp of MASCOT_SPECIES_ORDER) {
      if (counts[sp] > 0) parts.push(sp + counts[sp]);
    }
    return 'r:' + parts.join(',') + (minis ? '+m' : '');
  }

  function normalizeMascotValue(raw, fallback = 'crab') {
    const parsed = parseMascotSpec(raw);
    return parsed ? encodeMascotSpec(parsed) : fallback;
  }

  function isValidMascotValue(raw) {
    return typeof raw === 'string' && parseMascotSpec(raw) !== null;
  }

  function mountDualMascotStage(hostEl, options = {}) {
    if (!hostEl) return null;
    const doc = hostEl.ownerDocument;
    const win = (doc?.defaultView) || (typeof window !== 'undefined' ? window : null);
    let hostSleep = false;
    let inspectState = null;
    let wb = false;
    const WB = 'data-ag-cs-win-blur';
    const PM = 'data-ag-prism-mode';
    const PP_OPEN = 'data-ag-pp-open';
    const isDocHidden = () => !!(doc?.hidden);
    const isPpOpen = () => {
      const root = doc?.documentElement;
      return Boolean(root && isFn(root.getAttribute) && root.getAttribute(PP_OPEN) === '1');
    };
    const isAttrB = () => {
      const root = doc?.documentElement;
      if (!root) return false;
      const val = isFn(root.getAttribute) ? root.getAttribute(WB) : null;
      if (val === '1') return true;
      if (val === '0') return false;
      return Boolean(isFn(root.hasAttribute) && root.hasAttribute(WB));
    };
    const isWindowBlurred = () => Boolean(isDocHidden() || isAttrB() || (!options.keepAliveWhileVisible && wb));
    const isHostSleeping = () => {
      if (hostSleep) return true;
      const root = doc?.documentElement;
      if (!root) return false;
      return isFn(root.getAttribute) && root.getAttribute(PM) === 'chat';
    };
    const readDpr = () => min((win?.devicePixelRatio) || 1, 2);
    let dpr = readDpr();
    const rand = (a, b) => a + random() * (b - a);
    const ticksIn = (minMs, maxMs) => max(1, round(rand(minMs, maxMs) / TICK));

    let tickIdx = 0;
    let disposed = false;
    let parked = false;
    let vramReclaimed = false;
    const isHostDetached = () => !!(hostEl?.isConnected === false);
    const isVramSleepState = () => Boolean(disposed || parked || isDocHidden() || isHostSleeping() || isHostDetached());
    const NO_TR_ATTRS = 'translate=no,data-no-translate=true,data-ag-localization-skip=true,data-agy-no-translate=true,data-antigravity-zh-skip=1,data-ag-no-i18n=,data-ag-owned=1'.split(',').map((s) => s.split('='));
    const markNoTrOwned = (el) => {
      if (el?.setAttribute) for (const [k, v] of NO_TR_ATTRS) el.setAttribute(k, v);
      return el;
    };

    // ── prefers-reduced-motion：无 window / matchMedia 时安全降级为 false ──
    let reducedMotion = false;
    let reducedMq = null;
    const onReducedChange = (e) => {
      reducedMotion = !!(e?.matches);
      if (reducedMotion) freezeMotion();
      else lastActivityAt = nowMs();
      syncHeartbeat();
    };
    try {
      if (win && isFn(win.matchMedia)) {
        reducedMq = win.matchMedia('(prefers-reduced-motion: reduce)');
        reducedMotion = !!(reducedMq?.matches);
        if (reducedMq && isFn(reducedMq.addEventListener)) {
          reducedMq.addEventListener('change', onReducedChange);
        } else if (reducedMq && isFn(reducedMq.addListener)) {
          reducedMq.addListener(onReducedChange);
        }
      }
    } catch {
      reducedMotion = false;
      reducedMq = null;
    }
    if (options.reducedMotion !== undefined) reducedMotion = !!options.reducedMotion;

    // 统一托管的延时器（剧目分镜 / 起跳预备），dispose 时全部清理
    const pendingTimers = new Set();
    const later = (ms, fn) => {
      const id = setTimeout(() => {
        pendingTimers.delete(id);
        if (!disposed) fn();
      }, ms);
      pendingTimers.add(id);
      return id;
    };

    const fillKeys = (o, keys, val) => { for (const k of keys.split(',')) o[k] = val; return o; };
    const createActorState = (id, kind, label, phaseTicks, phaseOff = 0) => {
      const a = {
        id, kind, label, pose: 'idle', phaseOff,
        nextBlinkTick: phaseTicks + ticksIn(2400, 6000),
        nextBreathTick: phaseTicks + ticksIn(2800, 4200),
        nextTwitchTick: phaseTicks + ticksIn(6000, 10000),
        nextSnapTick: phaseTicks + ticksIn(8000, 12000),
        nextGlanceAt: nowMs() + phaseTicks * TICK + rand(3000, 7000),
        walkStepTick: -1,
        lastRender: fillKeys({ cw: 0, ch: 0 }, 'poseKey,frameIdx,flip,tintState,tyPx,sqW,sqH,lastRot,clipBottomY', null),
      };
      fillKeys(a, 'x,y,vx,vy,rot,overrideUntil,overrideRot,clipStartTick,symUntil,flying,throws,lastThrowAt,pokeCount,lastPokeAt,nodY,nodUntil,eyeScan,seqStartTick,glanceDir,glanceUntil,balRot,passBoostUntil,lastDomRot', 0);
      fillKeys(a, 'sqx,sqy,patrolDir,twitchLen', 1);
      fillKeys(a, 'blinkTick,breathTick,twitchTick,snapTick,forceTwitchStart', -99);
      fillKeys(a, 'overridePose,sym,stackedOn,el,canvas,seq,seqThen,faceDir,clipParam,prevX,lastFx,lastSq,lastDomX,lastDomY,lastDomZ', null);
      fillKeys(a, 'dragging,ballisticActive,mirror,blinkDouble,glanceSecond', false);
      fillKeys(a, 'twitchSide,snapSide,forceTwitchSide', 'R');
      return a;
    };

    // 物种挂载顺序保持 k(cat) -> c(clawd) -> d(dragon) -> w(whale) -> f(fox) -> p(panda)
    const SPECIES_DEF = [
      { key: 'k', kind: 'cat', label: 'Gemini 小紫猫', tip: '小紫猫 · 拖拽/抛掷/双击伸懒腰/右键喂甜甜圈', basePhase: 14 },
      { key: 'c', kind: 'clawd', label: 'Claude Clawd', tip: 'Clawd · 拖拽/抛掷/双击欢呼/右键喂甜甜圈', basePhase: 0 },
      { key: 'd', kind: 'dragon', label: 'GPT 银白龙', tip: '银白龙 · 拖拽/抛掷/双击吐火球/右键喂甜甜圈', basePhase: 23 },
      { key: 'w', kind: 'whale', label: 'DeepSeek Deepy', tip: 'Deepy · 拖拽/抛掷/双击喷水花/右键喂甜甜圈', basePhase: 31 },
      { key: 'f', kind: 'fox', label: 'Kimi 小赤狐', tip: '小赤狐 · 拖拽/抛掷/双击灵狐星火/右键喂甜甜圈', basePhase: 19 },
      { key: 'p', kind: 'panda', label: '团子小熊猫', tip: '小熊猫 · 拖拽/抛掷/双击啃竹子/右键喂甜甜圈', basePhase: 27 },
    ];
    const SPECIES_TIP_MAP = Object.fromEntries(SPECIES_DEF.map((sd) => [sd.kind, sd.tip]));
    const buildRosterSpecs = (r) => {
      const specs = [];
      for (const sd of SPECIES_DEF) {
        if (!(Number(r[sd.key]) > 0)) continue;
        specs.push({
          id: sd.kind,
          kind: sd.kind,
          label: sd.label,
          phaseTicks: sd.basePhase,
          phaseOff: specs.length * 4 + (sd.key === 'k' ? 4 : sd.key === 'd' ? 7 : sd.key === 'w' ? 10 : sd.key === 'f' ? 13 : sd.key === 'p' ? 16 : 0),
        });
      }
      return specs;
    };
    const resolveInitialRoster = (opts) => {
      if (opts.mascot !== undefined) {
        const parsed = parseMascotSpec(opts.mascot);
        if (parsed) return parsed;
      }
      const q = !!opts.quadEnabled;
      return { c: 1, k: 1, d: q ? 1 : 0, w: q ? 1 : 0, minis: !!opts.miniPileEnabled };
    };
    let roster = resolveInitialRoster(options);
    let mascotSpec = encodeMascotSpec(roster);
    const actors = Object.create(null);
    let activeIds = [];
    for (const sp of buildRosterSpecs(roster)) {
      actors[sp.id] = createActorState(sp.id, sp.kind, sp.label, sp.phaseTicks, sp.phaseOff);
      activeIds.push(sp.id);
    }

    const miniCrabs = [
      { id: 'cowboy', x: 16, dir: 1 },
      { id: 'shades', x: 76, dir: -1 },
      { id: 'wizard', x: 136, dir: 1 },
    ];
    miniCrabs.forEach((mc, idx) => {
      mc.kind = 'mini';
      mc.blinkAt = -99;
      mc.nextBlink = ticksIn(1500, 6000);
      mc.lastX = mc.px = mc.x;
      mc.speed = [1.05, 0.86, 1.18][idx] || 1.0;
      fillKeys(mc, 'y,vx,vy,rot,balRot,flying,perchUntil,lastDomRot', 0);
      fillKeys(mc, 'bumpUntilTick,passHopUntilTick,cooldownTick', -1);
      fillKeys(mc, 'dragging,ballisticActive,mirror', false);
      fillKeys(mc, 'stackedOn,leap,act,lastDomX,lastDomY,lastDomZ,lastFrameKey', null);
    });

    const rAF =
      (win && isFn(win.requestAnimationFrame) && win.requestAnimationFrame.bind(win)) ||
      (typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn) => later(16, () => fn(nowMs())));

    const CHROMA_STORE_KEY = '__op_chroma_v1';
    const getStorage = () => {
      try {
        return options.storage || null;
      } catch {
        return null;
      }
    };
    const readChromaSaved = () => {
      try {
        const st = getStorage();
        return Boolean(st?.getItem(CHROMA_STORE_KEY) === '1');
      } catch {
        return false;
      }
    };
    const writeChromaSaved = (on) => {
      try {
        const st = getStorage();
        if (!st) return;
        if (on) st.setItem(CHROMA_STORE_KEY, '1');
        else if (isFn(st.removeItem)) st.removeItem(CHROMA_STORE_KEY);
        else st.setItem(CHROMA_STORE_KEY, '0');
      } catch {
        /* 忽略存储受限环境 */
      }
    };

    const normalizeCamp = (c) =>
      c === 'claude' || c === 'gemini' || c === 'gpt' || c === 'deepseek' || c === 'kimi' || c === 'qwen' || c === 'panda' || c === 'glm'
        ? c
        : 'gemini';
    let camp = normalizeCamp(options.camp);
    let quadEnabled = roster.d > 0 || roster.w > 0 || roster.f > 0 || roster.p > 0;
    const activeMainIds = () => activeIds;
    const activeMainActors = () => activeIds.map((id) => actors[id]).filter(Boolean);
    const CAMP_TO_KIND = { claude: 'clawd', gemini: 'cat', gpt: 'dragon', deepseek: 'whale', kimi: 'fox', qwen: 'fox', panda: 'panda', glm: 'panda' };
    const campActors = (targetCamp = camp) => {
      const k = CAMP_TO_KIND[targetCamp] || 'cat';
      return activeMainActors().filter((a) => a.kind === k);
    };
    const workingActors = () => {
      const matched = campActors(camp);
      if (matched.length) return matched;
      const all = activeMainActors();
      return all.length ? [all[0]] : [];
    };
    const isWorkingActor = (a) => Boolean(a && workingActors().includes(a));
    const leaderActor = () => workingActors()[0] || null;
    const partnerActor = () => {
      const list = activeMainActors();
      if (!list.length) return null;
      const ws = workingActors();
      const nonWorker = list.find((a) => !ws.includes(a));
      if (nonWorker) return nonWorker;
      const lead = ws[0] || list[0];
      return list.find((a) => a !== lead) || lead;
    };
    let streaming = !!options.streaming;
    let streamTier = Number(options.streamTier || 2);
    let hasError = !!options.hasError;
    let yieldMode = options.yieldMode || 'none';
    let leapOffsetY = Number(options.leapOffsetY || 0);
    let popoverRightWidth = Number(options.popoverRightWidth || 0);
    let miniPileEnabled = !!roster.minis;
    let orchestrator = !!options.orchestrator;
    let prismaticCoat = readChromaSaved();
    const sharedSessionGates =
      !options.storage && hostEl && typeof hostEl === 'object'
        ? (hostEl.__opChromaGates || (hostEl.__opChromaGates = { tuned: false, forged: false }))
        : { tuned: false, forged: false };
    const chromaGates = sharedSessionGates;
    const chromaTapTimes = [];
    let chromaPhase = 0;
    const chromaSparks = [];
    let fxCanvasCleared = true;

    // 打盹生态：45s（深夜 30s）无用户操作 → 哈欠 → 打盹；任何操作唤醒
    const DOZE_AFTER_MS = Number(options.dozeAfterMs) || 45000;
    const DOZE_AFTER_NIGHT_MS = Number(options.dozeAfterNightMs) || 30000;
    let dozing = false;
    let lastActivityAt = nowMs();
    let lastHandoffAt = 0;
    let duetUntil = 0;
    let lastCrabStepTick = -1;
    const pairCooldowns = new Map();
    const canTriggerPair = (key, now, cdMs) => {
      const until = pairCooldowns.get(key) || 0;
      if (now < until) return false;
      pairCooldowns.set(key, now + cdMs);
      return true;
    };
    let lastInteraction = { type: null, pair: null, at: 0, tick: -1 };
    const recordInteraction = (type, pair, now = nowMs()) => {
      lastInteraction = { type, pair, at: now, tick: tickIdx };
    };
    let pauseTimer = 0;
    let theaterTimer = 0;
    let theaterCursor = 0;
    let tickTimer = null;
    let currentTickMs = 0;
    let lastMiniDisplay = null;
    const rim = { on: false, x: -9999, s: 0, t: 'default', d: true };
    let rimSig = '0';
    const perfStats = {
      canvasDraws: 0,
      canvasSkips: 0,
      domTransformWrites: 0,
      domTransformSkips: 0,
    };

    // 扩大至 96x84px (32x28 格, PX=3), OX=8, OY=17 -> y=10 脚底在 81px, 头顶留满 51px 放火舌/立麦/节点花!
    const CANVAS_W = 96;
    const CANVAS_H = 84;
    const OX = 8;
    const OY = 17;
    const PEEK_Y = 3;
    const MINI_PEEK_Y = 2;

    if (isFn(hostEl.removeChild)) {
      while (hostEl.firstChild) hostEl.removeChild(hostEl.firstChild);
    } else {
      hostEl.innerHTML = '';
    }

    const miniGroupEl = markNoTrOwned(doc.createElement('div'));
    miniGroupEl.className = 'ag-v2-mini-pile';
    if (miniGroupEl.style) miniGroupEl.style.zIndex = 'auto';
    miniCrabs.forEach((mc) => {
      const cv = markNoTrOwned(doc.createElement('canvas'));
      cv.className = 'ag-v2-mini-crab-canvas';
      cv.width = round(40 * dpr);
      cv.height = round(32 * dpr);
      cv.dataset.miniCrab = mc.id;
      if (cv.style) Object.assign(cv.style, { pointerEvents: 'auto', cursor: 'grab', touchAction: 'none', transformOrigin: '20px 26px' });
      miniGroupEl.appendChild(cv);
      mc.canvas = cv;
      mc._ctx = isFn(cv.getContext) ? (cv._ctx = cv.getContext('2d')) : null;
      mc.el = cv;
    });
    hostEl.appendChild(miniGroupEl);

    const createActorDom = (actor, beforeNode = null) => {
      if (actor.el) return;
      const btn = markNoTrOwned(doc.createElement('div'));
      btn.className = 'ag-v2-mascot-actor';
      for (const [k, v] of [['data-mascot-id', actor.id], ['data-no-press-spring', '1'], ['role', 'button'], ['tabindex', '-1'], ['aria-label', actor.label], ['title', SPECIES_TIP_MAP[actor.kind] || actor.label]]) btn.setAttribute(k, v);
      const cv = markNoTrOwned(doc.createElement('canvas'));
      cv.className = 'ag-v2-mascot-canvas';
      cv.width = round(CANVAS_W * dpr);
      cv.height = round(CANVAS_H * dpr);
      if (cv.style) cv.style.transformOrigin = `${(OX + 8) * PX}px ${(OY + 10) * PX}px`;
      btn.appendChild(cv);
      actor.el = btn;
      actor.canvas = cv;
      actor._ctx = isFn(cv.getContext) ? (cv._ctx = cv.getContext('2d')) : null;
      if (beforeNode?.parentNode === hostEl && isFn(hostEl.insertBefore)) hostEl.insertBefore(btn, beforeNode);
      else hostEl.appendChild(btn);
    };

    for (const a of activeMainActors()) createActorDom(a);

    const fxCanvas = markNoTrOwned(doc.createElement('canvas'));
    fxCanvas.className = 'ag-v2-chroma-fx';
    const releaseFxCanvas = () => {
      fxCanvas.width = fxCanvas.height = 0;
      if (fxCanvas.style) { fxCanvas.style.width = fxCanvas.style.height = '0px'; fxCanvas.style.display = 'none'; }
      fxCanvasCleared = true;
    };
    if (fxCanvas.style) Object.assign(fxCanvas.style, { position: 'absolute', left: '0', bottom: '0', pointerEvents: 'none', zIndex: '42', imageRendering: 'pixelated' });
    releaseFxCanvas();
    hostEl.appendChild(fxCanvas);

    // ── 右侧角落微缩像素栖息地摆件（图层 z-index:14 在双宠背后，仅状态切换绘制 1 帧，日常 0fps）──
    const habitatCanvas = markNoTrOwned(doc.createElement('canvas'));
    habitatCanvas.className = 'ag-v2-habitat-prop';
    habitatCanvas.setAttribute('aria-hidden', 'true');
    if (habitatCanvas.style) Object.assign(habitatCanvas.style, { position: 'absolute', right: '10px', bottom: '2px', width: '24px', height: '30px', pointerEvents: 'none', zIndex: '14', imageRendering: 'pixelated' });
    hostEl.appendChild(habitatCanvas);
    let habitatPreview = 'auto';
    let scheduleWatchUntil = 0;
    let lastHabitatKey = '';
    const resolveHabitatMode = () => {
      if (habitatPreview !== 'auto') return habitatPreview;
      if (Date.now() < scheduleWatchUntil) return 'hourglass';
      const h = new Date().getHours();
      return h >= 23 || h < 5 ? 'lamp' : 'cactus';
    };
    const renderHabitatProp = (force = false) => {
      if (isVramSleepState()) return;
      const mode = resolveHabitatMode();
      const key = `${mode}:${dpr}`;
      if (!force && key === lastHabitatKey && habitatCanvas.width > 0 && habitatCanvas.height > 0) return;
      lastHabitatKey = key;
      const cssW = 24;
      const cssH = 30;
      habitatCanvas.width = round(cssW * dpr);
      habitatCanvas.height = round(cssH * dpr);
      const ctx = habitatCanvas._ctx || (habitatCanvas._ctx = habitatCanvas.getContext('2d'));
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.imageSmoothingEnabled = false;
      const propKey = mode === 'lamp' ? 'habLamp' : mode === 'hourglass' ? 'habHourglass' : 'habCactus';
      const spr = PROPS[propKey];
      if (!spr) return;
      const cell = 3;
      const hCells = spr.rows.length;
      const oy = max(0, floor(cssH / cell) - hCells);
      drawLayerSet(ctx, 0, oy, cell, PALETTES.clawd, [spr]);
      habitatCanvas.setAttribute('data-habitat-mode', mode);
    };
    renderHabitatProp(true);

    const zeroCv = (cv, drop) => {
      if (!cv) return;
      cv.width = cv.height = 0;
      if (drop) {
        cv._ctx = null;
        if (cv.__agRotOff) { zeroCv(cv.__agRotOff, 1); cv.__agRotOff = null; }
      }
    };
    const rmNode = (n) => {
      if (!n) return;
      if (isFn(n.remove)) n.remove();
      else if (n.parentNode?.removeChild) n.parentNode.removeChild(n);
      else if (hostEl?.removeChild) try { hostEl.removeChild(n); } catch {}
    };
    const resizeStageCvs = () => {
      for (const a of activeMainActors()) {
        if (a?.canvas) { a.canvas.width = round(CANVAS_W * dpr); a.canvas.height = round(CANVAS_H * dpr); }
        if (a?.lastRender) a.lastRender.poseKey = null;
      }
      for (const mc of miniCrabs) {
        if (mc.canvas) { mc.canvas.width = round(40 * dpr); mc.canvas.height = round(32 * dpr); }
        mc.lastFrameKey = null;
      }
    };

    // ── A1 VRAM 0x0 回收与唤醒恢复（document.hidden / park / hostSleep / detached） ──
    const reclaimStageVram = () => {
      if (vramReclaimed) return;
      vramReclaimed = true;
      releaseFxCanvas();
      if (habitatCanvas) { zeroCv(habitatCanvas); lastHabitatKey = ''; }
      for (const a of activeMainActors()) {
        zeroCv(a?.canvas);
        if (a?.lastRender) { a.lastRender.poseKey = null; a.lastRender.cw = a.lastRender.ch = 0; }
      }
      for (const mc of miniCrabs) { zeroCv(mc.canvas); mc.lastFrameKey = null; }
    };

    const restoreStageVram = () => {
      const mains = activeMainActors();
      const mainsOk = mains.every((a) => a.canvas && a.canvas.width > 0);
      const minisOk = !miniPileEnabled || miniCrabs.every((mc) => mc.canvas && mc.canvas.width > 0);
      if (!vramReclaimed && mainsOk && minisOk) return false;
      dpr = readDpr();
      vramReclaimed = false;
      resizeStageCvs();
      lastHabitatKey = '';
      return true;
    };

    // ── 多宠统一图腾塔拓扑、抽底重力补位与地面刚体防重叠核心 ─────────────────
    const miniById = new Map(miniCrabs.map((m) => [m.id, m]));
    const getEnt = (id) => (hasOwn(actors, id) ? actors[id] : miniById.get(id) || null);
    const isMiniEnt = (ent) => Boolean(ent?.kind === 'mini');
    const entHalfW = (ent) => (isMiniEnt(ent) ? 13 : 22);
    const mountStepH = (holderId) => (hasOwn(actors, holderId) ? 26 : 16);
    const allActiveEnts = () => (miniPileEnabled ? [...activeMainActors(), ...miniCrabs] : activeMainActors());
    const maxTowerDepthAllowed = () => activeMainActors().length + (miniPileEnabled ? miniCrabs.length : 0);

    const syncStageDpr = () => {
      const nextDpr = readDpr();
      if (nextDpr === dpr) return false;
      dpr = nextDpr;
      resizeStageCvs();
      return true;
    };

    const cleanups = [];
    const MASCOT_DRAG_ATTR = 'data-ag-cs-mascot-drag';
    const RESIZE_ATTR = 'data-ag-cs-resizing';
    let rootMascotDragAttr = false;
    const syncMascotDragRootAttr = () => {
      const anyDragging =
        !disposed &&
        (activeMainActors().some((a) => !!a.dragging) ||
          miniCrabs.some((mc) => !!mc.dragging));
      if (rootMascotDragAttr === anyDragging) return;
      rootMascotDragAttr = anyDragging;
      const htmlEl = doc?.documentElement;
      if (!htmlEl) return;
      try {
        if (anyDragging) htmlEl.setAttribute?.(MASCOT_DRAG_ATTR, '1');
        else htmlEl.removeAttribute?.(MASCOT_DRAG_ATTR);
      } catch {}
    };
    const initHostW = hostEl.clientWidth;
    let hasMeasuredHostWidth = typeof initHostW === 'number' && initHostW > 0;
    let cachedHostWidth = hasMeasuredHostWidth ? initHostW : 0;
    const isMockHostWidth = hasOwn(hostEl, 'clientWidth');
    let pdOn = false, reboundTm = null, resizeRaf = 0, pendPrevW = 0, pendNextW = 0;
    const isStageResizing = () =>
      Boolean(pdOn || (doc?.documentElement && doc.documentElement.getAttribute?.(RESIZE_ATTR) === '1'));
    const snapRot = (deg) => {
      const v = Number(deg) || 0;
      return abs(v) < 0.05 ? 0 : round(v * 100) / 100;
    };
    const applyMiniTransform = (mc, tx, ty, tz, rot = 0) => {
      const dom = mc.canvas || mc.el;
      if (!dom || !dom.style) return;
      const nextRot = snapRot(rot);
      if (mc.lastDomX !== tx || mc.lastDomY !== ty || mc.lastDomRot !== nextRot) {
        mc.lastDomX = tx;
        mc.lastDomY = ty;
        mc.lastDomRot = nextRot;
        dom.style.transform = nextRot
          ? `translate3d(${tx}px, ${ty}px, 0) rotate(${nextRot}deg)`
          : `translate3d(${tx}px, ${ty}px, 0)`;
        perfStats.domTransformWrites += 1;
      } else {
        perfStats.domTransformSkips += 1;
      }
      if (tz != null && mc.lastDomZ !== tz) {
        mc.lastDomZ = tz;
        dom.style.zIndex = tz;
      }
    };
    if (win && isFn(win.addEventListener)) {
      const onPd = () => { pdOn = true; }, onPu = () => { pdOn = false; }, pOpt = { capture: true, passive: true };
      win.addEventListener('pointerdown', onPd, pOpt);
      win.addEventListener('pointerup', onPu, pOpt);
      win.addEventListener('pointercancel', onPu, pOpt);
      win.addEventListener('blur', onPu);
      cleanups.push(() => {
        if (reboundTm) { clearTimeout(reboundTm); pendingTimers.delete(reboundTm); reboundTm = null; }
        if (resizeRaf) { try { win.cancelAnimationFrame?.(resizeRaf); } catch {} resizeRaf = 0; }
        win.removeEventListener('pointerdown', onPd, pOpt);
        win.removeEventListener('pointerup', onPu, pOpt);
        win.removeEventListener('pointercancel', onPu, pOpt);
        win.removeEventListener('blur', onPu);
      });
    }
    const maxXFor = (w) => max(8, max(96, w - 14 - (popoverRightWidth > 0 ? min(w - 150, popoverRightWidth + 16) : 0)) - 80);
    const miniZ = (m) => (yieldMode === 'peek' ? '8' : m.dragging ? '39' : m.stackedOn ? String(25 + getStackDepth(m.id) * 2) : '25');
    const syncTower = (a, now = nowMs()) => {
      if (isMiniEnt(a)) {
        const dom = a.canvas || a.el;
        if (dom) {
          const direct = syncDirectMotionDomAttr(a, dom);
          const tx = snapCoord(isFin(a.px) ? a.px : a.x, direct);
          const ty = snapCoord((a.y || 0) + (yieldMode === 'peek' && !a.dragging ? MINI_PEEK_Y : 0), direct);
          applyMiniTransform(a, tx, ty, miniZ(a), a.dragging || a.ballisticActive ? a.rot : 0);
        }
      } else {
        applyActorTransform(a, now);
      }
      for (const cid of getTowerMembers(a.id)) {
        if (cid === a.id) continue;
        const r = getEnt(cid);
        if (!r) continue;
        if (isMiniEnt(r)) {
          const dom = r.canvas || r.el;
          if (!dom) continue;
          const direct = syncDirectMotionDomAttr(r, dom);
          const tx = snapCoord(getEntWorldCx(a) - 32, direct);
          const ty = snapCoord(computeWorldFootY(r) + (yieldMode === 'peek' && !r.dragging ? PEEK_Y : 0), direct);
          r.px = tx;
          r.lastX = round(tx);
          applyMiniTransform(r, tx, ty, miniZ(r), 0);
        } else {
          applyActorTransform(r, now);
        }
      }
    };
    const freeMain = (a) => !!(a?.el && !a.dragging && !a.stackedOn);
    const applyReboundGlide = (a) => {
      if (reducedMotion) return;
      const now = nowMs();
      for (const cid of getTowerMembers(a.id)) {
        const ent = getEnt(cid);
        if (ent?.el?.style) {
          const seq = (ent.glideSeq = (ent.glideSeq || 0) + 1);
          ent.glideUntil = now + 320;
          ent.el.style.transition = 'transform 320ms cubic-bezier(.22,1,.36,1)';
          later(340, () => {
            if (!disposed && ent.glideSeq === seq && ent.el?.style && !ent.lastDomDirect && ent.el.style.transition.includes('320ms')) {
              ent.el.style.transition = '';
              ent.glideUntil = 0;
            }
          });
        }
      }
    };
    const launchRebound = (a, targetCapX) => {
      if (disposed || !freeMain(a) || !a.sideEdgeSnap || a.sidePushOriginX == null) return;
      const ox = a.sidePushOriginX;
      const fm = maxXFor(max(readStageWidth(), cachedHostWidth));
      const tx = max(8, min(ox, targetCapX, fm));
      const dist = tx - a.x;
      a.sideEdgeSnap = false; a.sidePushOriginX = null; a.sideEdgeOffset = 0; a.sideEdgeDirectUntil = 0;
      if (dist >= 28 && !reducedMotion && !findDirectRider(a.id)) {
        const vy0 = -clamp(4.4 + dist / 220, 4.6, 8.2);
        let svy = vy0, sy = 0, sb = 0, sGain = 0, sMul = 1;
        for (let t = 0; t < 160; t++) {
          svy += 0.44;
          sMul *= 0.988;
          svy *= 0.988;
          sy += svy;
          sGain += sMul;
          if (sy >= 0) {
            sy = 0;
            if (abs(svy) > 2.4 && sb < 2) {
              svy = -svy * 0.36;
              sMul *= 0.82;
              sb += 1;
            } else break;
          }
        }
        const vx0 = dist / max(1, sGain);
        startBallistic(a, vx0, vy0, { noSnap: true, reboundTargetX: tx, reboundNoBump: true });
        renderAllFrames();
      } else if (tx > a.x + 1) {
        a.x = tx;
        syncTower(a);
        applyReboundGlide(a);
      } else {
        syncTower(a);
      }
    };
    const scheduleRebound = () => {
      if (reboundTm) { clearTimeout(reboundTm); pendingTimers.delete(reboundTm); reboundTm = null; }
      reboundTm = later(120, () => {
        reboundTm = null;
        if (isStageResizing()) return;
        const fm = maxXFor(max(readStageWidth(), cachedHostWidth));
        const mains = activeMainActors();
        const list = mains
          .filter((a) => freeMain(a) && a.sideEdgeSnap && a.sidePushOriginX != null)
          .sort((u, v) => v.sidePushOriginX - u.sidePushOriginX);
        let capX = fm;
        const targets = list.map((a) => {
          const tx = clamp(capX, 8, a.sidePushOriginX);
          capX = max(8, tx - 56);
          return { a, tx };
        });
        targets.forEach(({ a, tx }, idx) => (idx ? later(55 * idx, () => launchRebound(a, tx)) : launchRebound(a, tx)));
      });
    };
    const onStageResizeReleased = () => {
      if (disposed || isStageResizing()) return;
      const mains = activeMainActors();
      const snapped = mains
        .filter((a) => freeMain(a) && a.sideEdgeSnap && a.sidePushOriginX != null)
        .sort((u, v) => v.sidePushOriginX - u.sidePushOriginX);
      if (!snapped.length) return;
      let capX = maxXFor(max(readStageWidth(), cachedHostWidth));
      let needReb = false;
      for (const a of snapped) {
        const tx = clamp(capX, 8, a.sidePushOriginX);
        capX = max(8, tx - 56);
        if (tx > a.x + 2) needReb = true;
      }
      if (needReb) {
        scheduleRebound();
      } else {
        for (const a of snapped) {
          a.sideEdgeDirectUntil = 0;
          syncDirectMotionDomAttr(a, a.el);
        }
      }
    };
    const handleStageWidthResize = (prevW, nw) => {
      if (disposed || !isFin(nw) || nw <= 0 || nw === prevW) return;
      const now = nowMs(), nextMaxX = maxXFor(nw), mains = activeMainActors(), resizingNow = isStageResizing();
      if (nw < prevW) {
        if (reboundTm) { clearTimeout(reboundTm); pendingTimers.delete(reboundTm); reboundTm = null; }
        // 快路径：主角均远离右边界时 0 计算早退
        if (!mains.some((a) => freeMain(a) && a.x >= nextMaxX - 96)) return;
        const beforeX = mains.map((a) => (a ? a.x : 0));
        const order = mains.map((_, idx) => idx).sort((i, j) => beforeX[j] - beforeX[i]);
        let capX = nextMaxX;
        for (const i of order) {
          const a = mains[i];
          if (!freeMain(a)) continue;
          if (a.x > capX) { a.x = capX; capX = max(8, capX - 1); }
          else capX = clamp(a.x - 1, 8, capX);
        }
        enforceGroundSeparation();
        for (let i = 0; i < mains.length; i++) {
          const a = mains[i];
          if (!freeMain(a)) continue;
          if (a.x < beforeX[i] - 0.5 || a.x >= nextMaxX - 4) {
            if (a.sidePushOriginX == null) a.sidePushOriginX = beforeX[i];
            a.sideEdgeSnap = true;
            a.sideEdgeOffset = max(0, nextMaxX - a.x);
            a.sideEdgeDirectUntil = now + (resizingNow ? 220 : 180);
            syncTower(a, now);
          }
        }
        return;
      }
      if (!mains.some((a) => freeMain(a) && a.sideEdgeSnap && a.sidePushOriginX != null)) return;
      let needReb = false;
      const prevMaxX = maxXFor(prevW);
      for (const a of mains) {
        if (!freeMain(a) || !a.sideEdgeSnap || a.sidePushOriginX == null) continue;
        const off = a.sideEdgeOffset || 0;
        if (!reboundTm && a.x < prevMaxX - off - 64) { a.sideEdgeSnap = false; a.sidePushOriginX = null; continue; }
        const tx = clamp(nextMaxX - off, 8, a.sidePushOriginX);
        if (resizingNow) {
          if (reboundTm) { clearTimeout(reboundTm); pendingTimers.delete(reboundTm); reboundTm = null; }
          a.sideEdgeDirectUntil = now + 220;
          a.x = tx;
          syncTower(a, now);
          if (tx >= a.sidePushOriginX - 1) { a.sideEdgeSnap = false; a.sidePushOriginX = null; a.sideEdgeOffset = 0; }
        } else {
          needReb = true;
        }
      }
      if (needReb) {
        scheduleRebound();
      }
    };
    const schedStageResize = (prevW, nw) => {
      if (!pendPrevW) pendPrevW = prevW;
      pendNextW = nw;
      if (resizeRaf) return;
      const flush = () => {
        if (disposed) return;
        resizeRaf = 0;
        const p = pendPrevW, n = pendNextW;
        pendPrevW = pendNextW = 0;
        handleStageWidthResize(p, n);
      };
      if (win && isFn(win.requestAnimationFrame)) resizeRaf = win.requestAnimationFrame(flush);
      else flush();
    };
    if (!isMockHostWidth && typeof ResizeObserver === 'function' && hostEl?.nodeType === 1) {
      try {
        const hostRo = new ResizeObserver((entries) => {
          if (disposed) return;
          const lastEntry = entries?.length ? entries[entries.length - 1] : null;
          const cr = lastEntry?.contentRect;
          // 仅读取 contentRect.width，杜绝折叠/空帧回退读 hostEl.clientWidth 触发同步回流
          const nw = cr && typeof cr.width === 'number' ? round(cr.width) : 0;
          const dprChanged = syncStageDpr();
          if (nw > 0) {
            const prevW = cachedHostWidth || 720;
            hasMeasuredHostWidth = true;
            cachedHostWidth = nw;
            if (nw !== prevW) schedStageResize(prevW, nw);
          }
          if (dprChanged) renderAllFrames();
        });
        hostRo.observe(hostEl);
        cleanups.push(() => hostRo.disconnect());
      } catch {}
    }
    const readStageWidth = () => {
      if (isMockHostWidth) return hostEl.clientWidth || 720;
      if (!hasMeasuredHostWidth) {
        const w = hostEl.clientWidth;
        if (typeof w === 'number' && w > 0) {
          cachedHostWidth = w;
          hasMeasuredHostWidth = true;
        }
      }
      return cachedHostWidth || 720;
    };

    const stageBoundsX = () => {
      const w = readStageWidth();
      const rightReserve = popoverRightWidth > 0 ? min(w - 150, popoverRightWidth + 16) : 0;
      return {
        minX: 14,
        maxX: max(96, w - 14 - rightReserve),
      };
    };

    const clampActorX = (x) => {
      const w = readStageWidth();
      const rightReserve = popoverRightWidth > 0 ? min(w - 150, popoverRightWidth + 16) : 0;
      const maxX = max(24, w - 88 - rightReserve);
      return clamp(x, 8, maxX);
    };

    const getEntWorldCx = (ent) => (isMiniEnt(ent) ? 12 + (isFin(ent.px) ? ent.px : ent.x) + 20 : ent.x + 48);
    const setEntWorldCx = (ent, cx) => {
      const { minX, maxX } = stageBoundsX();
      const hw = entHalfW(ent);
      const clamped = clamp(cx, minX + hw, maxX - hw);
      if (isMiniEnt(ent)) {
        const px = max(2, clamped - 32);
        ent.px = px;
        ent.lastX = round(px);
      } else {
        ent.x = clampActorX(clamped - 48);
      }
    };

    const findDirectRider = (holderId) => {
      for (const e of [...activeMainActors(), ...miniCrabs]) {
        if (e.stackedOn === holderId) return e;
      }
      return null;
    };

    const getStackDepth = (id) => {
      let d = 0;
      let cur = getEnt(id);
      const seen = new Set();
      while (cur?.stackedOn && !seen.has(cur.id)) {
        seen.add(cur.id);
        const base = getEnt(cur.stackedOn);
        if (!base) break;
        d += 1;
        cur = base;
      }
      return d;
    };

    const getTowerRoot = (id) => {
      let cur = getEnt(id);
      const seen = new Set();
      while (cur?.stackedOn && !seen.has(cur.id)) {
        seen.add(cur.id);
        const base = getEnt(cur.stackedOn);
        if (!base) break;
        cur = base;
      }
      return cur;
    };

    const getTowerMembers = (anyId) => {
      const root = getTowerRoot(anyId);
      if (!root) return [];
      const chain = [root.id];
      const seen = new Set(chain);
      let curId = root.id;
      while (true) {
        const next = findDirectRider(curId);
        if (!next || seen.has(next.id)) break;
        seen.add(next.id);
        chain.push(next.id);
        curId = next.id;
      }
      return chain;
    };

    const getStackTop = (anyId) => {
      const chain = getTowerMembers(anyId);
      return chain.length ? getEnt(chain[chain.length - 1]) : getEnt(anyId);
    };

    const listAllTowers = () => {
      const out = [];
      const visited = new Set();
      for (const e of allActiveEnts()) {
        if (visited.has(e.id)) continue;
        const chain = getTowerMembers(e.id);
        chain.forEach((cid) => visited.add(cid));
        if (chain.length >= 2) out.push(chain);
      }
      return out;
    };

    const computeWorldFootY = (ent) => {
      if (!ent) return 0;
      if (ent.stackedOn) {
        const seen = new Set([ent.id]);
        let cur = ent;
        let yAcc = 0;
        while (cur?.stackedOn && !seen.has(cur.stackedOn)) {
          seen.add(cur.stackedOn);
          const base = getEnt(cur.stackedOn);
          if (!base) break;
          yAcc -= mountStepH(base.id);
          cur = base;
        }
        return (cur ? cur.y || 0 : 0) + yAcc;
      }
      return ent.y || 0;
    };

    const syncAllStackedFollowers = () => {
      for (const root of allActiveEnts()) {
        if (root.stackedOn) continue;
        const chain = getTowerMembers(root.id);
        if (chain.length < 2) continue;
        const rootCx = getEntWorldCx(root);
        let yCursor = root.y || 0;
        for (let i = 1; i < chain.length; i++) {
          const prev = getEnt(chain[i - 1]);
          const rider = getEnt(chain[i]);
          if (!rider || rider.dragging) break;
          yCursor -= mountStepH(prev.id);
          setEntWorldCx(rider, rootCx);
          rider.y = yCursor;
        }
      }
    };

    const enforceGroundSeparation = (lockedId = null) => {
      const { minX, maxX } = stageBoundsX();
      const groundList = [];
      for (const e of allActiveEnts()) {
        if (e.stackedOn || e.dragging || e.ballisticActive) continue;
        if ((e.y || 0) < -3 || e.leap) continue;
        if (isMiniEnt(e) && e.act && (e.act.type === 'ride' || e.act.type === 'leap')) continue;
        groundList.push({
          id: e.id,
          ent: e,
          cx: getEntWorldCx(e),
          halfW: entHalfW(e),
          locked: e.id === lockedId,
        });
      }
      if (groundList.length >= 2) {
        resolveGroundSeparation(groundList, minX, maxX, 6);
        for (const item of groundList) {
          if (!item.locked) setEntWorldCx(item.ent, item.cx);
        }
      }
      syncAllStackedFollowers();
    };

    const spawnChromaBurst = (cx, cy, count = 12, gentle = false) => {
      for (let i = 0; i < count; i++) {
        if (chromaSparks.length >= 48) chromaSparks.shift();
        const ang = gentle
          ? -PI * (0.25 + random() * 0.5)
          : (i / max(1, count)) * PI * 2 + (random() - 0.5) * 0.18;
        const spd = gentle ? 0.6 + random() * 0.9 : 2.2 + (i % 2) * 1.15 + random() * 0.6;
        chromaSparks.push({
          x: cx + (gentle ? (random() - 0.5) * 14 : 0),
          y: cy + (gentle ? -4 - random() * 8 : 0),
          vx: cos(ang) * spd,
          vy: sin(ang) * spd - (gentle ? 0.8 : 1.1),
          life: 0,
          maxLife: gentle ? 6 : 11,
          color: CHROMA_HEX[i % CHROMA_HEX.length],
          size: gentle ? 3 : i % 3 === 0 ? 4 : 3,
        });
      }
    };

    const getRestPositions = () => {
      const mains = activeMainActors();
      const n = mains.length;
      if (n === 0) return {};
      const w = readStageWidth();
      const safeRight = popoverRightWidth > 0 ? max(185, w - popoverRightWidth - 18) : w - 12;
      const leaderX = clampActorX(safeRight - 82);
      if (n === 1) return { [mains[0].id]: leaderX };
      if (n === 2 && roster.c === 1 && roster.k === 1 && !roster.d && !roster.w && !roster.f && !roster.p) {
        const partnerX = clampActorX(leaderX - 66);
        return camp === 'claude' ? { clawd: leaderX, cat: partnerX } : { cat: leaderX, clawd: partnerX };
      }
      const lead = leaderActor() || mains[0];
      const step = min(62, max(28, floor((leaderX - 16) / max(1, n - 1))));
      const restOrder = mains.filter((a) => a !== lead);
      const pos = { [lead.id]: leaderX };
      restOrder.forEach((a, idx) => {
        pos[a.id] = clampActorX(leaderX - step * (idx + 1));
      });
      return pos;
    };

    const resetHomePositions = (animateWalk = false) => {
      const pos = getRestPositions();
      for (const id of activeMainIds()) {
        const a = actors[id];
        if (a.dragging || a.stackedOn) continue;
        a.sideEdgeSnap = false;
        a.sidePushOriginX = null;
        a.sideEdgeOffset = 0;
        a.sideEdgeDirectUntil = 0;
        const target = pos[id];
        if (animateWalk && !reducedMotion && abs(a.x - target) > 6 && a.y === 0) {
          a.overridePose = 'walk';
          a.overrideUntil = nowMs() + 380;
          a.overrideRot = 0;
        }
        a.x = target;
        if (a.y > 0) a.y = 0;
      }
      enforceGroundSeparation();
    };

    resetHomePositions(false);

    // ── 节拍序列：steps = [pose, ticks, sqW, sqH, lift] ───────────────────────
    const playSeq = (actor, steps, then) => {
      actor.seq = steps.map(([pose, ticks, sqW = 0, sqH = 0, lift = 0]) => ({ pose, ticks, sqW, sqH, lift }));
      actor.seqStartTick = tickIdx + 1;
      actor.seqThen = then || null;
    };
    const seqStep = (actor) => {
      if (!actor.seq) return null;
      let k = max(0, tickIdx - actor.seqStartTick);
      for (const st of actor.seq) {
        if (k < st.ticks) return st;
        k -= st.ticks;
      }
      actor.seq = null;
      const then = actor.seqThen;
      actor.seqThen = null;
      if (then) then();
      return null;
    };
    const seqTotalMs = (steps) => steps.reduce((s, st) => s + st[1] * TICK, 0) + TICK;

    const landingSteps = (flatTicks) => [
      ['flat', flatTicks, 2, 0],
      ['idle', 1, -2, 1],
      ['idle', 1, 2, -1],
    ];

    const hopSteps = (airPose) => [
      ['squash', 1, 2, -1, 0],
      [airPose, 1, -1, 1, -2],
      [airPose, 1, 0, 0, -4],
      [airPose, 1, 0, 0, -4],
      [airPose, 1, 0, 0, -2],
      ['idle', 1, 2, -1, 0],
    ];

    const resolvePoseFor = (actor, now) => {
      if (actor.dragging) return 'dangle';
      const st = seqStep(actor);
      if (st) return st.pose;
      if (actor.overridePose && now < actor.overrideUntil) return actor.overridePose;
      if (actor.overridePose && now >= actor.overrideUntil) {
        actor.overridePose = null;
        actor.overrideRot = 0;
        actor.mirror = false;
        actor.faceDir = null;
        actor.clipParam = null;
      }
      if (yieldMode === 'peek') return 'peek';
      const isWorker = isWorkingActor(actor);
      if (hasError && isWorker) return 'angry';
      if (streaming) {
        return isWorker ? 'write' : actor.kind === 'cat' || actor.kind === 'whale' || actor.kind === 'fox' || actor.kind === 'panda' ? 'loaf' : 'sleep';
      }
      if (dozing) return 'sleep';
      if (!isWorker && (actor.kind === 'cat' || actor.kind === 'whale' || actor.kind === 'fox' || actor.kind === 'panda') && floor(now / 9000) % 2 === 1) return 'loaf';
      return actor.pose || 'idle';
    };

    const effectiveRot = (a, now) => {
      if (a.stackedOn && a.balRot && !a.dragging) return a.balRot;
      return now < a.overrideUntil && a.overrideRot ? a.overrideRot : a.rot;
    };

    const isEntDirectMotion = (ent) => {
      if (!ent) return false;
      const now = nowMs();
      const resizingNow = isStageResizing();
      if (
        ent.dragging ||
        ent.ballisticActive ||
        ent.leap ||
        (ent.sideEdgeSnap && resizingNow) ||
        (ent.sideEdgeDirectUntil > 0 && now < ent.sideEdgeDirectUntil) ||
        (!ent.stackedOn && (ent.y || 0) < -0.4)
      ) {
        return true;
      }
      if (ent.stackedOn) {
        const root = getTowerRoot(ent.id);
        if (
          root &&
          root !== ent &&
          (root.dragging ||
            root.ballisticActive ||
            root.leap ||
            (root.sideEdgeSnap && resizingNow) ||
            (root.sideEdgeDirectUntil > 0 && now < root.sideEdgeDirectUntil) ||
            (root.y || 0) < -0.4)
        ) {
          return true;
        }
      }
      return false;
    };

    const syncDirectMotionDomAttr = (ent, domEl) => {
      if (!domEl || !domEl.style) return false;
      const direct = isEntDirectMotion(ent);
      const dragNow = !!(ent?.dragging);
      if (ent.lastDomDirect !== direct) {
        ent.lastDomDirect = direct;
        if (direct) {
          domEl.setAttribute?.('data-direct', '1');
          domEl.style.transition = 'none';
        } else {
          domEl.removeAttribute?.('data-direct');
          domEl.style.transition = '';
        }
      }
      if (ent.lastDomDrag !== dragNow) {
        ent.lastDomDrag = dragNow;
        if (dragNow) {
          domEl.setAttribute?.('data-dragging', '1');
          domEl.style.cursor = 'grabbing';
        } else {
          domEl.removeAttribute?.('data-dragging');
          domEl.style.cursor = 'grab';
        }
      }
      syncMascotDragRootAttr();
      return direct;
    };

    const snapCoord = (v, direct) => (direct ? round(v * 100) / 100 : round(v));

    const applyActorTransform = (actor, now = nowMs()) => {
      if (!actor.el) return;
      let yPx = actor.y;
      if (actor.stackedOn) {
        const root = getTowerRoot(actor.id);
        const worldCx = getEntWorldCx(root || actor);
        actor.x = clampActorX(worldCx - 48);
        yPx = computeWorldFootY(actor) + (yieldMode === 'leap' ? -leapOffsetY : yieldMode === 'peek' && !actor.dragging ? PEEK_Y : 0);
      } else if (yieldMode === 'leap' && !actor.dragging && actor.y === 0) {
        yPx -= leapOffsetY;
      } else if (yieldMode === 'peek' && !actor.dragging) {
        yPx += PEEK_Y;
      }
      const direct = syncDirectMotionDomAttr(actor, actor.el);
      const depth = actor.stackedOn ? getStackDepth(actor.id) : 0;
      const tx = snapCoord(actor.x, direct);
      const ty = snapCoord(yPx, direct);
      const tz = yieldMode === 'peek' ? '8' : actor.dragging ? '38' : depth > 0 ? String(24 + depth * 2) : '24';
      if (actor.lastDomX !== tx || actor.lastDomY !== ty) {
        actor.lastDomX = tx;
        actor.lastDomY = ty;
        actor.el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        perfStats.domTransformWrites += 1;
      } else {
        perfStats.domTransformSkips += 1;
      }
      // 60fps GPU 倾角同步到内层 canvas（外层 actor.el 维持纯 translate3d 兼容），静止 rot=0 清回 ''
      const nextRot = snapRot(inspectState ? 0 : effectiveRot(actor, now));
      if (actor.lastDomRot !== nextRot) {
        actor.lastDomRot = nextRot;
        actor.lastRender.lastRot = nextRot;
        if (actor.canvas && actor.canvas.style) {
          actor.canvas.style.transform = nextRot ? `rotate(${nextRot}deg)` : '';
        }
        perfStats.domTransformWrites += 1;
      }
      if (actor.lastDomZ !== tz) {
        actor.lastDomZ = tz;
        actor.el.style.zIndex = tz;
      }
    };

    // ── 待机微动作：随机眨眼 / 呼吸下沉 / 耳尖抖动 / 单钳开合 / 左顾右盼 ──
    const updateIdleFx = (a, pose, now) => {
      // 眨眼计时在任何姿态下推进，仅在可眨眼姿态生效；减少动态时依旧保留
      if (tickIdx >= a.nextBlinkTick) {
        a.blinkTick = tickIdx;
        a.blinkDouble = random() < 0.15;
        a.nextBlinkTick = tickIdx + ticksIn(2400, 6000) + (a.blinkDouble ? 5 : 3);
      }
      const bk = tickIdx - a.blinkTick;
      const blinkSeq = a.blinkDouble ? BLINK_DOUBLE : BLINK_SINGLE;
      const fx = {
        blinkStage: bk >= 0 && bk < blinkSeq.length ? blinkSeq[bk] : null,
        breath: false,
        earTwitch: null,
        clawSnap: null,
        glance: 0,
      };
      const idleNow = pose === 'idle' && !a.seq && !a.dragging;
      if (reducedMotion || !idleNow) {
        // 非待机期间把到期的微动作顺延，避免回到待机瞬间扎堆触发
        if (tickIdx >= a.nextBreathTick) a.nextBreathTick = tickIdx + ticksIn(800, 1800);
        if (tickIdx >= a.nextTwitchTick) a.nextTwitchTick = tickIdx + ticksIn(1500, 4000);
        if (tickIdx >= a.nextSnapTick) a.nextSnapTick = tickIdx + ticksIn(1500, 4000);
        a.glanceDir = 0;
        if (now >= a.nextGlanceAt) a.nextGlanceAt = now + rand(1500, 4000);
        return fx;
      }
      // 呼吸：每 2.8~4.2s 下沉 1 格持续 2 拍
      if (tickIdx >= a.nextBreathTick) {
        a.breathTick = tickIdx;
        a.nextBreathTick = tickIdx + ticksIn(2800, 4200);
      }
      const brk = tickIdx - a.breathTick;
      fx.breath = brk >= 0 && brk < 2;
      if (a.kind === 'cat' || a.kind === 'dragon' || a.kind === 'whale' || a.kind === 'fox' || a.kind === 'panda') {
        // 耳尖抖动 / 龙角闪光 / 鲸尾拍浪 / 狐耳微动 / 熊猫抖耳：6~10s 一次，1~2 拍
        if (tickIdx >= a.nextTwitchTick) {
          a.twitchTick = tickIdx;
          a.twitchLen = random() < 0.5 ? 1 : 2;
          a.twitchSide = random() < 0.5 ? 'L' : 'R';
          a.nextTwitchTick = tickIdx + ticksIn(6000, 10000);
        }
        const tk = tickIdx - a.twitchTick;
        if (tk >= 0 && tk < a.twitchLen) fx.earTwitch = a.twitchSide;
      }
      if (a.kind === 'clawd' || a.kind === 'dragon' || a.kind === 'whale' || a.kind === 'fox') {
        // 单钳开合 / 龙翼微振 / 鲸鳍轻摆：8~12s 一次，开-合-开-合 共 4 拍
        if (tickIdx >= a.nextSnapTick) {
          a.snapTick = tickIdx;
          a.snapSide = random() < 0.5 ? 'L' : 'R';
          a.nextSnapTick = tickIdx + ticksIn(8000, 12000);
        }
        const sk = tickIdx - a.snapTick;
        if (sk >= 0 && sk < 4 && sk % 2 === 0) fx.clawSnap = a.snapSide;
      }
      // 左顾右盼：随机方向 + 随机驻留，30% 概率回看另一侧
      if (!a.glanceDir && now >= a.nextGlanceAt) {
        a.glanceDir = random() < 0.5 ? -1 : 1;
        a.glanceUntil = now + rand(600, 1800);
        a.glanceSecond = random() < 0.3;
      }
      if (a.glanceDir && now >= a.glanceUntil) {
        if (a.glanceSecond) {
          a.glanceDir = -a.glanceDir;
          a.glanceUntil = now + rand(500, 1400);
          a.glanceSecond = false;
        } else {
          a.glanceDir = 0;
          a.nextGlanceAt = now + rand(4000, 9000);
        }
      }
      fx.glance = a.glanceDir;
      return fx;
    };

    // ── 叠叠乐平衡：下方角色（含迷你蟹）每拍位移 → 上方角色反向摆角（±8°）──
    const updateBalance = () => {
      for (const id of activeMainIds()) {
        const top = actors[id];
        const base = top.stackedOn ? getEnt(top.stackedOn) : null;
        let target = 0;
        if (base && !reducedMotion && base.prevCx != null) {
          target = max(-8, min(8, -(getEntWorldCx(base) - base.prevCx) * 4));
        }
        top.balRot = abs(target) >= abs(top.balRot) ? target : top.balRot * 0.55 + target * 0.45;
        if (abs(top.balRot) < 0.4) top.balRot = 0;
      }
      for (const e of allActiveEnts()) e.prevCx = getEntWorldCx(e);
    };

    // ── 生态联动辅助：打盹 z / 迷你蟹互动路径 ─────────────────────────────
    // 打盹符号：日间打盹冒 z（小→中→大），深夜（23:00~05:00）吹轻柔睡眠小鼻泡
    const dozeSymFor = (a) => {
      const offNight = Number(a.phaseOff) || 0;
      const offDay = (offNight * 2 + (a.kind === 'cat' ? 1 : a.kind === 'whale' ? 3 : 0)) % 18;
      if (isLateNight()) {
        if (reducedMotion) return 'sleepBubble0';
        const ph = (tickIdx + offNight) % 12;
        return ph < 6 ? 'sleepBubble0' : 'sleepBubble1';
      }
      if (reducedMotion) return 'dozeZ1';
      const ph = (tickIdx + offDay) % 18;
      return ph < 4 ? 'dozeZ0' : ph < 8 ? 'dozeZ1' : ph < 12 ? 'dozeZ2' : null;
    };
    const crabRiding = () =>
      miniPileEnabled && miniCrabs.some((mc) => mc.act && mc.act.type === 'ride' && tickIdx >= mc.act.start);

    // 迷你蟹分段路径求值：返回 { x, y, sprite, mirror, hopPx }；未激活或结束返回 null
    const miniActPose = (mc, baseSprite, anim) => {
      const act = mc.act;
      if (!act) return null;
      const t = tickIdx - act.start;
      if (t < 0) return null;
      let k0 = t;
      let segIdx = -1;
      for (let i = 0; i < act.segs.length; i++) {
        if (k0 < act.segs[i].ticks) {
          segIdx = i;
          break;
        }
        k0 -= act.segs[i].ticks;
      }
      if (segIdx < 0 || (act.abort && act.abort(segIdx))) {
        mc.act = null;
        if (segIdx >= 0 && act.onAbort) act.onAbort();
        return null;
      }
      const seg = act.segs[segIdx];
      const k = (k0 + 1) / seg.ticks;
      const x = seg.x0 + (seg.x1 - seg.x0) * k;
      const y = seg.y0 + (seg.y1 - seg.y0) * k - (seg.arc || 0) * sin(PI * k);
      if (seg.x1 !== seg.x0) mc.mirror = seg.x1 < seg.x0;
      else if (seg.face) mc.mirror = seg.face < 0;
      const still = MINI_SPRITES[mc.id];
      const blinking = tickIdx - mc.blinkAt >= 0 && tickIdx - mc.blinkAt < 2;
      let sprite;
      if (seg.sprite === 'walk') sprite = tickIdx % 2 ? anim.walkB : still;
      else if (seg.sprite === 'trick') sprite = anim.trick;
      else if (seg.sprite === 'wave') sprite = reducedMotion || k0 % 4 < 2 ? anim.trick : still;
      else if (seg.sprite === 'sit') sprite = k0 >= 8 && k0 < 14 && k0 % 4 < 2 ? anim.trick : blinking ? miniBlinkFrame(still) : still;
      else sprite = blinking ? miniBlinkFrame(still) : still;
      return {
        x: round(x),
        y: round(y / 2) * 2,
        sprite: sprite || baseSprite,
        mirror: mc.mirror,
        hopPx: seg.hop && !reducedMotion && k0 % 4 < 2 ? -2 : 0,
      };
    };

    // 迷你蟹坐标：translateX 相对迷你堆左缘（宿主 left 12px），精灵中心在画布 20px 处
    const crabHostCenter = (mc) => 12 + mc.lastX + 20;
    const crabSafeX = (x) => min(clampActorX(9999) - 132, max(2, round(x)));
    const crabMaxX = () => max(40, readStageWidth() - 52);
    const nearestFreeCrab = (hx) =>
      miniCrabs
        .filter((mc) => !mc.act || tickIdx - mc.act.start < 0)
        .sort((m1, m2) => abs(crabHostCenter(m1) - hx) - abs(crabHostCenter(m2) - hx))[0] || null;
    const actorFree = (a, now) =>
      !a.dragging && !a.ballisticActive && !a.stackedOn && !a.seq && a.y === 0 && !(a.overridePose === 'dangle' && now < a.overrideUntil);

    // 迎宾：三蟹集体挥手（复用 trick 帧，错峰 2 拍起手）
    const crabsWave = () => {
      if (!miniPileEnabled) return;
      miniCrabs.forEach((mc, idx) => {
        if (mc.act && mc.act.type === 'ride') return;
        const x = crabSafeX(mc.lastX);
        mc.act = {
          type: 'wave',
          start: tickIdx + 1 + idx * 2,
          segs: [{ ticks: 14, x0: x, x1: x, y0: 0, y1: 0, sprite: 'wave', hop: true }],
        };
      });
    };

    // 抛掷落地砸在蟹附近：受惊跳开 → 定住 → 慢慢走回原位
    const scatterCrabsNear = (hx) => {
      if (!miniPileEnabled || reducedMotion) return;
      miniCrabs.forEach((mc, idx) => {
        if (mc.act && mc.act.type === 'ride') return;
        const d = crabHostCenter(mc) - hx;
        if (abs(d) >= 64) return;
        const dir = d >= 0 ? 1 : -1;
        const x0 = crabSafeX(mc.lastX);
        const far = max(0, min(crabMaxX(), x0 + dir * 26));
        mc.act = {
          type: 'scatter',
          start: tickIdx + (idx % 2),
          segs: [
            { ticks: 5, x0, x1: far, y0: 0, y1: 0, arc: 6, sprite: 'walk' },
            { ticks: 4, x0: far, x1: far, y0: 0, y1: 0, sprite: 'still', face: -dir },
            { ticks: 9, x0: far, x1: x0, y0: 0, y1: 0, sprite: 'walk' },
          ],
        };
      });
    };

    let crabSerial = 0;
    // 小猫追蟹：一只迷你蟹跑到猫（或任意在场主宠）跟前挑衅 → 惊觉追几步 → 蟹逃回原位 → 歪头
    const runCrabChase = (force) => {
      const now = nowMs();
      const cat = actors.cat || activeMainActors().find((a) => a.kind === 'cat') || activeMainActors()[0];
      if (!cat || !miniPileEnabled || reducedMotion || dozing || !actorFree(cat, now)) return false;
      if (!force && stageBusy()) return false;
      const mc = nearestFreeCrab(cat.x + 48);
      if (!mc) return false;
      const x0 = crabSafeX(mc.lastX);
      const crabLeft = x0 + 20 + 12 < cat.x + 48;
      const tx = max(0, min(crabMaxX(), crabLeft ? cat.x - 26 : cat.x + 58));
      const catDir = crabLeft ? -1 : 1;
      const dist = abs(tx - x0);
      const approach = clamp(round(dist / 7), 3, 36);
      const flee = clamp(round(dist / 10), 4, 28);
      const act = {
        type: 'chase',
        start: tickIdx + 1,
        segs: [
          { ticks: approach, x0, x1: tx, y0: 0, y1: 0, sprite: 'walk' },
          { ticks: 6, x0: tx, x1: tx, y0: 0, y1: 0, sprite: 'wave', face: -catDir },
          { ticks: flee, x0: tx, x1: x0, y0: 0, y1: 0, sprite: 'walk', hop: true },
        ],
      };
      mc.act = act;
      const serial = (crabSerial += 1);
      const alive = () => serial === crabSerial && !disposed && !reducedMotion && actors[cat.id] === cat && !cat.dragging && !cat.stackedOn && !dozing;
      const t0 = (approach + 1) * TICK;
      later(t0, () => {
        if (!alive()) return;
        startClip(cat, 'wow', 500, { sym: 'bang' });
        renderAllFrames();
      });
      later(t0 + 500, () => {
        if (!alive()) return;
        startClip(cat, 'walk', 1200, { patrolDir: catDir, mirror: catDir > 0, sym: 'spark', symDurationMs: 600 });
      });
      later(t0 + 1750, () => {
        if (!alive()) return;
        startClip(cat, 'tilt', 900, { rot: -9, sym: 'q' });
        renderAllFrames();
      });
      later(t0 + 2750, () => {
        if (alive() && !stageBusy()) resetHomePositions(true);
      });
      return true;
    };

    // 迷你蟹骑头：走到 Clawd（或任意在场主宠）脚边 → 整格弧线跳上头顶坐一会儿（中途挥手）→ 跳下走回
    const runCrabRide = (force) => {
      const now = nowMs();
      const clawd = actors.clawd || activeMainActors().find((a) => a.kind === 'clawd') || activeMainActors()[0];
      if (!clawd || !miniPileEnabled || reducedMotion || dozing || yieldMode !== 'none') return false;
      if (!actorFree(clawd, now) || findDirectRider(clawd.id)) return false;
      if (!force && stageBusy()) return false;
      const mc = nearestFreeCrab(clawd.x + 48);
      if (!mc) return false;
      const x0 = crabSafeX(mc.lastX);
      const clawdX0 = clawd.x;
      // Clawd 头顶（y=0 行顶边）距宿主底 33px，迷你蟹脚底距宿主底 11px → 上移 22px；水平居中对齐 48px / 20px
      const headX = round(clawd.x + 16);
      const headY = -22;
      const side = x0 + 32 < clawd.x + 48 ? -1 : 1;
      const sideX = max(0, min(crabMaxX(), headX + side * 36));
      const approach = max(1, min(36, round(abs(sideX - x0) / 7)));
      const SIT = 22;
      const act = {
        type: 'ride',
        start: tickIdx + 1,
        segs: [
          { ticks: approach, x0, x1: sideX, y0: 0, y1: 0, sprite: 'walk' },
          { ticks: 4, x0: sideX, x1: headX, y0: 0, y1: headY, arc: 10, sprite: 'trick' },
          { ticks: SIT, x0: headX, x1: headX, y0: headY, y1: headY, sprite: 'sit', face: -side },
          { ticks: 4, x0: headX, x1: sideX, y0: headY, y1: 0, arc: 8, sprite: 'trick' },
          { ticks: max(2, approach), x0: sideX, x1: x0, y0: 0, y1: 0, sprite: 'walk' },
        ],
        // 宿主被拖走 / 移除 / 起飞 / 位移 / 叠叠乐时，蟹立即放弃骑头回到原位
        abort: (segIdx) =>
          segIdx >= 1 &&
          segIdx <= 3 &&
          (actors[clawd.id] !== clawd ||
            clawd.dragging ||
            clawd.stackedOn ||
            findDirectRider(clawd.id) ||
            clawd.y !== 0 ||
            abs(clawd.x - clawdX0) > 2 ||
            yieldMode !== 'none' ||
            dozing),
        onAbort: () => {
          if (clawd.overridePose === 'carry') clawd.overrideUntil = 0;
        },
      };
      mc.act = act;
      const tLand = (1 + approach + 4) * TICK;
      later(tLand, () => {
        if (mc.act !== act || actors[clawd.id] !== clawd) return;
        startClip(clawd, 'carry', SIT * TICK + 60);
        renderAllFrames();
      });
      later(tLand + (SIT + 4) * TICK, () => {
        if (mc.act !== act || actors[clawd.id] !== clawd) return;
        startClip(clawd, 'happy', 700, { sym: 'spark' });
        renderAllFrames();
      });
      return true;
    };

    // 舞台棱镜像素星屑渲染器（无粒子时自动缩回 0×0 释放 GPU 显存纹理，0 常驻开销）
    const stepAndPaintChromaFx = () => {
      if (!chromaSparks.length) {
        if (!fxCanvasCleared || fxCanvas.width || fxCanvas.height) releaseFxCanvas();
        return;
      }
      fxCanvasCleared = false;
      const wCss = max(240, readStageWidth());
      const hCss = 160;
      const tw = round(wCss * dpr);
      const th = round(hCss * dpr);
      if (fxCanvas.style?.display === 'none') fxCanvas.style.display = '';
      if (fxCanvas.width !== tw || fxCanvas.height !== th) {
        fxCanvas.width = tw;
        fxCanvas.height = th;
        if (fxCanvas.style) { fxCanvas.style.width = `${wCss}px`; fxCanvas.style.height = `${hCss}px`; }
      }
      const ctx = fxCanvas._ctx || (fxCanvas._ctx = fxCanvas.getContext('2d'));
      if (!ctx) { chromaSparks.length = 0; releaseFxCanvas(); return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, wCss, hCss);
      ctx.imageSmoothingEnabled = false;
      for (let i = chromaSparks.length - 1; i >= 0; i--) {
        const sp = chromaSparks[i];
        sp.life += 1;
        if (sp.life > sp.maxLife) { chromaSparks.splice(i, 1); continue; }
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.28;
        ctx.fillStyle = sp.life % 3 === 1 ? '#FFFFFF' : sp.color;
        ctx.fillRect(round(sp.x / PX) * PX, round((hCss - 8 + sp.y) / PX) * PX, sp.size, sp.size);
      }
      if (!chromaSparks.length) releaseFxCanvas();
    };

    let lastChromaStepTick = -1;
    const renderAllFrames = (now = nowMs()) => {
      if (isVramSleepState()) {
        reclaimStageVram();
        return;
      }
      restoreStageVram();
      syncStageDpr();
      renderHabitatProp(false);
      if (prismaticCoat && !reducedMotion && !dozing && lastChromaStepTick !== tickIdx) {
        lastChromaStepTick = tickIdx;
        if (tickIdx % 3 === 0) {
          chromaPhase = (chromaPhase + 1 / 12) % 1;
        }
      }
      syncAllStackedFollowers();

      for (const id of activeMainIds()) {
        const a = actors[id];
        if (!a || !a.canvas) continue;
        let pose = resolvePoseFor(a, now);
        const st = seqStep(a);

        // 待机巡逻位移（每拍定步推进，底下散步时稳稳驮着头顶整串伙伴同步移动）
        if (pose === 'walk' && !a.dragging && !a.stackedOn && !a.leap && now < a.overrideUntil && !reducedMotion && a.walkStepTick !== tickIdx) {
          a.walkStepTick = tickIdx;
          const stepPx = now < a.passBoostUntil ? 1.4 * 1.55 : 1.4;
          a.x = clampActorX(a.x + a.patrolDir * stepPx);
          if (a.x <= 12 || a.x >= clampActorX(9999) - 2) a.patrolDir *= -1;
          syncAllStackedFollowers();
        }

        // 自动搭便车超时后轻巧侧跳落地
        if (a.stackedOn && a.perchUntil > 0 && now >= a.perchUntil && !a.dragging) {
          a.perchUntil = 0;
          const prevY = computeWorldFootY(a);
          const jumpDir = a.kind === 'cat' ? 1 : -1;
          a.stackedOn = null;
          resetActorTransient(a, { keepFly: true });
          a.y = prevY;
          startBallistic(a, jumpDir * 2.8, -3.6, { noSnap: true });
        }

        // 主动抛物线撑跳越过 / 搭便车跃上（Leapfrog / AutoPerch，峰值 ~26px）
        if (a.leap && !a.dragging) {
          const lp = a.leap;
          const k = min(1, (tickIdx - lp.startTick + 1) / max(1, lp.ticks));
          const cx = lp.cx0 + (lp.cx1 - lp.cx0) * k;
          setEntWorldCx(a, cx);
          a.y = -round(lp.peak * sin(PI * k));
          pose = k < 1 ? 'spinHop' : 'idle';
          if (k >= 1) {
            a.leap = null;
            a.y = 0;
            if (lp.landOnto) {
              const holder = getEnt(lp.landOnto);
              if (holder && !holder.dragging && getTowerMembers(holder.id).length < maxTowerDepthAllowed()) {
                a.stackedOn = holder.id;
                a.perchUntil = now + 7600;
                a.sym = 'heart';
                a.symUntil = now + 1000;
                playSeq(a, [['happy', 1, 2, -1, 0]]);
                syncAllStackedFollowers();
              } else {
                playSeq(a, [['idle', 1, 2, -1, 0]]);
                enforceGroundSeparation();
              }
            } else {
              playSeq(a, [['idle', 1, 2, -1, 0]]);
              enforceGroundSeparation();
            }
          }
          syncAllStackedFollowers();
        }

        // 叠叠乐上层失衡：张钳/张爪
        if (a.stackedOn && pose === 'idle' && abs(a.balRot) > 1.5) pose = 'balance';

        const sym =
          inspectState
            ? inspectState.sym || null
            : a.sym && now < a.symUntil
              ? a.sym
              : dozing && pose === 'sleep'
                ? dozeSymFor(a)
                : pose === 'sleep' || pose === 'loaf'
                  ? tickIdx % 8 < 4
                    ? 'z1'
                    : 'z2'
                  : pose === 'angry'
                    ? 'vein'
                    : null;
        const localTick = inspectState
          ? inspectState.tick
          : pose === 'write'
            ? streamTier >= 3
              ? tickIdx
              : floor(tickIdx / 2)
            : tickIdx;
        const fx = updateIdleFx(a, pose, now);
        a.lastFx = fx;
        const hasRider = Boolean(findDirectRider(id));
        const effectivePose = inspectState ? inspectState.pose : hasRider && pose === 'idle' ? 'squash' : pose;
        const sulkJitter = effectivePose === 'sulk' && !reducedMotion && !inspectState ? (tickIdx % 4 < 2 ? 0 : -PX) : 0;
        const liftPx = st?.lift && !reducedMotion ? st.lift * PX : 0;
        const nodOffset = (now < a.nodUntil ? a.nodY : 0) + sulkJitter + liftPx;
        let sqW = inspectState ? inspectState.sqW : st ? st.sqW : 0;
        let sqH = inspectState ? inspectState.sqH : st ? st.sqH : 0;
        if (!inspectState && !st && hasRider && pose !== 'idle') sqH = -1;
        a.lastSq = { w: sqW, h: sqH };
        const ftk = tickIdx - a.forceTwitchStart;
        const forcedTwitch = ftk >= 0 && ftk < 4 && ftk !== 2 ? a.forceTwitchSide : null;

        const crystalActive = id === 'clawd' && orchestrator && !hasRider && !crabRiding();
        const layers = buildClipLayers(a.kind, effectivePose, localTick, {
          clipTick: inspectState ? inspectState.tick : max(0, tickIdx - a.clipStartTick),
          sym,
          blinkStage: inspectState ? null : fx.blinkStage,
          breath: inspectState ? false : fx.breath,
          earTwitch: inspectState ? null : forcedTwitch || fx.earTwitch,
          clawSnap: inspectState ? null : fx.clawSnap,
          clipParam: a.clipParam,
          reduced: reducedMotion,
          crystal: crystalActive,
          crystalBob: !reducedMotion && floor(tickIdx / 6) % 2 === 1,
          eyeScan: inspectState ? 0 : a.eyeScan || fx.glance,
          noShadow: a.dragging || a.y < -2 || !!a.stackedOn,
          dir: a.faceDir || (a.vx < 0 || a.patrolDir < 0 ? 'left' : 'right'),
        });

        const isChromaCat = a.kind === 'cat' && prismaticCoat;
        const phaseBucket = isChromaCat ? round(chromaPhase * 12) : 0;
        const earSparkPhase = isChromaCat ? floor(tickIdx / 2) % 10 : -1;
        if (
          isChromaCat &&
          !reducedMotion &&
          (a.dragging || a.leap || a.y < -3 || (st?.lift) || (effectivePose === 'walk' && now < a.overrideUntil))
        ) {
          spawnChromaBurst(getEntWorldCx(a), computeWorldFootY(a) - 6, 1, true);
        }

        const flip = inspectState ? inspectState.mirror : !!a.mirror;
        const rulerOn = !!(inspectState?.ruler);
        let bLv = 0;
        let bDir = 0;
        if (!inspectState && rim.on) {
          const dx = getEntWorldCx(a) - rim.x;
          const fy = a.stackedOn ? computeWorldFootY(a) : (a.y || 0);
          bLv = round(rim.s * max(0, 1 - abs(dx) / 240) * max(0, 1 - abs(fy) / 48) * 12);
          if (bLv > 0) bDir = clamp(round(-dx / 55), -2, 2);
        }
        const tintState = `${a.kind}:${crystalActive ? 1 : 0}:${rulerOn ? 1 : 0}:${isChromaCat ? `p${phaseBucket}_${earSparkPhase}` : '0'}${bLv ? `:r${bLv}_${bDir}_${rim.t}_${rim.d ? 1 : 0}` : ''}`;
        const snappedTy = round(Number(nodOffset || 0) / PX) * PX;
        const frameIdx = computeLayersFrameIdx(layers);
        const rc = a.lastRender;
        // 像素层仅在精灵帧/朝向/表情/挤压/尺寸等真实像素内容变化时重绘，物理位移与倾角 rot 由 GPU transform 实时驱动
        if (
          rc.poseKey === effectivePose &&
          rc.frameIdx === frameIdx &&
          rc.flip === flip &&
          rc.tintState === tintState &&
          rc.tyPx === snappedTy &&
          rc.sqW === sqW &&
          rc.sqH === sqH &&
          rc.cw === a.canvas.width &&
          rc.ch === a.canvas.height
        ) {
          perfStats.canvasSkips += 1;
        } else {
          rc.poseKey = effectivePose;
          rc.frameIdx = frameIdx;
          rc.flip = flip;
          rc.tintState = tintState;
          rc.tyPx = snappedTy;
          rc.sqW = sqW;
          rc.sqH = sqH;
          rc.cw = a.canvas.width;
          rc.ch = a.canvas.height;
          const colorResolver = isChromaCat
            ? (ch, gx, gy, pal) =>
                ch === '#'
                  ? evalChromaColorAt(gx, gy, chromaPhase, false)
                  : ch === 's'
                    ? evalChromaColorAt(gx, gy, chromaPhase, true)
                    : pal[ch]
            : null;
          const overlayPainter =
            rulerOn || (isChromaCat && (earSparkPhase < 3 || (earSparkPhase >= 5 && earSparkPhase < 8)))
              ? (c2, oxG, oyG, pxS) => {
                  if (isChromaCat && (earSparkPhase < 3 || (earSparkPhase >= 5 && earSparkPhase < 8))) {
                    const leftEar = earSparkPhase < 3;
                    const sx = (oxG + (leftEar ? 2 : 13)) * pxS;
                    const sy = (oyG - 3) * pxS;
                    c2.fillStyle = '#FFFFFF';
                    c2.fillRect(sx, sy, pxS, pxS);
                    if (earSparkPhase === 1 || earSparkPhase === 6) {
                      c2.fillRect(sx - pxS, sy, pxS, pxS);
                      c2.fillRect(sx + pxS, sy, pxS, pxS);
                      c2.fillRect(sx, sy - pxS, pxS, pxS);
                      c2.fillRect(sx, sy + pxS, pxS, pxS);
                    }
                  }
                  if (rulerOn) {
                    const y9 = (oyG + 10) * pxS - 1;
                    c2.fillStyle = 'rgba(234,67,53,0.92)';
                    c2.fillRect(0, y9, (oxG + 20) * pxS, 1);
                  }
                }
              : null;
          const rimPainter =
            bLv > 0
              ? (c2, cw, oxG, oyG, pxS) => {
                  if (typeof c2.createRadialGradient !== 'function') return;
                  const p = RIM_PALS[rim.t] || RIM_PALS.default;
                  const o = rim.d ? 0 : 2;
                  const lv = (bLv / 12) * (rim.d ? 1 : 0.65);
                  const by = (oyG + 10) * pxS;
                  const gx = (oxG + 8) * pxS + bDir * 9;
                  const paint = (yy, r, h, s0, s1) => {
                    const g = c2.createRadialGradient(gx, yy, 0, gx, yy, r);
                    g.addColorStop(0, s0);
                    if (s1) g.addColorStop(0.5, s1);
                    g.addColorStop(1, `rgba(${p[o + (s1 ? 1 : 0)]},0)`);
                    c2.fillStyle = g;
                    c2.fillRect(0, max(0, by - h), cw, h);
                  };
                  c2.save();
                  c2.globalCompositeOperation = 'source-atop';
                  paint(by + 2, 34, 30, `rgba(${p[o]},${(0.36 * lv).toFixed(3)})`, `rgba(${p[o + 1]},${(0.16 * lv).toFixed(3)})`);
                  paint(by, 26, pxS, `rgba(${p[o]},${(0.3 * lv).toFixed(3)})`, '');
                  c2.restore();
                }
              : null;
          renderPixelLayers(a.canvas, dpr, OX, OY, PX, PALETTES[a.kind], layers, {
            ctx: a._ctx,
            mirror: flip,
            tyPx: snappedTy,
            sqW,
            sqH,
            rotDeg: 0,
            colorResolver,
            overlayPainter,
            rimPainter,
          });
          perfStats.canvasDraws += 1;
        }
      }

      const nextMiniDisplay = miniPileEnabled ? 'flex' : 'none';
      if (lastMiniDisplay !== nextMiniDisplay) {
        lastMiniDisplay = nextMiniDisplay;
        miniGroupEl.style.display = nextMiniDisplay;
      }
      if (miniPileEnabled) {
        const safeRight = max(48, (stageBoundsX().maxX || 680) - 48);
        if (!reducedMotion && !dozing && yieldMode !== 'peek' && lastCrabStepTick !== tickIdx) {
          lastCrabStepTick = tickIdx;
          const freeCorridorCrabs = miniCrabs.filter((mc) => !mc.dragging && !mc.ballisticActive && !mc.stackedOn && !mc.leap && mc.y === 0);
          const crabEvs = stepMiniCrabCorridor(freeCorridorCrabs, {
            minX: 2,
            maxX: safeRight,
            contactDist: 26,
            nowTick: tickIdx,
          });
          if (crabEvs.length) {
            recordInteraction(crabEvs[0].type, crabEvs[0].pair, now);
          }
        }
        syncAllStackedFollowers();
        miniCrabs.forEach((mc, idx) => {
          const anim = MINI_ANIM_FRAMES[mc.id];
          const moving = !reducedMotion && !dozing && yieldMode !== 'peek';

          // 自动搭便车超时后轻巧侧跳落地
          if (mc.stackedOn && mc.perchUntil > 0 && now >= mc.perchUntil && !mc.dragging) {
            mc.perchUntil = 0;
            const prevY = computeWorldFootY(mc);
            const jumpDir = idx % 2 === 0 ? -1 : 1;
            mc.stackedOn = null;
            mc.y = prevY;
            startMiniBallistic(mc, jumpDir * 2.8, -3.6, { noSnap: true });
          }

          // 抛物线撑跳越过推进
          if (mc.leap && !mc.dragging) {
            const lp = mc.leap;
            const k = min(1, (tickIdx - lp.startTick + 1) / max(1, lp.ticks));
            const cx = lp.cx0 + (lp.cx1 - lp.cx0) * k;
            setEntWorldCx(mc, cx);
            mc.y = -round(lp.peak * sin(PI * k));
            if (k >= 1) {
              mc.leap = null;
              mc.y = 0;
              if (lp.landOnto) {
                const holder = getEnt(lp.landOnto);
                if (holder && !holder.dragging && getTowerMembers(holder.id).length < maxTowerDepthAllowed()) {
                  mc.stackedOn = holder.id;
                  mc.perchUntil = now + 7200;
                  syncAllStackedFollowers();
                } else {
                  enforceGroundSeparation();
                }
              } else {
                enforceGroundSeparation();
              }
            }
          }

          const cycle = (tickIdx + idx * 7) % 24;
          const isTrick = moving && !mc.stackedOn && cycle >= 18;
          const inBump = moving && tickIdx < mc.bumpUntilTick;
          const inPassHop = moving && tickIdx < mc.passHopUntilTick;
          let sprite = mc.dragging
            ? tickIdx % 2 === 0
              ? anim.walkB
              : MINI_SPRITES[mc.id]
            : mc.leap
              ? anim.trick
              : mc.stackedOn
                ? cycle >= 20
                  ? anim.trick
                  : MINI_SPRITES[mc.id]
                : inBump
                  ? anim.trick
                  : isTrick && !inPassHop
                    ? anim.trick
                    : moving && tickIdx % 4 >= 2
                      ? anim.walkB
                      : MINI_SPRITES[mc.id];
          if (tickIdx >= mc.nextBlink) {
            mc.blinkAt = tickIdx;
            mc.nextBlink = tickIdx + ticksIn(2600, 6500);
          }
          if (!mc.dragging && tickIdx - mc.blinkAt >= 0 && tickIdx - mc.blinkAt < 2 && !isTrick && !inBump) {
            sprite = miniBlinkFrame(sprite);
          }
          const tc = cycle - 18;
          let hopPx = 0;
          if (!mc.dragging && !mc.stackedOn && !mc.leap) {
            if (inPassHop) {
              const rem = mc.passHopUntilTick - tickIdx;
              hopPx = rem === 2 || rem === 3 ? -4 : -2;
            } else if (inBump) {
              hopPx = -2;
            } else if (moving) {
              const hopCells = isTrick
                ? tc === 1 || tc === 2
                  ? -1
                  : 0
                : (tickIdx + idx * 3) % 14 === 0
                  ? -1
                  : 0;
              hopPx = hopCells * 2;
            }
          }

          const actPos = !mc.dragging && !mc.stackedOn && !mc.leap ? miniActPose(mc, sprite, anim) : null;
          const targetSprite = actPos ? actPos.sprite : sprite;
          const targetMirror = actPos ? !!actPos.mirror : !!(moving && mc.dir < 0);
          const targetTy = actPos ? actPos.hopPx : hopPx;
          const mcDirect = syncDirectMotionDomAttr(mc, mc.canvas);
          let targetX;
          let targetY;
          if (mc.stackedOn && !mc.dragging) {
            const root = getTowerRoot(mc.id);
            const wCx = getEntWorldCx(root || mc);
            targetX = snapCoord(wCx - 32, mcDirect);
            targetY = snapCoord(computeWorldFootY(mc) + (yieldMode === 'peek' ? PEEK_Y : 0), mcDirect);
            mc.px = targetX;
            mc.lastX = round(targetX);
          } else if (actPos) {
            targetX = actPos.x;
            targetY = actPos.y;
            if (actPos.y === 0) {
              mc.lastX = clamp(actPos.x, 2, safeRight);
              mc.px = mc.lastX;
            }
          } else {
            const rawX = mc.dragging
              ? mc.px
              : moving
                ? clamp(mc.px, 2, safeRight)
                : clamp(mc.px ?? mc.x, 2, safeRight);
            targetX = snapCoord(rawX, mcDirect);
            targetY = snapCoord((mc.y || 0) + (yieldMode === 'peek' && !mc.dragging && !mc.stackedOn && !mc.leap ? MINI_PEEK_Y : 0), mcDirect);
            mc.lastX = round(targetX);
          }

          const mz = miniZ(mc);
          const mKey = `${computeLayersFrameIdx([targetSprite])}|${targetMirror ? 1 : 0}|${targetTy}|${mc.canvas.width}`;
          if (mc.lastFrameKey !== mKey) {
            mc.lastFrameKey = mKey;
            renderPixelLayers(mc.canvas, dpr, 2, 5, 2, PALETTES[mc.id], [targetSprite], {
              ctx: mc._ctx,
              mirror: targetMirror,
              tyPx: targetTy,
            });
          }
          applyMiniTransform(mc, targetX, targetY, mz, mc.dragging || mc.ballisticActive ? mc.rot : 0);
        });
      } else {
        miniCrabs.forEach((mc) => {
          mc.act = null;
          mc.stackedOn = null;
          mc.dragging = false;
          mc.ballisticActive = false;
          mc.rot = 0;
          mc.y = 0;
        });
        syncMascotDragRootAttr();
      }

      const draggingMain = activeMainActors().find((a) => a.dragging);
      enforceGroundSeparation(
        draggingMain ? draggingMain.id : (miniCrabs.find((m) => m.dragging) || {}).id || null
      );
      // 二次刷新被防重叠微调后的 DOM transform（若未变则自动命中缓存 0 写入）
      for (const a of activeMainActors()) applyActorTransform(a, now);
      if (miniPileEnabled) {
        const miniPeekY = yieldMode === 'peek' ? MINI_PEEK_Y : 0;
        for (const mc of miniCrabs) {
          if (!mc.dragging && !mc.ballisticActive && !mc.stackedOn && !mc.act && !mc.leap && mc.y === 0) {
            syncDirectMotionDomAttr(mc, mc.canvas);
            const tx = round(mc.px);
            applyMiniTransform(mc, tx, miniPeekY, null, 0);
          }
        }
      }
      stepAndPaintChromaFx();
    };

    const startClip = (actor, pose, durationMs, opts = {}) => {
      const now = nowMs();
      actor.overridePose = pose;
      actor.overrideUntil = now + durationMs;
      actor.overrideRot = opts.rot || 0;
      actor.mirror = !!opts.mirror;
      actor.faceDir = opts.face || null;
      actor.clipParam = opts.param ?? null;
      actor.clipStartTick = tickIdx;
      if (opts.sym) {
        actor.sym = opts.sym;
        actor.symUntil = now + (opts.symDurationMs || durationMs);
      }
      if (opts.patrolDir) actor.patrolDir = opts.patrolDir;
    };

    // 统一清理角色瞬态姿态/物理状态，根治交叉打断导致的残余旋转/镜像/序列卡死
    const resetActorTransient = (ent, opts = {}) => {
      if (!ent) return;
      if (!opts.keepFly) ent.flying += 1;
      if (!opts.keepBallistic) ent.ballisticActive = false;
      ent.leap = null;
      if (!opts.keepVel) {
        ent.vx = 0;
        ent.vy = 0;
      }
      ent.rot = 0;
      if (isMiniEnt(ent)) {
        if (!opts.keepAct) ent.act = null;
        return;
      }
      if (!opts.keepPose) {
        ent.overridePose = null;
        ent.overrideUntil = 0;
      }
      ent.overrideRot = 0;
      ent.balRot = 0;
      if (!opts.keepMirror) ent.mirror = false;
      ent.faceDir = null;
      ent.clipParam = null;
      if (!opts.keepSeq) {
        ent.seq = null;
        ent.seqThen = null;
      }
    };

    // 减少动态开启：中止抛掷/巡逻/序列与星屑，回到静态待机
    function freezeMotion() {
      chromaSparks.length = 0;
      releaseFxCanvas();
      for (const a of activeMainActors()) {
        const keepPose = a.overridePose && a.overridePose !== 'walk' && a.overridePose !== 'dangle';
        resetActorTransient(a, { keepPose });
        a.passBoostUntil = 0;
        if (!a.stackedOn) a.y = 0;
      }
      miniCrabs.forEach((mc) => {
        resetActorTransient(mc, { keepAct: Boolean(mc.act && mc.act.type === 'wave') });
        mc.bumpUntilTick = -1;
        mc.passHopUntilTick = -1;
        mc.cooldownTick = -1;
        if (!mc.stackedOn) {
          mc.y = 0;
          mc.px = mc.x;
          mc.lastX = mc.x;
        }
      });
      for (const a of activeMainActors()) {
        if (a.overridePose === 'carry') a.overrideUntil = 0;
      }
      resetHomePositions(false);
    }

    const toggleChromaResonance = (now, targetCat = null) => {
      prismaticCoat = !prismaticCoat;
      writeChromaSaved(prismaticCoat);
      const cat = targetCat || actors.cat || activeMainActors().find((a) => a.kind === 'cat') || leaderActor();
      if (!cat) return;
      resetActorTransient(cat);
      const catCx = getEntWorldCx(cat);
      const catFootY = computeWorldFootY(cat);
      if (prismaticCoat) {
        spawnChromaBurst(catCx, catFootY - 18, 12, false);
        playSeq(cat, hopSteps('spinHop'));
        cat.sym = 'spark';
        cat.symUntil = now + 1500;
        recordInteraction('chromaAwaken', cat.id, now);
      } else {
        spawnChromaBurst(catCx, catFootY - 16, 6, true);
        startClip(cat, 'groom', 800, { sym: 'note' });
        recordInteraction('chromaRest', cat.id, now);
      }
    };

    // ── 五段递进戳戳气鼓鼓 + 叠塔连击四下切换隐藏棱彩形态 ────────────────────
    const triggerPoke = (actor, fromPointer) => {
      if (!actor) return;
      const now = nowMs();
      markActivity();

      if (actor.kind === 'cat') {
        const towerLen = getTowerMembers(actor.id).length;
        if (towerLen >= 2 && (prismaticCoat || (chromaGates.tuned && chromaGates.forged))) {
          while (chromaTapTimes.length && now - chromaTapTimes[0] > 2600) chromaTapTimes.shift();
          chromaTapTimes.push(now);
          if (chromaTapTimes.length >= 4) {
            chromaTapTimes.length = 0;
            actor.pokeCount = 0;
            toggleChromaResonance(now, actor);
            renderAllFrames(now);
            return;
          }
          startClip(actor, 'happy', 550, { sym: 'spark' });
          renderAllFrames(now);
          return;
        }
      }

      if (now - actor.lastPokeAt > 4500) actor.pokeCount = 0;
      actor.pokeCount += 1;
      actor.lastPokeAt = now;
      const inTower = getTowerMembers(actor.id).length >= 2;

      if (actor.pokeCount === 1) {
        const firstPose =
          actor.kind === 'cat' && random() < 0.45
            ? 'groom'
            : actor.kind === 'dragon' && random() < 0.55
              ? 'dragonFlame'
              : actor.kind === 'whale' && random() < 0.55
                ? 'whaleSpout'
                : actor.kind === 'fox' && random() < 0.6
                  ? 'foxWisp'
                  : actor.kind === 'panda' && random() < 0.6
                    ? 'pandaBamboo'
                    : 'happy';
        const isSig = firstPose === 'dragonFlame' || firstPose === 'whaleSpout' || firstPose === 'foxWisp' || firstPose === 'pandaBamboo';
        startClip(actor, firstPose, isSig ? 1500 : 750, { sym: 'spark' });
        if (fromPointer && !inTower) startBallistic(actor, 0, -4.4, { anticipate: true });
      } else if (actor.pokeCount === 2) {
        // 作废第 1 击可能挂起的 200ms 延迟弹射，防止 jiggle 被滞后弹飞打断
        actor.flying += 1;
        actor.seq = null;
        startClip(actor, 'jiggle', 950, { sym: 'note' });
      } else if (actor.pokeCount === 3) {
        actor.flying += 1;
        startClip(actor, 'tilt', 1100, { rot: -9, sym: 'q' });
      } else if (actor.pokeCount === 4) {
        startClip(actor, 'wow', 950, { sym: 'bang' });
        if (fromPointer && !inTower) startBallistic(actor, 0, -3.2, { anticipate: true });
      } else {
        actor.flying += 1;
        actor.pokeCount = 0;
        startClip(actor, 'sulk', 3200, { mirror: true, sym: 'vein' });
        // 戳生气暖心彩蛋：1 秒后最近的伙伴发现你生气了，主动凑过来贴贴把你哄开心！
        const sulker = actor;
        later(950, () => {
          if (disposed || actors[sulker.id] !== sulker || sulker.overridePose !== 'sulk' || sulker.dragging) return;
          const helpers = activeMainActors().filter((o) => o !== sulker && !o.dragging && !o.stackedOn && o.y === 0);
          if (!helpers.length) return;
          const buddy = helpers.reduce((best, cur) => (abs(cur.x - sulker.x) < abs(best.x - sulker.x) ? cur : best), helpers[0]);
          const comfortPose = buddy.kind === 'panda' ? 'pandaBamboo' : buddy.kind === 'fox' ? 'foxWisp' : 'pet';
          startClip(buddy, comfortPose, 1500, { face: faceToward(buddy, sulker), sym: 'heart' });
          later(750, () => {
            if (disposed || actors[sulker.id] !== sulker || sulker.dragging) return;
            startClip(sulker, 'happy', 1100, { face: faceToward(sulker, buddy), sym: 'heart' });
            if (!reducedMotion && !sulker.stackedOn) hop(sulker, 'happy');
            recordInteraction('comfort-sulk', `${buddy.id}->${sulker.id}`);
            renderAllFrames();
          });
          renderAllFrames();
        });
      }
      renderAllFrames(now);
    };

    // ── 紧凑时间轴剧本表驱动：日常剧场 + 彩蛋 + 合演（Batch 2 Slash 剧场复用此执行器）──
    const DAILY_BASE = 'letter,plant,butterfly,walk'.split(',');
    const DAILY_POOL = {
      clawd: [...'polish,eat,stretch,spinHop,wave,yawn'.split(','), ...DAILY_BASE],
      cat: [...'groom,eatFish,chaseDot,catStretch,yawnStretch'.split(','), ...DAILY_BASE],
      dragon: [...'dragonFlame,polish,eat,stretch,spinHop,wave,yawn'.split(','), ...DAILY_BASE],
      whale: [...'whaleSpout,eatFish,spinHop,wave,yawn'.split(','), ...DAILY_BASE],
      fox: [...'foxWisp,chaseDot,catStretch,spinHop,wave,yawnStretch'.split(','), ...DAILY_BASE],
      panda: [...'pandaBamboo,eat,yawnStretch,spinHop,wave,yawn'.split(','), ...DAILY_BASE],
    };
    const DAILY_WEIGHTS = { wave: 1.3, yawn: 0.6, yawnStretch: 1.1, dragonFlame: 2.2, whaleSpout: 2.2, foxWisp: 2.4, pandaBamboo: 2.4 };
    const NIGHT_BOOST = new Set(['yawn', 'yawnStretch', 'stretch', 'catStretch']);
    const CLIP_MS = { wave: 1500, yawn: 1300, yawnStretch: 2200, dragonFlame: 2400, whaleSpout: 2400, foxWisp: 2400, pandaBamboo: 2400 };
    const isLateNight = () => {
      const h = new Date().getHours();
      return h >= 23 || h < 5;
    };
    const pickDaily = (pool) => {
      const night = isLateNight();
      const ws = pool.map((k) => (DAILY_WEIGHTS[k] ?? 1) * (night && NIGHT_BOOST.has(k) ? 3 : 1));
      let r = random() * ws.reduce((s, w) => s + w, 0);
      for (let i = 0; i < pool.length; i++) {
        r -= ws[i];
        if (r < 0) return pool[i];
      }
      return pool[pool.length - 1];
    };
    const EGGS = ['onFire', 'cheerSticks', 'rickroll', 'siren'];
    const DUETS = [
      ['chatGreet', 0.10],
      ['lookNod', 0.07],
      ['catRub', 0.09],
      ['readAlong', 0.06],
      ['foxTease', 0.09],
      ['pandaShare', 0.09],
      ['elementClash', 0.06],
      ['highFive', 0.07],
      ['waveRelay', 0.07],
      ['yawnChain', 0.05],
      ['congaLine', 0.05],
      ['autoTower', 0.06],
      ['butterflyChase', 0.06],
      ['teaBreak', 0.06],
      ['peekabooHide', 0.06],
      ['habitatVisit', 0.05],
      ['miniParty', 0.04],
    ];
    const pickDuet = () => {
      const mains = activeMainActors();
      const hasKind = (k) => mains.some((a) => a.kind === k);
      const night = isLateNight();
      const eligible = DUETS.filter(([k]) => {
        if (k === 'foxTease') return mains.length >= 2 && hasKind('fox');
        if (k === 'pandaShare') return mains.length >= 2 && hasKind('panda');
        if (k === 'elementClash') return hasKind('whale') && (hasKind('dragon') || hasKind('fox'));
        if (k === 'highFive' || k === 'yawnChain' || k === 'congaLine' || k === 'autoTower' || k === 'butterflyChase' || k === 'teaBreak' || k === 'peekabooHide' || k === 'miniParty') return mains.length >= 2;
        if (k === 'waveRelay') return mains.length >= 3;
        return true;
      }).map(([k, w]) => [k, night && (k === 'yawnChain' || k === 'teaBreak') ? w * 2.2 : w]);
      const totalW = eligible.reduce((s, [, w]) => s + w, 0) || 1;
      let r = random() * totalW;
      for (const [k, w] of eligible) if ((r -= w) < 0) return k;
      return 'chatGreet';
    };

    const stageBusy = () =>
      streaming ||
      hasError ||
      yieldMode !== 'none' ||
      activeMainActors().some((a) => a.dragging || a.stackedOn) ||
      miniCrabs.some((m) => m.dragging || m.stackedOn);

    let duetSerial = 0;
    const THEATER_SCRIPTS = {
      lookNod: (ctx) => {
        const mains = ctx.mains;
        const steps = [];
        for (let i = 0; i < mains.length; i += 2) {
          const a = mains[i];
          const b = mains[i + 1];
          if (b) {
            const f = faceToward(a, b);
            steps.push([0, a.id, 'lookNod', 2000, { face: f, param: 5 }]);
            steps.push([0, b.id, 'lookNod', 2000, { face: f === 'right' ? 'left' : 'right', param: 9 }]);
          } else {
            steps.push([0, a.id, 'lookNod', 2000, { face: 'left', param: 5 }]);
          }
        }
        return { dur: 2500, steps };
      },
      readAlong: (ctx) => ({
        dur: 2500,
        steps: ctx.mains.map((a, idx) => [0, a.id, 'readAlong', 1600, idx % 2 === 0 ? { sym: 'note' } : {}]),
      }),
      chatGreet: (ctx) => ({
        dur: 2500,
        steps: [
          ...ctx.mains.map((a) =>
            a.kind === 'dragon'
              ? [0, a.id, 'dragonFlame', 2200, { sym: 'spark' }]
              : a.kind === 'whale'
                ? [0, a.id, 'whaleSpout', 2200, { sym: 'heart' }]
                : a.kind === 'fox'
                  ? [0, a.id, 'foxWisp', 2200, { sym: 'spark' }]
                  : a.kind === 'panda'
                    ? [0, a.id, 'pandaBamboo', 2200, { sym: 'heart' }]
                    : a.kind === 'cat'
                      ? [0, a.id, 'chatGreet', 2400, { mirror: true, sym: 'note' }]
                      : [0, a.id, 'chatGreet', 2400, { sym: 'heart' }]
          ),
          [0, 'crabsWave'],
        ],
      }),
      catRub: (ctx) => {
        const cat = ctx.mains.find((a) => a.kind === 'cat');
        const buddy = ctx.mains.find((a) => a !== cat && a.kind === 'clawd') || ctx.mains.find((a) => a !== cat);
        if (!cat || !buddy) return THEATER_SCRIPTS.chatGreet(ctx);
        const dir = buddy.x < cat.x ? -1 : 1;
        const wt = min(16, round(max(0, abs(buddy.x - cat.x) - 46) / 1.4));
        const wm = wt * TICK;
        const steps = [];
        if (wt >= 2) steps.push([0, cat.id, 'walk', wm, { patrolDir: dir }]);
        steps.push([wm, cat.id, 'groom', 1600, { mirror: dir < 0 }]);
        steps.push([wm + 400, buddy.id, 'pet', 1300, { sym: 'heart' }]);
        if (wt >= 2) steps.push([wm + 1700, cat.id, 'walk', wm, { patrolDir: -dir }]);
        steps.push([wm * 2 + 1800, 'resetHome']);
        return { dur: wm * 2 + 2000, steps };
      },
      // 🦊 小赤狐偷放灵狐星火逗伙伴，伙伴先吓一跳再开心转圈
      foxTease: (ctx) => {
        const fox = ctx.mains.find((a) => a.kind === 'fox');
        const buddy = ctx.mains.find((a) => a !== fox && (a.kind === 'cat' || a.kind === 'panda' || a.kind === 'clawd')) || ctx.mains.find((a) => a !== fox);
        if (!fox || !buddy) return THEATER_SCRIPTS.highFive(ctx);
        const dir = buddy.x < fox.x ? -1 : 1;
        const wt = min(14, round(max(0, abs(buddy.x - fox.x) - 50) / 1.5));
        const wm = wt * TICK;
        const steps = [];
        if (wt >= 2) steps.push([0, fox.id, 'walk', wm, { patrolDir: dir }]);
        steps.push([wm, fox.id, 'foxWisp', 1800, { mirror: dir < 0, sym: 'spark' }]);
        steps.push([wm + 260, buddy.id, 'wow', 700, { face: faceToward(buddy, fox), sym: 'bang' }]);
        steps.push([wm + 1000, buddy.id, 'happy', 1100, { face: faceToward(buddy, fox), sym: 'heart' }]);
        steps.push([wm + 1050, () => {
          if (!reducedMotion) spawnChromaBurst((getEntWorldCx(fox) + getEntWorldCx(buddy)) / 2, -26, 8, false);
        }]);
        if (wt >= 2) steps.push([wm + 2100, fox.id, 'walk', wm, { patrolDir: -dir }]);
        steps.push([wm * 2 + 2250, 'resetHome']);
        return { dur: wm * 2 + 2450, steps };
      },
      // 🐼 小熊猫摇摇晃晃过去分脆竹子/零食，两只一起开吃点头
      pandaShare: (ctx) => {
        const panda = ctx.mains.find((a) => a.kind === 'panda');
        const buddy = ctx.mains.find((a) => a !== panda);
        if (!panda || !buddy) return THEATER_SCRIPTS.highFive(ctx);
        const dir = buddy.x < panda.x ? -1 : 1;
        const wt = min(14, round(max(0, abs(buddy.x - panda.x) - 50) / 1.5));
        const wm = wt * TICK;
        const buddySnack = buddy.kind === 'cat' || buddy.kind === 'whale' ? 'eatFish' : 'eat';
        const steps = [];
        if (wt >= 2) steps.push([0, panda.id, 'walk', wm, { patrolDir: dir }]);
        steps.push([wm, panda.id, 'pandaBamboo', 2100, { mirror: dir < 0, sym: 'heart' }]);
        steps.push([wm + 350, buddy.id, buddySnack, 1750, { face: faceToward(buddy, panda), sym: 'heart' }]);
        steps.push([wm + 2150, buddy.id, 'happy', 700, { sym: 'note' }]);
        if (wt >= 2) steps.push([wm + 2200, panda.id, 'walk', wm, { patrolDir: -dir }]);
        steps.push([wm * 2 + 2350, 'resetHome']);
        return { dur: wm * 2 + 2550, steps };
      },
      // 🐉🔥 vs 🐳💧 冰火/星火元素对撞二重奏，中间炸出彩虹水汽星屑
      elementClash: (ctx) => {
        const whale = ctx.mains.find((a) => a.kind === 'whale');
        const fire = ctx.mains.find((a) => a.kind === 'dragon') || ctx.mains.find((a) => a.kind === 'fox');
        if (!whale || !fire) return THEATER_SCRIPTS.highFive(ctx);
        const firePose = fire.kind === 'dragon' ? 'dragonFlame' : 'foxWisp';
        return {
          dur: 2700,
          steps: [
            [0, fire.id, firePose, 2000, { face: faceToward(fire, whale), sym: 'spark' }],
            [240, whale.id, 'whaleSpout', 2000, { face: faceToward(whale, fire), sym: 'spark' }],
            [700, () => {
              if (!reducedMotion) spawnChromaBurst((getEntWorldCx(fire) + getEntWorldCx(whale)) / 2, -30, 14, false);
            }],
            [2050, fire.id, 'happy', 650, { sym: 'heart' }],
            [2050, whale.id, 'happy', 650, { sym: 'heart' }],
          ],
        };
      },
      // ✨ 任意双宠碰头同步转圈击掌彩蛋
      highFive: (ctx) => {
        const mains = ctx.mains;
        if (mains.length < 2) return THEATER_SCRIPTS.chatGreet(ctx);
        const iA = floor(random() * mains.length);
        const a = mains[iA];
        const b = mains[(iA + 1) % mains.length];
        const fA = faceToward(a, b);
        const fB = fA === 'right' ? 'left' : 'right';
        return {
          dur: 2400,
          steps: [
            [0, a.id, 'lookNod', 650, { face: fA, param: 2 }],
            [0, b.id, 'lookNod', 650, { face: fB, param: 2 }],
            [680, a.id, 'spinHop', 1000, { sym: 'spark' }],
            [680, b.id, 'spinHop', 1000, { sym: 'spark' }],
            [820, () => {
              if (!reducedMotion) {
                hop(a, 'happy');
                hop(b, 'happy');
                spawnChromaBurst((getEntWorldCx(a) + getEntWorldCx(b)) / 2, -28, 10, false);
              }
            }],
            [1720, a.id, 'happy', 650, { sym: 'heart' }],
            [1720, b.id, 'happy', 650, { sym: 'heart' }],
          ],
        };
      },
      // 🌊 多宠波浪人浪：从左到右接力起跳欢呼，再折返一轮！
      waveRelay: (ctx) => {
        const sorted = [...ctx.mains].sort((u, v) => u.x - v.x);
        if (sorted.length < 2) return THEATER_SCRIPTS.chatGreet(ctx);
        const steps = [];
        sorted.forEach((a, idx) => {
          const t = idx * 180;
          steps.push([t, a.id, 'cheer', 780, { sym: 'spark' }]);
          steps.push([t + 40, () => { if (!reducedMotion && !a.stackedOn) hop(a, 'happy'); }]);
        });
        const backBase = sorted.length * 180 + 360;
        [...sorted].reverse().forEach((a, idx) => {
          const t = backBase + idx * 180;
          steps.push([t, a.id, 'happy', 720, { sym: 'heart' }]);
          steps.push([t + 40, () => { if (!reducedMotion && !a.stackedOn) hop(a, 'happy'); }]);
        });
        steps.push([backBase + sorted.length * 180 + 100, () => {
          const mid = sorted[floor(sorted.length / 2)];
          if (!reducedMotion && mid) spawnChromaBurst(getEntWorldCx(mid), -26, 10, false);
        }]);
        return { dur: backBase + sorted.length * 180 + 500, steps };
      },
      // 😴 传染式连环打哈欠：一只先打哈欠，旁边看了一眼也被传染，最后集体伸懒腰清醒
      yawnChain: (ctx) => {
        const sorted = [...ctx.mains].sort((u, v) => u.x - v.x);
        if (sorted.length < 2) return THEATER_SCRIPTS.lookNod(ctx);
        const steps = [];
        sorted.forEach((a, idx) => {
          const t = idx * 620;
          steps.push([t, a.id, 'yawn', 1150, { sym: isLateNight() ? 'sleepBubble0' : 'z1' }]);
        });
        const stretchAt = sorted.length * 620 + 550;
        sorted.forEach((a) => {
          const sp = a.kind === 'cat' || a.kind === 'fox' ? 'catStretch' : 'stretch';
          steps.push([stretchAt, a.id, sp, 1000, { sym: 'note' }]);
        });
        return { dur: stretchAt + 1150, steps };
      },
      // 🚂 像素小火车：领队带头遛弯，其余小伙伴排成一列跟着逛完再回位
      congaLine: (ctx) => {
        const sorted = [...ctx.mains].sort((u, v) => u.x - v.x);
        if (sorted.length < 2) return THEATER_SCRIPTS.chatGreet(ctx);
        const w = readStageWidth();
        const avgX = sorted.reduce((s, a) => s + a.x, 0) / sorted.length;
        const dir = avgX > w * 0.45 ? -1 : 1;
        const steps = [];
        sorted.forEach((a, idx) => {
          steps.push([idx * 160, a.id, 'walk', 1450, { patrolDir: dir, sym: idx === 0 ? 'note' : null }]);
        });
        steps.push([1750, ...[sorted[0].id, 'lookNod', 600, { face: dir > 0 ? 'left' : 'right', param: 2, sym: 'spark' }]]);
        sorted.forEach((a, idx) => {
          steps.push([2150 + idx * 140, a.id, 'walk', 1350, { patrolDir: -dir }]);
        });
        steps.push([3800, 'resetHome']);
        return { dur: 4000, steps };
      },
      // 🗼 平时自动玩叠叠乐：2~3 只自己蹦到彼此头顶叠高高，晃悠 4.5 秒再跳回地面！
      autoTower: (ctx) => {
        const free = ctx.mains.filter((a) => !a.dragging && !a.stackedOn && a.y === 0);
        if (free.length < 2) return THEATER_SCRIPTS.highFive(ctx);
        const cap = min(free.length, min(3, maxTowerDepthAllowed()));
        const stackList = free.slice(0, cap);
        const base = stackList[0];
        return {
          dur: 5000,
          steps: [
            [0, () => {
              base.stackedOn = null;
              base.y = 0;
              base.perchUntil = 0;
              const until = nowMs() + 4400;
              for (let i = 1; i < stackList.length; i++) {
                const m = stackList[i];
                m.stackedOn = stackList[i - 1].id;
                m.y = 0;
                m.perchUntil = until;
                m.sym = 'heart';
                m.symUntil = nowMs() + 2000;
              }
              syncAllStackedFollowers();
              if (!reducedMotion) {
                const top = stackList[stackList.length - 1];
                spawnChromaBurst(getEntWorldCx(top), computeWorldFootY(top) - 22, 10, false);
              }
              recordInteraction('auto-tower', base.id);
            }],
            [4750, 'resetHome'],
          ],
        };
      },
      // 🦋 集体追像素蝴蝶：一只先发现蝴蝶，旁边的小伙伴跟着探头追着一起扑腾
      butterflyChase: (ctx) => {
        const mains = ctx.mains;
        if (mains.length < 2) return THEATER_SCRIPTS.chatGreet(ctx);
        const a = mains[floor(random() * mains.length)];
        const b = mains.find((x) => x !== a);
        return {
          dur: 3200,
          steps: [
            [0, a.id, 'butterfly', 2600, { sym: 'spark' }],
            [320, b.id, 'lookNod', 700, { face: faceToward(b, a), param: 2, sym: 'q' }],
            [1050, b.id, b.kind === 'cat' || b.kind === 'fox' ? 'chaseDot' : 'butterfly', 1800, { face: faceToward(b, a), sym: 'note' }],
            [2700, a.id, 'happy', 500, { sym: 'heart' }],
            [2700, b.id, 'happy', 500, { sym: 'heart' }],
          ],
        };
      },
      // ☕ 摸鱼下午茶：自动掏出热咖啡和甜甜圈互相点头干杯歇一会儿
      teaBreak: (ctx) => {
        const mains = ctx.mains;
        if (mains.length < 2) return THEATER_SCRIPTS.chatGreet(ctx);
        const steps = [];
        mains.forEach((a, idx) => {
          const snack = idx % 2 === 0 ? 'feedCoffee' : 'feedDonut';
          steps.push([idx * 220, a.id, snack, 2300, { sym: 'heart' }]);
        });
        steps.push([2550, () => {
          for (const a of mains) startClip(a, 'happy', 700, { sym: 'note' });
        }]);
        return { dur: 3300, steps };
      },
      // 👀 躲猫猫彩蛋：一只猫在输入框后面只露眼睛偷看，旁边的歪头找人，突然蹦出来吓它一跳
      peekabooHide: (ctx) => {
        const mains = ctx.mains;
        if (mains.length < 2) return THEATER_SCRIPTS.lookNod(ctx);
        const hider = mains[floor(random() * mains.length)];
        const seeker = mains.find((x) => x !== hider);
        return {
          dur: 3300,
          steps: [
            [0, hider.id, 'peek', 1650, { sym: 'note' }],
            [280, seeker.id, 'tilt', 1200, { rot: -9, face: faceToward(seeker, hider), sym: 'q' }],
            [1680, hider.id, 'wow', 650, { face: faceToward(hider, seeker), sym: 'spark' }],
            [1700, () => { if (!reducedMotion && !hider.stackedOn) hop(hider, 'happy'); }],
            [1780, seeker.id, 'wow', 650, { face: faceToward(seeker, hider), sym: 'bang' }],
            [2450, hider.id, 'happy', 750, { sym: 'heart' }],
            [2450, seeker.id, 'happy', 750, { sym: 'heart' }],
          ],
        };
      },
      // 🌵 拜访角落像素栖息地（仙人掌 / 台灯 / 沙漏）
      habitatVisit: (ctx) => {
        const sorted = [...ctx.mains].sort((u, v) => v.x - u.x);
        const visitor = sorted[0];
        const buddy = sorted[1] || null;
        if (!visitor) return THEATER_SCRIPTS.chatGreet(ctx);
        const hab = resolveHabitatMode();
        const reactPose = hab === 'cactus' ? 'wow' : 'happy';
        const reactSym = hab === 'cactus' ? 'bang' : 'spark';
        const steps = [
          [0, visitor.id, 'lookNod', 900, { face: 'right', param: 3, sym: 'q' }],
          [950, visitor.id, reactPose, 1100, { face: 'right', sym: reactSym }],
          [980, () => { if (hab === 'cactus' && !reducedMotion && !visitor.stackedOn) hop(visitor, 'wow'); }],
        ];
        if (buddy) {
          steps.push([450, buddy.id, 'lookNod', 1400, { face: 'right', param: 4, sym: 'note' }]);
        }
        return { dur: 2250, steps };
      },
      // 🎉 稀有自发小派对：极小概率全员突然同时放大招庆祝一下！
      miniParty: (ctx) => {
        const mains = ctx.mains;
        const steps = mains.map((a, idx) => {
          const p = a.kind === 'fox' ? 'foxWisp' : a.kind === 'panda' ? 'pandaBamboo' : a.kind === 'dragon' ? 'dragonFlame' : a.kind === 'whale' ? 'whaleSpout' : 'cheerSticks';
          return [idx * 120, a.id, p, 2200, { sym: 'spark' }];
        });
        steps.push([280, () => {
          if (!reducedMotion && mains.length) {
            mains.forEach((a) => { if (!a.stackedOn) hop(a, 'happy'); });
            spawnChromaBurst(getEntWorldCx(mains[0]), computeWorldFootY(mains[0]) - 24, 14, false);
          }
          if (miniPileEnabled) crabsWave();
        }]);
        return { dur: 2700, steps };
      },
    };

    const runDuet = (name) => {
      const now = nowMs();
      const mains = activeMainActors();
      if (!mains.length) {
        if (miniPileEnabled) { crabsWave(); renderAllFrames(now); }
        return;
      }
      const specFn = THEATER_SCRIPTS[name] || THEATER_SCRIPTS.chatGreet;
      const spec = specFn({ mains, now });
      const serial = (duetSerial += 1);
      duetUntil = now + (spec.dur || 2500);
      const alive = () => serial === duetSerial && !disposed && !stageBusy() && !reducedMotion && !isHostSleeping() && !isWindowBlurred();
      const exec = (step) => {
        const [, who, pose, dur, opts] = step;
        if (who === 'crabsWave') crabsWave();
        else if (who === 'resetHome') resetHomePositions(false);
        else if (isFn(who)) who();
        else if (hasOwn(actors, who) && actors[who]) startClip(actors[who], pose, dur, opts || {});
      };
      for (const st of spec.steps) {
        if (!st[0]) exec(st);
        else later(st[0], () => { if (alive()) { exec(st); renderAllFrames(); } });
      }
      renderAllFrames(now);
    };

    const pickNextTheater = () => {
      if (disposed || isHostDetached() || parked) {
        theaterTimer = 0;
        return;
      }
      if (!stageBusy() && !reducedMotion && !dozing && !isHostSleeping() && !isWindowBlurred() && !isPpOpen()) {
        const now = nowMs();
        const mains = activeMainActors();
        const allIdle = mains.every((a) => !a.overridePose || now >= a.overrideUntil);
        const crabBusy = miniCrabs.some((mc) => mc.act);

        if (!mains.length) {
          if (miniPileEnabled && !crabBusy && random() < 0.35) {
            crabsWave();
            renderAllFrames(now);
          }
        } else if (miniPileEnabled && allIdle && !crabBusy && random() < 0.18) {
          const r = random();
          if (r < 0.4 ? runCrabChase(false) : r < 0.8 ? runCrabRide(false) : (crabsWave(), true)) renderAllFrames(now);
        } else if (allIdle && random() < (mains.length >= 2 ? 0.56 : 0.25)) {
          runDuet(pickDuet());
        } else {
          const target = mains[theaterCursor % mains.length];
          theaterCursor += 1;
          if (!target.overridePose || now >= target.overrideUntil) {
            if (random() < 0.06) {
              startClip(target, EGGS[floor(random() * EGGS.length)], 3800);
            } else {
              const clip = pickDaily(DAILY_POOL[target.kind] || DAILY_POOL.clawd);
              startClip(target, clip, CLIP_MS[clip] || 3600, { patrolDir: random() < 0.5 ? -1 : 1 });
              if (clip === 'walk') {
                const walker = target;
                const backOk = () => !stageBusy() && !reducedMotion && actors[walker.id] === walker && !walker.seq && walker.y === 0 && !isHostSleeping();
                later(3700, () => { if (backOk()) startClip(walker, 'walk', 3600, { patrolDir: -walker.patrolDir }); });
                later(7400, () => { if (backOk()) resetHomePositions(true); });
              }
            }
            renderAllFrames(now);
          }
        }
      }
      if (!disposed && !dozing && !parked && !isHostDetached() && !isDocHidden() && !isHostSleeping() && !isWindowBlurred() && !isPpOpen()) {
        theaterTimer = setTimeout(pickNextTheater, 3800 + round(random() * 2400));
      } else {
        theaterTimer = 0;
      }
    };
    const scheduleTheater = (delayMs) => {
      clearTimeout(theaterTimer);
      theaterTimer = 0;
      if (disposed || dozing || parked || isHostDetached() || isDocHidden() || isHostSleeping() || isWindowBlurred() || isPpOpen()) return;
      theaterTimer = setTimeout(pickNextTheater, delayMs ?? 3800 + round(random() * 2400));
    };
    scheduleTheater(Number(options.firstTheaterDelayMs) || 3800);

    // ── 多层图腾塔吸附、抽底重力顺滑补位、剧烈动作侧跳下塔与统一弹道引擎 ──────
    const trySnapOntoTower = (mover, now = nowMs()) => {
      if (!mover || mover.dragging) return false;
      const moverChain = getTowerMembers(mover.id);
      const maxDepth = maxTowerDepthAllowed();
      const moverCx = getEntWorldCx(mover);
      const moverFootY = mover.y || 0;
      const seenRoots = new Set(moverChain);

      for (const cand of allActiveEnts()) {
        const root = getTowerRoot(cand.id);
        if (!root || seenRoots.has(root.id)) continue;
        seenRoots.add(root.id);
        if (root.dragging || root.ballisticActive || root.leap || (root.y || 0) < -4) continue;
        if (!isMiniEnt(root) && now < root.overrideUntil && ['onFire', 'siren', 'spinHop'].includes(root.overridePose)) continue;
        const baseChain = getTowerMembers(root.id);
        if (baseChain.length + moverChain.length > maxDepth) continue;
        const top = getEnt(baseChain[baseChain.length - 1]);
        if (!top || top.dragging || top.ballisticActive || top.leap || ((top.y || 0) < -2 && !top.stackedOn)) continue;

        const perchY = computeWorldFootY(top) - mountStepH(top.id);
        if (abs(moverCx - getEntWorldCx(top)) <= 28 && moverFootY >= perchY - 24 && moverFootY <= perchY + 20) {
          resetActorTransient(mover, { keepFly: true });
          mover.stackedOn = top.id;
          mover.y = 0;
          mover.perchUntil = 0;
          if (!isMiniEnt(mover)) {
            mover.overridePose = 'happy';
            mover.overrideUntil = now + 950;
            mover.sym = 'heart';
            mover.symUntil = now + 1100;
            playSeq(mover, [['happy', 1, 2, -1]]);
          }
          syncAllStackedFollowers();
          // 叠满 3 层及以上图腾塔时，整座塔静静炸出一圈彩蛋星屑并齐声开心
          const towerNow = getTowerMembers(mover.id);
          if (towerNow.length >= 3 && !reducedMotion) {
            const topEnt = towerNow[towerNow.length - 1];
            spawnChromaBurst(getEntWorldCx(topEnt), computeWorldFootY(topEnt) - 24, 14, false);
            for (const m of towerNow) {
              if (!isMiniEnt(m)) { m.sym = 'heart'; m.symUntil = now + 1500; }
            }
            recordInteraction('totem-3-celebrate', mover.id, now);
          }
          renderAllFrames(now);
          return true;
        }
      }
      return false;
    };

    const startGravitySettle = (subRoot, targetHolderId) => {
      if (!subRoot) return;
      const subLen = getTowerMembers(subRoot.id).length;
      if (reducedMotion) {
        subRoot.flying += 1;
        subRoot.ballisticActive = false;
        const holder = targetHolderId ? getEnt(targetHolderId) : null;
        if (holder && !holder.dragging && getTowerMembers(holder.id).length + subLen <= maxTowerDepthAllowed()) {
          subRoot.stackedOn = holder.id;
          subRoot.y = 0;
          syncAllStackedFollowers();
        } else {
          subRoot.stackedOn = null;
          subRoot.y = 0;
          enforceGroundSeparation();
        }
        subRoot.vx = 0;
        subRoot.vy = 0;
        subRoot.rot = 0;
        renderAllFrames();
        return;
      }

      const settleId = (subRoot.flying += 1);
      subRoot.ballisticActive = true;
      syncDirectMotionDomAttr(subRoot, isMiniEnt(subRoot) ? subRoot.canvas : subRoot.el);
      let vy = 0.65;
      let prev = nowMs();
      const step = (now) => {
        if (disposed || settleId !== subRoot.flying || subRoot.dragging) {
          if (disposed || subRoot.dragging) subRoot.ballisticActive = false;
          return;
        }
        const k = max(0.5, min(2.5, (now - prev) / 16.6667));
        prev = now;
        let holder = targetHolderId ? getEnt(targetHolderId) : null;
        if (holder && (holder.dragging || getTowerMembers(holder.id).includes(subRoot.id) || getTowerMembers(holder.id).length + subLen > maxTowerDepthAllowed())) {
          holder = null;
        }
        const goalY = holder ? computeWorldFootY(holder) - mountStepH(holder.id) : 0;
        if (isDocHidden() || isHostSleeping() || parked) {
          subRoot.ballisticActive = false;
          subRoot.vx = 0;
          subRoot.vy = 0;
          subRoot.rot = 0;
          if (holder) {
            subRoot.stackedOn = holder.id;
            subRoot.y = 0;
            syncAllStackedFollowers();
          } else {
            subRoot.stackedOn = null;
            subRoot.y = 0;
            enforceGroundSeparation();
          }
          syncTower(subRoot, now);
          reclaimStageVram();
          return;
        }
        if (holder) {
          const curCx = getEntWorldCx(subRoot);
          setEntWorldCx(subRoot, curCx + (getEntWorldCx(holder) - curCx) * min(1, 0.35 * k));
        }
        vy = min(14, vy + 0.54 * k);
        subRoot.y += vy * k;
        subRoot.vy = vy;
        if (subRoot.y >= goalY) {
          subRoot.ballisticActive = false;
          subRoot.vx = 0;
          subRoot.vy = 0;
          subRoot.rot = 0;
          if (holder) {
            subRoot.stackedOn = holder.id;
            subRoot.y = 0;
            if (!isMiniEnt(subRoot)) playSeq(subRoot, [['idle', 1, 2, -1]]);
            syncAllStackedFollowers();
          } else {
            subRoot.stackedOn = null;
            subRoot.y = 0;
            if (!isMiniEnt(subRoot)) playSeq(subRoot, landingSteps(1));
            enforceGroundSeparation();
          }
          syncTower(subRoot, now);
          renderAllFrames(now);
          return;
        }
        syncAllStackedFollowers();
        syncTower(subRoot, now);
        rAF(step);
      };
      rAF(step);
    };

    const detachWithGravitySettle = (pulledId) => {
      const pulled = getEnt(pulledId);
      if (!pulled) return;
      const lowerHolderId = pulled.stackedOn || null;
      const upperRider = findDirectRider(pulledId);
      if (upperRider) {
        const riderStartFootY = computeWorldFootY(upperRider);
        const riderStartCx = getEntWorldCx(upperRider);
        upperRider.stackedOn = null;
        upperRider.perchUntil = 0;
        resetActorTransient(upperRider, { keepFly: true });
        setEntWorldCx(upperRider, riderStartCx);
        upperRider.y = riderStartFootY;
      }
      pulled.stackedOn = null;
      pulled.perchUntil = 0;
      if (upperRider) startGravitySettle(upperRider, lowerHolderId);
    };

    const dismountRidersSideHop = (baseId) => {
      const chain = getTowerMembers(baseId);
      const idx = chain.indexOf(baseId);
      if (idx < 0 || idx >= chain.length - 1) return false;
      const snapshots = chain
        .slice(idx + 1)
        .map((id) => getEnt(id))
        .filter(Boolean)
        .map((r) => ({ r, footY: computeWorldFootY(r), cx: getEntWorldCx(r) }));
      for (const s of snapshots) {
        s.r.stackedOn = null;
        s.r.perchUntil = 0;
        resetActorTransient(s.r, { keepFly: true });
        s.r.y = s.footY;
        setEntWorldCx(s.r, s.cx);
      }
      snapshots.forEach((s, i) => {
        const dir = i % 2 === 0 ? -1 : 1;
        if (reducedMotion) {
          setEntWorldCx(s.r, s.cx + dir * (28 + i * 18));
          s.r.y = 0;
        } else {
          const isM = isMiniEnt(s.r);
          startEntityBallistic(s.r, dir * ((isM ? 2.6 : 2.8) + i * 0.6), (isM ? -3.5 : -3.8) - i * 0.4, { noSnap: true });
        }
      });
      if (reducedMotion) {
        enforceGroundSeparation();
        renderAllFrames();
      }
      return true;
    };

    const triggerObstacleEncounter = (moverId, obstacleId, forcedAction = null) => {
      const mover = getEnt(moverId);
      const obs = getEnt(obstacleId);
      if (!mover || !obs || mover.id === obs.id) return null;
      const now = nowMs();
      const obsRoot = getTowerRoot(obs.id) || obs;
      if (obsRoot.id === mover.id) return null;

      const moverCx = getEntWorldCx(mover);
      const obsCx = getEntWorldCx(obsRoot);
      const dir = moverCx <= obsCx ? 1 : -1;
      const landCx = obsCx + dir * (entHalfW(obsRoot) + entHalfW(mover) + 12);
      const { minX, maxX } = stageBoundsX();
      const mHw = entHalfW(mover);
      const canLeap = landCx >= minX + mHw + 2 && landCx <= maxX - mHw - 2;
      const obsTowerLen = getTowerMembers(obsRoot.id).length;
      const canPerch = getTowerMembers(mover.id).length === 1 && obsTowerLen < maxTowerDepthAllowed();

      let action = forcedAction || chooseObstacleAction({ canLeap, canPerch });
      if (action === 'autoPerch' && !canPerch) action = canLeap ? 'leapfrog' : 'greetTurn';
      if (action === 'leapfrog' && !canLeap) action = canPerch ? 'autoPerch' : 'greetTurn';

      if (action === 'leapfrog') {
        const peak = min(62, 26 + max(0, obsTowerLen - 1) * 14);
        resetActorTransient(mover, { keepFly: true });
        if (reducedMotion) {
          setEntWorldCx(mover, landCx);
          mover.y = 0;
          enforceGroundSeparation();
        } else {
          mover.leap = { cx0: moverCx, cx1: landCx, peak, startTick: tickIdx, ticks: 6, landOnto: null };
          if (!isMiniEnt(mover)) {
            mover.faceDir = dir > 0 ? 'right' : 'left';
            mover.sym = 'spark';
            mover.symUntil = now + 750;
          }
        }
      } else if (action === 'autoPerch') {
        const top = getStackTop(obsRoot.id);
        resetActorTransient(mover, { keepFly: true });
        if (reducedMotion) {
          mover.stackedOn = top.id;
          mover.y = 0;
          mover.perchUntil = now + 7200;
          syncAllStackedFollowers();
        } else {
          const peak = max(26, abs(computeWorldFootY(top) - mountStepH(top.id)) + 10);
          mover.leap = { cx0: moverCx, cx1: getEntWorldCx(top), peak, startTick: tickIdx, ticks: 5, landOnto: top.id };
          if (!isMiniEnt(obsRoot) && !obsRoot.dragging && !obsRoot.stackedOn) {
            startClip(obsRoot, 'walk', 2800, { patrolDir: dir });
          }
        }
      } else {
        action = 'greetTurn';
        if (isMiniEnt(mover)) {
          mover.act = null;
          mover.bumpUntilTick = tickIdx + 6;
          mover.blinkAt = tickIdx;
          mover.dir = -dir;
          setEntWorldCx(mover, moverCx - dir * 4);
        } else {
          mover.nextBlinkTick = tickIdx;
          mover.patrolDir = -dir;
          startClip(mover, mover.kind === 'clawd' ? 'wave' : 'tilt', 560, {
            face: dir > 0 ? 'right' : 'left',
            sym: 'note',
            rot: mover.kind === 'cat' ? -8 : 0,
          });
          later(520, () => {
            if (!disposed && !stageBusy() && !reducedMotion && !dozing && !mover.dragging && !mover.stackedOn) {
              startClip(mover, 'walk', 2000, { patrolDir: -dir });
            }
          });
        }
        if (isMiniEnt(obsRoot)) {
          obsRoot.bumpUntilTick = tickIdx + 5;
          obsRoot.blinkAt = tickIdx;
        } else {
          obsRoot.nextBlinkTick = tickIdx;
          obsRoot.nodY = PX;
          obsRoot.nodUntil = now + 180;
        }
      }

      recordInteraction(action, `${mover.id}->${obsRoot.id}`, now);
      renderAllFrames(now);
      return action;
    };

    // 统一主宠 + 迷你蟹弹道物理循环
    const launchEntity = (ent, vx0, vy0, bopts = {}) => {
      const mini = isMiniEnt(ent);
      const flightId = (ent.flying += 1);
      const hasReboundTarget = !mini && typeof bopts.reboundTargetX === 'number' && isFin(bopts.reboundTargetX);
      const vLim = mini ? 14 : 18;
      const maxVx = hasReboundTarget ? 64 : vLim;
      let vx = clamp(vx0, -maxVx, maxVx);
      let vy = clamp(vy0, -vLim, vLim);
      let bounces = 0;
      let scattered = false;
      resetActorTransient(ent, { keepFly: true, keepVel: true, keepBallistic: true });
      ent.ballisticActive = true;
      if (!mini) {
        ent.reboundNoBump = !!bopts.reboundNoBump;
        ent.overridePose = 'dangle';
        ent.overrideUntil = nowMs() + 3000;
      }
      // 起跳瞬间立刻锁死 data-direct="1" 与 transition: none，防止首帧落入 220ms CSS transition
      syncDirectMotionDomAttr(ent, mini ? ent.canvas : ent.el);

      let prev = nowMs();
      const step = (now) => {
        if (disposed || flightId !== ent.flying || ent.dragging) {
          if (disposed || ent.dragging) ent.ballisticActive = false;
          return;
        }
        if (isDocHidden() || isHostSleeping() || parked) {
          if (hasReboundTarget) {
            ent.x = max(8, min(maxXFor(readStageWidth()), bopts.reboundTargetX));
          }
          if (!mini) ent.reboundNoBump = false;
          resetActorTransient(ent, { keepFly: true });
          ent.y = 0;
          enforceGroundSeparation();
          if (!mini) applyActorTransform(ent, now);
          else syncTower(ent, now);
          reclaimStageVram();
          return;
        }
        const k = max(0.5, min(2.5, (now - prev) / 16.6667));
        prev = now;
        vy += (mini ? 0.46 : 0.44) * k;
        const drag = Math.pow(mini ? 0.985 : 0.988, k);
        vx *= drag;
        vy *= drag;

        let mainMinX = 8;
        let mainMaxX = 40;
        if (mini) {
          const { minX, maxX } = stageBoundsX();
          const hw = entHalfW(ent);
          let cx = getEntWorldCx(ent) + vx * k;
          if (cx < minX + hw) { cx = minX + hw; vx = -0.45 * vx; }
          else if (cx > maxX - hw) { cx = maxX - hw; vx = -0.45 * vx; }
          setEntWorldCx(ent, cx);
          ent.y = max(-180, (ent.y || 0) + vy * k);
        } else {
          ent.x += vx * k;
          ent.y += vy * k;
          mainMinX = 8;
          mainMaxX = maxXFor(readStageWidth());
          if (hasReboundTarget) {
            const targetX = clamp(bopts.reboundTargetX, mainMinX, mainMaxX);
            if ((vx >= 0 && ent.x > targetX) || (vx < 0 && ent.x < targetX)) {
              ent.x = targetX;
              vx = 0;
            }
          }
          if (ent.x < mainMinX) { ent.x = mainMinX; vx = -0.45 * vx; }
          else if (ent.x > mainMaxX) { ent.x = mainMaxX; vx = -0.45 * vx; }
          if (ent.y < -180) { ent.y = -180; vy = -0.45 * vy; }
        }
        ent.vx = vx;
        ent.vy = vy;

        if (!bopts.noSnap && vy >= 0 && trySnapOntoTower(ent, now)) return;

        if (!mini && !bopts.reboundNoBump) {
          for (const other of activeMainActors()) {
            if (other === ent) continue;
            if (
              !other.reboundNoBump &&
              !other.dragging && !other.stackedOn && !ent.stackedOn &&
              abs(ent.x - other.x) < 42 && abs(ent.y - other.y) < 22 &&
              ((ent.x < other.x && vx > 0.35) || (ent.x >= other.x && vx < -0.35)) &&
              canTriggerPair('ballistic', now, 650)
            ) {
              const sign = ent.x < other.x ? -1 : 1;
              ent.x = clampActorX(other.x + sign * 42);
              const incomingVx = vx;
              vx = -incomingVx * 0.46;
              if (abs(vx) < 1.6) vx = sign * 1.8;
              ent.sym = 'sweat';
              ent.symUntil = now + 750;
              startClip(other, 'wow', 800, { sym: 'bang', face: sign < 0 ? 'left' : 'right' });
              startEntityBallistic(other, clamp(incomingVx * 0.62 || -sign * 2.6, -7.2, 7.2), -2.7);
              recordInteraction('ballisticBump', `${ent.id}->${other.id}`, now);
              renderAllFrames(now);
              break;
            }
          }
        }

        if (ent.y >= 0) {
          ent.y = 0;
          if (!mini && !scattered) { scattered = true; scatterCrabsNear(ent.x + 48); }
          const maxB = mini ? 1 : 2;
          const minVy = mini ? 2.6 : 2.4;
          if (abs(vy) > minVy && bounces < maxB) {
            vy = -vy * (mini ? 0.32 : 0.36);
            vx *= mini ? 0.78 : 0.82;
            bounces += 1;
            // 中途弹跳：ballisticActive 保持 true 锁死 data-direct
            if (!mini) playSeq(ent, [['flat', 1, 2, 0]]);
          } else {
            const impact = abs(vy);
            if (hasReboundTarget) {
              ent.x = clamp(bopts.reboundTargetX, mainMinX, mainMaxX);
            }
            if (!mini) ent.reboundNoBump = false;
            resetActorTransient(ent, { keepFly: true });
            if (!mini) {
              const steps = landingSteps(impact > 1.2 || bounces > 0 ? 2 : 1);
              playSeq(ent, steps);
              if (ent.throws >= 3) {
                ent.throws = 0;
                startClip(ent, 'angry', 1400 + seqTotalMs(steps), { sym: 'vein' });
              }
            }
            enforceGroundSeparation();
            if (!mini) applyActorTransform(ent, now);
            else syncTower(ent, now);
            renderAllFrames(now);
            return;
          }
        }
        ent.rot = clamp(-vx * 0.65, -14, 14);
        ent.vx = vx;
        ent.vy = vy;
        syncAllStackedFollowers();
        if (mini) {
          syncTower(ent, now);
        } else {
          applyActorTransform(ent, now);
          // 仅在姿态真正切变（如起跳进 dangle 或触地切 flat）时重绘精灵，避免 60fps 软件重绘
          if (resolvePoseFor(ent, now) !== ent.lastRender.poseKey) {
            renderAllFrames(now);
          }
        }
        rAF(step);
      };
      rAF(step);
    };

    const startEntityBallistic = (ent, vx0, vy0, bopts = {}) => {
      if (!ent) return;
      const mini = isMiniEnt(ent);
      if (!mini && Math.hypot(vx0, vy0) > 2.2) dismountRidersSideHop(ent.id);
      if (reducedMotion) {
        resetActorTransient(ent, { keepPose: !mini && ent.overridePose !== 'dangle' });
        if (!mini && typeof bopts.reboundTargetX === 'number' && isFin(bopts.reboundTargetX)) {
          ent.x = clampActorX(bopts.reboundTargetX);
        }
        if (bopts.noSnap || !trySnapOntoTower(ent, nowMs())) {
          ent.y = 0;
          enforceGroundSeparation();
          if (!mini) applyActorTransform(ent);
          else syncTower(ent);
          renderAllFrames();
        }
        return;
      }
      if (!mini && bopts.anticipate && ent.y === 0 && !ent.stackedOn) {
        const prepId = (ent.flying += 1);
        ent.ballisticActive = false;
        playSeq(ent, [['squash', 2, 2, -1]]);
        later(TICK * 2, () => {
          if (ent.flying === prepId && !ent.dragging) launchEntity(ent, vx0, vy0, bopts);
        });
        return;
      }
      launchEntity(ent, vx0, vy0, bopts);
    };
    const startBallistic = startEntityBallistic;
    const startMiniBallistic = startEntityBallistic;

    const dragReleaseHooks = [];
    let dragRafPending = false;
    let dragRafId = 0;
    const cAF =
      (win && isFn(win.cancelAnimationFrame) && win.cancelAnimationFrame.bind(win)) ||
      (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
    const scheduleDragRender = () => {
      if (dragRafPending || disposed) return;
      dragRafPending = true;
      dragRafId = rAF((frameNow) => {
        dragRafId = 0;
        dragRafPending = false;
        if (!disposed) renderAllFrames(frameNow);
      });
    };

    // ── 投喂彩蛋（右键=甜甜圈 / Alt+左键=热咖啡）：立即消气清 pokeCount；旁边伙伴会眼馋盯食，连喂两只触发齐欢呼 ──
    let lastFeedAt = 0;
    let lastFeedActorId = null;
    let lastTypeKwAt = 0;
    const feedActor = (actor, item = 'donut') => {
      if (!actor || isMiniEnt(actor) || disposed) return false;
      const now = nowMs();
      markActivity();
      actor.pokeCount = 0;
      actor.lastPokeAt = 0;
      if (actor.overridePose === 'sulk' || actor.overridePose === 'angry') {
        resetActorTransient(actor);
      }
      const pose = item === 'coffee' ? 'feedCoffee' : 'feedDonut';
      startClip(actor, pose, 2200, { sym: 'heart' });
      const others = activeMainActors().filter((o) => o !== actor && !o.dragging && !o.stackedOn);
      if (others.length) {
        if (lastFeedActorId && lastFeedActorId !== actor.id && now - lastFeedAt < 4500) {
          // 刚喂完一只又喂另一只 → 全员共享下午茶欢呼彩蛋！
          const prev = actors[lastFeedActorId];
          if (prev) startClip(prev, 'happy', 1500, { sym: 'heart' });
          if (!reducedMotion) spawnChromaBurst(getEntWorldCx(actor), computeWorldFootY(actor) - 20, 10, false);
          recordInteraction('feast-duo', `${lastFeedActorId}+${actor.id}`, now);
        } else {
          // 旁边最近的伙伴回头眼馋地盯着看
          const watcher = others.reduce((best, cur) => (abs(cur.x - actor.x) < abs(best.x - actor.x) ? cur : best), others[0]);
          if (watcher && (!watcher.overridePose || now >= watcher.overrideUntil)) {
            startClip(watcher, 'lookNod', 1600, { face: faceToward(watcher, actor), param: 4, sym: 'q' });
          }
        }
      }
      lastFeedAt = now;
      lastFeedActorId = actor.id;
      recordInteraction(pose, actor.id, now);
      renderAllFrames(now);
      return true;
    };

    // 统一主宠 + 迷你蟹指针拖拽绑定（主宠附带右键甜甜圈 & Alt+左键热咖啡投喂）
    const bindEntityPointer = (ent) => {
      const mini = isMiniEnt(ent);
      const domNode = mini ? ent.canvas : ent.el;
      const dragThreshold = mini ? 2.5 : 7;
      let downX = 0;
      let downY = 0;
      let startX = 0;
      let startY = 0;
      let cachedA = 720;
      let cachedB = 680;
      let lastMoveX = 0;
      let lastMoveY = 0;
      let lastMoveT = 0;
      let moved = false;
      let petTimer = 0;
      let petTriggered = false;

      const onDown = (evt) => {
        if (yieldMode === 'peek' || evt.button !== 0 || (mini && !miniPileEnabled)) return;
        evt.preventDefault();
        evt.stopPropagation();
        if (!mini && evt.altKey) {
          feedActor(ent, 'coffee');
          return;
        }
        try { ent.el.setPointerCapture?.(evt.pointerId); } catch {}
        const downNow = nowMs();
        if (ent.glideUntil && downNow < ent.glideUntil) {
          ent.glideSeq = (ent.glideSeq || 0) + 1;
          ent.glideUntil = 0;
          try {
            const er = ent.el?.getBoundingClientRect?.();
            const hr = hostEl?.getBoundingClientRect?.();
            const hasRect =
              er &&
              hr &&
              isFin(er.left) &&
              isFin(hr.left) &&
              ((isFin(er.width) && er.width > 0) || (isFin(er.right) && er.right > er.left));
            if (hasRect) {
              if (mini) setEntWorldCx(ent, er.left - hr.left + 20);
              else ent.x = clampActorX(er.left - hr.left);
            }
          } catch {}
          if (mini) {
            if (ent.el?.style) ent.el.style.transition = '';
          } else {
            for (const cid of getTowerMembers(ent.id)) {
              const member = getEnt(cid);
              if (!member) continue;
              member.glideSeq = (member.glideSeq || 0) + 1;
              member.glideUntil = 0;
              if (member.el?.style) member.el.style.transition = '';
            }
            syncTower(ent);
          }
        }
        if (!mini) ent.reboundNoBump = false;
        if (mini) {
          const { minX, maxX } = stageBoundsX();
          const hw = entHalfW(ent);
          cachedA = minX + hw;
          cachedB = maxX - hw;
          startX = getEntWorldCx(ent);
        } else {
          cachedA = readStageWidth();
          startX = ent.x;
        }
        downX = evt.clientX;
        downY = evt.clientY;
        startY = ent.stackedOn ? computeWorldFootY(ent) : ent.y || 0;
        lastMoveX = evt.clientX;
        lastMoveY = evt.clientY;
        lastMoveT = downNow;
        moved = false;
        petTriggered = false;
        markActivity();
        resetActorTransient(ent);

        if (!mini) {
          clearTimeout(petTimer);
          petTimer = setTimeout(() => {
            if (!moved && !disposed) {
              petTriggered = true;
              startClip(ent, 'pet', 1100, { sym: 'heart' });
              // 长按摸头连锁：旁边最近的伙伴探头凑热闹求摸摸！
              const neighbors = activeMainActors().filter((o) => o !== ent && !o.dragging && !o.stackedOn && o.y === 0);
              if (neighbors.length) {
                const nb = neighbors.reduce((best, cur) => (abs(cur.x - ent.x) < abs(best.x - ent.x) ? cur : best), neighbors[0]);
                if (nb && (!nb.overridePose || nowMs() >= nb.overrideUntil)) {
                  startClip(nb, 'lookNod', 1200, { face: faceToward(nb, ent), param: 3, sym: 'note' });
                  if (!reducedMotion) hop(nb, 'wave');
                }
              }
              renderAllFrames();
            }
          }, 360);
        }
      };

      const onMove = (evt) => {
        if (lastMoveT === 0) return;
        const dxTotal = evt.clientX - downX;
        const dyTotal = evt.clientY - downY;
        let justStarted = false;
        if (!moved && Math.hypot(dxTotal, dyTotal) > dragThreshold) {
          moved = true;
          justStarted = true;
          clearTimeout(petTimer);
          detachWithGravitySettle(ent.id);
          if (!mini) {
            ent.sideEdgeSnap = false;
            ent.sidePushOriginX = null;
            ent.sideEdgeDirectUntil = 0;
          }
          ent.ballisticActive = false;
          ent.dragging = true;
          syncDirectMotionDomAttr(ent, domNode);
          syncMascotDragRootAttr();
        }
        if (!moved) return;
        evt.stopPropagation?.();
        const now = nowMs();
        const dt = max(4, now - lastMoveT);
        ent.vx = ent.vx * 0.4 + (((evt.clientX - lastMoveX) / dt) * 16) * 0.6;
        ent.vy = ent.vy * 0.4 + (((evt.clientY - lastMoveY) / dt) * 16) * 0.6;
        ent.rot = clamp(-ent.vx * 0.7, -14, 14);
        lastMoveX = evt.clientX;
        lastMoveY = evt.clientY;
        lastMoveT = now;

        const nextY = clamp(startY + dyTotal, -180, 0);
        if (mini) {
          const clampedCx = clamp(startX + dxTotal, cachedA, cachedB);
          const nextPx = max(2, clampedCx - 32);
          ent.px = nextPx;
          ent.lastX = round(nextPx);
          ent.y = nextY;
          const tx = snapCoord(nextPx, true);
          const ty = snapCoord(nextY, true);
          applyMiniTransform(ent, tx, ty, '39', ent.rot);
        } else {
          const rightReserve = popoverRightWidth > 0 ? min(cachedA - 150, popoverRightWidth + 16) : 0;
          ent.x = max(4, min(max(24, cachedA - 88 - rightReserve), startX + dxTotal));
          ent.y = nextY;
          applyActorTransform(ent, now);
        }

        if (justStarted) renderAllFrames(now);
        else scheduleDragRender();

        if (!mini && !reducedMotion && ent.dragging && ent.y > -22) {
          for (const other of activeMainActors()) {
            if (other === ent) continue;
            if (!other.dragging && !other.stackedOn && other.y === 0 && abs(ent.x - other.x) < 38) {
              if (abs(ent.vx) >= 2.0 && canTriggerPair('dragBump', now, 750)) {
                const pushDir = ent.vx >= 0 ? 1 : -1;
                startClip(other, 'wow', 750, { sym: 'bang', face: pushDir > 0 ? 'left' : 'right' });
                startEntityBallistic(other, pushDir * min(5.2, abs(ent.vx) * 0.58), -2.5);
                recordInteraction('dragBump', `${ent.id}->${other.id}`, now);
                scheduleDragRender();
                break;
              } else if (abs(ent.vx) < 2.0 && canTriggerPair('dragPass', now, 1400)) {
                gaze(other, ent.x < other.x ? 'left' : 'right', 750, false, 'note');
                hop(other, 'wave');
                recordInteraction('dragPass', `${ent.id}->${other.id}`, now);
                scheduleDragRender();
                break;
              }
            }
          }
          if (miniPileEnabled && ent.y > -16 && abs(ent.vx) > 1.4 && canTriggerPair('dragCrab', now, 800)) {
            if (miniCrabs.some((mc) => !mc.act && !mc.stackedOn && abs(crabHostCenter(mc) - (ent.x + 48)) < 32)) {
              scatterCrabsNear(ent.x + 48);
              recordInteraction('crabScatter', ent.id, now);
              scheduleDragRender();
            }
          }
        }
      };

      const onUp = (evt) => {
        if (lastMoveT === 0) return;
        clearTimeout(petTimer);
        ent.el.releasePointerCapture?.(evt.pointerId);
        const prevMoveT = lastMoveT;
        lastMoveT = 0;

        if (moved) {
          ent.dragging = false;
          syncMascotDragRootAttr();
          const pNow = nowMs();
          if (pNow - prevMoveT > 35) { ent.vx = 0; ent.vy = 0; }
          if (Math.hypot(ent.vx, ent.vy) < 4.5 && trySnapOntoTower(ent, pNow)) {
            syncDirectMotionDomAttr(ent, domNode);
            moved = false;
            return;
          }
          if (!mini) {
            const wallNow = Date.now();
            if (wallNow - ent.lastThrowAt > 8000) ent.throws = 0;
            ent.throws += 1;
            ent.lastThrowAt = wallNow;
          }
          const mul = mini ? 0.78 : 0.85;
          const throwSpd = Math.hypot(ent.vx, ent.vy);
          startEntityBallistic(ent, ent.vx * mul, ent.vy * mul);
          // 抛高高围观彩蛋：用力甩飞一只时，地面伙伴们齐刷刷吓一跳仰头围观！
          if (!mini && throwSpd > 8.5 && !reducedMotion) {
            const watchers = activeMainActors().filter((o) => o !== ent && !o.dragging && !o.stackedOn && o.y === 0);
            for (const w of watchers) {
              startClip(w, 'wow', 950, { face: faceToward(w, ent), sym: 'bang' });
            }
            if (watchers.length) recordInteraction('throw-spectate', ent.id);
          }
          moved = false;
          return;
        }

        if (mini) {
          ent.bumpUntilTick = tickIdx + 6;
          ent.passHopUntilTick = tickIdx + 4;
          renderAllFrames();
        } else if (!petTriggered) {
          triggerPoke(ent, true);
        }
      };

      const cancelDragOnBlur = () => {
        if (lastMoveT === 0 && !ent.dragging) return;
        clearTimeout(petTimer);
        lastMoveT = 0;
        if (moved || ent.dragging) {
          moved = false;
          ent.dragging = false;
          ent.ballisticActive = false;
          ent.vx = 0;
          ent.vy = 0;
          ent.rot = 0;
          syncMascotDragRootAttr();
          syncDirectMotionDomAttr(ent, domNode);
          if (!disposed) startEntityBallistic(ent, 0, 0, { noSnap: true });
        }
      };
      dragReleaseHooks.push(cancelDragOnBlur);

      const onContextMenu = (evt) => {
        if (mini || yieldMode === 'peek') return;
        evt.preventDefault();
        evt.stopPropagation();
        feedActor(ent, 'donut');
      };

      const onDblClick = (evt) => {
        if (mini || yieldMode === 'peek') return;
        evt.stopPropagation();
        markActivity();
        const sig = ent.kind === 'fox' ? 'foxWisp' : ent.kind === 'panda' ? 'pandaBamboo' : ent.kind === 'dragon' ? 'dragonFlame' : ent.kind === 'whale' ? 'whaleSpout' : ent.kind === 'cat' ? 'catStretch' : 'cheer';
        startClip(ent, sig, 2000, { sym: ent.kind === 'panda' ? 'heart' : 'spark' });
        if (!reducedMotion && !ent.stackedOn) hop(ent, 'happy');
        recordInteraction('signature-trick', ent.id);
        renderAllFrames();
      };

      ent.el.addEventListener('pointerdown', onDown);
      ent.el.addEventListener('pointermove', onMove);
      ent.el.addEventListener('pointerup', onUp);
      ent.el.addEventListener('pointercancel', onUp);
      if (!mini) {
        ent.el.addEventListener('contextmenu', onContextMenu);
        ent.el.addEventListener('dblclick', onDblClick);
      }
      const unbind = () => {
        clearTimeout(petTimer);
        const idx = dragReleaseHooks.indexOf(cancelDragOnBlur);
        if (idx >= 0) dragReleaseHooks.splice(idx, 1);
        if (ent.el) {
          ent.el.removeEventListener('pointerdown', onDown);
          ent.el.removeEventListener('pointermove', onMove);
          ent.el.removeEventListener('pointerup', onUp);
          ent.el.removeEventListener('pointercancel', onUp);
          if (!mini) {
            ent.el.removeEventListener('contextmenu', onContextMenu);
            ent.el.removeEventListener('dblclick', onDblClick);
          }
        }
      };
      ent._pointerCleanup = unbind;
      cleanups.push(unbind);
    };

    const unmountActorDom = (actor) => {
      if (!actor) return;
      actor.stackedOn = null;
      for (const e of [...Object.values(actors), ...miniCrabs]) {
        if (e?.stackedOn === actor.id) { e.stackedOn = null; e.y = 0; }
      }
      resetActorTransient(actor);
      actor.dragging = false;
      actor.y = 0;
      if (isFn(actor._pointerCleanup)) {
        const idx = cleanups.indexOf(actor._pointerCleanup);
        if (idx >= 0) cleanups.splice(idx, 1);
        try { actor._pointerCleanup(); } catch {}
        actor._pointerCleanup = null;
      }
      zeroCv(actor.canvas, 1);
      rmNode(actor.el);
      actor._ctx = actor.el = actor.canvas = actor.lastDomX = actor.lastDomY = actor.lastDomZ = null;
      actor.lastDomRot = 0;
      actor.lastDomDirect = actor.lastDomDrag = undefined;
      if (actor.lastRender) { actor.lastRender.poseKey = null; actor.lastRender.cw = actor.lastRender.ch = 0; }
    };

    const syncRosterActors = () => {
      const nextSpecs = buildRosterSpecs(roster);
      const nextIds = nextSpecs.map((s) => s.id);
      const nextSet = new Set(nextIds);
      let domChanged = false;
      for (const oldId of activeIds) {
        if (!nextSet.has(oldId)) {
          const oldActor = actors[oldId];
          if (oldActor) unmountActorDom(oldActor);
          delete actors[oldId];
          domChanged = true;
        }
      }
      for (const sp of nextSpecs) {
        let a = actors[sp.id];
        if (!a) {
          a = createActorState(sp.id, sp.kind, sp.label, sp.phaseTicks, sp.phaseOff);
          actors[sp.id] = a;
        }
        if (!a.el) {
          createActorDom(a, fxCanvas);
          if (vramReclaimed || isVramSleepState()) zeroCv(a.canvas);
          bindEntityPointer(a);
          domChanged = true;
        }
      }
      activeIds = nextIds;
      quadEnabled = roster.d > 0 || roster.w > 0 || roster.f > 0 || roster.p > 0;
      miniPileEnabled = !!roster.minis;
      mascotSpec = encodeMascotSpec(roster);
      syncMascotDragRootAttr();
      return domChanged;
    };

    for (const a of activeMainActors()) bindEntityPointer(a);
    miniCrabs.forEach(bindEntityPointer);

    const hasDozeTransition = (now) =>
      activeMainActors().some((a) => a.overridePose && now < a.overrideUntil);
    const inTrans = () =>
      [...activeMainActors(), ...miniCrabs].some(
        (e) => e.dragging || e.ballisticActive || e.leap || e.y < -0.4 || abs(e.vy) > 0.01
      ) || !!reboundTm;
    const syncPwr = () => {
      if (disposed) return;
      if (isHostDetached() || parked) {
        syncHeartbeat();
        reclaimStageVram();
        return;
      }
      if (isDocHidden() || isHostSleeping()) {
        syncHeartbeat();
        reclaimStageVram();
        return;
      }
      if (!isAttrB()) {
        wb = false;
        if (dozing && !isDocHidden() && !isHostSleeping()) { wakeUp(); return; }
      }
      syncHeartbeat();
      if (!theaterTimer && currentTickMs > 0 && !dozing && !reducedMotion) scheduleTheater();
      if (!isWindowBlurred() && !isHostSleeping() && !isPpOpen()) renderAllFrames();
    };
    const onWBlur = () => {
      if (disposed) return;
      wb = true;
      for (let i = 0; i < dragReleaseHooks.length; i++) dragReleaseHooks[i]();
      syncHeartbeat();
    };
    const onWFocus = () => { wb = false; syncPwr(); };
    if (win && isFn(win.addEventListener)) {
      win.addEventListener('blur', onWBlur);
      win.addEventListener('focus', onWFocus);
      cleanups.push(() => { win.removeEventListener?.('blur', onWBlur); win.removeEventListener?.('focus', onWFocus); });
    }
    const MO0 = win?.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
    if (MO0 && doc?.documentElement) {
      try {
        let wasResizingAttr = Boolean(doc.documentElement.getAttribute?.(RESIZE_ATTR) === '1');
        const mo = new MO0((records) => {
          if (disposed) return;
          const nowResizingAttr = Boolean(doc.documentElement.getAttribute?.(RESIZE_ATTR) === '1');
          const resizeEnded = wasResizingAttr && !nowResizingAttr;
          wasResizingAttr = nowResizingAttr;
          if (resizeEnded) onStageResizeReleased();
          const hasPowerMut =
            !Array.isArray(records) ||
            records.some(
              (r) => !r || !r.attributeName || r.attributeName === WB || r.attributeName === PM || r.attributeName === PP_OPEN
            );
          if (hasPowerMut) syncPwr();
        });
        mo.observe(doc.documentElement, { attributes: true, attributeFilter: [WB, PM, PP_OPEN, RESIZE_ATTR] });
        cleanups.push(() => mo.disconnect());
      } catch {}
    }

    // ── 生态联动：活动唤醒 / 打盹 / 领衔交接 / 外部事件 notify ───────────────
    const faceToward = (from, to) => (!from || !to || to.x >= from.x ? 'right' : 'left');

    const onHeartbeat = () => {
      if (disposed) return;
      const now = nowMs();
      if (
        isHostDetached() ||
        parked ||
        isDocHidden() ||
        isHostSleeping() ||
        isPpOpen() ||
        (isWindowBlurred() && (dozing || !inTrans())) ||
        (reducedMotion && !inTrans())
      ) {
        syncHeartbeat(now);
        if (isVramSleepState()) reclaimStageVram();
        return;
      }
      tickIdx += 1;
      updateBalance();
      ecoTick(now);
      renderAllFrames(now);
      syncHeartbeat(now);
    };

    function syncHeartbeat(now = nowMs()) {
      let targetMs = TICK;
      if (
        disposed ||
        isHostDetached() ||
        parked ||
        isDocHidden() ||
        isHostSleeping() ||
        isPpOpen() ||
        (isWindowBlurred() && (dozing || !inTrans())) ||
        (reducedMotion && !inTrans())
      ) {
        targetMs = 0;
      } else if (dozing && !stageBusy() && !hasDozeTransition(now)) {
        targetMs = DOZE_TICK;
      }
      if (targetMs === 0 || dozing || reducedMotion) {
        clearTimeout(theaterTimer);
        theaterTimer = 0;
      } else if (!theaterTimer) {
        scheduleTheater();
      }
      if (isVramSleepState()) reclaimStageVram();
      if (targetMs === currentTickMs) return;
      if (tickTimer !== null) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
      currentTickMs = targetMs;
      if (targetMs > 0) {
        tickTimer = setInterval(onHeartbeat, targetMs);
        if (tickTimer && isFn(tickTimer.unref)) tickTimer.unref();
      }
    }

    function wakeUp() {
      if (!dozing) return;
      dozing = false;
      lastActivityAt = nowMs();
      syncHeartbeat();
      // 伸懒腰醒来（复用 stretch 姿态，各宠错峰 2 拍）
      const mains = activeMainActors();
      mains.forEach((a, i) => {
        const go = () => {
          if (!dozing && actors[a.id] === a) {
            startClip(a, a.kind === 'whale' ? 'whaleSpout' : 'stretch', a.kind === 'whale' ? 1200 : 1100);
          }
        };
        if (!i) go(); else later(TICK * 2 * i, go);
      });
      renderAllFrames();
    }

    function markActivity() {
      if (!isAttrB()) wb = false;
      lastActivityAt = nowMs();
      if (dozing && !isHostSleeping() && !isWindowBlurred()) wakeUp();
      else syncHeartbeat();
    }

    // 进入打盹：先打哈欠（错峰 0.4s），哈欠结束后由 resolvePoseFor 接管为 sleep 并拉宽至 400ms
    function startDoze(skipYawn) {
      if (dozing) return;
      dozing = true;
      for (const a of activeMainActors()) {
        if (a.overridePose && a.overridePose !== 'dangle') a.overrideUntil = 0;
        a.eyeScan = 0;
      }
      if (!skipYawn) {
        const prePose = isLateNight() ? 'nightSip' : 'yawn';
        const preMs = isLateNight() ? 1800 : 1200;
        activeMainActors().forEach((a, idx) => {
          if (!idx) startClip(a, prePose, preMs);
          else later(400 * idx, () => { if (dozing) startClip(a, prePose, preMs); });
        });
      }
      const now = nowMs();
      renderAllFrames(now);
      syncHeartbeat(now);
    }

    const bumpSeq = (p) => [['squash', 1, 2, -1, 0], [p, 2, -1, 1, -2], ['idle', 1, 1, -1, 0]];

    // 每拍生态检查：忙碌视为活动；空闲超时则打盹；检测自主散步遇障（撑跳越过 / 搭便车 / 礼貌转身）与伙伴碰撞
    const ecoTick = (now) => {
      if (stageBusy()) {
        lastActivityAt = now;
        if (dozing) wakeUp();
        return;
      }
      if (!dozing && now - lastActivityAt > (isLateNight() ? DOZE_AFTER_NIGHT_MS : DOZE_AFTER_MS)) {
        startDoze(false);
        return;
      }
      if (reducedMotion || dozing || now < duetUntil) return;

      const mains = activeMainActors();
      const freeG = (e) => !e.dragging && !e.ballisticActive && !e.stackedOn && !e.leap && e.y === 0;
      const isWalk = (a) => resolvePoseFor(a, now) === 'walk' && now < a.overrideUntil;
      for (let i = 0; i < mains.length; i++) {
        const a = mains[i];
        if (!freeG(a)) continue;
        const aW = isWalk(a);
        for (let j = i + 1; j < mains.length; j++) {
          const b = mains[j];
          if (!freeG(b)) continue;
          const enc = classifyPairEncounter({
            xA: a.x, yA: a.y, walkingA: aW, dirA: a.patrolDir,
            xB: b.x, yB: b.y, walkingB: isWalk(b), dirB: b.patrolDir,
            contactDist: 46, verticalTol: 22,
          });
          if (enc?.kind === 'bump' && canTriggerPair(`mainWalk:${a.id}:${b.id}`, now, 1200)) {
            a.x = clampActorX(a.x - enc.sign * 5);
            b.x = clampActorX(b.x + enc.sign * 5);
            a.faceDir = enc.sign > 0 ? 'right' : 'left';
            b.faceDir = enc.sign > 0 ? 'left' : 'right';
            a.sym = 'bang'; b.sym = 'spark';
            a.symUntil = b.symUntil = now + 850;
            a.overridePose = b.overridePose = 'idle';
            a.overrideUntil = b.overrideUntil = now + 440;
            playSeq(a, bumpSeq('wow'));
            playSeq(b, bumpSeq('tilt'));
            later(420, () => {
              if (disposed || stageBusy() || reducedMotion || dozing) return;
              startClip(a, 'walk', 2200, { patrolDir: -enc.sign });
              startClip(b, 'walk', 2200, { patrolDir: enc.sign });
            });
            recordInteraction('bump', `${a.id}-${b.id}`, now);
            return;
          }
          if (enc?.kind === 'passBy' && canTriggerPair(`mainPass:${a.id}:${b.id}`, now, 1500)) {
            triggerObstacleEncounter((enc.mover === 'A' ? a : b).id, (enc.mover === 'A' ? b : a).id);
            return;
          }
        }
      }

      // 场景 4 · 散步遇障（主宠与自由迷你蟹相遇时触发撑跳越过 / 自动搭便车 / 驻足眨眼转身）
      if (miniPileEnabled) {
        for (const a of mains) {
          if (!freeG(a)) continue;
          const aWalk = isWalk(a);
          for (const mc of miniCrabs) {
            if (!freeG(mc) || mc.act) continue;
            const d = getEntWorldCx(mc) - getEntWorldCx(a);
            if (abs(d) < 40 && canTriggerPair(`obs:${a.id}:${mc.id}`, now, 1600)) {
              if (aWalk && d * a.patrolDir > 0) { triggerObstacleEncounter(a.id, mc.id); return; }
              if (d * mc.dir < 0) { triggerObstacleEncounter(mc.id, a.id); return; }
            }
          }
        }
      }
    };

    // 原地整格小跳（减少动态 / 拖拽 / 叠叠乐 / 腾空时跳过，直接回调）
    const hop = (a, airPose, then) => {
      const now = nowMs();
      const partnerOnTop = Boolean(findDirectRider(a.id));
      if (reducedMotion || !actorFree(a, now) || partnerOnTop) {
        if (then) then();
        return;
      }
      playSeq(a, hopSteps(airPose), then);
    };

    // 扫视：转身 + 竖瞳偏向；up=true 时抬头
    const gaze = (a, dir, ms, up = false, sym = null) => {
      const now = nowMs();
      if (a.dragging || (a.overridePose === 'dangle' && now < a.overrideUntil)) return;
      startClip(a, 'gaze', ms, { face: dir === 'left' ? 'left' : 'right', param: up ? 1 : 0, sym: sym || undefined });
    };

    // 领衔位交接：新阵营下蹲小跳交换站位；落地后新阵营全员冒 spark、旧阵营点头，三蟹迎宾挥手
    const campHandoff = (prevCamp = null) => {
      const now = nowMs();
      if (now - lastHandoffAt < 700) return;
      lastHandoffAt = now;
      duetUntil = now + 1200;
      const workers = workingActors();
      const leader = workers[0] || null;
      if (!leader) {
        crabsWave();
        renderAllFrames();
        return;
      }
      const prevList = prevCamp ? campActors(prevCamp).filter((a) => !workers.includes(a)) : [];
      const old = prevList[0] || partnerActor();
      const hasOld = Boolean(old && old !== leader);
      const finish = () => {
        if (disposed) return;
        for (const w of workers) startClip(w, 'happy', 900, { sym: 'spark' });
        if (hasOld) startClip(old, 'lookNod', 1300, { face: faceToward(old, leader), param: 2 });
        crabsWave();
        renderAllFrames();
      };
      if (reducedMotion) {
        resetHomePositions(false);
        finish();
        return;
      }
      const jumpers = hasOld ? [...workers, old] : [...workers];
      let pending = jumpers.length;
      const done = () => {
        pending -= 1;
        if (pending === 0) finish();
      };
      for (const a of jumpers) hop(a, 'jiggle', done);
      later(TICK * 2, () => resetHomePositions(false));
    };

    const celebrateDone = () => {
      const mains = activeMainActors();
      if (!mains.length) {
        crabsWave();
        return;
      }
      const workers = workingActors();
      const workerSet = new Set(workers);
      const now = nowMs();
      for (const w of workers) {
        w.sym = 'heart';
        w.symUntil = now + 1500;
      }
      if (reducedMotion) {
        mains.forEach((a) =>
          startClip(
            a,
            workerSet.has(a) ? 'happy' : a.kind === 'whale' ? 'whaleSpout' : 'happy',
            900,
            workerSet.has(a) ? { sym: 'heart' } : {}
          )
        );
        return;
      }
      mains.forEach((a) => hop(a, 'jiggle'));
    };

    // ── 9 大 Slash 指令专属微剧场（2.4~2.8s，演完归零 0fps）──────────────────
    let lastVialWarnAt = 0;
    const SLASH_HANDLERS = {
      plan(workers, partners, fP) {
        for (const w of workers) startClip(w, 'slashPlan', 2600);
        for (const p of partners) {
          startClip(p, 'tilt', 1300, { rot: -8, sym: 'q', face: fP(p) });
          later(1350, () => { if (!disposed && actors[p.id] === p) startClip(p, 'lookNod', 1200, { face: fP(p), param: 2 }); });
        }
      },
      goal(workers, partners) {
        for (const w of workers) startClip(w, 'slashGoal', 2600);
        for (const p of partners) startClip(p, 'salute', 2400, { sym: 'spark' });
      },
      boost(workers, partners) {
        for (const w of workers) {
          startClip(w, 'slashBoost', 2600);
          if (!reducedMotion) { spawnChromaBurst(getEntWorldCx(w), computeWorldFootY(w) - 18, 12, false); hop(w, 'slashBoost'); }
        }
        for (const p of partners) startClip(p, 'wow', 2200, { sym: 'spark' });
      },
      teamwork(workers, partners) {
        for (const w of workers) startClip(w, 'slashTeam', 2800);
        for (const p of partners) startClip(p, 'salute', 2600, { sym: 'spark' });
        if (miniPileEnabled) {
          const mid = round(readStageWidth() * 0.45);
          miniCrabs.forEach((mc, idx) => {
            if (mc.act?.type === 'ride') return;
            const x0 = crabSafeX(mc.lastX), tx = crabSafeX(mid + (idx - 1) * 28);
            mc.act = {
              type: 'wave', start: tickIdx + 1,
              segs: [
                { ticks: 6, x0, x1: tx, y0: 0, y1: 0, sprite: 'walk' },
                { ticks: 14, x0: tx, x1: tx, y0: 0, y1: 0, sprite: 'wave', hop: true },
                { ticks: 6, x0: tx, x1: x0, y0: 0, y1: 0, sprite: 'walk' },
              ],
            };
          });
        }
      },
      browser(workers, partners) {
        for (const w of workers) {
          const startX = w.x, dir = startX > readStageWidth() * 0.5 ? -1 : 1;
          startClip(w, 'slashBrowser', 2600, { mirror: dir < 0 });
          if (!reducedMotion && !w.stackedOn && !w.dragging) {
            w.x = clampActorX(startX + dir * 28);
            later(2200, () => { if (!disposed && actors[w.id] === w && !w.dragging && !w.stackedOn) resetHomePositions(true); });
          }
        }
        for (const p of partners) startClip(p, 'wow', 2200, { sym: 'spark' });
      },
      compact() {
        for (const a of activeMainActors()) startClip(a, 'slashCompact', 2800, a.kind === 'cat' || a.kind === 'whale' ? { mirror: true } : {});
      },
      schedule(workers, partners, fP) {
        scheduleWatchUntil = Date.now() + 18e5;
        renderHabitatProp(true);
        for (const w of workers) startClip(w, 'slashSchedule', 2600);
        for (const p of partners) startClip(p, 'lookNod', 2200, { face: fP(p), param: 3 });
      },
      'grill-me'(workers, partners, fP) {
        for (const w of workers) startClip(w, 'slashGrill', 2600);
        for (const p of partners) startClip(p, 'lookNod', 2400, { face: fP(p), param: 4 });
      },
      learn() {
        for (const a of activeMainActors()) startClip(a, a.kind === 'cat' || a.kind === 'dragon' ? 'slashLearnBook' : 'slashLearnBulb', 2600);
      },
    };
    const runSlashTheater = (rawCmd) => {
      const cmd = String(rawCmd || '').replace(/^\/+/, '').trim().toLowerCase();
      const norm = cmd === 'swarm' ? 'teamwork' : cmd;
      const fn = cmd && !disposed && hasOwn(SLASH_HANDLERS, norm) ? SLASH_HANDLERS[norm] : null;
      if (!fn) return false;
      const now = nowMs();
      const workers = workingActors();
      const leader = workers[0] || null;
      const partners = activeMainActors().filter((a) => !workers.includes(a));
      duetUntil = now + 2900;
      fn(workers, partners, (p) => faceToward(p, leader));
      recordInteraction('slash:' + norm, leader ? leader.id : 'minis', now);
      return true;
    };

    // 外部事件处理表（未知事件静默忽略）
    const NOTIFY = {
      activity() {},
      'slash-cmd'(p) {
        if (!runSlashTheater(p?.cmd)) NOTIFY.send();
      },
      'effort-tier'(p) {
        const tier = String(p?.tier || '').toLowerCase();
        if (tier === 'high' || tier === 'xhigh') {
          const workers = workingActors();
          if (!workers.length) return;
          for (const w of workers) {
            startClip(w, 'slashBoost', 2200, { sym: 'spark' });
            if (!reducedMotion) spawnChromaBurst(getEntWorldCx(w), computeWorldFootY(w) - 16, 6, true);
          }
          recordInteraction('effort-tier:' + tier, workers[0].id, nowMs());
        }
      },
      'vial-high'() {
        const wallNow = Date.now();
        if (wallNow - lastVialWarnAt < 600000) return;
        const mains = activeMainActors();
        if (!mains.length) return;
        lastVialWarnAt = wallNow;
        const leftPet = mains.reduce((best, cur) => (cur.x < best.x ? cur : best), mains[0]);
        if (leftPet.dragging || leftPet.stackedOn) return;
        const origX = leftPet.x;
        if (!reducedMotion) leftPet.x = clampActorX(16);
        startClip(leftPet, 'worry', 2200, { face: 'left', mirror: true, sym: 'sweat' });
        recordInteraction('vial-high', leftPet.id, nowMs());
        later(2300, () => {
          if (!disposed && actors[leftPet.id] === leftPet && !leftPet.dragging && !leftPet.stackedOn) {
            leftPet.x = clampActorX(origX);
            resetHomePositions(true);
            renderAllFrames();
          }
        });
      },
      'aura-complete'() {
        const now = nowMs();
        const mains = activeMainActors();
        if (!mains.length) {
          crabsWave();
          recordInteraction('aura-complete', 'minis', now);
          return;
        }
        duetUntil = now + 2200;
        const cat = mains.find((a) => a.kind === 'cat');
        const clawd = mains.find((a) => a.kind === 'clawd');
        for (const a of mains) {
          if (a.kind === 'dragon') startClip(a, 'dragonFlame', 2000, { sym: 'spark' });
          else if (a.kind === 'whale') startClip(a, 'whaleSpout', 2000, { sym: 'heart' });
          else if (a.kind === 'fox') startClip(a, 'foxWisp', 2000, { sym: 'spark' });
          else if (a.kind === 'panda') startClip(a, 'pandaBamboo', 2000, { sym: 'heart' });
          else if (a.kind === 'cat') startClip(a, 'happy', 2000, { face: clawd ? faceToward(a, clawd) : 'left', sym: 'spark' });
          else startClip(a, 'happy', 2000, { face: cat ? faceToward(a, cat) : 'right', sym: 'heart' });
        }
        if (!reducedMotion) {
          mains.forEach((a) => hop(a, 'happy'));
        }
        recordInteraction('aura-complete', mains.length > 2 ? 'multi' : 'clawd-cat', now);
      },
      campSwitch() {
        // 与 setState 自动触发 700ms 内去重，避免主代理双路调用时重复交接
        campHandoff();
      },
      'model-shift'() {
        chromaGates.tuned = true;
        for (const w of workingActors()) gaze(w, 'left', 800, true, 'spark');
      },
      'vial-opened'() {
        chromaGates.tuned = true;
        activeMainActors().forEach((a) => gaze(a, 'left', 820, false, 'spark'));
      },
      'code-copied'() {
        chromaGates.forged = true;
        const now = nowMs();
        for (const w of workingActors()) {
          w.nodY = PX;
          w.nodUntil = now + 180;
          w.sym = 'note';
          w.symUntil = now + 850;
        }
      },
      'files-changed'() {
        chromaGates.forged = true;
        for (const w of workingActors()) startClip(w, 'salute', 780, { sym: 'spark' });
      },
      complete() {
        chromaGates.forged = true;
        celebrateDone();
      },
      orchestrator(p) {
        orchestrator = !!p.on;
        if (orchestrator) {
          activeMainActors().forEach((a) => gaze(a, 'left', 900, true, 'spark'));
        }
      },
      streamDone(p) {
        if (p.error) {
          activeMainActors().forEach((a) => startClip(a, 'worry', 1500, { sym: 'sweat' }));
          return;
        }
        chromaGates.forged = true;
        celebrateDone();
      },
      ripple(p) {
        const x = Number(p.x);
        if (!isFin(x)) return;
        for (const a of activeMainActors()) {
          const dir = x < a.x + 48 ? 'left' : 'right';
          gaze(a, dir, 700);
          if (a.kind === 'cat' || a.kind === 'dragon') {
            a.forceTwitchStart = tickIdx;
            a.forceTwitchSide = dir === 'left' ? 'L' : 'R';
          }
        }
      },
      send() {
        const workers = workingActors();
        const leader = workers[0] || null;
        if (!leader) {
          crabsWave();
          return;
        }
        for (const w of workers) startClip(w, 'salute', 900, { sym: 'spark' });
        for (const p of activeMainActors()) {
          if (!workers.includes(p)) startClip(p, 'lookNod', 1200, { face: faceToward(p, leader), param: 2 });
        }
      },
      'host-sleep'(p) {
        hostSleep = !!(p?.sleep);
        syncHeartbeat();
        if (hostSleep || isVramSleepState()) {
          reclaimStageVram();
        } else if (!isWindowBlurred()) {
          renderAllFrames();
        }
      },
    };
    const handleNotify = (event, payload) => {
      if (disposed) return;
      const fn = hasOwn(NOTIFY, event) ? NOTIFY[event] : null;
      if (!fn) return;
      const pl = payload && typeof payload === 'object' ? payload : {};
      if (event === 'host-sleep') {
        fn(pl);
        return;
      }
      const wasDozing = dozing;
      markActivity();
      if (event === 'activity') {
        if (wasDozing) renderAllFrames();
        return;
      }
      fn(pl);
      renderAllFrames();
    };

    // 鼠标靠近舞台或切回可见标签页时，0ms 恢复 100ms 灵敏心跳
    const onApproach = () => {
      markActivity();
    };
    if (isFn(hostEl.addEventListener)) {
      hostEl.addEventListener('pointerenter', onApproach, { passive: true });
      hostEl.addEventListener('pointermove', onApproach, { passive: true });
      cleanups.push(() => {
        hostEl.removeEventListener('pointerenter', onApproach);
        hostEl.removeEventListener('pointermove', onApproach);
      });
    }
    const onVisibilityChange = () => {
      if (disposed) return;
      syncHeartbeat();
      if (isVramSleepState()) {
        reclaimStageVram();
      } else if (!isWindowBlurred()) {
        renderAllFrames();
      }
    };
    if (doc && isFn(doc.addEventListener)) {
      doc.addEventListener('visibilitychange', onVisibilityChange);
      cleanups.push(() => {
        doc.removeEventListener('visibilitychange', onVisibilityChange);
      });
    }

    const mountOntoStack = (riderId, holderId) => {
      const rider = getEnt(riderId);
      const holder = getEnt(holderId);
      if (!rider || !holder || rider.id === holder.id) return false;
      if (!miniPileEnabled && (isMiniEnt(rider) || isMiniEnt(holder))) return false;
      const top = getStackTop(holder.id);
      if (!top || getTowerMembers(top.id).includes(rider.id)) return false;
      const riderSubLen = getTowerMembers(rider.id).length;
      const baseLen = getTowerMembers(top.id).length;
      if (baseLen + riderSubLen > maxTowerDepthAllowed()) return false;
      if (rider.stackedOn) {
        detachWithGravitySettle(rider.id);
      }
      rider.flying += 1;
      rider.ballisticActive = false;
      rider.leap = null;
      if (isMiniEnt(rider)) rider.act = null;
      rider.stackedOn = top.id;
      rider.y = 0;
      rider.vx = 0;
      rider.vy = 0;
      rider.rot = 0;
      rider.perchUntil = 0;
      if (!isMiniEnt(rider)) {
        rider.seq = null;
        startClip(rider, 'happy', 900, { sym: 'heart' });
      }
      syncAllStackedFollowers();
      renderAllFrames();
      return true;
    };

    const syncPeekInteractivity = () => {
      const isPeek = yieldMode === 'peek';
      if (hostEl) {
        if (isPeek) hostEl.setAttribute?.('data-ag-mascot-peek', '1');
        else hostEl.removeAttribute?.('data-ag-mascot-peek');
      }
      if (isPeek) {
        dragReleaseHooks.forEach((fn) => { try { fn(); } catch {} });
      }
      for (const a of activeMainActors()) {
        if (!a?.el) continue;
        a.el.setAttribute?.('tabindex', '-1');
        if (isPeek) a.el.setAttribute?.('aria-hidden', 'true');
        else a.el.removeAttribute?.('aria-hidden');
        if (a.el.style) a.el.style.pointerEvents = isPeek ? 'none' : '';
        applyActorTransform(a, nowMs());
      }
      if (miniGroupEl?.style) miniGroupEl.style.pointerEvents = isPeek ? 'none' : '';
      for (const mc of miniCrabs) {
        if (!mc?.el) continue;
        if (mc.el.style) mc.el.style.pointerEvents = isPeek ? 'none' : 'auto';
        const mz = miniZ(mc);
        if (mc.lastDomZ !== mz) {
          mc.lastDomZ = mz;
          if (mc.el.style) mc.el.style.zIndex = mz;
        }
      }
    };

    syncPeekInteractivity();
    renderAllFrames();
    syncHeartbeat();

    return {
      setState(next = {}) {
        const prev = [popoverRightWidth, camp, streaming, streamTier, hasError, yieldMode, leapOffsetY, miniPileEnabled, quadEnabled, orchestrator, reducedMotion, mascotSpec];
        if (next.camp !== undefined) camp = normalizeCamp(next.camp);
        if (next.streaming !== undefined) streaming = !!next.streaming;
        if (next.streamTier !== undefined) streamTier = Number(next.streamTier || 2);
        if (next.hasError !== undefined) hasError = !!next.hasError;
        if (next.yieldMode !== undefined) yieldMode = next.yieldMode || 'none';
        if (next.leapOffsetY !== undefined) leapOffsetY = Number(next.leapOffsetY || 0);
        if (next.popoverRightWidth !== undefined) popoverRightWidth = Number(next.popoverRightWidth || 0);
        if (next.orchestrator !== undefined) orchestrator = !!next.orchestrator;
        if (next.reducedMotion !== undefined) {
          reducedMotion = !!next.reducedMotion;
          if (reducedMotion && !prev[10]) freezeMotion();
          else if (!reducedMotion && prev[10]) lastActivityAt = nowMs();
        }

        let nextRoster = { ...roster };
        let rosterFromSpec = false;
        if (next.mascot !== undefined) {
          const parsed = parseMascotSpec(next.mascot);
          if (parsed) {
            nextRoster = parsed;
            rosterFromSpec = true;
          }
        }
        if (!rosterFromSpec) {
          if (next.quadEnabled !== undefined) {
            const q = !!next.quadEnabled;
            if (q) {
              if (nextRoster.c === 0 && nextRoster.k === 0 && nextRoster.d === 0 && nextRoster.w === 0) {
                nextRoster.c = 1;
                nextRoster.k = 1;
              }
              nextRoster.d = 1;
              nextRoster.w = 1;
            } else {
              nextRoster.d = 0;
              nextRoster.w = 0;
              if (nextRoster.c === 0 && nextRoster.k === 0) {
                nextRoster.c = 1;
                nextRoster.k = 1;
              }
            }
          }
          if (next.miniPileEnabled !== undefined) nextRoster.minis = !!next.miniPileEnabled;
        }
        const nextMascotSpec = encodeMascotSpec(nextRoster);
        const nextQuad = nextRoster.d > 0 || nextRoster.w > 0;
        const nextMinis = !!nextRoster.minis;
        roster = nextRoster;
        mascotSpec = nextMascotSpec;
        quadEnabled = nextQuad;
        miniPileEnabled = nextMinis;

        const cur = [popoverRightWidth, camp, streaming, streamTier, hasError, yieldMode, leapOffsetY, miniPileEnabled, quadEnabled, orchestrator, reducedMotion, mascotSpec];
        if (cur.every((v, i) => v === prev[i])) return;

        if (mascotSpec !== prev[11] || quadEnabled !== prev[8]) {
          const domChanged = syncRosterActors();
          if (domChanged) {
            resetHomePositions(false);
            syncPeekInteractivity();
          }
        }
        if (camp !== prev[1]) {
          // 挂载后阵营实际变化：自动播放领衔交接（站位交换在其内部完成）
          markActivity();
          campHandoff(prev[1]);
          if (nowMs() - lastHandoffAt > 50) resetHomePositions(popoverRightWidth !== prev[0]);
        } else if (popoverRightWidth !== prev[0] || miniPileEnabled !== prev[7]) {
          resetHomePositions(popoverRightWidth !== prev[0]);
        }
        if (yieldMode !== prev[5] || leapOffsetY !== prev[6]) syncPeekInteractivity();
        if (reducedMotion !== prev[10] || streaming !== prev[2]) syncHeartbeat();
        renderAllFrames();
      },
      notify(event, payload = {}) {
        handleNotify(event, payload);
      },
      stackOnto(riderId, holderId) {
        return mountOntoStack(riderId, holderId);
      },
      pullFromStack(id, mode = 'settle') {
        const ent = getEnt(id);
        if (!ent) return false;
        if (mode === 'sideHop') {
          return dismountRidersSideHop(ent.id);
        }
        const origCx = getEntWorldCx(ent);
        detachWithGravitySettle(ent.id);
        resetActorTransient(ent);
        ent.y = 0;
        setEntWorldCx(ent, origCx - 64);
        enforceGroundSeparation();
        renderAllFrames();
        return true;
      },
      triggerObstacle(moverId, obstacleId, forcedAction = null) {
        return triggerObstacleEncounter(moverId, obstacleId, forcedAction);
      },
      triggerDemo(kind) {
        const now = nowMs(), leader = leaderActor(), partner = partnerActor();
        inspectState = null;
        const stageObs = (mode) => {
          if (!leader || !partner || leader === partner) return;
          partner.stackedOn = leader.stackedOn = null;
          partner.y = leader.y = 0;
          const mid = round((clampActorX(9999) + 16) * 0.48);
          partner.x = clampActorX(mid);
          leader.x = clampActorX(mid - 50);
          triggerObstacleEncounter(leader.id, partner.id, mode);
        };
        const DEMO = {
          doze: () => startDoze(true),
          wake: markActivity,
          theater: () => { markActivity(); runDuet(pickDuet()); },
          campSwitch: () => {
            markActivity();
            const prevC = camp;
            const presentCamps = ['claude', 'gemini', 'gpt', 'deepseek'].filter((c) => campActors(c).length > 0);
            const order = presentCamps.length >= 2 ? presentCamps : quadEnabled ? ['claude', 'gemini', 'gpt', 'deepseek'] : ['claude', 'gemini'];
            camp = order[(order.indexOf(camp) + 1) % order.length];
            lastHandoffAt = 0;
            campHandoff(prevC);
          },
          streamDone: () => { markActivity(); NOTIFY.streamDone({ error: false }); },
          crabRide: () => { markActivity(); miniPileEnabled = true; roster.minis = true; mascotSpec = encodeMascotSpec(roster); resetHomePositions(false); runCrabRide(true); },
          bump: () => {
            markActivity();
            const mains = activeMainActors();
            const c = actors.clawd || mains[0];
            const k = (actors.cat && actors.cat !== c ? actors.cat : mains.find((a) => a !== c)) || null;
            if (!c || !k) return;
            const mid = round((clampActorX(9999) + 16) * 0.46);
            c.stackedOn = k.stackedOn = null; c.y = k.y = 0;
            c.x = clampActorX(mid - 20); k.x = clampActorX(mid + 20);
            c.sym = 'bang'; k.sym = 'spark'; c.symUntil = k.symUntil = now + 900;
            playSeq(c, bumpSeq('wow')); playSeq(k, bumpSeq('tilt'));
            recordInteraction('bump', `${c.id}-${k.id}`, now);
          },
          passBy: () => { markActivity(); stageObs('leapfrog'); },
          leapfrog: () => stageObs('leapfrog'),
          autoPerch: () => stageObs('autoPerch'),
          greetTurn: () => stageObs('greetTurn'),
          stack: () => {
            if (partner && leader && partner !== leader) mountOntoStack(partner.id, leader.id);
            else if (miniPileEnabled && miniCrabs.length >= 2) mountOntoStack(miniCrabs[1].id, miniCrabs[0].id);
          },
          unstack: () => {
            for (const e of allActiveEnts()) { e.stackedOn = null; e.perchUntil = 0; resetActorTransient(e); e.y = 0; }
            resetHomePositions(true);
          },
          toss: () => {
            if (!leader) return;
            dismountRidersSideHop(leader.id);
            if (leader.stackedOn) detachWithGravitySettle(leader.id);
            leader.y = -48;
            startBallistic(leader, -3.5, -7.8);
          },
          poke: () => { if (leader) triggerPoke(leader, false); },
          feedDonut: () => { if (leader) feedActor(leader, 'donut'); },
          feedCoffee: () => { if (leader) feedActor(leader, 'coffee'); },
          vialHigh: () => { lastVialWarnAt = 0; NOTIFY['vial-high']({}); },
          auraComplete: () => NOTIFY['aura-complete']({}),
          effortHigh: () => NOTIFY['effort-tier']({ tier: 'xhigh' }),
        };
        if (hasOwn(DEMO, kind)) DEMO[kind]();
        else if (typeof kind === 'string' && /^(?:slash:|\/)/.test(kind)) { markActivity(); runSlashTheater(kind.replace(/^(?:slash:|\/)/, '')); }
        else if (leader) {
          const mapped = { fire: 'onFire', cheer: 'cheerSticks', rickroll: 'rickroll', siren: 'siren' }[kind] || kind;
          if (['onFire', 'siren', 'spinHop'].includes(mapped)) dismountRidersSideHop(leader.id);
          startClip(leader, mapped, 3800);
          if (partner && partner !== leader && ['onFire', 'cheerSticks', 'rickroll', 'siren'].includes(mapped)) {
            startClip(partner, mapped === 'cheerSticks' ? 'cheerSticks' : 'wow', 3600, { sym: mapped === 'siren' ? 'sweat' : 'spark' });
          }
        }
        renderAllFrames(now);
      },
      inspectPose(opts = null) {
        if (!opts || opts.active === false) {
          inspectState = null;
          syncHeartbeat();
          renderAllFrames();
          return null;
        }
        inspectState = {
          pose: opts.pose || 'idle',
          tick: isFin(opts.tick) ? max(0, floor(opts.tick)) : tickIdx,
          mirror: !!opts.mirror,
          sqW: round(Number(opts.sqW || 0)),
          sqH: round(Number(opts.sqH || 0)),
          ruler: !!opts.ruler,
          sym: opts.sym || null,
        };
        tickIdx = inspectState.tick;
        renderAllFrames();
        return { ...inspectState };
      },
      stepTick(delta = 1) {
        const d = round(Number(delta || 1));
        tickIdx = max(0, tickIdx + d);
        if (inspectState) inspectState.tick = tickIdx;
        renderAllFrames();
        return tickIdx;
      },
      listPoses() {
        return ALL_POSE_KEYS.slice();
      },
      poke(id = 'cat') {
        const target = actors[id] || activeMainActors()[0] || null;
        if (target) triggerPoke(target, false);
      },
      feed(id = 'cat', item = 'donut') {
        const target = actors[id] || activeMainActors()[0] || null;
        return target ? feedActor(target, item) : false;
      },
      setHabitatPreview(mode = 'auto') {
        habitatPreview = ['auto', 'cactus', 'lamp', 'hourglass'].includes(mode) ? mode : 'auto';
        renderHabitatProp(true);
        return resolveHabitatMode();
      },
      onUserType(text = '') {
        const now = nowMs();
        markActivity();
        const workers = workingActors();
        const mains = activeMainActors();
        if (!workers.length) return;
        const trimmed = String(text || '').replace(/\s+$/, '');
        const lower = trimmed.toLowerCase();
        // 隐藏打字关键词彩蛋（5 秒冷却防刷屏，静默自然不加任何 UI）
        const kwOk = now - lastTypeKwAt > 5000;
        if (kwOk && /(柠檬|lemon)$/i.test(lower)) {
          lastTypeKwAt = now;
          for (const a of mains) {
            startClip(a, a.kind === 'fox' ? 'foxWisp' : a.kind === 'panda' ? 'pandaBamboo' : 'happy', 1800, { sym: 'heart' });
            if (!reducedMotion && !a.stackedOn) hop(a, 'happy');
          }
          if (!reducedMotion && mains.length) spawnChromaBurst(getEntWorldCx(mains[0]), -24, 14, false);
          recordInteraction('egg:lemon', mains[0]?.id || 'cat', now);
        } else if (kwOk && /(大肥鱼|肥鱼)$/i.test(lower)) {
          lastTypeKwAt = now;
          for (const a of mains) {
            startClip(a, a.kind === 'whale' ? 'whaleSpout' : 'cheerSticks', 2200, { sym: 'heart' });
            if (!reducedMotion && !a.stackedOn) hop(a, 'happy');
          }
          if (!reducedMotion && mains.length) spawnChromaBurst(getEntWorldCx(mains[0]), -26, 16, false);
          recordInteraction('egg:dafeiyu', mains[0]?.id || 'cat', now);
        } else if (kwOk && /(咖啡|续命|coffee)$/i.test(lower)) {
          lastTypeKwAt = now;
          for (const a of mains) startClip(a, 'feedCoffee', 2100, { sym: 'heart' });
          recordInteraction('egg:coffee', mains[0]?.id || 'cat', now);
        } else if (kwOk && /(下班|放假|通过|ac)$/i.test(lower)) {
          lastTypeKwAt = now;
          for (const a of mains) {
            startClip(a, 'cheerSticks', 2000, { sym: 'spark' });
            if (!reducedMotion && !a.stackedOn) hop(a, 'happy');
          }
          if (!reducedMotion && mains.length) spawnChromaBurst(getEntWorldCx(mains[0]), -24, 12, false);
          recordInteraction('egg:offwork', mains[0]?.id || 'cat', now);
        } else if (kwOk && /(竹子|熊猫|panda)$/i.test(lower) && actors.panda) {
          lastTypeKwAt = now;
          startClip(actors.panda, 'pandaBamboo', 2200, { sym: 'heart' });
          recordInteraction('egg:bamboo', 'panda', now);
        } else if (kwOk && /(狐狸|小赤狐|星火|fox)$/i.test(lower) && actors.fox) {
          lastTypeKwAt = now;
          startClip(actors.fox, 'foxWisp', 2200, { sym: 'spark' });
          recordInteraction('egg:fox', 'fox', now);
        } else if (kwOk && /(bug|报错|error)$/i.test(lower)) {
          lastTypeKwAt = now;
          for (const w of workers) startClip(w, 'worry', 1300, { sym: 'sweat' });
          recordInteraction('egg:bug', workers[0].id, now);
        } else if (kwOk && /(摸鱼|好困|晚安|sleep)$/i.test(lower)) {
          lastTypeKwAt = now;
          for (const a of mains) startClip(a, 'yawn', 1400, { sym: 'z1' });
          recordInteraction('egg:sleepy', mains[0]?.id || 'cat', now);
        } else if (kwOk && /(加油|666|牛哇|真棒)$/i.test(lower)) {
          lastTypeKwAt = now;
          for (const a of mains) startClip(a, 'cheerSticks', 1600, { sym: 'spark' });
          recordInteraction('egg:cheer', mains[0]?.id || 'cat', now);
        } else if (/[?？]$/.test(trimmed)) {
          for (const w of workers) startClip(w, 'tilt', 750, { rot: -9, sym: 'q' });
        } else if (/[!！]$/.test(trimmed)) {
          for (const w of workers) startClip(w, 'wow', 700, { sym: 'bang' });
        } else {
          for (const w of workers) {
            w.nodY = PX; // 打字点头：整格下沉 1 格
            w.nodUntil = now + 140;
            w.eyeScan = 0;
          }
          clearTimeout(pauseTimer);
          pauseTimer = setTimeout(() => {
            if (disposed) return;
            for (const w of workingActors()) w.eyeScan = tickIdx % 2 ? -1 : 1;
            renderAllFrames();
            later(500, () => {
              for (const w of activeMainActors()) w.eyeScan = 0;
            });
          }, 450);
        }
        renderAllFrames(now);
      },
      setRimLight(n = null) {
        if (disposed) return;
        const on = Boolean(n?.active && Number(n.strength) > 0.015);
        const x = on ? Number(n.localX) || 0 : -9999;
        const s = on ? max(0, min(1, Number(n.strength) || 0)) : 0;
        const t = on && RIM_PALS[n.toneKey] ? n.toneKey : 'default';
        const d = on ? n.dark !== false : true;
        const sig = on ? `1|${round(x / 6)}|${round(s * 12)}|${t}|${d ? 1 : 0}` : '0';
        if (sig === rimSig) return;
        rimSig = sig;
        rim.on = on;
        rim.x = x;
        rim.s = s;
        rim.t = t;
        rim.d = d;
        if (!isVramSleepState() && !isWindowBlurred() && !isPpOpen()) renderAllFrames();
      },
      getLayoutSnapshot() {
        const now = nowMs();
        return {
          camp,
          mascot: mascotSpec,
          roster: { ...roster },
          miniPileEnabled,
          quadEnabled,
          reducedMotion,
          // 生态联动与按需渲染遥测只读诊断
          dozing,
          orchestrator,
          rimLight: { active: rim.on, strength: round(rim.s * 100) / 100, toneKey: rim.t },
          habitat: {
            mode: resolveHabitatMode(),
            scheduleActive: Date.now() < scheduleWatchUntil,
          },
          towers: listAllTowers(),
          chromaResonance: {
            active: prismaticCoat,
            tuned: chromaGates.tuned,
            forged: chromaGates.forged,
            sparkCount: chromaSparks.length,
          },
          perf: {
            timerIntervalMs: currentTickMs,
            timerPaused: isHostDetached() || parked || isWindowBlurred() || isHostSleeping() || currentTickMs === 0,
            vramReclaimed,
            canvasDraws: perfStats.canvasDraws,
            canvasSkips: perfStats.canvasSkips,
            domTransformWrites: perfStats.domTransformWrites,
            domTransformSkips: perfStats.domTransformSkips,
          },
          lastInteraction: { ...lastInteraction },
          minis: miniCrabs.map((mc) => ({
            id: mc.id,
            act: mc.act && tickIdx >= mc.act.start ? mc.act.type : null,
            x: round(mc.lastX),
            y: round(mc.stackedOn ? computeWorldFootY(mc) : mc.y || 0),
            worldCx: round(getEntWorldCx(mc)),
            dir: mc.dir,
            stackedOn: mc.stackedOn,
            leap: !!mc.leap,
          })),
          actors: activeMainIds().map((id) => {
            const a = actors[id];
            const rect = a.el ? a.el.getBoundingClientRect() : null;
            const fx = a.lastFx || {};
            return {
              id,
              x: a.x,
              y: a.y,
              footY: round(computeWorldFootY(a)),
              worldCx: round(getEntWorldCx(a)),
              pose: resolvePoseFor(a, now),
              sym: a.sym && now < a.symUntil ? a.sym : null,
              rot: effectiveRot(a, now),
              pokeCount: a.pokeCount,
              stackedOn: a.stackedOn,
              leap: !!a.leap,
              rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null,
              // 附加诊断字段（只读）：整数格挤压量、待机微动作与静止帧缓存快照
              squash: a.lastSq ? { ...a.lastSq } : { w: 0, h: 0 },
              blinkStage: fx.blinkStage || null,
              breath: !!fx.breath,
              earTwitch: fx.earTwitch || null,
              clawSnap: fx.clawSnap || null,
              glance: fx.glance || 0,
              tick: tickIdx,
              renderCache: {
                poseKey: a.lastRender.poseKey,
                frameIdx: a.lastRender.frameIdx,
                flip: a.lastRender.flip,
                tintState: a.lastRender.tintState,
                lastX: a.lastDomX,
                lastY: a.lastDomY,
                lastRot: a.lastRender.lastRot,
              },
            };
          }),
        };
      },
      park(on = true) {
        if (disposed) return;
        parked = !!on;
        syncHeartbeat();
        if (parked) {
          reclaimStageVram();
        } else if (!isVramSleepState() && !isWindowBlurred()) {
          renderAllFrames();
        }
      },
      resume() {
        if (disposed) return;
        parked = false;
        syncHeartbeat();
        if (!isVramSleepState() && !isWindowBlurred() && !isPpOpen()) renderAllFrames();
      },
      syncPowerState: syncPwr,
      dispose() {
        disposed = true;
        rim.on = false;
        rim.s = 0;
        rimSig = '0';
        const liveMains = activeMainActors();
        for (const e of [...liveMains, ...miniCrabs]) {
          if (e) { e.dragging = e.ballisticActive = false; e.rot = 0; }
        }
        syncMascotDragRootAttr();
        if (tickTimer !== null) { clearInterval(tickTimer); tickTimer = null; }
        currentTickMs = 0;
        if (dragRafId && cAF) { try { cAF(dragRafId); } catch {} dragRafId = 0; }
        dragRafPending = false;
        if (resizeRaf && cAF) { try { cAF(resizeRaf); } catch {} resizeRaf = 0; }
        clearTimeout(pauseTimer);
        clearTimeout(theaterTimer);
        pendingTimers.forEach((t) => clearTimeout(t));
        pendingTimers.clear();
        try {
          if (reducedMq?.removeEventListener) reducedMq.removeEventListener('change', onReducedChange);
          else if (reducedMq?.removeListener) reducedMq.removeListener(onReducedChange);
        } catch {}
        pairCooldowns.clear();
        try {
          reclaimStageVram();
          zeroCv(fxCanvas, 1);
          zeroCv(habitatCanvas, 1);
          for (const e of [...liveMains, ...miniCrabs]) {
            if (e) { e._ctx = null; zeroCv(e.canvas, 1); }
          }
        } catch {}
        cleanups.forEach((fn) => fn());
        for (const n of [miniGroupEl, ...liveMains.map((a) => a.el), fxCanvas, habitatCanvas]) rmNode(n);
      },
    };
  }

  const mascotArt = {
    source: 'ch10-rig',
    PALETTES,
    MINI_SPRITES,
    MINI_ANIM_FRAMES,
    PROPS,
    SYMS,
    buildClipLayers,
    drawLayerSet,
    drawMainActor(ctx, kind, poseKey, tickIdx, oxGrid, oyGrid, pxSize, opts = {}) {
      if (!ctx) return 0;
      const pal = PALETTES[kind] || PALETTES.clawd;
      const layers = buildClipLayers(kind, poseKey, tickIdx, opts);
      drawLayerSet(ctx, oxGrid, oyGrid, pxSize, pal, layers);
      return layers.length;
    },
    drawMiniCrab(ctx, id, frameKey, oxGrid, oyGrid, pxSize) {
      if (!ctx) return 0;
      const pal = PALETTES[id] || PALETTES.cowboy;
      const spr = frameKey && MINI_ANIM_FRAMES[id]?.[frameKey] ? MINI_ANIM_FRAMES[id][frameKey] : MINI_SPRITES[id];
      if (!spr) return 0;
      drawLayerSet(ctx, oxGrid, oyGrid, pxSize, pal, [spr]);
      return 1;
    },
  };

  return {
    PX,
    TICK,
    DOZE_TICK,
    OFFICIAL_OPEN_REF,
    PALETTES,
    CLAWD_PARTS,
    CAT_PARTS,
    DRAGON_PARTS,
    WHALE_PARTS,
    FOX_PARTS,
    PANDA_PARTS,
    MINI_SPRITES,
    MINI_ANIM_FRAMES,
    PROPS,
    SYMS,
    mascotArt,
    MASCOT_SPECIES_ORDER,
    MASCOT_MAX_PER_SPECIES,
    MASCOT_MAX_TOTAL,
    parseMascotSpec,
    encodeMascotSpec,
    normalizeMascotValue,
    isValidMascotValue,
    resolveClawdStandGrid,
    drawLayerSet,
    renderPixelLayers,
    buildClipLayers,
    classifyPairEncounter,
    stepMiniCrabCorridor,
    evalChromaColorAt,
    resolveGroundSeparation,
    chooseObstacleAction,
    mountDualMascotStage,
  };
});
;

/* ===== module: smooth-caret.js ===== */
// Obsidian Prism — FastDOM Smooth Typing Caret Engine
// Extracted from ui-runtime.js: separates measure & mutate phases with zero forced layout reflow.

(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G) return;

  function snapDevicePx(value, dpr = 1) {
    const v = Number(value) || 0;
    const d = Number.isFinite(Number(dpr)) && Number(dpr) > 0 ? Math.min(4, Number(dpr)) : 1;
    return +(Math.round(v * d) / d).toFixed(3);
  }

  function createSmoothCaretController({ isDestroyed, isEnabled, setAttrIfChanged, runGuardedMut }) {
    let caretTypingTimer = null;
    let caretRaf = 0;
    let pendingCaretTyping = false;
    let pendingCaretRefreshMetrics = false;
    let pendingCaretScroll = false;
    let editorMetricsEpoch = 1;
    let cachedEditors = [];
    let lastEditorScanAt = 0;
    const editorMetricsCache = new WeakMap();
    let emptyCaretProbeCache = new WeakMap();
    const caretPrevState = new WeakMap();
    const caretNodeCache = new WeakMap();
    const selectionSigCache = new WeakMap();

    function teardown() {
      if (caretTypingTimer) {
        clearTimeout(caretTypingTimer);
        caretTypingTimer = null;
      }
      if (caretRaf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(caretRaf);
        caretRaf = 0;
      }
      pendingCaretTyping = false;
      pendingCaretRefreshMetrics = false;
      pendingCaretScroll = false;
      cachedEditors = [];
      lastEditorScanAt = 0;
      if (typeof document === 'undefined') return;
      document.querySelectorAll('.ag-cs-smooth-caret').forEach((n) => n.remove());
      document.querySelectorAll('[data-ag-cs-smooth-caret]').forEach((n) => n.removeAttribute('data-ag-cs-smooth-caret'));
      document.querySelectorAll('[data-ag-cs-caret-host]').forEach((n) => n.removeAttribute('data-ag-cs-caret-host'));
    }

    function bumpMetricsEpoch() {
      editorMetricsEpoch += 1;
      lastEditorScanAt = 0;
      emptyCaretProbeCache = new WeakMap();
    }

    function getCachedEditorMetrics(ed, forceRefresh = false) {
      let rec = editorMetricsCache.get(ed);
      if (rec && !forceRefresh && rec.epoch === editorMetricsEpoch) return rec;
      const cs = typeof getComputedStyle === 'function' ? getComputedStyle(ed) : null;
      const padL = parseFloat(cs?.paddingLeft || '8') || 8;
      const padT = parseFloat(cs?.paddingTop || '8') || 8;
      const fontSize = parseFloat(cs?.fontSize || '14') || 14;
      const lineH = parseFloat(cs?.lineHeight || '22') || fontSize * 1.5 || 22;
      const estGlyphH = Math.max(16, Math.min(24, Math.round(fontSize * 1.28)));
      const defaultH = Math.max(16, Math.min(28, lineH));
      const estEmptyTopOffset = padT + Math.max(0, Math.round((defaultH - estGlyphH) / 2));
      rec = { padL, padT, fontSize, lineH, estGlyphH, defaultH, estEmptyTopOffset, epoch: editorMetricsEpoch };
      editorMetricsCache.set(ed, rec);
      return rec;
    }

    function measureEditorCaretBox(ed, refreshMetrics = false) {
      if (!ed) return null;
      const edRect = ed.getBoundingClientRect();
      const { padL, estGlyphH, estEmptyTopOffset } = getCachedEditorMetrics(ed, refreshMetrics);

      const checkScrollBounds = (box) => {
        if (!box || !box.collapsed) return box;
        if ((ed.scrollHeight || 0) > (ed.clientHeight || 0) + 2 && edRect.height > 0) {
          if (box.top < edRect.top - 4 || box.top + box.height > edRect.bottom + 6) {
            return { collapsed: false };
          }
        }
        return box;
      };

      const cacheEmptyProbe = (boxRect) => {
        if (boxRect && boxRect.height > 0 && boxRect.height < 36 && edRect.height > 0) {
          emptyCaretProbeCache.set(ed, {
            dx: boxRect.left - edRect.left,
            dy: boxRect.top - edRect.top,
            height: boxRect.height,
            epoch: editorMetricsEpoch,
          });
        }
      };

      if (typeof document !== 'undefined' && typeof document.getSelection === 'function') {
        const sel = document.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = typeof sel.getRangeAt === 'function' ? sel.getRangeAt(0) : null;
          const isCol0 = range && typeof range.collapsed === 'boolean' ? range.collapsed : Boolean(sel.isCollapsed);
          if (!isCol0) return { collapsed: false };
          if (range && ed.contains && ed.contains(range.startContainer)) {
            const rects = typeof range.getClientRects === 'function' ? range.getClientRects() : [];
            const r0 =
              rects && rects.length > 0
                ? rects[rects.length - 1]
                : typeof range.getBoundingClientRect === 'function'
                ? range.getBoundingClientRect()
                : null;
            if (r0 && r0.height > 0 && (r0.left > 0 || r0.top > 0)) {
              return checkScrollBounds({ collapsed: true, left: r0.left, top: r0.top, height: r0.height });
            }

            const sc = range.startContainer;
            const so = range.startOffset;
            if (sc?.nodeName === 'BR' && typeof sc.getBoundingClientRect === 'function') {
              const brRect = sc.getBoundingClientRect();
              if (brRect && brRect.height > 0 && (brRect.left > 0 || brRect.top > 0)) {
                if (!ed.textContent) cacheEmptyProbe(brRect);
                return checkScrollBounds({ collapsed: true, left: brRect.left, top: brRect.top, height: brRect.height });
              }
            }
            if (sc && sc.nodeType === 1) {
              const childAt = sc.childNodes?.[so];
              if (childAt?.nodeName === 'BR' && typeof childAt.getBoundingClientRect === 'function') {
                const brRect = childAt.getBoundingClientRect();
                if (brRect && brRect.height > 0 && (brRect.left > 0 || brRect.top > 0)) {
                  if (sc.childNodes.length <= 1 && !ed.textContent) cacheEmptyProbe(brRect);
                  return checkScrollBounds({ collapsed: true, left: brRect.left, top: brRect.top, height: brRect.height });
                }
              }
              const childPrev = so > 0 ? sc.childNodes?.[so - 1] : null;
              if (childPrev?.nodeName === 'BR' && typeof childPrev.getBoundingClientRect === 'function') {
                const brRect = childPrev.getBoundingClientRect();
                if (brRect && brRect.height > 0 && (brRect.left > 0 || brRect.top > 0)) {
                  const isManagedEmptyLine =
                    (typeof childPrev.hasAttribute === 'function' && childPrev.hasAttribute('data-lexical-managed-linebreak')) ||
                    sc.childNodes.length === 1;
                  const scRect = typeof sc.getBoundingClientRect === 'function' ? sc.getBoundingClientRect() : null;
                  const lineLeft = scRect && scRect.left > 0 ? scRect.left : brRect.left;
                  const lineTop = isManagedEmptyLine ? brRect.top : brRect.bottom;
                  const box = { collapsed: true, left: lineLeft, top: lineTop, height: brRect.height };
                  if (isManagedEmptyLine && sc.childNodes.length <= 1 && !ed.textContent) cacheEmptyProbe(box);
                  return checkScrollBounds(box);
                }
              }
              if (typeof sc.getBoundingClientRect === 'function' && sc !== ed) {
                const scRect = sc.getBoundingClientRect();
                if (scRect && (scRect.left > 0 || scRect.top > 0)) {
                  return checkScrollBounds({
                    collapsed: true,
                    left: scRect.left,
                    top: scRect.top,
                    height: Math.min(estGlyphH, scRect.height || estGlyphH),
                  });
                }
              }
            }
          }
        }
      }

      const cached = emptyCaretProbeCache.get(ed);
      if (cached && cached.epoch === editorMetricsEpoch) {
        return checkScrollBounds({
          collapsed: true,
          left: edRect.left + cached.dx,
          top: edRect.top + cached.dy,
          height: cached.height,
        });
      }

      return checkScrollBounds({
        collapsed: true,
        left: edRect.left + padL,
        top: edRect.top + estEmptyTopOffset,
        height: estGlyphH,
      });
    }

    function resolveComposerEditors(activeEl, refreshMetrics) {
      const now = Date.now();
      const activeIsEditable = Boolean(
        activeEl && (activeEl.isContentEditable || activeEl.getAttribute?.('contenteditable') === 'true')
      );
      const cacheValid =
        !refreshMetrics &&
        cachedEditors.length > 0 &&
        now - lastEditorScanAt < 1200 &&
        cachedEditors.every((e) => e && e.isConnected !== false) &&
        (!activeIsEditable || cachedEditors.includes(activeEl));
      if (cacheValid) return cachedEditors;
      cachedEditors = Array.from(document.querySelectorAll('[data-testid="agent-input-box"] [contenteditable="true"], [data-composer-card] [contenteditable="true"], [data-composer-input][contenteditable="true"], .surface-composer-card [contenteditable="true"]'));
      lastEditorScanAt = now;
      return cachedEditors;
    }

    function measureSnapshot(refreshMetrics = false, checkScroll = true) {
      if (isDestroyed() || !isEnabled() || typeof document === 'undefined') return null;
      const activeEl = document.activeElement;
      const editors = resolveComposerEditors(activeEl, refreshMetrics);
      if (editors.length === 0) return null;
      const sel = typeof document.getSelection === 'function' ? document.getSelection() : null;
      const list = [];
      for (const ed of editors) {
        const host = ed.parentElement;
        if (!host) continue;
        const isFocused = activeEl === ed || Boolean(activeEl && ed.contains && ed.contains(activeEl));
        if (!isFocused) {
          selectionSigCache.delete(ed);
          const cachedCaret = caretNodeCache.get(host);
          const caretVis = cachedCaret && cachedCaret.isConnected !== false
            ? cachedCaret.getAttribute?.('data-ag-cs-caret-visible') === '1'
            : Boolean(host.querySelector?.('.ag-cs-smooth-caret[data-ag-cs-caret-visible="1"]'));
          if (!host.hasAttribute?.('data-ag-cs-caret-host') || ed.hasAttribute?.('data-ag-cs-smooth-caret') || caretVis) {
            list.push({ ed, host, isFocused: false, measured: null, hostRect: null, clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0, isNowEmpty: true });
          }
          continue;
        }
        let scrolledOnly = false;
        const rc = sel ? sel.rangeCount || 0 : 0;
        const r0 = rc > 0 && typeof sel.getRangeAt === 'function' ? sel.getRangeAt(0) : null;
        const isCol = r0 && typeof r0.collapsed === 'boolean' ? r0.collapsed : rc > 0 ? Boolean(sel.isCollapsed) : true;
        const fNode = r0 && r0.endContainer !== undefined ? r0.endContainer : rc > 0 ? sel.focusNode : null;
        const fOff = r0 && typeof r0.endOffset === 'number' ? r0.endOffset : rc > 0 ? sel.focusOffset : -1;
        const childCnt = ed.childNodes ? ed.childNodes.length : 0;
        const textSig =
          fNode && typeof fNode.nodeValue === 'string'
            ? fNode.nodeValue.length
            : (ed.firstChild && typeof ed.firstChild.textContent === 'string' ? ed.firstChild.textContent.length : (ed.textContent || '').length);
        const prevSig = selectionSigCache.get(ed);
        const alreadySynced = Boolean(prevSig) && (ed.hasAttribute?.('data-ag-cs-smooth-caret') || prevSig.hidden);
        let sameSelection = false;
        if (!refreshMetrics && alreadySynced) {
          sameSelection =
            prevSig.epoch === editorMetricsEpoch &&
            prevSig.rc === rc &&
            prevSig.isCollapsed === isCol &&
            prevSig.focusNode === fNode &&
            prevSig.focusOffset === fOff &&
            prevSig.childCnt === childCnt &&
            prevSig.textSig === textSig;
          // Zero forced-reflow fast path: skip scrollLeft/scrollTop DOM layout reads unless scroll was flagged or selection actually changed!
          if (sameSelection && !checkScroll) continue;
        }
        const edScrollLeft = ed.scrollLeft || 0;
        const edScrollTop = ed.scrollTop || 0;
        const hostScrollLeft = host.scrollLeft || 0;
        const hostScrollTop = host.scrollTop || 0;
        if (!refreshMetrics && alreadySynced && sameSelection) {
          const sameScroll =
            prevSig.edScrollLeft === edScrollLeft &&
            prevSig.edScrollTop === edScrollTop &&
            prevSig.hostScrollLeft === hostScrollLeft &&
            prevSig.hostScrollTop === hostScrollTop;
          if (sameScroll) continue;
          scrolledOnly = true;
        }
        const measured = measureEditorCaretBox(ed, refreshMetrics);
        const hostRect = measured && measured.collapsed ? host.getBoundingClientRect() : null;
        selectionSigCache.set(ed, {
          epoch: editorMetricsEpoch,
          rc,
          isCollapsed: isCol,
          focusNode: fNode,
          focusOffset: fOff,
          childCnt,
          textSig,
          edScrollLeft,
          edScrollTop,
          hostScrollLeft,
          hostScrollTop,
          hidden: !(measured && measured.collapsed && hostRect),
        });
        const clientLeft = host.clientLeft || 0;
        const clientTop = host.clientTop || 0;
        const cleanText = (ed.textContent || '').replace(/\u200b/g, '');
        const isNowEmpty = cleanText.length === 0 && ed.querySelectorAll('p, div').length <= 1;
        list.push({
          ed,
          host,
          isFocused,
          measured,
          hostRect,
          clientLeft,
          clientTop,
          scrollLeft: hostScrollLeft,
          scrollTop: hostScrollTop,
          isNowEmpty,
          scrolledOnly,
        });
      }
      return list;
    }

    function applyMutations(snapshotList, isTypingEvent = false) {
      if (isDestroyed() || !isEnabled()) {
        teardown();
        return;
      }
      if (!snapshotList || snapshotList.length === 0 || typeof document === 'undefined') return;
      runGuardedMut(() => {
        for (const item of snapshotList) {
          const { ed, host, isFocused, measured, hostRect, clientLeft, clientTop, scrollLeft, scrollTop, isNowEmpty, scrolledOnly } = item;
          setAttrIfChanged(host, 'data-ag-cs-caret-host', '1');
          let caret = caretNodeCache.get(host);
          if (!caret || caret.parentElement !== host) caret = host.querySelector('.ag-cs-smooth-caret');
          if (!caret) {
            caret = document.createElement('div');
            caret.className = 'ag-cs-smooth-caret';
            caret.setAttribute('aria-hidden', 'true');
            caret.setAttribute('data-ag-no-i18n', '');
            host.appendChild(caret);
          }
          caretNodeCache.set(host, caret);

          if (!measured || !measured.collapsed || !hostRect) {
            if (caret.hasAttribute('data-ag-cs-caret-visible')) caret.removeAttribute('data-ag-cs-caret-visible');
            if (ed.hasAttribute('data-ag-cs-smooth-caret')) ed.removeAttribute('data-ag-cs-smooth-caret');
            continue;
          }

          const rawDpr = (typeof window !== 'undefined' && Number(window.devicePixelRatio)) || 1;
          const x = snapDevicePx(measured.left - hostRect.left - clientLeft + scrollLeft, rawDpr);
          const y = snapDevicePx(measured.top - hostRect.top - clientTop + scrollTop, rawDpr);
          const h = Math.max(15, snapDevicePx(measured.height || 18, rawDpr));
          const wasVisible = caret.getAttribute('data-ag-cs-caret-visible') === '1';
          const prev = caretPrevState.get(caret);
          const clearedToEmpty = Boolean(prev && prev.empty === false && isNowEmpty);

          if ((isFocused && !wasVisible) || clearedToEmpty || scrolledOnly) {
            caret.style.transition = 'none';
            caret.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            caret.style.height = `${h}px`;
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(() => {
                if (caret.isConnected) caret.style.transition = '';
              });
            } else {
              caret.style.transition = '';
            }
          } else {
            if (!prev || prev.x !== x || prev.y !== y) {
              caret.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            }
            if (!prev || prev.h !== h) {
              caret.style.height = `${h}px`;
            }
          }
          caretPrevState.set(caret, { x, y, h, empty: isNowEmpty });

          if (isFocused) {
            setAttrIfChanged(caret, 'data-ag-cs-caret-visible', '1');
            setAttrIfChanged(ed, 'data-ag-cs-smooth-caret', '1');
            if (isTypingEvent) {
              setAttrIfChanged(caret, 'data-ag-cs-caret-typing', '1');
              if (caretTypingTimer) clearTimeout(caretTypingTimer);
              caretTypingTimer = setTimeout(() => {
                caretTypingTimer = null;
                if (caret.isConnected) caret.removeAttribute('data-ag-cs-caret-typing');
              }, 420);
            } else if (prev && (prev.x !== x || prev.y !== y) && typeof caret.getAnimations === 'function') {
              for (const anim of caret.getAnimations()) {
                if (anim && anim.animationName === 'ag-cs-caret-blink') anim.currentTime = 0;
              }
            }
          } else {
            if (caret.hasAttribute('data-ag-cs-caret-visible')) caret.removeAttribute('data-ag-cs-caret-visible');
            if (ed.hasAttribute('data-ag-cs-smooth-caret')) ed.removeAttribute('data-ag-cs-smooth-caret');
          }
        }
      });
    }

    function sync(isTypingEvent = false, refreshMetrics = false, checkScroll = true) {
      if (isDestroyed() || !isEnabled()) {
        teardown();
        return;
      }
      const snap = measureSnapshot(refreshMetrics, checkScroll);
      applyMutations(snap, isTypingEvent);
    }

    function queue(isTyping = false, immediate = false, refreshMetrics = false, isScroll = false) {
      if (isDestroyed() || !isEnabled()) return;
      if (isTyping) pendingCaretTyping = true;
      if (refreshMetrics) pendingCaretRefreshMetrics = true;
      if (isScroll) pendingCaretScroll = true;
      if (immediate) {
        if (caretRaf && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(caretRaf);
          caretRaf = 0;
        }
        const typingNow = pendingCaretTyping || isTyping;
        const refreshNow = pendingCaretRefreshMetrics || refreshMetrics;
        const scrollNow = pendingCaretScroll || isScroll;
        pendingCaretTyping = false;
        pendingCaretRefreshMetrics = false;
        pendingCaretScroll = false;
        sync(typingNow, refreshNow, scrollNow);
        return;
      }
      if (caretRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(caretRaf);
      if (typeof requestAnimationFrame === 'function') {
        caretRaf = requestAnimationFrame(() => {
          caretRaf = 0;
          const typingNow = pendingCaretTyping;
          const refreshNow = pendingCaretRefreshMetrics;
          const scrollNow = pendingCaretScroll;
          pendingCaretTyping = false;
          pendingCaretRefreshMetrics = false;
          pendingCaretScroll = false;
          sync(typingNow, refreshNow, scrollNow);
        });
      }
    }

    return {
      teardown,
      bumpMetricsEpoch,
      measureSnapshot,
      applyMutations,
      sync,
      queue,
    };
  }

  const api = { createSmoothCaretController, snapDevicePx };
  if (typeof module === 'object' && module.exports) module.exports = api;
  G.__agPrismSmoothCaret = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
;

/* ===== module: effort-slider.js ===== */
try { (typeof globalThis !== "undefined" ? globalThis : window).__agCodexEffortSliderDisableAutoBoot = true; } catch (_) {}
"use strict";
/**
* Antigravity Codex 风格推理等级滑条 (antigravity-codex-effort-slider)
*/
(function (root, factory) {
try {
var exportsObj = factory(root);
if (typeof module === "object" && module && typeof module.exports === "object") {
module.exports = exportsObj;
}
if (root && typeof root === "object") {
root.AntigravityCodexEffortSlider = exportsObj;
}
} catch (err) {
// Factory error handled silently
}
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function (globalRoot) {
// ── 常量与默认几何参数 ──────────────────────────────────────────────────────
var STYLE_ELEMENT_ID = "ag-codex-effort-slider-styles";
var KNOB_RADIUS = 14;
var ENERGY_START = 0;
var ENERGY_END = 0.5;
// Antigravity 官方推理档位枚举与展示名映射（对应 main.js 中的 DXb / EXb / GXb）
var AG_EFFORT_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
var AG_EFFORT_LABELS = {
off: "Off",
minimal: "Minimal",
low: "Low",
medium: "Medium",
high: "High",
xhigh: "Extra",
max: "Max"
};
var AG_MODEL_LABEL_RE = /^(.*?)\s*\((off|minimal|low|medium|high|xhigh|extra|max)(?:\s+thinking)?\)\s*$/i;
var _EFF_ALIAS = Object.create(null);
"xhigh:xhigh|extra|extra high|超高|极高|極高|特高|很高;high:high|高;medium:medium|med|中|中等;low:low|低;minimal:minimal|极低|極低|最小|最低|极简|極簡;max:max|最高|最大|极限|極限;off:off|关闭|關閉|关|關|不推理|无|無|none|disabled;auto:auto|自动|自動;adaptive:adaptive|自适应|自適應;thinking:thinking|深度思考|思考中|思考;fixed:fixed|固定".split(";").forEach(function (g) {
var p = g.split(":"), k = p[0], vs = p[1].split("|");
for (var i = 0; i < vs.length; i += 1) _EFF_ALIAS[vs[i]] = k;
});
function _normEffTxt(raw) {
var s = String(raw || "").trim().replace(/^[(\uff08]+|[)\uff09]+$/g, "").trim().replace(/\s+thinking$/i, "").toLowerCase();
return _EFF_ALIAS[s] || _EFF_ALIAS[s.replace(/(.+?)(?:思考|推理|强度|強度)$/, "$1")] || "";
}
function _sameEffTxt(a, b) {
if (a === b) return true;
var ka = _normEffTxt(a), kb = _normEffTxt(b);
return ka && kb ? ka === kb : Boolean(a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase());
}
var _NO_TR_A = { "data-ag-i18n-skip": "1", "data-ag-no-tr": "1", "data-no-translate": "1", "data-translate": "no", translate: "no", "data-ag-localization-skip": "true", "data-agy-no-translate": "true", "data-antigravity-zh-skip": "1", "data-ag-no-i18n": "" };
function markNoTranslate(el) {
if (!el) return el;
var hc = el.classList && el.classList.contains ? el.classList.contains("notranslate") : (typeof el.className === "string" && /(?:^|\s)notranslate(?:\s|$)/.test(el.className));
if (hc && el.getAttribute && el.getAttribute("data-ag-i18n-skip") === "1" && el.getAttribute("data-antigravity-zh-skip") === "1" && el.getAttribute("data-ag-no-i18n") === "") return el;
if (el.setAttribute) {
for (var k in _NO_TR_A) if (!el.getAttribute || el.getAttribute(k) !== _NO_TR_A[k]) el.setAttribute(k, _NO_TR_A[k]);
}
if (!hc) {
if (el.classList && el.classList.add) el.classList.add("notranslate");
else if (typeof el.className === "string") el.className += (el.className ? " " : "") + "notranslate";
}
return el;
}
var CLAUDE_CELL = 28 / 6;
var CLAUDE_SWEEP_MS = 1600;
function isClaudeModel(name) {
if (!name || typeof name !== "string") return false;
return /claude/i.test(name);
}
// ── 连续物理运动参数 ────────────────────────────────────────────────────────
// full: 完整星云阻尼变速动画；fast: 快速 ~70ms 跟手吸附（默认）；quick: 0 动画直接跳格
var _F = Object.freeze;
var MOTION = _F({ maxSpeed: 3.2, accel: 28, decel: 18, snapEps: 0.0015, velEps: 0.01 });
var MOTION_REDUCED = _F({ maxSpeed: 1e6, accel: 1e9, decel: 1e9, snapEps: 1e-4, velEps: 1e6 });
var MOTION_FAST = _F({ maxSpeed: 18, accel: 260, decel: 180, snapEps: 0.002, velEps: 0.04 });
var _REL_PRJ = 0.09, _PS_EMA = 0.45, _PS_STL = 0.05, _PS_TAU = 0.035;
var SETTINGS_KEY = "ag.codexEffortSlider.settings.v1";
var LEGACY_SETTINGS_KEY = "dsh.codexEffortSlider.settings.v1";
var SETTINGS_EVENT = "ag:codex-effort-slider:settings";
var SETTINGS_VERSION = 1;
var SETTINGS_SCHEMA = _F([
_F({ key: "motion", label: "动画效果", labelEn: "Animation", defaultValue: "fast", options: _F([
_F({ value: "fast", label: "快速动画", labelEn: "Fast", hint: "拨过 1/3 即切档 · ~70ms 快速吸附", hintEn: "Snaps after 1/3 travel (~70ms)" }),
_F({ value: "quick", label: "简洁动画", labelEn: "Instant", hint: "无过渡 · 直接跳档", hintEn: "No transition, immediate jump" }),
_F({ value: "full", label: "完整动画", labelEn: "Full", hint: "匀变速追赶 + 星尘渐亮", hintEn: "Smooth physics catch-up + starfield" })
]) }),
_F({ key: "ticks", label: "已到达档位的刻度点", labelEn: "Reached Tick Marks", defaultValue: "highlight", options: _F([
_F({ value: "highlight", label: "亮白显示", labelEn: "Bright", hint: "默认 · 已滑过档位高亮", hintEn: "Default: highlight reached ticks" }),
_F({ value: "dim", label: "与未到达同色", labelEn: "Muted", hint: "所有刻度点保持柔和半透明", hintEn: "Keep all ticks softly muted" }),
_F({ value: "hidden", label: "隐藏", labelEn: "Hidden", hint: "不显示任何刻度点", hintEn: "Hide all tick marks" })
]) })
]);
function schemaDefaults() {
var out = { v: SETTINGS_VERSION };
for (var i = 0; i < SETTINGS_SCHEMA.length; i += 1) out[SETTINGS_SCHEMA[i].key] = SETTINGS_SCHEMA[i].defaultValue;
return out;
}
function normalizeSettings(raw) {
var base = schemaDefaults();
if (!raw || typeof raw !== "object") return base;
for (var i = 0; i < SETTINGS_SCHEMA.length; i += 1) {
var it = SETTINGS_SCHEMA[i], c = raw[it.key];
for (var j = 0; j < it.options.length; j += 1) if (it.options[j].value === c) { base[it.key] = c; break; }
}
if (!raw.motion && raw.reducedMotion === true) base.motion = "quick";
return base;
}
function _win(w) { return w || (typeof window !== "undefined" ? window : globalRoot); }
function resolveStorage(win) { try { var w = _win(win); return null; } catch (e) { return null; } }
var _cfgCache = null, _cfgStorage = null;
function _invCfg() { _cfgCache = _cfgStorage = null; }
function readSettings(win) {
var s = resolveStorage(win);
if (!s) return schemaDefaults();
if (_cfgCache && _cfgStorage === s) return _cfgCache;
try { var t = s.getItem(SETTINGS_KEY) || s.getItem(LEGACY_SETTINGS_KEY); _cfgStorage = s; return (_cfgCache = t ? normalizeSettings(JSON.parse(t)) : schemaDefaults()); }
catch (e) { return schemaDefaults(); }
}
function writeSettings(patch, win) {
var w = _win(win), next = normalizeSettings(Object.assign({}, readSettings(w), patch || {})), s = resolveStorage(w);
if (s) { try { s.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {} }
_cfgCache = s ? next : null; _cfgStorage = s;
try { if (w && w.dispatchEvent && w.CustomEvent) w.dispatchEvent(new w.CustomEvent(SETTINGS_EVENT, { detail: next })); } catch (e) {}
return next;
}
function resetSettings(win) { return writeSettings(schemaDefaults(), win); }
function onSettingsChange(fn, win) {
var w = _win(win);
if (!w || typeof w.addEventListener !== "function") return function () {};
var hC = function (ev) { _invCfg(); fn(ev && ev.detail ? normalizeSettings(ev.detail) : readSettings(w)); };
var hS = function (ev) { if (ev && (ev.key === SETTINGS_KEY || ev.key === LEGACY_SETTINGS_KEY)) { _invCfg(); fn(readSettings(w)); } };
w.addEventListener(SETTINGS_EVENT, hC); w.addEventListener("storage", hS);
return function () { w.removeEventListener(SETTINGS_EVENT, hC); w.removeEventListener("storage", hS); };
}
function prefersReducedMotion(win) {
try { var w = _win(win); return Boolean(w && w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
}
function getPrismRootAttr(doc, win, attr) {
try { var d = doc || (win && win.document) || (typeof document !== "undefined" ? document : null), r = d && d.documentElement; return (r && r.getAttribute && r.getAttribute(attr)) || ""; } catch (e) { return ""; }
}
function isPrismMotionOff(doc, win) { return getPrismRootAttr(doc, win, "data-ag-cs-motion") === "off" || prefersReducedMotion(win); }
function resolvePrismAccentTone(doc, win) { var ac = getPrismRootAttr(doc, win, "data-ag-cs-accent"); return ac === "mono" || ac === "amber" || ac === "iris" || ac === "cobalt" ? ac : "follow"; }
function motionMode(win, explicitSettings, doc) { return isPrismMotionOff(doc, win) ? "quick" : (explicitSettings ? normalizeSettings(explicitSettings) : readSettings(win)).motion || "fast"; }
function motionParamsForMode(mode) { return mode === "quick" ? MOTION_REDUCED : mode === "full" ? MOTION : MOTION_FAST; }
// ── 诊断环形缓冲区 ──────────────────────────────────────────────────────────
var _tr = [];
function tracePush(type, detail) {
var e = Object.assign({ t: Date.now(), type: String(type || "event") }, detail && typeof detail === "object" ? detail : null);
_tr.push(e);
if (_tr.length > 200) _tr.splice(0, _tr.length - 200);
}
function dumpTrace(win) {
var w = _win(win);
return { plugin: "antigravity-codex-effort-slider@1.2.1", time: new Date().toISOString(), ua: w && w.navigator ? w.navigator.userAgent : "node", settings: readSettings(w), events: _tr.slice() };
}
function clamp01(v) { var n = Number(v); return !Number.isFinite(n) || n <= 0 ? 0 : n >= 1 ? 1 : n; }
function clampAbs(v, l) { var m = Math.max(0, Number(l) || 0), n = Number(v) || 0; return n > m ? m : n < -m ? -m : n; }
function pctFromIndex(i, c) { var n = Number(c) || 0; return n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(Number(i) || 0))) / (n - 1); }
function indexFromPct(p, c) { var n = Number(c) || 0; return n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(clamp01(p) * (n - 1)))); }
// 迟滞棘轮分档器（推进 1/3 切档，回退 2/3 防抖）
function detentTargetIndex(currentIndex, ptrPct, count) {
var n = Number(count) || 0, p = clamp01(ptrPct);
if (n <= 1) return 0;
if (typeof currentIndex !== "number" || currentIndex < 0 || currentIndex >= n) return indexFromPct(p, n);
var step = 1 / (n - 1), idx = currentIndex;
if (p >= idx * step) { while (idx < n - 1 && p >= (idx + 1 / 3) * step - 1e-9) idx += 1; }
else { while (idx > 0 && p <= (idx - 1 / 3) * step + 1e-9) idx -= 1; }
return idx;
}
function knobOffsetOf(pct, radiusPx) {
var p = clamp01(pct);
var r = typeof radiusPx === "number" && Number.isFinite(radiusPx) ? radiusPx : KNOB_RADIUS;
return "calc(" + r + "px + (100% - " + (r * 2) + "px) * " + p + ")";
}
function motionSettled(state, params) {
if (!state) return true;
var cfg = params || MOTION;
var dist = Math.abs((Number(state.target) || 0) - (Number(state.x) || 0));
var vel = Math.abs(Number(state.v) || 0);
return dist <= cfg.snapEps && vel <= cfg.velEps;
}
/**
* 连续物理步进器：基于刹车距离 v^2 / (2 * decel) 平滑追赶 target，无过冲回弹
*/
function motionStep(state, dtSeconds, params) {
if (!state) return;
var cfg = params || MOTION, dt = Number(dtSeconds);
if (!Number.isFinite(dt) || dt <= 0) return;
if (dt > 0.05) dt = 0.05;
var target = clamp01(state.target), x = clamp01(state.x), v = Number(state.v) || 0, diff = target - x, dist = Math.abs(diff);
if (dist <= cfg.snapEps && Math.abs(v) <= cfg.velEps) { state.x = target; state.v = state.a = 0; return; }
var dir = diff >= 0 ? 1 : -1;
var a = (v * dir >= 0 && (v * v) / (2 * cfg.decel) >= dist) ? -dir * cfg.decel : dir * cfg.accel;
var nextV = clampAbs(v + a * dt, cfg.maxSpeed), nextX = x + nextV * dt;
if ((target - x) * (target - nextX) <= 0 && Math.abs(nextV) <= cfg.maxSpeed) { state.x = target; state.v = state.a = 0; return; }
state.a = a;
state.x = nextX <= 0 ? (state.v = Math.max(0, nextV), 0) : nextX >= 1 ? (state.v = Math.min(0, nextV), 1) : (state.v = nextV, nextX);
}
function decayPointerSpeed(rawSpeed, idleSeconds) {
var v = Number(rawSpeed) || 0;
var idle = Number(idleSeconds) || 0;
if (idle <= _PS_STL) return v;
var decay = Math.exp(-(idle - _PS_STL) / _PS_TAU);
var out = v * decay;
return Math.abs(out) < 1e-4 ? 0 : out;
}
function releaseIndexFor(ptrPct, rawSpeed, idleSeconds, count) {
var v = decayPointerSpeed(rawSpeed, idleSeconds);
var projected = clamp01((Number(ptrPct) || 0) + v * _REL_PRJ);
return indexFromPct(projected, count);
}
// ── 22 颗黄金分割确定性星尘与色彩引擎（对齐 dsh-codex-effort-slider 右向左横穿星空） ──
var PARTICLE_COUNT = 22;
var _SF_MEAN = 1.5;
var _SF_SPR = 0.08;
var STARFIELD_MIN = 0.5;
var GOLDEN_RATIO = 0.6180339887498949;
var MAX_SPEED_FACTOR = 2;
var _RM_SLOW = 2.6;
/** 确定性伪随机 [0,1)：不用 Math.random，每次渲染完全一致且可离线断言 */
function starHash01(index, salt) {
var value = ((index + 1) * (salt || 1) * 2654435761) % 4294967296;
return ((value >>> 8) % 1000) / 1000;
}
// 22 颗黄金比确定性星尘粒子（右向左横穿）
var PARTICLES = (function () {
var count = PARTICLE_COUNT, out = [], byPhase = [], i;
for (i = 0; i < count; i += 1) {
var b = STARFIELD_MIN + (1 - STARFIELD_MIN) * starHash01(i, 61);
out.push({ id: i, y: 0, phase: ((i + 1) * GOLDEN_RATIO) % 1, threshold: i / count, brightness: Math.round(b * 1000) / 1000 });
byPhase.push(i);
}
byPhase.sort(function (a, b) { return out[a].phase - out[b].phase; });
var slots = [10, 21, 1, 8, 19, 6, 17, 4, 15, 2, 13, 20, 0, 11, 18, 9, 16, 7, 14, 5, 12, 3];
for (var r = 0; r < count; r += 1) out[byPhase[r]].y = Math.round((8 + (slots[r] / (count - 1)) * 84) * 100) / 100;
for (i = 0; i < count; i += 1) _F(out[i]);
return _F(out);
})();
function isOffLevel(text) {
if (text === null || text === undefined) return false;
if (typeof text === "object") return isOffLevel(text.id || text.name || text.effort || text.label || "");
return /^(?:off|none|disabled|0|关闭|关|不推理|无)$/.test(String(text).trim().toLowerCase());
}
/* ── Claude Ultracode 像素点阵抖动引擎 ──────────────────────────────── */
function hash01(a, b, c) {
var h = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 1274126177;
h = (h ^ (h >>> 13)) * 1274126177;
h = h ^ (h >>> 16);
return ((h >>> 0) % 100000) / 100000;
}
function ditherAlphaAt(x, w, col, row) {
var t = clamp01(x / Math.max(1, w));
var ramp = 0.92 + 0.08 * t;
var jitter = 0.25 + 0.75 * hash01(col, row, 7);
return clamp01(ramp * jitter);
}
var _DRW = [];
for (var _r = 0; _r < 6; _r += 1) {
var _w1 = 3 + ((hash01(0, _r, 47) * 5) | 0), _s1 = (5 + 10 * hash01(0, _r, 43)) / 6.2831853, _w2 = 2 + ((hash01(0, _r, 61) * 4) | 0);
_DRW.push([_w1, _s1, hash01(0, _r, 53), _w2, _s1 * (_w2 / _w1), hash01(0, _r, 71)]);
}
var _ditherLightLut = null;
function _getLightLut() {
if (_ditherLightLut) return _ditherLightLut;
var lut = [], cl = function (v, a, b) { return v < a ? a : v > b ? b : (v + 0.5) | 0; };
for (var i = 0; i < 256; i += 1) {
var tv = (i >> 5) / 7, ov = -40 + (((i >> 2) & 7) / 7) * 96, pv = (i & 3) / 3;
lut.push("rgb(" + cl(187 - 32 * tv + ov + 12 * pv, 124, 240) + "," + cl(184 - 46 * tv + (ov < 0 ? ov : ov * 1.05) + 12 * pv, 100, 232) + "," + cl(206 + 4 * tv + (ov < 0 ? ov : ov * 0.65) + 8 * pv, 180, 252) + ")");
}
return (_ditherLightLut = lut);
}
function valueNoise(col, row, timeSec, speed, seed) {
var tt = timeSec * speed + hash01(col, row, seed) * 17;
var step = Math.floor(tt);
var f = tt - step;
var e = f * f * (3 - 2 * f);
var a = hash01(col, row, (step % 997) + seed * 11);
var b = hash01(col, row, ((step + 1) % 997) + seed * 11);
return a + (b - a) * e;
}
var mergeCache = null;
var mergeCacheKey = "";
function getMergeMap(cols, rows) {
var key = cols + "x" + rows;
if (mergeCache && mergeCacheKey === key) return mergeCache;
var map = new Uint8Array(cols * rows);
for (var r = 0; r < rows; r += 1) {
for (var c = 0; c < cols; c += 1) {
var i = r * cols + c;
if (map[i]) continue;
var h = hash01(c, r, 91);
if (h < 0.02 && c + 1 < cols && r + 1 < rows && !map[i + 1] && !map[i + cols] && !map[i + cols + 1]) {
map[i] = 1; map[i + 1] = 2; map[i + cols] = 2; map[i + cols + 1] = 2;
} else if (h < 0.06 && c + 1 < cols && !map[i + 1]) {
map[i] = 3; map[i + 1] = 2;
} else if (h < 0.08 && r + 1 < rows && !map[i + cols]) {
map[i] = 4; map[i + cols] = 2;
}
}
}
mergeCache = map;
mergeCacheKey = key;
return map;
}
function surfaceIsDark(win, doc) {
try {
var d = doc || (typeof document !== "undefined" ? document : null), w = win || (typeof window !== "undefined" ? window : globalRoot), r = d && d.documentElement;
if (!d || !d.body || !w) return true;
var pt = r && r.getAttribute ? r.getAttribute("data-ag-cs-theme") : "";
if (pt === "dark" || pt === "light") return pt === "dark";
if ((r && r.classList.contains("dark")) || d.body.classList.contains("dark")) return true;
var ps = ((w.getComputedStyle && w.getComputedStyle(d.body).backgroundColor) || "").match(/[\d.]+/g);
return !ps || ps.length < 3 || (ps.length > 3 && +ps[3] < 0.5) || (0.2126 * ps[0] + 0.7152 * ps[1] + 0.0722 * ps[2]) / 255 < 0.5;
} catch (e) { return true; }
}
// Claude 点阵绘制（intensity ∈ [0,1] 连续控制底晕/密度/亮度）
var _ditherWashCache = typeof WeakMap === "function" ? new WeakMap() : null;
function paintDither(ctx, w, h, dark, progress, timeSec, intensity) {
if (!ctx) return;
var _mx = Math.max, _mn = Math.min, _pw = Math.pow;
var strength = typeof intensity === "number" ? clamp01(intensity) : 1;
ctx.clearRect(0, 0, w, h);
if (strength <= 0 || w <= 0) return;
var keepRatio = strength >= 1 ? 1 : 0.25 + 0.75 * strength, alphaMul = 0.45 + 0.55 * strength;
var wash = null, wKey = progress >= 1 ? w + "|" + (dark ? 1 : 0) : "";
if (wKey && _ditherWashCache) {
var _wc = _ditherWashCache.get(ctx);
if (_wc && _wc.k === wKey) wash = _wc.g;
}
if (!wash) {
var k = 1 - progress, s1 = _mx(0, _mn(1, k - 0.08)), s2 = _mx(s1, _mn(1, k + 0.18));
wash = ctx.createLinearGradient(0, 0, w, 0);
var stops = dark
? [[0, "rgba(112,78,162,0)"], [s1, "rgba(112,78,162,0)"], [s2, "rgba(118,84,169,0.3)"], [1, "rgba(116,84,170,0.75)"]]
: [[0, "rgba(142,118,192,0)"], [s1, "rgba(142,118,192,0)"], [s2, "rgba(142,118,192,0.45)"], [1, "rgba(142,118,192,1)"]];
for (var si = 0; si < 4; si += 1) wash.addColorStop(stops[si][0], stops[si][1]);
if (wKey && _ditherWashCache) _ditherWashCache.set(ctx, { k: wKey, g: wash });
}
ctx.globalAlpha = strength;
ctx.fillStyle = wash;
ctx.fillRect(0, 0, w, h);
var purple = dark ? "rgb(208,192,246)" : "rgb(150,130,205)";
var cell = h / 6 > 0 ? h / 6 : CLAUDE_CELL, cols = Math.ceil(w / cell), rows = 6, front = 1 - progress;
var lmap = !dark ? getMergeMap(cols, rows) : null;
var lightLut = !dark ? _getLightLut() : null;
var size = cell * 0.72;
for (var col = 0; col < cols; col += 1) {
var x = col * cell, t = clamp01(x / _mx(1, w)), fade = clamp01((t - 0.02) / 0.48);
for (var row = 0; row < rows; row += 1) {
if (keepRatio < 1 && hash01(col, row, 101) > keepRatio) continue;
var base = ditherAlphaAt(x, w, col, row) * alphaMul;
if (base < 0.05) continue;
var edgeJit = (hash01(col, row, 31) - 0.5) * 0.05;
if (t < front + edgeJit) continue;
var appear = (0.35 + 0.65 * clamp01((t - front - edgeJit) / 0.04)) * (dark ? 1 : alphaMul);
var rw = _DRW[row];
var u1 = (t * rw[0] + timeSec * rw[1] + rw[2]) % 1;
if (u1 < 0) u1 += 1;
var u2 = (t * rw[3] + timeSec * rw[4] + rw[5]) % 1;
if (u2 < 0) u2 += 1;
var p1 = _pw(1 - u1, 2.6 + 3.4 * hash01(col, row, 17)), p2 = _pw(1 - u2, 3.4);
var pulse = _mx(p1, p2 * (0.55 + 0.45 * hash01(col, row, 19))) * 0.85;
var wAmt = clamp01(pulse * (0.35 + 0.65 * t)) * (0.55 + 0.45 * hash01(col, row, 71));
if (progress < 0.999) wAmt = _mx(wAmt, clamp01(1 - (t - front) / 0.16) * (0.55 + 0.45 * hash01(col, row, 73)));
if (!dark) {
var lt = clamp01((t - 0.05) / 0.2);
if (lt <= 0) continue;
var mv = lmap[row * cols + col];
if (mv === 2 || hash01(col, row, 95) < 0.03) continue;
var y2 = row * cell, off = (hash01(col, row, 93) - 0.42) * (22 + 66 * t);
if (off > 0) off *= 1.1;
var lw = cell * (mv === 3 || mv === 1 ? 2 : 1) * 0.88, lh = cell * (mv === 4 || mv === 1 ? 2 : 1) * 0.88;
var flicker = valueNoise(col, row, timeSec, 0.9, 83), density = clamp01((t - 0.12) / 0.35);
var presence = density > 0.9 ? 1 : clamp01((0.2 + 0.8 * density - flicker) / 0.2);
if (presence <= 0.01) continue;
var lAlpha = clamp01(lt * appear * presence * (0.7 + 0.3 * (1 - flicker)) * (0.85 + 0.15 * hash01(col, row, 29)));
ctx.globalAlpha = lAlpha;
ctx.fillStyle = lightLut[(_mn(7, (t * 7.99) | 0) << 5) | (_mx(0, _mn(7, (((off + 40) / 96) * 7.99) | 0)) << 2) | _mn(3, (pulse * 3.99) | 0)];
ctx.fillRect(x + 0.5, y2 + 0.5, lw, lh);
if (wAmt > 0.03) {
ctx.globalAlpha = _mn(1, (lAlpha / alphaMul) * (0.12 + 0.88 * wAmt));
ctx.fillStyle = "rgb(247,243,255)";
var ins = lw * 0.14;
ctx.fillRect(x + 0.5 + ins, y2 + 0.5 + ins, lw - ins * 2, lh - ins * 2);
}
continue;
}
var flick = valueNoise(col, row, timeSec, 1.5, 5), gap = 0.6 + 0.4 * clamp01((flick - (1 - fade) * 0.5) / 0.3);
var vis = clamp01((t - 0.2) / 0.18), baseAlpha = 0.04 + 0.96 * vis + 0.06 * clamp01((flick - 0.5) / 0.5) * (1 - vis);
var gridAlpha = clamp01(base * baseAlpha * gap * appear * 1.15 * (0.9 + 0.1 * hash01(col, row, 29)));
if (gridAlpha < 0.008) continue;
var y = row * cell;
ctx.globalAlpha = _mn(1, gridAlpha * 0.55);
ctx.fillStyle = purple;
ctx.fillRect(x + 0.5, y + 0.5, size, size);
if (wAmt > 0.03) {
ctx.globalAlpha = _mn(1, (gridAlpha / alphaMul) * (0.1 + 0.72 * wAmt));
ctx.fillStyle = "rgb(220, 204, 255)";
ctx.fillRect(x + 0.5, y + 0.5, size, size);
}
}
}
ctx.globalAlpha = 1;
}
function energyStopsFor(levels) {
var list = Array.isArray(levels) ? levels : [];
var n = list.length;
if (n <= 1) return { start: 0, end: 0.5, hasOffFirst: false };
var first = list[0];
var firstLabel = first && typeof first === "object" ? (first.effort || first.label || first.id || "") : String(first || "");
var hasOffFirst = isOffLevel(firstLabel);
var start = hasOffFirst ? 1 / (n - 1) : 0;
var end = (start + 1) / 2;
return { start: start, end: end, hasOffFirst: hasOffFirst };
}
function energyForPct(pct, startOverride) {
var p = clamp01(pct);
var start = typeof startOverride === "number" && Number.isFinite(startOverride) ? clamp01(startOverride) : ENERGY_START;
if (p <= start || start >= 1) return 0;
return clamp01((p - start) / (1 - start));
}
function speedFor(pct, startOverride) {
var e = energyForPct(pct, startOverride);
return Math.min(MAX_SPEED_FACTOR, Math.max(0.35, 2 * e));
}
function claudeIntensityFor(pct, startOverride) {
var e = energyForPct(pct, startOverride);
if (e <= 0) return 0;
return Math.round(Math.pow(e, 1.5) * 1000) / 1000;
}
function claudeSpeedFor(pct, startOverride) {
return speedFor(pct, startOverride) / MAX_SPEED_FACTOR;
}
function starDurationFor(starOrIndex, speedFactor) {
var idx = typeof starOrIndex === "number" ? starOrIndex : (starOrIndex && typeof starOrIndex.id === "number" ? starOrIndex.id : 0);
var speed = Math.min(MAX_SPEED_FACTOR, Math.max(0.35, typeof speedFactor === "number" && Number.isFinite(speedFactor) ? speedFactor : MAX_SPEED_FACTOR));
return ((_SF_MEAN * MAX_SPEED_FACTOR) / speed) * (1 - _SF_SPR + 2 * _SF_SPR * starHash01(idx, 29));
}
function starDelayFor(starOrIndex, duration) {
var idx = typeof starOrIndex === "number" ? starOrIndex : (starOrIndex && typeof starOrIndex.id === "number" ? starOrIndex.id : 0);
var p = PARTICLES[idx], ph = p && typeof p.phase === "number" ? p.phase : 0;
return -((ph + starHash01(idx, 53) * 0.03) % 1) * (typeof duration === "number" && duration > 0 ? duration : starDurationFor(idx, MAX_SPEED_FACTOR));
}
function starLayerOpacityFor(energyOrPct, startOverride) {
var e = typeof startOverride === "number" ? energyForPct(energyOrPct, startOverride) : clamp01(energyOrPct);
return e <= 0 ? 0 : Math.round((0.6 + 0.4 * e) * 1000) / 1000;
}
function parseHexRgb(hex) {
var n = parseInt(String(hex || "").replace(/^#/, ""), 16);
return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(hexA, hexB, t) {
var k = clamp01(t), a = parseHexRgb(hexA), b = parseHexRgb(hexB), m = function (i) { return Math.round(a[i] + (b[i] - a[i]) * k); };
return "#" + ((1 << 24) | (m(0) << 16) | (m(1) << 8) | m(2)).toString(16).slice(1);
}
var TONE_PAL = {
mono: ["#71717a", "#a1a1aa", "#d4d4d8", ""],
amber: ["#b45309", "#d97706", "#f59e0b", "#f59e0b"],
iris: ["#6d28d9", "#8b5cf6", "#a855f7", "#a78bfa"],
cobalt: ["#1d4ed8", "#2563eb", "#0284c7", "#38bdf8"]
};
function fillColorFor(pct, startOverride, endOverride, isClaude, accentOverride) {
var p = clamp01(pct);
var start = typeof startOverride === "number" && Number.isFinite(startOverride) ? startOverride : ENERGY_START;
var end = typeof endOverride === "number" && Number.isFinite(endOverride) ? endOverride : ENERGY_END;
var tone = accentOverride || resolvePrismAccentTone(null, null);
var tp = tone === "mono" || (!isClaude && TONE_PAL[tone]) ? TONE_PAL[tone] : isClaude ? ["#71717a", "#a78bfa", "#704ea2"] : ["#4d93f8", "#9333ea", "#4c1d95"];
if (p <= start + 1e-6) return tp[0];
if (p <= end + 1e-6) return mixHex(tp[0], tp[1], (p - start) / Math.max(1e-6, end - start));
return mixHex(tp[1], tp[2], (p - end) / Math.max(1e-6, 1 - end));
}
function fillBackgroundFor(pct, startOverride, endOverride, isClaude, accentOverride) {
var p = clamp01(pct);
var start = typeof startOverride === "number" && Number.isFinite(startOverride) ? startOverride : ENERGY_START;
var end = typeof endOverride === "number" && Number.isFinite(endOverride) ? endOverride : ENERGY_END;
var tone = accentOverride || resolvePrismAccentTone(null, null), lg = "linear-gradient(90deg,";
if (tone === "mono") return p <= 0.05 ? "rgba(161, 161, 170, 0.22)" : lg + " rgba(113, 113, 122, 0.45) 0%, " + fillColorFor(p, start, end, false, "mono") + " 100%)";
if (isClaude) return p <= 0.05 ? "rgba(142, 118, 192, 0.15)" : lg + " rgba(142, 118, 192, 0.25) 0%, " + fillColorFor(p, start, end, true, "follow") + " 100%)";
if (TONE_PAL[tone]) return lg + " " + TONE_PAL[tone][0] + " 0%, " + fillColorFor(p, start, end, false, tone) + " 100%)";
if (p <= start + 1e-6) return "#4d93f8";
var ec = fillColorFor(p, start, end, false, "follow"), sb = start > 0 ? Math.round((start / p) * 100) : 0;
var pre = lg + " #4d93f8 0%," + (sb > 0 ? " #4d93f8 " + sb + "%," : "");
return p <= end + 1e-6 ? pre + " " + ec + " 100%)" : pre + " #9333ea " + Math.round((end / p) * 100) + "%, " + ec + " 100%)";
}
function valueColorFor(label, index, count, isMax, hasOffFirst, isClaude, accentOverride) {
if (isOffLevel(label)) return "";
var n = Number(count) || 0;
if (n <= 1) return "";
var tone = accentOverride || resolvePrismAccentTone(null, null);
if (tone === "mono") return "";
var tp = !isClaude && TONE_PAL[tone];
var lo = isClaude ? "#94a3b8" : tp ? tp[1] : "#4d93f8";
var hi = isClaude ? "#c4b5fd" : tp ? tp[3] : "#8b5cf6";
if (isMax || index === n - 1) return hi;
var idx = typeof index === "number" && index >= 0 ? index : 0;
var first = hasOffFirst ? 1 : 0;
if (!tp && idx <= first) return lo;
if (isClaude && n === 3 && idx === 1) return "#a78bfa";
return mixHex(lo, hi, clamp01((idx - first) / Math.max(1, n - 1 - first)));
}
// ── 样式表注入（对齐 dsh-codex-effort-slider 右向左星尘横穿 + 星云扫光 + Antigravity 面板适配） ──
var SLIDER_CSS = "@keyframes ces-sweep{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}@keyframes ces-star-sweep{0%{transform:translate3d(0,0,0);opacity:0}6%,94%{opacity:1}100%{transform:translate3d(-100%,0,0);opacity:0}}.ces-inline,.ces-root,.ces-track,.ces-ag-section,.ces-ag-effort-row{box-sizing:border-box}.ces-inline,.ces-root,.ces-ag-section,.ces-ag-section *{user-select:none!important;-webkit-user-select:none!important;-webkit-tap-highlight-color:transparent!important}.ces-inline{width:100%;padding-top:6px}.ces-root{position:relative;width:100%;outline:none!important;box-shadow:none!important}.ces-track{position:relative;width:100%;height:28px;border-radius:999px;background:rgba(128,128,145,.18);box-shadow:inset 0 1px 2px rgba(0,0,0,.24),inset 0 0 0 1px rgba(255,255,255,.06);cursor:pointer;touch-action:none;transition:opacity .15s,box-shadow .2s}.ces-root[data-energy='1'] .ces-track{box-shadow:0 0 calc(var(--ces-energy,0) * 16px) rgba(168,85,247,.5),inset 0 1px 2px rgba(0,0,0,.24)}.ces-root[data-energy='0'] .ces-star,.ces-root[data-energy='0'] .ces-energy__sweep{animation-play-state:paused}.ces-track.is-locked{opacity:.45;cursor:not-allowed;filter:saturate(.25)}.ces-fill,.ces-energy,.ces-stars{position:absolute;top:0;left:0;bottom:0;width:var(--ces-fill,14px);border-radius:14px 0 0 14px;pointer-events:none}.ces-fill{background:var(--ces-fill-bg,#4d93f8);overflow:hidden}.ces-energy{overflow:hidden;opacity:var(--ces-energy,0);transition:opacity .2s;background:linear-gradient(90deg,#3b1178,#6d28d9 30%,#9333ea 62%,#c084fc)}.ces-energy__sweep{position:absolute;inset:0;background:linear-gradient(100deg,transparent 18%,rgba(255,255,255,.3) 50%,transparent 82%);transform:translateX(100%);animation:ces-sweep 2.4s linear infinite;pointer-events:none}.ces-stars{opacity:var(--ces-star-opacity,0);transition:opacity .2s;overflow:hidden}.ces-star{position:absolute;left:0;right:0;height:3px;margin-top:-1.5px;pointer-events:none;animation:ces-star-sweep linear infinite}.ces-star__dot{position:absolute;left:100%;top:0;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:#f5f3ff;box-shadow:0 0 5px rgba(216,180,254,.95);opacity:var(--ces-b,1);transform:scale(var(--ces-b,1))}.ces-ticks{position:absolute;inset:0;pointer-events:none}.ces-tick{position:absolute;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:rgba(255,255,255,.28);pointer-events:none;transition:background-color .12s}.ces-tick.is-on{background:rgba(255,255,255,.65)}.ces-tick.is-dim{background:rgba(255,255,255,.28)}.ces-knob{position:absolute;top:50%;left:var(--ces-fill,14px);width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.34),0 0 0 .5px rgba(0,0,0,.06);pointer-events:none;will-change:transform}.ces-root[data-theme='claude'] .ces-stars,.ces-root[data-theme='claude'] .ces-energy{display:none!important}.ces-root[data-theme='claude'] .ces-track{background:rgba(128,128,145,.16);box-shadow:inset 0 1px 2px rgba(0,0,0,.22),inset 0 0 0 1px rgba(255,255,255,.08)}.ces-root[data-theme='claude'][data-energy='1'] .ces-track{box-shadow:0 0 16px rgba(167,139,250,.45),inset 0 1px 2px rgba(0,0,0,.22)}.ces-root[data-theme='claude'] .ces-knob{width:24px;height:30px;margin:-15px 0 0 -12px;border-radius:7px;box-shadow:0 2px 6px rgba(0,0,0,.4),0 0 0 .5px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center}.ces-knob-notch{display:none;width:2px;height:10px;border-radius:999px;background:rgba(0,0,0,.28)}.ces-root[data-theme='claude'] .ces-knob-notch{display:block}.ces-claude-canvas{position:absolute;left:0;top:0;border-radius:14px 0 0 14px;display:none;pointer-events:none}.ces-root[data-theme='claude'][data-energy='1'] .ces-claude-canvas{display:block}@keyframes ces-claude-rise{0%{transform:translateY(20%) scale(.98);opacity:.15}60%{opacity:1}85%{transform:translateY(-2%) scale(1.01)}100%{transform:none;opacity:1}}.ces-ag-effort-value:is(.is-claude-changing,.ces-text-rise){animation:ces-claude-rise .24s cubic-bezier(.2,.85,.25,1)}.ces-ag-effort-value.is-glowing:is(.is-claude-changing,.ces-text-rise){animation:ces-claude-rise .24s cubic-bezier(.2,.85,.25,1),ces-text-bloom .4s cubic-bezier(.16,1,.3,1) forwards}[data-testid='model-selector-panel'].ces-ag-panel-enhanced{max-height:26rem!important}.ces-ag-section,.ces-ag-section *{outline:none!important}.ces-ag-section,.ces-ag-effort-row{display:flex;flex-direction:column;width:100%}.ces-ag-section{flex-shrink:0}.ces-ag-effort-row{padding:6px 8px 8px;border-radius:6px;transition:box-shadow .2s,background-color .2s}.ces-ag-effort-row:hover{background:rgba(128,128,145,.08)}.ces-ag-effort-row[data-ces-max='true'],[data-ces-effort-row='true'][data-ces-max='true']{box-shadow:inset 0 0 0 1px rgba(139,92,246,.42),0 0 14px -4px rgba(139,92,246,.45)!important;background:rgba(139,92,246,.06)}.ces-ag-effort-head{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:18px;padding:1px 0;font-size:12px;line-height:16px;overflow-y:clip;overflow-clip-margin:10px}.ces-ag-effort-title{display:inline-flex;align-items:center;gap:6px;color:inherit;font-weight:500;opacity:.9}.ces-ag-effort-value{position:relative;z-index:1;display:inline-block;font-size:12px;font-weight:600;transition:color .15s}.ces-ag-effort-value::after{content:'';position:absolute;top:50%;left:50%;width:52px;height:26px;border-radius:999px;transform:translate(-50%,-50%) scale(.6);background:radial-gradient(ellipse,var(--ces-glow-color,rgba(168,85,247,.85)),var(--ces-glow-color,rgba(168,85,247,.45)) 45%,rgba(168,85,247,0) 75%);filter:blur(8px);pointer-events:none;opacity:0;z-index:-1}@keyframes ces-glow-flash{0%{opacity:.95;transform:translate(-50%,-50%) scale(.65);filter:blur(6px)}25%{opacity:1;transform:translate(-50%,-50%) scale(1.15);filter:blur(8px)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.5);filter:blur(14px)}}@keyframes ces-text-bloom{0%{text-shadow:0 0 8px var(--ces-glow-color,#c084fc)}30%{text-shadow:0 0 14px var(--ces-glow-color,#c084fc),0 0 3px #fff}100%{text-shadow:none}}.ces-ag-effort-value.is-glowing{animation:ces-text-bloom .4s cubic-bezier(.16,1,.3,1) forwards}.ces-ag-effort-value.is-glowing::after{animation:ces-glow-flash .4s cubic-bezier(.16,1,.3,1) forwards}@media (prefers-reduced-motion:reduce){.ces-panel-shaking,.ces-ag-effort-value.is-glowing,.ces-ag-effort-value.is-glowing::after,.ces-ag-effort-value.ces-text-rise,.ces-ag-effort-value.is-claude-changing{animation:none!important}}html[data-ces-slider-ready='1'] [role='menu']:has([data-testid='model-selector-effort-option']):not(:has([data-testid='model-selector-panel'])),html[data-ces-slider-ready='1'] div[role='presentation']:has(>[role='menu'] [data-testid='model-selector-effort-option']):not(:has([data-testid='model-selector-panel'])),html[data-ces-slider-ready='1'] [role='menu']:has([data-testid='orchestrator-picker-effort']):not(:has([data-testid='model-selector-panel'])),html[data-ces-slider-ready='1'] div[role='presentation']:has([data-testid='orchestrator-picker-effort']):not(:has([data-testid='model-selector-panel'])),html[data-ces-slider-ready='1'] [data-testid='orchestrator-picker-effort']:not(:has([data-testid='model-selector-panel'])),html[data-ces-slider-ready='1'] [data-ag-cs-orch-l3='1']{display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important}html[data-ces-slider-ready='1'] [role='menuitem']:has([data-testid='model-selector-effort-group'])>span.shrink-0:last-child,html[data-ces-slider-ready='1'] [data-ces-orch-row='1']>svg:last-child:not(:first-child):not(.lucide-check),html[data-ces-slider-ready='1'] [data-ces-orch-row='1']>span:last-child:not(:first-child):has(>svg:only-child:not(.lucide-check)),html[data-ces-slider-ready='1'] [data-ces-orch-row='1']>*:last-child>svg:last-child:not(.lucide-check){display:none!important}html[data-ces-slider-ready='1'] [role='menuitem']:has([data-testid='model-selector-effort-group'])>.group-hover\\:hidden{display:flex!important}[role='menuitem'][data-ces-model-selected='true'],[data-ces-orch-row='1'][data-ces-model-selected='true']{background:rgba(128,128,145,.14)}.ces-set{position:fixed;z-index:2147483646;width:268px;padding:12px;border-radius:10px;background:rgba(24,24,28,.96);color:#f4f4f6;border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 32px rgba(0,0,0,.55);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;box-sizing:border-box;user-select:none}.ces-set-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.08);font-weight:600;font-size:12.5px}.ces-set-ver{font-size:11px;font-weight:400;opacity:.55}.ces-set-group{margin-bottom:10px}.ces-set-label{margin-bottom:5px;font-size:11px;opacity:.72}.ces-set-opts{display:flex;gap:4px}.ces-set-opt{flex:1;padding:5px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#d4d4d8;font-size:11.5px;cursor:pointer;text-align:center;transition:all .12s ease}.ces-set-opt:hover{background:rgba(255,255,255,.1);color:#fff}.ces-set-opt.is-on{background:rgba(139,92,246,.28);border-color:rgba(139,92,246,.75);color:#fff;font-weight:600}.ces-set-actions{display:flex;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)}.ces-set-btn{flex:1;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#e4e4e7;font-size:11px;cursor:pointer}.ces-set-btn:hover{background:rgba(255,255,255,.14)}[data-testid='model-selector-panel'] .ces-ag-section[data-effort-slot='true']{grid-template-rows:auto auto}[data-testid='model-selector-panel'] .ces-ag-section[data-effort-slot='true']>[role='separator']{grid-row:1;grid-column:1}[data-testid='model-selector-panel'] .ces-ag-section[data-effort-slot='true']>:is(.ces-ag-effort-row,[data-testid='orchestrator-effort-bar']){grid-row:2!important;grid-column:1!important}";
function installStyles(doc) {
var d = doc || (typeof document !== "undefined" ? document : null);
if (!d || !d.head) return null;
var s = d.getElementById(STYLE_ELEMENT_ID);
if (!s) { s = d.createElement("style"); s.id = STYLE_ELEMENT_ID; d.head.appendChild(s); }
if (s.textContent !== SLIDER_CSS) s.textContent = SLIDER_CSS;
return s;
}
// ── 右键设置面板 ────────────────────────────────────────────────────────────
var SET_TITLE_I18N = { "zh-CN": "推理等级滑条设置", "zh-TW": "推理等級滑桿設定", en: "Effort Slider", ja: "推論スライダー設定", ko: "추론 슬라이더 설정", es: "Ajustes de esfuerzo", fr: "Réglages d’effort", de: "Aufwandsregler-Einstellungen" };
var SET_HEAD_I18N = { "zh-CN": "推理等级滑条", "zh-TW": "推理等級滑桿", en: "Effort Slider", ja: "推論スライダー", ko: "추론 슬라이더", es: "Nivel de esfuerzo", fr: "Niveau d’effort", de: "Aufwandsregler" };
var FIXED_I18N = { "zh-CN": "固定", "zh-TW": "固定", en: "Fixed", ja: "固定", ko: "고정", es: "Fijo", fr: "Fixe", de: "Fest" };
function _normSliderLang(raw, win) {
var v = String(raw || "").trim();
if (!v || v.toLowerCase() === "auto") {
var w = _win(win);
var navObj = w && "navigator" in w ? w.navigator : (typeof navigator !== "undefined" ? navigator : null);
v = String(navObj?.language || "").trim();
}
var s = v.toLowerCase().replace(/_/g, "-");
if (!s || s === "auto") return "en";
if (s === "yue" || s.startsWith("yue-") || s === "zh-yue" || s.includes("cantonese")) return "zh-CN";
if (/^zh-(tw|hant|hk|mo)/.test(s) || s === "tw" || s === "hant") return "zh-TW";
if (/^zh/.test(s)) return "zh-CN";
if (/^(ja|jp)/.test(s) || s === "japanese") return "ja";
if (/^(ko|kr)/.test(s) || s === "korean") return "ko";
if (/^es/.test(s) || s === "spanish") return "es";
if (/^fr/.test(s) || s === "french") return "fr";
if (/^de/.test(s) || s === "german") return "de";
return "en";
}
function _isZhLang(lk) { var n = _normSliderLang(lk); return n === "zh-CN" || n === "zh-TW"; }
function openSettingsPanel(options) {
var o = options || {}, d = o.document || (typeof document !== "undefined" ? document : null);
var w = o.window || d?.defaultView || (typeof window !== "undefined" ? window : globalRoot);
if (!d?.body) return () => {};
installStyles(d);
var lk = _normSliderLang(getPrismRootAttr(d, w, "data-ag-cs-lang"), w);
var zh = lk === "zh-CN" || lk === "zh-TW";
d.querySelector(".ces-set")?.remove?.();
var mk = (t, c, tx) => { var e = d.createElement(t); if (c) e.className = c; if (tx) e.textContent = tx; return e; };
var p = markNoTranslate(mk("div", "ces-set"));
p.setAttribute("role", "dialog");
p.setAttribute("aria-label", SET_TITLE_I18N[lk] || SET_TITLE_I18N.en);
p.style.left = Math.max(8, Math.min((w?.innerWidth || 800) - 276, typeof o.x === "number" ? o.x : 120)) + "px";
p.style.top = Math.max(8, Math.min((w?.innerHeight || 600) - 230, typeof o.y === "number" ? o.y : 120)) + "px";
var hd = mk("div", "ces-set-head");
hd.appendChild(mk("span", "", SET_HEAD_I18N[lk] || SET_HEAD_I18N.en));
hd.appendChild(mk("span", "ces-set-ver", "v1.2.1"));
p.appendChild(hd);
var obs = [];
var ref = () => {
var cur = readSettings(w);
for (var it of obs) {
var on = cur[it.k] === it.v;
if (it.b.classList) it.b.classList.toggle ? it.b.classList.toggle("is-on", on) : it.b.classList[on ? "add" : "remove"]("is-on");
else it.b.className = on ? "ces-set-opt is-on" : "ces-set-opt";
it.b.setAttribute("aria-pressed", String(on));
}
};
for (var sc of SETTINGS_SCHEMA) {
var g = mk("div", "ces-set-group"), r = mk("div", "ces-set-opts");
g.appendChild(mk("div", "ces-set-label", zh ? sc.label : (sc.labelEn || sc.label)));
for (var op of sc.options) {
let k = sc.key, v = op.value;
var b = mk("button", "ces-set-opt", zh ? op.label : (op.labelEn || op.label));
b.type = "button";
var hTxt = zh ? op.hint : (op.hintEn || op.hint);
if (hTxt) b.title = hTxt;
b.addEventListener("click", (ev) => { ev.stopPropagation(); writeSettings({ [k]: v }, w); ref(); });
obs.push({ k, v, b });
r.appendChild(b);
}
g.appendChild(r); p.appendChild(g);
}
var acts = mk("div", "ces-set-actions");
var mb = (tx, fn) => {
var b = mk("button", "ces-set-btn", tx);
b.type = "button";
b.addEventListener("click", (ev) => { ev.stopPropagation(); fn(b); });
acts.appendChild(b);
};
mb(zh ? "复制诊断" : "Copy Debug", (b) => { try { w?.navigator?.clipboard?.writeText?.(JSON.stringify(dumpTrace(w), null, 2)); } catch {} b.textContent = zh ? "已复制" : "Copied"; });
mb(zh ? "恢复默认" : "Reset", () => { resetSettings(w); ref(); });
mb(zh ? "关闭" : "Close", () => cls());
p.appendChild(acts);
ref();
var offS = onSettingsChange(ref, w);
var onPd = (ev) => { if (!p.contains(ev.target)) cls(); };
var onKd = (ev) => { if (ev?.key === "Escape") { ev.stopPropagation(); cls(); } };
function cls() { offS(); d.removeEventListener("pointerdown", onPd, true); d.removeEventListener("keydown", onKd, true); p.parentNode?.removeChild(p); }
d.addEventListener("pointerdown", onPd, true);
d.addEventListener("keydown", onKd, true);
d.body.appendChild(p);
return cls;
}
function installSettingsUi(options) {
var o = options || {}, d = o.document || (typeof document !== "undefined" ? document : null);
var w = o.window || d?.defaultView || (typeof window !== "undefined" ? window : globalRoot);
if (!d) return { stop: () => {} };
var ac = null, lt = null, ps = null;
var inS = (t) => t?.closest?.(".ces-inline, .ces-root, .ces-ag-effort-row") || null;
var clr = () => { if (lt !== null) { clearTimeout(lt); lt = null; } ps = null; };
var opn = (x, y) => { ac?.(); ac = openSettingsPanel({ document: d, window: w, x: x || 120, y: y || 120 }); };
var evs = [
["contextmenu", (ev) => { if (!inS(ev.target)) return; ev.preventDefault(); ev.stopPropagation(); opn(ev.clientX, ev.clientY); }],
["keydown", (ev) => { var h = inS(ev.target); if (h && (ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey))) { ev.preventDefault(); ev.stopPropagation(); var rc = h.getBoundingClientRect?.() || { left: 120, bottom: 120 }; opn(rc.left, rc.bottom + 4); } }],
["pointerdown", (ev) => { if (!inS(ev.target) || ev.button === 2) return; clr(); ps = { x: ev.clientX || 0, y: ev.clientY || 0 }; lt = setTimeout(() => { lt = null; opn(ps?.x, ps?.y); }, 500); }],
["pointermove", (ev) => { if (!ps || lt === null) return; var dx = (ev.clientX || 0) - ps.x, dy = (ev.clientY || 0) - ps.y; if (dx * dx + dy * dy > 36) clr(); }],
["pointerup", clr], ["pointercancel", clr]
];
evs.forEach((e) => d.addEventListener(e[0], e[1], true));
return { stop: () => { clr(); ac?.(); ac = null; evs.forEach((e) => d.removeEventListener(e[0], e[1], true)); } };
}
// ── DOM 与 Antigravity React Fiber 解析辅助函数 ─────────────────────────────
var INFERENCE_LABELS = ["推理等级", "Reasoning effort", "Reasoning Effort", "Thinking effort", "推理强度"];
function parseModelLabel(label) {
if (!label || typeof label !== "string") return null;
var match = AG_MODEL_LABEL_RE.exec(label.trim());
if (!match) return null;
var base = match[1].trim();
var effort = match[2].toLowerCase();
// 兼容展示名 "(Extra)" 与内部枚举 "(xhigh)"，统一归并到 xhigh 槽位进行排序与着色
if (effort === "extra") effort = "xhigh";
return {
base: base,
effort: effort,
effortLabel: AG_EFFORT_LABELS[effort] || match[2]
};
}
var _AG_TRIG_SEL = '[data-testid="model-selector-trigger"],button[aria-label^="Select model"]';
var _AG_PANE_SEL = '[data-testid="agent-input-box"],[data-testid="conversation-view"],.surface-composer-card,[data-tiling-pane]';
var _lastTrigStateByDoc = typeof WeakMap === "function" ? new WeakMap() : null;
function _isSubTrigger(el) { return Boolean(el && el.closest && el.closest('[data-testid="subagent-tab-conversation"]')); }
function _isTrigVisible(el) {
if (!el || el.isConnected === false || el.hidden === true) return false;
if (el.style && (el.style.display === "none" || el.style.visibility === "hidden")) return false;
if (el.closest && el.closest("[hidden], .hidden")) return false;
if (el.checkVisibility) { try { if (!el.checkVisibility()) return false; } catch (e) {} }
return true;
}
function _isTrigExpanded(el) {
if (!el || !el.getAttribute) return false;
return el.getAttribute("aria-expanded") === "true" || el.getAttribute("data-state") === "open" || (el.hasAttribute && el.hasAttribute("data-popup-open") && el.getAttribute("data-popup-open") !== "false");
}
function _rememberActiveTrigger(doc, triggerEl, paneEl) {
if (!doc || !_lastTrigStateByDoc) return;
var prev = _lastTrigStateByDoc.get(doc) || { trigger: null, pane: null };
if (triggerEl !== undefined) prev.trigger = triggerEl;
if (paneEl !== undefined) prev.pane = paneEl;
_lastTrigStateByDoc.set(doc, prev);
}
function _findTriggerInNode(scope) {
if (!scope) return null;
if (scope.matches && scope.matches(_AG_TRIG_SEL) && !_isSubTrigger(scope) && scope.isConnected !== false) return scope;
if (scope.querySelectorAll) {
var ls = scope.querySelectorAll(_AG_TRIG_SEL), fb = null;
for (var i = 0; i < ls.length; i += 1) {
var el = ls[i];
if (!el || _isSubTrigger(el)) continue;
if (_isTrigVisible(el)) return el;
if (!fb) fb = el;
}
return fb;
}
var q = scope.querySelector && scope.querySelector(_AG_TRIG_SEL);
return q && !_isSubTrigger(q) ? q : null;
}
function findAntigravityTrigger(doc, hintEl) {
var d = doc || (typeof document !== "undefined" ? document : null);
if (!d) return null;
if (hintEl && hintEl.isConnected !== false) {
var hDirect = _findTriggerInNode(hintEl);
if (hDirect) return hDirect;
var hPane = hintEl.closest && hintEl.closest(_AG_PANE_SEL);
if (hPane) {
var hPaneHit = _findTriggerInNode(hPane);
if (hPaneHit) return hPaneHit;
}
}
var visList = [], firstHidden = null;
if (d.querySelectorAll) {
var list = d.querySelectorAll(_AG_TRIG_SEL);
for (var i = 0; i < list.length; i += 1) {
var el = list[i];
if (!el || _isSubTrigger(el)) continue;
if (_isTrigVisible(el)) {
if (_isTrigExpanded(el)) return el;
visList.push(el);
} else if (!firstHidden) {
firstHidden = el;
}
}
}
if (visList.length > 1) {
var openPanel = findAntigravityPanel(d);
if (openPanel) {
var pCtx = _rdAgFiber(openPanel);
if (pCtx && pCtx.conversationId) {
for (var pIdx = 0; pIdx < visList.length; pIdx += 1) {
var tCtx = _rdAgFiber(visList[pIdx]);
if (tCtx && tCtx.conversationId === pCtx.conversationId) return visList[pIdx];
}
}
}
var rec = _lastTrigStateByDoc ? _lastTrigStateByDoc.get(d) : null;
if (rec) {
if (rec.trigger && rec.trigger.isConnected !== false && !_isSubTrigger(rec.trigger) && _isTrigVisible(rec.trigger)) return rec.trigger;
if (rec.pane && rec.pane.isConnected !== false && !_isSubTrigger(rec.pane)) {
var fromRecPane = _findTriggerInNode(rec.pane);
if (fromRecPane && _isTrigVisible(fromRecPane)) return fromRecPane;
}
}
var actEl = d.activeElement;
if (actEl && actEl !== d.body && actEl !== d.documentElement) {
var actDirect = _findTriggerInNode(actEl);
if (actDirect && _isTrigVisible(actDirect)) return actDirect;
var actPane = actEl.closest && actEl.closest(_AG_PANE_SEL);
if (actPane && !_isSubTrigger(actPane)) {
var fromActPane = _findTriggerInNode(actPane);
if (fromActPane && _isTrigVisible(fromActPane)) return fromActPane;
}
}
}
if (visList.length > 0) return visList[0];
if (firstHidden) return firstHidden;
var q = d.querySelector && (d.querySelector('[data-testid="model-selector-trigger"]') || d.querySelector('button[aria-label^="Select model"]'));
return q && !_isSubTrigger(q) ? q : null;
}
function _isTrigLocked(doc, hintEl) {
var tr = (hintEl && hintEl.isConnected !== false && hintEl.matches && hintEl.matches(_AG_TRIG_SEL) && !_isSubTrigger(hintEl)) ? hintEl : findAntigravityTrigger(doc, hintEl);
if (!tr) return false;
if (tr.disabled === true || (tr.hasAttribute && tr.hasAttribute("disabled")) || (tr.getAttribute && tr.getAttribute("aria-disabled") === "true")) return true;
var dd = tr.getAttribute && tr.getAttribute("data-disabled");
return dd !== null && dd !== undefined && dd !== "false";
}
function findAntigravityPanel(doc) {
var d = doc || (typeof document !== "undefined" ? document : null);
return d && d.querySelector ? d.querySelector('[data-testid="model-selector-panel"]') : null;
}
function findInferenceRow(doc) {
var d = doc || (typeof document !== "undefined" ? document : null);
if (!d || typeof d.querySelectorAll !== "function") return null;
var explicit = d.querySelector('[data-ces-effort-row="true"]');
if (explicit) return explicit;
var menus = d.querySelectorAll('[role="menu"], .surface-menu, [data-testid="model-selector-panel"]');
for (var mIdx = 0; mIdx < menus.length; mIdx += 1) {
var menu = menus[mIdx];
var items = menu.querySelectorAll('[role="menuitem"], .ces-ag-effort-row, div, button');
for (var i = 0; i < items.length; i += 1) {
var el = items[i];
var txt = (el.textContent || "").trim();
for (var k = 0; k < INFERENCE_LABELS.length; k += 1) {
var kw = INFERENCE_LABELS[k];
if (txt === kw || txt.indexOf(kw) === 0) {
return el.closest('[role="menuitem"]') || el;
}
}
}
}
return null;
}
function findValueElement(row) {
if (!row || typeof row.querySelector !== "function") return null;
var ex = row.querySelector('[data-ces-part="value"], .ces-ag-effort-value');
if (ex) return ex;
var ch = row.querySelectorAll("span, div"), cand = null;
for (var i = 0; i < ch.length; i += 1) {
var c = ch[i], t = (c.textContent || "").trim();
if (!t || (c.closest && c.closest(".ces-inline")) || (c.children && c.children.length)) continue;
if (INFERENCE_LABELS.indexOf(t) < 0) cand = c;
}
return cand;
}
function syncTriggerColor(doc, label, index, count, isMax, hasOffFirst, isClaude, triggerEl) {
var d = doc || (typeof document !== "undefined" ? document : null);
if (!d) return;
var ag = triggerEl || findAntigravityTrigger(d), col = valueColorFor(label, index, count, isMax, hasOffFirst, typeof isClaude === "boolean" ? isClaude : isClaudeModel(ag ? ag.textContent : ""), resolvePrismAccentTone(d, null)) || "";
if (ag) {
var sp = ag.querySelector("span.opacity-70, [data-ces-part='trigger-effort']");
if (sp) { sp.setAttribute("data-ces-part", "trigger-effort"); sp.style.color = col; sp.style.opacity = col ? "1" : ""; sp.style.fontWeight = col ? "600" : ""; }
return;
}
if (!d.querySelectorAll) return;
var cs = d.querySelectorAll(".surface-composer, .surface-composer-card, form, body");
for (var i = 0; i < cs.length; i += 1) {
var bs = cs[i].querySelectorAll('button[aria-haspopup="menu"]');
for (var j = 0; j < bs.length; j += 1) if ((bs[j].textContent || "").indexOf(" · ") >= 0) { var sps = bs[j].querySelectorAll("span"); (sps.length ? sps[sps.length - 1] : bs[j]).style.color = col; return; }
}
}
function findSeatEffort(win) {
var map = (win || (typeof window !== "undefined" ? window : globalRoot));
map = map && map.__dshSeats;
if (!map || typeof map.forEach !== "function") return null;
var found = null;
map.forEach(function (s) { if (!found && s && Array.isArray(s.effortLevels)) found = s; });
return found;
}
function getReactFiber(el) {
if (!el || typeof el !== "object") return null;
var raw = null, ks = Object.keys(el);
for (var i = 0; i < ks.length; i += 1) if (ks[i].indexOf("__reactFiber$") === 0 || ks[i].indexOf("__reactInternalInstance$") === 0) { raw = el[ks[i]]; break; }
if (!raw) return null;
if (raw.alternate) {
var root = raw, g = 0;
while (root.return && g < 80) { root = root.return; g += 1; }
if (root && root.stateNode && root.stateNode.current && root.stateNode.current !== root) return raw.alternate;
}
return raw;
}
function _slug(s) {
return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function _isOrch(m) {
if (!m) return false;
if (typeof m === "string") return /\borchestrator\b|编排/i.test(m);
return /\borchestrator\b|编排/i.test(String(m.label || "")) || /orchestrator/i.test(String(m.modelId || ""));
}
function buildEffortIndexFromOptions(list) {
var out = new Map();
if (!Array.isArray(list)) return out;
for (var i = 0; i < list.length; i += 1) {
var o = list[i];
if (!o || o.isCustom || typeof o.label !== "string" || _isOrch(o)) continue;
var p = parseModelLabel(o.label);
if (!p) continue;
var m = out.get(p.base);
if (!m) { m = new Map(); out.set(p.base, m); }
if (!m.has(p.effort)) m.set(p.effort, o);
}
return out;
}
function normalizeEffortIndex(raw, opts) {
var out = buildEffortIndexFromOptions(opts);
if (!(raw instanceof Map)) return out;
raw.forEach(function (inn, rk) {
if (!(inn instanceof Map) || !inn.size) return;
var db = "";
inn.forEach(function (o) {
if (db || !o || typeof o.label !== "string") return;
var p = parseModelLabel(o.label);
if (p && p.base) db = p.base;
});
var k = db || String(rk || "");
if (!k) return;
var mg = out.get(k) || new Map();
inn.forEach(function (o, ek) {
var nk = String(ek || "").toLowerCase();
if (nk === "extra") nk = "xhigh";
if (nk && o && !mg.has(nk)) mg.set(nk, o);
});
if (mg.size) out.set(k, mg);
});
return out;
}
function _luEff(idx, base) {
if (!base || !(idx instanceof Map)) return null;
var d = idx.get(base);
if (d instanceof Map && d.size) return d;
var w = _slug(base), hit = w ? idx.get(w) : null;
if (!(hit instanceof Map && hit.size) && w) { hit = null; idx.forEach(function (v, k) { if (!hit && v instanceof Map && v.size && _slug(k) === w) hit = v; }); }
return hit;
}
function _resOrch(ctx, ovr) {
var pk = ctx && (ctx.orchPick || ctx.orchestratorPick), ps = ctx && (ctx.orchPlanners || ctx.orchestratorPlanners);
if (!pk || typeof pk.select !== "function" || !Array.isArray(ps) || !ps.length) return null;
var f = function (r) {
if (!r) return null;
if (typeof r === "object" && typeof r.label === "string") return r;
for (var i = 0; i < ps.length; i += 1) if (ps[i] && (ps[i].value === r || ps[i].modelId === r || ps[i].label === r)) return ps[i];
return null;
};
var def = f(ctx.orchDef || ctx.orchestratorDefaultPlanner) || ps[0] || null;
var act = f(ovr) || f(pk.model) || def;
var oi = ctx.orchIdx || ctx.orchestratorPlannerIndex;
return act ? { opt: act, def: def, idx: oi instanceof Map && oi.size ? oi : ctx.effortIndex } : null;
}
/**
* 从 Antigravity 的 DOM 节点向上遍历 React Fiber 树，提取：
* - OXb.Provider: effortIndex, modelOptions, selectedModel, groups
* - $Xb         : 未包装 setIsOpen(false) 的 setSelectedModel, open, setIsOpen
* - cYb         : conversationId
* - eKa.Provider: setModelConfigByLabelForConversation（直接切档不关菜单、不抢焦点）
*/
function _rdAgFiber(el) {
var cur = getReactFiber(el);
if (!cur) return null;
var sc = null, ip = null, op = null, cid, hasC = false, gm = null;
for (var step = 0; cur && step < 500; step += 1, cur = cur.return) {
var props = cur.memoizedProps;
if (!props || typeof props !== "object") continue;
var val = props.value;
if (!sc && val && typeof val === "object" && val.effortIndex instanceof Map && Array.isArray(val.modelOptions)) sc = val;
if (typeof props.setIsOpen === "function" && typeof props.setSelectedModel === "function" && Array.isArray(props.modelOptions)) { if (!ip) ip = props; op = props; }
if (!hasC && ("conversationId" in props) && ("placement" in props)) { hasC = true; cid = props.conversationId; }
if (!gm && val && typeof val === "object" && typeof val.setModelConfigByLabelForConversation === "function") gm = val;
if (sc && op && hasC && gm) break;
}
if (!sc && !ip && !op && !gm) return null;
var mos = op?.modelOptions || ip?.modelOptions || sc?.modelOptions || gm?.visibleModelConfigs || [];
var sel = op?.selectedModel || ip?.selectedModel || sc?.selectedModel || (gm && (hasC && typeof gm.getModelConfigForConversation === "function" ? gm.getModelConfigForConversation(cid) : gm.currentModelConfig)) || null;
var _fn = (o, k) => (o && typeof o[k] === "function" ? o[k] : null), ops = Array.isArray(sc?.orchestratorPlanners) ? sc.orchestratorPlanners : [];
return {
effortIndex: normalizeEffortIndex(sc?.effortIndex, mos), modelOptions: mos, selectedModel: sel,
orchPlanners: ops, orchIdx: normalizeEffortIndex(sc?.orchestratorPlannerIndex, ops),
orchDef: sc?.orchestratorDefaultPlanner || null,
orchPick: sc?.orchestratorPick && typeof sc.orchestratorPick === "object" ? sc.orchestratorPick : null,
groups: sc?.groups || [], conversationId: cid, hasConversationSelector: hasC,
setModelConfigByLabelForConversation: _fn(gm, "setModelConfigByLabelForConversation"),
setCurrentModelConfigByLabel: _fn(gm, "setCurrentModelConfigByLabel"),
unwrappedSetSelectedModel: _fn(op, "setSelectedModel") || _fn(ip, "setSelectedModel") || _fn(sc, "setSelectedModel"),
setIsOpen: _fn(op, "setIsOpen") || _fn(ip, "setIsOpen") || _fn(sc, "setIsOpen"),
isOpen: Boolean(op?.open || ip?.open)
};
}
function resolveModelEffortProfile(ctx, targetModelOrBase, _effMap, planOvr) {
if (!ctx) return null;
var selected = ctx.selectedModel, modelObj = null, baseName = "", activeEffort = "";
if (typeof targetModelOrBase === "string" && targetModelOrBase) baseName = targetModelOrBase;
else if (targetModelOrBase && typeof targetModelOrBase === "object") modelObj = targetModelOrBase;
else modelObj = selected;
var isOrch = _isOrch(modelObj || baseName), idx = ctx.effortIndex, orchTune = false;
if (isOrch) {
var pi = _resOrch(ctx, planOvr);
if (pi?.opt) { modelObj = pi.opt; idx = pi.idx || ctx.effortIndex; orchTune = true; }
}
if (typeof modelObj?.label === "string") {
var parsed = parseModelLabel(modelObj.label);
if (parsed) { baseName = parsed.base; activeEffort = parsed.effort; }
else baseName = modelObj.label;
}
var byEffort = _luEff(idx, baseName);
if (byEffort && byEffort.size >= 2) {
var sortedKeys = AG_EFFORT_ORDER.filter((k) => byEffort.has(k));
if (!activeEffort) {
var rem = _effMap?.get(baseName);
if (rem && byEffort.has(rem)) activeEffort = rem;
else {
var selParsed = selected && parseModelLabel(selected.label);
activeEffort = (selParsed && selParsed.base === baseName && byEffort.has(selParsed.effort)) ? selParsed.effort : byEffort.has("medium") ? "medium" : (sortedKeys[0] || "");
}
}
var levels = sortedKeys.map((k) => ({ effort: k, label: AG_EFFORT_LABELS[k] || k, modelOption: byEffort.get(k) }));
var currentIndex = Math.max(0, sortedKeys.indexOf(activeEffort)), isClaude = isClaudeModel(baseName), ck = sortedKeys[currentIndex];
return {
baseName, isOrchestrator: isOrch, orchestratorTunable: orchTune,
isClaude, theme: isClaude ? "claude" : "codex", locked: false, levels,
currentIndex, currentEffort: ck || activeEffort,
currentLabel: AG_EFFORT_LABELS[ck] || activeEffort,
modelOption: byEffort.get(ck) || modelObj
};
}
var sP = modelObj && parseModelLabel(modelObj.label), sE = sP ? sP.effort : "fixed";
var sL = sP ? sP.effortLabel : (FIXED_I18N[_normSliderLang(getPrismRootAttr(null, null, "data-ag-cs-lang"))] || FIXED_I18N.en);
var bn = baseName || modelObj?.label || "", sC = isClaudeModel(bn);
return {
baseName: bn, isOrchestrator: isOrch, orchestratorTunable: false,
isClaude: sC, theme: sC ? "claude" : "codex", locked: true,
levels: [{ effort: sE, label: sL, modelOption: modelObj }],
currentIndex: 0, currentEffort: sE, currentLabel: sL, modelOption: modelObj
};
}
function _commitAgOpt(ctx, targetOption, isOrchPlan, keepOpen, triggerEl) {
if (!ctx || !targetOption?.label) return false;
var shouldKeep = keepOpen !== false;
try {
var pk = ctx.orchPick || ctx.orchestratorPick;
if (isOrchPlan && typeof pk?.select === "function") {
var def = ctx.orchDef || ctx.orchestratorDefaultPlanner;
pk.select(def && def.value === targetOption.value ? 0 : targetOption.value);
if (shouldKeep) { try { ctx.setIsOpen?.(true); } catch {} }
return true;
}
if (typeof ctx.setModelConfigByLabelForConversation === "function") {
ctx.setModelConfigByLabelForConversation(targetOption.label, ctx.conversationId, shouldKeep);
return true;
}
if (typeof ctx.unwrappedSetSelectedModel === "function") {
var d = typeof document !== "undefined" ? document : null;
var pScope = triggerEl && triggerEl.closest ? triggerEl.closest('[data-testid="agent-input-box"],[data-testid="conversation-view"]') : null;
var ed = pScope?.querySelector?.('[contenteditable="true"]') || d?.querySelector?.('[contenteditable="true"]');
var prevFocus = d?.activeElement, onFocus = (ev) => { ev?.stopPropagation?.(); try { ed?.blur?.(); } catch {} };
ed?.addEventListener?.("focus", onFocus, true);
try {
ctx.unwrappedSetSelectedModel(targetOption);
if (ed && d?.activeElement === ed) {
try { ed.blur?.(); } catch {}
if (prevFocus && prevFocus !== ed) { try { prevFocus.focus?.(); } catch {} }
}
} finally {
ed?.removeEventListener?.("focus", onFocus, true);
}
if (shouldKeep) { try { ctx.setIsOpen?.(true); } catch {} }
return true;
}
if (typeof ctx.setCurrentModelConfigByLabel === "function") {
ctx.setCurrentModelConfigByLabel(targetOption.label);
return true;
}
} catch (err) {
tracePush("ag-commit-error", { message: String(err?.message || err) });
}
return false;
}
function extractEffortKey(item) {
return item == null ? "" : typeof item === "object" ? String(item.effort || item.id || item.value || item.key || item.label || "") : String(item);
}
function _extEffLbl(item, effortKey, seat) {
if (typeof item?.label === "string" && item.label) return item.label;
if (typeof seat?.formatEffortLabel === "function") { try { var f = seat.formatEffortLabel(effortKey); if (f) return String(f); } catch {} }
return AG_EFFORT_LABELS[String(effortKey || "").toLowerCase()] || String(effortKey || "");
}
var EFFORT_TITLE_I18N = { "zh-CN": "推理等级", "zh-TW": "推理等級", en: "Reasoning Effort", ja: "推論レベル", ko: "추론 수준", es: "Nivel de razonamiento", fr: "Niveau de raisonnement", de: "Denkaufwand" };
function resolveEffortTitle(doc, win) {
var lang = _normSliderLang(getPrismRootAttr(doc, win, "data-ag-cs-lang"), win);
try {
var ui = (win?.__agCsLocales || globalRoot?.__agCsLocales)?.getUiStrings?.(lang);
if (ui?.effortTitle) return String(ui.effortTitle);
} catch {}
return EFFORT_TITLE_I18N[lang] || EFFORT_TITLE_I18N.en;
}
function _clrSibs(r) {
for (var g of r?.querySelectorAll?.('[data-testid="model-selector-effort-group"]') || []) if (g?.nextElementSibling) delete g.nextElementSibling.__cesLastText;
}
function _clrAgDom(doc) {
if (!doc?.querySelectorAll) return;
for (var sp of doc.querySelectorAll('[data-ces-part="trigger-effort"], [data-testid="model-selector-trigger"] span[style]')) {
if (sp.style) sp.style.color = sp.style.opacity = sp.style.fontWeight = "";
sp.removeAttribute?.("data-ces-part");
delete sp.__cesLastText;
}
for (var trEl of doc.querySelectorAll(_AG_TRIG_SEL)) {
var te = trEl?.querySelector?.("span.opacity-70, [data-ces-part='trigger-effort']");
if (te) delete te.__cesLastText;
}
_clrSibs(doc);
for (var v of doc.querySelectorAll('[data-ces-part="value"], .ces-ag-effort-value')) { delete v.__cesLastLabel; delete v.__cesLastKey; }
for (var p of doc.querySelectorAll(".ces-ag-panel-enhanced")) p.classList?.remove("ces-ag-panel-enhanced");
for (var a of ["data-ces-model-selected", "data-ag-cs-model-submenu", "data-ag-cs-orch-l2", "data-ag-cs-orch-l3", "data-ces-orch-row", "data-ces-orch-b", "data-ces-orch-tunable"]) {
for (var m of doc.querySelectorAll("[" + a + "]")) m.removeAttribute(a);
}
doc.documentElement?.removeAttribute?.("data-ces-slider-ready");
}
function mountCodexEffortSlider(options) {
var opts = options || {};
var container = opts.container;
var seat = opts.seat;
var doc = opts.document || (container && container.ownerDocument) || (typeof document !== "undefined" ? document : null);
var win = opts.window || (doc && doc.defaultView) || (typeof window !== "undefined" ? window : globalRoot);
if (!container || !doc) {
return { unmount: function () {}, refresh: function () {} };
}
installStyles(doc);
// 清空宿主容器并构建 DOM 树（对齐 dsh-codex-effort-slider 四层结构：fill / energy+sweep / stars+dot / knob）
container.innerHTML = "";
var _sa = function (el, k, v) { if (el && typeof el.setAttribute === "function" && el.getAttribute(k) !== v) el.setAttribute(k, v); };
function _ce(tag, cls, part, parent) {
var el = doc.createElement(tag);
if (cls) el.className = cls;
if (part) el.setAttribute("data-ces-part", part);
if (parent) parent.appendChild(el);
return el;
}
var rootEl = markNoTranslate(_ce("div", "ces-root"));
rootEl.setAttribute("role", "slider");
rootEl.setAttribute("aria-label", resolveEffortTitle(doc, win));
var trackEl = _ce("div", "ces-track", "track", rootEl);
var fillEl = _ce("div", "ces-fill", "fill", trackEl);
var energyEl = _ce("div", "ces-energy", "energy", trackEl);
_ce("div", "ces-energy__sweep", "sweep", energyEl);
var starsEl = _ce("div", "ces-stars", "stars", trackEl);
var starNodes = [];
for (var sIdx = 0; sIdx < PARTICLES.length; sIdx += 1) {
var p = PARTICLES[sIdx];
var starEl = _ce("span", "ces-star", "star", starsEl);
starEl.style.top = p.y + "%";
starEl.style.display = "none";
var dotEl = _ce("span", "ces-star__dot", "particle", starEl);
var bStr = p.brightness.toFixed(3);
dotEl.setAttribute("data-brightness", bStr);
dotEl.style.setProperty("--ces-b", bStr);
starNodes.push({ el: starEl, dot: dotEl, meta: p });
}
var ticksEl = _ce("div", "ces-ticks", "ticks", trackEl);
var claudeCanvasEl = _ce("canvas", "ces-claude-canvas", "claude-canvas", fillEl);
claudeCanvasEl.width = 280;
claudeCanvasEl.height = 28;
var knobEl = _ce("div", "ces-knob", "knob", trackEl);
_ce("div", "ces-knob-notch", null, knobEl);
container.appendChild(rootEl);
// ── 内部状态机 ──────────────────────────────────────────────────────────
var destroyed = false;
var rafId = null;
var lastFrameMs = 0;
var claudeRafId = null;
var _clTm = null;
var _dLW = 0;
var claudeAnimStart = 0;
// 点阵流动相位（秒）：按「帧间隔 × 当前速度倍率」累加，而不是 elapsed × 倍率，
// 这样拖动中速度连续变化时波纹不会因倍率突变而跳帧/倒退
var claudeFlowTime = 0;
var claudeLastTs = 0;
// 当前位置对应的强度与速度（由 applyVisualPct 每次刷新，RAF 循环读取）
var claudeIntensity = 0;
var claudeSpeed = 0;
var dragging = false;
var buttonDown = false;
var draftPct = null;
var draftIndex = null;
var snapIndex = null;
var detentIndex = -1;
var _lastCmtIdx = -1;
var lastPtrPct = null;
var lastPtrMs = 0;
var ptrSpeed = 0;
var motionState = null;
var tickNodes = [];
var _lastTicks = -1;
var _lastEng = -1;
var _lastSlow = -1;
var dragTrackRect = null;
var dragSnap = null;
var dragRafId = null;
var lastSnap = null;
var _lastShownIdx = -1;
var _lastFillCss = "";
var _lastFillBg = "";
var _knobTf = false;
var _rAF = function (f) { return win && win.requestAnimationFrame ? win.requestAnimationFrame(f) : null; };
var _cAF = function (id) { if (id !== null && win && win.cancelAnimationFrame) win.cancelAnimationFrame(id); };
var _st = function (f, ms) { return (win && win.setTimeout || setTimeout)(f, ms); }, _ct = function (id) { if (id) (win && win.clearTimeout || clearTimeout)(id); };
var _cT = function () { if (_clTm !== null) { _ct(_clTm); _clTm = null; } };
function nowMs() {
return win && win.performance && typeof win.performance.now === "function" ? win.performance.now() : Date.now();
}
function readSeatSnapshot() {
var _p = seat && typeof seat._read === "function" ? seat._read() : null, _s = _p || seat;
var rawLevels = (_s && (Array.isArray(_s.effortLevels) ? _s.effortLevels : Array.isArray(_s.levels) ? _s.levels : []) || []).slice();
var levels = rawLevels.map(function (item) {
var key = extractEffortKey(item);
return { raw: item, effort: key, label: _extEffLbl(item, key, _s) };
});
var count = levels.length, curEffort = extractEffortKey(_s && _s.currentEffort), officialIndex = 0;
for (var i = 0; i < count; i += 1) {
if (String(levels[i].effort).toLowerCase() === String(curEffort).toLowerCase()) { officialIndex = i; break; }
}
var locked = Boolean((_s && _s.locked) || count <= 1), stops = energyStopsFor(levels);
var baseName = (_s && (_s.baseName || _s.modelName)) || "", isClaude = Boolean((_s && _s.isClaude) || isClaudeModel(baseName));
return {
baseName: baseName, isClaude: isClaude, theme: (_s && _s.theme) || (isClaude ? "claude" : "codex"),
levels: levels, count: count, officialIndex: officialIndex, locked: locked,
energyStart: stops.start, energyEnd: stops.end, hasOffFirst: stops.hasOffFirst
};
}
function currentShownIndex(snap) {
if (dragging && draftIndex !== null) return draftIndex;
if (snapIndex !== null) return snapIndex;
return snap.officialIndex;
}
function ensureMotion(snap) {
if (!motionState) {
var initPct = pctFromIndex(currentShownIndex(snap), snap.count);
motionState = {
x: initPct,
v: 0,
a: 0,
target: initPct
};
}
return motionState;
}
function _rowEl() {
return opts.row || (container.closest && container.closest('.ces-ag-effort-row,[data-ces-effort-row="true"],[role="menuitem"]'));
}
function _reAnim(el, cls, k, ms) {
if (!el || !el.classList || destroyed) return;
var cl = el.classList, tk = k + "t", rk = k + "r", had = false;
_ct(el[tk]); el[tk] = null;
if (el[rk]) { _cAF(el[rk]); el[rk] = null; }
cls.forEach(function (c) { if (cl.contains(c)) { had = true; cl.remove(c); } });
var run = function () {
el[rk] = null;
if (destroyed || !el.classList) return;
cls.forEach(function (c) { cl.add(c); });
el[tk] = _st(function () { if (el.classList) cls.forEach(function (c) { cl.remove(c); }); el[tk] = null; }, ms);
};
var r = had ? _rAF(run) : null;
if (r !== null) el[rk] = r; else run();
}
function _syncValOnly(snap, safeIdx) {
var count = snap.count, levelItem = snap.levels[safeIdx], label = levelItem ? levelItem.label : "";
var isMax = !snap.locked && count > 1 && safeIdx === count - 1 && !isOffLevel(label), rowEl = _rowEl();
if (rowEl) {
_sa(rowEl, "data-ces-effort-row", "true");
if (isMax) _sa(rowEl, "data-ces-max", "true");
else if (rowEl.hasAttribute("data-ces-max")) rowEl.removeAttribute("data-ces-max");
}
var valEl = opts.valueElement || (rowEl && findValueElement(rowEl));
if (valEl) {
var had = typeof valEl.__cesLastLabel === "string", curVal = valEl.textContent || "", eff = levelItem && levelItem.effort;
var nk = _normEffTxt(label) || _normEffTxt(eff) || String(label || eff || "").trim().toLowerCase();
var chg = Boolean(label) && !(had && (_sameEffTxt(valEl.__cesLastLabel, label) || (valEl.__cesLastKey && nk && valEl.__cesLastKey === nk)));
var ka = _normEffTxt(curVal);
if (chg || (label && (!curVal.trim() || (ka && !_sameEffTxt(curVal, label))))) {
valEl.__cesLastLabel = label; valEl.__cesLastKey = nk;
if (!_sameEffTxt(curVal, label)) valEl.textContent = label;
if (had && chg && !isPrismMotionOff(doc, win)) _reAnim(valEl, ["ces-text-rise", "is-claude-changing"], "_c", 260);
}
var vColor = snap.locked ? "" : valueColorFor(label, safeIdx, count, isMax, snap.hasOffFirst, snap.isClaude, resolvePrismAccentTone(doc, win)) || "";
if (valEl.style && valEl.style.color !== vColor) valEl.style.color = vColor;
}
return { label: label, isMax: isMax, levelItem: levelItem };
}
function _syncHeadTrig(snap, showIdx) {
var count = snap.count;
var safeIdx = Math.max(0, Math.min(Math.max(0, count - 1), showIdx));
if (dragging) {
if (safeIdx === _lastShownIdx) return;
_lastShownIdx = safeIdx;
_syncValOnly(snap, safeIdx);
return;
}
_lastShownIdx = safeIdx;
var st = _syncValOnly(snap, safeIdx);
syncTriggerColor(doc, st.label, safeIdx, count, st.isMax, snap.hasOffFirst, snap.isClaude);
if (typeof opts.onVisualChange === "function") {
try {
opts.onVisualChange({
index: safeIdx,
count: count,
label: st.label,
effort: st.levelItem ? st.levelItem.effort : "",
isMax: st.isMax,
locked: snap.locked
});
} catch (err) {}
}
}
function renderTicks(snap, effectivePct) {
var tickMode = readSettings(win).ticks || "highlight", count = snap.count;
if (tickMode === "hidden" || count <= 1) { if (ticksEl.style.display !== "none") ticksEl.style.display = "none"; return; }
if (ticksEl.style.display !== "") ticksEl.style.display = "";
if (_lastTicks !== count) {
ticksEl.innerHTML = ""; tickNodes = [];
for (var i = 0; i < count; i += 1) {
var tick = _ce("span", "ces-tick", "tick", ticksEl), tp = pctFromIndex(i, count);
tick.style.left = knobOffsetOf(tp, KNOB_RADIUS);
tickNodes.push({ el: tick, pct: tp });
}
_lastTicks = count;
}
for (var j = 0; j < tickNodes.length; j += 1) {
var node = tickNodes[j], nc = tickMode === "dim" ? "ces-tick is-dim" : effectivePct + 1e-4 >= node.pct ? "ces-tick is-on" : "ces-tick";
if (node.el.className !== nc) node.el.className = nc;
}
}
var cachedTrackRect = null;
var cachedTrackRectAt = 0;
var cachedSurfaceDark = true;
var cachedSurfaceDarkAt = 0;
var lastClaudePaintAt = 0;
var cachedClaudeCtx = null;
function _stopClRaf() { _cAF(claudeRafId); _cT(); claudeRafId = cachedTrackRect = null; cachedTrackRectAt = lastClaudePaintAt = 0; }
function _clOff() { return destroyed || _isBgWin() || isPrismMotionOff(doc, win); }
function _schedCl(ms) {
if (_clTm === null && claudeRafId === null) _clTm = _st(function () { _clTm = null; if (!_clOff() && claudeIntensity > 0) _startClRaf(); }, ms);
}
function _isBgWin() {
var r = doc && doc.documentElement, k = "data-ag-cs-win-blur", v = r && r.getAttribute && r.getAttribute(k);
return !!(doc && (doc.hidden || v === "1" || (r && r.hasAttribute && r.hasAttribute(k) && v !== "0")));
}
function _trkRect(now) {
var r = dragging && dragTrackRect && dragTrackRect.width > 0 ? dragTrackRect : cachedTrackRect;
if (!r || (!dragging && now && now - cachedTrackRectAt > 250)) {
r = trackEl.getBoundingClientRect ? trackEl.getBoundingClientRect() : null;
if (r && r.width > 0) { cachedTrackRect = r; cachedTrackRectAt = now || nowMs(); if (dragging) dragTrackRect = r; }
}
return r;
}
function stepClaudeCanvas(nowTs) {
claudeRafId = null;
if (_clOff()) { _stopClRaf(); return; }
var snap = (dragging && dragSnap) || lastSnap || readSeatSnapshot();
if (!snap.isClaude || snap.locked || claudeIntensity <= 0) { _stopClRaf(); return; }
var now = typeof nowTs === "number" && nowTs > 0 ? nowTs : nowMs(), X = Math.max, N = Math.min, R = Math.round;
var pr = N(1, X(0, now - claudeAnimStart) / CLAUDE_SWEEP_MS), iq = motionMode(win, null, doc) === "quick", idle = !dragging && pr >= 1, gap = idle ? (claudeIntensity >= 0.7 ? 32 : 50) : 15.5;
if (lastClaudePaintAt > 0 && now - lastClaudePaintAt < gap) {
if (idle && !iq) _schedCl(X(1, Math.ceil(gap - (now - lastClaudePaintAt))));
else claudeRafId = _rAF(stepClaudeCanvas);
return;
}
lastClaudePaintAt = now;
claudeFlowTime += (claudeLastTs > 0 ? N(0.05, X(0, (now - claudeLastTs) / 1000)) : 0) * claudeSpeed;
claudeLastTs = now;
if (now - cachedSurfaceDarkAt > 300 || !cachedSurfaceDarkAt) { cachedSurfaceDark = surfaceIsDark(win, doc); cachedSurfaceDarkAt = now; }
var rect = _trkRect(now), tW = trackEl.clientWidth || (rect && rect.width > 0 ? rect.width : 280), th = trackEl.clientHeight || (rect && rect.height > 0 ? R(rect.height) : 28);
var dpr = X(1, N(3, (win && +win.devicePixelRatio) || 1)), fw = X(1, R(tW)), bw = X(1, R(fw * dpr)), bh = X(1, R(th * dpr)), cv = claudeCanvasEl, cs = cv.style;
var tw = X(1, N(fw, R(KNOB_RADIUS + (tW - KNOB_RADIUS * 2) * (motionState ? clamp01(motionState.x) : 0))));
if (cv.width !== bw) cv.width = bw;
if (cv.height !== bh) cv.height = bh;
if (cs.width !== fw + "px") cs.width = fw + "px";
if (cs.height !== th + "px") cs.height = th + "px";
var cctx = cachedClaudeCtx || (cv.getContext && (cachedClaudeCtx = cv.getContext("2d")));
if (cctx) {
if (cctx.setTransform) cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
var clp = tw < fw && cctx.save && cctx.rect && cctx.clip;
if (tw < fw) cctx.clearRect(tw, 0, fw - tw + 1, th + 1);
if (clp) { cctx.save(); cctx.beginPath(); cctx.rect(0, 0, tw, th); cctx.clip(); }
paintDither(cctx, tw, th, cachedSurfaceDark, pr, claudeFlowTime, claudeIntensity);
if (clp) cctx.restore();
}
if (idle) { if (iq) _stopClRaf(); else _schedCl(gap); return; }
claudeRafId = _rAF(stepClaudeCanvas);
}
function _startClRaf() {
if (_clOff()) { _stopClRaf(); return; }
if (dragging) _cT();
if (claudeRafId !== null || _clTm !== null) return;
claudeRafId = _rAF(stepClaudeCanvas);
if (claudeRafId === null) stepClaudeCanvas(nowMs());
}
function applyVisualPct(snap, effectivePct, showIdx) {
lastSnap = snap;
var p = clamp01(effectivePct), count = snap.count, safeIdx = Math.max(0, Math.min(Math.max(0, count - 1), showIdx));
var levelItem = snap.levels[safeIdx], label = levelItem ? levelItem.label : "", theme = snap.theme || "codex";
_sa(rootEl, "data-theme", theme);
_sa(trackEl, "data-theme", theme);
_sa(rootEl, "tabindex", "-1");
_sa(rootEl, "aria-valuemin", "0");
_sa(rootEl, "aria-valuemax", String(Math.max(0, count - 1)));
_sa(rootEl, "aria-valuenow", String(safeIdx));
_sa(rootEl, "aria-valuetext", label);
_sa(rootEl, "aria-disabled", snap.locked ? "true" : "false");
if (snap.locked) { if (!trackEl.classList.contains("is-locked")) trackEl.classList.add("is-locked"); }
else if (trackEl.classList.contains("is-locked")) trackEl.classList.remove("is-locked");
var curTone = resolvePrismAccentTone(doc, win), motOff = isPrismMotionOff(doc, win);
var offsetCss = knobOffsetOf(p, KNOB_RADIUS), fillBg = fillBackgroundFor(p, snap.energyStart, snap.energyEnd, snap.isClaude, curTone);
if (offsetCss !== _lastFillCss) { _lastFillCss = offsetCss; trackEl.style.setProperty("--ces-fill", offsetCss); }
if (fillBg !== _lastFillBg) { _lastFillBg = fillBg; trackEl.style.setProperty("--ces-fill-bg", fillBg); }
var kW = dragging ? (_dLW || trackEl.clientWidth || (dragTrackRect && dragTrackRect.width) || 0) : 0;
if (kW > 0) {
if (!_knobTf) { knobEl.style.left = "0px"; _knobTf = true; }
knobEl.style.transform = "translate3d(" + (KNOB_RADIUS + (kW - KNOB_RADIUS * 2) * p).toFixed(1) + "px,0,0)";
} else if (_knobTf) { knobEl.style.left = knobEl.style.transform = ""; _knobTf = false; }
claudeIntensity = !motOff && curTone !== "mono" && snap.isClaude && !snap.locked && count > 1 ? claudeIntensityFor(p, snap.energyStart) : 0;
claudeSpeed = claudeSpeedFor(p, snap.energyStart);
if (claudeIntensity > 0) {
if (claudeCanvasEl.style.display !== "block") { claudeCanvasEl.style.display = "block"; claudeAnimStart = nowMs(); claudeLastTs = 0; }
_startClRaf();
} else {
if (claudeCanvasEl.style.display !== "none") claudeCanvasEl.style.display = "none";
_stopClRaf();
}
var energy = snap.locked || motOff ? 0 : energyForPct(p, snap.energyStart), slowdown = motionMode(win, null, doc) === "quick" ? _RM_SLOW : 1;
if (Math.abs(energy - _lastEng) > 1e-5 || slowdown !== _lastSlow) {
_lastEng = energy; _lastSlow = slowdown;
_sa(rootEl, "data-energy", energy > 0 ? "1" : "0");
rootEl.style.setProperty("--ces-energy", String(Math.round(energy * 1000) / 1000));
var slo = String(starLayerOpacityFor(energy)), vc = Math.round(energy * PARTICLES.length), sf = speedFor(p, snap.energyStart);
trackEl.style.setProperty("--ces-star-opacity", slo);
starsEl.style.opacity = slo;
starsEl.setAttribute("data-count", String(vc));
for (var i = 0; i < starNodes.length; i += 1) {
var st = starNodes[i].el.style, dur = starDurationFor(i, sf) * slowdown;
st.display = i < vc ? "" : "none";
st.animationDuration = dur.toFixed(3) + "s";
st.animationDelay = starDelayFor(i, dur).toFixed(3) + "s";
}
}
renderTicks(snap, p);
_syncHeadTrig(snap, safeIdx);
}
function stopFrames() { _cAF(rafId); rafId = null; lastFrameMs = 0; }
function stepFrame(ts) {
rafId = null;
if (destroyed) return;
var snap = readSeatSnapshot(), m = ensureMotion(snap), params = motionParamsForMode(motionMode(win, null, doc));
var now = typeof ts === "number" && ts > 0 ? ts : nowMs();
motionStep(m, lastFrameMs > 0 ? (now - lastFrameMs) / 1000 : 1 / 60, params);
lastFrameMs = now;
applyVisualPct(snap, m.x, currentShownIndex(snap));
if (!motionSettled(m, params)) startFrames();
else {
m.x = clamp01(m.target); m.v = m.a = 0;
if (!dragging) snapIndex = null;
applyVisualPct(snap, m.x, currentShownIndex(snap));
}
}
function startFrames() {
if (destroyed || rafId !== null) return;
rafId = _rAF(stepFrame);
if (rafId === null) stepFrame(nowMs());
}
function clearMaxEffects() {
var valEl = opts.valueElement || findValueElement(_rowEl());
if (valEl) {
_ct(valEl._gt); valEl._gt = null;
if (valEl._gr) { _cAF(valEl._gr); valEl._gr = null; }
if (valEl.classList) valEl.classList.remove("is-glowing");
}
}
function triggerMaxEffects(isClaude) {
if (isPrismMotionOff(doc, win)) return;
var valEl = opts.valueElement || findValueElement(_rowEl());
if (valEl && valEl.classList) {
if (valEl.style && valEl.style.setProperty) valEl.style.setProperty("--ces-glow-color", isClaude ? "rgba(196, 181, 253, 0.9)" : "rgba(168, 85, 247, 0.9)");
_reAnim(valEl, ["is-glowing"], "_g", 450);
}
}
/**
* 立即把目标档位写回宿主（Antigravity React Fiber 或 Seat）：
* 拖过档位边界时同步触发，无需等待 pointerup 松手。
*/
function commitAtIndex(targetIndex, reason) {
var snap = readSeatSnapshot();
if (snap.locked || snap.count <= 1) return;
var idx = Math.max(0, Math.min(snap.count - 1, targetIndex)), item = snap.levels[idx];
if (!item) return;
var isNowMax = idx === snap.count - 1 && !isOffLevel(item.label), wasMax = _lastCmtIdx === snap.count - 1;
_lastCmtIdx = idx;
tracePush("commit", { reason: reason || "drag", index: idx, effort: item.effort, label: item.label });
if (isNowMax && !wasMax) triggerMaxEffects(snap.isClaude);
else if (!isNowMax && wasMax) clearMaxEffects();
if (seat && typeof seat.selectEffort === "function") {
try { seat.selectEffort(item.raw !== undefined ? item.raw : item.effort, idx); }
catch (err) { tracePush("commit-error", { message: String(err && err.message ? err.message : err) }); }
}
if (typeof opts.onCommit === "function") try { opts.onCommit(item, idx, reason || "drag"); } catch (err) {}
}
function _cancelDragRaf() { _cAF(dragRafId); dragRafId = null; }
function pctAtClientX(clientX) {
var rect = _trkRect(0);
return rect && rect.width > 0 ? clamp01((clientX - rect.left - KNOB_RADIUS) / Math.max(1, rect.width - KNOB_RADIUS * 2)) : null;
}
function _flushDragVisual() {
dragRafId = null;
if (destroyed || !dragging) return;
var ds = dragSnap || readSeatSnapshot(), dm = ensureMotion(ds);
applyVisualPct(ds, dm.x, draftIndex !== null ? draftIndex : ds.officialIndex);
}
function moveToClientX(clientX, isInitialDown) {
var snap = (dragging && dragSnap) || readSeatSnapshot();
if (snap.locked || snap.count <= 0) return;
var ptrPct = pctAtClientX(clientX);
if (ptrPct === null) ptrPct = pctFromIndex(snap.officialIndex, snap.count);
var now = nowMs();
if (lastPtrPct !== null && lastPtrMs > 0) {
var dt = (now - lastPtrMs) / 1000;
if (dt > 1e-4 && dt < 0.25) ptrSpeed = ptrSpeed * (1 - _PS_EMA) + ((ptrPct - lastPtrPct) / dt) * _PS_EMA;
} else ptrSpeed = 0;
lastPtrPct = ptrPct; lastPtrMs = now;
var nowIndex;
if (motionMode(win, null, doc) === "fast") {
nowIndex = isInitialDown ? indexFromPct(ptrPct, snap.count) : detentTargetIndex(detentIndex >= 0 && detentIndex < snap.count ? detentIndex : snap.officialIndex, ptrPct, snap.count);
detentIndex = detentTargetIndex(nowIndex, ptrPct, snap.count) === nowIndex ? nowIndex : ptrPct < pctFromIndex(nowIndex, snap.count) ? Math.max(0, nowIndex - 1) : Math.min(snap.count - 1, nowIndex + 1);
} else nowIndex = indexFromPct(ptrPct, snap.count);
draftPct = ptrPct; draftIndex = nowIndex;
var m = ensureMotion(snap);
m.x = m.target = ptrPct; m.v = m.a = 0;
stopFrames();
if (isInitialDown || !win || typeof win.requestAnimationFrame !== "function") {
_cancelDragRaf();
applyVisualPct(snap, ptrPct, nowIndex);
} else {
if (nowIndex !== _lastShownIdx) { _lastShownIdx = nowIndex; _syncValOnly(snap, nowIndex); }
if (dragRafId === null) dragRafId = _rAF(_flushDragVisual);
}
}
function _settle(snap, idx, imm, startX) {
var m = ensureMotion(snap), tgt = pctFromIndex(idx, snap.count);
m.target = tgt;
if (imm) {
m.x = tgt; m.v = m.a = 0; snapIndex = null; stopFrames();
applyVisualPct(snap, m.x, idx);
} else {
if (typeof startX === "number") { m.x = startX; m.v = m.a = 0; }
applyVisualPct(snap, m.x, idx);
startFrames();
}
}
function endDrag(clientX) {
if (!dragging) return;
_cancelDragRaf();
var snap = dragSnap || readSeatSnapshot();
var ptrPct = draftPct !== null ? draftPct : pctFromIndex(snap.officialIndex, snap.count);
if (typeof clientX === "number") {
var p = pctAtClientX(clientX);
if (p !== null) ptrPct = p;
}
var mode = motionMode(win, null, doc), finalIndex;
if (mode === "fast") finalIndex = detentTargetIndex(detentIndex >= 0 && detentIndex < snap.count ? detentIndex : snap.officialIndex, ptrPct, snap.count);
else if (mode === "quick") finalIndex = indexFromPct(ptrPct, snap.count);
else finalIndex = releaseIndexFor(ptrPct, ptrSpeed, lastPtrMs > 0 ? Math.max(0, (nowMs() - lastPtrMs) / 1000) : 1, snap.count);
dragging = buttonDown = false;
dragTrackRect = dragSnap = draftPct = draftIndex = lastPtrPct = null;
_dLW = 0;
detentIndex = _lastShownIdx = -1;
ptrSpeed = 0;
snapIndex = finalIndex;
if (finalIndex !== snap.officialIndex) commitAtIndex(finalIndex, "release");
_settle(readSeatSnapshot(), finalIndex, mode === "quick", ptrPct);
}
function swallowEvent(ev) { if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation(); }
function onPointerDown(ev) {
if (ev && typeof ev.button === "number" && ev.button !== 0) return;
var snap = readSeatSnapshot();
if (snap.locked || snap.count <= 1) return;
swallowEvent(ev);
if (typeof ev.preventDefault === "function") ev.preventDefault();
dragging = buttonDown = true;
dragSnap = snap;
dragTrackRect = trackEl.getBoundingClientRect ? trackEl.getBoundingClientRect() : null;
_dLW = trackEl.clientWidth || (dragTrackRect && dragTrackRect.width) || 0;
if (dragTrackRect && dragTrackRect.width > 0) { cachedTrackRect = dragTrackRect; cachedTrackRectAt = nowMs(); }
_lastCmtIdx = detentIndex = snap.officialIndex;
snapIndex = lastPtrPct = null;
try { if (trackEl.setPointerCapture && ev.pointerId !== undefined) trackEl.setPointerCapture(ev.pointerId); } catch (err) {}
moveToClientX(ev.clientX, true);
}
function onPointerMove(ev) {
if (!dragging || (ev && ev.buttons === 0 && !buttonDown)) return;
swallowEvent(ev);
moveToClientX(ev.clientX, false);
}
function onPointerUp(ev) {
if (!dragging) return;
swallowEvent(ev);
buttonDown = false;
try { if (trackEl.releasePointerCapture && ev && ev.pointerId !== undefined) trackEl.releasePointerCapture(ev.pointerId); } catch (err) {}
endDrag(ev && typeof ev.clientX === "number" ? ev.clientX : undefined);
}
function onPointerCancel(ev) {
if (!dragging) return;
if (!ev || ev.type !== "blur") swallowEvent(ev);
buttonDown = false;
endDrag();
}
function onKeyDown(ev) {
var snap = readSeatSnapshot();
if (snap.locked || snap.count <= 1) return;
var key = ev && ev.key, curIdx = currentShownIndex(snap), nextIdx = null;
if (key === "ArrowLeft" || key === "ArrowDown") nextIdx = Math.max(0, curIdx - 1);
else if (key === "ArrowRight" || key === "ArrowUp") nextIdx = Math.min(snap.count - 1, curIdx + 1);
else if (key === "Home") nextIdx = 0;
else if (key === "End") nextIdx = snap.count - 1;
else return;
swallowEvent(ev);
if (typeof ev.preventDefault === "function") ev.preventDefault();
snapIndex = nextIdx;
commitAtIndex(nextIdx, "key");
_settle(readSeatSnapshot(), nextIdx, motionMode(win, null, doc) === "quick");
}
function onBlockMenuClose(ev) { swallowEvent(ev); }
var _trkEvs = [["pointerdown", onPointerDown], ["pointermove", onPointerMove], ["pointerup", onPointerUp], ["pointercancel", onPointerCancel], ["lostpointercapture", onPointerCancel], ["click", onBlockMenuClose], ["mouseup", onBlockMenuClose]];
for (var _ei = 0; _ei < _trkEvs.length; _ei += 1) trackEl.addEventListener(_trkEvs[_ei][0], _trkEvs[_ei][1]);
rootEl.addEventListener("keydown", onKeyDown);
function onWinResize() { dragTrackRect = cachedTrackRect = null; _dLW = cachedTrackRectAt = 0; }
function _wEv(m) { if (win && win[m]) { win[m]("resize", onWinResize); win[m]("blur", onPointerCancel); } }
_wEv("addEventListener");
function syncFromExternal() {
if (destroyed || dragging) return;
var snap = readSeatSnapshot(), m = ensureMotion(snap), idx = snap.officialIndex, mode = motionMode(win, null, doc);
m.target = pctFromIndex(idx, snap.count);
_settle(snap, idx, snap.locked || mode === "quick" || motionSettled(m, motionParamsForMode(mode)));
}
var offSeat =
seat && typeof seat.subscribe === "function"
? seat.subscribe(function () {
syncFromExternal();
})
: function () {};
var offSettings = onSettingsChange(function () {
var snap = readSeatSnapshot();
var m = ensureMotion(snap);
applyVisualPct(snap, m.x, currentShownIndex(snap));
}, win);
// 首次同步渲染
var initSnap = readSeatSnapshot();
var initMotion = ensureMotion(initSnap);
initMotion.x = pctFromIndex(initSnap.officialIndex, initSnap.count);
initMotion.target = initMotion.x;
applyVisualPct(initSnap, initMotion.x, initSnap.officialIndex);
return {
unmount: function () {
destroyed = true;
stopFrames();
_cancelDragRaf();
_stopClRaf();
cachedClaudeCtx = null;
dragTrackRect = dragSnap = lastSnap = null;
_dLW = 0;
clearMaxEffects();
var valEl = opts.valueElement || findValueElement(_rowEl());
if (valEl) {
_ct(valEl._ct); valEl._ct = null;
if (valEl._cr) { _cAF(valEl._cr); valEl._cr = null; }
if (valEl.classList) { valEl.classList.remove("ces-text-rise", "is-claude-changing"); }
delete valEl.__cesLastLabel;
delete valEl.__cesLastKey;
}
if (typeof offSeat === "function") offSeat();
if (typeof offSettings === "function") offSettings();
_wEv("removeEventListener");
for (var _ri = 0; _ri < _trkEvs.length; _ri += 1) trackEl.removeEventListener(_trkEvs[_ri][0], _trkEvs[_ri][1]);
rootEl.removeEventListener("keydown", onKeyDown);
if (rootEl.parentNode === container) {
container.removeChild(rootEl);
}
},
refresh: function () {
syncFromExternal();
}
};
}
// ── 通用菜单观察器（兼容预置「推理等级」行的 DOM 结构与独立预览页） ────────────
function installMenuObserver(options) {
var o = options || {}, d = o.document || (typeof document !== "undefined" ? document : null);
var w = o.window || d?.defaultView || (typeof window !== "undefined" ? window : globalRoot);
var onC = typeof o.onChange === "function" ? o.onChange : () => {};
if (!d?.body) return { stop: () => {}, rescan: () => {}, getCurrent: () => null };
var cur = null, obs = null, SKS = ["height", "flexWrap", "paddingTop", "paddingBottom"];
var detach = () => {
if (!cur) return;
var prev = cur; cur = null;
try {
prev.container?.parentNode?.removeChild(prev.container);
if (prev.row && prev.previousStyle) SKS.forEach((k) => { prev.row.style[k] = prev.previousStyle[k]; });
} catch {}
onC(null);
};
var scan = () => {
if (findAntigravityPanel(d) || findAntigravityTrigger(d)) return;
var row = findInferenceRow(d);
if (!row) { if (cur) detach(); return; }
if (cur && cur.row === row && cur.container && row.contains(cur.container)) return;
if (cur) detach();
var ps = {}; SKS.forEach((k) => { ps[k] = row.style[k] || ""; });
row.setAttribute("data-ces-effort-row", "true");
Object.assign(row.style, { height: "auto", flexWrap: "wrap", paddingTop: "8px", paddingBottom: "8px" });
var valEl = findValueElement(row), host = d.createElement("div");
host.className = "ces-inline"; host.setAttribute("data-ces-part", "host");
row.appendChild(host);
cur = { row, container: host, value: valEl ? (valEl.textContent || "").trim() : "", previousStyle: ps };
onC(cur);
};
scan();
var MO = o.MutationObserver || w?.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null);
if (typeof MO === "function") { obs = new MO(scan); obs.observe(d.body, { childList: true, subtree: true }); }
return { stop: () => { obs?.disconnect(); obs = null; detach(); }, rescan: scan, getCurrent: () => cur };
}
// ── Antigravity 原生模型选择器深度桥接器 ───────────────────────────────────
var EFFORT_MEMORY_KEY = "ag.prism.effortMemory.v1", _EFF_V = Object.create(null);
AG_EFFORT_ORDER.forEach((k) => { _EFF_V[k] = 1; });
function _loadEffMem(w) {
var o = { models: new Map(), orch: new Map() }, s = resolveStorage(w);
if (!s) return o;
try {
var p = JSON.parse(s.getItem(EFFORT_MEMORY_KEY) || "null");
var f = (src, dst) => { if (!src || typeof src !== "object") return; for (var k of Object.keys(src)) { if (dst.size >= 64) break; var kk = k.trim(), v = String(src[k] || "").trim().toLowerCase(); if (kk && _EFF_V[v]) dst.set(kk, v); } };
if (p && typeof p === "object") { f(p.models, o.models); f(p.orch, o.orch); }
} catch {}
return o;
}
function _saveEffMem(w, m1, m2) {
var s = resolveStorage(w);
if (!s) return;
try {
var d = (m) => { var o = Object.create(null), a = m ? Array.from(m.entries()) : []; for (var i = Math.max(0, a.length - 64); i < a.length; i++) { var k = String(a[i][0] || "").trim(), v = String(a[i][1] || "").trim().toLowerCase(); if (k && _EFF_V[v]) o[k] = v; } return o; };
s.setItem(EFFORT_MEMORY_KEY, JSON.stringify({ v: 1, models: d(m1), orch: d(m2) }));
} catch {}
}
function _setTxtNode(el, s, fd) {
var txt = String(s == null ? "" : s);
if (!el || el.textContent === txt) return;
var tNodes = [], cn = el.childNodes;
if (cn?.length) { for (var i = 0; i < cn.length; i++) if (cn[i]?.nodeType === 3) tNodes.push(cn[i]); }
else if (el.firstChild?.nodeType === 3) tNodes.push(el.firstChild);
if (tNodes.length === 1) { tNodes[0].nodeValue = txt; return; }
if (tNodes.length >= 2) {
var last = tNodes.length - 1, lead = txt[0] === " " && /^\s*$/.test(tNodes[0].nodeValue || "");
if (lead && tNodes[0].nodeValue !== " ") tNodes[0].nodeValue = " ";
for (var k = lead ? 1 : 0; k < (txt ? last : tNodes.length); k++) if (tNodes[k].nodeValue !== "") tNodes[k].nodeValue = "";
if (txt) { var tail = lead ? txt.slice(1) : txt; if (tNodes[last].nodeValue !== tail) tNodes[last].nodeValue = tail; }
return;
}
if (!txt) { if (!cn?.length && !el.children?.length) el.textContent = ""; return; }
var d = el.ownerDocument || fd;
if (d?.createTextNode && el.appendChild) el.appendChild(d.createTextNode(txt));
else if (!el.children?.length) el.textContent = txt;
}
function _setEffTxtNode(el, s, fd) {
if (!el) return;
var txt = String(s == null ? "" : s), cur = el.textContent || "", ka = _normEffTxt(cur), kb = _normEffTxt(txt);
if (!txt.trim()) { el.__cesLastText = txt; if (cur !== txt) _setTxtNode(el, txt, fd); return; }
if (cur.trim() && ((ka && kb && ka === kb) || (el.__cesLastText === txt && !(ka && kb && ka !== kb)))) { el.__cesLastText = txt; return; }
el.__cesLastText = txt;
_setTxtNode(el, txt, fd);
}
function installAntigravityObserver(options) {
var opts = options || {}, doc = opts.document || (typeof document !== "undefined" ? document : null);
var win = opts.window || doc?.defaultView || (typeof window !== "undefined" ? window : globalRoot);
var memOnly = Boolean(opts.memoryOnly);
if (!doc?.body) return { stop: () => {}, rescan: () => {}, setRememberEffort: () => {}, getMemory: () => ({ models: {}, orch: {} }) };
if (!memOnly) installStyles(doc);
var rememberEffort = memOnly ? true : opts.rememberEffort !== false;
var _loadedMem = rememberEffort ? _loadEffMem(win) : { models: new Map(), orch: new Map() };
var _effMap = _loadedMem.models, _orchEffMap = _loadedMem.orch;
var _curEffMap = () => (rememberEffort ? _effMap : null);
var _recEff = (m, b, e) => { if (!rememberEffort || !b || !e || !_EFF_V[e] || m.get(b) === e) return; m.set(b, e); _saveEffMem(win, _effMap, _orchEffMap); };
var lk = null, qM = typeof queueMicrotask === "function" ? queueMicrotask : (fn) => Promise.resolve().then(fn);
var activeMount = null;
var activePanel = null;
var activeSection = null;
var activeRow = null;
var activeValueEl = null;
var activeHostEl = null;
var _seatLs = new Set();
var activeBaseOverride = null;
var _actOptOvr = null;
var _orchPlanOvr = null;
var _lastHostLbl = "";
var _boundSubs = new Set();
var _hiddenL3 = new Map();
var observer = null;
var _intMut = false;
var trackedTrigger = null;
var trackedPane = null;
function _trackTarget(ev) {
try {
var t = ev && ev.target;
if (!t || typeof t.closest !== "function") return;
var trig = t.closest(_AG_TRIG_SEL);
if (trig && !_isSubTrigger(trig)) {
trackedTrigger = trig;
var p0 = trig.closest(_AG_PANE_SEL);
if (p0 && !_isSubTrigger(p0)) trackedPane = p0;
_rememberActiveTrigger(doc, trackedTrigger, trackedPane);
return;
}
var pane = t.closest(_AG_PANE_SEL);
if (pane && !_isSubTrigger(pane)) {
trackedPane = pane;
var innerTrig = _findTriggerInNode(pane);
if (innerTrig) trackedTrigger = innerTrig;
_rememberActiveTrigger(doc, trackedTrigger, trackedPane);
}
} catch (e) {}
}
var _trackOpts = { capture: true, passive: true };
doc.addEventListener?.("pointerdown", _trackTarget, _trackOpts);
doc.addEventListener?.("focusin", _trackTarget, _trackOpts);
function _resolveCurTrigger() {
var p = findAntigravityPanel(doc);
if (p) {
var fromOpen = findAntigravityTrigger(doc);
if (fromOpen && _isTrigExpanded(fromOpen)) { trackedTrigger = fromOpen; return fromOpen; }
var pCtx = _rdAgFiber(p);
if (pCtx && pCtx.conversationId && doc.querySelectorAll) {
var allTr = doc.querySelectorAll(_AG_TRIG_SEL);
for (var i = 0; i < allTr.length; i += 1) {
var cTr = allTr[i];
if (!cTr || _isSubTrigger(cTr) || !_isTrigVisible(cTr)) continue;
var tc = _rdAgFiber(cTr);
if (tc && tc.conversationId === pCtx.conversationId) { trackedTrigger = cTr; return cTr; }
}
}
}
if (trackedTrigger && trackedTrigger.isConnected !== false && !_isSubTrigger(trackedTrigger) && _isTrigVisible(trackedTrigger)) {
return trackedTrigger;
}
if (trackedPane && trackedPane.isConnected !== false && !_isSubTrigger(trackedPane)) {
var pt = _findTriggerInNode(trackedPane);
if (pt && _isTrigVisible(pt)) { trackedTrigger = pt; return pt; }
}
return findAntigravityTrigger(doc);
}
function _setTxt(el, s) { _setTxtNode(el, s, doc); }
function _setEffTxt(el, s) { _setEffTxtNode(el, s, doc); }
function notifySeatListeners() { _seatLs.forEach(function (fn) { try { fn(); } catch (e) {} }); }
function _withMut(fn) {
_intMut = true;
try { return fn(); }
finally { try { if (observer && observer.takeRecords) observer.takeRecords(); } catch (e) {} _intMut = false; }
}
function _hasValidCtx(c) { return Boolean(c && ((c.effortIndex && c.effortIndex.size > 0) || (c.orchPlanners && c.orchPlanners.length > 0))); }
function _setReady(on) {
var r = doc && doc.documentElement;
if (!r) return;
if (on) { if (r.setAttribute && r.getAttribute("data-ces-slider-ready") !== "1") r.setAttribute("data-ces-slider-ready", "1"); }
else if (r.removeAttribute && (!r.hasAttribute || r.hasAttribute("data-ces-slider-ready"))) r.removeAttribute("data-ces-slider-ready");
}
function getLiveContext() {
var p = findAntigravityPanel(doc), t = _resolveCurTrigger();
return (p && _rdAgFiber(p)) || (t && _rdAgFiber(t)) || null;
}
function getActiveProfile(ctx) {
return ctx ? resolveModelEffortProfile(ctx, _actOptOvr || activeBaseOverride || ctx.selectedModel, _curEffMap(), _orchPlanOvr) : null;
}
/**
* 立即同步更新：
* 1. 底部 Composer 折叠触发按钮的模型名与档位颜色
* 2. 展开菜单中每一行模型右侧的档位文字与颜色、以及选中态高亮
*/
function _syncAgDom(ctx, activeProfile) {
var profile = ctx && (activeProfile || getActiveProfile(ctx));
if (!profile) return;
if (!profile.locked && profile.baseName && profile.currentEffort) {
if (profile.isOrchestrator) _recEff(_orchEffMap, profile.baseName, profile.currentEffort);
else _recEff(_effMap, profile.baseName, profile.currentEffort);
}
var count = profile.levels.length, idx = profile.currentIndex, isMax = !profile.locked && count > 1 && idx === count - 1 && !isOffLevel(profile.currentLabel);
var _sa = (el, k, v) => { if (el && el.getAttribute(k) !== v) el.setAttribute(k, v); };
var triggerBtn = _resolveCurTrigger();
if (triggerBtn) {
if (profile.isOrchestrator && profile.orchestratorTunable) _sa(triggerBtn, "data-ces-orch-b", profile.isClaude ? "claude" : "gemini");
else triggerBtn.removeAttribute("data-ces-orch-b");
var outerSpan = !profile.isOrchestrator && triggerBtn.querySelector("span.min-w-0");
if (outerSpan) {
var effortSpan = outerSpan.querySelector("span.opacity-70, [data-ces-part='trigger-effort']"), firstNode = outerSpan.firstChild, expBase = "", expEff = "", hasExp = false;
if (!profile.locked && profile.baseName) { expBase = profile.baseName; expEff = " " + profile.currentLabel; hasExp = true; }
else if (profile.locked) {
var lp = profile.modelOption && parseModelLabel(profile.modelOption.label);
expBase = lp ? lp.base : profile.modelOption?.label || profile.baseName || "";
expEff = lp ? " " + lp.effortLabel : "";
hasExp = true;
}
if (hasExp) {
var selMatch = !_actOptOvr && !activeBaseOverride && ctx.selectedModel && (((!expBase || (firstNode?.nodeType === 3 && firstNode.nodeValue.trim() === expBase.trim())) && (!effortSpan || _sameEffTxt(effortSpan.textContent, expEff))) || String(outerSpan.textContent || "").replace(/\s+/g, " ").trim() === (expBase + expEff).replace(/\s+/g, " ").trim());
if (selMatch) { if (effortSpan) effortSpan.__cesLastText = expEff; }
else {
if (expBase && firstNode?.nodeType === 3 && firstNode.nodeValue !== expBase) firstNode.nodeValue = expBase;
if (effortSpan) _setEffTxt(effortSpan, expEff);
}
}
}
}
var trigLbl = profile.locked ? (profile.modelOption && parseModelLabel(profile.modelOption.label) ? profile.currentLabel : "") : profile.currentLabel;
syncTriggerColor(doc, trigLbl, idx, count, isMax, false, Boolean(profile.isClaude), triggerBtn);
var panel = findAntigravityPanel(doc);
if (!panel) return;
var _s = (st, c) => { var o = c ? "1" : "", w = c ? "600" : ""; if (st.color !== c) st.color = c; if (st.opacity !== o) st.opacity = o; if (st.fontWeight !== w) st.fontWeight = w; };
var _mkSel = (el, on) => { if (!el) return; _sa(el, "data-ces-model-selected", String(on)); el.classList.toggle("text-foreground", on); el.classList.toggle("text-secondary-foreground", !on); };
var ob = panel.querySelector('[data-testid="orchestrator-effort-bar"]'), ot = !!(profile.isOrchestrator && profile.orchestratorTunable && !profile.locked), ao = !!(profile.isOrchestrator && !ot);
var _sh = (e, h) => { _sa(e, "data-row-hidden", "" + h); _sa(e, "aria-hidden", "" + h); };
ot ? _sa(panel, "data-ces-orch-tunable", "true") : panel.removeAttribute("data-ces-orch-tunable");
ao ? _sa(panel, "data-ag-cs-orch-active", "1") : panel.removeAttribute("data-ag-cs-orch-active");
_sh(activeRow, ao); _sh(ob, !ao);
for (var oRow of panel.querySelectorAll('[data-testid="model-selector-orchestrator"]')) {
var oM = oRow.closest?.('[role^="menuitem"]') || oRow;
_mkSel(oM, Boolean(profile.isOrchestrator));
if (oM !== oRow) _sa(oRow, "data-ces-model-selected", String(Boolean(profile.isOrchestrator)));
}
for (var gSpan of panel.querySelectorAll('[data-testid="model-selector-effort-group"]')) {
var base = gSpan.getAttribute("data-model-base") || (gSpan.textContent || "").trim(), rowProf = resolveModelEffortProfile(ctx, base, _curEffMap());
if (!rowProf) continue;
var sel = !profile.isOrchestrator && profile.baseName === base, sib = gSpan.nextElementSibling;
_mkSel(gSpan.closest('[role="menuitem"]'), sel);
if (sib?.tagName === "SPAN") {
var dE = sel ? profile.currentLabel : rowProf.currentLabel, dI = sel ? profile.currentIndex : rowProf.currentIndex, dC = rowProf.levels.length;
_setEffTxt(sib, dE);
_s(sib.style, valueColorFor(dE, dI, dC, dC > 1 && dI === dC - 1, false) || "");
}
}
for (var sItem of panel.querySelectorAll('[data-testid="model-selector-item"]')) {
var sLabel = sItem.getAttribute("data-model-label") || (sItem.textContent || "").trim();
_mkSel(sItem, !profile.isOrchestrator && (profile.modelOption?.label === sLabel || profile.baseName === sLabel));
}
}
function _curProf() { return getActiveProfile(getLiveContext()); }
function _syP() { try { win?.__agPrism?.sync?.(); } catch {} }
var agSeatAdapter = {
_read: function () { var p = _curProf(); return p && _isTrigLocked(doc, _resolveCurTrigger()) ? Object.assign({}, p, { locked: true }) : p; },
get effortLevels() { return _curProf()?.levels || []; },
get currentEffort() { return _curProf()?.currentEffort || ""; },
get locked() { return _isTrigLocked(doc, _resolveCurTrigger()) || (_curProf()?.locked ?? true); },
get baseName() { return _curProf()?.baseName || ""; },
get isClaude() { return Boolean(_curProf()?.isClaude); },
get theme() { return _curProf()?.theme || "codex"; },
selectEffort: function (levelItem) {
var curTrig = _resolveCurTrigger();
if (_isTrigLocked(doc, curTrig)) return;
var ctx = getLiveContext(), targetOpt = levelItem && (levelItem.modelOption || levelItem.raw?.modelOption);
if (!ctx || !targetOpt) return;
var curProf = getActiveProfile(ctx);
if (curProf?.isOrchestrator && curProf.orchestratorTunable) {
var opP = parseModelLabel(targetOpt.label);
if (opP) _recEff(_orchEffMap, opP.base, opP.effort);
_orchPlanOvr = targetOpt;
_commitAgOpt(ctx, targetOpt, true, true, curTrig);
_withMut(() => { var np = resolveModelEffortProfile(ctx, _actOptOvr || ctx.selectedModel, _curEffMap(), targetOpt); _syncAgDom(ctx, np); _sySubs(activePanel, ctx, np); notifySeatListeners(); _syP(); });
return;
}
var parsed = parseModelLabel(targetOpt.label);
if (parsed) { _recEff(_effMap, parsed.base, parsed.effort); activeBaseOverride = parsed.base; }
_actOptOvr = targetOpt;
_lastHostLbl = (ctx.selectedModel && ctx.selectedModel.label) || "";
_orchPlanOvr = null;
_commitAgOpt(ctx, targetOpt, false, true, curTrig);
_withMut(function () {
_syncAgDom(ctx, resolveModelEffortProfile(ctx, targetOpt, _curEffMap()));
_syP();
});
},
subscribe: function (fn) {
_seatLs.add(fn);
return function () {
_seatLs.delete(fn);
};
}
};
function _stp(ev) { ev.stopPropagation(); if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation(); }
function _okOpt(o) { return Boolean(o && !o.disabled && !o.isCustom && o.label); }
function _canCm(c) { return Boolean(c && (typeof c.setModelConfigByLabelForConversation === "function" || typeof c.unwrappedSetSelectedModel === "function" || typeof c.setCurrentModelConfigByLabel === "function")); }
function _hasOrch(c) { return Boolean(c && c.orchPick && typeof c.orchPick.select === "function" && Array.isArray(c.orchPlanners) && c.orchPlanners.length); }
function _fOrch(c) {
if (!c) return null;
if (_okOpt(c.selectedModel) && _isOrch(c.selectedModel)) return c.selectedModel;
var os = Array.isArray(c.modelOptions) ? c.modelOptions : [], f = null, dp = c.orchDef && parseModelLabel(c.orchDef.label), dt = dp ? (_slug(dp.base).split("-").pop() || "") : "";
for (var i = 0; i < os.length; i += 1) {
var o = os[i];
if (!_okOpt(o) || !_isOrch(o)) continue;
if (!f) f = o;
if (dt && _slug(o.label).indexOf(dt) !== -1) return o;
}
return f;
}
function _isDis(t, it) {
if (!t || typeof t.closest !== "function") return true;
if (t.closest('[aria-disabled="true"],[disabled]')) return true;
var d = t.closest("[data-disabled]");
return Boolean((d && d.getAttribute("data-disabled") !== "false") || (it && it.disabled));
}
function _isBox(e) {
return !e || /^(?:menu|listbox|presentation|group|dialog|status)$/.test((e.getAttribute && e.getAttribute("role")) || "") || !!(e.classList && e.classList.contains("agy-overlay"));
}
function _mPlan(it, c) {
if (!it || !_hasOrch(c)) return null;
var g = it.querySelector && it.querySelector('[data-testid="model-selector-effort-group"]');
var raw = (g && (g.getAttribute("data-model-base") || g.textContent)) || it.getAttribute("data-model-label") || it.getAttribute("data-model-base") || it.textContent || "";
var cl = String(raw).replace(/\b(?:new|notice|beta|preview|recommended|default)\b|默认|自动/gi, " ").replace(/\s+/g, " ").trim();
if (_isOrch(cl) || cl.length > 80) return null;
if (!cl) {
if (!/^(?:default|auto|默认|自动)\b/i.test(String(raw).trim())) return null;
var d = c.orchDef || c.orchPlanners[0];
return _okOpt(d) ? { opt: d, base: (parseModelLabel(d.label) || {}).base || d.label, fam: true } : null;
}
var ps = c.orchPlanners, es = _slug(cl), bp = parseModelLabel(cl), bc = bp ? bp.base : cl, sp;
if (!bp) while ((sp = bc.lastIndexOf(" ")) > 0 && /^(?:off|minimal|low|medium|high|xhigh|extra|max)$/i.test(bc.slice(sp + 1))) bc = bc.slice(0, sp).trim();
var bs = _slug(bc);
var mb = "", bl = 0, fb = null, i, p, ep;
for (i = 0; i < ps.length; i += 1) {
p = ps[i];
if (!_okOpt(p)) continue;
ep = parseModelLabel(p.label);
var ob = ep ? ep.base : p.label;
if (p.label === cl || _slug(p.label) === es) return { opt: p, base: ob, fam: false };
var os = _slug(ob);
if (os && (os === bs || (os.length > bl && (es === os || es.indexOf(os) === 0)))) { bl = os === bs ? 999 : os.length; mb = ob; fb = p; }
}
if (!mb) return null;
var by = _luEff(c.orchIdx instanceof Map && c.orchIdx.size ? c.orchIdx : c.effortIndex, mb);
if (by && by.size) {
var ok = function (k) { return k && by.has(k) && _okOpt(by.get(k)); }, cur = getActiveProfile(c), dp2 = c.orchDef && parseModelLabel(c.orchDef.label), ek = "";
if (bp && ok(bp.effort)) ek = bp.effort;
else if (rememberEffort && ok(_orchEffMap.get(mb))) ek = _orchEffMap.get(mb);
else if (cur && cur.isOrchestrator && ok(cur.currentEffort)) ek = cur.currentEffort;
else if (dp2 && _slug(dp2.base) === _slug(mb) && ok(dp2.effort)) ek = dp2.effort;
else if (ok("medium")) ek = "medium";
for (i = 0; !ek && i < AG_EFFORT_ORDER.length; i += 1) if (ok(AG_EFFORT_ORDER[i])) ek = AG_EFFORT_ORDER[i];
p = ek ? by.get(ek) : fb;
return _okOpt(p) ? { opt: p, base: mb, fam: true } : null;
}
return _okOpt(fb) ? { opt: fb, base: mb, fam: true } : null;
}
var _SUB_BOX = '[role="menu"],[role="listbox"],[data-testid="context-menu-submenu-popup"],.agy-overlay,[data-side]';
var _SUB_IT = '[role^="menuitem"],[role="option"],.agy-overlay-item';
var _L3_RE = /^(?:off|minimal|low|medium|high|xhigh|extra|max)(?:\s+thinking)?$|^(?:关闭|关|极低|最低|最小|低|中|中等|高|超高|极高|特高|最高|最大)(?:思考|推理|强度)?$/i;
function _subIts(m) {
if (!m || !m.querySelectorAll) return [];
var raw = m.querySelectorAll(_SUB_IT);
if (!raw.length) raw = m.querySelectorAll("button,[tabindex]");
var out = [], i, j, el;
for (i = 0; i < raw.length; i += 1) {
el = raw[i];
if (!el || el === m || _isBox(el) || (el.closest && el.closest(".ces-ag-section")) || !String(el.textContent || "").trim()) continue;
for (j = 0; j < out.length; j += 1) if (out[j].contains && out[j].contains(el)) { el = null; break; }
if (el) out.push(el);
}
return out;
}
function _badBox(m) {
return !m || !activePanel || m === activePanel || Boolean(m.contains && m.contains(activePanel)) || Boolean(m.querySelector && m.querySelector('[data-testid="model-selector-panel"],[data-testid="model-selector-orchestrator"],[data-testid="quota-progress-circle"],.ces-ag-section'));
}
function _isSub(m, c) {
if (_badBox(m) || !_hasOrch(c)) return false;
var its = _subIts(m), n = 0, i;
for (i = 0; i < its.length; i += 1) if (_mPlan(its[i], c)) n += 1;
return n >= 1 && n * 2 >= its.length;
}
function _isL3(m, c) {
if (_badBox(m) || !_hasOrch(c)) return false;
if ((m.matches && m.matches('[data-testid="orchestrator-picker-effort"]')) || (m.querySelector && m.querySelector('[data-testid="orchestrator-picker-effort"]'))) return true;
var its = _subIts(m), i;
if (its.length < 2 || its.length > 7) return false;
for (i = 0; i < its.length; i += 1) if (!_L3_RE.test(String(its[i].textContent || "").replace(/[✓✔•·]/g, " ").replace(/\s+/g, " ").trim())) return false;
return true;
}
function _wrapOv(m) {
var o = (m.closest && m.closest('.agy-overlay,[data-radix-popper-content-wrapper],[role="presentation"],[data-side]')) || (m.parentElement && m.parentElement !== doc.body ? m.parentElement : null);
if (!o || o === activePanel || (o.contains && o.contains(activePanel)) || (o.querySelector && o.querySelector('[data-testid="model-selector-panel"]'))) return null;
if ((o.getAttribute && o.getAttribute("data-ag-cs-orch-l2") === "1") || (o.querySelector && o.querySelector('[data-ag-cs-orch-l2="1"]'))) return null;
var hasL2 = false;
_boundSubs.forEach(function (b) { if (b && (b === o || (o.contains && o.contains(b)))) hasL2 = true; });
return hasL2 ? null : o;
}
function _ubSub(m) { if (m) { try { if (typeof m.__cesSubUb === "function") m.__cesSubUb(); } catch (e) {} _boundSubs.delete(m); } }
function _clrL3(ov, m) {
try { m && m.removeAttribute("data-ag-cs-orch-l3"); if (ov && ov !== m) ov.removeAttribute("data-ag-cs-orch-l3"); } catch (e) {}
_hiddenL3.delete(m);
}
function _sySubDom(m, c, p) {
if (!m || !c || !p) return;
var its = _subIts(m), i, h, v;
for (i = 0; i < its.length; i += 1) {
h = _mPlan(its[i], c);
if (!h) continue;
if (its[i].getAttribute("data-ces-orch-row") !== "1") its[i].setAttribute("data-ces-orch-row", "1");
v = p.isOrchestrator && p.baseName && _slug(p.baseName) === _slug(h.base) ? "true" : "false";
if (its[i].getAttribute("data-ces-model-selected") !== v) its[i].setAttribute("data-ces-model-selected", v);
}
}
function _bdSub(m) {
if (!m || m.__cesSubBd) return;
m.__cesSubBd = true;
var ov = _wrapOv(m);
try {
m.setAttribute("data-ag-cs-model-submenu", "1");
m.setAttribute("data-ag-cs-orch-l2", "1");
if (ov && ov !== m) {
ov.setAttribute("data-ag-cs-model-submenu", "1");
if (ov.getAttribute && ov.getAttribute("data-ag-cs-orch-l3") === "1") ov.removeAttribute("data-ag-cs-orch-l3");
}
} catch (e) {}
function rAct(t) {
if (_isTrigLocked(doc) || !t || typeof t.closest !== "function" || t.closest('button[aria-label="Edit Model"],a[href]')) return null;
var it = t.closest(_SUB_IT);
if (!it || !m.contains(it)) it = t.closest("button,[tabindex]");
if (!it || it === m || _isBox(it) || !m.contains(it) || _isDis(t, it)) return null;
var c = getLiveContext() || _rdAgFiber(m), h = _mPlan(it, c);
if (!h || !h.opt) return null;
var cur = getActiveProfile(c), need = !cur || !cur.isOrchestrator, oo = need ? _fOrch(c) : (_actOptOvr || c.selectedModel || _fOrch(c));
if (need && (!_canCm(c) || !oo)) return null;
if (!need && cur && cur.baseName && _slug(cur.baseName) === _slug(h.base) && (h.fam || (cur.modelOption && cur.modelOption.value === h.opt.value))) return null;
return { ctx: c, oo: oo, po: h.opt, need: need };
}
function onUp(ev) { if (rAct(ev.target)) _stp(ev); }
function onMd(ev) { if (rAct(ev.target)) { ev.preventDefault(); _stp(ev); } }
function onCk(ev) {
var a = rAct(ev.target);
if (!a || (a.need && !_commitAgOpt(a.ctx, a.oo, false)) || !_commitAgOpt(a.ctx, a.po, true)) return;
ev.preventDefault(); _stp(ev);
activeBaseOverride = null; _actOptOvr = a.oo; _lastHostLbl = (a.ctx.selectedModel && a.ctx.selectedModel.label) || ""; _orchPlanOvr = a.po;
_withMut(function () {
var p = resolveModelEffortProfile(a.ctx, a.oo, _curEffMap(), a.po);
_syncAgDom(a.ctx, p); _sySubDom(m, a.ctx, p); _sySubs(activePanel, a.ctx, p); notifySeatListeners(); _syP();
});
}
var evs = [["pointerdown", onUp], ["mousedown", onMd], ["pointerup", onUp], ["mouseup", onUp], ["click", onCk]], i;
for (i = 0; i < evs.length; i += 1) m.addEventListener(evs[i][0], evs[i][1], true);
m.__cesSubUb = function () {
for (var u = 0; u < evs.length; u += 1) m.removeEventListener(evs[u][0], evs[u][1], true);
try {
m.removeAttribute("data-ag-cs-model-submenu"); m.removeAttribute("data-ag-cs-orch-l2");
if (ov && ov !== m) ov.removeAttribute("data-ag-cs-model-submenu");
var rs = m.querySelectorAll ? m.querySelectorAll("[data-ces-orch-row]") : [];
for (var r = 0; r < rs.length; r += 1) { rs[r].removeAttribute("data-ces-orch-row"); rs[r].removeAttribute("data-ces-model-selected"); }
} catch (e) {}
delete m.__cesSubUb; delete m.__cesSubBd;
};
_boundSubs.add(m);
}
function _sySubs(panel, c, p) {
_boundSubs.forEach(function (m) { if (!m || m.isConnected === false || !panel || !_isSub(m, c)) _ubSub(m); });
_hiddenL3.forEach(function (ov, m) { if (!m || m.isConnected === false || !panel || !_isL3(m, c)) _clrL3(ov, m); });
if (!panel || !_hasOrch(c)) return;
var seen = new Set(), cands = [], qm = doc && doc.querySelectorAll ? doc.querySelectorAll(_SUB_BOX + ',[data-testid="orchestrator-picker-effort"]') : [], mis = doc && doc.querySelectorAll ? doc.querySelectorAll(_SUB_IT) : [], i, j;
for (i = 0; i < qm.length; i += 1) if (!seen.has(qm[i])) { seen.add(qm[i]); cands.push(qm[i]); }
for (i = 0; i < mis.length; i += 1) { var pr = mis[i].parentElement; if (pr && !seen.has(pr) && !_badBox(pr)) { seen.add(pr); cands.push(pr); } }
var l2 = cands.filter(function (x) { return _isSub(x, c); });
for (i = 0; i < l2.length; i += 1) {
for (j = 0; j < l2.length; j += 1) if (i !== j && l2[i].contains && l2[i].contains(l2[j])) { l2[i] = null; break; }
if (l2[i]) { _bdSub(l2[i]); _sySubDom(l2[i], c, p); }
}
if (_boundSubs.size > 0 || panel.getAttribute("data-ces-orch-tunable") === "true") {
for (i = 0; i < cands.length; i += 1) {
var m3 = cands[i], inL2 = false;
if (_boundSubs.has(m3) || !_isL3(m3, c)) continue;
_boundSubs.forEach(function (b) { if (b === m3 || (b.contains && b.contains(m3)) || (m3.contains && m3.contains(b))) inL2 = true; });
if (inL2) continue;
var ov3 = _wrapOv(m3);
try {
if (m3.getAttribute("data-ag-cs-orch-l3") !== "1") m3.setAttribute("data-ag-cs-orch-l3", "1");
if (ov3 && ov3 !== m3 && ov3.getAttribute("data-ag-cs-orch-l3") !== "1") ov3.setAttribute("data-ag-cs-orch-l3", "1");
} catch (e) {}
_hiddenL3.set(m3, ov3);
}
}
}
function _bindPnl(panel) {
if (!panel || panel.__cesAgBound) return;
panel.__cesAgBound = true;
function rKeep(target) {
if (_isTrigLocked(doc) || !target || typeof target.closest !== "function" || target.closest('.ces-ag-section,.ces-set,button[aria-label="Edit Model"]')) return null;
var menuItem = target.closest('[role^="menuitem"]');
if (_isDis(target, menuItem)) return null;
var oe = target.closest('[data-testid="model-selector-orchestrator"]') || (menuItem && menuItem.querySelector && menuItem.querySelector('[data-testid="model-selector-orchestrator"]'));
if (!oe && menuItem && panel.contains(menuItem) && !menuItem.querySelector('[data-testid="model-selector-effort-group"],[data-testid="model-selector-item"]') && _isOrch(menuItem.textContent)) oe = menuItem;
if (oe && panel.contains(oe)) {
var oc = getLiveContext();
if (!_canCm(oc)) return null;
var oCur = getActiveProfile(oc);
if (oCur && oCur.isOrchestrator) return null;
var oo = _fOrch(oc);
return oo ? { ctx: oc, base: null, targetOption: oo, isOrch: true } : null;
}
if (target.closest('[data-testid="model-selector-item"]')) return null;
var gs = menuItem && panel.contains(menuItem) && menuItem.querySelector('[data-testid="model-selector-effort-group"]');
if (!gs) return null;
var base = (gs.getAttribute("data-model-base") || gs.textContent || "").trim(), bp = parseModelLabel(base);
if (bp && bp.base) base = bp.base;
if (!base || _isOrch(base)) return null;
var ctx = getLiveContext();
if (!_canCm(ctx)) return null;
var prof = resolveModelEffortProfile(ctx, base, _curEffMap()), opt = prof && !prof.locked && prof.levels && prof.levels.length >= 2 ? prof.modelOption : null;
if (!_okOpt(opt)) return null;
if (Array.isArray(ctx.modelOptions) && ctx.modelOptions.length && !ctx.modelOptions.some(function (o) { return _okOpt(o) && (o === opt || o.label === opt.label); })) return null;
var cur = getActiveProfile(ctx);
if (cur && !cur.isOrchestrator && cur.baseName === prof.baseName) return null;
return { ctx: ctx, base: prof.baseName || base, targetOption: opt, isOrch: false };
}
function onUpC(ev) {
if (rKeep(ev.target)) _stp(ev);
}
function onCkC(ev) {
var act = rKeep(ev.target);
if (!act || !_commitAgOpt(act.ctx, act.targetOption)) return;
ev.preventDefault();
_stp(ev);
activeBaseOverride = act.isOrch ? null : act.base;
_actOptOvr = act.targetOption;
_lastHostLbl = (act.ctx.selectedModel && act.ctx.selectedModel.label) || "";
_orchPlanOvr = null;
_withMut(function () {
var nextProf = resolveModelEffortProfile(act.ctx, act.targetOption, _curEffMap());
_syncAgDom(act.ctx, nextProf);
_sySubs(panel, act.ctx, nextProf);
notifySeatListeners();
});
}
var uTm = null, uEl = null, uOk = false, uSyn = false;
function fUsg(target) {
if (!target || typeof target.closest !== "function") return null;
var item = target.closest('[role="menuitem"],.agy-overlay-item,button'), uRe = /View Usage|查看用量|\bUsage\b/;
if (!item) {
var div = target.closest("div"), dt = div && div !== panel && panel.contains(div) ? (div.textContent || "").trim() : "";
if (dt && /^(?:View Usage|Usage$|查看用量)/.test(dt) && !/Claude|Gemini|GPT/.test(dt)) item = div;
}
return item && item !== panel && panel.contains(item) && uRe.test((item.textContent || "").trim()) ? item : null;
}
function rstUsg() {
if (uTm) { clearTimeout(uTm); uTm = null; }
uOk = false; uEl = null;
}
function onPeC(ev) {
if (uSyn) return;
var trigger = fUsg(ev.target);
if (!trigger) { rstUsg(); return; }
if (uOk && uEl === trigger) return;
_stp(ev);
rstUsg();
uEl = trigger;
try {
trigger.addEventListener("pointerleave", rstUsg, { once: true });
trigger.addEventListener("mouseleave", rstUsg, { once: true });
} catch (e) {}
var cx = ev.clientX, cy = ev.clientY, pid = ev.pointerId || 1, pt = ev.pointerType || "mouse";
uTm = setTimeout(function () {
uTm = null;
if (trigger && panel.contains(trigger)) {
uOk = true; uSyn = true;
try {
var PE = (win && win.PointerEvent) || (typeof PointerEvent !== "undefined" ? PointerEvent : null);
var ME = (win && win.MouseEvent) || (typeof MouseEvent !== "undefined" ? MouseEvent : null);
var EV = (win && win.Event) || (typeof Event !== "undefined" ? Event : null);
if (typeof PE === "function") {
[["pointerenter", false], ["pointerover", true], ["pointermove", true]].forEach(function (it) {
trigger.dispatchEvent(new PE(it[0], { bubbles: it[1], cancelable: true, pointerId: pid, pointerType: pt, clientX: cx, clientY: cy }));
});
} else if (typeof ME === "function") trigger.dispatchEvent(new ME("mouseenter", { bubbles: false, cancelable: true, clientX: cx, clientY: cy }));
else if (typeof EV === "function") trigger.dispatchEvent(new EV("pointerenter", { bubbles: false, cancelable: true }));
} catch (err) {} finally { uSyn = false; }
}
}, 300);
}
function onPoC(ev) {
if (uSyn) return;
var trigger = fUsg(ev.target);
if (!trigger) { if (uOk || uTm) rstUsg(); return; }
if (!uOk) _stp(ev);
}
function onPouC(ev) {
if (uSyn) return;
var trigger = fUsg(ev.target);
if (trigger && (!ev.relatedTarget || !trigger.contains(ev.relatedTarget))) rstUsg();
}
function onPmC(ev) {
if (uSyn) return;
if (fUsg(ev.target) && !uOk) _stp(ev);
}
function onPlC(ev) {
if (!ev.relatedTarget || !panel.contains(ev.relatedTarget)) rstUsg();
}
var evPairs = [
["pointerenter", onPeC],
["pointerover", onPoC],
["pointerout", onPouC],
["pointerleave", onPlC],
["pointermove", onPmC],
["pointerup", onUpC],
["mouseup", onUpC],
["click", onCkC]
];
for (var ei = 0; ei < evPairs.length; ei++) panel.addEventListener(evPairs[ei][0], evPairs[ei][1], true);
panel.__cesAgResetUsageHover = rstUsg;
panel.__cesAgUnbindPanel = function () {
for (var ui = 0; ui < evPairs.length; ui++) panel.removeEventListener(evPairs[ui][0], evPairs[ui][1], true);
delete panel.__cesAgResetUsageHover;
delete panel.__cesAgUnbindPanel;
delete panel.__cesAgBound;
};
}
function _unmntSec() {
_setReady(false);
_boundSubs.forEach(_ubSub);
_boundSubs.clear();
_hiddenL3.forEach(_clrL3);
_hiddenL3.clear();
if (activePanel) {
try { if (typeof activePanel.__cesAgResetUsageHover === "function") activePanel.__cesAgResetUsageHover(); } catch (e) {}
try { if (typeof activePanel.__cesAgUnbindPanel === "function") activePanel.__cesAgUnbindPanel(); } catch (e) {}
}
if (doc && doc.activeElement && activeSection && activeSection.contains(doc.activeElement)) {
try { doc.activeElement.blur(); } catch (e) {}
}
if (activeValueEl) { delete activeValueEl.__cesLastLabel; delete activeValueEl.__cesLastKey; }
_clrSibs(activePanel);
if (activeMount) { activeMount.unmount(); activeMount = null; }
if (activeSection && activeSection.parentNode) activeSection.parentNode.removeChild(activeSection);
activeSection = activeRow = activeValueEl = activeHostEl = activePanel = activeBaseOverride = _actOptOvr = _orchPlanOvr = null;
}
function _mntSec(panel, ctx) {
panel.classList.add("ces-ag-panel-enhanced");
_bindPnl(panel);
var mk = function (t, c, p) { var e = doc.createElement(t); e.className = c; if (p) e.setAttribute("data-ces-part", p); return markNoTranslate(e); };
var section = mk("div", "ces-ag-section", "ag-section");
var _stopProp = function (ev) { if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation(); };
["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function (evName) { section.addEventListener(evName, _stopProp); });
var sep = doc.createElement("div");
sep.setAttribute("role", "separator");
sep.setAttribute("aria-orientation", "horizontal");
sep.className = "h-px bg-border my-1 -mx-1";
section.appendChild(sep);
var row = mk("div", "ces-ag-effort-row text-foreground");
row.setAttribute("data-ces-effort-row", "true");
var head = mk("div", "ces-ag-effort-head");
var title = mk("span", "ces-ag-effort-title");
title.textContent = resolveEffortTitle(doc, win);
var valueEl = mk("span", "ces-ag-effort-value", "value");
var initProf = getActiveProfile(ctx);
if (initProf && initProf.currentLabel) {
valueEl.textContent = initProf.currentLabel;
valueEl.__cesLastLabel = initProf.currentLabel;
valueEl.__cesLastKey = _normEffTxt(initProf.currentLabel) || _normEffTxt(initProf.currentEffort) || String(initProf.currentLabel || initProf.currentEffort || "").trim().toLowerCase();
}
head.appendChild(title);
head.appendChild(valueEl);
row.appendChild(head);
var hostEl = mk("div", "ces-inline", "host");
row.appendChild(hostEl);
section.appendChild(row);
// 挂载位置：模型列表容器 (panel.firstElementChild) 之后、View Usage 分隔线之前
var modelListWrapper = panel.firstElementChild;
if (modelListWrapper && modelListWrapper.nextSibling) {
panel.insertBefore(section, modelListWrapper.nextSibling);
} else {
panel.appendChild(section);
}
activePanel = panel;
activeSection = section;
activeRow = row;
activeValueEl = valueEl;
activeHostEl = hostEl;
activeMount = mountCodexEffortSlider({
container: hostEl,
panel: panel,
row: row,
valueElement: valueEl,
seat: agSeatAdapter,
document: doc,
window: win,
onVisualChange: function (vState) {
if (vState && vState.dragging) return;
_withMut(function () {
var liveCtx = getLiveContext();
if (liveCtx) _syncAgDom(liveCtx, getActiveProfile(liveCtx));
else syncTriggerColor(doc, vState.label, vState.index, vState.count, vState.isMax, false);
});
}
});
}
function scan() {
if (_intMut) return;
_withMut(() => {
var ctx = getLiveContext();
if (memOnly) {
if (!ctx) return;
var sel = ctx.selectedModel, isO = _isOrch(sel);
if (lk && Date.now() > lk.u) lk = null;
var pi = isO ? _resOrch(ctx) : null, mp = isO ? (pi?.opt && parseModelLabel(pi.opt.label)) : (sel?.label && parseModelLabel(sel.label)), lbl = isO ? pi?.opt?.label : sel?.label;
if (mp?.base && mp.effort && (isO || (_luEff(ctx.effortIndex, mp.base)?.size || 0) >= 2)) {
var dst = isO ? _orchEffMap : _effMap;
if (lk && lk.o === isO && lk.b === mp.base) { if (lbl === lk.t.label) { lk = null; _recEff(dst, mp.base, mp.effort); } }
else _recEff(dst, mp.base, mp.effort);
}
var p0 = findAntigravityPanel(doc);
if (!p0) return;
var sB = !isO && sel?.label ? (parseModelLabel(sel.label)?.base || sel.label) : "";
for (var g of p0.querySelectorAll('[data-testid="model-selector-effort-group"]')) {
var gb = g.getAttribute("data-model-base") || (g.textContent || "").trim(); gb = parseModelLabel(gb)?.base || gb;
var gr = gb && (isO || gb !== sB) ? _effMap.get(gb) : "";
if (gr && _luEff(ctx.effortIndex, gb)?.has(gr) && g.nextElementSibling?.tagName === "SPAN") _setEffTxt(g.nextElementSibling, AG_EFFORT_LABELS[gr] || gr);
}
if (!isO && _orchEffMap.size) {
var oi = ctx.orchIdx instanceof Map && ctx.orchIdx.size ? ctx.orchIdx : ctx.effortIndex;
for (var row of doc.querySelectorAll('[data-testid="orchestrator-picker-row"][data-model-base]')) {
var ob = (row.getAttribute("data-model-base") || "").trim(), or = ob ? _orchEffMap.get(ob) : "", os = or && _luEff(oi, ob)?.has(or) && row.querySelector("span.opacity-70");
if (os) _setEffTxt(os, AG_EFFORT_LABELS[or] || or);
}
}
return;
}
var curLbl = ctx?.selectedModel?.label || "";
if ((_actOptOvr || activeBaseOverride) && (!curLbl || (_actOptOvr && curLbl === _actOptOvr.label) || curLbl !== _lastHostLbl)) _actOptOvr = activeBaseOverride = null;
_lastHostLbl = curLbl;
if (_orchPlanOvr) {
var effModel = _actOptOvr || ctx?.selectedModel, lp = ctx && _isOrch(effModel) ? _resOrch(ctx) : null;
if (!ctx || !_isOrch(effModel) || lp?.opt?.value === _orchPlanOvr.value) _orchPlanOvr = null;
}
var panel = findAntigravityPanel(doc);
if (!panel) {
activeSection || activePanel ? _unmntSec() : _setReady(false);
if (ctx) _syncAgDom(ctx, getActiveProfile(ctx));
return;
}
if (!_hasValidCtx(ctx)) { activeSection || activePanel ? _unmntSec() : _setReady(false); return; }
if (activePanel !== panel || !activeSection || !panel.contains(activeSection)) { _unmntSec(); _mntSec(panel, ctx); }
else {
_setTxt(activeSection.querySelector(".ces-ag-effort-title"), resolveEffortTitle(doc, win));
activeMount?.refresh?.();
}
_setReady(Boolean(activeMount && activeSection));
var liveProf = getActiveProfile(ctx);
_syncAgDom(ctx, liveProf); _sySubs(panel, ctx, liveProf); notifySeatListeners();
});
}
var onMemCk = null;
if (memOnly) {
var qOrch = (c, ob) => {
var or = ob ? _orchEffMap.get(ob) : "", oi = c ? (c.orchIdx instanceof Map && c.orchIdx.size ? c.orchIdx : c.effortIndex) : null, oby = oi && or ? _luEff(oi, ob) : null, ot = oby?.get(or);
var dp = c?.orchDef && parseModelLabel(c.orchDef.label), defEff = dp && _slug(dp.base) === _slug(ob) && oby?.has(dp.effort) ? dp.effort : "";
if (ot && _okOpt(ot) && or !== defEff) { lk = { o: true, b: ob, t: ot, u: Date.now() + 300 }; qM(() => { if (!_isTrigLocked(doc)) _commitAgOpt(c, ot, true, false); }); }
};
onMemCk = (ev) => {
var t = ev?.target;
if (!t?.closest || _isTrigLocked(doc) || _isDis(t)) return;
if (t.closest('[data-testid="model-selector-effort-option"],[data-testid="orchestrator-picker-effort"]')) { lk = null; return; }
if (t.closest('button[aria-label="Edit Model"],a[href]')) return;
var oRow = t.closest('[data-testid="orchestrator-picker-row"][data-model-base]');
if (oRow) { qOrch(getLiveContext(), (oRow.getAttribute("data-model-base") || "").trim()); return; }
var pnl = findAntigravityPanel(doc);
if (pnl && !pnl.contains(t)) {
var sm = t.closest(_SUB_BOX);
if (sm && sm !== pnl) {
var sc = getLiveContext() || _rdAgFiber(sm);
if (sc && _hasOrch(sc)) {
var it3 = t.closest(_SUB_IT) || t.closest("button,[tabindex]");
if (it3 && _L3_RE.test(String(it3.textContent || "").replace(/[✓✔•·]/g, " ").replace(/\s+/g, " ").trim())) { lk = null; return; }
if (it3 && !_isBox(it3) && !_isDis(t, it3)) {
var hm = _mPlan(it3, sc);
if (hm) { if (hm.fam && hm.base) qOrch(sc, hm.base); else lk = null; return; }
}
}
}
}
var mi = pnl?.contains(t) && t.closest('[role^="menuitem"]');
if (!mi || !pnl.contains(mi) || t.closest('[data-testid="model-selector-item"],[data-testid="model-selector-orchestrator"]')) return;
var g = mi.querySelector('[data-testid="model-selector-effort-group"]');
if (!g) return;
var b = (g.getAttribute("data-model-base") || g.textContent || "").trim(); b = parseModelLabel(b)?.base || b;
var r = b ? _effMap.get(b) : "", c = r ? getLiveContext() : null;
if (!c) return;
var curP = c.selectedModel && !_isOrch(c.selectedModel) ? parseModelLabel(c.selectedModel.label) : null;
if (curP?.base === b) return;
var by = _luEff(c.effortIndex, b), tgt = by?.get(r);
if (tgt && _okOpt(tgt)) { lk = { o: false, b, t: tgt, u: Date.now() + 300 }; qM(() => { if (_isTrigLocked(doc)) { lk = null; return; } var live = getLiveContext() || c; if (live?.selectedModel?.label === tgt.label) { lk = null; return; } _commitAgOpt(live, tgt, false, false); }); }
};
doc.addEventListener?.("click", onMemCk, true);
}
scan();
var MO = opts.MutationObserver || win?.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null);
if (typeof MO === "function") {
var ctrlSel = '[data-testid="model-selector-trigger"],button[aria-label^="Select model"],[data-testid="model-selector-panel"],[role="menu"]';
var noiseSel = '[data-testid="autoscroll-viewport"],.toast-viewport,[data-testid="sidebar-split"]>div:first-child';
observer = new MO((recs) => {
if (_intMut) return;
if (!memOnly && Array.isArray(recs) && recs.length) {
if (activeSection && activePanel?.contains(activeSection) && recs.every((sr) => { var st = sr?.target, sel = st && (st.nodeType === 1 ? st : st.parentElement); return sel && activeSection.contains(sel); })) return;
if (!activePanel) {
var rel = recs.some((r) => {
var t = r?.target, el = t && (t.nodeType === 1 ? t : t.parentElement);
if (!el?.closest) return true;
return (r.type === "characterData" || r.type === "attributes") ? Boolean(el.closest(ctrlSel)) : Boolean(el.closest(ctrlSel) || !el.closest(noiseSel));
});
if (!rel) return;
}
}
scan();
});
observer.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-expanded", "data-state", "hidden", "data-selected", "disabled", "aria-disabled", "data-disabled"] });
}
return {
stop: () => {
observer?.disconnect(); observer = null;
doc.removeEventListener?.("pointerdown", _trackTarget, _trackOpts);
doc.removeEventListener?.("focusin", _trackTarget, _trackOpts);
trackedTrigger = trackedPane = null;
if (_lastTrigStateByDoc) _lastTrigStateByDoc.delete(doc);
if (memOnly) { if (onMemCk) doc.removeEventListener?.("click", onMemCk, true); lk = null; _clrSibs(doc); }
else { _unmntSec(); _clrAgDom(doc); }
},
rescan: scan,
setRememberEffort: (on) => {
var next = on !== false;
if (next === rememberEffort) return;
rememberEffort = next;
if (next) {
var ld = _loadEffMem(win);
ld.models.forEach((v, k) => { if (!_effMap.has(k)) _effMap.set(k, v); });
ld.orch.forEach((v, k) => { if (!_orchEffMap.has(k)) _orchEffMap.set(k, v); });
} else {
_effMap.clear();
_orchEffMap.clear();
}
scan();
},
getMemory: () => ({ models: Object.fromEntries(_effMap), orch: Object.fromEntries(_orchEffMap) }),
_bindPnl
};
}
function installEffortMemoryGuard(options) {
return installAntigravityObserver(Object.assign({}, options, { memoryOnly: true, rememberEffort: true }));
}
function installCodexEffortSlider(options) {
var o = options || {}, d = o.document || (typeof document !== "undefined" ? document : null), w = o.window || d?.defaultView || (typeof window !== "undefined" ? window : globalRoot);
if (!d?.body) return null;
try { w?.__agCodexEffortSliderInstance?.stop?.(); } catch {}
installStyles(d);
var _onStoInv = (ev) => { if (!ev || ev.key === SETTINGS_KEY || ev.key === LEGACY_SETTINGS_KEY) _invCfg(); };
w?.addEventListener?.("storage", _onStoInv); w?.addEventListener?.(SETTINGS_EVENT, _onStoInv);
var noop = { stop: () => {}, rescan: () => {} };
var sUi = o.disableContextMenuSettings ? noop : installSettingsUi({ document: d, window: w });
var agObs = installAntigravityObserver({ document: d, window: w, MutationObserver: o.MutationObserver, rememberEffort: o.rememberEffort });
var _actGenMnt = null;
var menuObs = o.skipGenericMenuObserver ? noop : installMenuObserver({
document: d, window: w, MutationObserver: o.MutationObserver,
onChange: (cur) => {
_actGenMnt?.unmount(); _actGenMnt = null;
var seat = cur?.container && (o.seat || findSeatEffort(w));
if (seat) _actGenMnt = mountCodexEffortSlider({ container: cur.container, row: cur.row, seat, document: d, window: w });
}
});
var inst = {
stop: () => {
_actGenMnt?.unmount(); _actGenMnt = null;
menuObs.stop(); agObs.stop(); sUi.stop();
w?.removeEventListener?.("storage", _onStoInv); w?.removeEventListener?.(SETTINGS_EVENT, _onStoInv);
_invCfg();
if (w?.__agCodexEffortSliderInstance === inst) delete w.__agCodexEffortSliderInstance;
},
rescan: () => { agObs.rescan(); menuObs.rescan(); },
setRememberEffort: (on) => { agObs.setRememberEffort?.(on); }
};
if (w) w.__agCodexEffortSliderInstance = inst;
return inst;
}
// 在浏览器主世界（非 Node 测试环境且非禁用自动启动）下自动挂载
if (
typeof window !== "undefined" &&
typeof document !== "undefined" &&
!window.__agCodexEffortSliderDisableAutoBoot && !(globalRoot && globalRoot.__agCodexEffortSliderDisableAutoBoot)
) {
var boot = function () {
if (document.body) installCodexEffortSlider({ document: document, window: window });
};
if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
boot();
}
}
return {mountCodexEffortSlider,installMenuObserver,installAntigravityObserver,installEffortMemoryGuard,installCodexEffortSlider,findAntigravityTrigger,findAntigravityPanel,resolveModelEffortProfile,normalizeEffortIndex,motionMode,openSettingsPanel,fillColorFor,fillBackgroundFor,valueColorFor,paintDither,surfaceIsDark,markNoTranslate};
});
;

/* ===== module: slider-coexist.js ===== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    try { root.__agPrismEffortSlider?.destroy?.(); } catch {}
    if (typeof window !== 'undefined' && window !== root) {
      try { window.__agPrismEffortSlider?.destroy?.(); } catch {}
    }
    const api = factory(root);
    root.__agPrismEffortSlider = api;
    if (typeof window !== 'undefined') window.__agPrismEffortSlider = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (globalRoot) {
  'use strict';

  const SLIDER_STYLE_ID = 'ag-codex-effort-slider-styles';
  const HIDE_STYLE_ID = 'ag-prism-effort-slider-hide';
  const PRISM_OWNER_ATTR = 'data-ag-prism-slider';
  const THROTTLE_MS = 120;
  const MENU_THROTTLE_MS = 32;

  const ga = (e, k) => e?.getAttribute?.(k), sa = (e, k, v) => e?.setAttribute?.(k, v), ra = (e, k) => e?.removeAttribute?.(k);
  const qs = (e, s) => e?.querySelector?.(s), qa = (e, s) => e?.querySelectorAll?.(s) || [];

  function resLib(win) {
    if (win?.AntigravityCodexEffortSlider) return win.AntigravityCodexEffortSlider;
    if (globalRoot?.AntigravityCodexEffortSlider) return globalRoot.AntigravityCodexEffortSlider;
    if (typeof require === 'function') {
      try {
        globalRoot.__agCodexEffortSliderDisableAutoBoot = true;
        if (win) win.__agCodexEffortSliderDisableAutoBoot = true;
        return require('./upstream-client.js');
      } catch {}
    }
    return null;
  }

  const isMenu = (doc) => Boolean(qs(doc, '[data-testid="model-selector-panel"], .ces-menu-section, [data-ces-effort-row="true"], [role="dialog"] [data-ces-settings]'));

  const IGNORED_CHAT_SEL =
    '[data-testid="autoscroll-viewport"],[data-testid="planner-response-text"],[data-testid="agent-response"],[data-markdown-root],[data-testid="user-message-bubble"],aside,[data-op-thought="1"],.ag-prism-thought-overlay,.ag-cs-crab,.ag-cs-conv-aura-host,#ag-pulse-status-bar,#ag-prism-pulse-bar,[data-ag-prism-pulse-bar="true"],.ag-cs-panel-row-glyph,.ces-ag-section,.ces-set,[data-ag-owned="1"],[data-testid="orchestrator-effort-bar"],.ag-cs-smooth-caret,.ag-anim-icon,[data-agy-hans-ui],#agy-theme-switcher,#agy-theme-menu,#antigravity-quota-widget,#antigravity-translation-audit';

  const EFF_MAP = Object.create(null);
  for (const g of 'xhigh:xhigh|extra|extra high|超高|极高|極高|特高|很高|超高思考;high:high|高|高思考|高推理|高强度|高強度;medium:medium|med|中|中等|中思考|中等思考|中推理;low:low|低|低思考|低推理;minimal:minimal|极低|極低|最小|最低|极简|極簡;max:max|最高|最大|极限|極限;off:off|关闭|關閉|关|關|无|無|不推理|none|disabled;auto:auto|自动|自動;adaptive:adaptive|自适应|自適應;thinking:thinking|深度思考|思考中|思考'.split(';')) {
    const [k, vs] = g.split(':');
    for (const v of vs.split('|')) EFF_MAP[v] = k;
  }
  const EFF_LABELS = { off: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra', max: 'Max', auto: 'Auto', adaptive: 'Adaptive', thinking: 'Thinking' };

  function normalizeEffortToken(raw) {
    const s = String(raw || '').trim().replace(/^[(\uff08]+|[)\uff09]+$/g, '').trim().replace(/\s+thinking$/i, '').toLowerCase();
    return EFF_MAP[s] || '';
  }

  function parseLocalizedModelLabel(raw) {
    const s = String(raw || '').trim().replace(/^(?:Select model|Current|选择模型|選擇模型)\s*[:：]\s*/i, '').trim();
    if (!s) return null;
    const m = /^(.*?)\s*[\(\uff08]([^()\uff08\uff09]+)[\)\uff09]\s*$/.exec(s);
    const eff = m ? normalizeEffortToken(m[2]) : '';
    if (!m || !eff) return { base: s, rawBase: s, effort: '', effortLabel: '', canonicalLabel: s, isThinking: false };
    const rawBase = m[1].trim(), isThinking = eff === 'thinking', effortLabel = EFF_LABELS[eff] || m[2].trim();
    return { base: isThinking ? `${rawBase} (Thinking)` : rawBase, rawBase, effort: eff, effortLabel, canonicalLabel: `${rawBase} (${effortLabel})`, isThinking };
  }

  function markOwnedNoTr(doc) {
    const fn = resLib(doc?.defaultView)?.markNoTranslate;
    if (!fn) return;
    for (const el of qa(doc, '.ces-ag-section,.ces-set,[data-testid="orchestrator-effort-bar"]')) {
      fn(el);
      for (const ch of qa(el, 'div,span')) if (String(ch.className || '').includes('ces-ag-effort-')) fn(ch);
    }
  }

  function syncBilingualDom(doc) {
    const p = qs(doc, '[data-testid="model-selector-panel"]');
    if (!p) return;
    for (const g of qa(p, '[data-testid="model-selector-effort-group"]')) {
      if (!ga(g, 'data-model-base')) {
        const pr = parseLocalizedModelLabel(g.textContent);
        if (pr?.rawBase && pr.effort && !pr.isThinking) sa(g, 'data-model-base', pr.rawBase);
      }
      const sib = g.nextElementSibling;
      if (sib?.tagName === 'SPAN') {
        const ek = normalizeEffortToken(sib.textContent);
        if (ek && EFF_LABELS[ek] && sib.textContent.trim() !== EFF_LABELS[ek]) sa(sib, 'data-ces-eff-key', ek);
      }
    }
    for (const it of qa(p, '[data-testid="model-selector-item"]')) {
      if (!ga(it, 'data-model-label')) {
        const pr = parseLocalizedModelLabel(it.textContent);
        if (pr?.effort) sa(it, 'data-model-label', pr.canonicalLabel);
      }
    }
  }

  function isIgnTarget(node) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return false;
    if (el.classList?.contains?.('ag-prism-thought-chunk') || el.classList?.contains?.('ag-prism-thought-overlay')) return true;
    return typeof el.closest === 'function' ? Boolean(el.closest(IGNORED_CHAT_SEL)) : false;
  }

  function isIgnRec(rec) {
    const t = rec?.target;
    if (!t) return false;
    if (isIgnTarget(t)) return true;
    const a = rec.addedNodes, r = rec.removedNodes, n = (a?.length || 0) + (r?.length || 0);
    if (!n) return false;
    for (const l of [a, r]) if (l) for (let i = 0; i < l.length; i++) if (!isIgnTarget(l[i])) return false;
    return true;
  }

  const allIgn = (recs) => Array.isArray(recs) && recs.length > 0 && recs.every(isIgnRec);

  const TR_SEL = '[data-testid="model-selector-trigger"],button[aria-label^="Select model"]';
  const SUB_TID = 'context-menu-submenu-popup';
  const SUB_SEL = `[data-testid="${SUB_TID}"]`;
  const MDL_SEL = `[data-testid="model-selector-panel"],${TR_SEL},${SUB_SEL},[role="menu"],[role="listbox"]`;
  function touchesModel(recs) {
    if (!Array.isArray(recs) || !recs.length) return true;
    for (const rec of recs) {
      if (isIgnRec(rec)) continue;
      const t = rec?.target, el = t && (t.nodeType === 1 ? t : t.parentElement);
      if (el?.getAttribute && ((ga(el, 'data-testid') || '').includes('model-selector') || el.closest?.(MDL_SEL))) return true;
      for (const n of rec?.addedNodes || []) {
        if (!n || n.nodeType !== 1 || isIgnTarget(n)) continue;
        const r = ga(n, 'role') || '', tid = ga(n, 'data-testid') || '';
        if (tid.includes('model-selector') || tid === SUB_TID || r === 'menu' || r === 'listbox' || r === 'dialog' || n.classList?.contains?.('agy-overlay') || ((n.tagName === 'DIV' || n.tagName === 'BUTTON') && qs(n, MDL_SEL))) return true;
      }
    }
    return false;
  }

  function mkThrottledMO(BaseMO, doc, stats) {
    if (typeof BaseMO !== 'function') return null;
    return function TMO(cb) {
      let tm = null, closeTm = null, lastAt = 0, q = [], disc = false, wasOpen = false, curTrig = null;
      const syncTrig = () => {
        if (disc) return;
        const tr = qs(doc, TR_SEL);
        if (!tr || tr === curTrig) return;
        curTrig = tr;
        try { inner.observe(tr, { characterData: true, subtree: true }); } catch {}
      };
      const flush = (fSync) => {
        tm = null;
        if (disc) return;
        const batch = q;
        q = [];
        const open = isMenu(doc), closed = wasOpen && !open;
        if (!Boolean(fSync || closed) && !touchesModel(batch)) {
          wasOpen = open;
          stats.skippedIrrelevant += 1;
          return;
        }
        wasOpen = open;
        lastAt = Date.now();
        stats.executedScans += 1;
        syncBilingualDom(doc);
        cb(batch, wrap);
        markOwnedNoTr(doc);
        syncTrig();
        if (closed) {
          if (closeTm !== null) clearTimeout(closeTm);
          closeTm = setTimeout(() => { closeTm = null; if (!disc) flush(true); }, 48);
          closeTm?.unref?.();
        }
      };
      const inner = new BaseMO((recs) => {
        if (disc) return;
        stats.rawMutations += 1;
        if (allIgn(recs)) { stats.skippedIrrelevant += 1; return; }
        const open = isMenu(doc), closed = wasOpen && !open;
        if (!closed && !touchesModel(recs)) { stats.skippedIrrelevant += 1; return; }
        if (Array.isArray(recs)) for (let i = 0; i < recs.length && q.length < 48; i++) q.push(recs[i]);
        const el = Date.now() - lastAt, wMs = open ? MENU_THROTTLE_MS : THROTTLE_MS;
        let subAdded = false;
        if (open && Array.isArray(recs)) {
          for (const rec of recs) {
            for (const nd of rec?.addedNodes || []) {
              const nr = nd?.nodeType === 1 ? ga(nd, 'role') : '';
              if (nd?.nodeType === 1 && (nr === 'menu' || nr === 'listbox' || ga(nd, 'data-testid') === SUB_TID || nd.classList?.contains('agy-overlay') || qs(nd, `[role="menu"],[role="listbox"],[role^="menuitem"],${SUB_SEL},.agy-overlay`))) {
                subAdded = true;
                break;
              }
            }
            if (subAdded) break;
          }
        }
        if (closed || subAdded || (open && !wasOpen) || (el >= wMs && tm === null)) {
          if (tm !== null) { clearTimeout(tm); tm = null; }
          flush(closed);
        } else if (tm === null) {
          tm = setTimeout(() => flush(false), Math.max(16, wMs - el));
          tm?.unref?.();
        }
      });
      const wrap = {
        observe(t, o) {
          disc = false;
          const r = inner.observe(t, t === doc?.body && o?.characterData ? { ...o, characterData: false } : o);
          syncTrig();
          return r;
        },
        disconnect() {
          disc = true;
          if (tm !== null) { clearTimeout(tm); tm = null; }
          if (closeTm !== null) { clearTimeout(closeTm); closeTm = null; }
          curTrig = null;
          q = [];
          return inner.disconnect();
        },
        takeRecords: () => (typeof inner.takeRecords === 'function' ? inner.takeRecords() : []),
      };
      return wrap;
    };
  }

  function createEffortSliderController(envOpts) {
    const gW = () => (envOpts && envOpts.window) || (typeof window !== 'undefined' ? window : globalRoot);
    const gD = () => (envOpts && envOpts.document) || gW()?.document || null;
    let mode = 'auto', rememberEffort = true, inst = null, memGuard = null, yielded = false;
    const perfStats = { rawMutations: 0, executedScans: 0, skippedIrrelevant: 0 };

    function hasExtInst() {
      const w = gW(), d = gD();
      if (!w) return false;
      if (w.__agCodexEffortSliderInstance && !w.__agCodexEffortSliderInstance.__prismOwned) return true;
      const st = d?.getElementById?.(SLIDER_STYLE_ID);
      return Boolean(st && st.getAttribute(PRISM_OWNER_ATTR) !== '1' && !inst);
    }

    const HIDE_CSS_TEXT =
      '.ces-ag-section,.ces-menu-section,[data-ces-effort-row="true"],.ces-set,.ces-settings-panel{display:none!important}' +
      '[data-testid="orchestrator-effort-bar"]{display:none!important}' +
      '[data-ces-part="trigger-effort"]{color:inherit!important;opacity:.7!important;font-weight:inherit!important}';

    function clrTint(doc) {
      if (!doc) return;
      for (const sp of qa(doc, '[data-ces-part="trigger-effort"], [data-testid="model-selector-trigger"] span[style]')) {
        if (sp.style) sp.style.color = sp.style.opacity = sp.style.fontWeight = '';
        ra(sp, 'data-ces-part');
      }
      for (const p of qa(doc, '.ces-ag-panel-enhanced')) p.classList?.remove?.('ces-ag-panel-enhanced');
      for (const attr of ['data-ces-model-selected', 'data-ag-cs-model-submenu', 'data-ag-cs-orch-l2', 'data-ag-cs-orch-l3', 'data-ces-orch-row', 'data-ces-orch-b', 'data-ces-orch-tunable']) {
        for (const it of qa(doc, `[${attr}]`)) ra(it, attr);
      }
      ra(doc.documentElement, 'data-ces-slider-ready');
    }

    function setHideCss(hidden) {
      const doc = gD();
      if (!doc || typeof doc.getElementById !== 'function') return;
      const ex = doc.getElementById(HIDE_STYLE_ID);
      if (!hidden) { ex?.remove?.(); return; }
      if (ex) { if (ex.textContent !== HIDE_CSS_TEXT) ex.textContent = HIDE_CSS_TEXT; return; }
      if (doc.head || doc.documentElement) {
        const st = doc.createElement('style');
        st.id = HIDE_STYLE_ID;
        st.textContent = HIDE_CSS_TEXT;
        (doc.head || doc.documentElement).appendChild(st);
      }
    }

    function stopInst() {
      const w = gW(), d = gD();
      if (inst) {
        try { inst.stop(); } catch {}
        if (w && w.__agCodexEffortSliderInstance === inst) delete w.__agCodexEffortSliderInstance;
        inst = null;
      }
      if (w && w.__agCodexEffortSliderInstance && w.__agCodexEffortSliderInstance.__prismOwned) {
        try { w.__agCodexEffortSliderInstance.stop?.(); } catch {}
        delete w.__agCodexEffortSliderInstance;
      }
      clrTint(d);
      const st = d?.getElementById?.(SLIDER_STYLE_ID);
      if (st && st.getAttribute(PRISM_OWNER_ATTR) === '1') st.remove();
    }

    function stopMemGuard() {
      if (memGuard) {
        try { memGuard.stop(); } catch {}
        memGuard = null;
      }
    }

    function mountMemGuard() {
      const w = gW(), d = gD();
      if (!w || !d || !d.body) return false;
      const lib = resLib(w);
      if (!lib || typeof lib.installEffortMemoryGuard !== 'function') return false;
      const BaseMO = w.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
      stopMemGuard();
      memGuard = lib.installEffortMemoryGuard({
        document: d,
        window: w,
        MutationObserver: mkThrottledMO(BaseMO, d, perfStats) || undefined,
      });
      return Boolean(memGuard);
    }

    function mountBuiltIn() {
      const w = gW(), d = gD();
      if (!w || !d || !d.body) return false;
      const lib = resLib(w);
      if (!lib || typeof lib.installCodexEffortSlider !== 'function') return false;
      const BaseMO = w.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
      const next = lib.installCodexEffortSlider({
        document: d,
        window: w,
        MutationObserver: mkThrottledMO(BaseMO, d, perfStats) || undefined,
        skipGenericMenuObserver: true,
        rememberEffort,
      });
      if (!next) return false;
      next.__prismOwned = true;
      w.__agCodexEffortSliderInstance = prismSyncRef(next);
      d.getElementById?.(SLIDER_STYLE_ID)?.setAttribute(PRISM_OWNER_ATTR, '1');
      return true;
    }

    function prismSyncRef(v) {
      inst = v;
      return v;
    }

    function sync(cfg) {
      const raw = cfg && cfg.effortSliderModule;
      mode = raw === 'on' || raw === 'off' ? raw : 'auto';
      rememberEffort = !(cfg && (cfg.effortMemory === 'off' || cfg.effortMemory === false));
      if (mode === 'off') {
        yielded = false;
        stopInst();
        clrTint(gD());
        setHideCss(true);
        if (rememberEffort) {
          if (!memGuard) mountMemGuard();
          else try { memGuard.rescan?.(); } catch {}
        } else {
          stopMemGuard();
        }
        return getState();
      }
      setHideCss(false);
      if (mode === 'auto' && hasExtInst()) {
        yielded = true;
        stopInst();
        stopMemGuard();
        try { gW()?.__agCodexEffortSliderInstance?.rescan?.(); } catch {}
        return getState();
      }
      yielded = false;
      stopMemGuard();
      syncBilingualDom(gD());
      if (!inst || hasExtInst()) {
        if (inst) stopInst();
        mountBuiltIn();
      } else {
        try { inst.setRememberEffort?.(rememberEffort); } catch {}
        try { inst.rescan?.(); } catch {}
      }
      markOwnedNoTr(gD());
      return getState();
    }

    function destroy() {
      stopInst();
      stopMemGuard();
      setHideCss(false);
      yielded = false;
    }

    function getState() {
      return {
        mode,
        rememberEffort,
        mountedPrism: Boolean(inst),
        memoryGuardActive: Boolean(memGuard),
        yieldedToExternal: Boolean(yielded || (mode === 'auto' && hasExtInst())),
        hasExternal: hasExtInst(),
        throttleMs: THROTTLE_MS,
        perfStats: { ...perfStats },
      };
    }

    return {
      THROTTLE_MS,
      normalizeEffortToken,
      parseLocalizedModelLabel,
      syncBilingualDom,
      sync,
      destroy,
      getState,
      createEffortSliderController,
    };
  }

  return createEffortSliderController();
});
;

/* ===== module: optical-suite.js ===== */
// DreamSkin Prism — Cross-Platform Obsidian Optical & Pixel Companion Runtime Orchestrator
// Runs the authentic Obsidian Prism engines (motion-engine, animated-icons, prism-rim-canvas,
// ripple-core, dual-mascot-rig, smooth-caret) across all 14 desktop clients (DSH NEXT, Antigravity,
// Cherry, Codex, ZCode, Kiro, Windsurf, Qoder, OpenCode, WorkBuddy, T3Code, VS Code, etc.).
// License: GPL-3.0-only (preserves full attribution to RMvdesi/obsidian-prism & 0DNANCY/agy-claude-style).
(function (root) {
  'use strict';
  var G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G || !G.document) return;
  var D = G.document;

  var OPTICAL_STYLE_ID = 'dreamskin-optical-suite-css';
  var MASCOT_STAGE_ATTR = 'data-dreamskin-mascot-stage';
  var RIPPLE_HOST_ATTR = 'data-dreamskin-ripple-host';
  var FALLBACK_ANCHOR_ID = 'dreamskin-mascot-fallback-anchor';

  // Full 14-client binary-verified selector coverage (DSH NEXT 2.0.24, ZCode 4.0, Codex 26.1117,
  // Cherry Studio 2.1.6/2.2.3, MiniMax Code 3.1/Design 3.0, WorkBuddy 5.5.6, OpenCode 1.18/2.x,
  // T3 Code 0.1.11, Antigravity, VS Code, Qoder, Kiro, Windsurf)
  var COMPOSER_SELECTORS = [
    '[data-composer-card]',
    '#antigravity\\.agentSidePanelInputBox > .surface-composer-card',
    '.surface-composer-card',
    '[data-testid="agent-input-box"]',
    '[data-ui="chat.composer"]',
    '[data-ui="chat.composer-floating-capsule"]',
    '#inputbar',
    '.inputbar-container',
    '[data-composer-surface-variant]',
    '[data-composer-layout]',
    '[class*="_ComposerLayoutRoot_"]',
    '[data-testid="v4-composer"] .chat-composer-input-surface > form > div:not(.absolute)',
    '[data-v4-composer-dock]',
    '[data-message-input-root]',
    '[data-testid="conversation-input-area"]',
    '[data-chat-composer-surface="true"]',
    '[data-composer-prompt-surface="true"]',
    '[data-component="session-followup-dock"]',
    '.interactive-input-part',
    '.chat-input-container',
    '[class*="composer"]:has(textarea, [contenteditable="true"])',
    '[class*="prompt"]:has(textarea, [contenteditable="true"])',
    '.composer-card',
    'form:has(textarea)',
    'form:has([contenteditable="true"])',
  ];

  var MAIN_STAGE_SELECTORS = [
    '[data-slot="main"]',
    '.agy-home',
    '[data-testid="conversation-view"]',
    '[data-main-content-body]',
    '[data-ui="chat.view"]',
    '[data-ui="agents.agent-chat-main"]',
    '[data-app-shell-focus-area="main"]',
    'main[class*="_MainContentSurface_"]',
    '[data-workspace-conversation-frame]',
    '[data-testid="chat-view"]',
    '[data-testid="conversation-shell"]',
    '[data-workspace-pane="chat"]',
    '[data-slot="sidebar-inset"]',
    '[data-panel]',
    '.part.editor',
    '#content-container',
    'main',
    '[class*="workspace"]',
  ];

  var MIRROR_CARD_SELECTORS = [
    '.dsh-quota-card',
    '[data-prism-mirror-card]',
    '[data-testid="step-plan"]',
  ];

  function resolvePaletteAttr(scheme) {
    if (scheme === 'warm-carbon' || scheme === 'gruvbox') return 'warm';
    if (scheme === 'host-native') return 'host';
    return 'obsidian';
  }

  function resolveAccentAttr(cfg) {
    var rim = cfg && (cfg.rimTone || cfg.accentMode);
    if (rim === 'cobalt' || rim === 'iris' || rim === 'amber' || rim === 'mono') return rim;
    var scheme = cfg && cfg.colorScheme;
    if (scheme === 'rose-pine' || scheme === 'catppuccin') return 'iris';
    if (scheme === 'tokyo-night' || scheme === 'nord') return 'cobalt';
    return 'follow';
  }

  // Authentic Obsidian Prism default: 'crab' = clean Clawd (left) + Purple Neko (right) matching ui-runtime.js:616 (camp: 'gemini')
  function resolveMascotConfig(cfg, appId) {
    var raw = cfg && (cfg.mascotSpec !== undefined && cfg.mascotSpec !== '' ? cfg.mascotSpec : cfg.companionStyle);
    var style = String(raw || 'crab').trim().toLowerCase();
    var defaultCamp = appId === 'codex' ? 'gpt' : 'gemini';
    if (style === 'off' || style === 'none') {
      return { mascot: 'off', camp: defaultCamp, miniPileEnabled: false };
    }
    if (style.indexOf('r:') === 0) {
      return { mascot: style, camp: defaultCamp, miniPileEnabled: style.indexOf('+m') >= 0 };
    }
    switch (style) {
      case 'crab':
      case 'dual':
      case 'clawd':
        return { mascot: 'crab', camp: 'gemini', miniPileEnabled: false };
      case 'minis':
        return { mascot: 'minis', camp: 'gemini', miniPileEnabled: true };
      case 'quad':
        return { mascot: 'quad', camp: 'gemini', miniPileEnabled: false };
      case 'quad-minis':
        return { mascot: 'quad-minis', camp: 'gemini', miniPileEnabled: true };
      case 'all':
        return { mascot: 'all', camp: 'gemini', miniPileEnabled: false };
      case 'all-minis':
        return { mascot: 'all-minis', camp: 'gemini', miniPileEnabled: true };
      case 'fox':
        return { mascot: 'r:f1,k1', camp: 'kimi', miniPileEnabled: false };
      case 'panda':
        return { mascot: 'r:p1,k1', camp: 'panda', miniPileEnabled: false };
      case 'whale':
      case 'deepy':
        return { mascot: 'r:w1,k1', camp: 'deepseek', miniPileEnabled: false };
      case 'dragon':
        return { mascot: 'r:d1,c1', camp: 'gpt', miniPileEnabled: false };
      case 'neko':
        return { mascot: 'r:k1', camp: 'gemini', miniPileEnabled: false };
      case 'crabs':
        return { mascot: 'r:c1+m', camp: 'claude', miniPileEnabled: true };
      case 'orb':
        return { mascot: 'r:k1,w1', camp: 'deepseek', miniPileEnabled: false };
      default:
        return { mascot: 'crab', camp: 'gemini', miniPileEnabled: false };
    }
  }

  function buildOpticalCss() {
    return [
      '/* DreamSkin Prism — Authentic Obsidian Prism Optical & Mascot CSS (GPL-3.0-only) */',
      'html[data-ag-cs-style="1"] {',
      '  --ag-ease-out: cubic-bezier(.16,1,.3,1);',
      '  --ag-ease-standard: cubic-bezier(.2,0,0,1);',
      '  --ag-ease-spring: cubic-bezier(.34,1.4,.64,1);',
      '  --ag-cs-r-sm: 4px; --ag-cs-r-md: 6px; --ag-cs-r-lg: 12px; --ag-cs-r-pill: 999px;',
      '  --ag-prism-cobalt: #4285F4; --ag-prism-iris: #9B72CB; --ag-prism-coral: #EA4335; --ag-prism-amber: #FBBC04;',
      '  --ag-ambient-mul: 1; --ag-accent-prism-mul: 1;',
      '  --ag-prism-strength: calc(var(--ag-ambient-mul, 1) * var(--ag-accent-prism-mul, 1));',
      '  --_lm: 1;',
      '  --ag-cs-specular: rgba(255,255,255,.105);',
      '  --ag-cs-accent: #669DF6;',
      '  --ag-cs-ripple-ink: #A4B2CC;',
      '  --ag-cs-ripple-wave: #62CAFF;',
      '  --ag-cs-sb-bar: linear-gradient(#5CC6FC 0%, #3186FF 100%);',
      '  --ag-cs-sb-glow: 0 0 6px rgba(92,198,252,.42);',
      '  --ag-cs-composer-sheen: linear-gradient(172deg, rgba(255,255,255,.046) 0%, rgba(160,185,245,.014) 36%, rgba(10,11,16,.2) 100%);',
      '  --ag-cs-composer-shadow: 0 1px 2px rgba(0,0,0,.44), 0 8px 20px -6px rgba(0,0,0,.48), 0 20px 44px -14px rgba(0,0,0,.62);',
      '  --ag-cs-mono-stack: "Google Sans Code","JetBrains Mono","Cascadia Code",Consolas,ui-monospace,monospace;',
      '  --ag-cs-fvl: none; --ag-cs-ffs: "calt" 0, "liga" 0;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-palette="obsidian"][data-ag-cs-theme="light"] {',
      '  --ag-cs-specular: rgba(255,255,255,.94);',
      '  --ag-cs-accent: #2563EB;',
      '  --ag-cs-ripple-ink: #556682;',
      '  --ag-cs-ripple-wave: #2563EB;',
      '  --ag-cs-sb-bar: linear-gradient(#2563EB 0%, #4F46E5 100%);',
      '  --ag-cs-sb-glow: 0 0 6px rgba(37,99,235,.36);',
      '  --ag-cs-composer-sheen: linear-gradient(176deg, rgba(255,255,255,.96) 0%, rgba(241,246,255,.55) 100%);',
      '  --ag-cs-composer-shadow: 0 1px 3px rgba(15,23,42,.06), 0 10px 28px -6px rgba(30,58,138,.10), 0 0 0 1px rgba(15,23,42,.08);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-palette="warm"][data-ag-cs-theme="dark"] {',
      '  --ag-cs-accent: #D97757;',
      '  --ag-cs-ripple-ink: #B4AEA2;',
      '  --ag-cs-ripple-wave: #D97757;',
      '  --ag-cs-sb-bar: linear-gradient(#F0A37E 0%, #D97757 100%);',
      '  --ag-cs-sb-glow: 0 0 6px rgba(217,119,87,.42);',
      '  --ag-cs-composer-sheen: linear-gradient(172deg, rgba(255,248,236,.042) 0%, rgba(217,119,87,.014) 38%, rgba(16,15,13,.2) 100%);',
      '  --ag-cs-composer-shadow: 0 1px 2px rgba(0,0,0,.44), 0 10px 28px -6px rgba(0,0,0,.50);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-palette="warm"][data-ag-cs-theme="light"] {',
      '  --ag-cs-specular: rgba(255,255,255,.94);',
      '  --ag-cs-accent: #C25934;',
      '  --ag-cs-ripple-ink: #665C4E;',
      '  --ag-cs-ripple-wave: #C25934;',
      '  --ag-cs-sb-bar: linear-gradient(#D97757 0%, #B54D28 100%);',
      '  --ag-cs-sb-glow: 0 0 6px rgba(194,89,52,.32);',
      '  --ag-cs-composer-sheen: linear-gradient(176deg, rgba(255,255,255,.97) 0%, rgba(250,246,238,.58) 100%);',
      '  --ag-cs-composer-shadow: 0 1px 3px rgba(42,32,20,.06), 0 10px 26px -6px rgba(68,52,32,.10), 0 0 0 1px rgba(42,32,20,.075);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-accent="cobalt"] { --ag-cs-accent: #669DF6; --ag-cs-ripple-wave: #669DF6; }',
      'html[data-ag-cs-style="1"][data-ag-cs-accent="iris"] { --ag-cs-accent: #A58AF8; --ag-cs-ripple-wave: #A58AF8; }',
      'html[data-ag-cs-style="1"][data-ag-cs-accent="amber"] { --ag-cs-accent: #F2B84B; --ag-cs-ripple-wave: #F2B84B; }',
      'html[data-ag-cs-style="1"][data-ag-cs-accent="mono"] { --ag-accent-prism-mul: .36; --ag-cs-accent: #D4D7E0; --ag-cs-ripple-wave: #CBD5E1; }',
      'html[data-ag-cs-style="1"][data-ag-cs-corners="sharp"] { --ag-cs-r-sm: 2px; --ag-cs-r-md: 4px; --ag-cs-r-lg: 8px; }',
      'html[data-ag-cs-style="1"][data-ag-cs-corners="balanced"] { --ag-cs-r-sm: 4px; --ag-cs-r-md: 6px; --ag-cs-r-lg: 12px; }',
      'html[data-ag-cs-style="1"][data-ag-cs-corners="soft"] { --ag-cs-r-sm: 6px; --ag-cs-r-md: 10px; --ag-cs-r-lg: 18px; }',
      'html[data-ag-cs-style="1"][data-ag-cs-code-font="jetbrains"] { --ag-cs-mono-stack: "JetBrains Mono","Cascadia Code",Consolas,ui-monospace,monospace; }',
      'html[data-ag-cs-style="1"][data-ag-cs-code-font="cascadia"] { --ag-cs-mono-stack: "Cascadia Code","Cascadia Mono",Consolas,ui-monospace,monospace; }',
      'html[data-ag-cs-style="1"][data-ag-cs-code-font="sfmono"] { --ag-cs-mono-stack: "SF Mono",SFMono-Regular,Menlo,Monaco,Consolas,ui-monospace,monospace; }',
      'html[data-ag-cs-style="1"][data-ag-cs-font-style="editorial"] body { font-family: "Newsreader","Songti SC","Noto Serif SC",Georgia,serif; }',
      'html[data-ag-cs-style="1"][data-ag-cs-font-style="mono"] body { font-family: var(--ag-cs-mono-stack); }',
      'html[data-ag-cs-style="1"][data-ag-cs-ligatures="1"] { --ag-cs-fvl: contextual common-ligatures; --ag-cs-ffs: "calt" 1, "liga" 1; }',
      'html[data-ag-cs-style="1"] :is(pre, code, .md-code-block) { font-family: var(--ag-cs-mono-stack) !important; font-variant-ligatures: var(--ag-cs-fvl); font-feature-settings: var(--ag-cs-ffs); }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0"] { --ag-ambient-mul: 0; --ag-prism-strength: 0; }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0"] :is(.ag-cs-brand-glow, .ag-cs-ripple-canvas, .ag-cs-prism-rim-cv) { opacity: 0 !important; visibility: hidden !important; }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0.35"] { --ag-ambient-mul: .45; }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0.35"] :is(.ag-cs-brand-glow, .ag-cs-ripple-canvas) { opacity: .42; }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0.7"] { --ag-ambient-mul: .78; }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0.7"] :is(.ag-cs-brand-glow, .ag-cs-ripple-canvas) { opacity: .75; }',
      '',
      '/* Full-Viewport WebGL2 Brand Horizon Glow + Interactive ASCII Character Matrix Field (Refined Obsidian Atmosphere) */',
      '.ag-cs-ripple-host {',
      '  position: absolute !important; inset: 0 !important; z-index: 0 !important;',
      '  overflow: hidden !important; pointer-events: none !important; contain: layout style paint;',
      '  border-radius: inherit;',
      '  transition: opacity 260ms ease;',
      '}',
      '.ag-cs-brand-glow {',
      '  position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;',
      '  display: block !important; pointer-events: none !important; z-index: 0 !important;',
      '  transition: filter 220ms ease, opacity 220ms ease;',
      '}',
      '.ag-cs-ripple-canvas {',
      '  position: relative !important; display: block !important; pointer-events: none !important; z-index: 1 !important;',
      '  transition: filter 220ms ease, opacity 220ms ease;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-vividness="soft"] :is(.ag-cs-brand-glow, .ag-cs-ripple-canvas) {',
      '  opacity: 0.72; filter: saturate(0.92);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-vividness="balanced"] .ag-cs-brand-glow {',
      '  filter: saturate(1.06);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-vividness="vivid"] .ag-cs-brand-glow {',
      '  filter: saturate(1.30) contrast(1.04) brightness(1.08);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-vividness="vivid"] .ag-cs-ripple-canvas {',
      '  filter: saturate(1.22) brightness(1.06);',
      '}',
      '[data-dreamskin-ripple-parent="1"] {',
      '  position: relative !important; isolation: isolate !important;',
      '}',
      '[data-dreamskin-ripple-parent="1"] > :not(.ag-cs-ripple-host):not([role="dialog"]):not([role="menu"]):not([data-radix-popper-content-wrapper]):not(.agy-overlay):not([data-dreamskin-control-panel]):not([data-sidebar-right-panel]):not([data-sidebar-drawer]):not([data-conversation-composer-overlay]):not([data-plugin-detail]):not([data-slot="shell.overlay"]) {',
      '  position: relative; z-index: 1;',
      '}',
      '',
      '/* 300Hz GPU Canvas Prism Rim Light Layer */',
      '[data-ag-cs-prism-box="1"] { position: relative !important; }',
      '.surface-composer-card[data-ag-cs-prism-box="1"], [data-composer-card][data-ag-cs-prism-box="1"] {',
      '  position: relative !important; overflow: visible !important;',
      '  border-radius: var(--ag-cs-r-lg, 12px) !important;',
      '  box-shadow: inset 0 1px 0 var(--ag-cs-specular), var(--ag-cs-composer-shadow) !important;',
      '}',
      '.surface-composer-card > .ag-cs-prism-rim-cv, [data-composer-card] > .ag-cs-prism-rim-cv, [data-ag-cs-prism-box="1"] > .ag-cs-prism-rim-cv {',
      '  position: absolute !important; inset: -1px !important;',
      '  width: calc(100% + 2px) !important; height: calc(100% + 2px) !important;',
      '  box-sizing: border-box !important; border-radius: inherit !important;',
      '  pointer-events: none !important; z-index: 7 !important;',
      '  opacity: calc(var(--ag-prism-strength, 1) * var(--_lm, 1));',
      '  transition: opacity 220ms ease;',
      '}',
      '[data-ag-cs-prism-mirror="1"] > .ag-cs-prism-rim-cv {',
      '  inset: 0 !important; width: 100% !important; height: 100% !important; z-index: 4 !important;',
      '}',
      '',
      '/* Authentic Obsidian Prism Dual/Quad + Mini-Crab Mascot Stage (APPENDED LAST, z-index 30 above composer border!) */',
      '.ag-cs-crab.ag-cs-dual-stage, .ag-cs-dual-stage {',
      '  position: absolute !important; left: 0 !important; right: 0 !important; width: auto !important;',
      '  bottom: calc(100% - 9px) !important; height: 84px !important; z-index: 30 !important; contain: layout style;',
      '  visibility: visible !important; pointer-events: none !important; user-select: none !important; overflow: visible !important;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mascot-actor {',
      '  position: absolute; left: 0; bottom: 0; width: 96px; height: 84px;',
      '  pointer-events: auto; cursor: grab; touch-action: none;',
      '  transition: transform 220ms cubic-bezier(.22,1,.36,1); outline: none;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mascot-actor::after {',
      '  content: ""; position: absolute; left: 50%; bottom: 5px; width: 44px; height: 8px;',
      '  transform: translateX(-50%); border-radius: 999px;',
      '  background: radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.42) 0%, rgba(0,0,0,.16) 58%, transparent);',
      '  pointer-events: none; z-index: 0;',
      '}',
      'html[data-ag-cs-theme="light"] .ag-cs-dual-stage .ag-v2-mascot-actor::after {',
      '  background: radial-gradient(50% 50% at 50% 50%, rgba(15,23,42,.20) 0%, rgba(15,23,42,.07) 58%, transparent);',
      '}',
      '.ag-cs-dual-stage .ag-v2-mascot-actor:active, .ag-cs-dual-stage .ag-v2-mascot-actor[data-direct="1"] {',
      '  transition: none !important; will-change: transform;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mascot-actor:active, .ag-cs-dual-stage .ag-v2-mascot-actor[data-dragging="1"] {',
      '  cursor: grabbing !important;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mascot-canvas {',
      '  position: relative; z-index: 1; width: 96px; height: 84px; display: block;',
      '  image-rendering: pixelated; pointer-events: none;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mini-pile {',
      '  position: absolute; left: 12px; bottom: 3px; height: 32px;',
      '  display: none; align-items: flex-end; pointer-events: none; z-index: 25;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mini-crab-canvas {',
      '  position: absolute; left: 0; bottom: 0; width: 40px; height: 32px;',
      '  image-rendering: pixelated; pointer-events: auto; cursor: grab;',
      '  transition: transform 160ms steps(2,end);',
      '}',
      '.ag-cs-dual-stage .ag-v2-mini-crab-canvas:active, .ag-cs-dual-stage .ag-v2-mini-crab-canvas[data-direct="1"] {',
      '  transition: none !important; will-change: transform;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mini-crab-canvas:active, .ag-cs-dual-stage .ag-v2-mini-crab-canvas[data-dragging="1"] {',
      '  cursor: grabbing !important;',
      '}',
      '#' + FALLBACK_ANCHOR_ID + ' {',
      '  position: fixed; left: 50%; bottom: 10px; transform: translateX(-50%);',
      '  width: min(560px, 72vw); height: 2px; z-index: 2147483000; pointer-events: none; overflow: visible;',
      '}',
      '',
      '/* Smooth Fluid Typing Caret */',
      '.ag-cs-smooth-caret {',
      '  position: absolute; top: 0; left: 0; width: 2px; height: 20px; border-radius: 1px;',
      '  background: var(--ag-cs-accent, #669DF6);',
      '  box-shadow: 0 0 8px color-mix(in srgb, var(--ag-cs-accent, #669DF6) 60%, transparent);',
      '  pointer-events: none; z-index: 12; opacity: 0; visibility: hidden;',
      '  transition: transform 55ms cubic-bezier(.22,1,.36,1), opacity 70ms ease;',
      '}',
      '.ag-cs-smooth-caret[data-ag-cs-caret-visible="1"] {',
      '  opacity: 1; visibility: visible; will-change: transform;',
      '  animation: ag-cs-caret-blink 1.05s step-end infinite;',
      '}',
      '.ag-cs-smooth-caret[data-ag-cs-caret-visible="1"][data-ag-cs-caret-typing="1"] { animation: none; opacity: 1; }',
      '[contenteditable="true"][data-ag-cs-smooth-caret="1"] { caret-color: transparent !important; }',
      '@keyframes ag-cs-caret-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }',
      '',
      '/* Task Running / AI Streaming State (1:1 Obsidian Prism Sidebar Orbit, Rainbow Bar, Cancel Ring, Thought Comet & Sonar) */',
      '@keyframes ag-stream-shimmer { 0% { background-position: 0% 50%; opacity: 0.72; } 50% { background-position: 100% 50%; opacity: 1; } 100% { background-position: 0% 50%; opacity: 0.72; } }',
      '@keyframes ag-cs-orbit-spin { to { transform: rotate(360deg); } }',
      '@keyframes ag-st-p { 0%, 100% { transform: scale(.82); opacity: .78; } 50% { transform: scale(1.16); opacity: 1; } }',
      '@keyframes ag-cs-comet-tip { 0%, 100% { opacity: .76; transform: scaleY(.92); } 50% { opacity: 1; transform: scaleY(1.14); } }',
      '@keyframes ag-cs-stream-chunk { from { opacity: 0; transform: translate3d(0, 3px, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }',
      '@keyframes ag-cs-sonar-pulse { 0% { box-shadow: 0 0 0 0 rgba(92,198,252,0); background-color: rgba(92,198,252,0); } 24% { box-shadow: 0 0 0 1.2px rgba(92,198,252,.52), 0 0 22px -4px rgba(92,198,252,.28); background-color: rgba(92,198,252,.07); } 100% { box-shadow: 0 0 0 1.2px rgba(92,198,252,0); background-color: rgba(92,198,252,0); } }',
      '@keyframes ag-cs-liftoff-ring { 0% { opacity: 0; transform: translate3d(0,4px,0) scale(.28); } 22% { opacity: .9; } 100% { opacity: 0; transform: translate3d(0,-14px,0) scale(2.2); } }',
      'html[data-ag-cs-style="1"] {',
      '  --ag-cs-run-core: #0F131D; --ag-cs-run-star: #DCEEFF; --ag-cs-run-rs: 0 0 5px rgba(92,198,252,.78);',
      '  --ag-cs-run-wash: linear-gradient(90deg, rgba(49,134,255,.13) 0%, rgba(92,198,252,.045) 55%, transparent);',
      '  --ag-cs-run-rb: linear-gradient(#FBBC04 0%, #EA4335 16%, #9B72CB 34%, #5CC6FC 58%, #3186FF 100%);',
      '  --ag-cs-run-rr: conic-gradient(#1B49B2 0deg, #3186FF 150deg, #5CC6FC 232deg, #9B72CB 276deg, #EA4335 308deg, #FBBC04 334deg, #EAF4FF 350deg, #1B49B2 360deg);',
      '  --ag-cs-run-ro: 0 0 7px rgba(49,134,255,.32);',
      '  --ag-cs-cancel-bg: #121319; --ag-cs-cancel-core: radial-gradient(120% 120% at 50% 0%, #1C1E28 0%, #101117 100%);',
      '  --ag-cs-cancel-sq: #F4F5F8; --ag-cs-cancel-ring: conic-gradient(#4285F4 0deg, #9B72CB 95deg, #EA4335 185deg, #FBBC04 275deg, #34A853 325deg, #4285F4 360deg);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-theme="light"] {',
      '  --ag-cs-run-core: #FFFFFF; --ag-cs-run-star: #2563EB; --ag-cs-run-rs: 0 0 6px rgba(37,99,235,.65);',
      '  --ag-cs-run-wash: linear-gradient(90deg, rgba(37,99,235,.10) 0%, rgba(124,58,237,.045) 55%, transparent);',
      '  --ag-cs-run-rb: linear-gradient(#D97706 0%, #EA4335 28%, #7C3AED 62%, #2563EB 100%);',
      '  --ag-cs-run-rr: conic-gradient(#2563EB 0deg, #7C3AED 108deg, #EA4335 212deg, #D97706 304deg, #2563EB 360deg);',
      '  --ag-cs-run-ro: 0 1px 3px rgba(15,23,42,.10), 0 0 8px rgba(37,99,235,.24);',
      '  --ag-cs-cancel-bg: #FFFFFF; --ag-cs-cancel-core: radial-gradient(120% 120% at 50% 0%, #FFFFFF 0%, #EEF3FA 100%);',
      '  --ag-cs-cancel-sq: #0F172A;',
      '}',
      '/* Original 16x16 Orbital Prism Spinner (sidebar & task rows) */',
      'html[data-ag-cs-style="1"] :is([data-testid="status-loading-spinner"], .ag-cs-orbit-spinner) {',
      '  contain: strict; width: 16px !important; height: 16px !important; min-width: 16px !important;',
      '  border-radius: 999px !important; position: relative !important;',
      '  display: inline-flex !important; align-items: center !important; justify-content: center !important;',
      '  overflow: hidden !important; background: var(--ag-cs-run-core) !important;',
      '  box-shadow: var(--ag-cs-run-ro) !important; flex-shrink: 0 !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-ag-cs-row-running="1"] > .ag-cs-orbit-spinner {',
      '  position: absolute !important; right: 10px !important; top: 50% !important; margin-top: -8px !important;',
      '  z-index: 4 !important; pointer-events: none !important;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="status-loading-spinner"], .ag-cs-orbit-spinner)::before {',
      '  content: ""; position: absolute; inset: -38%; background: var(--ag-cs-run-rr);',
      '  will-change: transform; animation: ag-cs-orbit-spin 2.4s steps(36) infinite; pointer-events: none;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="status-loading-spinner"], .ag-cs-orbit-spinner)::after {',
      '  content: ""; position: absolute; inset: 1.75px; border-radius: 999px;',
      '  background: var(--ag-cs-run-core); z-index: 1; pointer-events: none;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="status-loading-spinner"], .ag-cs-orbit-spinner) [data-agent-state-dot]:first-child {',
      '  display: block !important; position: relative !important; z-index: 2 !important;',
      '  width: 4px !important; height: 4px !important; border-radius: 999px !important;',
      '  background: var(--ag-cs-run-star) !important; box-shadow: var(--ag-cs-run-rs) !important;',
      '  will-change: transform, opacity; animation: ag-st-p 2.2s steps(22) infinite !important;',
      '}',
      '/* Original Sidebar Running Row: Rainbow Vertical Bar + Soft Blue Wash */',
      'html[data-ag-cs-style="1"] [data-ag-cs-row-running="1"] {',
      '  position: relative !important; border-radius: var(--ag-cs-r-md, 7px) !important;',
      '  background-image: var(--ag-cs-run-wash) !important;',
      '  padding-right: 34px !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-ag-cs-row-running="1"]::before {',
      '  content: "" !important; display: block !important; position: absolute !important;',
      '  left: 3px !important; top: 7px !important; bottom: 7px !important; width: 2.5px !important;',
      '  border-radius: 999px !important; background: var(--ag-cs-run-rb) !important;',
      '  box-shadow: 0 0 8px rgba(49,134,255,.45) !important; pointer-events: none !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-ag-cs-row-running="1"]::after { display: none !important; }',
      'html[data-ag-cs-style="1"] [data-ag-cs-sonar="1"] { animation: ag-cs-sonar-pulse 720ms ease-out forwards !important; }',
      '/* Original Rotating Prism Cancel / Stop Orb Button */',
      'html[data-ag-cs-style="1"] :is([data-testid="input-cancel-button"], .comp-send[data-streaming="1"]) {',
      '  position: relative !important; overflow: hidden !important;',
      '  background-color: var(--ag-cs-cancel-bg) !important; background-image: none !important;',
      '  box-shadow: 0 0 12px -2px rgba(66,133,244,.44), 0 2px 6px rgba(0,0,0,.4) !important;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="input-cancel-button"], .comp-send[data-streaming="1"])::before {',
      '  content: ""; position: absolute; inset: -38%; background: var(--ag-cs-cancel-ring);',
      '  will-change: transform; animation: ag-cs-orbit-spin 1.9s steps(38) infinite; pointer-events: none;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="input-cancel-button"], .comp-send[data-streaming="1"])::after {',
      '  content: ""; position: absolute; inset: 2px; border-radius: 999px;',
      '  background: var(--ag-cs-cancel-core); z-index: 1; pointer-events: none;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="input-cancel-button"], .comp-send[data-streaming="1"]) > :is(div, span) {',
      '  position: relative !important; z-index: 2 !important; display: block !important;',
      '  width: 8.5px !important; height: 8.5px !important; border-radius: 2.2px !important;',
      '  background-color: var(--ag-cs-cancel-sq) !important;',
      '  box-shadow: 0 0 6px rgba(255,255,255,.32) !important;',
      '}',
      '/* Streaming Composer Top Prism Shimmer + Thought Comet Tip + Stream Chunk */',
      'html[data-ag-cs-style="1"][data-ag-cs-streaming="1"] :is([data-composer-card], .surface-composer-card, [data-testid="agent-input-box"]) {',
      '  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ag-cs-accent, #669DF6) 46%, transparent), 0 10px 34px -8px color-mix(in srgb, var(--ag-cs-accent, #669DF6) 32%, transparent) !important;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-streaming="1"][data-ag-cs-motion!="off"] :is([data-composer-card], .surface-composer-card, [data-testid="agent-input-box"])::before {',
      '  content: ""; position: absolute; left: 14px; right: 14px; top: 0; height: 2px; border-radius: 999px; pointer-events: none; z-index: 26;',
      '  background: linear-gradient(90deg, transparent 0%, #64D2FF 22%, #6EA8FF 48%, #A78BFA 74%, transparent 100%);',
      '  background-size: 220% 100%; animation: ag-stream-shimmer 2.1s linear infinite;',
      '}',
      'html[data-ag-cs-style="1"] [data-ag-cs-thought-streaming="1"] {',
      '  position: relative !important; padding-left: 12px !important;',
      '  border-left: 1.5px solid rgba(92,198,252,.28) !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-ag-cs-thought-streaming="1"]::after {',
      '  content: "" !important; position: absolute !important; left: -2.25px !important; bottom: 2px !important;',
      '  width: 3.5px !important; height: 11px !important; border-radius: 999px !important;',
      '  background: #7CE2FF !important; box-shadow: 0 0 8px rgba(92,198,252,.85) !important;',
      '  animation: ag-cs-comet-tip 1.1s steps(18) infinite; pointer-events: none;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-theme="light"] [data-ag-cs-thought-streaming="1"] {',
      '  border-left-color: rgba(37,99,235,.32) !important;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-theme="light"] [data-ag-cs-thought-streaming="1"]::after {',
      '  background: #2563EB !important; box-shadow: 0 0 8px rgba(37,99,235,.55) !important;',
      '}',
      '.ag-cs-stream-chunk { animation: ag-cs-stream-chunk 280ms cubic-bezier(.22,1,.36,1) both; }',
      '.ag-cs-liftoff-ring {',
      '  position: fixed; width: 240px; height: 240px; margin: -120px 0 0 -120px; border-radius: 50%; pointer-events: none; z-index: 90;',
      '  background: conic-gradient(from 180deg, rgba(66,133,244,.65), rgba(155,114,203,.58), rgba(234,67,53,.50), rgba(251,188,4,.56), rgba(92,198,252,.66), rgba(66,133,244,.65));',
      '  -webkit-mask-image: radial-gradient(closest-side, transparent 62%, rgba(0,0,0,.95) 78%, transparent 94%);',
      '  mask-image: radial-gradient(closest-side, transparent 62%, rgba(0,0,0,.95) 78%, transparent 94%);',
      '  animation: ag-cs-liftoff-ring 520ms cubic-bezier(.16,1,.3,1) forwards;',
      '}',
      '',
      '/* Smoked Obsidian Silky Sidebar Rows & Active Bar (All 14 Clients — binary-verified 2026 selectors) */',
      'html[data-ag-cs-style="1"] :is([data-row-key^="session:"], [data-testid="conversation-row-sidebar"], [data-app-action-sidebar-thread-row], [data-testid="agent-session-row"], [data-purpose-section-list], [data-thread-item], [data-sidebar-row], .monaco-list-row) {',
      '  transition: background-color 180ms cubic-bezier(.22,1,.36,1), color 150ms ease, transform 160ms cubic-bezier(.22,1,.36,1), box-shadow 180ms ease;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-motion!="off"] :is([data-row-key^="session:"], [data-testid="conversation-row-sidebar"], [data-app-action-sidebar-thread-row], [data-testid="agent-session-row"], [data-thread-item]):active {',
      '  transform: scale(0.985);',
      '}',
      '@keyframes ag-sb-bar-in { from { transform: scaleY(0.25); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }',
      'html[data-ag-cs-style="1"][data-prism-optical-facet="on"] :is([data-row-key^="session:"][aria-selected="true"], [data-row-key^="session:"][data-selected="true"], [data-testid="conversation-row-sidebar"][data-selected="true"], [data-testid="conversation-row-sidebar"][aria-selected="true"], [data-testid="conversation-row-sidebar"][data-active="true"], [data-app-action-sidebar-thread-row][aria-selected="true"], [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"], [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-active="true"], .monaco-list-row.selected, #app-sidebar [aria-selected="true"], [data-testid="agent-session-row"][aria-selected="true"], .topic-list-item.active, [data-purpose-section-list][data-active="true"], [data-thread-item][data-active="true"], [data-testid="sidebar-base-card"] [aria-selected="true"], aside a[aria-current="page"]) {',
      '  position: relative !important;',
      '}',
      'html[data-ag-cs-style="1"][data-prism-optical-facet="on"] :is([data-row-key^="session:"][aria-selected="true"], [data-row-key^="session:"][data-selected="true"], [data-testid="conversation-row-sidebar"][data-selected="true"], [data-testid="conversation-row-sidebar"][aria-selected="true"], [data-testid="conversation-row-sidebar"][data-active="true"], [data-app-action-sidebar-thread-row][aria-selected="true"], [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"], [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-active="true"], .monaco-list-row.selected, #app-sidebar [aria-selected="true"], [data-testid="agent-session-row"][aria-selected="true"], .topic-list-item.active, [data-purpose-section-list][data-active="true"], [data-thread-item][data-active="true"], [data-testid="sidebar-base-card"] [aria-selected="true"], aside a[aria-current="page"])::after {',
      '  content: ""; position: absolute; left: 4px; top: 7px; bottom: 7px; width: 2px; border-radius: 999px;',
      '  background: var(--ag-cs-sb-bar); box-shadow: var(--ag-cs-sb-glow); pointer-events: none;',
      '  transform-origin: center; animation: ag-sb-bar-in 210ms cubic-bezier(.22,1.25,.36,1) both;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-sidebar-compact="on"] :is([data-row-key^="session:"], [data-testid="conversation-row-sidebar"]) {',
      '  padding-top: 5px !important; padding-bottom: 5px !important;',
      '}',
      '/* Restrained Original Obsidian Prism Effort Slider & Luminous Quota Bars Beautification */',
      '@keyframes ag-cs-star-drift { from { background-position: 0 0, 12px 6px; } to { background-position: -42px 0, -30px 6px; } }',
      '@keyframes ag-cs-bar-gleam { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }',
      'html[data-ag-cs-style="1"] :is([data-effort-slider], [data-reasoning-effort], [aria-label*="思考"], [aria-label*="推理"], [aria-label*="Effort" i], [aria-label*="Thinking" i]) input[type="range"] {',
      '  -webkit-appearance: none !important; appearance: none !important; height: 8px !important; border-radius: 999px !important;',
      '  background: linear-gradient(90deg, rgba(77,147,248,.68) 0%, rgba(109,40,217,.74) 70%, rgba(168,85,247,.84) 100%) !important;',
      '  box-shadow: inset 0 1px 2px rgba(0,0,0,.32), inset 0 0 0 1px rgba(255,255,255,.06) !important; cursor: pointer !important;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-effort-slider], [data-reasoning-effort], [aria-label*="思考"], [aria-label*="推理"], [aria-label*="Effort" i], [aria-label*="Thinking" i]) input[type="range"]::-webkit-slider-thumb {',
      '  -webkit-appearance: none !important; appearance: none !important; width: 16px !important; height: 16px !important; border-radius: 999px !important;',
      '  background: #FFFFFF !important; border: 0 !important;',
      '  box-shadow: 0 1px 5px rgba(0,0,0,.34), 0 0 0 0.5px rgba(0,0,0,.06) !important;',
      '  transition: transform 120ms cubic-bezier(.2,0,0,1) !important;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-effort-slider], [data-reasoning-effort], [aria-label*="思考"], [aria-label*="推理"], [aria-label*="Effort" i], [aria-label*="Thinking" i]) input[type="range"]::-webkit-slider-thumb:hover {',
      '  transform: scale(1.08) !important;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-slot*="quota"], [class*="quota" i], .dsh-quota-card) :is([role="progressbar"], progress, .mq-bar) {',
      '  border-radius: 999px !important; box-shadow: inset 0 1px 2px rgba(0,0,0,.48), inset 0 0 0 1px rgba(255,255,255,.07) !important;',
      '}',
      '/* Authentic Obsidian Prism Smoked-Glass Permissions / Execution Mode Menu (Antigravity + Cross-Host) */',
      'html[data-ag-cs-style="1"] [data-testid="permissions-menu"] {',
      '  padding: 6px !important; min-width: 248px !important; border-radius: 13px !important;',
      '  background-color: var(--ag-cs-menu-bg, rgba(13,14,18,.95)) !important;',
      '  border: 1px solid var(--ag-cs-border-1, rgba(218,228,255,.09)) !important;',
      '  box-shadow: inset 0 1px 0 rgba(235,243,255,.12), 0 22px 54px -14px rgba(0,0,0,.76) !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-testid="permissions-menu"] [data-testid^="permissions-preset-option-"] {',
      '  position: relative; border-radius: 8px !important; padding: 8px 10px !important; border: 0 !important;',
      '  transition: background-color 130ms ease, box-shadow 130ms ease, color 130ms ease !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-testid="permissions-menu"] [data-testid^="permissions-preset-option-"]:is(:hover, [data-highlighted]) {',
      '  background-color: rgba(218,228,255,.052) !important; box-shadow: inset 0 0 0 1px rgba(226,236,255,.06) !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-testid="permissions-menu"] [data-testid^="permissions-preset-option-"][data-ag-perm-selected="1"] {',
      '  background-color: rgba(156,192,255,.088) !important;',
      '  box-shadow: inset 0 0 0 1px rgba(196,218,255,.10), inset 0 1px 0 rgba(236,244,255,.08) !important;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-theme="light"] [data-testid="permissions-menu"] [data-testid^="permissions-preset-option-"][data-ag-perm-selected="1"] {',
      '  background-color: rgba(15,23,42,.06) !important; box-shadow: inset 0 0 0 1px rgba(15,23,42,.10) !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-testid="permissions-menu"] [data-testid="permissions-default-tag"] > :is(span, button) {',
      '  background: rgba(255,255,255,.045) !important; border: 1px solid rgba(218,228,255,.09) !important;',
      '  border-radius: 999px !important; padding: 0 6px !important; height: 17px !important; font-size: 10px !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-testid="permissions-menu"] :is([data-testid="permissions-sandbox-hint"], [data-ag-perm-sandbox-sep="1"]) {',
      '  display: none !important;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-motion="off"] * {',
      '  transition-duration: 0.01ms !important; animation-duration: 0.01ms !important;',
      '}',
    ].join('\n');
  }

  // In-memory storage adapter for dual-mascot-rig (satisfies zero-host-storage privacy contract)
  var memoryStoreMap = Object.create(null);
  var memoryStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(memoryStoreMap, k) ? memoryStoreMap[k] : null; },
    setItem: function (k, v) { memoryStoreMap[k] = String(v); },
    removeItem: function (k) { delete memoryStoreMap[k]; },
  };

  function setAttrIfChanged(el, k, v) {
    if (!el || !el.setAttribute) return;
    if (el.getAttribute(k) !== String(v)) el.setAttribute(k, String(v));
  }

  function queryFirst(selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      try {
        var found = D.querySelector(selectors[i]);
        if (found) return found;
      } catch (_) {}
    }
    return null;
  }

  function createOpticalSuiteController() {
    var destroyed = false;
    var active = false;
    var lastPayload = null;
    var isDark = true;
    var motionTier = 'ultra';
    var ambientScale = 1;
    var vividness = 'balanced';
    var accentTone = 'follow';
    var paletteKey = 'obsidian';
    var lastMascotActAt = 0;
    var spaMo = null;
    var spaRescanTimer = 0;
    var lastBusyAt = 0;
    var glassOverlayActive = false;
    var scrollThrottleBound = false;
    var isStreaming = false;
    var manualStreamingOverride = null;
    var streamPollTimer = 0;
    var onScrollBusy = function () { lastBusyAt = Date.now(); };
    function isPerfBusy() { return isStreaming || (Date.now() - lastBusyAt) < 420; }

    var STREAM_DETECT_SEL = [
      'button[data-streaming="1"]',
      'button[data-testid="input-cancel-button"]',
      'button[data-testid*="stop" i]',
      'button[aria-label*="停止"]',
      'button[aria-label*="中止"]',
      'button[aria-label*="Stop generating" i]',
      'button[aria-label*="Stop response" i]',
      'button[aria-label*="Cancel generation" i]',
      '[data-testid="agent-loading"]',
      '[data-chat-streaming="1"]',
      '[data-streaming="true"]',
    ].join(', ');

    function detectHostStreaming() {
      if (manualStreamingOverride !== null) return manualStreamingOverride;
      if (D.documentElement && D.documentElement.getAttribute('data-dreamskin-streaming') === '1') return true;
      try {
        var el = D.querySelector(STREAM_DETECT_SEL);
        if (el && el.offsetParent !== null && !el.disabled) return true;
      } catch (_) {}
      return false;
    }

    var ACTIVE_SIDEBAR_ROW_SEL = [
      '[data-row-key^="session:"][aria-selected="true"]',
      '[data-row-key^="session:"][data-selected="true"]',
      '[data-testid="conversation-row-sidebar"][data-selected="true"]',
      '[data-testid="conversation-row-sidebar"][aria-selected="true"]',
      '[data-testid="conversation-row-sidebar"][data-active="true"]',
      '[data-app-action-sidebar-thread-row][aria-selected="true"]',
      '[data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"]',
      '[data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-active="true"]',
      '[data-testid="agent-session-row"][aria-selected="true"]',
      '.topic-list-item.active',
      '[data-purpose-section-list][data-active="true"]',
      '[data-thread-item][data-active="true"]',
      '.monaco-list-row.selected',
      '#app-sidebar [aria-selected="true"]',
    ].join(', ');

    function syncSidebarRunningRow(running, completed) {
      if (running) {
        var activeRow = null;
        try { activeRow = D.querySelector(ACTIVE_SIDEBAR_ROW_SEL); } catch (_) {}
        if (!activeRow) return;
        activeRow.setAttribute('data-ag-cs-row-running', '1');
        activeRow.removeAttribute('data-ag-cs-sonar');
        if (!activeRow.querySelector('.ag-cs-orbit-spinner, [data-testid="status-loading-spinner"]')) {
          var sp = D.createElement('span');
          sp.className = 'ag-cs-orbit-spinner';
          sp.setAttribute('data-testid', 'status-loading-spinner');
          sp.setAttribute('data-dreamskin-injected', '1');
          sp.setAttribute('aria-hidden', 'true');
          var dot = D.createElement('span');
          dot.setAttribute('data-agent-state-dot', '1');
          sp.appendChild(dot);
          activeRow.appendChild(sp);
        }
      } else {
        var rows = D.querySelectorAll('[data-ag-cs-row-running="1"]');
        for (var i = 0; i < rows.length; i += 1) {
          rows[i].removeAttribute('data-ag-cs-row-running');
          var oldSp = rows[i].querySelector('.ag-cs-orbit-spinner[data-dreamskin-injected="1"]');
          if (oldSp && oldSp.parentNode) oldSp.parentNode.removeChild(oldSp);
          if (completed) {
            rows[i].setAttribute('data-ag-cs-sonar', '1');
            (function (rEl) {
              setTimeout(function () { try { rEl.removeAttribute('data-ag-cs-sonar'); } catch (_) {} }, 760);
            })(rows[i]);
          }
        }
      }
    }

    function setStreamingState(nextRunning, opts) {
      var o = opts && typeof opts === 'object' ? opts : {};
      if (o.manual === true) manualStreamingOverride = Boolean(nextRunning);
      else if (o.manual === false) manualStreamingOverride = null;
      var next = Boolean(nextRunning);
      var prev = isStreaming;
      isStreaming = next;
      if (D.documentElement) {
        if (next) setAttrIfChanged(D.documentElement, 'data-ag-cs-streaming', '1');
        else if (D.documentElement.hasAttribute('data-ag-cs-streaming')) D.documentElement.removeAttribute('data-ag-cs-streaming');
      }
      syncSidebarRunningRow(next, prev && !next && !o.hasError && !o.silent);
      if (next) {
        lastBusyAt = Date.now();
        if (!prev) {
          notifyMascotSafe('activity', {});
          notifyMascotSafe('send', {});
        }
      }
      if (mascotRig && typeof mascotRig.setState === 'function') {
        try {
          mascotRig.setState({
            streaming: next,
            streamTier: Number(o.tier || 2),
            hasError: Boolean(o.hasError),
          });
        } catch (_) {}
      }
      if (prev && !next && !o.hasError && !o.silent) {
        notifyMascotSafe('complete', {});
      }
      return isStreaming;
    }

    function resolveCampFromModel(name) {
      var s = String(name || '').toLowerCase();
      if (!s) return null;
      if (s.indexOf('claude') >= 0 || s.indexOf('sonnet') >= 0 || s.indexOf('opus') >= 0 || s.indexOf('haiku') >= 0) return 'claude';
      if (s.indexOf('deepseek') >= 0) return 'deepseek';
      if (s.indexOf('kimi') >= 0 || s.indexOf('qwen') >= 0 || s.indexOf('moonshot') >= 0) return 'kimi';
      if (s.indexOf('glm') >= 0 || s.indexOf('minimax') >= 0 || s.indexOf('doubao') >= 0 || s.indexOf('panda') >= 0) return 'panda';
      if (s.indexOf('gpt') >= 0 || s.indexOf('codex') >= 0 || s.indexOf('o1') >= 0 || s.indexOf('o3') >= 0) return 'gpt';
      if (s.indexOf('gemini') >= 0) return 'gemini';
      return null;
    }

    function setCamp(modelOrCamp) {
      var c = resolveCampFromModel(modelOrCamp) || String(modelOrCamp || '').toLowerCase();
      if (!c || !mascotRig || typeof mascotRig.setState !== 'function') return false;
      try {
        mascotRig.setState({ camp: c });
        notifyMascotSafe('campSwitch', { camp: c });
        return true;
      } catch (_) { return false; }
    }

    function pollStreamingState() {
      if (destroyed || !active || D.hidden) return;
      var detected = detectHostStreaming();
      if (detected !== isStreaming) {
        setStreamingState(detected, {});
      }
    }

    function notifyMascotSafe(eventName, payload) {
      if (!mascotRig || typeof mascotRig.notify !== 'function') return;
      try {
        mascotRig.notify(eventName, payload || {});
        if (eventName === 'activity' && typeof mascotRig.syncPowerState === 'function') {
          mascotRig.syncPowerState();
        }
      } catch (_) {}
    }

    var rimCtl = null;
    var rimPointerBound = false;
    var userMovedPointer = false;
    var idleRimTimer = 0;

    var mascotRig = null;
    var mascotStageEl = null;
    var mascotHostEl = null;
    var mascotSig = '';
    var inputCleanup = null;

    var motionBinding = null;
    var caretCtl = null;
    var caretBoundCleanups = [];

    var rippleHostEl = null;
    var rippleParentEl = null;
    var rippleGlow = null;
    var rippleField = null;
    var rippleWaves = null;
    var rippleCanvas = null;
    var rippleGlowCanvas = null;
    var rippleRaf = 0;
    var rippleRo = null;
    var rippleCleanups = [];
    var rippleState = {
      width: 0,
      height: 0,
      dpr: 1,
      aura: { x: 0, y: 0, active: false },
      lastMoveAt: 0,
      prevMs: 0,
      lx: null,
      ly: null,
      carry: 0,
      opacity: 1,
    };

    var domRescanTimer = 0;

    function ensureOpticalStyle() {
      var head = D.head || D.documentElement;
      if (!head) return;
      var el = D.getElementById(OPTICAL_STYLE_ID);
      if (!el) {
        el = D.createElement('style');
        el.id = OPTICAL_STYLE_ID;
        head.appendChild(el);
      }
      var css = buildOpticalCss();
      if (el.textContent !== css) el.textContent = css;
    }

    function removeOpticalStyle() {
      var el = D.getElementById(OPTICAL_STYLE_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    // ── 1. Prism Rim 300Hz GPU Canvas Controller ────────────────────────────
    var onGlobalPointerMove = function (ev) {
      if (!rimCtl) return;
      userMovedPointer = true;
      rimCtl.onPointerMove(ev);
    };

    function tagPrismBoxes(enable) {
      var composer = queryFirst(COMPOSER_SELECTORS);
      var mirrors = [];
      for (var i = 0; i < MIRROR_CARD_SELECTORS.length; i += 1) {
        try {
          var found = D.querySelectorAll(MIRROR_CARD_SELECTORS[i]);
          for (var j = 0; j < found.length; j += 1) mirrors.push(found[j]);
        } catch (_) {}
      }

      if (!enable) {
        var tagged = D.querySelectorAll('[data-dreamskin-prism-tagged="1"]');
        for (var k = 0; k < tagged.length; k += 1) {
          tagged[k].removeAttribute('data-ag-cs-prism-box');
          tagged[k].removeAttribute('data-ag-cs-prism-mirror');
          tagged[k].removeAttribute('data-dreamskin-prism-tagged');
        }
        return null;
      }

      if (composer) {
        setAttrIfChanged(composer, 'data-ag-cs-prism-box', '1');
        setAttrIfChanged(composer, 'data-dreamskin-prism-tagged', '1');
        if (composer.classList && !composer.classList.contains('surface-composer-card')) {
          composer.classList.add('surface-composer-card');
          setAttrIfChanged(composer, 'data-dreamskin-added-composer-cls', '1');
        }
      }
      for (var m = 0; m < mirrors.length; m += 1) {
        setAttrIfChanged(mirrors[m], 'data-ag-cs-prism-box', '1');
        setAttrIfChanged(mirrors[m], 'data-ag-cs-prism-mirror', '1');
        setAttrIfChanged(mirrors[m], 'data-dreamskin-prism-tagged', '1');
      }
      return composer;
    }

    function seedAmbientComposerRim(composer) {
      if (!rimCtl || !composer || userMovedPointer) return;
      try {
        var r = composer.getBoundingClientRect();
        if (r && r.width > 40 && r.height > 20) {
          rimCtl.onPointerMove({ clientX: r.left + r.width * 0.28, clientY: r.top + 2 });
        }
      } catch (_) {}
    }

    function teardownRim() {
      if (idleRimTimer) { clearTimeout(idleRimTimer); idleRimTimer = 0; }
      if (rimPointerBound) {
        G.removeEventListener('pointermove', onGlobalPointerMove);
        rimPointerBound = false;
      }
      if (rimCtl) {
        try { rimCtl.teardown(); } catch (_) {}
        rimCtl = null;
      }
      tagPrismBoxes(false);
    }

    function syncRim(enable) {
      var mod = G.__agPrismRimCanvas;
      if (!enable || !mod || typeof mod.createPrismRimCanvasController !== 'function') {
        teardownRim();
        return;
      }
      var composer = tagPrismBoxes(true);
      if (!rimCtl) {
        rimCtl = mod.createPrismRimCanvasController({
          isDestroyed: function () { return destroyed || !active; },
          isDarkTheme: function () { return isDark; },
          motionReduced: function () { return motionTier === 'off'; },
          getMinFrameGapMs: function () { return isPerfBusy() ? 80 : 16; },
          getAmbientIntensity: function () { return ambientScale; },
          getAccentTone: function () { return accentTone; },
          canMountRealCanvas: function (el) { return Boolean(el && el.isConnected !== false); },
          setAttrIfChanged: setAttrIfChanged,
          runGuardedMut: function (fn) { try { fn(); } catch (_) {} },
          getActiveCrystalTrack: function () { return null; },
          setCrystalPointerClient: null,
          onPointerActivity: function () {
            var now = Date.now();
            if (now - lastMascotActAt >= 2400) {
              lastMascotActAt = now;
              notifyMascotSafe('activity', {});
            }
          },
          onComposerRimUpdate: function (info) {
            try { if (mascotRig && mascotRig.setRimLight) mascotRig.setRimLight(info); } catch (_) {}
          },
        });
      }
      if (!rimPointerBound) {
        G.addEventListener('pointermove', onGlobalPointerMove, { passive: true });
        rimPointerBound = true;
      }
      rimCtl.markDirty();
      rimCtl.invalidateMetrics();
      if (!userMovedPointer && composer) {
        if (idleRimTimer) clearTimeout(idleRimTimer);
        idleRimTimer = setTimeout(function () {
          idleRimTimer = 0;
          seedAmbientComposerRim(composer);
        }, 120);
      }
    }

    // ── 2. Real Obsidian Prism Pixel Mascot Stage (dual-mascot-rig.js) ──────
    function unbindComposerInput() {
      if (inputCleanup) {
        try { inputCleanup(); } catch (_) {}
        inputCleanup = null;
      }
    }

    function bindComposerInput(host) {
      unbindComposerInput();
      if (!host) return;
      var input = host.querySelector('textarea, [data-composer-input], [contenteditable="true"], input[type="text"]');
      if (!input) return;
      var onInput = function () {
        if (!mascotRig || !mascotRig.onUserType) return;
        var val = typeof input.value === 'string' ? input.value : (input.textContent || '');
        try { mascotRig.onUserType(val); } catch (_) {}
      };
      var onGlobalAct = function () {
        var now = Date.now();
        if (now - lastMascotActAt >= 2400) {
          lastMascotActAt = now;
          notifyMascotSafe('activity', {});
        }
      };
      input.addEventListener('input', onInput, { passive: true });
      D.addEventListener('pointerdown', onGlobalAct, { passive: true });
      D.addEventListener('keydown', onGlobalAct, { passive: true });
      inputCleanup = function () {
        try { input.removeEventListener('input', onInput); } catch (_) {}
        try { D.removeEventListener('pointerdown', onGlobalAct); } catch (_) {}
        try { D.removeEventListener('keydown', onGlobalAct); } catch (_) {}
      };
    }

    function teardownMascot() {
      unbindComposerInput();
      if (mascotRig) {
        try { mascotRig.dispose(); } catch (_) {}
        mascotRig = null;
      }
      if (mascotStageEl && mascotStageEl.parentNode) {
        mascotStageEl.parentNode.removeChild(mascotStageEl);
      }
      var fallback = D.getElementById(FALLBACK_ANCHOR_ID);
      if (fallback && fallback.parentNode) fallback.parentNode.removeChild(fallback);
      mascotStageEl = null;
      mascotHostEl = null;
      mascotSig = '';
      if (D.documentElement) D.documentElement.removeAttribute('data-ag-cs-has-crab');
    }

    function resolveMascotAnchor() {
      var composer = queryFirst(COMPOSER_SELECTORS);
      if (composer) return { host: composer, isFallback: false };
      if (!D.body) return null;
      var fb = D.getElementById(FALLBACK_ANCHOR_ID);
      if (!fb) {
        fb = D.createElement('div');
        fb.id = FALLBACK_ANCHOR_ID;
        D.body.appendChild(fb);
      }
      return { host: fb, isFallback: true };
    }

    function syncMascot(enable, cfg, appId) {
      var rigMod = G.__agDualMascotRig;
      var mCfg = resolveMascotConfig(cfg, appId);
      if (!enable || mCfg.mascot === 'off' || !rigMod || typeof rigMod.mountDualMascotStage !== 'function') {
        teardownMascot();
        return;
      }
      var anchor = resolveMascotAnchor();
      if (!anchor || !anchor.host) return;
      var targetHost = anchor.host;
      var chromaOn = Boolean(cfg && cfg.prismaticCoat);
      var nextSig = mCfg.mascot + '|' + mCfg.camp + '|' + (mCfg.miniPileEnabled ? '1' : '0') + '|ch:' + (chromaOn ? '1' : '0');

      // Sync rainbow chroma coat easter-egg state via in-memory storage before mount
      if (chromaOn) memoryStorage.setItem('__op_chroma_v1', '1');
      else memoryStorage.removeItem('__op_chroma_v1');

      if (mascotRig && mascotHostEl === targetHost && mascotStageEl && mascotStageEl.isConnected) {
        if (mascotSig !== nextSig) {
          teardownMascot();
        } else {
          if (cfg && cfg.habitatMode && typeof mascotRig.setHabitatPreview === 'function') {
            try { mascotRig.setHabitatPreview(cfg.habitatMode); } catch (_) {}
          }
          setAttrIfChanged(D.documentElement, 'data-ag-cs-has-crab', '1');
          return;
        }
      } else if (mascotRig) {
        teardownMascot();
      }

      if (!anchor.isFallback && targetHost.style) {
        var cs = typeof G.getComputedStyle === 'function' ? G.getComputedStyle(targetHost) : null;
        if (cs && cs.position === 'static') targetHost.style.position = 'relative';
        targetHost.style.overflow = 'visible';
      }

      // CRITICAL: appendChild (EXACT match to Obsidian Prism ui-runtime.js line 605) so mascots' feet
      // sit crisply IN FRONT of the composer top border — NEVER clipped behind composer background!
      var stage = D.createElement('div');
      stage.className = 'ag-cs-crab ag-cs-dual-stage';
      stage.setAttribute(MASCOT_STAGE_ATTR, '1');
      stage.setAttribute('data-mascot-stage', 'true');
      targetHost.appendChild(stage);

      mascotHostEl = targetHost;
      mascotStageEl = stage;
      mascotSig = nextSig;
      setAttrIfChanged(D.documentElement, 'data-ag-cs-has-crab', '1');

      try {
        mascotRig = rigMod.mountDualMascotStage(stage, {
          mascot: mCfg.mascot,
          camp: mCfg.camp,
          streaming: isStreaming,
          streamTier: 2,
          hasError: false,
          yieldMode: 'none',
          leapOffsetY: 0,
          popoverRightWidth: 0,
          miniPileEnabled: mCfg.miniPileEnabled,
          orchestrator: false,
          storage: memoryStorage,
          reducedMotion: motionTier === 'off',
          keepAliveWhileVisible: true,
          dozeAfterMs: 180000,
          dozeAfterNightMs: 120000,
          firstTheaterDelayMs: 2200,
        });
        bindComposerInput(targetHost);
        if (cfg && cfg.habitatMode && typeof mascotRig.setHabitatPreview === 'function') {
          try { mascotRig.setHabitatPreview(cfg.habitatMode); } catch (_) {}
        }
        // Kick off authentic idle theater & wake out of night-time doze immediately upon mount
        setTimeout(function () {
          if (!destroyed && active && mascotRig) {
            notifyMascotSafe('activity', {});
            if (rimCtl && !userMovedPointer && !anchor.isFallback) {
              seedAmbientComposerRim(targetHost);
            }
          }
        }, 140);
      } catch (_) {
        teardownMascot();
      }
    }

    // ── 3. Authentic WebGL2 Brand Horizon Glow + Interactive ASCII Character Matrix (ripple-core.js) ──
    function teardownRipple() {
      if (rippleRaf && typeof G.cancelAnimationFrame === 'function') {
        G.cancelAnimationFrame(rippleRaf);
        rippleRaf = 0;
      }
      if (rippleRo) {
        try { rippleRo.disconnect(); } catch (_) {}
        rippleRo = null;
      }
      for (var i = 0; i < rippleCleanups.length; i += 1) {
        try { rippleCleanups[i](); } catch (_) {}
      }
      rippleCleanups = [];
      try { if (rippleField && rippleField.dispose) rippleField.dispose(true); } catch (_) {}
      try { if (rippleGlow && rippleGlow.dispose) rippleGlow.dispose(true); } catch (_) {}
      if (rippleHostEl && rippleHostEl.parentNode) {
        rippleHostEl.parentNode.removeChild(rippleHostEl);
      }
      if (rippleParentEl) {
        rippleParentEl.removeAttribute('data-dreamskin-ripple-parent');
      }
      rippleHostEl = null;
      rippleParentEl = null;
      rippleGlow = null;
      rippleField = null;
      rippleWaves = null;
      rippleCanvas = null;
      rippleGlowCanvas = null;
      rippleState.width = 0;
      rippleState.height = 0;
    }

    function resolveSpectrumName() {
      if (accentTone === 'cobalt' || accentTone === 'iris' || accentTone === 'amber' || accentTone === 'mono') return accentTone;
      return paletteKey === 'warm' ? 'warm' : 'default';
    }

    function syncRipple(enable, opacity) {
      // CRITICAL FIX: ripple-core.js registers on G.__agCsRippleCore!
      var rc = G.__agCsRippleCore || G.__agPrismRipple;
      if (!enable || !rc || ambientScale <= 0.01) {
        teardownRipple();
        return;
      }
      var parent = queryFirst(MAIN_STAGE_SELECTORS) || D.body;
      if (!parent) return;

      rippleState.opacity = Math.max(0.15, Math.min(1, Number(opacity || 1)));

      if (rippleHostEl && rippleParentEl === parent && rippleHostEl.isConnected) {
        rippleHostEl.style.opacity = String(rippleState.opacity);
        if (rippleField && rippleField.invalidate) rippleField.invalidate();
        if (rippleGlow && rippleGlow.invalidate) rippleGlow.invalidate();
        return;
      }

      teardownRipple();
      rippleParentEl = parent;
      setAttrIfChanged(parent, 'data-dreamskin-ripple-parent', '1');

      var host = D.createElement('div');
      host.className = 'ag-cs-ripple-host';
      host.setAttribute(RIPPLE_HOST_ATTR, '1');
      host.setAttribute('aria-hidden', 'true');
      host.style.opacity = String(rippleState.opacity);

      var glowCv = D.createElement('canvas');
      glowCv.className = 'ag-cs-brand-glow';
      glowCv.setAttribute('aria-hidden', 'true');

      var fieldCv = D.createElement('canvas');
      fieldCv.className = 'ag-cs-ripple-canvas';
      fieldCv.setAttribute('aria-hidden', 'true');

      host.appendChild(glowCv);
      host.appendChild(fieldCv);
      parent.insertBefore(host, parent.firstChild);

      rippleHostEl = host;
      rippleGlowCanvas = glowCv;
      rippleCanvas = fieldCv;

      function layoutRipple() {
        if (!rippleParentEl || !rippleCanvas || !rippleGlowCanvas) return;
        var w = Math.max(120, rippleParentEl.clientWidth || G.innerWidth || 960);
        var h = Math.max(120, rippleParentEl.clientHeight || G.innerHeight || 680);
        // Cap DPR at 1.25 (1.0 when liquid glass blur is layered above) to cut HiDPI GPU fill-rate by 60-75%
        var maxDpr = glassOverlayActive ? 1.0 : 1.25;
        var dpr = Math.min(G.devicePixelRatio || 1, maxDpr);
        if (w === rippleState.width && h === rippleState.height && dpr === rippleState.dpr && rippleField) return;
        rippleState.width = w;
        rippleState.height = h;
        rippleState.dpr = dpr;

        var cw = rc.RIPPLE.cellWidth;
        var ch = rc.RIPPLE.cellHeight;
        var cols = Math.ceil(w / cw);
        var rows = Math.ceil(h / ch);

        rippleCanvas.width = Math.round(cols * cw * dpr);
        rippleCanvas.height = Math.round(rows * ch * dpr);
        rippleCanvas.style.width = (cols * cw) + 'px';
        rippleCanvas.style.height = (rows * ch) + 'px';

        try { if (rippleField && rippleField.dispose) rippleField.dispose(true); } catch (_) {}
        rippleWaves = rc.createWaveField(cols, rows);
        rippleField = rc.createGlyphField(rippleCanvas, cols, rows, rippleWaves, {});
        if (!rippleField || rippleField.mode === 'none') {
          rippleField = rc.createGlyphField(rippleCanvas, cols, rows, rippleWaves, { prefer2D: true });
        }

        if (!rippleGlow && typeof rc.mountBrandHorizonGlow === 'function') {
          rippleGlow = rc.mountBrandHorizonGlow(rippleGlowCanvas, {});
          if (!rippleGlow || rippleGlow.mode === 'none') {
            rippleGlow = rc.mountBrandHorizonGlow(rippleGlowCanvas, { prefer2D: true });
          }
        }
        if (rippleGlow && rippleGlow.resize) {
          rippleGlow.resize(w, h, 0.65);
        }
      }

      function readPaletteTokens() {
        var cs = typeof G.getComputedStyle === 'function' ? G.getComputedStyle(rippleCanvas) : null;
        var sp = resolveSpectrumName();
        var defWave = isDark
          ? (sp === 'warm' ? [217, 119, 87] : [214, 218, 228])
          : (sp === 'warm' ? [194, 89, 52] : [37, 99, 235]);
        var defInk = isDark ? [146, 148, 156] : [104, 114, 134];
        var ink = (cs && rc.parseCssColorToRgb(cs.getPropertyValue('--ag-cs-ripple-ink'))) || defInk;
        var wave = (cs && rc.parseCssColorToRgb(cs.getPropertyValue('--ag-cs-ripple-wave'))) || defWave;
        return { ink: ink, wave: wave, spectrum: sp };
      }

      var lastDrawAt = 0;
      function tick(now) {
        rippleRaf = 0;
        if (destroyed || !active || !rippleHostEl || !rippleHostEl.isConnected) return;
        if (D.hidden) return;
        // Streaming / scroll / glass adaptive frame pacing: silky 30fps on pointer interaction,
        // 12fps calm breathing when idle, and immediate yield during rapid scroll or AI token streaming bursts!
        var pointerActive = (now - rippleState.lastMoveAt) < 1600;
        var minGap = isPerfBusy()
          ? 240
          : glassOverlayActive
            ? (pointerActive ? 55 : 140)
            : (pointerActive ? 32 : 84);
        if (now - lastDrawAt >= minGap) {
          lastDrawAt = now;
          var dt = rippleState.prevMs ? Math.min(0.05, Math.max(0, (now - rippleState.prevMs) / 1000)) : 0.016;
          rippleState.prevMs = now;
          var still = motionTier === 'off';
          if (rippleWaves) rippleWaves.advance(still ? 0 : dt);
          var tok = readPaletteTokens();
          var auraOn = rippleState.aura.active && !still && (now - rippleState.lastMoveAt < 1800);
          if (rippleGlow && rippleGlow.draw) {
            var isMono = tok.spectrum === 'mono';
            var vPrism = vividness === 'soft' ? 0.22 : vividness === 'vivid' ? 0.78 : 0.44;
            var vReach = vividness === 'soft' ? 0.44 : vividness === 'vivid' ? 0.58 : 0.48;
            var vSpeed = vividness === 'soft' ? 0.9 : vividness === 'vivid' ? 1.25 : 1.05;
            var breathSurge = still || isMono || vividness !== 'vivid'
              ? 0
              : 0.08 + 0.08 * Math.sin(now * 0.0005);
            var horizonPrism = isMono ? 0.18 : vPrism;
            rippleGlow.draw(now, {
              dark: isDark,
              still: still,
              strength: 1,
              reach: vReach,
              prism: horizonPrism,
              surge: breathSurge,
              speed: vSpeed,
              ambientIntensity: ambientScale,
              spectrum: tok.spectrum,
            });
          }
          if (rippleField && rippleField.draw) {
            var pGain = vividness === 'soft' ? 0.78 : vividness === 'vivid' ? 1.2 : 1.0;
            rippleField.draw(now, {
              ink: tok.ink,
              wave: tok.wave,
              dark: isDark,
              fontFamily: 'ui-monospace, Consolas, monospace',
              conv: false,
              alphaScale: vividness === 'soft' ? 0.85 : 1.0,
              nebulaLiftScale: vividness === 'vivid' ? 1.16 : 1.0,
              auraLiftScale: vividness === 'vivid' ? 1.14 : 1.0,
              prismStrength: Math.min(1.25, ambientScale * (tok.spectrum === 'mono' ? 0.45 : pGain)),
              ambientIntensity: ambientScale,
              spectrum: tok.spectrum,
              aura: auraOn
                ? { x: rippleState.aura.x, y: rippleState.aura.y, radius: 230, strength: ambientScale, active: true }
                : { x: 0, y: 0, radius: 230, strength: 0, active: false },
              auraPhase: now * 0.0006,
            }, still);
          }
        }
        if (typeof G.requestAnimationFrame === 'function') {
          rippleRaf = G.requestAnimationFrame(tick);
        }
      }

      var onMove = function (ev) {
        if (!rippleCanvas || motionTier === 'off') return;
        var r = rippleCanvas.getBoundingClientRect();
        var x = ev.clientX - r.left;
        var y = ev.clientY - r.top;
        if (x < 0 || y < 0 || x > r.width || y > r.height) return;
        var now = performance.now();
        if (rippleState.lx !== null && rippleState.ly !== null && rippleWaves) {
          var dist = Math.hypot(x - rippleState.lx, y - rippleState.ly);
          var spd = dist / Math.max(0.006, (now - rippleState.lastMoveAt) / 1000);
          if (spd >= 220) {
            rippleState.carry += dist;
            if (rippleState.carry >= 42) {
              rippleState.carry = 0;
              rippleWaves.skimmer(
                Math.floor(x / rc.RIPPLE.cellWidth),
                Math.floor(y / rc.RIPPLE.cellHeight),
                Math.min(1, Math.max(0.08, (spd - 220) / 1800))
              );
            }
          }
        }
        rippleState.lx = x;
        rippleState.ly = y;
        rippleState.aura.x = x;
        rippleState.aura.y = y;
        rippleState.aura.active = true;
        rippleState.lastMoveAt = now;
        if (rippleField && rippleField.invalidate) rippleField.invalidate();
      };

      var onPress = function (ev) {
        if (ev.button !== 0 || !rippleCanvas || !rippleWaves || motionTier === 'off') return;
        var tgt = ev.target;
        if (tgt && tgt.closest && tgt.closest('button, input, textarea, select, [data-dreamskin-control-panel]')) return;
        var r = rippleCanvas.getBoundingClientRect();
        var x = ev.clientX - r.left;
        var y = ev.clientY - r.top;
        if (x < 0 || y < 0 || x > r.width || y > r.height) return;
        rippleWaves.disturb(Math.floor(x / rc.RIPPLE.cellWidth), Math.floor(y / rc.RIPPLE.cellHeight));
        if (rippleField && rippleField.invalidate) rippleField.invalidate();
        if (mascotRig && mascotHostEl) {
          try {
            var mr = mascotHostEl.getBoundingClientRect();
            notifyMascotSafe('ripple', { x: ev.clientX - mr.left });
          } catch (_) {}
        }
      };

      parent.addEventListener('pointermove', onMove, { passive: true });
      parent.addEventListener('pointerdown', onPress, { passive: true });
      rippleCleanups.push(function () {
        parent.removeEventListener('pointermove', onMove);
        parent.removeEventListener('pointerdown', onPress);
      });

      if (typeof G.ResizeObserver === 'function') {
        rippleRo = new G.ResizeObserver(function () {
          layoutRipple();
        });
        rippleRo.observe(parent);
      }

      layoutRipple();
      if (rippleField && typeof rippleField.triggerTideSwell === 'function' && motionTier !== 'off') {
        try { rippleField.triggerTideSwell(); } catch (_) {}
      }
      if (rippleWaves && motionTier !== 'off') {
        try {
          rippleWaves.disturb(
            Math.floor((rippleState.width * 0.48) / rc.RIPPLE.cellWidth),
            Math.floor((rippleState.height * 0.72) / rc.RIPPLE.cellHeight),
            { amplitudeScale: 0.9, radiusScale: 1.15 }
          );
        } catch (_) {}
      }
      if (typeof G.requestAnimationFrame === 'function') {
        rippleRaf = G.requestAnimationFrame(tick);
      }
    }

    // ── 4. 4-Tier Spring Motion Engine & Smooth Caret ───────────────────────
    function teardownMotionAndCaret() {
      if (motionBinding && motionBinding.unbind) {
        try { motionBinding.unbind(); } catch (_) {}
      }
      motionBinding = null;
      for (var i = 0; i < caretBoundCleanups.length; i += 1) {
        try { caretBoundCleanups[i](); } catch (_) {}
      }
      caretBoundCleanups = [];
      if (caretCtl && caretCtl.teardown) {
        try { caretCtl.teardown(); } catch (_) {}
      }
      caretCtl = null;
    }

    function syncMotionAndCaret(enable) {
      if (!enable || motionTier === 'off') {
        teardownMotionAndCaret();
        return;
      }
      var me = G.__agMotionEngine;
      if (me && typeof me.bindMicroInteractions === 'function' && !motionBinding) {
        motionBinding = me.bindMicroInteractions(D, { motionTier: motionTier });
      }
      var sc = G.__agPrismSmoothCaret;
      if (sc && typeof sc.createSmoothCaretController === 'function' && !caretCtl) {
        caretCtl = sc.createSmoothCaretController({
          isDestroyed: function () { return destroyed || !active; },
          isEnabled: function () { return active && motionTier !== 'off'; },
          setAttrIfChanged: setAttrIfChanged,
          runGuardedMut: function (fn) { try { fn(); } catch (_) {} },
        });
        var onSel = function () { if (caretCtl) caretCtl.queue(false, false, false, false); };
        var onType = function () { if (caretCtl) caretCtl.queue(true, false, false, false); };
        D.addEventListener('selectionchange', onSel, { passive: true });
        D.addEventListener('input', onType, { passive: true });
        D.addEventListener('focusin', onSel, { passive: true });
        D.addEventListener('focusout', onSel, { passive: true });
        caretBoundCleanups.push(function () {
          D.removeEventListener('selectionchange', onSel);
          D.removeEventListener('input', onType);
          D.removeEventListener('focusin', onSel);
          D.removeEventListener('focusout', onSel);
        });
      }
    }

    function clearRootAttrs() {
      var html = D.documentElement;
      if (!html) return;
      var keys = [
        'data-ag-cs-style',
        'data-ag-cs-theme',
        'data-ag-cs-palette',
        'data-ag-cs-accent',
        'data-ag-cs-motion',
        'data-ag-cs-ambient',
        'data-ag-cs-vividness',
        'data-ag-cs-font-style',
        'data-ag-cs-text-style',
        'data-ag-cs-corners',
        'data-ag-cs-code-font',
        'data-ag-cs-ligatures',
        'data-ag-cs-sidebar-compact',
        'data-ag-cs-has-crab',
      ];
      for (var i = 0; i < keys.length; i += 1) html.removeAttribute(keys[i]);
    }

    function detectTheme(cfg) {
      var tm = cfg && cfg.themeMode;
      if (tm === 'light') return 'light';
      if (tm === 'dark') return 'dark';
      var html = D.documentElement;
      if (html && (html.classList.contains('light') || html.getAttribute('data-theme') === 'light')) return 'light';
      return 'dark';
    }

    function apply(payload) {
      if (destroyed) return;
      lastPayload = payload || {};
      var p = lastPayload;
      if (p.skinEnabled === false) {
        teardownAll();
        return;
      }

      var cfg = (p.config && typeof p.config === 'object') ? p.config : {};
      var comp = (p.composition && typeof p.composition === 'object') ? p.composition : {};
      var eff = (comp.effectiveModules && typeof comp.effectiveModules === 'object') ? comp.effectiveModules : {};
      var skinMode = comp.skinMode || cfg.skinMode || 'wallpaper';
      var appId = (p.adapterProfile && p.adapterProfile.appId) || cfg.appId || '';

      var needOpticalCss = Boolean(eff.opticalPalette || eff.opticalFacet || eff.microMotion || eff.pixelCompanion || eff.rippleField);
      if (!needOpticalCss) {
        teardownAll();
        return;
      }

      active = true;
      var theme = detectTheme(cfg);
      isDark = theme !== 'light';
      paletteKey = resolvePaletteAttr(cfg.colorScheme || 'prism-default');
      accentTone = resolveAccentAttr(cfg);
      motionTier = eff.microMotion ? String(cfg.motionTier || 'ultra') : 'off';
      ambientScale = Number.isFinite(Number(cfg.ambientIntensity)) ? Math.max(0, Math.min(1, Number(cfg.ambientIntensity))) : 1;
      vividness = ['soft', 'balanced', 'vivid'].indexOf(String(cfg.vividness || '')) >= 0 ? String(cfg.vividness) : 'balanced';

      var html = D.documentElement;
      setAttrIfChanged(html, 'data-ag-cs-style', '1');
      setAttrIfChanged(html, 'data-ag-cs-theme', theme);
      setAttrIfChanged(html, 'data-ag-cs-palette', paletteKey);
      setAttrIfChanged(html, 'data-ag-cs-accent', accentTone);
      setAttrIfChanged(html, 'data-ag-cs-motion', motionTier);
      setAttrIfChanged(html, 'data-ag-cs-ambient', String(ambientScale));
      setAttrIfChanged(html, 'data-ag-cs-vividness', vividness);
      setAttrIfChanged(html, 'data-ag-cs-font-style', cfg.fontStyle || 'modern');
      setAttrIfChanged(html, 'data-ag-cs-text-style', cfg.textStyle || 'stylized');
      setAttrIfChanged(html, 'data-ag-cs-corners', cfg.cornerStyle || 'balanced');
      setAttrIfChanged(html, 'data-ag-cs-code-font', cfg.codeFont || 'default');
      setAttrIfChanged(html, 'data-ag-cs-ligatures', cfg.codeLigatures ? '1' : '0');
      setAttrIfChanged(html, 'data-ag-cs-sidebar-compact', cfg.sidebarCompact ? 'on' : 'off');

      ensureOpticalStyle();

      // 1. 300Hz GPU Canvas Prism Rim
      syncRim(Boolean(eff.opticalFacet));

      // 2. Real Pixel Mascot Stage on Composer top edge (appended last so legs are NEVER clipped!)
      syncMascot(Boolean(eff.pixelCompanion), cfg, appId);

      // 3. WebGL2 Brand Horizon Glow + Interactive ASCII Character Matrix Ripple Field
      glassOverlayActive = Boolean(eff.glassLayer && eff.wallpaperLayer);
      if (!scrollThrottleBound) {
        G.addEventListener('wheel', onScrollBusy, { passive: true, capture: true });
        D.addEventListener('scroll', onScrollBusy, { passive: true, capture: true });
        scrollThrottleBound = true;
      }
      var wantRipple = Boolean(eff.rippleField !== undefined ? eff.rippleField : (skinMode === 'optical' && eff.opticalFacet));
      var rippleOpacity = eff.wallpaperLayer ? 0.45 : 1.0;
      syncRipple(wantRipple, rippleOpacity);

      // 4. 4-Tier Spring Motion Engine + Smooth Caret
      syncMotionAndCaret(Boolean(eff.microMotion));

      // 4b. Native Antigravity Starfield Reasoning Effort Slider (auto-yields if standalone obsidian-prism / effort-slider exists)
      try {
        var isAntigravityHost = appId === 'antigravity' || Boolean(D.querySelector('[data-testid="model-selector-trigger"], [data-testid="model-selector-panel"], [data-testid="agent-input-box"]'));
        if (isAntigravityHost && G.__agPrismEffortSlider && typeof G.__agPrismEffortSlider.sync === 'function') {
          G.__agPrismEffortSlider.sync({
            effortSliderModule: cfg.effortSliderModule === 'off' ? 'off' : 'auto',
            effortMemory: cfg.effortMemory === 'off' ? 'off' : 'on',
          });
        } else if (G.__agPrismEffortSlider && typeof G.__agPrismEffortSlider.destroy === 'function') {
          G.__agPrismEffortSlider.destroy();
        }
      } catch (_) {}

      // 5. Streaming-safe SPA remount observer (zero layout thrash during AI token streaming!)
      if (typeof G.MutationObserver === 'function' && D.body && !spaMo) {
        spaMo = new G.MutationObserver(function () {
          if (!active || destroyed) return;
          lastBusyAt = Date.now();
          if (spaRescanTimer) return;
          var needMascotRe = Boolean(eff.pixelCompanion) && (!mascotHostEl || !mascotHostEl.isConnected || !mascotStageEl || !mascotStageEl.isConnected || mascotHostEl.id === FALLBACK_ANCHOR_ID);
          var needRippleRe = wantRipple && (!rippleParentEl || !rippleParentEl.isConnected || !rippleHostEl || !rippleHostEl.isConnected);
          if (!needMascotRe && !needRippleRe) return;
          spaRescanTimer = setTimeout(function () {
            spaRescanTimer = 0;
            if (!active || destroyed || !lastPayload) return;
            var lp = lastPayload;
            var lc = (lp.config && typeof lp.config === 'object') ? lp.config : {};
            var le = (lp.composition && lp.composition.effectiveModules) || {};
            var la = (lp.adapterProfile && lp.adapterProfile.appId) || lc.appId || '';
            if (le.pixelCompanion && (!mascotHostEl || !mascotHostEl.isConnected || !mascotStageEl || !mascotStageEl.isConnected || mascotHostEl.id === FALLBACK_ANCHOR_ID)) {
              syncMascot(true, lc, la);
              if (le.opticalFacet) syncRim(true);
            }
            if ((le.rippleField !== undefined ? le.rippleField : false) && (!rippleParentEl || !rippleParentEl.isConnected || !rippleHostEl || !rippleHostEl.isConnected)) {
              syncRipple(true, le.wallpaperLayer ? 0.45 : 1.0);
            }
          }, 650);
        });
        try { spaMo.observe(D.body, { childList: true, subtree: true }); } catch (_) {}
      }

      if (!streamPollTimer) {
        streamPollTimer = setInterval(pollStreamingState, 600);
      }
      pollStreamingState();
      if (domRescanTimer) clearTimeout(domRescanTimer);
      domRescanTimer = setTimeout(function () {
        domRescanTimer = 0;
        if (!active || destroyed) return;
        if (eff.opticalFacet) syncRim(true);
        if (eff.pixelCompanion && (!mascotHostEl || mascotHostEl.id === FALLBACK_ANCHOR_ID)) {
          syncMascot(true, cfg, appId);
        }
      }, 650);
    }

    function teardownAll() {
      active = false;
      if (domRescanTimer) { clearTimeout(domRescanTimer); domRescanTimer = 0; }
      if (spaRescanTimer) { clearTimeout(spaRescanTimer); spaRescanTimer = 0; }
      if (streamPollTimer) { clearInterval(streamPollTimer); streamPollTimer = 0; }
      isStreaming = false;
      manualStreamingOverride = null;
      syncSidebarRunningRow(false, false);
      if (D.documentElement && D.documentElement.hasAttribute('data-ag-cs-streaming')) {
        D.documentElement.removeAttribute('data-ag-cs-streaming');
      }
      if (spaMo) { try { spaMo.disconnect(); } catch (_) {} spaMo = null; }
      if (scrollThrottleBound) {
        try { G.removeEventListener('wheel', onScrollBusy, true); } catch (_) {}
        try { D.removeEventListener('scroll', onScrollBusy, true); } catch (_) {}
        scrollThrottleBound = false;
      }
      teardownRim();
      teardownMascot();
      teardownRipple();
      teardownMotionAndCaret();
      try {
        if (G.__agPrismEffortSlider && typeof G.__agPrismEffortSlider.destroy === 'function') {
          G.__agPrismEffortSlider.destroy();
        }
      } catch (_) {}
      removeOpticalStyle();
      clearRootAttrs();
    }

    function destroy() {
      destroyed = true;
      teardownAll();
    }

    function status() {
      return {
        active: active,
        palette: paletteKey,
        theme: isDark ? 'dark' : 'light',
        accentTone: accentTone,
        motionTier: motionTier,
        rimMounted: Boolean(rimCtl),
        mascotMounted: Boolean(mascotRig),
        mascotSpec: mascotSig,
        streaming: isStreaming,
        rippleMounted: Boolean(rippleField),
        rippleMode: rippleField ? rippleField.mode : 'none',
        glowMode: rippleGlow ? rippleGlow.mode : 'none',
        motionMounted: Boolean(motionBinding),
      };
    }

    function playMascotDemo(kind) {
      if (!mascotRig) return false;
      notifyMascotSafe('activity', {});
      try {
        if (typeof mascotRig.playDemo === 'function') {
          mascotRig.playDemo(kind);
          return true;
        }
      } catch (_) {}
      return false;
    }

    function feedMascot(id, item) {
      if (!mascotRig) return false;
      notifyMascotSafe('activity', {});
      try {
        if (typeof mascotRig.feed === 'function') return Boolean(mascotRig.feed(id || 'cat', item || 'donut'));
      } catch (_) {}
      return false;
    }

    function pokeMascot(id) {
      if (!mascotRig) return false;
      notifyMascotSafe('activity', {});
      try {
        if (typeof mascotRig.poke === 'function') { mascotRig.poke(id || 'cat'); return true; }
      } catch (_) {}
      return false;
    }

    function setHabitatMode(mode) {
      if (!mascotRig || typeof mascotRig.setHabitatPreview !== 'function') return 'auto';
      try {
        return mascotRig.setHabitatPreview(mode || 'auto');
      } catch (_) { return 'auto'; }
    }

    function getMascotSnapshot() {
      if (!mascotRig || typeof mascotRig.getLayoutSnapshot !== 'function') return null;
      try { return mascotRig.getLayoutSnapshot(); } catch (_) { return null; }
    }

    return {
      apply: apply,
      teardown: teardownAll,
      destroy: destroy,
      status: status,
      notifyMascot: notifyMascotSafe,
      playMascotDemo: playMascotDemo,
      feedMascot: feedMascot,
      pokeMascot: pokeMascot,
      setCamp: setCamp,
      setHabitatMode: setHabitatMode,
      setStreaming: setStreamingState,
      getMascotSnapshot: getMascotSnapshot,
    };
  }

  var existing = G.__dreamSkinOptical;
  if (existing && typeof existing.destroy === 'function') {
    try { existing.destroy(); } catch (_) {}
  }
  G.__dreamSkinOptical = createOpticalSuiteController();
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
;
