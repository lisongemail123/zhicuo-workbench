import katex from './vendor/katex/katex.mjs';

const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const command=/\\(?:sqrt|[dtc]?frac|binom|[dt]binom|sum|prod|int|iint|lim|log|ln|sin|cos|tan|cot|theta|alpha|beta|gamma|pi|angle|triangle|overline|overrightarrow|vec|hat|begin|left|mathrm|mathbf|mathbb|text|cdot|times|div|pm|leq|geq|neq|approx|infty)(?![A-Za-z])|(?<![A-Za-z0-9])[A-Za-z][_^](?=\{|[A-Za-z0-9])/g;
const wordAllowed=word=>/^[A-Z]{2,5}$/.test(word)||/^(sin|cos|tan|cot|log|ln|lim)$/.test(word);

// Older AI answers contain bare TeX. Detect complete expressions, keeping prose
// outside formulas and allowing Chinese labels inside braced \text{...}.
function bareMath(text){
 const parts=[];let cursor=0;
 for(;;){
  command.lastIndex=cursor;const match=command.exec(text);if(!match)break;
  let start=match.index;
  while(start>cursor&&/[A-Za-z0-9_'′’=+\-−*/^{}()[\]|<>:. \t≤≥≠πθ]/.test(text[start-1]))start--;
  const prefix=text.slice(start,match.index);for(const word of prefix.matchAll(/[A-Za-z]{2,}/g))if(!wordAllowed(word[0]))start=Math.max(start,match.index-prefix.length+word.index+word[0].length);
  while(/\s/.test(text[start]||'')&&start<match.index)start++;
  let end=match.index,depth=0;
  while(end<text.length){
   const c=text[end];
   if(c==='\\'){const name=text.slice(end).match(/^\\[A-Za-z]+|^\\./);if(name){end+=name[0].length;continue;}}
   if(c==='{')depth++;
   if(c==='}')depth--;
   if(depth<0)break;
   if(depth===0){
    if(/[\n\r，。；：？！、<>`$]/.test(c))break;
    if(/[\u3400-\u9fff]/.test(c))break;
    if(/[;,!?]/.test(c))break;
    if(c==='.'&&!(/\d/.test(text[end-1]||'')&&/\d/.test(text[end+1]||'')))break;
    if(/[A-Za-z]/.test(c)){const word=text.slice(end).match(/^[A-Za-z]+/)[0];if(word.length>1&&!wordAllowed(word))break;end+=word.length;continue;}
   }
   end++;
  }
  while(end>match.index&&/\s/.test(text[end-1]))end--;
  if(end<=match.index){cursor=match.index+match[0].length;continue;}
  parts.push({text:text.slice(cursor,start),math:false},{text:text.slice(start,end),math:true,display:false});cursor=end;
 }
 parts.push({text:text.slice(cursor),math:false});return parts.filter(p=>p.text);
}
export function studySegments(value){
 const text=String(value??''),parts=[];
 // Fences are consumed as one unit, so math code blocks become book formulas.
 const explicit=/```(?:latex|tex|math)?[ \t]*\n[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\s)[^$\n]+?(?<!\s)\$/g;
 let cursor=0;
 for(const match of text.matchAll(explicit)){
  parts.push(...bareMath(text.slice(cursor,match.index)));const raw=match[0];
  if(raw.startsWith('```')){const body=raw.replace(/^```(?:latex|tex|math)?[ \t]*\n/,'').slice(0,-3).trim();command.lastIndex=0;if(command.test(body))parts.push({text:body,math:true,display:true});else parts.push({text:raw,math:false});}
  else if(raw.startsWith('`')){const body=raw.slice(1,-1);command.lastIndex=0;if(command.test(body))parts.push({text:body,math:true,display:false});else parts.push({text:raw,math:false});}
  else {const width=raw.startsWith('$$')||raw.startsWith('\\')?2:1,body=raw.slice(width,-width);if(width===1&&/[\u3400-\u9fff]/.test(body)&&!body.includes('\\text'))parts.push({text:raw,math:false});else parts.push({text:body,math:true,display:raw.startsWith('$$')||raw.startsWith('\\[')});}
  cursor=match.index+raw.length;
 }
 parts.push(...bareMath(text.slice(cursor)));return parts;
}
export function renderStudyText(value){
 return studySegments(value).map(part=>{
  if(!part.math||part.text.length>5000)return escape(part.text);
  try{return `<span class="${part.display?'math-block':'math-inline'}">${katex.renderToString(part.text,{displayMode:part.display,output:'htmlAndMathml',throwOnError:true,trust:false,strict:'ignore',maxExpand:1000,maxSize:20})}</span>`;}
  catch{return `<span class="math-fallback">${escape(part.text)}</span>`;}
 }).join('');
}
export function splitStudyText(value,maxLength=260){
 const chunks=[];let current='';
 for(const part of studySegments(value)){
  // Retain delimiters so a later render recognizes both plain and explicit math.
  const source=part.math?(part.display?'\\['+part.text+'\\]':'\\('+part.text+'\\)'):part.text;
  if(part.math){if(current&&current.length+source.length>maxLength){chunks.push(current);current='';}current+=source;continue;}
  let rest=source;
  while(rest){const room=maxLength-current.length;if(room<=0){chunks.push(current);current='';continue;}current+=rest.slice(0,room);rest=rest.slice(room);if(rest){chunks.push(current);current='';}}
 }
 if(current||!chunks.length)chunks.push(current);return chunks;
}
const selector='.question-text,.prewrap,.answer-block p,.practice-solution strong,.knowledge-card>p,.study-card details p,.paper-question-text';
const rendered=new WeakMap();
export function typesetMath(root){
 if(!root)return;const nodes=[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
 for(const node of nodes){if(rendered.get(node)===node.innerHTML)continue;node.innerHTML=renderStudyText(node.textContent);rendered.set(node,node.innerHTML);}
}
export function attachMathPreviews(root){
 for(const input of root.querySelectorAll('textarea[data-draft],#ai-result-form textarea,#knowledge-form textarea')){
  if(input.dataset.mathPreview)continue;input.dataset.mathPreview='true';
  const box=input.ownerDocument.createElement('div');box.className='math-edit-preview';box.innerHTML='<small>排版预览</small><div class="prewrap"></div>';input.insertAdjacentElement('afterend',box);
  const update=()=>{const parts=studySegments(input.value);box.hidden=!parts.some(p=>p.math);box.lastElementChild.innerHTML=renderStudyText(input.value);rendered.set(box.lastElementChild,box.lastElementChild.innerHTML);};
  input.addEventListener('input',update);update();
 }
}
