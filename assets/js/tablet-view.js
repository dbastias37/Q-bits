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
    uniform float uAlloy;
    void main() {
      vec3 n = normalize(vNormal);
      float light = .5 + .5 * dot(n, normalize(vec3(-.42, -.62, .68)));
      vec3 rim = mix(vec3(.13,.48,.51), vec3(.20,.23,.26), uAlloy);
      vec3 signal = mix(vec3(.39,.94,.91), vec3(.96,.65,.29), uAlloy);
      float z = -vPoint.z;
      vec3 color = rim * (.42 + light * 1.05);
      color += vec3(.37) * pow(light, 9.);
      float seam = 1. - smoothstep(.0013,.0032,abs(z - .026));
      color = mix(color, signal, seam * .9);
      float display = 0.;
      if (z < .0002) {
        vec2 p = vPoint.xy;
        display = step(abs(p.x), .465) * step(-.455,p.y) * step(p.y,.408);
        vec3 face = mix(vec3(.053,.158,.19),vec3(.085,.104,.12),uAlloy);
        face += vec3(.019,.044,.048) * (.5 - p.y) * (.6 - p.x);
        float reflection = exp(-9. * abs(p.x + .52*p.y + .31));
        face += vec3(.016,.023,.026) * reflection * (1.-uAlloy);
        color = mix(color, face, display);
        // Recessed fasteners and side grips belong to the industrial shell.
        vec2 bolt = vec2(abs(p.x)-.445,p.y+.473) * vec2(1.,.61);
        float radius = length(bolt);
        color = mix(color,vec3(.09,.11,.12),uAlloy*(1.-smoothstep(.004,.006,radius)));
        color += vec3(.30)*uAlloy*(1.-smoothstep(.0005,.0013,abs(radius-.0045)));
        float grip = step(.47,abs(p.x))*step(abs(p.y),.19)*step(.6,fract((p.y+.2)*43.));
        color *= 1.-.42*uAlloy*grip;
        float strip = step(.431,p.y) * step(p.y,.437) * step(abs(p.x),.27);
        color = mix(color, signal, strip);
      }
      // Old cover alpha was 0x7a–0xa6 and the display was 0xeb–0xf0.
      float cover = mix(.48,.65,light);
      float alpha = min(1., mix(cover,.93,display) * 1.10);
      alpha = mix(alpha,1.,uAlloy * (1. - display));
      gl_FragColor = vec4(color, alpha);
    }`;

  function placement(viewWidth, viewHeight, prefs) {
    const scale = prefs.tabletScale / 100;
    const alloy = prefs.tabletStyle === 'alloy';
    const yaw = (alloy ? .29 : .215) * (prefs.tabletHand === 'right' ? -1 : 1);
    const pitch = alloy ? -.18 : -.115;
    const cx = Math.cos(pitch), sx = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    // The CSS and GL matrices both use positive Y down and positive Z toward the player.
    const distance = 1350;
    const pose = [scale*cy, scale*sx*sy, -cx*sy, cx*sy/distance,
      0, scale*cx, sx, -sx/distance,
      scale*sy, -scale*sx*cy, cx*cy, -cx*cy/distance, 0,0,0,1];
    const margin = Math.min(20, viewWidth*.025, viewHeight*.025);
    const width = Math.min(760, (viewWidth-2*margin)/(scale*1.10));
    const height = Math.min(460, (viewHeight-2*margin)/(scale*1.15));
    const depth = width * (alloy ? 1 : .68);
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
      // The model uses screen Y down. Orient each face away from the shell interior.
      const outside=[a[0],a[1],a[2]+.028];
      if (normal.reduce((sum,n,j)=>sum+n*outside[j],0)<0) for(let j=0;j<3;j++) normal[j]*=-1;
      for(const p of points)data.push(...p,...normal);
    }
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    const point=gl.getAttribLocation(program,'aPoint'),normal=gl.getAttribLocation(program,'aNormal');
    const loc=Object.fromEntries(['uPose','uSize','uCenter','uViewport','uAlloy'].map(k=>[k,gl.getUniformLocation(program,k)]));
    return frame=>{
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clear(gl.DEPTH_BUFFER_BIT);gl.disable(gl.BLEND);
      gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(const [attr,offset] of [[point,0],[normal,12]]) {
        gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,3,gl.FLOAT,false,24,offset);
      }
      gl.uniformMatrix4fv(loc.uPose,false,frame.pose);gl.uniform3f(loc.uSize,frame.width,frame.height,frame.depth);
      gl.uniform2f(loc.uCenter,frame.x,frame.y);gl.uniform2f(loc.uViewport,frame.viewWidth,frame.viewHeight);
      gl.uniform1f(loc.uAlloy,Number(frame.alloy));
      // Resolve the nearest surface once before blending the tinted glass over the room.
      gl.colorMask(false,false,false,false);submit(gl.TRIANGLES,0,data.length/6);
      gl.colorMask(true,true,true,true);gl.depthFunc(gl.EQUAL);
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      submit(gl.TRIANGLES,0,data.length/6);gl.disable(gl.BLEND);gl.depthFunc(gl.LESS);
      gl.disableVertexAttribArray(point);gl.disableVertexAttribArray(normal);
    };
  }
  return {placement,renderer};
})();
