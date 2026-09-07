
const QUESTIONS=window.TRANSPETRO_QUESTIONS||[];
const SOURCE_COUNTS=window.TRANSPETRO_SOURCE_COUNTS||{};
const LETTERS=['A','B','C','D','E'];
const STATE_KEY='transpetroV4State';
const LEGACY_STATE_KEY='transpetroV3State';
function loadState(){
  const empty={answered:{},favorites:[],errors:[]};
  try{
    const current=localStorage.getItem(STATE_KEY);
    if(current)return {...empty,...JSON.parse(current)};
    const legacy=localStorage.getItem(LEGACY_STATE_KEY);
    if(legacy){
      const migrated={...empty,...JSON.parse(legacy)};
      localStorage.setItem(STATE_KEY,JSON.stringify(migrated));
      return migrated;
    }
  }catch(error){console.warn('Não foi possível carregar o progresso salvo.',error)}
  return empty;
}
let state=loadState();
let session=[],idx=0,locked=false,deferredPrompt=null;

const $=id=>document.getElementById(id);
const els={
  catSel:$('catSel'),sourceSel:$('sourceSel'),diffSel:$('diffSel'),qtySel:$('qtySel'),dedupeChk:$('dedupeChk'),
  sAnswered:$('sAnswered'),sAccuracy:$('sAccuracy'),sErrors:$('sErrors'),categoryStats:$('categoryStats'),
  qCat:$('qCat'),qDiff:$('qDiff'),qSource:$('qSource'),qCount:$('qCount'),qProg:$('qProg'),qText:$('qText'),
  options:$('options'),feedback:$('feedback'),nextBtn:$('nextBtn'),favBtn:$('favBtn'),
  sourceCards:$('sourceCards'),libraryList:$('libraryList'),errorList:$('errorList'),installBanner:$('installBanner'),
  installBtn:$('installBtn'),onlineStatus:$('onlineStatus')
};

function save(){localStorage.setItem(STATE_KEY,JSON.stringify(state));renderDashboard()}
function show(id){['home','quiz','simulados','errors','library'].forEach(x=>$(x).classList.toggle('hidden',x!==id));if(id==='home')renderDashboard();if(id==='errors')renderErrors()}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function dedupe(arr){const seen=new Set();return arr.filter(q=>!seen.has(q.fp)&&seen.add(q.fp))}
function current(){return session[idx]}

function buildFilters(){
  [...new Set(QUESTIONS.map(q=>q.cat))].sort().forEach(c=>{let o=document.createElement('option');o.value=o.textContent=c;els.catSel.appendChild(o)});
  Object.keys(SOURCE_COUNTS).sort().forEach(c=>{let o=document.createElement('option');o.value=o.textContent=c;els.sourceSel.appendChild(o)});
}
function startQuiz(mode='normal',specificSource=null,ordered=false){
  let pool=[...QUESTIONS];
  if(specificSource)pool=pool.filter(q=>q.source===specificSource);
  else{
    if(els.catSel.value!=='all')pool=pool.filter(q=>q.cat===els.catSel.value);
    if(els.sourceSel.value!=='all')pool=pool.filter(q=>q.source===els.sourceSel.value);
    if(els.diffSel.value!=='all')pool=pool.filter(q=>q.diff===els.diffSel.value);
  }
  if(mode==='errors')pool=pool.filter(q=>state.errors.includes(q.id));
  if(mode==='favorites')pool=pool.filter(q=>state.favorites.includes(q.id));
  if(!specificSource&&els.dedupeChk.checked)pool=dedupe(pool);
  if(!pool.length){alert('Nenhuma questão encontrada para esta seleção.');return}
  const qty=specificSource?pool.length:+els.qtySel.value;
  session=ordered?pool.sort((a,b)=>a.sourceNum-b.sourceNum):shuffle(pool).slice(0,Math.min(qty,pool.length));
  idx=0;show('quiz');renderQuestion();
}
function renderQuestion(){
  locked=false;els.feedback.innerHTML='';els.nextBtn.classList.add('hidden');
  const q=current();if(!q){finish();return}
  els.qCat.textContent=q.cat;els.qDiff.textContent=q.diff;els.qSource.textContent=q.source.replaceAll('_',' ');
  els.qCount.textContent=`${idx+1} / ${session.length}`;els.qProg.style.width=`${idx/session.length*100}%`;els.qText.textContent=q.q;
  els.favBtn.textContent=(state.favorites.includes(q.id)?'★':'☆')+' Favoritar';
  els.options.innerHTML=q.opts.map((o,i)=>`<button class="option" data-choice="${i}"><b>${LETTERS[i]})</b> ${esc(o)}</button>`).join('');
  document.querySelectorAll('.option').forEach(b=>b.addEventListener('click',()=>answer(+b.dataset.choice)));
  window.scrollTo({top:0,behavior:'smooth'});
}
function answer(choice){
  if(locked)return;locked=true;const q=current(),correct=choice===q.ans;
  [...document.querySelectorAll('.option')].forEach((b,i)=>{if(i===q.ans)b.classList.add('correct');if(i===choice&&!correct)b.classList.add('wrong')});
  state.answered[q.id]={correct,at:Date.now(),cat:q.cat,source:q.source};
  if(correct)state.errors=state.errors.filter(x=>x!==q.id);else if(!state.errors.includes(q.id))state.errors.push(q.id);
  els.feedback.innerHTML=`<div class="feedback ${correct?'ok':'bad'}"><b>${correct?'✓ Correto':'✗ Incorreto'}</b><br>${esc(q.exp)}<div class="small" style="margin-top:8px">Gabarito: ${LETTERS[q.ans]} • Fonte: ${esc(q.source)} • Questão original: ${q.sourceNum}</div></div>`;
  els.nextBtn.classList.remove('hidden');save();
}
function finish(){
  els.qProg.style.width='100%';const results=session.map(q=>state.answered[q.id]).filter(Boolean),ok=results.filter(x=>x.correct).length;
  els.qText.textContent='Treino concluído';els.options.innerHTML='';
  els.feedback.innerHTML=`<div class="feedback ok"><b>${ok} de ${session.length}</b> corretas (${Math.round(ok/session.length*100)}%).<br><span class="small">Os erros foram enviados automaticamente ao Caderno de Erros.</span></div>`;
  els.nextBtn.classList.add('hidden');
}
function renderDashboard(){
  const vals=Object.values(state.answered),ok=vals.filter(x=>x.correct).length;
  els.sAnswered.textContent=vals.length;els.sAccuracy.textContent=(vals.length?Math.round(ok/vals.length*100):0)+'%';els.sErrors.textContent=state.errors.length;
  const cats=[...new Set(QUESTIONS.map(q=>q.cat))].sort();
  els.categoryStats.innerHTML=`<table><thead><tr><th>Área</th><th>Respondidas</th><th>Acerto</th></tr></thead><tbody>${cats.map(c=>{let ids=QUESTIONS.filter(q=>q.cat===c).map(q=>q.id),a=ids.filter(id=>state.answered[id]),cor=a.filter(id=>state.answered[id].correct).length;return `<tr><td>${esc(c)}</td><td>${a.length} / ${ids.length}</td><td>${a.length?Math.round(cor/a.length*100):0}%</td></tr>`}).join('')}</tbody></table>`;
}
function renderErrors(){
  const qs=QUESTIONS.filter(q=>state.errors.includes(q.id));
  els.errorList.innerHTML=qs.length?qs.map(q=>`<div style="padding:11px 0;border-bottom:1px solid var(--line)"><b>${esc(q.cat)} • ${esc(q.source)}</b><div class="small">${esc(q.q)}</div></div>`).join(''):'<div class="small">Nenhum erro ativo.</div>';
}
function toggleFav(){
  const q=current();if(!q)return;
  state.favorites=state.favorites.includes(q.id)?state.favorites.filter(x=>x!==q.id):[...state.favorites,q.id];save();renderQuestion();
}
function exportProgress(){
  const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Transpetro_V4_Progresso.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
function renderSources(){
  els.sourceCards.innerHTML=Object.entries(SOURCE_COUNTS).sort((a,b)=>a[0].localeCompare(b[0])).map(([s,n])=>`<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row"><div class="grow"><b>${esc(s.replaceAll('_',' '))}</b><div class="small">${n} questões importadas</div></div><button data-source="${esc(s)}">Iniciar</button></div></div>`).join('');
  els.sourceCards.querySelectorAll('button[data-source]').forEach(b=>b.addEventListener('click',()=>startQuiz('normal',b.dataset.source,true)));
  els.libraryList.innerHTML=Object.entries(SOURCE_COUNTS).sort((a,b)=>a[0].localeCompare(b[0])).map(([s,n])=>`<div>${esc(s.replaceAll('_',' '))}</div><div>${n} questões</div>`).join('');
}
function updateOnline(){els.onlineStatus.textContent=navigator.onLine?'online':'offline'}
window.addEventListener('online',updateOnline);window.addEventListener('offline',updateOnline);

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredPrompt=e;els.installBanner.classList.add('show');
});
els.installBtn?.addEventListener('click',async()=>{
  if(!deferredPrompt)return;
  deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;els.installBanner.classList.remove('show');
});
window.addEventListener('appinstalled',()=>els.installBanner.classList.remove('show'));

document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
$('startBtn').addEventListener('click',()=>startQuiz('normal'));
$('errorsBtn').addEventListener('click',()=>startQuiz('errors'));
$('favBtnHome').addEventListener('click',()=>startQuiz('favorites'));
$('randomBtn').addEventListener('click',()=>{els.catSel.value='all';els.sourceSel.value='all';els.diffSel.value='all';els.qtySel.value='10';startQuiz('normal')});
els.nextBtn.addEventListener('click',()=>{idx++;renderQuestion()});
els.favBtn.addEventListener('click',toggleFav);
$('backQuiz').addEventListener('click',()=>show('home'));
$('exportBtn').addEventListener('click',exportProgress);
$('resetBtn').addEventListener('click',()=>{if(confirm('Apagar todo o progresso salvo neste aparelho?')){state={answered:{},favorites:[],errors:[]};save();renderErrors()}});
$('themeBtn').addEventListener('click',()=>document.body.classList.toggle('light'));

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js'));
}
buildFilters();renderSources();renderDashboard();updateOnline();
