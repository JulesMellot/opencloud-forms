import { dictionary, translate, type Language } from './i18n.ts'

const CSP = [
  "default-src 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "img-src 'self' data:",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ')

export const publicPageHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
}

/**
 * Standalone respondent UI. It does not load OpenCloud Web; it only reads the public OpenCloud
 * theme (logo and colors) when served on the same origin, and falls back to the default theme.
 */
export function publicPage(language: Language = 'fr') {
  const initial = (key: string) =>
    translate(language, key).replace(
      /[&<>"']/g,
      (value) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[value]
    )
  const messages = JSON.stringify(dictionary(language)).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${initial('Form')}</title>
  <style>
    :root{color-scheme:light dark;--oc-primary:#00677f;--oc-on-primary:#fff;--oc-surface:#fff;--oc-surface-container:#f6f8fa;--oc-on-surface:#191c1d;--oc-on-surface-variant:#40484c;--oc-outline:#70787c;--oc-outline-variant:#bfc8cc;--oc-error:#ba1a1a;--oc-error-container:#ffdad6;--oc-on-error-container:#410002;--accent:var(--oc-primary);--on-accent:var(--oc-on-primary);--line:var(--oc-outline-variant);--muted:var(--oc-on-surface-variant);--hover:color-mix(in srgb,var(--oc-on-surface) 5%,transparent)}
    @media(prefers-color-scheme:dark){:root{--oc-primary:#5cd5fb;--oc-on-primary:#003543;--oc-surface:#191c1d;--oc-surface-container:#111415;--oc-on-surface:#e1e3e4;--oc-on-surface-variant:#bfc8cc;--oc-outline:#8a9296;--oc-outline-variant:#40484c;--oc-error:#ffb4ab;--oc-error-container:#93000a;--oc-on-error-container:#ffdad6}}
    *{box-sizing:border-box}[hidden]{display:none!important}html{background:var(--oc-surface-container)}
    body{margin:0;min-height:100vh;background:var(--oc-surface-container) center/cover fixed;color:var(--oc-on-surface);font:15px/1.5 OpenCloud,Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
    .topbar{display:flex;align-items:center;height:56px;padding:0 24px;background:var(--oc-surface);border-bottom:1px solid var(--line)}
    #brand img{display:block;height:24px;max-width:160px}#brand span{font-weight:700}
    .sheet{width:min(680px,100% - 32px);margin:32px auto 48px;background:var(--oc-surface);border:1px solid var(--line);border-radius:8px;overflow:hidden}
    .intro{padding:36px 40px 28px}.intro p{margin:10px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.intro .eyebrow{margin:0 0 6px;font-size:.875rem}.intro .again{margin-top:24px}.muted{color:var(--muted)}
    h1{margin:0;font-size:1.75rem;line-height:1.25;font-weight:650;letter-spacing:-.01em;overflow-wrap:anywhere}
    .q{padding:24px 40px;border-top:1px solid var(--line)}.q.invalid{box-shadow:inset 3px 0 0 var(--oc-error)}
    .label{display:block;margin:0;font-weight:600;overflow-wrap:anywhere}.req{color:var(--oc-error)}
    .desc{margin:4px 0 0;color:var(--muted);font-size:.875rem;white-space:pre-wrap;overflow-wrap:anywhere}.control{margin-top:12px}
    input:not([type=radio]):not([type=checkbox]):not([type=file]),textarea,select{display:block;width:100%;min-height:40px;padding:8px 10px;border:1px solid var(--oc-outline);border-radius:6px;background-color:var(--oc-surface);color:inherit;font:inherit}
    input[type=number],input[type=date],input[type=time]{max-width:220px}textarea{min-height:104px;resize:vertical}::placeholder{color:var(--muted);opacity:.7}
    input:not([type=radio]):not([type=checkbox]):not([type=file]):focus,textarea:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
    .invalid input:not([type=radio]):not([type=checkbox]):not([type=file]),.invalid textarea,.invalid select{border-color:var(--oc-error)}
    select{appearance:none;-webkit-appearance:none;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2370787c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:16px;cursor:pointer}
    .choices{display:flex;flex-direction:column;gap:2px;margin-left:-8px}.choices.inline{flex-direction:row;flex-wrap:wrap;gap:4px 16px}
    .choice{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;cursor:pointer}.choice:hover{background:var(--hover)}
    .choice input{flex:none;width:18px;height:18px;margin:0;accent-color:var(--accent);cursor:pointer}
    input[type=file]{display:block;max-width:100%;color:var(--muted);font:inherit;font-size:.875rem}
    input[type=file]::file-selector-button{margin-right:12px;padding:7px 14px;border:1px solid var(--oc-outline);border-radius:6px;background:var(--oc-surface);color:var(--oc-on-surface);font:inherit;font-weight:500;cursor:pointer}
    input[type=file]::file-selector-button:hover{background:var(--hover)}input[type=file]:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
    .meta{display:flex;gap:12px;margin-top:8px;color:var(--muted);font-size:.8125rem}.count{margin-left:auto;font-variant-numeric:tabular-nums;white-space:nowrap}
    .error{margin:8px 0 0;color:var(--oc-error);font-size:.875rem}
    .alert{margin:0 40px 20px;padding:10px 14px;border-radius:6px;background:var(--oc-error-container);color:var(--oc-on-error-container);font-size:.875rem}
    .foot{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 40px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--oc-on-surface) 2%,var(--oc-surface))}.foot small{color:var(--muted);font-size:.8125rem}
    button{min-height:40px;padding:0 20px;border:1px solid transparent;border-radius:6px;background:var(--accent);color:var(--on-accent);font:inherit;font-weight:600;cursor:pointer}
    button:hover{filter:brightness(1.08)}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}button:disabled{opacity:.6;cursor:progress}
    button.link{min-height:0;padding:0;border:0;background:none;color:var(--oc-on-surface);font-weight:500;text-decoration:underline 2px var(--accent);text-underline-offset:4px}button.link:hover{filter:none;color:var(--muted)}
    @media(max-width:600px){.topbar{padding:0 16px}.sheet{width:100%;min-height:calc(100vh - 56px);margin:0;border:0;border-radius:0}.intro{padding:28px 20px 20px}.q{padding:20px}.alert{margin:0 20px 16px}.foot{flex-direction:column-reverse;align-items:stretch;padding:16px 20px}h1{font-size:1.5rem}}
  </style>
</head>
<body>
<div class="topbar"><div id="brand"></div></div>
<main class="sheet" id="app" aria-busy="true"><div class="intro"><p class="muted">${initial('Loading form')}…</p></div></main>
<script>
(()=>{'use strict';
const messages=${messages};
const t=(key,params={})=>(messages[key]||key).replace(/%{(\\w+)}/g,(_,name)=>String(params[name]??''));
const app=document.getElementById('app');const root=document.documentElement.style;const token=location.pathname.split('/').filter(Boolean).pop();let form;let submissionId=crypto.randomUUID();
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const a=v=>h(v).replace(/\\n/g,' ');const inputId=f=>'field-'+a(f.id);const hex=/^#[0-9a-f]{6}$/i;const MB=1024*1024;
const accept={image:'image/*',video:'video/*',audio:'audio/*',pdf:'application/pdf,.pdf',document:'.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.txt,.csv,.md,.rtf',archive:'.zip,.7z,.gz',any:''};
const kinds={image:t("Images"),video:t("Videos"),audio:t("Audio"),pdf:'PDF',document:t("Documents"),archive:t("Archives")};
const submitLabel=()=>form.settings.submitLabel||t("Submit");
const smooth=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
// OpenCloud serves its theme without authentication; the page stays usable if it cannot be read
fetch('/config.json').then(r=>r.json()).then(c=>{const url=new URL(c.theme,location.origin);if(url.origin!==location.origin)throw 0;return fetch(url).then(r=>r.json())}).then(t=>{
 const web=t.clients?.web||{};const dark=matchMedia('(prefers-color-scheme: dark)').matches;const theme=(web.themes||[]).find(x=>!!x.isDark===dark)||{};
 for(const [k,v] of Object.entries(theme.designTokens?.roles||{}))/^#[0-9a-f]{3,8}$/i.test(v)&&root.setProperty('--oc-'+k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),v);
 const logo=theme.logo||web.defaults?.logo||t.common?.logo;const name=t.common?.name||'OpenCloud';
 document.getElementById('brand').innerHTML=logo?'<img alt="'+a(name)+'" src="'+a(new URL(logo,location.origin+'/').pathname)+'">':'<span>'+h(name)+'</span>';
}).catch(()=>{});
function fieldHtml(f){const id=inputId(f),name=a(f.id),group=['radio','checkbox','boolean'].includes(f.type);
 const label=h(f.label||t("Untitled question"))+(f.required?' <span class="req" aria-hidden="true">*</span>':'');
 const desc=f.description?'<p class="desc" id="'+id+'-d">'+h(f.description)+'</p>':'';
 const described=' aria-describedby="'+(f.description?id+'-d ':'')+id+'-e"';
 const attrs=(f.required?' required':'')+(f.placeholder?' placeholder="'+a(f.placeholder)+'"':'')+(f.minLength!=null?' minlength="'+f.minLength+'"':'')+(f.maxLength!=null?' maxlength="'+f.maxLength+'"':'')+(f.min!=null?' min="'+f.min+'"':'')+(f.max!=null?' max="'+f.max+'"':'')+described;
 let control,hint='',count='';
 if(['text','number','email','url','date','time'].includes(f.type)){control='<input id="'+id+'" name="'+name+'" type="'+f.type+'"'+attrs+(f.type==='email'?' autocomplete="email"':f.type==='number'?' step="any"':'')+'>'}
 else if(f.type==='textarea'){control='<textarea id="'+id+'" name="'+name+'"'+attrs+'></textarea>'}
 else if(f.type==='select'){control='<select id="'+id+'" name="'+name+'"'+(f.required?' required':'')+described+'><option value="">'+h(t("Choose\u2026"))+'</option>'+(f.options||[]).map(o=>'<option value="'+a(o.id)+'">'+h(o.label)+'</option>').join('')+'</select>'}
 else if(f.type==='file'){const cats=f.accept&&f.accept.length?f.accept:['any'];const ac=cats.includes('any')?'':cats.map(c=>accept[c]||'').filter(Boolean).join(',');const max=f.maxFiles||1;
  control='<input id="'+id+'" name="'+name+'" type="file"'+(max>1?' multiple':'')+(ac?' accept="'+a(ac)+'"':'')+(f.required?' required':'')+described+'>';
  hint=[cats.includes('any')?'':cats.map(c=>kinds[c]).filter(Boolean).join(', '),max>1?t('Up to %{count} files',{count:max}):'',f.maxSizeMb?t('Maximum %{size} MB',{size:f.maxSizeMb}):''].filter(Boolean).join(' · ');hint=hint&&hint[0].toUpperCase()+hint.slice(1)}
 else {const opts=f.type==='boolean'?[{id:'true',label:t("Yes")},{id:'false',label:t("No")}]:(f.options||[]);const type=f.type==='checkbox'?'checkbox':'radio';
  control='<div class="choices'+(f.type==='boolean'?' inline':'')+'">'+opts.map((o,j)=>'<label class="choice"><input type="'+type+'" name="'+name+'" value="'+a(o.id)+'"'+(f.required&&type==='radio'&&j===0?' required':'')+'><span>'+h(o.label)+'</span></label>').join('')+'</div>';
  if(type==='checkbox'&&f.maxChoices)hint=t('Up to %{count} choices',{count:f.maxChoices})}
 if(f.maxLength!=null&&(f.type==='text'||f.type==='textarea'))count='<span class="count" data-max="'+f.maxLength+'">0 / '+f.maxLength+'</span>';
 const head=group?'<p class="label" id="'+id+'-l">'+label+'</p>':'<label class="label" for="'+id+'">'+label+'</label>';
 return '<section class="q" data-field="'+name+'"'+(group?' role="group" aria-labelledby="'+id+'-l"'+described:'')+'>'+head+desc+'<div class="control">'+control+'</div>'+(hint||count?'<div class="meta"><span>'+h(hint)+'</span>'+count+'</div>':'')+'<p class="error" id="'+id+'-e" hidden></p></section>'}
function applyAppearance(s){
 if(hex.test(s.accentColor)){const n=parseInt(s.accentColor.slice(1),16),l=(0.299*(n>>16)+0.587*(n>>8&255)+0.114*(n&255))/255;root.setProperty('--accent',s.accentColor);root.setProperty('--on-accent',l>0.6?'#191c1d':'#fff')}
 document.body.style.backgroundColor=hex.test(s.backgroundColor)?s.backgroundColor:'';
 // the server only keeps base64 PNG/JPEG/WebP data URLs, so the value cannot break out of url("")
 document.body.style.backgroundImage=/^data:image\\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(s.backgroundImage||'')?'linear-gradient(#ffffff30,#ffffff30),url("'+s.backgroundImage+'")':''}
function render(){applyAppearance(form.settings);document.title=form.title||t("Form");app.removeAttribute('aria-busy');
 const intro='<div class="intro"><h1>'+h(form.title||t("Untitled form"))+'</h1>'+(form.description?'<p>'+h(form.description)+'</p>':'');
 if(!form.settings.acceptingResponses){app.innerHTML=intro+'<p class="muted">'+h(t("This form is not accepting responses."))+'</p></div>';return}
 app.innerHTML=intro+'</div><form id="response-form" novalidate>'+form.fields.map(fieldHtml).join('')+'<div id="global-error" class="alert" role="alert" hidden></div><div class="foot"><small>'+(form.fields.some(f=>f.required)?'* '+t('Required answer'):'')+'</small><button type="submit">'+h(submitLabel())+'</button></div></form>';
 const el=document.getElementById('response-form');el.addEventListener('submit',submit);el.addEventListener('input',onInput);el.addEventListener('change',onInput)}
function onInput(e){const s=e.target.closest('[data-field]');if(!s)return;s.classList.contains('invalid')&&setError(s,'');const count=s.querySelector('.count');if(count)count.textContent=e.target.value.length+' / '+count.dataset.max}
function setError(s,msg){const e=s.querySelector('.error');e.textContent=msg;e.hidden=!msg;s.classList.toggle('invalid',!!msg);s.querySelectorAll('input,textarea,select').forEach(c=>msg?c.setAttribute('aria-invalid','true'):c.removeAttribute('aria-invalid'))}
function message(c){const v=c.validity;if(v.valueMissing)return c.type==='file'?t("Add a file."):t("This question is required.");if(v.typeMismatch)return c.type==='email'?t("Enter a valid email address."):t("Enter a valid URL, for example https://example.com.");if(v.tooShort)return t('Enter at least %{count} characters.',{count:c.minLength});if(v.rangeUnderflow)return t('Enter a number of at least %{min}.',{min:c.min});if(v.rangeOverflow)return t('Enter a number of at most %{max}.',{max:c.max});return t("This answer is not valid.")}
function validate(el){let first=null;
 for(const f of form.fields){const s=el.querySelector('[data-field="'+CSS.escape(f.id)+'"]');const controls=[...s.querySelectorAll('input,textarea,select')];const bad=controls.find(c=>!c.checkValidity());let msg=bad?message(bad):'';
  if(!msg&&f.type==='checkbox'&&f.required&&!controls.some(c=>c.checked))msg=t("This question is required.");
  if(!msg&&f.type==='checkbox'&&f.maxChoices&&controls.filter(c=>c.checked).length>f.maxChoices)msg=t('Select at most %{count} options.',{count:f.maxChoices});
  if(!msg&&f.type==='file'){const files=[...controls[0].files];if(files.length>(f.maxFiles||1))msg=t('You can upload at most %{count} files.',{count:f.maxFiles||1});else if(f.maxSizeMb&&files.some(x=>x.size>f.maxSizeMb*MB))msg=t('Each file must be at most %{size} MB.',{size:f.maxSizeMb})}
  setError(s,msg);if(msg&&!first)first=s}
 if(first){first.scrollIntoView({behavior:smooth(),block:'center'});first.querySelector('input,textarea,select')?.focus({preventScroll:true})}return !first}
function showGlobal(message){const el=document.getElementById('global-error');el.textContent=message;el.hidden=false;el.scrollIntoView({behavior:smooth(),block:'center'})}
function done(){app.innerHTML='<div class="intro"><p class="eyebrow muted">'+h(form.title||t("Form"))+'</p><h1>'+h(t("Response sent"))+'</h1><p>'+h(form.settings.confirmationMessage||t("Your response has been recorded."))+'</p><p class="again"><button type="button" class="link" id="again">'+h(t("Submit another response"))+'</button></p></div>';
 scrollTo({top:0,behavior:smooth()});document.getElementById('again').onclick=()=>{submissionId=crypto.randomUUID();render();scrollTo({top:0})}}
async function submit(event){event.preventDefault();const el=event.currentTarget;document.getElementById('global-error').hidden=true;if(!validate(el))return;
 const button=el.querySelector('button[type=submit]');if(button.disabled)return;button.disabled=true;button.textContent=t("Sending…");const data=new FormData();const answers={};
 for(const f of form.fields){const controls=[...el.elements].filter(x=>x.name===f.id);if(f.type==='file'){for(const file of controls[0]?.files||[])data.append('file:'+f.id,file,file.name);continue}if(f.type==='checkbox'){answers[f.id]=controls.filter(x=>x.checked).map(x=>x.value);continue}if(f.type==='radio'||f.type==='boolean'){const x=controls.find(x=>x.checked);if(x)answers[f.id]=f.type==='boolean'?x.value==='true':x.value;continue}const value=controls[0]?.value??'';if(value!=='')answers[f.id]=f.type==='number'?Number(value):value}
 data.append('payload',JSON.stringify({submissionId,revision:form.revision,answers}));
 try{const response=await fetch('/forms-api/v1/public/'+encodeURIComponent(token)+'/submissions',{method:'POST',body:data});const result=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===400&&result.fields){for(const id of Object.keys(result.fields)){const s=el.querySelector('[data-field="'+CSS.escape(id)+'"]');s&&setError(s,t("This answer is not valid."))}throw new Error('fields')}if(response.status===403)throw new Error('closed');if(response.status===409)throw new Error('changed');if(response.status===413)throw new Error('large');if(response.status===429)throw new Error('rate');throw new Error('server')}
  done()
 }catch(e){const messages={fields:t("Some answers need to be corrected."),closed:t("This form is not accepting responses."),changed:t("The form was changed while you were answering. Copy your answers and reload the page."),large:t("The uploaded files are too large."),rate:t("Too many responses were sent. Please wait a few minutes and try again."),server:t("Your response could not be stored. Please try again later.")};showGlobal(messages[e.message]||messages.server)}
 finally{if(button.isConnected){button.disabled=false;button.textContent=submitLabel()}}}
fetch('/forms-api/v1/public/'+encodeURIComponent(token),{headers:{Accept:'application/json'}}).then(async r=>{if(!r.ok)throw new Error(String(r.status));form=await r.json();render()}).catch(()=>{app.removeAttribute('aria-busy');app.innerHTML='<div class="intro"><h1>'+h(t("Form not found"))+'</h1><p class="muted">'+h(t("This form does not exist or is no longer available."))+'</p></div>'});
})();
</script></body></html>`
}
