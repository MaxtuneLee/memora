
import { createVectorDbClient, getVectorDbContentHash } from "/src/lib/vector-db/client.ts";
import { buildBgeIndexConfig } from "/src/lib/playground/vectorDbConfig.ts";
import { BeirEmbeddingPool } from "/src/lib/playground/beirEmbeddingPool.ts";
import { rerankCandidateIds, scoreBeirRanking } from "/src/lib/playground/beirRerankerMetrics.ts";
import { getBeirRerankerProfile } from "@memora/local-model-runtime";
import { BeirJevPool, readSavedJevKey } from "/src/lib/playground/beirJevPool.ts";
import { JEV_RERANKER, runResumableEvaluation } from "@memora/evaluation";

document.body.innerHTML='<h1>Memora BEIR reranker comparison</h1>\n<p>Compare Hybrid with Hybrid + selected reranker on the same candidate documents, complete test queries and official relevance labels. Existing document indexes, saved query vectors and previous reports are retained.</p>\n<p><label for="k">Recall cutoff k</label> <input id="k" type="number" min="1" max="200" value="20"> <label for="candidates">Documents to rerank</label> <input id="candidates" type="number" min="20" max="200" value="100"> <label for="worker-count">Model workers</label> <select id="worker-count"><option>1</option><option>2</option><option selected>4</option></select> <button id="gpu-check">Check WebGPU</button> <button id="apply">Use these settings</button></p>\n<p>Queries reuse saved vectors. Document pairs run concurrently on the existing model worker pool; the actual backend and each worker reply are shown below. Retrieval and pair-scoring times are reported separately. Model loading and checkpoint writes are excluded from pair-scoring time.</p>\n<p><label><input type="checkbox" checked disabled> Continue saved evaluation, including saved document-pair scores</label></p>\n<button id="run" disabled>Run reranker comparison</button> <button id="stop" disabled>Stop</button>\n<pre id="status">Reading source report…</pre><pre id="worker">Reranker worker has not started.</pre>\n<details open><summary>Recent progress logs</summary><pre id="logs">Ready</pre></details>\n<table><thead><tr><th>Dataset</th><th>Method</th><th>Queries</th><th>nDCG</th><th>Recall</th><th>Median retrieval</th><th>Median cumulative scoring work</th><th>Median rerank wall time with checkpoint I/O</th><th>API input tokens</th></tr></thead><tbody id="results"></tbody></table>\n';
document.title="Memora BEIR comparison — reranker";
const params=new URLSearchParams(location.search),K=Number(params.get('k')??20),N=Number(params.get('candidates')??100);
if(!Number.isInteger(K)||!Number.isInteger(N)||K<1||K>200||N<Math.max(10,K)||N>200)throw Error('Choose whole numbers: 1 ≤ k ≤ 200, max(10,k) ≤ candidates ≤ 200.');
const MODEL=params.get('model')??'base',RERANKER=MODEL==='jev'?JEV_RERANKER:getBeirRerankerProfile(MODEL),DEVICE=RERANKER.device,TRIAL=params.get('trial')==='1',SELECTED=params.get('dataset');
const PREFIX=MODEL==='jev'?'beir-reranker-jev':'beir-reranker'+(MODEL==='base'?'-base-fp32-webgpu':'');
const POOL=5*(N+1),FILE=`${PREFIX}-k${K}-c${N}-v1${SELECTED?"-"+SELECTED:""}${TRIAL?"-trial":""}.json`,PROGRESS=`${PREFIX}-k${K}-c${N}-v1${SELECTED?"-"+SELECTED:""}${TRIAL?"-trial":""}-progress.json`;
const SOURCE='beir-dissertation-k20.json',SOURCE_SHA='246ec878d75be4daf257ed2c2f33e7b6cb6d64688ac7f88316c0c0a732010fb8';
const DATASETS={scifact:[5183,300],nfcorpus:[3633,323],arguana:[8674,1406]};
if(SELECTED&&!Object.hasOwn(DATASETS,SELECTED))throw Error("Unknown BEIR dataset.");
const ACTIVE=SELECTED?[SELECTED]:TRIAL?["scifact"]:Object.keys(DATASETS),EXPECTED=ACTIVE.length*2;
const el=id=>document.getElementById(id),run=el('run'),stop=el('stop'),status=el('status'),workerStatus=el('worker'),logsElement=el('logs');
el('worker-count').value=MODEL==='base'?'1':'4';el('k').value=String(K);el('candidates').value=String(N);
let source,report,settingsHash,priorReport,controller,db,client,warmup,monitor,saveQueue=Promise.resolve(),progressQueue=Promise.resolve(),events=[],lastProgressSave=0,lastWorkerReplyAt=null,workerPhase='not started',restoreFailed=false,running=false;
const scoreValue=v=>MODEL==='jev'?v.relevanceProbability:v.logit;
const snapshot=v=>JSON.parse(JSON.stringify(v));
function log(event,detail={}){events.push({at:new Date().toISOString(),event,...detail});events=events.slice(-100);logsElement.textContent=events.map(e=>JSON.stringify(e)).join('\n');console.info('[beir-reranker]',event,detail);}
function stage(message){status.textContent=message;if(report)report.stage=message;}
async function read(path,optional=false,signal=controller?.signal){
  const response=await fetch('/api/playground/eval-data/results/'+path,{cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000)});
  if(optional&&response.status===404)return null;if(!response.ok)throw Error(`Reading ${path}: HTTP ${response.status}`);return response.text();
}
async function write(path,value){
  const body=typeof value==='string'?value:JSON.stringify(value,null,2);
  for(let attempt=0;attempt<4;attempt++){
    try{const response=await fetch('/api/playground/eval-data/results/'+path,{method:'PUT',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(45000)});if(response.ok)return;if(![408,429,500,502,503,504].includes(response.status))throw Error(`Writing ${path}: permanent HTTP ${response.status}`);throw Error(`Writing ${path}: HTTP ${response.status}`);}catch(error){if(attempt===3||String(error).includes('permanent'))throw error;log('checkpoint write retry',{path,error:String(error),attempt:attempt+1});await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));}
  }
}
function save(){const value=snapshot({...report,recentLogs:events});const pending=saveQueue.then(()=>write(FILE,value));saveQueue=pending.catch(()=>{});return pending;}
function saveProgress(force=false){
  if(!report||(!force&&Date.now()-lastProgressSave<2000))return Promise.resolve();lastProgressSave=Date.now();
  const value=snapshot({protocol:report.protocol,status:report.status,updatedAt:new Date().toISOString(),stage:report.stage,progress:report.progress,completedResults:report.results.length,execution:report.execution,workers:client?.progress()??[],lastWorkerReplyAt,workerPhase,recentLogs:events,errors:report.errors});
  const pending=progressQueue.then(()=>write(PROGRESS,value));progressQueue=pending.catch(()=>{});return pending;
}
function storage(){const cache=new Map();return {
  exists:async path=>{const text=await read(path,true);if(text===null)return false;cache.set(path,text);return true;},
  readText:async path=>{if(cache.has(path)){const text=cache.get(path);cache.delete(path);return text;}const text=await read(path);return text;},
  write:async(path,text)=>write(path,text),
};}
function median(values){const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;}
function fingerprint(value){return getVectorDbContentHash(JSON.stringify(value));}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function metrics(ids,relevance){const result={};for(const k of new Set([10,K])){const value=scoreBeirRanking(ids,relevance,k);result[`ndcgAt${k}`]=value.ndcg;result[`recallAt${k}`]=value.recall;}return result;}
function render(){
  el('results').replaceChildren();for(const result of report?.results??[]){const tr=document.createElement('tr');for(const value of [result.dataset,result.method,result.queryCount,(100*result[`ndcgAt${K}`]).toFixed(2),(100*result[`recallAt${K}`]).toFixed(2),result.medianSearchMs.toFixed(1)+' ms',result.medianScoringMs.toFixed(1)+' ms',Number.isFinite(result.medianScoringWallMsWithCheckpointIO)?result.medianScoringWallMsWithCheckpointIO.toFixed(1)+' ms':'n/a',result.apiUsage?.input_tokens??'n/a']){const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);}el('results').appendChild(tr);}
}
function validateCandidate(value,q){
  if(!value||value.queryId!==q.queryId||value.queryText!==q.queryText||!Array.isArray(value.candidates)||value.candidates.length!==N||!Number.isFinite(value.searchMs)||value.searchMs<0)throw Error('Candidate checkpoint differs from the query or retrieval depth.');
  const ids=value.candidates.map(c=>c.documentId);if(new Set(ids).size!==N||ids.includes(q.queryId)||value.candidates.some(c=>typeof c.documentId!=='string'||typeof c.content!=='string'))throw Error('Candidate IDs or document text are invalid.');return value;
}
function validateCase(value,q,candidate){
  if(!value||value.queryId!==q.queryId||value.queryText!==q.queryText||!same(value.relevance,q.relevance)||!same(value.candidateIds,candidate.candidates.map(c=>c.documentId))||value.backend!==DEVICE||!Number.isFinite(value.scoringMs)||value.scoringMs<0||value.searchMs!==candidate.searchMs)throw Error('Saved reranker query differs from its source or timing conditions.');
  if(!Array.isArray(value.scores)||value.scores.some(s=>s.backend!==DEVICE||!Number.isFinite(s.scoringMs)||s.scoringMs<0)||Math.abs(value.scoringMs-value.scores.reduce((n,s)=>n+s.scoringMs,0))>1e-6)throw Error('Saved pair-scoring times differ.');
  const ordered=rerankCandidateIds(value.candidateIds,value.scores);if(!same(ordered,value.rankedAll)||!same(value.baselineRankedAll,value.candidateIds))throw Error('Saved reranker order differs from pair scores.');
  const cutoff=metrics(ordered,q.relevance),base=metrics(value.candidateIds,q.relevance);for(const key of Object.keys(cutoff)){if(!Number.isFinite(value[key])||Math.abs(cutoff[key]-value[key])>1e-10||Math.abs(base[key]-value.baselineMetrics[key])>1e-10)throw Error('Saved reranker metrics are invalid.');}return value;
}
async function restore(){
  try{
    const text=await read(SOURCE);if(await getVectorDbContentHash(text)!==SOURCE_SHA)throw Error('The verified @20 source report changed. No previous report will be overwritten.');source=JSON.parse(text);
    if(source.status!=='complete'||source.results.length!==9||source.errors.length)throw Error('A complete verified @20 report is required.');
    for(const [name,counts] of Object.entries(DATASETS)){
      const meta=source.datasets.find(d=>d.name===name),base=source.results.find(r=>r.dataset==='full-beir-'+name&&r.method==='hybrid');
      if(!meta||!base||meta.corpusCount!==counts[0]||base.cases.length!==counts[1]||new Set(base.cases.map(c=>c.queryId)).size!==counts[1]||!meta.queryVectors?.fingerprint)throw Error('Source dataset counts or query vectors are invalid.');
    }
    const config={k:K,rerankCandidates:N,retrievalCandidatePool:POOL,rrfK:60,sourceReport:SOURCE,sourceReportRawSha256:SOURCE_SHA,queryConcurrency:1,queryVectorPolicy:'Existing prepared vectors; query encoding excluded',reranker:RERANKER,document:'Stored title + space + text; one passage',sameIdExcluded:true};
    if(TRIAL)config.queryLimitPerDataset=3;if(SELECTED)config.datasets=[SELECTED];
    settingsHash=await fingerprint(config);
    if(MODEL==='base'||MODEL==='jev'){const old=await read(`beir-reranker-k${K}-c${N}-v1.json`,true);if(old){const candidate=JSON.parse(old);if(candidate.config?.sourceReportRawSha256===SOURCE_SHA&&candidate.config.rerankCandidates===N&&candidate.config.retrievalCandidatePool===POOL&&candidate.config.rrfK===60&&candidate.config.k===K&&candidate.settingsHash===await fingerprint(candidate.config))priorReport=candidate;}}const saved=await read(FILE,true);
    if(saved){report=JSON.parse(saved);if(report.protocol!=='memora-beir-reranker-v1'||report.settingsHash!==settingsHash||!same(report.config,config))throw Error('Saved reranker settings differ.');events=report.recentLogs??[];}
    else report={protocol:'memora-beir-reranker-v1',settingsHash,config,status:'ready',startedAt:null,datasets:snapshot(source.datasets),results:[],errors:[],indexChecks:[],resumes:[]};
    const keys=new Set();for(const result of report.results){
      const name=result.dataset?.replace('full-beir-',''),base=source.results.find(r=>r.dataset===result.dataset&&r.method==='hybrid');
      if(!ACTIVE.includes(name)||!['hybrid','hybrid-reranker'].includes(result.method)||keys.has(result.dataset+'/'+result.method)||!base||result.queryCount!==Math.min(base.cases.length,TRIAL?3:Infinity)||result.cases.length!==Math.min(base.cases.length,TRIAL?3:Infinity))throw Error('Saved result keys or query counts differ.');keys.add(result.dataset+'/'+result.method);
      for(let i=0;i<result.cases.length;i++){const c=result.cases[i];validateCase(c,base.cases[i],{candidates:c.candidateIds.map(documentId=>({documentId})),searchMs:c.searchMs});}
      for(const n of new Set([10,K]))for(const metric of ['ndcg','recall']){const key=`${metric}At${n}`,value=result.cases.reduce((s,c)=>s+(result.method==='hybrid'?c.baselineMetrics[key]:c[key]),0)/result.queryCount;if(!Number.isFinite(result[key])||Math.abs(value-result[key])>1e-10)throw Error('Saved aggregate metrics differ.');}
      if(Math.abs(result.medianSearchMs-median(result.cases.map(c=>c.searchMs)))>1e-6||Math.abs(result.medianScoringMs-(result.method==='hybrid'?0:median(result.cases.map(c=>c.scoringMs))))>1e-6)throw Error('Saved aggregate times differ.');
    }
    if(report.status==='complete'&&(keys.size!==(EXPECTED)||report.errors.length))throw Error('Saved complete report is incomplete or contains errors.');
    render();run.disabled=report.status==='complete';run.textContent=saved?'Continue reranker comparison':'Run reranker comparison';stage(saved?`Restored ${report.results.length}/${EXPECTED} results. Saved queries and document-pair scores will be retained.`:`Ready. Hybrid top ${N} → reranker top ${K}; lexical/semantic candidate pools ${POOL}.`);log('source report verified',{sha256:SOURCE_SHA,queries:2029,modelRevision:RERANKER.revision});
  }catch(error){restoreFailed=true;run.disabled=true;stage(String(error));log('restore failed',{error:String(error)});}
}
async function loadVector(meta,q,index){
  const cfg=source.config,expected=await fingerprint({queries:meta.queriesSha256,model:cfg.model,dtype:cfg.dtype,pooling:cfg.pooling,normalized:cfg.normalized,dimensions:384,protocol:'beir-query-vectors-v1'});if(meta.queryVectors.fingerprint!==expected)throw Error('Source query-vector settings differ.');
  const entry=JSON.parse(await read(`beir-query-vectors/${meta.name}/${expected}/items/${index}.json`));
  const value=entry.result;if(entry.fingerprint!==expected||entry.itemId!==q.queryId||value.queryId!==q.queryId||value.queryText!==q.queryText||!Array.isArray(value.vector)||value.vector.length!==384||value.vector.some(v=>!Number.isFinite(v))||Math.abs(Math.sqrt(value.vector.reduce((s,v)=>s+v*v,0))-1)>.02)throw Error('Saved query vector is missing or incompatible.');return new Float32Array(value.vector);
}
function renderWorkers(pool){workerStatus.textContent=pool.progress().map(s=>`${MODEL==='jev'?'API request':'Worker'} ${s.workerId+1}: ${s.phase}; document ${(s.startIndex??-1)+1}; ${s.completedTexts} scores; ${s.backend??"backend pending"}; last actual reply ${s.lastWorkerEventAt?Math.round((Date.now()-s.lastWorkerEventAt)/1000)+"s ago":"pending"}`).join("\n");}
function makePool(count) {
  const Pool=MODEL==='jev'?BeirJevPool:BeirEmbeddingPool;
  const pool=new Pool({workerCount:count,rerankerProfile:MODEL,apiKey:el('jev-key').value.trim(),onProgress:(state,event)=>{
    if(state.lastWorkerEventAt)lastWorkerReplyAt=Math.max(lastWorkerReplyAt??0,state.lastWorkerEventAt);
    workerPhase=state.phase;renderWorkers(pool);
    log((MODEL==='jev'?'API request ':'model worker ')+event,{...state,source:['dispatched','completed','failed','canceled'].includes(event)?'main-thread':'worker'});
    void saveProgress().catch(error=>log('progress write failed',{error:String(error)}));
  }});return pool;
}
async function checkGpu(signal){
  const probe=makePool(1);try{
    const result=await probe.scorePair('What is a panda?','The giant panda is a bear native to China.','webgpu',signal,null,false);
    return {supported:true,backend:result.backend,logit:result.logit,at:new Date().toISOString(),cpuFallbackDisabled:MODEL==='m3'};
  }catch(error){if(signal.aborted)throw error;return {supported:false,error:String(error),at:new Date().toISOString(),cpuFallbackDisabled:MODEL==='m3'};}
  finally{probe.dispose();}
}
el('gpu-check').onclick=async()=>{await ready;if(running||restoreFailed)return;running=true;run.disabled=true;el('apply').disabled=true;el('worker-count').disabled=true;el('gpu-check').disabled=true;const signal=new AbortController().signal;stage('Checking the selected model on WebGPU…');try{report.webgpuProbe=await checkGpu(signal);stage(JSON.stringify(report.webgpuProbe));await save();}finally{running=false;run.disabled=report.status==='complete';el('apply').disabled=false;el('worker-count').disabled=false;el('gpu-check').disabled=false;}};
async function warm(){
  if(!warmup)warmup=(async()=>{
    stage(MODEL==='jev'?'Checking Jev API responses; each concurrent request is shown below.':'Loading the existing model worker pool; each worker is shown below.');
    client=makePool(Number(el('worker-count').value));
    const started=performance.now(),good=await client.warmReranker(DEVICE,controller.signal);
    const bad=await client.scorePair('What is a panda?','A database stores records in tables.',DEVICE,controller.signal,null,false);
    report.modelLoadMs=performance.now()-started;
    if(MODEL==='jev')report.apiSmokeCheck={responses:[...good,bad],excludedFromBenchmark:true};
    report.smokeCheck={passed:good.every(score=>scoreValue(score)>scoreValue(bad)),relevantScore:scoreValue(good[0]),unrelatedScore:scoreValue(bad),workerCount:good.length,backend:DEVICE,excludedFromBenchmark:true};
    await save();
    if(!report.smokeCheck.passed)throw Error('Reranker smoke check failed: '+JSON.stringify(report.smokeCheck));
    log('model pool smoke check passed',report.smokeCheck);await save();
  })();await warmup;
}
async function evaluateDataset(name){
  const meta=source.datasets.find(d=>d.name===name),scope='full-beir-'+name,allQueries=source.results.find(r=>r.dataset===scope&&r.method==='hybrid').cases,queries=TRIAL?allQueries.slice(0,3):allQueries;
  if(report.results.filter(r=>r.dataset===scope).length===2){log('completed dataset retained',{dataset:name});return;}
  const directory=`${MODEL==='jev'?'beir-reranker-jev-checkpoints':MODEL==='base'?'beir-reranker-base-checkpoints':'beir-reranker-checkpoints'}/${settingsHash}/${name}`;
  const conf={...{...buildBgeIndexConfig('bge-small-en',0),pooling:'cls'},chunkerName:'beir-document',chunkerVersion:'full-subsets-v3-'+name+'-semantic',modelRevision:'Xenova/bge-small-en-v1.5:q8',segmenterPipelineVersion:'full-beir-v3'};
  stage(`${name}: opening saved semantic index`);await db.initialize(conf);const [state]=await db.checkDocuments([{documentId:scope,contentHash:meta.corpusSha256}]);
  if(!state?.exists||!state.matches||state.indexedChunkCount!==meta.corpusCount)throw Error(`${name}: saved index is missing or differs. This test will not rebuild documents.`);report.indexChecks=report.indexChecks.filter(c=>c.dataset!==name);report.indexChecks.push({dataset:name,corpusSha256:meta.corpusSha256,documents:state.indexedChunkCount,reused:true});await save();
  const candidateFingerprint=await fingerprint({settingsHash,corpus:meta.corpusSha256,queries:meta.queriesSha256,config:conf,stage:'hybrid-candidates-v1'});
  const candidates=await runResumableEvaluation({checkpointPath:directory+'/candidates',fingerprint:candidateFingerprint,items:queries,itemId:q=>q.queryId,storage:storage(),signal:controller.signal,concurrency:1,validateResult:validateCandidate,
    evaluate:async(q,i,signal)=>{
      stage(`${name}: retrieving candidates for query ${i+1}/${queries.length}`);
      if(priorReport){const priorFp=await fingerprint({settingsHash:priorReport.settingsHash,corpus:meta.corpusSha256,queries:meta.queriesSha256,config:conf,stage:'hybrid-candidates-v1'});const raw=await read(`beir-reranker-checkpoints/${priorReport.settingsHash}/${name}/candidates/items/${i}.json`,true);if(raw){const entry=JSON.parse(raw);if(entry.fingerprint!==priorFp||entry.itemId!==q.queryId)throw Error('Prior candidate fingerprint differs.');report.candidateReuse={sourceReport:`beir-reranker-k${K}-c${N}-v1.json`,sameCandidatePool:POOL,queryIdsAndTextsChecked:true};return validateCandidate(entry.result,q);}}
      const vector=await loadVector(meta,q,i);signal.throwIfAborted();const started=performance.now();
      const hits=await db.search({query:q.queryText,queryEmbedding:vector,scope:{kind:'documents',documentIds:[scope]},topK:N+1,lexicalCandidateK:POOL,semanticCandidateK:POOL,lexicalWeight:1,semanticWeight:1,rrfK:60});const searchMs=performance.now()-started;
      const seen=new Set(),documents=[];for(const hit of hits){if(hit.documentId!==scope||!hit.chunkId.startsWith(scope+':'))throw Error('Candidate returned from a different dataset.');const id=hit.chunkId.slice(scope.length+1);if(id!==q.queryId&&!seen.has(id)){seen.add(id);documents.push({documentId:id,content:hit.content});}}if(documents.length<N)throw Error('Insufficient distinct candidates.');return {queryId:q.queryId,queryText:q.queryText,candidates:documents.slice(0,N),searchMs};
    },onProgress:async p=>{report.progress={dataset:name,phase:'candidates',completed:p.completed,total:p.total,resumed:p.resumed};if(p.completed%10===0||p.completed===p.total){log('candidate queries saved',report.progress);await save();}await saveProgress();},
  });
  const queryFingerprint=await fingerprint({candidateFingerprint,qrels:meta.qrelsSha256,reranker:RERANKER,stage:'paired-query-results-v1',k:K});
  const cases=await runResumableEvaluation({checkpointPath:directory+'/queries',fingerprint:queryFingerprint,items:queries,itemId:q=>q.queryId,storage:storage(),signal:controller.signal,concurrency:1,
    validateResult:(value,q,i)=>validateCase(value,q,candidates[i]),
    evaluate:async(q,i,signal)=>{
      if(MODEL==='jev'&&client)client.setDataset(name);await warm();if(MODEL==='jev')client.setDataset(name);const scoringWallStarted=performance.now();let resumedScores=0;
      const candidate=candidates[i],pairFingerprint=await fingerprint({queryFingerprint,query:q.queryText,documents:candidate.candidates});
      const pairs=await runResumableEvaluation({checkpointPath:directory+`/pairs/${i}`,fingerprint:pairFingerprint,items:candidate.candidates,itemId:c=>c.documentId,storage:storage(),signal,concurrency:Number(el('worker-count').value),
        validateResult:(value,c)=>{if(!value||value.documentId!==c.documentId||!Number.isFinite(scoreValue(value))||(MODEL==='jev'&&(value.relevanceProbability<0||value.relevanceProbability>1||value.model!==RERANKER.modelId))||!Number.isFinite(value.scoringMs)||value.scoringMs<0||value.backend!==DEVICE)throw Error('Saved document-pair score is invalid.');return value;},
        evaluate:async(c,j,pairSignal)=>{await warm();pairSignal.throwIfAborted();stage(`${name}: query ${i+1}/${queries.length}, reranking document ${j+1}/${N}`);log('pair dispatched',{dataset:name,queryIndex:i,documentIndex:j,documentId:c.documentId});const value=await client.scorePair(q.queryText,c.content,DEVICE,pairSignal,j);return {documentId:c.documentId,...value,workerCount:Number(el('worker-count').value),executionId:report.execution.id};},
        onProgress:async p=>{resumedScores=p.resumed;report.progress={dataset:name,phase:'reranking',queryCompleted:i,queryTotal:queries.length,queryId:q.queryId,pairsCompleted:p.completed,pairsTotal:p.total,pairsResumed:p.resumed};if(p.completed%10===0||p.completed===p.total)log('pair scores saved',report.progress);await saveProgress();},
      });
      const ids=candidate.candidates.map(c=>c.documentId),ranked=rerankCandidateIds(ids,pairs);
      return {scoringWallMsWithCheckpointIO:performance.now()-scoringWallStarted,resumedScores,queryId:q.queryId,queryText:q.queryText,relevance:q.relevance,candidateIds:ids,baselineRankedAll:ids,rankedAll:ranked,scores:pairs,searchMs:candidate.searchMs,scoringMs:pairs.reduce((s,p)=>s+p.scoringMs,0),backend:DEVICE,baselineMetrics:metrics(ids,q.relevance),...metrics(ranked,q.relevance)};
    },onProgress:async p=>{report.progress={dataset:name,phase:'queries',completed:p.completed,total:p.total,resumed:p.resumed};log('paired query saved',report.progress);if(p.completed%10===0||p.completed===p.total)await save();await saveProgress();},
  });
  for(const method of ['hybrid','hybrid-reranker']){
    const result={medianScoringWallMsWithCheckpointIO:method==='hybrid'?0:cases.every(c=>Number.isFinite(c.scoringWallMsWithCheckpointIO))?median(cases.map(c=>c.scoringWallMsWithCheckpointIO)):undefined,apiUsage:MODEL==='jev'&&method==='hybrid-reranker'?cases.flatMap(c=>c.scores).reduce((sum,p)=>{for(const [key,value]of Object.entries(p.usage))sum[key]=(sum[key]??0)+value;return sum;},{}):undefined,dataset:scope,method,queryCount:cases.length,cases,medianSearchMs:median(cases.map(c=>c.searchMs)),medianScoringMs:method==='hybrid'?0:median(cases.map(c=>c.scoringMs)),candidateRecall:cases.reduce((s,c)=>s+scoreBeirRanking(c.candidateIds,c.relevance,N).recall,0)/cases.length};
    for(const n of new Set([10,K]))for(const metric of ['ndcg','recall']){const key=`${metric}At${n}`;result[key]=cases.reduce((s,c)=>s+(method==='hybrid'?c.baselineMetrics[key]:c[key]),0)/cases.length;}
    report.results.push(result);
  }
  await save();render();log('dataset complete',{dataset:name,queries:cases.length});
}
el('apply').onclick=()=>{const k=Number(el('k').value),n=Number(el('candidates').value);if(!Number.isInteger(k)||!Number.isInteger(n)||k<1||k>200||n<Math.max(10,k)||n>200){stage('Choose whole numbers: 1 ≤ k ≤ 200, max(10,k) ≤ candidates ≤ 200.');return;}location.href=`/beir-dissertation.html?reranker=1&model=${el('model').value}&k=${k}&candidates=${n}${SELECTED?'&dataset='+SELECTED:''}${TRIAL?'&trial=1':''}`;};
run.onclick=async()=>{
  await ready;if(restoreFailed||running||report.status==='complete')return;if(MODEL==='jev'&&!el('jev-key').value.trim()){stage('Enter a TypeSafe API key or use the saved key.');return;}running=true;run.disabled=true;stop.disabled=false;el('apply').disabled=true;el('jev-key').disabled=true;controller=new AbortController();warmup=null;client=null;el('worker-count').disabled=true;el('gpu-check').disabled=true;report.executionHistory??=[];if(report.execution)report.executionHistory.push(report.execution);report.execution={id:crypto.randomUUID(),workerCount:Number(el('worker-count').value),pairConcurrency:Number(el('worker-count').value),backend:DEVICE,startedAt:new Date().toISOString(),timing:'Cumulative pair inference work; concurrent work is not query wall latency. Earlier saved pairs retain their original conditions.'};
  if(report.startedAt)report.resumes.push({at:new Date().toISOString(),previousStatus:report.status,previousErrors:report.errors});else report.startedAt=new Date().toISOString();report.status='running';report.errors=[];delete report.finishedAt;
  let unmount=()=>{};
  monitor=setInterval(()=>{const age=lastWorkerReplyAt?Math.round((Date.now()-lastWorkerReplyAt)/1000):null;if(client)renderWorkers(client);else workerStatus.textContent=`Worker: ${workerPhase}; last actual worker reply ${age===null?'not yet received':age+' seconds ago'}.\n${report.stage}`;log('main-thread heartbeat',{lastWorkerReplyAt,workerPhase,progress:report.progress});void saveProgress().catch(error=>log('progress write failed',{error:String(error)}));},5000);
  try{
    await save();db=createVectorDbClient({workerName:'memora-beir-reranker-'+crypto.randomUUID(),onProgress:value=>log('database worker progress',{stage:value})});unmount=db.mount();
    for(const name of ACTIVE)await evaluateDataset(name);
    if(MODEL==='jev'){const usage=report.results.filter(r=>r.method==='hybrid-reranker').reduce((sum,r)=>{for(const [key,value]of Object.entries(r.apiUsage??{}))sum[key]=(sum[key]??0)+value;return sum;},{});report.apiBilling={usage,estimatedInputCostUsd:(usage.input_tokens??0)/1000000*0.042,pricePerMillionInputTokensUsd:0.042,priceSource:'https://docs.typesafe.ai/models',priceCheckedAt:'2026-10-06',includesSmokeChecks:false,failedRequestBillingUnknown:true};}if(report.results.length!==(EXPECTED))throw Error(`${EXPECTED} complete paired results are required.`);report.status='complete';report.finishedAt=new Date().toISOString();stage('Complete. Paired results saved to '+FILE);await save();render();
  }catch(error){report.status=controller.signal.aborted?'canceled':'failed';report.errors.push(String(error));stage(String(error));log('run ended',{status:report.status,error:String(error)});await save().catch(e=>log('report save failed',{error:String(e)}));}
  finally{clearInterval(monitor);await saveProgress(true).catch(error=>log('final progress save failed',{error:String(error)}));client?.dispose();client=null;unmount();running=false;stop.disabled=true;run.disabled=report.status==='complete';run.textContent='Continue reranker comparison';el('jev-key').disabled=false;el('apply').disabled=false;el('worker-count').disabled=false;el('gpu-check').disabled=false;controller=null;}
};
stop.onclick=()=>{controller?.abort();client?.dispose();stage('Stopping. Saved candidate queries and pair scores are retained.');};
el('status').textContent=`${RERANKER.modelId}; ${RERANKER.dtype}; ${DEVICE}; ${TRIAL?'3-query trial':'full query evaluation'}; datasets: ${ACTIVE.join(', ')}`;
const modelInfo=document.createElement('p');modelInfo.textContent=`${RERANKER.modelId} · ${RERANKER.dtype} · ${DEVICE} · ${ACTIVE.join(', ')} · ${TRIAL?'first 3 queries':ACTIVE.reduce((n,name)=>n+DATASETS[name][1],0)+' queries'}`;document.body.prepend(modelInfo);
const modelRow=document.createElement('p');modelRow.innerHTML='<label for="model">Reranker</label> <select id="model"><option value="base">BGE base · WebGPU</option><option value="m3">BGE M3 · WASM</option><option value="jev">Jev · TypeSafe API</option></select>';document.body.prepend(modelRow);el('model').value=MODEL;
const keyRow=document.createElement('p');keyRow.innerHTML='<label for="jev-key">TypeSafe API key</label> <input id="jev-key" type="password" autocomplete="off"> <button id="saved-key">Use saved TypeSafe key</button>';keyRow.hidden=MODEL!=='jev';document.body.prepend(keyRow);
el('gpu-check').hidden=MODEL==='jev';
if(MODEL==='jev'){document.querySelector('label[for="worker-count"]').textContent='Concurrent API requests';const note=document.createElement('p');note.textContent='Jev sends the query and each full candidate document to TypeSafe. Scores use raw relevance probabilities. Request time includes network and retries; query wall time also includes score checkpoint writes. The key is never saved in reports.';document.body.prepend(note);}
el('saved-key').onclick=async()=>{try{el('jev-key').value=await readSavedJevKey();stage(el('jev-key').value?'Saved TypeSafe key loaded.':'No saved TypeSafe key found.');}catch{stage('Could not load the saved key. Enter it above.');}};
const ready=restore();

