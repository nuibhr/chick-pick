import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function ClubScene({ crowned = false }: { crowned?: boolean }) {
  const host = useRef<HTMLDivElement>(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const el = host.current; let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-label', 'สนามสามมิติ ลากเพื่อหมุน และเลื่อนเพื่อซูม');
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(38, 1, .1, 100); camera.position.set(10, 10, 13);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enablePan = false; controls.minDistance = 10; controls.maxDistance = 24; controls.minPolarAngle = .3; controls.maxPolarAngle = 1.3; controls.target.set(0, .7, 0); controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x788754, 3)); const sun = new THREE.DirectionalLight(0xffedca, 4); sun.position.set(-4, 10, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
    const mesh = (geo: THREE.BufferGeometry, color: number, parent: THREE.Object3D, x=0,y=0,z=0) => { const m = new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color, roughness:.55})); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const box=(w:number,h:number,d:number,color:number,parent:THREE.Object3D,x=0,y=0,z=0)=>mesh(new THREE.BoxGeometry(w,h,d),color,parent,x,y,z);
    box(10,.45,7,0xe5b99c,scene,0,-.35); box(9.7,.15,6.7,0x2e7264,scene,0,-.05); box(7.7,.03,4.7,0x78a88b,scene,0,.05);
    for(const z of [-2.35,2.35]) box(7.8,.035,.045,0xfff7d7,scene,0,.08,z);
    for(const x of [-3.85,3.85,-1.15,1.15]) box(.045,.035,4.7,0xfff7d7,scene,x,.08);
    box(7.7,.035,.045,0xfff7d7,scene,0,.08,0);
    for(const z of [-2.7,2.7]) box(.09,1.25,.09,0x183e36,scene,0,.6,z);
    box(.05,.07,5.4,0xfff6db,scene,0,1.18);
    for(let z=-2.6;z<=2.6;z+=.22) box(.025,.9,.016,0xe5efdd,scene,0,.7,z);
    for(let y=.3;y<1.2;y+=.15) box(.025,.014,5.3,0xe5efdd,scene,0,y);
    const birds: THREE.Group[]=[];
    [-1,1].forEach((side)=>[-1,1].forEach((lane)=>{
      const bird=new THREE.Group(); bird.position.set(side*2.65,.25,lane*1.25); scene.add(bird); birds.push(bird);
      const ball=(r:number,color:number,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{const m=mesh(new THREE.SphereGeometry(r,24,16),color,bird,x,y,z);m.scale.set(sx,sy,sz);return m;};
      ball(.63,0xfff5de,0,.7,0,1,1.12,.9); ball(.45,0xfffcf1,0,1.34,.05);
      ball(.28,side===1?0xe69c66:0x48775f,0,.47,.05,1.95,.7,1.7);
      for(const x of [-.17,.17]) {ball(.07,0x253d37,x,1.43,.43);ball(.12,0xf7bb91,x*1.6,1.28,.43,1,.55,.4);ball(.13,0xf3b656,x,.13,.16,1,.5,1.5);}
      const beak=mesh(new THREE.ConeGeometry(.12,.25,12),0xe9a347,bird,0,1.3,.52);beak.rotation.x=Math.PI/2;
      for(const x of [-.16,0,.16]) ball(.12,0xe87964,x,1.76,.04,.8,1.4,1);
      ball(.22,0xffeed6,-.56,.78,0,.6,1.5,.8); ball(.22,0xffeed6,.55,.8,0,.6,1.5,.8);
      box(.06,.44,.07,0x9c6954,bird,.72,.62,.08); ball(.27,side===1?0xeead79:0x253f3a,.72,.99,.08,1,1.2,.22);
      if(crowned && side===1) { const crown=mesh(new THREE.CylinderGeometry(.26,.2,.2,5),0xf3c655,bird,0,1.98,0); for(let i=0;i<5;i++) mesh(new THREE.ConeGeometry(.065,.2,5),0xf3c655,crown,Math.cos(i*1.257)*.21,.19,Math.sin(i*1.257)*.21); }
    }));
    const pickle=mesh(new THREE.SphereGeometry(.13,16,12),0xf9dc62,scene,1,1.4,.7);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches; let frame=0; const start=performance.now();
    const render=()=>{ const t=(performance.now()-start)/1000; if(!reduced){ birds.forEach((b,i)=>{b.position.y=.25+Math.sin(t*2+i)*.045;b.rotation.y=Math.sin(t*.7+i)*.1;});pickle.position.x=Math.sin(t)*2;pickle.position.y=1.5+Math.abs(Math.cos(t))*1.1; } controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(render); };
    const resize=new ResizeObserver(()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(el);render();
    return ()=>{cancelAnimationFrame(frame);resize.disconnect();controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});renderer.dispose();renderer.domElement.remove();};
  },[crowned]);
  return <div className="club-scene" ref={host}>{failed && <img src="/chicken-court-3d.webp" alt="มาสคอตไก่บนสนามพิเคิลบอล"/>}<span className="scene-hint">{failed ? 'CHICKEN COURT CLUB' : '↔ ลากหมุนสนาม · เลื่อนเพื่อซูม'}</span></div>;
}
