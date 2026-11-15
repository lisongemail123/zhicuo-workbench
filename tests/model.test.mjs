import test from 'node:test';
import assert from 'node:assert/strict';
import { today, addDays, createInitialState, validateState, applyReview, dueRecords, learningPath, suggestKnowledge, selectPaper, knowledgeStats, REASONS } from '../dist/model.js';

test('dates use Shanghai day and calendar arithmetic across year/leap boundaries',()=>{
 assert.equal(today(new Date('2026-11-14T17:00:00Z')),'2026-11-15');
 assert.equal(addDays('2026-12-31',1),'2027-01-01');
 assert.equal(addDays('2024-02-28',1),'2024-02-29');
});
test('four successful rounds advance by 2/4/7 days and complete; struggling restarts at 1 day',()=>{
 const s=createInitialState(true,'2026-11-15'),r=s.records[0];r.stage=0;
 const before=s.logs.length;
 for(const [stage,next] of [[1,'2026-11-17'],[2,'2026-11-19'],[3,'2026-11-22'],[4,null]]){
  applyReview(s,r.id,true,'2026-11-15');assert.equal(r.stage,stage);assert.equal(r.nextReview,next);assert.equal(r.status,'mastered');
 }
 assert.equal(s.logs.length,before+4);
 applyReview(s,r.id,false,'2026-11-16');assert.equal(r.nextReview,'2026-11-17');assert.equal(r.stage,0);assert.equal(r.status,'reviewing');
});
test('mastered records still appear for scheduled retesting; recycled records never enter due lists',()=>{
 const s=createInitialState(true,'2026-11-15');s.records.forEach(r=>{r.nextReview='2026-11-15';r.status='mastered';});s.records[0].archived=true;
 assert.equal(dueRecords(s,'2026-11-15').length,11);
 assert.throws(()=>applyReview(s,s.records[0].id,true),/回收站/);
});
test('learning path includes prerequisites once, in order, and rejects cycles',()=>{
 const s=createInitialState();
 assert.deepEqual(learningPath(s.knowledge,['math-quadratic','math-factor']).map(k=>k.id),['math-equation','math-factor','math-quadratic']);
 s.knowledge.find(k=>k.id==='math-equation').prerequisites=['math-quadratic'];
 assert.throws(()=>learningPath(s.knowledge,['math-quadratic']),/循环/);
});
test('knowledge candidates use subject-limited keyword matches and allow no match',()=>{
 const s=createInitialState();
 assert.ok(suggestKnowledge('抛物线的顶点坐标','数学',s.knowledge).includes('math-quadratic'));
 assert.deepEqual(suggestKnowledge('这是一道无匹配关键词的题目','数学',s.knowledge),[]);
 assert.deepEqual(suggestKnowledge('抛物线','英语',s.knowledge),[]);
});
test('paper strategies obey subject, count, manual IDs, earliest date and archived exclusion',()=>{
 const s=createInitialState(true,'2026-11-15');s.records[0].archived=true;
 const pool=s.records.filter(r=>!r.archived);
 const earliest=[...pool].sort((a,b)=>a.nextReview.localeCompare(b.nextReview))[0];
 assert.equal(selectPaper(s,{strategy:'due',count:1})[0].nextReview,earliest.nextReview);
 assert.ok(selectPaper(s,{strategy:'weak',count:20,subject:'英语'}).every(r=>r.subject==='英语'));
 assert.equal(selectPaper(s,{strategy:'manual',ids:['demo-1','demo-2']}).length,1);
 const frequent=selectPaper(s,{strategy:'frequent',count:1})[0];
 const counts=REASONS.map(reason=>pool.filter(r=>r.reason===reason).length);
 assert.equal(pool.filter(r=>r.reason===frequent.reason).length,Math.max(...counts));
 const shuffled=selectPaper(s,{strategy:'random',count:30},()=>0.25);assert.equal(new Set(shuffled.map(r=>r.id)).size,pool.length);
});
test('mastery is based on current records, not count of historical review attempts',()=>{
 const s=createInitialState();const k=knowledgeStats(s).find(k=>k.id==='math-quadratic');
 assert.equal(k.total,2);assert.equal(k.mastered,1);assert.equal(k.rate,50);
 s.records[0].archived=true;assert.equal(knowledgeStats(s).find(k=>k.id==='math-quadratic').rate,100);
});
test('backup roundtrip preserves dependencies, photos, logs, dates and prefs',()=>{
 const s=createInitialState();s.records[0].photo='data:image/png;base64,aGVsbG8=';
 const restored=validateState(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.records[0].photo,s.records[0].photo);assert.equal(restored.logs.length,s.logs.length);
 assert.deepEqual(restored.knowledge[2].prerequisites,s.knowledge[2].prerequisites);
 assert.equal(restored.records[0].nextReview,s.records[0].nextReview);assert.deepEqual(restored.prefs,s.prefs);
});
test('invalid backups are rejected before replacement; unsafe image sources are removed',()=>{
 assert.throws(()=>validateState({}),/备份/);
 for(const mutate of [s=>s.records[0].reason='随便一个类别',s=>s.records[0].nextReview='2026-02-30',s=>s.records.push(s.records[0]),s=>s.knowledge[0].prerequisites=['missing']]){
  const s=createInitialState();mutate(s);assert.throws(()=>validateState(s));
 }
 const s=createInitialState();s.records[0].photo='data:image/svg+xml,<svg onload=alert(1)>';
 assert.equal(validateState(s).records[0].photo,'');
});
