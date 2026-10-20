import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flightPose,FLIGHT_DURATION} from '../dist/effects.mjs';
test('an exploded car lifts, rolls multiple times, lands, and returns to its original pose',()=>{
  const start=flightPose(0);assert.ok(start.active);assert.ok(Math.abs(start.x)+Math.abs(start.y)+Math.abs(start.angle)<1e-8);
  const apex=flightPose(FLIGHT_DURATION*.365);assert.ok(apex.y < -90);assert.ok(Math.abs(apex.angle)>Math.PI*2);
  const landing=flightPose(FLIGHT_DURATION*.82);assert.ok(landing.landed);assert.equal(landing.angle,0);assert.ok(landing.y<=0);
  assert.deepEqual(flightPose(FLIGHT_DURATION),{active:false,x:0,y:0,angle:0,sx:1,sy:1,landed:false});
});
test('late explosions are stronger, finite, and secondary car reactions are smaller',()=>{
  const low=flightPose(.7),high=flightPose(.7,{level:5}),neighbor=flightPose(.45,{level:5,secondary:true});
  assert.ok(Math.abs(high.y)>Math.abs(low.y));assert.ok(Math.abs(neighbor.y)<Math.abs(high.y));
  for(let age=0;age<2.3;age+=.01){const p=flightPose(age,{level:5,direction:-1});for(const k of ['x','y','angle','sx','sy'])assert.ok(Number.isFinite(p[k]));assert.ok(p.y<=1e-8);assert.ok(p.sx>0&&p.sy>0);}
});
test('reduced motion removes rotation and sideways flight while preserving feedback',()=>{
  const p=flightPose(.7,{level:5,reduced:true});assert.ok(p.active);assert.equal(p.angle,0);assert.equal(p.x,0);assert.ok(Math.abs(p.y)<=10);
});
