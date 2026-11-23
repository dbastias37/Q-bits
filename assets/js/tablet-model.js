// Graphite field tablet. Y grows down the display, Z points toward the player.
// Chamfers shape the silhouette. The open bail shares the shell's draw call.
window.QBitsTabletModel = (() => {
  const positions = [], triangles = [];
  function ring(points, z) {
    const start = positions.length / 3;
    for (const [x,y] of points) positions.push(x,y,z);
    return start;
  }
  function join(a,b,count) {
    for (let i=0;i<count;i++) {
      const j=(i+1)%count;
      triangles.push(a+i,b+i,b+j,a+i,b+j,a+j);
    }
  }
  function outline(inset) {
    const l=-.5+inset,r=.437-inset,t=-.5+inset,b=.5-inset;
    return [[l+.039,t],[r-.024,t],[r,t+.036],[r,b-.064],
      [r-.042,b],[l+.032,b],[l,b-.049],[l,t+.062]];
  }
  const front=ring(outline(.009),0), edge=ring(outline(0),-.009);
  const rearEdge=ring(outline(0),-.040), back=ring(outline(.014),-.052);
  for(let i=1;i<7;i++) triangles.push(front,front+i,front+i+1,back,back+i+1,back+i);
  join(front,edge,8); join(edge,rearEdge,8); join(rearEdge,back,8);
  // Rectangular cross-sections follow the elbows of the open carry handle.
  const handle=[
    [.427,-.335,.427,-.282],[.475,-.335,.458,-.282],
    [.5,-.292,.475,-.255],[.5,.286,.475,.253],
    [.476,.326,.458,.279],[.427,.326,.427,.279]
  ];
  let previous;
  for(const [x,y,ix,iy] of handle) {
    const start=positions.length/3;
    positions.push(x,y,-.013,ix,iy,-.013,ix,iy,-.036,x,y,-.036);
    if(previous!==undefined) join(previous,start,4);
    previous=start;
  }
  // Ends terminate inside the housing.
  return {positions,triangles};
})();
