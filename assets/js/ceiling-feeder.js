(function(root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QBitsCeilingFeeder = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const limits = Object.freeze({fixtures:12, loose:64, minHeight:2, maxHeight:3, maxRate:60, maxIdle:600});
  const defaults = Object.freeze({height:2.5, shape:'cube', rate:12, idle:30, enabled:true});
  const shapes = Object.freeze({cube:'Q-bit · cubo', pyramid:'Pirámide cuadrada', tetra:'T-bit triangular', coupler:'Enganche'});
  const width = .42, depth = .34, curtainY = .035;
  const id = n => Number.isSafeInteger(n) && n > 0;
  const integer = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;
  const validHeight = h => Number.isFinite(h) && h >= limits.minHeight && h <= limits.maxHeight && Math.round(h*10)/10 === h;
  function validSettings(s) {
    return !!s && typeof s.shape === 'string' && Object.hasOwn(shapes,s.shape) && validHeight(s.height) &&
      integer(s.rate,limits.maxRate) && integer(s.idle,limits.maxIdle) && typeof s.enabled === 'boolean';
  }
  function fitsRoom(x,z,half) {
    return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x)+width/2 < half-.002 && Math.abs(z)+depth/2 < half-.002;
  }
  function overlap(a,b) { return Math.abs(a.x-b.x) < width+.002 && Math.abs(a.z-b.z) < depth+.002; }
  function validSnapshot(data, groups, roomHalf=14) {
    if (!data || data.version !== 1 || !Array.isArray(data.fixtures) || data.fixtures.length > limits.fixtures ||
        !Array.isArray(data.loose) || data.loose.length > limits.loose) return false;
    const seen = new Set();
    for (const [i,f] of data.fixtures.entries()) {
      if (!validSettings(f) || !id(f.id) || seen.has(f.id) || !fitsRoom(f.x,f.z,roomHalf) ||
          !Number.isFinite(f.wait) || f.wait < 0 || f.wait > 60/f.rate + 1e-8 ||
          data.fixtures.slice(0,i).some(other=>overlap(f,other))) return false;
      seen.add(f.id);
    }
    if (!data.loose.length) return true;
    const singles = new Set(groups.filter(g=>g.parts?.length===1).map(g=>g.parts[0].id));
    return data.loose.every(p=>p && singles.delete(p.partId) && id(p.source) && integer(p.idle,limits.maxIdle) &&
      Number.isFinite(p.elapsed) && p.elapsed >= 0 && p.elapsed <= p.idle);
  }
  // Box centres and full dimensions, in metres relative to the lower lip.
  // The black membrane is visual. Only the hollow housing and upper shaft collide.
  function geometry(height,ceiling) {
    const length = ceiling-height, throat = .25;
    function ring(w,d,innerW,innerD,y,h) {
      const side=(w-innerW)/2, end=(d-innerD)/2;
      return [[-(w-side)/2,y,0,side,h,d],[(w-side)/2,y,0,side,h,d],
        [0,y,-(d-end)/2,innerW,h,end],[0,y,(d-end)/2,innerW,h,end]];
    }
    const lip=.024, walls=ring(.36,.28,.30,.22,(throat+lip)/2,throat-lip);
    const shaft=[0,(length+throat)/2,0,.36,length-throat,.28];
    const rim=ring(width,depth,.30,.22,.012,.024);
    const white=[shaft,...walls,...rim], metal=[], rubber=[[0,curtainY,0,.302,.004,.222]];
    for (let y=.29;y<length-.05;y+=1.15) metal.push([0,y,0,.372,.018,.292]);
    for(const x of [-.191,.191])for(const z of [-.151,.151])metal.push([x,0,z,.013,.004,.013]);
    metal.push(...ring(.394,.314,.302,.222,.029,.008),[0,length-.017,0,width,.034,depth]);
    return {white,metal,rubber,solid:[shaft,...walls,...rim]};
  }
  return Object.freeze({limits,defaults,shapes,width,depth,curtainY,geometry,validSettings,validHeight,fitsRoom,overlap,validSnapshot});
});
