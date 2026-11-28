(function(root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QBitsLabRoom = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const defaults = Object.freeze({width:28, height:14, length:28, partLimit:2000, cargoLimit:12});
  const ranges = Object.freeze({width:[8,40], height:[4,18], length:[8,40], partLimit:[1,2000], cargoLimit:[1,64]});
  function valid(room) {
    return !!room && Object.entries(ranges).every(([key,[min,max]]) =>
      Number.isInteger(room[key]) && room[key] >= min && room[key] <= max);
  }
  function containsXZ(room,x,z,margin=0) {
    return Math.abs(x) <= room.width/2-margin && Math.abs(z) <= room.length/2-margin;
  }
  function containsBounds(room,min,max,margin=0) {
    return min.x >= -room.width/2+margin && max.x <= room.width/2-margin &&
      min.z >= -room.length/2+margin && max.z <= room.length/2-margin;
  }
  return Object.freeze({defaults,ranges,valid,containsXZ,containsBounds});
});
