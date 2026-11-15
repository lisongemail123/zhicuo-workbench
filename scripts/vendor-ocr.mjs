import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const target=new URL('../dist/vendor/tesseract/',import.meta.url);
await mkdir(target,{recursive:true});
for(const name of ['tesseract.min.js','worker.min.js']){
  const content=await readFile(new URL(`../node_modules/tesseract.js/dist/${name}`,import.meta.url),'utf8');
  await writeFile(new URL(name,target),content.replace(/\n?\/\/# sourceMappingURL=.*$/m,''));
}
await copyFile(new URL('../node_modules/tesseract.js/LICENSE.md',import.meta.url),new URL('LICENSE.md',target));
for(const name of ['tesseract.min.js.LICENSE.txt','worker.min.js.LICENSE.txt'])await copyFile(new URL(`../node_modules/tesseract.js/dist/${name}`,import.meta.url),new URL(name,target));
console.log('Vendored Tesseract.js 7.0.0 browser library, worker and Apache-2.0 license.');
