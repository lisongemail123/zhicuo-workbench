import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderStudyText,studySegments,splitStudyText,typesetMath,attachMathPreviews } from '../dist/math.js';
const formula=String.raw`BE'=\sqrt{4-\sqrt7}=\frac{\sqrt{14}-\sqrt2}{2}`;
const documentOf=text=>new JSDOM('<main>'+renderStudyText(text)+'</main>').window.document;

test('the reported bare formula uses textbook roots, stacked fractions and a prime without rewriting source',()=>{
 const source='因此 '+formula+'，计算完成。',doc=documentOf(source);
 assert.equal(doc.querySelectorAll('.math-inline').length,1);assert.equal(doc.querySelectorAll('msqrt').length,4);assert.equal(doc.querySelectorAll('mfrac').length,1);assert.ok(doc.querySelector('msup'));
 assert.equal(doc.querySelector('annotation').textContent,formula);assert.ok(!doc.querySelector('.katex-html').textContent.includes('\\sqrt'));assert.ok(!doc.querySelector('.math-fallback'));
 assert.equal(studySegments(source).filter(p=>p.math)[0].text,formula);assert.match(doc.querySelector('main').textContent,/因此/);assert.match(doc.querySelector('main').textContent,/计算完成/);
});
test('inline, display, fenced, Chinese labels and scripts render safely with surrounding prose',()=>{
 for(const value of [String.raw`长度为 \(\sqrt7\)。`,String.raw`解得 $$\frac{1}{2}$$。`,String.raw`\[\begin{cases}x=1\\y=2\end{cases}\]`,'```latex\n'+formula+'\n```',String.raw`面积=\frac{\text{底边}\times\text{高}}{2}，即结果。`,String.raw`函数 x^2+x_1 的值。`,String.raw`单个根号 \sqrt7。`]){
  const doc=documentOf(value);assert.ok(doc.querySelector('.katex'),value);assert.equal(doc.querySelector('.math-fallback'),null,value);
 }
 assert.ok(documentOf(String.raw`\[\frac{1}{2}\]`).querySelector('.math-block'));
});
test('HTML, unsafe links and unsupported TeX cannot create executable elements or remote resources',()=>{
 const source=String.raw`<img id="attack" src="https://evil.example/x" onerror="alert(1)"> \(\href{javascript:alert(1)}{点击}\) \(\includegraphics{https://evil.example/x}\)`;
 const doc=documentOf(source);assert.equal(doc.querySelector('#attack'),null);assert.equal(doc.querySelector('img'),null);assert.equal(doc.querySelector('a[href]'),null);assert.equal(doc.querySelector('script'),null);assert.match(doc.querySelector('main').textContent,/<img/);
 const broken=documentOf(String.raw`结果 \(\frac{1}{\) 需要补齐。`);assert.ok(broken.querySelector('.math-fallback'));assert.match(broken.querySelector('main').textContent,/需要补齐/);
});
test('ordinary prose and currency remain readable without accidental formula conversion',()=>{
 for(const text of ['价格为$20，预算为$30。','The price is $20 and $30.','这是纯文字，长度为 20 cm。']){const doc=documentOf(text);assert.equal(doc.querySelector('.katex'),null);assert.equal(doc.querySelector('main').textContent,text);}
});
test('print chunks keep complete equations together when the former 260-character boundary crosses a formula',()=>{
 const chunks=splitStudyText('文'.repeat(245)+formula+'。'+'解析'.repeat(280));
 assert.ok(chunks.length>2);assert.equal(chunks.filter(s=>s.includes(formula)).length,1);
 assert.ok(chunks.every(chunk=>!renderStudyText(chunk).includes('math-fallback')));
 const doc=documentOf(chunks.join('\n'));assert.equal(doc.querySelectorAll('mfrac').length,1);
});
test('DOM typesetting is repeatable and math editing previews update while the editable source stays unchanged',()=>{
 const dom=new JSDOM('<main><p class="prewrap"></p><form id="ai-result-form"><textarea name="analysis"></textarea></form></main>'),doc=dom.window.document,root=doc.querySelector('main'),body=root.querySelector('p'),input=root.querySelector('textarea');
 body.textContent=formula;input.value=formula;typesetMath(root);const first=body.innerHTML;typesetMath(root);assert.equal(body.innerHTML,first);
 attachMathPreviews(root);assert.ok(root.querySelector('.math-edit-preview mfrac'));assert.equal(input.value,formula);
 input.value=String.raw`\(\frac{3}{4}\)`;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(root.querySelector('.math-edit-preview annotation').textContent,String.raw`\frac{3}{4}`);
 input.value='纯文字解析';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(root.querySelector('.math-edit-preview').hidden,true);dom.window.close();
});
