import {
  Scene, Group, OrthographicCamera, WebGLRenderer, Mesh, MeshStandardMaterial,
  CylinderGeometry, BoxGeometry, TorusGeometry, DirectionalLight,
  HemisphereLight, PMREMGenerator, ACESFilmicToneMapping,
} from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

// Real geometry and studio reflections; render only while scroll motion settles.
export function mountActuatorLogo(host) {
  if (!host) return;
  let renderer;
  try { renderer=new WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'}); }
  catch { return; } // The static actuator remains visible when WebGL is unavailable.
  const scene=new Scene(), model=new Group(), rotor=new Group();
  const camera=new OrthographicCamera(-1.55,1.55,1.55,-1.55,.1,30);
  camera.position.set(3.3,2.8,6);camera.lookAt(0,0,.1);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0x000000,0);
  renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
  renderer.domElement.setAttribute('aria-hidden','true');
  host.append(renderer.domElement);
  const environment=new RoomEnvironment(), pmrem=new PMREMGenerator(renderer);
  const reflection=pmrem.fromScene(environment,.05);
  scene.environment=reflection.texture;environment.dispose();pmrem.dispose();
  const silver=new MeshStandardMaterial({color:0xc6ccd2,metalness:.95,roughness:.28});
  const edge=new MeshStandardMaterial({color:0xf0f1f3,metalness:1,roughness:.18});
  const graphite=new MeshStandardMaterial({color:0x25282c,metalness:.55,roughness:.38});
  const bolt=new MeshStandardMaterial({color:0x555d65,metalness:1,roughness:.24});
  function cylinder(radius,depth,z,material=silver,parent=model,segments=64){
    const part=new Mesh(new CylinderGeometry(radius,radius,depth,segments),material);
    part.rotation.x=Math.PI/2;part.position.z=z;parent.add(part);return part;
  }
  cylinder(.72,.15,-.55,graphite);
  cylinder(.81,.76,-.13);
  for(const z of [-.43,-.31,-.19,-.07,.05])cylinder(.86,.035,z,edge);
  cylinder(.98,.13,.30,edge);
  cylinder(.88,.055,.39);
  cylinder(.48,.065,.44,graphite);
  cylinder(.37,.08,.50,edge);
  const seam=new Mesh(new TorusGeometry(.84,.012,6,64),graphite);
  seam.position.z=.421;model.add(seam);
  for(let i=0;i<6;i++){
    const angle=i*Math.PI/3;
    const screw=cylinder(.075,.018,.43,bolt,model,6);
    screw.position.x=Math.cos(angle)*.72;screw.position.y=Math.sin(angle)*.72;
    const socket=cylinder(.032,.022,.443,graphite,model,6);
    socket.position.x=screw.position.x;socket.position.y=screw.position.y;
  }
  cylinder(.20,.50,.78,edge,rotor,32);
  // A keyed shaft gives the output spindle a readable rotation.
  const key=new Mesh(new BoxGeometry(.11,.065,.36),graphite);
  key.position.set(0,.19,.80);rotor.add(key);
  cylinder(.12,.012,1.035,graphite,rotor,6);
  model.add(rotor);
  const connector=new Mesh(new BoxGeometry(.31,.19,.28),graphite);
  connector.position.set(0,.82,-.32);model.add(connector);
  model.rotation.set(-.12,-.38,-.2);scene.add(model);
  scene.add(new HemisphereLight(0xffffff,0x536070,2.3));
  const keyLight=new DirectionalLight(0xffffff,3);keyLight.position.set(-3,5,5);scene.add(keyLight);
  const rim=new DirectionalLight(0xcbdcf1,2);rim.position.set(4,0,-2);scene.add(rim);
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let current=motion.matches?0:scrollY*.004, target=current, frame=0, disposed=false;
  function paint(){
    model.rotation.y=-.38+current;rotor.rotation.z=current*2.4;
    renderer.render(scene,camera);
  }
  function tick(){
    frame=0;if(disposed||document.hidden)return;
    current+=(target-current)*.16;
    if(Math.abs(target-current)<.0002)current=target;
    paint();if(current!==target)frame=requestAnimationFrame(tick);
  }
  function scroll(){
    target=motion.matches?0:scrollY*.004;
    if(!frame&&!document.hidden)frame=requestAnimationFrame(tick);
  }
  function resize(){
    const {width,height}=host.getBoundingClientRect();
    if(!width||!height)return;
    camera.left=-1.55*width/height;camera.right=1.55*width/height;
    camera.updateProjectionMatrix();renderer.setSize(width,height,false);paint();
  }
  const observer=new ResizeObserver(resize);observer.observe(host);
  resize();host.dataset.renderer='webgl';
  addEventListener('scroll',scroll,{passive:true});
  motion.addEventListener('change',scroll);
  document.addEventListener('visibilitychange',scroll);
  function dispose(){
    if(disposed)return;disposed=true;
    cancelAnimationFrame(frame);observer.disconnect();
    removeEventListener('scroll',scroll);motion.removeEventListener('change',scroll);
    document.removeEventListener('visibilitychange',scroll);
    scene.traverse(object=>object.geometry?.dispose());
    for(const material of [silver,edge,graphite,bolt])material.dispose();
    reflection.dispose();renderer.dispose();renderer.domElement.remove();delete host.dataset.renderer;
  }
  addEventListener('pagehide',e=>{if(!e.persisted)dispose()},{once:true});
  if(import.meta.hot)import.meta.hot.dispose(dispose);
  return dispose;
}
