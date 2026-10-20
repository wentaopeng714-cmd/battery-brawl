export const FLIGHT_DURATION = 1.9;
export const BLAST_DURATION = 1.35;

// Local car-space pose: launch, complete turns, then two diminishing landing bounces.
export function flightPose(age,{level=0,direction=1,reduced=false,secondary=false}={}){
  const duration=secondary?1.3:FLIGHT_DURATION+Math.max(0,level)*.06;
  if(age<0||age>=duration)return {active:false,x:0,y:0,angle:0,sx:1,sy:1,landed:false};
  const u=age/duration,air=.73,power=secondary?.55:1;
  if(reduced)return {active:true,x:0,y:-Math.sin(u*Math.PI)*10,angle:0,sx:1,sy:1,landed:u>=air};
  if(u<air){
    const q=u/air,arc=Math.sin(Math.PI*q),turns=secondary?1:2+Math.floor(level/3);
    return {active:true,x:direction*(65+level*8)*arc*power,y:-(105+level*11)*arc*power,
      angle:direction*turns*Math.PI*2*(1-Math.pow(1-q,2)),sx:1+.1*arc,sy:1-.22*Math.abs(Math.sin(q*Math.PI*turns)),landed:false};
  }
  const v=(u-air)/(1-air),bounce=Math.abs(Math.sin(v*Math.PI*2))*(1-v),squash=Math.sin(v*Math.PI*4)*(1-v)*.13;
  return {active:true,x:0,y:-25*bounce*power,angle:0,sx:1+squash,sy:1-squash,landed:true};
}
