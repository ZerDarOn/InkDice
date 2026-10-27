const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
export function convexFaces(vertices){
  const faces=new Map(),eps=1e-6;
  for(let a=0;a<vertices.length;a++)for(let b=a+1;b<vertices.length;b++)for(let c=b+1;c<vertices.length;c++){
    let normal=cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a]));if(Math.hypot(...normal)<eps)continue;normal=unit(normal);let d=dot(normal,vertices[a]);
    let distances=vertices.map(v=>dot(normal,v)-d);if(distances.some(v=>v>eps)&&distances.some(v=>v< -eps))continue;
    if(d<0){normal=normal.map(v=>-v);d=-d;distances=distances.map(v=>-v);}
    const indices=distances.map((v,i)=>Math.abs(v)<eps?i:-1).filter(i=>i>=0),key=indices.join(',');if(faces.has(key))continue;
    const center=[0,1,2].map(i=>indices.reduce((n,k)=>n+vertices[k][i],0)/indices.length),u=unit(sub(vertices[indices[0]],center)),v=cross(normal,u);
    indices.sort((a,b)=>Math.atan2(dot(sub(vertices[a],center),v),dot(sub(vertices[a],center),u))-Math.atan2(dot(sub(vertices[b],center),v),dot(sub(vertices[b],center),u)));
    faces.set(key,{indices,normal,center,d});
  }
  return [...faces.values()];
}
const cache=new Map();
export function dieGeometry(sides){
  if(cache.has(sides))return cache.get(sides);
  const phi=(1+Math.sqrt(5))/2,vertices=[];
  if(sides===4)vertices.push([1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]);
  else if(sides===6)for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])vertices.push([x,y,z]);
  else if(sides===8)for(let i=0;i<3;i++)for(const sign of [-1,1])vertices.push([0,1,2].map(j=>j===i?sign:0));
  else if(sides===20)for(const a of [-1,1])for(const b of [-phi,phi])vertices.push([0,a,b],[a,b,0],[b,0,a]);
  else if(sides===12){for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])vertices.push([x,y,z]);for(const a of [-1/phi,1/phi])for(const b of [-phi,phi])vertices.push([0,a,b],[a,b,0],[b,0,a]);}
  else if(sides===10){const ring=Array.from({length:10},(_,i)=>[Math.cos(i*Math.PI/5),Math.sin(i*Math.PI/5),i%2?.5:-.5]);for(const face of convexFaces(ring))vertices.push(face.normal.map(v=>v/face.d));}
  else return null;
  const radius=Math.max(...vertices.map(v=>Math.hypot(...v))),points=vertices.map(v=>v.map(x=>x/radius)),faces=convexFaces(points),geometry={vertices:points,faces};
  if(faces.length!==sides)throw Error(`骰子几何面数不匹配：${sides}/${faces.length}`);cache.set(sides,geometry);return geometry;
}
export function alignFront(point,normal){
  const target=[0,0,1],axis=cross(normal,target),cos=dot(normal,target),sin=Math.hypot(...axis);
  if(sin<1e-7)return cos>0?point:[point[0],-point[1],-point[2]];
  const k=axis.map(v=>v/sin),kp=cross(k,point),kd=dot(k,point);
  return point.map((v,i)=>v*cos+kp[i]*sin+k[i]*kd*(1-cos));
}
export function sceneDice(result){
  if(result.kind==='coc')return [{sides:10,value:result.units,label:'个位',zeroBased:true},...result.tens.map((t,i)=>({sides:10,value:t,label:i?'额外十位':'十位',tens:true,zeroBased:true}))];
  return result.rolls.flatMap((value,i)=>result.sides===100?[{sides:10,value:Math.floor(value%100/10),label:`骰 ${i+1} 十位`,tens:true,zeroBased:true},{sides:10,value:value%10,label:`骰 ${i+1} 个位`,zeroBased:true}]:[{sides:result.sides,value,label:result.mode==='normal'?`d${result.sides}`:`第 ${i+1} 次`}]);
}
