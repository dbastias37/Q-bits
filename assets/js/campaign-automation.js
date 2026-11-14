(function(root,factory){'use strict';const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.QBitsAutomation=model;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const chapters=[['16','El acuerdo del eje','Dos cuerpos · un movimiento relativo'],['17','La fuerza tiene un precio','Carga, consumo y continuidad'],['18','La primera entrega autónoma','Transportar sin intervenir']];
 const levels=[
  {count:1,gates:[{kind:'automation'}],automation:{seconds:6,budget:8,load:2,minRpm:12,arm:0},lines:['Las caras nos unen rígidamente. Las puntas de estos dos enganches hacen un trato distinto: seguimos juntos, pero un lado puede girar respecto del otro.','El banco ya está montado. Clic derecho en el rotor → Rotación → Sentido horario. Mantén al menos 12 rpm reales durante 6 segundos sin tocarlo. La fuerza certificada aquí es 0,40 N·m.']},
  {count:1,gates:[{kind:'automation'}],automation:{seconds:8,budget:1.2,load:4,minRpm:12,arm:2},lines:['Añadimos dos Q-bits al brazo. El eje sigue siendo el mismo; la cuenta de energía, por desgracia, también sabe sumar.','Mantén esta carga de 4 unidades girando 8 segundos, a 12 rpm reales o más y gastando como máximo 1,20 J. Clic derecho → Motor permite ajustar velocidad y torque. Si se bloquea o lo modificas, el ensayo vuelve a empezar.']},
  {count:1,gates:[{kind:'automation'}],automation:{seconds:2,budget:12,load:6,minRpm:5,arm:4,delivery:true},lines:['Ya gira, ya soporta carga. Ahora que haga algo útil: el extremo del brazo lleva un compañero desde ORIGEN hasta el RECEPTOR, por encima del separador.','El receptor acepta la entrega después de 2 segundos de giro continuo sin intervención. Enciende el rotor y observa. Si llega demasiado pronto, dará otra vuelta. Aquí tú decides la velocidad; el receptor se encarga de detenerlo.']}
 ];
 function create(){return {seconds:0,joules:0,complete:false,failed:false,resets:0,reason:'Enciende el rotor.'};}
 function reset(state,reason='Intervención manual: ensayo reiniciado.'){
  if(state.complete)return state;return {...create(),resets:state.resets+1,reason};
 }
 function advance(state,sample,dt,goal){
  if(state.complete||sample.paused||!Number.isFinite(dt)||dt<=0)return state;
  if(sample.manual)return reset(state);
  if(state.failed)return state;
  const active=sample.powered||sample.productive;
  const next={...state,seconds:sample.productive?state.seconds+dt:0,joules:active?state.joules+Math.max(0,Number.isFinite(sample.joules)?sample.joules:0):0,reason:sample.productive?'Ensayo en marcha · sin intervención':sample.reason||'Esperando giro útil.'};
  if(next.joules>goal.budget+1e-8)return {...next,failed:true,reason:'Presupuesto superado. Detén y ajusta el motor para repetir.'};
  if(sample.productive&&next.seconds+1e-8>=goal.seconds&&(!goal.delivery||sample.delivered))return {...next,complete:true,reason:goal.delivery?'Entrega recibida.':'Ensayo superado.'};
  return next;
 }
 const lessons={
  rotor16:{title:'IV · Un eje, dos cuerpos',level:16,text:'Las puntas de dos enganches alineados forman una articulación. El rotor conserva los dos cuerpos y mueve uno respecto del otro; una unión entre caras, en cambio, permanece rígida. La base fija sostiene el eje y el modo rueda deja el mecanismo libre.',recipe:null},
  rotor17:{title:'V · El trabajo tiene un coste',level:17,text:'La capacidad cuenta la carga conectada, incluidos ambos enganches. El torque limita la fuerza de giro; pedir más velocidad no garantiza alcanzarla. El consumo depende del esfuerzo y del giro reales. Incluso bloqueado, un motor encendido puede gastar energía.',recipe:null},
  rotor18:{title:'VI · Una entrega autónoma',level:18,text:'Un ensayo autónomo mide trabajo útil continuo. Pausar congela el tiempo; tomar piezas o ajustar el motor reinicia la medición. El receptor verifica la posición física del extremo y detiene el rotor tras una entrega válida. Las certificaciones I, II y III habilitan límites de torque distintos; los ensayos de campaña mantienen un límite fijo para ser comparables.',recipe:null}
 };
 return Object.freeze({chapters,levels,lessons,create,reset,advance});
});
