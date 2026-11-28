(function(root, factory) {
  'use strict';
  const model = factory(() => typeof module === 'object' && module.exports ? require('./lab-room.js') : root.QBitsLabRoom);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QBitsCeilingFeeder = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(roomModel) {
  'use strict';
  const limits = Object.freeze({fixtures:12, loose:64, minHeight:2, maxHeight:3, maxRate:60, maxIdle:600});
  const defaults = Object.freeze({height:2.5, shape:'cube', rate:12, idle:30, enabled:true});
  const shapes = Object.freeze({cube:'Q-bit · cubo', pyramid:'Pirámide cuadrada', tetra:'T-bit triangular', coupler:'Enganche'});
  const width = .42, depth = .34, curtainY = .035;
  const id = n => Number.isSafeInteger(n) && n > 0;
  const integer = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;
  const wallLength = .42, wallSpeed = 1.65, wallVerticalSpeed = -.08;
  // The horizontal normal points into the room. Local +Y runs back into the support.
  const walls = Object.freeze({north:{x:0,z:1}, south:{x:0,z:-1}, west:{x:1,z:0}, east:{x:-1,z:0}});
  function heightRange(mount,room) {
    return mount === 'ceiling' ? [limits.minHeight,limits.maxHeight] : [.3,room.height-.3];
  }
  function validHeight(h,mount='ceiling',room=roomModel().defaults) {
    const [min,max]=heightRange(mount,room);
    return Number.isFinite(h) && h>=min && h<=max && Math.round(h*10)/10===h;
  }
  function validSettings(s,mount='ceiling',room=roomModel().defaults) {
    return !!s && typeof s.shape === 'string' && Object.hasOwn(shapes,s.shape) && validHeight(s.height,mount,room) &&
      integer(s.rate,limits.maxRate) && integer(s.idle,limits.maxIdle) && typeof s.enabled === 'boolean';
  }
  function mouth(mount,x,height,z,room) {
    const n=walls[mount];
    return {mount,height,x:n?.x ? -n.x*(room.width/2-wallLength) : x,
      z:n?.z ? -n.z*(room.length/2-wallLength) : z};
  }
  function localBox(mount,box) {
    const n=walls[mount];
    if (!n) return box;
    const [x,y,z,w,h,d]=box;
    return [n.z*x-n.x*y,z,-n.x*x-n.z*y,n.x?h:w,d,n.z?h:w];
  }
  function bounds(f,room) {
    const length=walls[f.mount] ? wallLength : room.height-f.height;
    const [x,y,z,w,h,d]=localBox(f.mount,[0,length/2,0,width,length,depth]);
    return {min:{x:f.x+x-w/2,y:f.height+y-h/2,z:f.z+z-d/2},
      max:{x:f.x+x+w/2,y:f.height+y+h/2,z:f.z+z+d/2}};
  }
  function fits(f,room) {
    const mount=f.mount===undefined?'ceiling':f.mount;
    if (mount!=='ceiling' && !Object.hasOwn(walls,mount) || !validHeight(f.height,mount,room) ||
        !Number.isFinite(f.x) || !Number.isFinite(f.z)) return false;
    const p=mouth(mount,f.x,f.height,f.z,room);
    if (Math.abs(f.x-p.x)>1e-6 || Math.abs(f.z-p.z)>1e-6) return false;
    const n=walls[mount];
    if (n) return n.x ? Math.abs(f.z)+width/2 < room.length/2-.002 : Math.abs(f.x)+width/2 < room.width/2-.002;
    return Math.abs(f.x)+width/2 < room.width/2-.002 && Math.abs(f.z)+depth/2 < room.length/2-.002;
  }
  function overlap(a,b,room) {
    const A=bounds(a,room),B=bounds(b,room);
    return ['x','y','z'].every(k=>A.min[k]<B.max[k]+.002 && B.min[k]<A.max[k]+.002);
  }
  function validSnapshot(data, groups, room=roomModel().defaults) {
    if (!data || data.version !== 1 || !Array.isArray(data.fixtures) || data.fixtures.length > limits.fixtures ||
        !Array.isArray(data.loose) || data.loose.length > limits.loose) return false;
    const seen = new Set();
    for (const [i,f] of data.fixtures.entries()) {
      if (!f || !validSettings(f,f.mount,room) || !id(f.id) || seen.has(f.id) || !fits(f,room) ||
          !Number.isFinite(f.wait) || f.wait < 0 || f.wait > 60/f.rate + 1e-8 ||
          data.fixtures.slice(0,i).some(other=>overlap(f,other,room))) return false;
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
  return Object.freeze({limits,defaults,shapes,width,depth,curtainY,geometry,validSettings,validHeight,heightRange,wallLength,wallSpeed,wallVerticalSpeed,walls,mouth,localBox,bounds,fits,overlap,validSnapshot});
});
