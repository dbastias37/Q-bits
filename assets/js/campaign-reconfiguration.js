(function (root, factory) {
  'use strict';
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.QBitsReconfiguration = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const chapters = [
    ['13', 'La primera división', 'Un Q-bit · seis formas de seguir'],
    ['14', 'La segunda escala', 'Dividir una vez más · reconocer el límite'],
    ['15', 'Seguimos siendo nosotros', 'Recomponer · conservar materia e identidad']
  ];
  const lessons = {
    division: {
      title: 'I · La materia recuerda', level: 13,
      text: 'Un Q-bit es materia organizada alrededor de un patrón de identidad. Su cubo puede reconfigurarse en seis T-bits de base cuadrada. Cada pirámide conserva una sexta parte de su materia y de su capacidad de trabajo. Las seis comparten su origen; dividirlas no crea energía ni compañeros de la nada.',
      recipe: 'cube'
    },
    subdivision: {
      title: 'II · La segunda escala', level: 14,
      text: 'Una pirámide se divide en dos T-bits triangulares complementarios. Seis pirámides o doce triangulares reconstruyen el volumen de un cubo. Los triangulares son la última subdivisión: conservan caras completas para poder unirse. Una cara incompleta no sostiene un enlace.',
      recipe: 'pyramid'
    },
    reunion: {
      title: 'III · Un vínculo tiene reglas', level: 15,
      text: 'Unir caras compatibles mantiene rígida una estructura. Reconfigurar reúne materia del mismo origen y recupera su forma anterior. Los enganches hacen otro acuerdo: sus puntas alineadas conservan dos cuerpos unidos por un eje. El rotor mueve un lado respecto del otro; su carga, torque y energía siguen teniendo límites.',
      recipe: null
    }
  };
  const levels = [
    { count: 2, gates: [{kind:'reconfiguration'}], reconfiguration: 'division',
      lines: ['Mira esa cámara. No fabrica compañeros: reorganiza los que ya están aquí. La diferencia importa, aunque el cartel haya decidido omitirla.', 'Deja al compañero marcado en la bandeja ENTRADA. Mira la cámara y pulsa E. Un cubo puede abrirse en seis pirámides; sus puntas se encontraban en el centro.'],
      goal: 'Divide el Q-bit marcado en seis pirámides.' },
    { count: 2, gates: [{kind:'reconfiguration'}], reconfiguration: 'subdivision',
      lines: ['Ya encontramos la primera división. Hay otra escala dentro de cada pirámide. Esta vez quiero ver qué queda al otro lado.', 'Divide el cubo y devuelve una de las seis pirámides a ENTRADA. La cámara la separará en dos triangulares. Hasta ahí: necesitamos conservar caras con las que volver a unirnos.'],
      goal: 'Divide el cubo y subdivide una pirámide en dos triangulares.' },
    { count: 1, gates: [{kind:'reconfiguration'}], reconfiguration: 'reunion',
      lines: ['Todos recuerdan al mismo compañero. Cinco pirámides y dos triangulares: sigue habiendo exactamente un cubo de materia. La contabilidad acaba de ponerse interesante.', 'Reúne primero los dos triangulares en ENTRADA y recompón su pirámide. Después devuelve las seis pirámides a la cámara. J abre el catálogo; ahí conservamos lo aprendido.'],
      goal: 'Recompón los dos triangulares y después las seis pirámides.' }
  ];
  const actions = Object.freeze({
    divide: {label:'Dividir cubo → 6 pirámides', unlock:13},
    subdivide: {label:'Subdividir pirámide → 2 triangulares', unlock:14},
    pyramid: {label:'Recomponer 2 triangulares → pirámide', unlock:15},
    cube: {label:'Recomponer 6 pirámides → cubo', unlock:15}
  });
  const copy = p => ({...p, mood:{...p.mood, blend:[...(p.mood?.blend||[1,0,0])], matter:p.mood?.matter?{...p.mood.matter}:undefined}});
  function identify(part) {
    const p=copy(part);
    p.mood.matter={root:p.id,path:'',rootWeight:p.weight,name:p.mood.name||'Q-bit '+p.id};
    return p;
  }
  function eligible(parts) {
    return Array.isArray(parts) && parts.length>0 && parts.every(p =>
      p && Number.isSafeInteger(p.id) && Number.isFinite(p.weight) && p.weight>0 &&
      p.mood?.matter && Number.isSafeInteger(p.mood.matter.root) &&
      Number.isFinite(p.mood.matter.rootWeight) && p.mood.matter.rootWeight>0 &&
      typeof p.mood.matter.path==='string' && Number.isFinite(p.mood.energy) && p.mood.energy>=0 && p.mood.energy<=1) &&
      new Set(parts.map(p=>p.id)).size===parts.length;
  }
  function plan(action, parts) {
    if(Array.isArray(parts)&&parts.some(p=>p?.mood?.externalBattery))return {error:'Las baterías externas no se dividen ni se recomponen.'};
    if(!eligible(parts))return {error:'Usa las piezas marcadas de esta cámara.'};
    const first=parts[0], origin=first.mood.matter;
    if(parts.some(p=>p.mood.matter.root!==origin.root || p.mood.matter.rootWeight!==origin.rootWeight))return {error:'Estas piezas tienen orígenes distintos.'};
    let shape, paths;
    if(action==='divide' && parts.length===1 && first.shape==='cube' && origin.path===''){
      shape='pyramid';paths=['0','1','2','3','4','5'];
    }else if(action==='subdivide' && parts.length===1 && first.shape==='pyramid' && /^[0-5]$/.test(origin.path)){
      shape='tetra';paths=[origin.path+'a',origin.path+'b'];
    }else if(action==='pyramid' && parts.length===2 && parts.every(p=>p.shape==='tetra' && /^[0-5][ab]$/.test(p.mood.matter.path)) &&
      new Set(parts.map(p=>p.mood.matter.path)).size===2 &&
      parts.every(p=>p.mood.matter.path[0]===origin.path[0])){
      shape='pyramid';paths=[origin.path[0]];
    }else if(action==='cube' && parts.length===6 && parts.every(p=>p.shape==='pyramid' && /^[0-5]$/.test(p.mood.matter.path)) &&
      new Set(parts.map(p=>p.mood.matter.path)).size===6){
      shape='cube';paths=[''];
    }else return {error:'La entrada no coincide con esa transformación. Revisa las formas y reúne todas sus partes.'};
    const expected=p=>p.mood.matter.rootWeight/(p.shape==='cube'?1:p.shape==='pyramid'?6:p.shape==='tetra'?12:Infinity);
    if(parts.some(p=>Math.abs(p.weight-expected(p))>1e-8))return {error:'El peso fue alterado. Reinicia el nivel para recuperar la materia original.'};
    const weight=parts.reduce((n,p)=>n+p.weight,0),energy=parts.reduce((n,p)=>n+p.weight*p.mood.energy,0)/weight;
    const outputs=paths.map(path=>{
      const p=copy(first);delete p.id;p.shape=shape;p.weight=weight/paths.length;
      p.mood.energy=energy;p.mood.matter={...origin,path};
      if(parts.some(part=>part.mood.cutEnergyScale!==undefined))p.mood.cutEnergyScale=parts.reduce((sum,part)=>sum+(part.mood.cutEnergyScale??1),0)/paths.length;
      p.mood.name=origin.name+(path?' · '+(Number(path[0])+1)+(path[1]||''):'');
      // Recombination cannot erase exhaustion, agitation or an active rest episode.
      for(const key of ['restLeft','restTotal','agitation','severity','strikes'])p.mood[key]=Math.max(...parts.map(part=>part.mood[key]||0));
      const resting=parts.find(part=>part.mood.state==='restless');
      if(resting){p.mood.state='restless';p.mood.reason=resting.mood.reason;p.mood.blend=[...(resting.mood.blend||[0,0,1])];}
      return p;
    });
    return {action,inputs:parts.map(p=>p.id),outputs,weight,energy};
  }
  function complete(kind, stats) {
    if(!stats)return false;
    return kind==='division'?stats.divide>0:kind==='subdivision'?stats.divide>0&&stats.subdivide>0:kind==='reunion'&&stats.pyramid>0&&stats.cube>0;
  }
  return Object.freeze({chapters,levels,lessons,actions,identify,plan,complete});
});
