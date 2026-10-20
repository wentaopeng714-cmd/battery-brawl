import {RelayRound} from './relay-engine.mjs';
export class Training{
 constructor(){this.time=0;this.step=1;this.waiting=false;this.complete=false;this.round=new RelayRound([{id:0,launch:.3,times:[null,1.8,3,4.2]}],{duration:Infinity});}
 advance(dt){if(this.complete)return [];const gate=this.step<=3?this.round.balls[0].times[this.step]-.28:4.8;
 this.time=Math.min(gate,this.time+Math.max(0,Math.min(.08,dt)));this.waiting=this.step<=3&&this.time>=gate-1e-8;
 const events=this.round.update(this.time);if(this.step===4&&this.time>=4.8-1e-8&&this.round.caught===1)this.complete=true;return events;}
 action(lane){if(!this.waiting||lane!==this.step)return null;const a=this.round.action(lane,this.time);if(!a)return null;this.step++;this.waiting=false;return a;}
}
