const QUESTIONS = window.TRANSPETRO_V6_QUESTIONS || [];



const SOURCE_COUNTS={"05.02_Banco_Misto_Questoes_Alto_Impacto_CESGRANRIO_Transpetro": 40, "05.03_Banco_Misto_Questoes_Complementares_CESGRANRIO_Transpetro": 40, "06.01_Simulado_Diagnostico_70_Questoes_Transpetro_CESGRANRIO": 70, "06.04_Simulado_Progressivo_3_Dificuldade_Elevada_Transpetro_CESGRANRIO": 70, "06.05_Simulado_Progressivo_4_Nivel_Prova_Transpetro_CESGRANRIO": 70, "06.06_Simulado_Final_Transpetro_Enfermeiro_do_Trabalho_CESGRANRIO": 70, "09.01_Lingua_Portuguesa_Transpetro_CESGRANRIO": 30, "09.02_Lingua_Inglesa_Transpetro_CESGRANRIO": 30, "09.11_Reteste_Lacunas_Correcao_Final_Transpetro_CESGRANRIO": 40, "09.12_Banco_Integrado_Alto_Impacto_Serie_09_Transpetro_CESGRANRIO": 60, "09.13_Simulado_Integrado_01_70_Questoes_Transpetro_CESGRANRIO": 70, "09.14_Simulado_Integrado_02_70_Questoes_Nivel_Prova_Transpetro_CESGRANRIO": 70, "09.15_Simulado_Integrado_03_Dificuldade_Elevada_Transpetro_CESGRANRIO": 70, "09.16_Simulado_Integrado_04_Nivel_Final_Prova_Transpetro_CESGRANRIO": 70, "SIM-02_Simulado_Transpetro_CESGRANRIO_Enfermeiro_Trabalho_Nivel_Real_70_Questoes": 70, "Banco_V1_72_Questoes": 72};
const LETTERS=['A','B','C','D','E'];

(function () {
  "use strict";

  const STORAGE_KEY = "transpetro_mastery_v5";
  const VERSION = 5;
  const REVIEW_DAYS = [0, 1, 3, 7, 14, 30];

  function nowISO() {
    return new Date().toISOString();
  }

  function addDaysISO(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function defaultState() {
    return {
      version: VERSION,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      questions: {},
      concepts: {},
      attempts: [],
      settings: {
        recentAttemptLimit: 1500,
        newQuestionWeight: 0.30,
        weakConceptWeight: 0.50,
        retentionWeight: 0.20
      }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed.version || parsed.version < VERSION) {
        return migrate(parsed);
      }
      return parsed;
    } catch (e) {
      console.warn("Mastery V5: falha ao carregar estado.", e);
      return defaultState();
    }
  }

  function saveState(state) {
    state.updatedAt = nowISO();
    const lim = state.settings?.recentAttemptLimit || 1500;
    if (state.attempts.length > lim) {
      state.attempts = state.attempts.slice(-lim);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function migrate(oldState) {
    const state = defaultState();

    // Migração conservadora de estruturas V4 conhecidas:
    // answered[id] = {correct, at, cat, source}
    if (oldState && oldState.answered) {
      Object.entries(oldState.answered).forEach(([questionId, item]) => {
        state.questions[questionId] = {
          attempts: 1,
          correct: item.correct ? 1 : 0,
          wrong: item.correct ? 0 : 1,
          streak: item.correct ? 1 : 0,
          lastResult: item.correct ? "correct" : "wrong",
          lastChoice: null,
          lastSeen: item.at ? new Date(item.at).toISOString() : nowISO(),
          nextReview: addDaysISO(item.correct ? 1 : 0),
          mastery: item.correct ? 2 : 1,
          status: item.correct ? "learning" : "weak",
          recent: [item.correct ? 1 : 0]
        };
      });
    }

    return saveState(state);
  }

  function getQuestionMeta(questionId, questions) {
    const q = questions.find(x => x.id === questionId);
    return q || null;
  }

  function ensureQuestionState(state, questionId) {
    if (!state.questions[questionId]) {
      state.questions[questionId] = {
        attempts: 0,
        correct: 0,
        wrong: 0,
        streak: 0,
        lastResult: null,
        lastChoice: null,
        lastSeen: null,
        nextReview: null,
        mastery: 0,
        status: "new",
        recent: []
      };
    }
    return state.questions[questionId];
  }

  function ensureConceptState(state, conceptId) {
    if (!state.concepts[conceptId]) {
      state.concepts[conceptId] = {
        attempts: 0,
        correct: 0,
        wrong: 0,
        mastery: 0,
        streak: 0,
        lastSeen: null,
        nextReview: null,
        status: "new"
      };
    }
    return state.concepts[conceptId];
  }

  function statusFromMastery(m) {
    return ["new", "seen", "learning", "consolidating", "strong", "mastered"][clamp(m, 0, 5)];
  }

  function reviewIntervalForMastery(mastery) {
    return REVIEW_DAYS[clamp(mastery, 0, 5)];
  }

  function computeNewMastery(current, correct, isDue) {
    if (correct) {
      // Acertos espaçados valem mais do que repetição imediata.
      return clamp(current + (isDue ? 1 : 0.5), 0, 5);
    }
    // Erro reduz mais quando o conceito parecia dominado.
    const drop = current >= 4 ? 2 : 1;
    return clamp(current - drop, 0, 5);
  }

  function isDue(dateISO) {
    if (!dateISO) return true;
    return new Date(dateISO).getTime() <= Date.now();
  }

  function recordAttempt({
    questionId,
    choiceIndex,
    correct,
    responseTimeMs = null,
    questions,
    independent = true
  }) {
    const state = loadState();
    const q = getQuestionMeta(questionId, questions);

    if (!q) throw new Error("Questão não encontrada: " + questionId);

    const qState = ensureQuestionState(state, questionId);
    const meta = q.v5 || {};
    const conceptId = meta.conceptId || "unmapped";
    const masteryEligible = !!meta.masteryEligible;

    const dueBefore = isDue(qState.nextReview);

    qState.attempts += 1;
    if (correct) qState.correct += 1;
    else qState.wrong += 1;
    qState.streak = correct ? qState.streak + 1 : 0;
    qState.lastResult = correct ? "correct" : "wrong";
    qState.lastChoice = choiceIndex;
    qState.lastSeen = nowISO();
    qState.recent = [...qState.recent, correct ? 1 : 0].slice(-8);

    if (masteryEligible) {
      const nextMasteryRaw = computeNewMastery(qState.mastery, correct, dueBefore && independent);
      qState.mastery = Math.round(nextMasteryRaw);
      qState.status = statusFromMastery(qState.mastery);
      qState.nextReview = addDaysISO(reviewIntervalForMastery(qState.mastery));

      const cState = ensureConceptState(state, conceptId);
      const conceptDue = isDue(cState.nextReview);

      cState.attempts += 1;
      if (correct) cState.correct += 1;
      else cState.wrong += 1;
      cState.streak = correct ? cState.streak + 1 : 0;
      cState.lastSeen = nowISO();

      const conceptMasteryRaw = computeNewMastery(cState.mastery, correct, conceptDue && independent);
      cState.mastery = Math.round(conceptMasteryRaw);
      cState.status = statusFromMastery(cState.mastery);
      cState.nextReview = addDaysISO(reviewIntervalForMastery(cState.mastery));
    }

    state.attempts.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      questionId,
      conceptId,
      correct: !!correct,
      choiceIndex,
      responseTimeMs,
      independent: !!independent,
      masteryEligible,
      attemptedAt: nowISO()
    });

    return saveState(state);
  }

  function scoreCandidate(q, state) {
    const meta = q.v5 || {};
    const qState = state.questions[q.id];
    const conceptId = meta.conceptId || "unmapped";
    const cState = state.concepts[conceptId];

    let score = 0;

    // Não respondidas: alta prioridade para expansão.
    if (!qState || qState.attempts === 0) score += 30;

    // Revisões vencidas.
    if (qState && isDue(qState.nextReview)) score += 45;
    if (cState && isDue(cState.nextReview)) score += 35;

    // Conceitos fracos.
    if (cState) {
      score += (5 - cState.mastery) * 12;
      if (cState.wrong > cState.correct) score += 20;
    }

    // Erros recorrentes na questão.
    if (qState) {
      score += qState.wrong * 8;
      if (qState.lastResult === "wrong") score += 18;
    }

    // Apenas questões de alta confiança devem dirigir o diagnóstico.
    if (!meta.masteryEligible) score -= 25;

    // Pequeno ruído para evitar sessões idênticas.
    score += Math.random() * 5;
    return score;
  }

  function selectAdaptiveQuestions(questions, count = 20, filters = {}) {
    const state = loadState();

    let pool = questions.filter(q => {
      const meta = q.v5 || {};

      if (filters.area && meta.area !== filters.area) return false;
      if (filters.topic && meta.topic !== filters.topic) return false;
      if (filters.source && q.source !== filters.source) return false;
      if (filters.onlyMasteryEligible && !meta.masteryEligible) return false;

      return true;
    });

    return pool
      .map(q => ({ q, score: scoreCandidate(q, state) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(x => x.q);
  }

  function getDueReviews(questions, count = 50) {
    const state = loadState();

    return questions
      .filter(q => {
        const qs = state.questions[q.id];
        return qs && isDue(qs.nextReview);
      })
      .sort((a, b) => {
        const da = new Date(state.questions[a.id].nextReview || 0).getTime();
        const db = new Date(state.questions[b.id].nextReview || 0).getTime();
        return da - db;
      })
      .slice(0, count);
  }

  function getDashboard(questions) {
    const state = loadState();
    const conceptEntries = Object.entries(state.concepts);

    const masteryBuckets = {
      new: 0,
      seen: 0,
      learning: 0,
      consolidating: 0,
      strong: 0,
      mastered: 0
    };

    conceptEntries.forEach(([, c]) => {
      masteryBuckets[statusFromMastery(c.mastery)] += 1;
    });

    const dueToday = Object.values(state.questions)
      .filter(x => isDue(x.nextReview)).length;

    const eligibleTotal = questions.filter(q => q.v5?.masteryEligible).length;

    const priorities = conceptEntries
      .map(([conceptId, c]) => ({
        conceptId,
        mastery: c.mastery,
        wrong: c.wrong,
        attempts: c.attempts,
        due: isDue(c.nextReview),
        score: (5 - c.mastery) * 10 + c.wrong * 3 + (isDue(c.nextReview) ? 15 : 0)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return {
      eligibleQuestions: eligibleTotal,
      totalAttempts: state.attempts.length,
      dueToday,
      masteryBuckets,
      priorities
    };
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    return defaultState();
  }

  window.TranspetroMasteryV5 = {
    VERSION,
    STORAGE_KEY,
    loadState,
    saveState,
    recordAttempt,
    selectAdaptiveQuestions,
    getDueReviews,
    getDashboard,
    resetAll
  };
})();


let state=JSON.parse(localStorage.getItem('transpetroV3State')||localStorage.getItem('transpetroV4State')||'{"answered":{},"favorites":[],"errors":[]}');
let session=[],idx=0,locked=false;

function v5Meta(q){return q&&q.v5?q.v5:{}}
function migrateLegacyToMasteryOnce(){
  const flag='transpetroV5LegacyMigrated';
  if(localStorage.getItem(flag))return;
  const ms=TranspetroMasteryV5.loadState();
  if(Object.keys(ms.questions||{}).length===0 && state.answered){
    Object.entries(state.answered).forEach(([questionId,item])=>{
      const q=QUESTIONS.find(x=>x.id===questionId); if(!q)return;
      const qs=ms.questions[questionId]||{
        attempts:0,correct:0,wrong:0,streak:0,lastResult:null,lastChoice:null,lastSeen:null,
        nextReview:null,mastery:0,status:'new',recent:[]
      };
      qs.attempts=1; qs.correct=item.correct?1:0; qs.wrong=item.correct?0:1;
      qs.streak=item.correct?1:0; qs.lastResult=item.correct?'correct':'wrong';
      qs.lastSeen=item.at?new Date(item.at).toISOString():new Date().toISOString();
      qs.mastery=item.correct?2:1; qs.status=item.correct?'learning':'seen';
      qs.nextReview=new Date(Date.now()+(item.correct?86400000:0)).toISOString();
      qs.recent=[item.correct?1:0]; ms.questions[questionId]=qs;

      const meta=v5Meta(q);
      if(meta.masteryEligible && meta.conceptId){
        const cs=ms.concepts[meta.conceptId]||{
          attempts:0,correct:0,wrong:0,mastery:0,streak:0,lastSeen:null,nextReview:null,status:'new'
        };
        cs.attempts+=1; cs.correct+=item.correct?1:0; cs.wrong+=item.correct?0:1;
        cs.mastery=Math.max(cs.mastery,item.correct?2:1);
        cs.status=cs.mastery>=2?'learning':'seen'; cs.lastSeen=qs.lastSeen; cs.nextReview=qs.nextReview;
        ms.concepts[meta.conceptId]=cs;
      }
    });
    TranspetroMasteryV5.saveState(ms);
  }
  localStorage.setItem(flag,'1');
}
migrateLegacyToMasteryOnce();

function save(){localStorage.setItem('transpetroV3State',JSON.stringify(state));renderDashboard();}
function show(id){['home','quiz','simulados','errors','library'].forEach(x=>document.getElementById(x).classList.toggle('hidden',x!==id)); if(id==='home')renderDashboard(); if(id==='errors')renderErrors();}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function dedupe(arr){const seen=new Set();return arr.filter(q=>!seen.has(q.fp)&&seen.add(q.fp))}
function current(){return session[idx]}

const selectedTopicKeys=new Set();
function topicKey(q){const m=v5Meta(q);return [m.area||q.cat,m.topic||'',m.subtopic||''].join('||')}
function topicLabel(q){const m=v5Meta(q);return [m.area||q.cat,m.topic,m.subtopic].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' › ')}
function isNRQuestion(q){
 const m=v5Meta(q); const txt=[m.area,m.topic,m.subtopic,q.cat].filter(Boolean).join(' ');
 return /\bNR-?\s*\d+/i.test(txt) || /PCMSO|SESMT|GRO\s*\/\s*PGR/i.test(txt);
}
function matchesPreset(q,preset){
 const m=v5Meta(q),txt=[m.area,m.topic,m.subtopic,m.conceptLabel,q.cat].filter(Boolean).join(' ');
 if(preset==='allNR')return isNRQuestion(q);
 if(preset==='pcmso')return /PCMSO|NR-?\s*7\b/i.test(txt);
 if(preset==='gro')return /NR-?\s*1\b|GRO|PGR/i.test(txt);
 if(preset==='catntep')return /\bCAT\b|NTEP|previdenci/i.test(txt);
 if(preset==='sus')return /\bSUS\b|RENAST|CEREST|Saúde do Trabalhador/i.test(txt);
 return false;
}
function renderTopicMultiList(){
 const map=new Map();
 QUESTIONS.forEach(q=>{const k=topicKey(q); if(!map.has(k))map.set(k,{label:topicLabel(q),count:0});map.get(k).count++});
 const entries=[...map.entries()].sort((a,b)=>a[1].label.localeCompare(b[1].label));
 topicMultiList.innerHTML=entries.map(([k,v])=>`<label class="multi-item"><input type="checkbox" data-topic-key="${esc(k)}" ${selectedTopicKeys.has(k)?'checked':''}><span>${esc(v.label)} <span class="small">(${v.count})</span></span></label>`).join('');
 topicMultiList.querySelectorAll('input[data-topic-key]').forEach(c=>c.addEventListener('change',()=>{c.checked?selectedTopicKeys.add(c.dataset.topicKey):selectedTopicKeys.delete(c.dataset.topicKey);updateSelectionSummary()}));
 updateSelectionSummary();
}
function updateSelectionSummary(){
 selectionSummary.textContent=selectedTopicKeys.size?`${selectedTopicKeys.size} tema(s) específico(s) selecionado(s). O treino usará a combinação marcada.`:'Nenhum tema específico selecionado: serão usados os filtros gerais.';
}
function applyPreset(preset){
 selectedTopicKeys.clear();
 if(preset!=='clear') QUESTIONS.forEach(q=>{if(matchesPreset(q,preset))selectedTopicKeys.add(topicKey(q))});
 renderTopicMultiList();
}
function buildFilters(){
 [...new Set(QUESTIONS.map(q=>v5Meta(q).area||q.cat))].sort().forEach(c=>{let o=document.createElement('option');o.value=o.textContent=c;catSel.appendChild(o)});
 Object.keys(SOURCE_COUNTS).sort().forEach(c=>{let o=document.createElement('option');o.value=o.textContent=c;sourceSel.appendChild(o)});
 renderTopicMultiList();
 document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
}
function startQuiz(mode='normal',specificSource=null,ordered=false){
 let pool=[...QUESTIONS];
 if(specificSource) pool=pool.filter(q=>q.source===specificSource);
 else {
   if(selectedTopicKeys.size) pool=pool.filter(q=>selectedTopicKeys.has(topicKey(q)));
   else if(catSel.value!=='all')pool=pool.filter(q=>q.cat===catSel.value || v5Meta(q).area===catSel.value);
   if(sourceSel.value!=='all')pool=pool.filter(q=>q.source===sourceSel.value);
   if(diffSel.value!=='all')pool=pool.filter(q=>q.diff===diffSel.value);
 }
 if(mode==='errors')pool=pool.filter(q=>state.errors.includes(q.id));
 if(mode==='favorites')pool=pool.filter(q=>state.favorites.includes(q.id));
 if(!specificSource && dedupeChk.checked)pool=dedupe(pool);
 if(!pool.length){alert('Nenhuma questão encontrada para esta seleção.');return}
 const qty=specificSource?pool.length:+qtySel.value;

 if(mode==='adaptive' && !specificSource){
   const eligible=pool.filter(q=>v5Meta(q).masteryEligible);
   if(eligible.length){
     session=TranspetroMasteryV5.selectAdaptiveQuestions(eligible,Math.min(qty,eligible.length),{onlyMasteryEligible:true});
   } else {
     session=shuffle(pool).slice(0,Math.min(qty,pool.length));
   }
 } else {
   session=ordered?pool.sort((a,b)=>a.sourceNum-b.sourceNum):shuffle(pool).slice(0,Math.min(qty,pool.length));
 }
 idx=0;show('quiz');renderQuestion();
}
function renderQuestion(){
 locked=false;feedback.innerHTML='';nextBtn.classList.add('hidden');
 const q=current(); if(!q){finish();return}
 const meta=v5Meta(q);qCat.textContent=[meta.area,meta.topic].filter(Boolean).join(' • ')||q.cat;qDiff.textContent=q.diff;qSource.textContent=q.source.replaceAll('_',' ');qCount.textContent=`${idx+1} / ${session.length}`;
 qProg.style.width=`${idx/session.length*100}%`;qText.textContent=q.q;
 favBtn.textContent=(state.favorites.includes(q.id)?'★':'☆')+' Favoritar';
 options.innerHTML=q.opts.map((o,i)=>`<button class="option" data-choice="${i}"><b>${LETTERS[i]})</b> ${esc(o)}</button>`).join('');
 document.querySelectorAll('.option').forEach(b=>b.addEventListener('click',()=>answer(+b.dataset.choice)));
 window.scrollTo({top:0,behavior:'smooth'});
}
function structuredExplanation(q){
 const meta=v5Meta(q),raw=(q.exp||'').trim(),correctText=q.opts[q.ans]||'';
 const trivial=/^(correta\.?|correto\.?|correct\.?|alternativa correta\.?)$/i.test(raw) || raw.length<35;
 const why=trivial
   ? `A alternativa correta é “${esc(correctText)}”. Ela corresponde ao conceito cobrado: ${esc(meta.conceptLabel||meta.subtopic||meta.topic||meta.area||q.cat)}.`
   : esc(raw);
 const path=[meta.area,meta.topic,meta.subtopic].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).map(esc).join(' › ');
 return `<div class="exp-box"><b>Resposta correta</b><div>${LETTERS[q.ans]}) ${esc(correctText)}</div></div>
 <div class="exp-box"><b>Por quê?</b><div>${why}</div></div>
 ${meta.conceptLabel?`<div class="exp-box"><b>Ponto-chave para memorizar</b><div>${esc(meta.conceptLabel)}</div></div>`:''}
 ${path?`<div class="exp-path">Tema: ${path}</div>`:''}
 ${trivial?'<div class="exp-warning">Explicação original curta: esta questão foi sinalizada para aprofundamento pedagógico.</div>':''}`;
}
function answer(choice){
 if(locked)return;locked=true;const q=current(),correct=choice===q.ans,meta=v5Meta(q);
 [...document.querySelectorAll('.option')].forEach((b,i)=>{if(i===q.ans)b.classList.add('correct');if(i===choice&&!correct)b.classList.add('wrong')});

 state.answered[q.id]={correct,at:Date.now(),cat:q.cat,source:q.source};
 if(correct)state.errors=state.errors.filter(x=>x!==q.id); else if(!state.errors.includes(q.id))state.errors.push(q.id);

 let masteryInfo='';
 try{
   const ms=TranspetroMasteryV5.recordAttempt({
     questionId:q.id,choiceIndex:choice,correct,
     responseTimeMs:null,questions:QUESTIONS,independent:true
   });
   if(meta.masteryEligible && meta.conceptId && ms.concepts[meta.conceptId]){
     const cs=ms.concepts[meta.conceptId];
     masteryInfo=`<div class="mastery-chip">Conceito: ${esc(meta.conceptLabel||meta.conceptId)} • domínio ${cs.mastery}/5 • ${esc(cs.status)}</div>`;
   }else if(!meta.masteryEligible){
     masteryInfo='<div class="mastery-chip">Questão disponível para treino, ainda fora do diagnóstico de domínio.</div>';
   }
 }catch(e){console.warn('Mastery Engine:',e)}

 feedback.innerHTML=`<div class="feedback ${correct?'ok':'bad'}"><b>${correct?'✓ Correto':'✗ Incorreto'}</b>
 ${structuredExplanation(q)}
 ${masteryInfo}
 <div class="small" style="margin-top:8px">Fonte: ${esc(q.source)} • Questão original: ${q.sourceNum}</div></div>`;
 nextBtn.classList.remove('hidden');save();
}
function finish(){
 qProg.style.width='100%';
 const results=session.map(q=>state.answered[q.id]).filter(Boolean),ok=results.filter(x=>x.correct).length;
 qText.textContent='Treino concluído';options.innerHTML='';
 feedback.innerHTML=`<div class="feedback ok"><b>${ok} de ${session.length}</b> corretas (${Math.round(ok/session.length*100)}%).<br><span class="small">Os erros foram enviados automaticamente ao Caderno de Erros.</span></div>`;
 nextBtn.classList.add('hidden');
}
function renderDashboard(){
 const vals=Object.values(state.answered),ok=vals.filter(x=>x.correct).length;
 sAnswered.textContent=vals.length;sAccuracy.textContent=(vals.length?Math.round(ok/vals.length*100):0)+'%';sErrors.textContent=state.errors.length;
 const cats=[...new Set(QUESTIONS.map(q=>q.cat))].sort();
 categoryStats.innerHTML=`<table><thead><tr><th>Área</th><th>Respondidas</th><th>Acerto</th></tr></thead><tbody>${cats.map(c=>{let ids=QUESTIONS.filter(q=>q.cat===c).map(q=>q.id),a=ids.filter(id=>state.answered[id]),cor=a.filter(id=>state.answered[id].correct).length;return `<tr><td>${esc(c)}</td><td>${a.length} / ${ids.length}</td><td>${a.length?Math.round(cor/a.length*100):0}%</td></tr>`}).join('')}</tbody></table>`;

 try{
   const d=TranspetroMasteryV5.getDashboard(QUESTIONS);
   if(window.v5Due)v5Due.textContent=d.dueToday;
   if(window.v5Learning)v5Learning.textContent=(d.masteryBuckets.seen||0)+(d.masteryBuckets.learning||0)+(d.masteryBuckets.consolidating||0);
   if(window.v5Strong)v5Strong.textContent=d.masteryBuckets.strong||0;
   if(window.v5Mastered)v5Mastered.textContent=d.masteryBuckets.mastered||0;
 }catch(e){console.warn('Dashboard V5:',e)}
}
function renderErrors(){
 const qs=QUESTIONS.filter(q=>state.errors.includes(q.id));
 errorList.innerHTML=qs.length?qs.map(q=>`<div style="padding:11px 0;border-bottom:1px solid var(--line)"><b>${esc(q.cat)} • ${esc(q.source)}</b><div class="small">${esc(q.q)}</div></div>`).join(''):'<div class="small">Nenhum erro ativo.</div>';
}
function toggleFav(){
 const q=current();if(!q)return;
 state.favorites=state.favorites.includes(q.id)?state.favorites.filter(x=>x!==q.id):[...state.favorites,q.id];save();renderQuestion();
}
function exportProgress(){
 const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Transpetro_V5_Progresso.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
function renderSources(){
 sourceCards.innerHTML=Object.entries(SOURCE_COUNTS).sort((a,b)=>a[0].localeCompare(b[0])).map(([s,n])=>`<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row"><div class="grow"><b>${esc(s.replaceAll('_',' '))}</b><div class="small">${n} questões importadas</div></div><button data-source="${esc(s)}">Iniciar</button></div></div>`).join('');
 sourceCards.querySelectorAll('button[data-source]').forEach(b=>b.addEventListener('click',()=>startQuiz('normal',b.dataset.source,true)));
 libraryList.innerHTML=Object.entries(SOURCE_COUNTS).sort((a,b)=>a[0].localeCompare(b[0])).map(([s,n])=>`<div>${esc(s.replaceAll('_',' '))}</div><div>${n} questões</div>`).join('');
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
startBtn.addEventListener('click',()=>startQuiz('adaptive'));
freeBtn.addEventListener('click',()=>startQuiz('normal'));
errorsBtn.addEventListener('click',()=>startQuiz('errors'));
favBtnHome.addEventListener('click',()=>startQuiz('favorites'));
randomBtn.addEventListener('click',()=>{selectedTopicKeys.clear();renderTopicMultiList();catSel.value='all';sourceSel.value='all';diffSel.value='all';qtySel.value='10';startQuiz('normal')});
nextBtn.addEventListener('click',()=>{idx++;renderQuestion()});
favBtn.addEventListener('click',toggleFav);
backQuiz.addEventListener('click',()=>show('home'));
exportBtn.addEventListener('click',exportProgress);
resetBtn.addEventListener('click',()=>{if(confirm('Apagar todo o progresso salvo neste aparelho?')){state={answered:{},favorites:[],errors:[]};save();renderErrors();}});
themeBtn.addEventListener('click',()=>document.body.classList.toggle('light'));
buildFilters();renderSources();renderDashboard();


window.TranspetroV6 = (() => {
 const VERSION='6.0.0', ATTEMPT_KEY='transpetro_v6_attempts', SETTINGS_KEY='transpetro_v6_settings';
 const load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
 const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
 const norm=q=>({...q,areaV6:q.area||q.cat||'Outros',topicV6:q.topic||q.cat||'Geral',subtopicV6:q.subtopic||'',conceptIdV6:q.conceptId||q.fp||q.id,conceptLabelV6:q.conceptLabel||q.subtopic||q.topic||q.cat||'Conceito geral',masteryEligibleV6:q.masteryEligible!==false});
 const qMap=new Map(QUESTIONS.map(q=>[q.id,norm(q)]));
 function recordAttempt({questionId,choiceIndex,responseTimeMs=0,mode='practice',attemptedAt=new Date().toISOString()}){const q=qMap.get(questionId);if(!q)return null;const correct=Number(choiceIndex)===Number(q.ans);const a=load(ATTEMPT_KEY,[]);const r={id:(crypto.randomUUID?crypto.randomUUID():`${Date.now()}_${Math.random().toString(36).slice(2)}`),questionId,conceptId:q.conceptIdV6,area:q.areaV6,topic:q.topicV6,subtopic:q.subtopicV6,choiceIndex:Number(choiceIndex),correct,responseTimeMs:Number(responseTimeMs)||0,mode,attemptedAt};a.push(r);if(a.length>5000)a.splice(0,a.length-5000);save(ATTEMPT_KEY,a);return r}
 function conceptStats(conceptId){const a=load(ATTEMPT_KEY,[]).filter(x=>x.conceptId===conceptId);if(!a.length)return{attempts:0,accuracy:0,mastery:0,due:true};const r=a.slice(-8),accuracy=r.filter(x=>x.correct).length/r.length,spaced=r.filter((x,i)=>x.correct&&(i===0||new Date(x.attemptedAt)-new Date(r[Math.max(0,i-1)].attemptedAt)>21600000)).length,speed=r.filter(x=>x.correct&&x.responseTimeMs>0&&x.responseTimeMs<25000).length/r.length,mastery=Math.max(0,Math.min(5,Math.round((accuracy*3.4+Math.min(1,spaced/3)*1.1+speed*.5)*10)/10)),last=new Date(r[r.length-1].attemptedAt),days=mastery>=4.5?14:mastery>=3.5?7:mastery>=2.5?3:mastery>=1.5?1:0,due=Date.now()-last.getTime()>=days*86400000;return{attempts:a.length,accuracy,mastery,due}}
 function filterByThemes(themes=[]){if(!themes.length)return QUESTIONS.slice();const w=themes.map(x=>x.toLowerCase());return QUESTIONS.filter(raw=>{const q=norm(raw),t=[q.areaV6,q.topicV6,q.subtopicV6,q.conceptLabelV6,q.cat].join(' ').toLowerCase();return w.some(x=>t.includes(x))})}
 function adaptivePick(pool,count=20){const s=pool.map(raw=>{const q=norm(raw),c=conceptStats(q.conceptIdV6);let score=0;if(!c.attempts)score+=45;if(c.due)score+=35;score+=(5-c.mastery)*12;if(!q.masteryEligibleV6)score-=25;score+=Math.random()*8;return{q:raw,score}}).sort((a,b)=>b.score-a.score);const out=[],seen=new Map();for(const x of s){const q=norm(x.q),n=seen.get(q.conceptIdV6)||0;if(n>=2)continue;out.push(x.q);seen.set(q.conceptIdV6,n+1);if(out.length>=count)break}return out}
 function explanationFor(q){const exp=(q.exp||'').trim(),weak=exp.length<70||/^(correta|correct|certo|resposta correta)\.?$/i.test(exp);return{base:exp,weak,keyPoint:weak?'Justificativa curta: priorizar revisão pedagógica.':'Revise o conceito central e relacione-o ao enunciado.',path:[q.area||q.cat,q.topic,q.subtopic,q.conceptLabel].filter(Boolean).join(' → ')}}
 function exportProgress(){const p={version:VERSION,exportedAt:new Date().toISOString(),attempts:load(ATTEMPT_KEY,[]),settings:load(SETTINGS_KEY,{})},b=new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='Transpetro_V6_Progresso.json';a.click();URL.revokeObjectURL(a.href)}
 return{VERSION,recordAttempt,conceptStats,filterByThemes,adaptivePick,explanationFor,exportProgress};
})();
