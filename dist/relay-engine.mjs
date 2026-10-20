export const DURATION=120;
export const STAGES=[
 {name:'跳一下，转一下，接住！',tag:'先找手感',count:6,bpm:90},
 {name:'一颗电池，三车接力',tag:'开始加速',count:8,bpm:105},
 {name:'别让电池落地',tag:'连续弹射',count:10,bpm:120},
 {name:'跳、转、接，跟上！',tag:'接力上头',count:12,bpm:135},
 {name:'红车停不下来了',tag:'电池连发',count:16,bpm:150},
 {name:'最后二十秒，全员整活！',tag:'疯狂接力',count:18,bpm:165},
];
export const ACTIONS={
 1:{name:'起跳',duration:.7,safeStart:.06,safeEnd:.56,cooldown:.71},
 2:{name:'旋转',duration:.86,safeStart:.08,safeEnd:.66,cooldown:.87},
 3:{name:'接住',duration:.65,safeStart:0,safeEnd:.5,cooldown:.66},
};
export function stageAt(t){return Math.max(0,Math.min(5,Math.floor(t/20)));}
export function createBatteries(){
 const balls=[];
 STAGES.forEach((s,level)=>{
   const step=15.6/(s.count-1),speed=1-level*.075;
   for(let j=0;j<s.count;j++){
     const launch=level*20+1+j*step;
     balls.push({id:balls.length,launch,times:[null,launch+1.05*speed,launch+1.87*speed,launch+2.72*speed]});
   }
 });return balls;
}
export class RelayRound{
 constructor(balls=createBatteries(),{duration=DURATION}={}){
   this.duration=duration;this.balls=balls.map(b=>({...b,times:[...b.times],steps:['source','pending','pending','pending'],status:'flying'}));
   this.actions=[null,[],[],[]];this.lastAction=[-100,-100,-100,-100];this.time=0;this.score=0;this.combo=0;this.maxCombo=0;
   this.jumps=0;this.spins=0;this.caught=0;this.exploded=0;this.finished=false;this.launched=new Set();
 }
 action(lane,time=this.time){
   if(this.finished||!Number.isFinite(time)||!ACTIONS[lane]||time<0||time<this.time-1e-8||time>=this.duration)return null;
   const a=ACTIONS[lane];if(time-this.lastAction[lane]<a.cooldown-1e-8)return null;
   this.lastAction[lane]=time;this.actions[lane].push(time);return {kind:'action',lane,time};
 }
 safe(lane,time){const a=ACTIONS[lane];return this.actions[lane].some(start=>time-start>=a.safeStart-1e-8&&time-start<=a.safeEnd+1e-8);}
 update(time){
   if(this.finished||time<this.time)return [];
   const end=Math.min(this.duration,Math.max(0,time)),pending=[];
   for(const b of this.balls){
     if(b.launch<=end&&!this.launched.has(b.id)){this.launched.add(b.id);pending.push({kind:'launch',time:b.launch,ball:b,lane:0});}
     for(let lane=1;lane<=3;lane++)if(b.steps[lane]==='pending'&&b.times[lane]<=end+1e-8)pending.push({kind:'contact',time:b.times[lane],ball:b,lane});
   }
   pending.sort((a,b)=>a.time-b.time||a.lane-b.lane);const events=[];
   for(const e of pending){const b=e.ball;if(e.kind==='launch'){events.push(e);continue;}if(b.status!=='flying'||b.steps[e.lane]!=='pending')continue;
     if(this.safe(e.lane,e.time)){
       b.steps[e.lane]=e.lane===3?'caught':'dodged';this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);
       const points=e.lane===3?150:60;this.score+=points+Math.min(50,Math.floor(this.combo/10)*10);
       if(e.lane===1)this.jumps++;if(e.lane===2)this.spins++;
       if(e.lane===3){this.caught++;b.status='caught';b.resolvedAt=e.time;}
       events.push({...e,kind:e.lane===3?'catch':'dodge',points});
     }else{
       b.steps[e.lane]='hit';b.status='exploded';b.resolvedAt=e.time;this.exploded++;this.combo=0;const penalty=Math.min(120,this.score);this.score-=penalty;
       for(let i=e.lane+1;i<=3;i++)b.steps[i]='cancelled';events.push({...e,kind:'bomb',penalty});
     }
   }
   this.time=end;if(end>=this.duration)this.finished=true;
   // Retain enough history to judge contacts exactly, even after a dropped frame.
   for(let lane=1;lane<=3;lane++)this.actions[lane]=this.actions[lane].filter(t=>end-t<2);
   return events;
 }
 get grade(){const total=this.balls.filter(b=>b.status!=='flying').length,ratio=total?this.caught/total:0;return ratio>=.95?'S':ratio>=.8?'A':ratio>=.6?'B':'C';}
}
