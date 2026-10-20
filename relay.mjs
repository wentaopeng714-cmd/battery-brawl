import {RelayRound,DURATION,STAGES,ACTIONS,stageAt} from './relay-engine.mjs';
import {Training} from './tutorial.mjs';
import {flightPose,FLIGHT_DURATION} from './effects.mjs';
const $=id=>document.getElementById(id),canvas=$('gameCanvas'),ctx=canvas.getContext('2d',{alpha:false});
const store={get(k,f){try{return JSON.parse(localStorage.getItem('battery-brawl:'+k))??f;}catch{return f;}},set(k,v){try{localStorage.setItem('battery-brawl:'+k,JSON.stringify(v));}catch{}}};
const prefs={volume:store.get('volume',65),muted:store.get('muted',false),reduced:store.get('reduced',matchMedia('(prefers-reduced-motion: reduce)').matches)};
const MUSIC_SECTIONS=STAGES.map((s,i)=>({...s,start:i*20,end:(i+1)*20}));
let state='loading',round=null,training=null,best=store.get('best',0),bestCaught=store.get('bestCaught',0),anchor=0,lastT=0,phase=-1,lastHud=0,lastMs=performance.now(),toastUntil=0,bannerUntil=0,pauseMode='playing',settingsResume=false,assetsReady=false;
let w=390,h=844,ratio=1;
const cars=[],actionAt=[-100,-100,-100,-100],flights=[null,null,null,null],feedback=[null,null,null,null],pressed=new Set();let blasts=[],flip=null,batterySprite=null;
class Sound {
  constructor(){this.ctx=null;this.master=null;this.musicBus=null;this.events=[];this.cursor=0;this.sources=new Set();this.noise=null;}
  async init(){
    if(!this.ctx){
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)throw new Error('这个浏览器暂不支持游戏音频，请用新版 Chrome、Safari 或 Edge。');
      this.ctx=new Audio();this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);
      const compressor=this.ctx.createDynamicsCompressor();compressor.threshold.value=-14;compressor.ratio.value=5;
      this.musicBus=this.ctx.createGain();this.musicBus.gain.value=.5;this.musicBus.connect(compressor);compressor.connect(this.master);
      this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate*.25,this.ctx.sampleRate);
      const arr=this.noise.getChannelData(0);for(let i=0;i<arr.length;i++)arr[i]=(Math.random()*2-1)*(1-i/arr.length);
      this.applyVolume();
    }
    await this.ctx.resume();
  }
  applyVolume(){if(this.master)this.master.gain.setTargetAtTime(prefs.muted?0:prefs.volume/100*.65,this.ctx.currentTime,.02);}
  track(source){this.sources.add(source);source.onended=()=>{this.sources.delete(source);try{source.disconnect();}catch{}};return source;}
  tone(freq,time,duration=.1,type='sine',volume=.2,target=null,bus=this.musicBus){
    const o=this.track(this.ctx.createOscillator()),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,time);
    if(target!==null)o.frequency.exponentialRampToValueAtTime(Math.max(10,target),time+duration);
    g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume,time+.003);g.gain.exponentialRampToValueAtTime(.0001,time+duration);
    o.connect(g);g.connect(bus);o.start(time);o.stop(time+duration+.01);
  }
  hiss(time,duration=.06,volume=.06,cutoff=6500){
    const s=this.track(this.ctx.createBufferSource()),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noise;
    f.type='highpass';f.frequency.value=cutoff;g.gain.setValueAtTime(volume,time);g.gain.exponentialRampToValueAtTime(.0001,time+duration);s.loop=duration>.25;
    s.connect(f);f.connect(g);g.connect(this.musicBus);s.start(time);s.stop(time+duration);
  }
  prepare(bombs=[]){
    this.stop();this.events=[];this.cursor=0;
    for(let i=-3;i<0;i++)this.events.push({t:i,type:'count'});
    MUSIC_SECTIONS.forEach((s,index)=>{
      const beat=60/s.bpm;
      for(let k=0;s.start+k*beat<s.end-.02;k++){
        const t=s.start+k*beat;
        this.events.push({t,type:'beat',k,index,beat});
        if(t+beat/2<s.end)this.events.push({t:t+beat/2,type:'half',k,index,beat});
      }
    });
    const warningTimes=new Set();
    for(const b of bombs){if(warningTimes.has(b.time))continue;warningTimes.add(b.time);this.events.push({t:b.time-.6,type:'hazard',double:bombs.filter(o=>Math.abs(o.time-b.time)<.001).length>1});}
    this.events.sort((a,b)=>a.t-b.t);
  }
  schedule(time,origin){
    while(this.cursor<this.events.length && this.events[this.cursor].t<time+.15){
      const e=this.events[this.cursor++],at=origin+e.t;
      if(at<this.ctx.currentTime-.06)continue;
      const t=Math.max(at,this.ctx.currentTime+.002);
      if(e.type==='count'){this.tone(660,t,.09,'sine',.13);continue;}
      if(e.type==='hazard'){
        this.tone(980,t,.025,'square',.035);this.tone(710,t+.1,.035,'triangle',.04);
        if(e.double)this.tone(1230,t+.2,.025,'square',.035);continue;
      }
      if(e.type==='beat'){
        this.tone(145,t,.17,'sine',.47,43); // kick
        if(e.k%2===1){this.hiss(t,.09,.18,1800);this.tone(175,t,.07,'triangle',.12);}
        this.hiss(t,.035,.045,6500);
        const bass=[73.42,73.42,110,98,73.42,87.31,65.41,98][Math.floor(e.k/2)%8];
        this.tone(bass,t,e.beat*.58,'triangle',.16);
        const melody=[293.66,440,349.23,523.25,440,349.23,329.63,261.63,293.66,349.23,440,587.33,523.25,440,349.23,329.63];
        this.tone(melody[e.k%16]*(e.index>=4?2:1),t,e.beat*.26,'square',e.index===0?.018:.027);
        if(e.k%8===0)this.tone(1174.66,t,.28,'sine',.04,587.33);
      }else{
        this.hiss(t,.025,e.index>2?.065:.035,8000);
        if(e.index>=3)this.tone([440,523.25,587.33,349.23][e.k%4],t,.06,'triangle',.05);
        if(e.index>=4){this.hiss(t+e.beat*.25,.02,.035,7000);if(e.k%4===3)this.tone(1174.66,t+e.beat*.25,.045,'square',.017);}
      }
    }
  }
  hit(lane,perfect=true){
    if(!this.ctx)return;const t=this.ctx.currentTime+.003,v=perfect?.21:.13;
    if(lane===0){this.tone(300,t,.11,'sawtooth',v*.5,1200);this.hiss(t,.07,.07,3500);}
    if(lane===1){this.tone(210,t,.14,'sine',v*1.5,68);this.tone(620,t,.06,'triangle',v*.2);}
    if(lane===2){this.tone(400,t,.17,'triangle',v,1350);this.tone(800,t+.05,.14,'sine',v*.35,350);}
    if(lane===3){this.tone(1100,t,.035,'square',v*.4);this.tone(650,t+.045,.05,'square',v*.25);}
  }
  miss(){if(this.ctx)this.tone(75,this.ctx.currentTime+.002,.045,'triangle',.055,50);}
  explode(level=0,lane=0){
    if(!this.ctx)return;const t=this.ctx.currentTime+.003;
    this.hiss(t,.36,.46,150);this.tone(145,t,.32,'sine',.46,24);
    const base=[220,277,330,185][lane];
    this.tone(base,t+.045,.19,'sawtooth',.08,1500);this.tone(1560,t+.2,.33,'triangle',.12,170);
    for(let i=0;i<(level>=4?5:3);i++)this.tone([622,830,466,932,622][i],t+.46+i*.085,.055,'square',.055);
    const landing=(FLIGHT_DURATION+level*.06)*.73;
    this.tone(940,t+Math.max(.85,landing-.4),.38,'sine',.08,100);
    this.tone(115,t+landing,.16,'sine',.25,38);this.hiss(t+landing,.07,.12,1500);
    this.tone(310,t+landing+.16,.16,'triangle',.095,85);
  }
  flourish(){if(!this.ctx)return;[293.66,349.23,440,587.33].forEach((f,i)=>this.tone(f,this.ctx.currentTime+i*.075,.18,'triangle',.12));}
  stop(){for(const s of this.sources){try{s.stop();s.disconnect();}catch{}}this.sources.clear();}
}
const sound=new Sound();

const carSize=[{w:210,h:202},{w:192,h:136},{w:206,h:108},{w:222,h:182}];
const roleNames=['弹射','起跳','翻转','接住'],roleColors=['#eb5941','#f3c855','#78cbdc','#b4d77b'];
function image(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('小车还没准备好，刷新一下再试。'));i.src=src;});}
function resize(){const r=$('stage').getBoundingClientRect();w=r.width;h=r.height;ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
new ResizeObserver(resize).observe($('stage'));
function clock(){return state==='tutorial'||(state==='paused'&&pauseMode==='tutorial')?training.time:sound.ctx?sound.ctx.currentTime-anchor:0;}
function mode(next){state=next;$('gameRoot').className='game '+(next==='paused'?pauseMode:next);}
function geometry(){const land=w>h*1.4,lobby=state==='lobby'||state==='loading';const floor=land?h*(lobby?.7:.51):h*(lobby?.52:state==='tutorial'||state==='paused'&&pauseMode==='tutorial'?.56:.5);const s=land?Math.min(w/1300,h*.24/180):w/1050;return {land,floor,s,xs:land&&lobby?[w*.12,w*.26,w*.4,w*.54]:[w*.13,w*.38,w*.61,w*.87]};}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');toastUntil=performance.now()+1600;}
function medal(n){return n>=55?'电池克星':n>=35?'接电高手':n>=15?'接力达人':n>=1?'接力新秀':'新手上路';}
function nextContact(lane,t){return round?.balls.filter(b=>b.status==='flying'&&b.steps[lane]==='pending'&&b.times[lane]>=t).sort((a,b)=>a.times[lane]-b.times[lane])[0];}
function ready(lane,t){if(state==='tutorial')return training.waiting&&training.step===lane;const b=nextContact(lane,t),d=b?b.times[lane]-t:100;return d<=.5&&d>.025&&t-round.lastAction[lane]>=ACTIONS[lane].cooldown;}
function battery(x,y,angle=0,s=1){ctx.save();ctx.translate(x,y);ctx.rotate(angle);const width=54*s,height=width*batterySprite.height/batterySprite.width;ctx.drawImage(batterySprite,-width/2,-height/2,width,height);ctx.restore();}
function car(lane,g,t){const age=t-actionAt[lane],a=ACTIONS[lane],lobby=state==='lobby';let p=age>=0&&age<(a?.duration||.5)?age/(a?.duration||.5):-1;
 if(lobby){const cycle=(t+lane*.75)%5;if(lane===1&&cycle<.7)p=cycle/.7;if(lane===2&&cycle<.86)p=cycle/.86;}
 const x=g.xs[lane],s=g.s,flight=flights[lane],pose=flight?flightPose(t-flight.start,{level:stageAt(t),direction:lane%2?1:-1,reduced:prefs.reduced}):null;
 ctx.save();ctx.fillStyle='#646e431e';ctx.beginPath();ctx.ellipse(x,g.floor+5,67*s,6*s+1,0,0,7);ctx.fill();ctx.restore();
 ctx.save();ctx.translate(x,g.floor);if(pose?.active){ctx.translate(pose.x*Math.min(1,s*1.7),pose.y*Math.min(1,s*1.8));ctx.rotate(pose.angle);ctx.scale(pose.sx,pose.sy);}else if(flight)flights[lane]=null;
 if(lane===0&&p>=0&&!prefs.reduced)ctx.rotate(Math.sin(p*16)*.08*(1-p));
 if(lane===1&&p>=0){ctx.translate(0,-Math.sin(p*Math.PI)*(prefs.reduced?7:g.land?50:63));ctx.scale(1+.1*Math.sin(p*Math.PI),1-.08*Math.sin(p*Math.PI));}

 if(lane===3&&p>=0)ctx.translate(Math.sin(p*15)*2,0);
 if(lane===2&&p>=0&&!prefs.reduced){const frame=Math.min(41,Math.floor(p*42));ctx.drawImage(flip,(frame%7)*250,Math.floor(frame/7)*330,250,330,-125*s,-330*s,250*s,330*s);}
 else{const r=carSize[lane];if(lane===2&&p>=0)ctx.translate(0,-8);ctx.drawImage(cars[lane],-r.w*s/2,-r.h*s,r.w*s,r.h*s);}
 if(lane===3&&p>=0){const span=49*s;ctx.strokeStyle='#587b31';ctx.lineWidth=Math.max(2,5*s);ctx.beginPath();ctx.moveTo(-span,-10*s);ctx.lineTo(-span,8*s);ctx.lineTo(span,8*s);ctx.lineTo(span,-10*s);ctx.stroke();}
 ctx.restore();
 ctx.save();ctx.textAlign='center';ctx.font=`900 ${g.land?11:w<360?11:13}px -apple-system,sans-serif`;ctx.fillStyle='#4e5d39';ctx.fillText(roleNames[lane],x,g.floor+(g.land?23:31));ctx.font=`700 ${g.land?7:8}px ui-monospace,monospace`;ctx.fillStyle='#9aa180';ctx.fillText(lane===0?'AUTO':`0${lane}`,x,g.floor+(g.land?36:47));ctx.restore();
}
function position(b,t,g){const times=[b.launch,...b.times.slice(1)],xs=[g.xs[0]+35*g.s,...g.xs.slice(1)];for(let i=1;i<=3;i++)if(t<=times[i]){const p=Math.max(0,Math.min(1,(t-times[i-1])/(times[i]-times[i-1])));return {x:xs[i-1]+(xs[i]-xs[i-1])*p,y:g.floor-8-Math.sin(p*Math.PI)*3};}return {x:xs[3],y:g.floor-8};}
function blast(b,g,t){const age=t-b.start;if(age<0||age>1.3)return;const p=age/1.3,u=w<500?.8:1.2;ctx.save();ctx.translate(g.xs[b.lane],g.floor-38);if(age<.42){const r=(20+55*Math.sin(Math.min(1,age/.3)*Math.PI/2))*u;ctx.globalAlpha=1-age/.42;ctx.fillStyle='#ffcc3c';ctx.strokeStyle='#273024';ctx.lineWidth=2;ctx.beginPath();for(let k=0;k<24;k++){const a=k*Math.PI/12,z=k%2?r*.52:r;k?ctx.lineTo(Math.cos(a)*z,Math.sin(a)*z):ctx.moveTo(Math.cos(a)*z,Math.sin(a)*z);}ctx.closePath();ctx.fill();ctx.stroke();}
 if(!prefs.reduced){for(let k=0;k<12;k++){const a=k*Math.PI/6;ctx.globalAlpha=(1-p)*.7;ctx.save();ctx.translate(Math.cos(a)*age*110*u,Math.sin(a)*age*70*u+age*age*55);ctx.rotate(age*8+k);ctx.fillStyle=k%2?'#61704b':'#ec5b37';ctx.fillRect(-3,-3,6,6);ctx.restore();}}
 ctx.globalAlpha=Math.min(1,(1-p)*2);ctx.rotate(-.12);ctx.font=`900 ${30*u}px -apple-system,sans-serif`;ctx.textAlign='center';ctx.strokeStyle='#fff7ce';ctx.lineWidth=5;ctx.fillStyle='#dd432b';const txt=age<.3?'BOOM!':'飞了！';ctx.strokeText(txt,0,-38-age*18);ctx.fillText(txt,0,-38-age*18);ctx.restore();}
function draw(){ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#f5f1dd';ctx.fillRect(0,0,w,h);if(!assetsReady)return;const g=geometry(),t=round?Math.max(0,lastT):performance.now()/1000;
 ctx.save();ctx.fillStyle='#89976c16';for(let x=22;x<w;x+=27)for(let y=19;y<h;y+=27){ctx.beginPath();ctx.arc(x,y,.8,0,7);ctx.fill();}ctx.restore();
 ctx.fillStyle='#e9e9cd';ctx.strokeStyle='#d7dcc0';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(w/2,g.floor+8,w*.54,g.land?25:37,0,0,7);ctx.fill();ctx.stroke();ctx.setLineDash([3,7]);ctx.strokeStyle='#b4bf92';ctx.beginPath();ctx.moveTo(w*.045,g.floor-3);ctx.lineTo(w*.96,g.floor-3);ctx.stroke();ctx.setLineDash([]);
 if(round){for(let lane=1;lane<=3;lane++)if(ready(lane,t)){ctx.save();ctx.strokeStyle='#e7a33a';ctx.fillStyle='#fff3bc';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(g.xs[lane],g.floor+8,88*g.s,12,0,0,7);ctx.fill();ctx.stroke();ctx.font='900 19px sans-serif';ctx.textAlign='center';ctx.fillStyle='#dc6433';ctx.fillText('↓',g.xs[lane],g.floor-180*g.s-17);ctx.restore();}}
 for(let i=0;i<4;i++)car(i,g,t);
 if(round){for(const b of round.balls){if(b.status==='flying'&&t>=b.launch&&t<=b.times[3]){const q=position(b,t,g);if(!prefs.reduced){for(const dt of [.1,.05]){const old=position(b,Math.max(b.launch,t-dt),g);ctx.globalAlpha=.13;battery(old.x,old.y,0,Math.max(.58,g.s));}ctx.globalAlpha=1;}battery(q.x,q.y,0,Math.max(.58,g.s));}
 if(b.status==='caught'&&t-b.resolvedAt>=0&&t-b.resolvedAt<.55){const p=(t-b.resolvedAt)/.55;ctx.save();ctx.globalAlpha=1-p;battery(g.xs[3],g.floor-5+p*11,0,Math.max(.58,g.s)*(1-p*.5));ctx.restore();}}
 for(let i=1;i<=3;i++){const f=feedback[i];if(f&&t-f.start>=0&&t-f.start<.75){ctx.save();ctx.globalAlpha=1-(t-f.start)/.75;ctx.textAlign='center';ctx.font=`900 ${w<500?13:17}px -apple-system,sans-serif`;ctx.fillStyle=f.bad?'#d7432c':'#607e36';ctx.fillText(f.text,g.xs[i],g.floor+75-(t-f.start)*28);ctx.restore();}}}
 blasts=blasts.filter(b=>t-b.start<1.3);for(const b of blasts)blast(b,g,t);
 if(state==='lobby'){ctx.save();ctx.translate(w*.72,h*.24);ctx.rotate(-.25);battery(0,0,.1,1.1);ctx.fillStyle='#8a9876';ctx.font='900 16px sans-serif';ctx.textAlign='center';ctx.fillText('✦',-25,-30);ctx.fillText('✧',30,29);ctx.restore();}
}
function receive(events){for(const e of events){if(e.kind==='launch'){actionAt[0]=e.time;sound.hit(0,false);}else if(e.kind==='bomb'){flights[e.lane]={start:e.time};blasts.push({lane:e.lane,start:e.time});sound.explode(stageAt(e.time),e.lane);feedback[e.lane]={start:e.time,text:'起飞了！',bad:true};navigator.vibrate?.([45,20,65]);}else if(e.kind==='catch'){feedback[3]={start:e.time,text:'+150 接住！'};sound.hit(3,true);if(state==='playing'&&round.caught%5===0){toast(`接住 ${round.caught} 颗！`);sound.flourish();}}else{feedback[e.lane]={start:e.time,text:e.lane===1?'跳过！+60':'翻过！+60'};sound.hit(e.lane,false);}}}
function reset(){actionAt.fill(-100);flights.fill(null);feedback.fill(null);blasts=[];pressed.clear();phase=-1;lastT=0;$('toast').classList.remove('show');$('waveBanner').hidden=true;}
function hidePanels(){for(const id of ['lobby','pausePanel','trainingDone','resultPanel','settingsPanel'])$(id).hidden=true;}
function home(){sound.stop();if(sound.ctx?.state==='suspended')sound.ctx.resume();round=null;training=null;reset();mode('lobby');hidePanels();$('lobby').hidden=false;for(const id of ['gameHud','controls','coach','playTip','countdown'])$(id).hidden=true;$('bestScore').textContent=String(best).padStart(6,'0');$('bestMedal').textContent=medal(bestCaught);}
async function initAudio(){try{await sound.init();return true;}catch(e){toast(e.message);return false;}}
async function startTraining(){if(!assetsReady||!await initAudio())return;sound.stop();reset();hidePanels();training=new Training();round=training.round;mode('tutorial');lastMs=performance.now();$('gameHud').hidden=false;$('controls').hidden=false;$('coach').hidden=false;$('playTip').hidden=true;$('countdown').hidden=true;hud(true);}
async function startChallenge(){if(!assetsReady||!await initAudio())return;reset();hidePanels();training=null;round=new RelayRound();mode('playing');anchor=sound.ctx.currentTime+2.2;lastT=-2.2;$('gameHud').hidden=false;$('controls').hidden=false;$('coach').hidden=true;$('playTip').hidden=false;$('countdown').hidden=false;sound.prepare();hud(true);}
function begin(){if(store.get('trained',false))startChallenge();else startTraining();}
function act(lane){if(!['playing','tutorial'].includes(state)||state==='playing'&&clock()<0)return;let a,t;if(state==='tutorial'){a=training.action(lane);t=training.time;if(!a)return;}else{t=clock();receive(round.update(t));a=round.action(lane,t);if(!a)return;}actionAt[lane]=t;flights[lane]=null;sound.hit(lane,true);lastT=t;hud(true);}
function hud(force=false){if(!force&&performance.now()-lastHud<60)return;lastHud=performance.now();if(!round)return;const tut=state==='tutorial'||state==='paused'&&pauseMode==='tutorial',t=Math.max(0,lastT),left=Math.max(0,Math.ceil(120-t));$('timeLeft').textContent=tut?'训练':`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;$('score').textContent=String(round.score).padStart(6,'0');$('catchCount').textContent=tut?`教学 ${Math.min(training.step,3)} / 3`:`接住 ${round.caught} / 70`;$('comboCount').textContent=`${round.combo} 连击`;$('crashCount').textContent=`炸飞 ${round.exploded} 次`;$('progress').style.width=tut?`${(training.step-1)/3*100}%`:`${t/120*100}%`;
 if(tut){const step=Math.min(3,training.step);$('phaseTag').textContent='TRAINING';$('coachStep').textContent=`0${step} / 03 · ${roleNames[step]}`;$('coachTitle').textContent=training.waiting?['','电池来了，按起跳！','这次，空中翻过去！','最后一步，接住它！'][step]:'看电池飞向哪里…';$('coachText').textContent=['','按黄色按钮，小车会从电池上面跳过去。','按蓝色按钮，空中翻一圈躲开电池。','按绿色按钮，把电池收入底盘。'][step];}
 else{const si=stageAt(t);if(phase!==si){phase=si;$('phaseTag').textContent=`0${si+1} / 06`;$('tempoLabel').textContent=`第 ${si+1} 波 · ${STAGES[si].tag}`;if(si>0){$('waveTag').textContent=`第 ${si+1} 波 / 6`;$('waveTitle').textContent=STAGES[si].tag;$('waveBanner').hidden=false;bannerUntil=performance.now()+1600;sound.flourish();}}}
 for(const b of document.querySelectorAll('[data-action]')){const lane=Number(b.dataset.action),active=t-actionAt[lane]<ACTIONS[lane].duration&&t>=actionAt[lane],cue=ready(lane,t);b.classList.toggle('active',active);b.classList.toggle('ready',cue);b.classList.toggle('dim',tut&&training.step!==lane);b.querySelector('em').textContent=cue?['','现在跳！','现在转！','现在接！'][lane]:active?['','正在起跳','正在翻转','正在接住'][lane]:['','躲过电池','空中躲避','收下电池'][lane];}
 const next=round.balls.flatMap(b=>b.status==='flying'?[1,2,3].filter(l=>b.steps[l]==='pending'&&b.times[l]>=t).map(l=>({lane:l,time:b.times[l]})):[]).sort((a,b)=>a.time-b.time)[0];$('statusText').textContent=next?['','↑ 起跳，把电池让过去','⟳ 翻转，继续接力','⊔ 接住！这一颗归你了'][next.lane]:'漂亮！下一颗准备。';}
function trainingComplete(){mode('training-done');$('coach').hidden=true;$('controls').hidden=true;$('trainingDone').hidden=false;store.set('trained',true);sound.flourish();}
function pause(reason='这一局，给你留着。'){if(!['playing','tutorial'].includes(state))return;pauseMode=state;mode('paused');sound.ctx.suspend();pressed.clear();$('pauseReason').textContent=reason;$('pausePanel').hidden=false;$('countdown').hidden=true;}
async function resume(){if(state!=='paused')return;await sound.ctx.resume();mode(pauseMode);lastMs=performance.now();$('pausePanel').hidden=true;}
function finish(){mode('result');$('timeLeft').textContent='00:00';$('progress').style.width='100%';sound.stop();sound.flourish();$('controls').hidden=true;$('playTip').hidden=true;$('waveBanner').hidden=true;$('countdown').hidden=true;const record=round.score>best;if(record){best=round.score;store.set('best',best);}if(round.caught>bestCaught){bestCaught=round.caught;store.set('bestCaught',bestCaught);}$('resultTitle').textContent=medal(round.caught);$('recordTag').hidden=!record;$('resultMedal').textContent=round.caught>=35?'✦':'★';$('finalScore').textContent=String(round.score).padStart(6,'0');$('finalCatch').textContent=`${round.caught}/70`;$('finalCombo').textContent=round.maxCombo;$('finalCrash').textContent=round.exploded;$('resultNote').textContent=round.caught>=55?'这一场电池，全听你的。':`再接住 ${Math.max(1,(round.caught<15?15:round.caught<35?35:55)-round.caught)} 颗，冲下一个称号。`;$('resultPanel').hidden=false;}
function openSettings(){settingsResume=['playing','tutorial'].includes(state);if(settingsResume)pause();$('settingsPanel').hidden=false;}
function closeSettings(){ $('settingsPanel').hidden=true;if(settingsResume){settingsResume=false;resume();}}
function frame(ms){const dt=Math.min(.08,(ms-lastMs)/1000);lastMs=ms;
 if(state==='tutorial'){receive(training.advance(dt));lastT=training.time;hud();if(training.complete)trainingComplete();}
 else if(state==='playing'){lastT=clock();sound.schedule(lastT,anchor);if(lastT<0){$('countdown').hidden=false;$('countdown').replaceChildren(document.createTextNode(String(Math.ceil(-lastT))));const s=document.createElement('small');s.textContent='准备 · 跳 · 转 · 接';$('countdown').append(s);}else{$('countdown').hidden=true;receive(round.update(lastT));if(lastT>=120)finish();}hud();}
 draw();if(ms>toastUntil)$('toast').classList.remove('show');if(ms>bannerUntil)$('waveBanner').hidden=true;requestAnimationFrame(frame);}
$('stage').addEventListener('pointerdown',e=>{if(!['playing','tutorial'].includes(state))return;e.preventDefault();const r=$('stage').getBoundingClientRect(),lane=Math.min(3,Math.floor((e.clientX-r.left)/r.width*4));if(lane>0)act(lane);});
for(const b of document.querySelectorAll('[data-action]')){b.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();act(Number(b.dataset.action));});b.addEventListener('click',e=>{if(e.detail===0)act(Number(b.dataset.action));});}
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;const k=e.key.toLowerCase(),lane={f:1,j:2,k:3}[k];if(lane){e.preventDefault();if(!e.repeat&&!pressed.has(k)){pressed.add(k);if($('settingsPanel').hidden)act(lane);}}if((e.code==='Space'||e.key==='Escape')&&!e.repeat){if(!$('settingsPanel').hidden){e.preventDefault();closeSettings();}else if(['playing','tutorial'].includes(state)){e.preventDefault();pause();}else if(state==='paused'){e.preventDefault();resume();}}});document.addEventListener('keyup',e=>pressed.delete(e.key.toLowerCase()));
$('startBtn').onclick=begin;$('trainingBtn').onclick=startTraining;$('beginChallengeBtn').onclick=startChallenge;$('skipTraining').onclick=()=>{store.set('trained',true);startChallenge();};$('trainingHomeBtn').onclick=home;$('againBtn').onclick=startChallenge;$('resultHomeBtn').onclick=home;$('pauseBtn').onclick=()=>pause();$('resumeBtn').onclick=resume;$('restartBtn').onclick=startChallenge;$('homeBtn').onclick=home;
$('settingsBtn').onclick=openSettings;$('settingsClose').onclick=closeSettings;$('settingsDoneBtn').onclick=closeSettings;$('settingsTrainingBtn').onclick=()=>{settingsResume=false;$('settingsPanel').hidden=true;startTraining();};
function preferences(){$('volume').value=prefs.volume;$('volumeValue').textContent=prefs.volume+'%';$('reducedMotion').checked=prefs.reduced;$('soundBtn').textContent=prefs.muted?'♪̸':'♫';$('soundBtn').setAttribute('aria-label',prefs.muted?'开启声音':'关闭声音');sound.applyVolume();}
$('soundBtn').onclick=()=>{prefs.muted=!prefs.muted;store.set('muted',prefs.muted);preferences();};$('volume').oninput=e=>{prefs.volume=Number(e.target.value);store.set('volume',prefs.volume);preferences();};$('reducedMotion').onchange=e=>{prefs.reduced=e.target.checked;store.set('reduced',prefs.reduced);};
$('fullscreenBtn').disabled=!document.fullscreenEnabled;$('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('gameRoot').requestFullscreen();}catch{toast('当前已铺满游戏窗口');}};
window.addEventListener('blur',()=>{if(['playing','tutorial'].includes(state))pause('刚刚切走了，回来接着玩。');});document.addEventListener('visibilitychange',()=>{if(document.hidden&&['playing','tutorial'].includes(state))pause('已暂停，电池等你回来。');});
preferences();resize();requestAnimationFrame(frame);
try{await Promise.all([Promise.all([0,1,2,3].map(async i=>cars[i]=await image(`./assets/car-${i}.webp`))),image('./assets/flip-atlas.webp').then(i=>flip=i),image('./assets/battery.webp').then(i=>batterySprite=i)]);assetsReady=true;$('startBtn').disabled=false;$('startBtn').textContent='开 战 →';home();}catch(e){$('loadError').hidden=false;$('loadError').textContent=e.message;}
