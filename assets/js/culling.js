(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QBitsCulling=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';

  const NEAR=.04,FAR=60,DEFAULT_MARGIN=.02;

  // The shader projects onto right/up/forward, then clips -w <= x,y,z <= w.
  // Keep these axes and clipping distances in sync with game.js vertexSource.
  // Plane normals face inward; normalized normals make sphere radius world-space.
  function createFrustum(){
    const planes=new Float64Array(24);
    let valid=false;
    function plane(i,x,y,z,d){
      const inverseLength=1/Math.hypot(x,y,z);
      planes[i]=x*inverseLength;planes[i+1]=y*inverseLength;
      planes[i+2]=z*inverseLength;planes[i+3]=d*inverseLength;
    }
    function set(camera,yaw,pitch,aspect,focal,margin=DEFAULT_MARGIN){
      const x=camera?.[0]??camera?.x,y=camera?.[1]??camera?.y,z=camera?.[2]??camera?.z;
      valid=Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)&&
        Number.isFinite(yaw)&&Number.isFinite(pitch)&&Number.isFinite(aspect)&&aspect>0&&
        Number.isFinite(focal)&&focal>0;
      if(!valid)return api;
      margin=Number.isFinite(margin)?Math.max(0,margin):DEFAULT_MARGIN;
      const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
      const rx=cy,rz=-sy,ux=sy*sp,uy=cp,uz=cy*sp,fx=-sy*cp,fy=sp,fz=-cy*cp;
      const tx=(1+margin)*aspect/focal,ty=(1+margin)/focal;
      let nx=fx*tx+rx,ny=fy*tx,nz=fz*tx+rz;
      plane(0,nx,ny,nz,-(nx*x+ny*y+nz*z));
      nx=fx*tx-rx;ny=fy*tx;nz=fz*tx-rz;
      plane(4,nx,ny,nz,-(nx*x+ny*y+nz*z));
      nx=fx*ty+ux;ny=fy*ty+uy;nz=fz*ty+uz;
      plane(8,nx,ny,nz,-(nx*x+ny*y+nz*z));
      nx=fx*ty-ux;ny=fy*ty-uy;nz=fz*ty-uz;
      plane(12,nx,ny,nz,-(nx*x+ny*y+nz*z));
      const cameraDepth=fx*x+fy*y+fz*z;
      plane(16,fx,fy,fz,-cameraDepth-NEAR);
      plane(20,-fx,-fy,-fz,cameraDepth+FAR);
      return api;
    }
    function intersectsSphere(x,y,z,r){
      // Unknown bounds must stay visible. Never hide geometry on invalid input.
      if(!valid||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)||!Number.isFinite(r))return true;
      const radius=Math.abs(r)+1e-7;
      for(let i=0;i<24;i+=4){
        if(planes[i]*x+planes[i+1]*y+planes[i+2]*z+planes[i+3]<-radius)return false;
      }
      return true;
    }
    const api={set,intersectsSphere,planes,get valid(){return valid;}};
    return api;
  }

  // Maximum NDC displacement of the shader's PSX rounding. Call once per frame
  // with the actual drawing-buffer dimensions, not CSS dimensions.
  function psxGuardBand(width,height,jitter){
    if(!Number.isFinite(jitter)||jitter<=0)return 0;
    if(!(width>0&&height>0))return DEFAULT_MARGIN;
    const grid=Math.max(1,Math.min(width,height)/(1+jitter*7));
    return jitter/(2*grid);
  }

  // Call only when displaying/exporting results, not once per rendered object.
  // p95 uses the nearest-rank definition; an even-sized median is interpolated.
  function summarize(samples){
    const sorted=[];
    if(samples)for(const value of samples)if(Number.isFinite(value)&&value>=0)sorted.push(value);
    sorted.sort((a,b)=>a-b);
    const count=sorted.length;
    if(!count)return {count:0,mean:null,median:null,p95:null,min:null,max:null};
    let total=0;for(let i=0;i<count;i++)total+=sorted[i];
    const middle=count>>1;
    return {count,mean:total/count,median:count%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2,
      p95:sorted[Math.ceil(count*.95)-1],min:sorted[0],max:sorted[count-1]};
  }

  // WebGL1 GPU elapsed time, never a performance.now() proxy for GPU work.
  // Results must be polled in a later animation frame, without spin-waiting.
  // https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query/
  function createGpuTimer(gl,maxPending=4){
    const capacity=Number.isFinite(maxPending)?Math.max(1,Math.min(16,Math.floor(maxPending))):4;
    const queries=new Array(capacity).fill(null);
    let ext=null,head=0,pending=0,active=-1,latestMs=null,sampleCount=0,disposed=false;
    try{ext=gl?.getExtension?.('EXT_disjoint_timer_query')||null;}catch(_){/* Optional capability. */}
    if(ext&&['createQueryEXT','deleteQueryEXT','beginQueryEXT','endQueryEXT','getQueryObjectEXT'].some(k=>typeof ext[k]!=='function'))ext=null;
    function clear(){
      if(ext)for(let i=0;i<capacity;i++)if(queries[i]){
        try{ext.deleteQueryEXT(queries[i]);}catch(_){/* Context may be lost. */}
        queries[i]=null;
      }
      head=0;pending=0;active=-1;latestMs=null;
    }
    function fail(){clear();ext=null;}
    function begin(){
      if(!ext||disposed||active>=0||pending>=capacity)return false;
      try{
        if(gl.isContextLost?.()){fail();return false;}
        // Do not collide with an existing profiler's active elapsed-time query.
        if(typeof ext.getQueryEXT==='function'&&ext.getQueryEXT(ext.TIME_ELAPSED_EXT,ext.CURRENT_QUERY_EXT))return false;
        const index=(head+pending)%capacity;
        if(!queries[index])queries[index]=ext.createQueryEXT();
        if(!queries[index]){fail();return false;}
        ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,queries[index]);active=index;
        return true;
      }catch(_){fail();return false;}
    }
    function end(){
      if(!ext||active<0)return false;
      try{ext.endQueryEXT(ext.TIME_ELAPSED_EXT);active=-1;pending++;return true;}
      catch(_){fail();return false;}
    }
    function poll(){
      if(!ext||disposed)return null;
      try{
        if(gl.isContextLost?.()){fail();return null;}
        // A disjoint event invalidates every outstanding measurement, not only
        // the first query whose result happened to become available.
        if(gl.getParameter(ext.GPU_DISJOINT_EXT)){clear();return null;}
        if(!pending)return null;
        const query=queries[head];
        if(!ext.getQueryObjectEXT(query,ext.QUERY_RESULT_AVAILABLE_EXT))return null;
        const ns=ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT);
        head=(head+1)%capacity;pending--;
        if(!Number.isFinite(ns)||ns<0)return null;
        latestMs=ns/1e6;sampleCount++;return latestMs;
      }catch(_){fail();return null;}
    }
    function dispose(){clear();disposed=true;}
    return {begin,end,poll,dispose,get supported(){return !!ext&&!disposed;},get latestMs(){return latestMs;},
      get sampleCount(){return sampleCount;},get pendingCount(){return pending;}};
  }

  return {createFrustum,psxGuardBand,summarize,createGpuTimer,NEAR,FAR,DEFAULT_MARGIN};
});
