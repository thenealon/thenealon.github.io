const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
class Element {
  constructor(){this.attrs={};this.events={};this.children={};this.hidden=false;this.textContent='';}
  getAttribute(k){return this.attrs[k]||null;}
  setAttribute(k,v){this.attrs[k]=v;}
  querySelector(k){return this.children[k]||(this.children[k]=new Element());}
  addEventListener(k,f){this.events[k]=f;}
  fire(k){this.events[k]?.call(this);}
}
const ids={};for(const m of html.matchAll(/\bid="([^"]+)"/g))ids[m[1]]=new Element();
const root=new Element();let threshold=2,mode='graph',paused=false,fast=false,lattice=false;
const model={setMode:v=>mode=v,getMode:()=>mode,setThreshold:v=>threshold=Number(v),getThreshold:()=>threshold,
 setSpeed:v=>fast=v,isFast:()=>fast,setPaused:v=>paused=v,isPaused:()=>paused,
 setLattice:v=>lattice=v,getLattice:()=>lattice};
const storage=new Map([['nb-bg','perc']]);
const document={documentElement:root,getElementById:id=>id==='abstract-dialog'?null:ids[id],querySelector:()=>null,querySelectorAll:()=>[]};
vm.runInNewContext(fs.readFileSync('assets/ui.js','utf8'),{document,window:{tidalGraph:model,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}}});
assert.equal(mode,'perc');assert.equal(ids['threshold-control'].hidden,false);
assert.equal(ids['lattice-toggle'].hidden,false);
assert.match(ids['bg-toggle'].querySelector('.ctl-ico').innerHTML,/<svg/);
ids['threshold-slider'].value='4';ids['threshold-slider'].fire('input');
assert.equal(threshold,4);assert.equal(ids['threshold-value'].textContent,4);
ids['lattice-toggle'].fire('click');assert.equal(lattice,true);assert.equal(root.attrs['data-lattice'],'on');
ids['tide-toggle'].fire('click');assert.equal(paused,true);
ids['speed-toggle'].fire('click');assert.equal(fast,true);
ids['bg-toggle'].fire('click');assert.equal(mode,'graph');assert.equal(ids['threshold-control'].hidden,true);assert.equal(ids['lattice-toggle'].hidden,true);
ids['bg-toggle'].fire('click');assert.equal(mode,'perc');assert.equal(lattice,true);assert.equal(paused,true);
console.log('PASS: full UI initializes; threshold, lattice, pause, speed, and background controls work.');
