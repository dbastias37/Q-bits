/* A camera-space viewmodel. DOM controls share the exact matrix of the front face
   so browser hit testing, native inputs, scrolling and keyboard focus stay aligned. */
window.QBitsTabletView = (() => {
  'use strict';
  const vertex = `
    attribute vec3 aPoint, aNormal;
    uniform mat4 uPose;
    uniform vec3 uSize;
    uniform vec2 uCenter, uViewport;
    varying mediump vec3 vPoint, vNormal;
    void main() {
      vec4 p = uPose * vec4(aPoint * uSize, 1.);
      vec2 center = vec2(2., -2.) * uCenter / uViewport + vec2(-1., 1.);
      gl_Position = vec4(center * p.w + vec2(2., -2.) * p.xy / uViewport,
                         -p.z / 1300., p.w);
      vPoint = aPoint;
      vNormal = normalize(mat3(uPose) * (aNormal / uSize));
    }`;
  const fragment = `
    precision mediump float;
    varying vec3 vPoint, vNormal;
    uniform float uCharge, uPulse;
    void main() {
      vec3 n = normalize(vNormal);
      float light = .5 + .5 * dot(n, normalize(vec3(-.42, -.62, .68)));
      vec2 p = vPoint.xy;
      vec3 metal = vec3(.205,.224,.219) * (.42 + .71*light);
      if (abs(vPoint.z) < .00015) {
        bool screen = p.x > -.474 && p.x < .408 && p.y > -.453 && p.y < .392;
        if (screen) metal = vec3(.061,.076,.073);
        else {
          float notch = step(.411,p.y)*step(p.y,.458)*step(-.386,p.x)*step(p.x,-.267)
                      *step(.53,fract((p.x-.38*p.y)*72.));
          metal *= 1.-.61*notch;
          // The lower-right lamp is part of the Graphite mesh itself.
          if (p.x>=.27 && p.x<=.343 && p.y>=.429 && p.y<=.438) {
            bool critical = uCharge>=0. && uCharge<=.1501;
            vec3 track = critical ? mix(vec3(.20,.045,.04),vec3(.47,.09,.07),uPulse) : vec3(.09,.12,.11);
            vec3 charged = critical ? vec3(1.,.32,.27)*(.62+.38*uPulse) :
                            (uCharge<=.3501 ? vec3(1.,.78,.43) : vec3(.69,.82,.44));
            metal = uCharge>0. && (p.x-.27)/.073<uCharge ? charged : track;
          }
          vec2 bolt=vec2(abs(p.x+.032)-.423,abs(p.y)-.461);
          if(length(bolt*vec2(1.,.64)) < .006) metal = vec3(.052,.061,.055);
        }
      } else if (p.x>.469 && abs(p.y)<.19) {
        metal *= .50 + .10*step(.72,fract(p.y*37.));
      }
      if(vPoint.z < -.051) {
        metal *= .86;
        if(abs(p.y-.22)<.046 && abs(p.x+.21)<.10)
          metal *= .56+.44*step(.43,fract(p.x*72.));
      }
      gl_FragColor=vec4(metal,1.);
    }`;

  function placement(viewWidth, viewHeight, prefs) {
    const scale = prefs.tabletScale / 100;
    const alloy = prefs.tabletStyle === 'alloy';
    const yaw = (alloy ? .34 : .27) * (1 - prefs.tabletX / 50);
    const pitch = (alloy ? .19 : .14) * (.45 - prefs.tabletY / 100) - .065;
    const cx = Math.cos(pitch), sx = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    // The CSS and GL matrices both use positive Y down and positive Z toward the player.
    const distance = 1350;
    const pose = [scale*cy, scale*sx*sy, -cx*sy, cx*sy/distance,
      0, scale*cx, sx, -sx/distance,
      scale*sy, -scale*sx*cy, cx*cy, -cx*cy/distance, 0,0,0,1];
    const margin = Math.min(20, viewWidth*.025, viewHeight*.025);
    const fit = Math.min(1, (viewWidth-2*margin)/(760*scale*1.10), (viewHeight-2*margin)/(460*scale*1.15));
    const width = 760*fit, height = 460*fit;
    const depth = width;
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const x of [-width/2,width/2]) for (const y of [-height/2,height/2]) for (const z of [0,-.056*depth]) {
      const w = pose[3]*x + pose[7]*y + pose[11]*z + 1;
      const px = (pose[0]*x + pose[8]*z)/w, py = (pose[1]*x + pose[5]*y + pose[9]*z)/w;
      minX=Math.min(minX,px); maxX=Math.max(maxX,px);
      minY=Math.min(minY,py); maxY=Math.max(maxY,py);
    }
    const travelX = Math.max(0,viewWidth-2*margin-(maxX-minX));
    const travelY = Math.max(0,viewHeight-2*margin-(maxY-minY));
    return {width,height,depth,pose,alloy,travelX,travelY,viewWidth,viewHeight,
      x:margin-minX+travelX*prefs.tabletX/100, y:margin-minY+travelY*prefs.tabletY/100};
  }

  function renderer(gl, compile, submit) {
    const program=gl.createProgram();
    for (const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
      const shader=compile(kind,source);gl.attachShader(program,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    const {positions,triangles}=window.QBitsTabletModel, data=[];
    for (let i=0;i<triangles.length;i+=3) {
      const points=triangles.slice(i,i+3).map(id=>positions.slice(id*3,id*3+3));
      const [a,b,c]=points, u=b.map((p,j)=>p-a[j]), v=c.map((p,j)=>p-a[j]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      for(const p of points)data.push(...p,...normal);
    }
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    const point=gl.getAttribLocation(program,'aPoint'),normal=gl.getAttribLocation(program,'aNormal');
    const loc=Object.fromEntries(['uPose','uSize','uCenter','uViewport','uCharge','uPulse'].map(k=>[k,gl.getUniformLocation(program,k)]));
    return (frame,charge=-1,pulse=1)=>{
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clear(gl.DEPTH_BUFFER_BIT);gl.disable(gl.BLEND);
      gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(const [attr,offset] of [[point,0],[normal,12]]) {
        gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,3,gl.FLOAT,false,24,offset);
      }
      gl.uniformMatrix4fv(loc.uPose,false,frame.pose);gl.uniform3f(loc.uSize,frame.width,frame.height,frame.depth);
      gl.uniform2f(loc.uCenter,frame.x,frame.y);gl.uniform2f(loc.uViewport,frame.viewWidth,frame.viewHeight);
      gl.uniform1f(loc.uCharge,charge);gl.uniform1f(loc.uPulse,pulse);
      submit(gl.TRIANGLES,0,data.length/6);
      gl.disableVertexAttribArray(point);gl.disableVertexAttribArray(normal);
    };
  }
  return {placement,renderer};
})();
