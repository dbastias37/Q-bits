/* A deterministic speech rhythm driven by the existing, pausable story clock. */
(function(root){
 'use strict';
 function words(text){
  return Array.from(String(text).matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu),match=>({
   start:match.index,end:match.index+match[0].length,length:Array.from(match[0].normalize('NFC')).length
  }));
 }
 function create(value){
  const text=String(value),tokens=words(text),times=[],counts=[];
  let elapsed=0,index=0,wordIndex=0,pendingPause=0;
  const pauses={',':.16,';':.23,':':.20,'.':.30,'?':.28,'!':.26,'…':.44,'—':.16};
  for(const char of text){
   while(wordIndex+1<tokens.length&&tokens[wordIndex+1].start<=index)wordIndex++;
   const word=tokens[wordIndex],length=word?.length||3;
   // Slightly different phrase groups and a gentle acceleration inside each word.
   const variation=1+(((wordIndex*7+length*3)%11)-5)*.014;
   const progress=word?Math.max(0,Math.min(1,(index-word.start)/Math.max(1,word.end-word.start))):0;
   const step=(length<=3?.028:length<=6?.031:length<=9?.034:.037)*variation*(1.06-.12*progress);
   if(/\s/u.test(char)){
    elapsed+=Math.max(pendingPause,char==='\n'?.23:.045+(wordIndex%3)*.009);pendingPause=0;
   }else if(/[\p{L}\p{N}\p{M}]/u.test(char)){
    elapsed+=pendingPause+step;pendingPause=0;
   }else{
    elapsed+=.016;
    const pause=char==='.'&&text.slice(index,index+3)==='...'?.44:pauses[char]||0;
    pendingPause=Math.max(pendingPause,pause);
   }
   index+=char.length;times.push(elapsed);counts.push(index);
  }
  return {duration:elapsed,words:tokens,countAt(time){
   if(!Number.isFinite(time)||time<0)return 0;
   let low=0,high=times.length;
   while(low<high){const mid=(low+high)>>>1;if(times[mid]<=time)low=mid+1;else high=mid;}
   return low?counts[low-1]:0;
  }};
 }
 const api={create,words};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.QBitsDialogueTiming=api;
})(typeof window==='object'?window:globalThis);
