import {dieGeometry,alignFront,sceneDice} from './dice-geometry.mjs';
const rotate=(p,x,y)=>{const a=[p[0],p[1]*Math.cos(x)-p[2]*Math.sin(x),p[1]*Math.sin(x)+p[2]*Math.cos(x)];return [a[0]*Math.cos(y)+a[2]*Math.sin(y),a[1],-a[0]*Math.sin(y)+a[2]*Math.cos(y)];};
export function paintDice(container,result,{animate=true}={}){
  container._stopDice?.();let frame=0;container._stopDice=()=>cancelAnimationFrame(frame);container.replaceChildren();
  if(!result){container.hidden=true;return;}container.hidden=false;
  const dice=sceneDice(result),shown=dice.slice(0,8),canvas=document.createElement('canvas'),note=document.createElement('small');container.append(canvas,note);canvas.setAttribute('role','img');canvas.setAttribute('aria-label',shown.map(d=>`${d.label} ${d.tens?String(d.value*10).padStart(2,'0'):d.value}`).join('，'));
  note.textContent=`3D 展示实际骰点${dice.length>8?` · 显示前 8 / ${dice.length} 颗，全部结果见记录`:''} · 非物理模拟`;
  const width=Math.max(260,container.clientWidth||360),columns=Math.min(4,shown.length),rows=Math.ceil(shown.length/columns),height=rows*104,ratio=Math.min(devicePixelRatio||1,2);canvas.width=width*ratio;canvas.height=height*ratio;canvas.style.height=height+'px';const ctx=canvas.getContext('2d');if(!ctx){note.textContent='3D 画布不可用；完整骰点见下方。';return;}ctx.scale(ratio,ratio);
  const styles=getComputedStyle(container),text=styles.getPropertyValue('--bone').trim()||'#eee9dd',edge=styles.getPropertyValue('--brass').trim()||'#c8a96b';
  const start=performance.now(),duration=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches?850:0;
  function draw(now){
    if(!container.isConnected)return;const t=duration?Math.min(1,(now-start)/duration):1,spin=Math.pow(1-t,3);ctx.clearRect(0,0,width,height);
    shown.forEach((die,index)=>{
      const cx=width/columns*(index%columns+.5),cy=104*(Math.floor(index/columns)+.48),size=Math.min(36,width/columns*.4),geometry=dieGeometry(die.sides);
      ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(cx,cy+size*.8,size*.85,6,0,0,Math.PI*2);ctx.fill();
      if(!geometry){ctx.fillStyle=text;ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.fillText(String(die.value),cx,cy);ctx.font='12px sans-serif';ctx.fillText(`d${die.sides} · 数字显示`,cx,cy+35);return;}
      const normal=geometry.faces[0].normal;
      const transform=p=>rotate(alignFront(p,normal),.3+spin*(Math.PI*4+index),-.35+spin*Math.PI*6);
      const projection=p=>[cx+p[0]*size*3/(3-p[2]*.35),cy-p[1]*size*3/(3-p[2]*.35)-Math.sin(t*Math.PI)*8];
      const points=geometry.vertices.map(v=>projection(transform(v)));
      const faces=geometry.faces.map((f,i)=>({...f,index:i,n:transform(f.normal),c:transform(f.center)})).filter(f=>f.n[2]>-.04).sort((a,b)=>a.c[2]-b.c[2]);
      for(const face of faces){ctx.beginPath();face.indices.forEach((v,i)=>i?ctx.lineTo(...points[v]):ctx.moveTo(...points[v]));ctx.closePath();const light=Math.round(28+face.n[2]*25+face.n[1]*8);ctx.fillStyle=`hsl(${result.kind==='coc'?204:40} 35% ${light}%)`;ctx.fill();ctx.lineWidth=1;ctx.strokeStyle=edge;ctx.stroke();
        if(face.n[2]>.3){const p=projection(face.c),value=die.zeroBased?(die.value+face.index)%die.sides:(die.value-1+face.index)%die.sides+1;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${Math.round((die.sides>=12?15:19)*Math.max(.65,face.n[2]))}px sans-serif`;ctx.fillStyle='#fff7e7';ctx.fillText(die.tens?String(value*10).padStart(2,'0'):String(value),p[0],p[1]);}
      }
      ctx.fillStyle=text;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.font='12px sans-serif';ctx.fillText(die.label,cx,104*(Math.floor(index/columns)+1)-5);
    });
    if(t<1)frame=requestAnimationFrame(draw);else canvas.dataset.settled='true';
  }
  frame=requestAnimationFrame(draw);
  if(animate)container.scrollIntoView({block:'nearest'});
}
