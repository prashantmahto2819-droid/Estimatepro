/* view3d.js — Enhanced 3D BIM renderer
   VAOs · Poisson PCF · SSAO · ACES tone-map · transparent sort */
(function(){
const B=EP.bim, ST=B.VSTRIDE;

/* ── math helpers ─────────────────────────────────── */
function M4(){return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])}
function mul(a,b){const o=new Float32Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++){let s=0;for(let k=0;k<4;k++)s+=a[r*4+k]*b[k*4+c];o[r*4+c]=s}return o}
function persp(fov,asp,n,f){const t=1/Math.tan(fov/2),d=n-f,m=new Float32Array(16);m[0]=t/asp;m[5]=t;m[10]=(f+n)/d;m[11]=-1;m[14]=2*f*n/d;return m}
function ortho(l,r,b,t,n,f){const m=new Float32Array(16);m[0]=2/(r-l);m[5]=2/(t-b);m[10]=-2/(f-n);m[12]=-(r+l)/(r-l);m[13]=-(t+b)/(t-b);m[14]=-(f+n)/(f-n);m[15]=1;return m}
function sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function nrm(a){const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l]}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function look(eye,at,up){const f=nrm(sub(at,eye)),r=nrm(cross(f,up)),u=cross(r,f),m=M4();m[0]=r[0];m[4]=r[1];m[8]=r[2];m[1]=u[0];m[5]=u[1];m[9]=u[2];m[2]=-f[0];m[6]=-f[1];m[10]=-f[2];m[12]=-dot(r,eye);m[13]=-dot(u,eye);m[14]=dot(f,eye);return m}
function inv(m){const a=m[0],b=m[1],c=m[2],d=m[3],e=m[4],f=m[5],g=m[6],h=m[7],i=m[8],j=m[9],k=m[10],l=m[11],M=m[12],n=m[13],o=m[14],p=m[15],A=a*f-b*e,BB=a*g-c*e,C=a*h-d*e,D=b*g-c*f,E=b*h-d*f,F=c*h-d*g,G=i*n-j*M,H=i*o-k*M,I=i*p-l*M,J=j*o-k*n,K=j*p-l*n,L=k*p-l*o,det=A*L-BB*K+C*J+D*I-E*H+F*G;if(!det)return M4();const iv=1/det,r=new Float32Array(16);r[0]=(f*L-g*K+h*J)*iv;r[1]=(c*K-b*L-d*J)*iv;r[2]=(n*F-o*E+p*D)*iv;r[3]=(k*E-j*F-l*D)*iv;r[4]=(g*I-e*L-h*H)*iv;r[5]=(a*L-c*I+d*H)*iv;r[6]=(o*C-M*F-p*BB)*iv;r[7]=(i*F-k*C+l*BB)*iv;r[8]=(e*K-f*I+h*G)*iv;r[9]=(b*I-a*K-d*G)*iv;r[10]=(M*E-n*C+p*A)*iv;r[11]=(j*C-i*E-l*A)*iv;r[12]=(f*H-e*J-g*G)*iv;r[13]=(a*J-b*H+c*G)*iv;r[14]=(n*BB-M*D-o*A)*iv;r[15]=(i*D-j*BB+k*A)*iv;return r}
B.inv4=inv; B.mul4=mul;

/* ── shader sources ───────────────────────────────── */

/* Main vertex shader */
const VS=`#version 300 es
precision highp float;
layout(location=0)in vec3 aP;
layout(location=1)in vec3 aN;
layout(location=2)in vec4 aC;
layout(location=3)in float aI;
layout(location=4)in vec3 aM;
uniform mat4 uVP,uL;
out vec3 vP,vN,vL;
out vec4 vC;
out float vI;
out vec3 vM;
void main(){
  vP=aP; vN=aN; vC=aC; vI=aI; vM=aM;
  vL=(uL*vec4(aP,1.0)).xyz;
  gl_Position=uVP*vec4(aP,1.0);
}`;

/* Main fragment shader — Poisson PCF, improved lighting */
const FS=`#version 300 es
precision highp float;
in vec3 vP,vN,vL;
in vec4 vC;
in float vI;
in vec3 vM;
uniform vec3 uSun,uEye,uSunCol,uSky,uGnd,uHor;
uniform float uSel,uCut,uShadow,uSMs,uStyle,uFog,uAmb,uHead;
uniform int uK;
uniform sampler2D uSM;
uniform bool uLinear;
out vec4 fragColor;

/* noise */
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*vn(p);p*=2.0;a*=0.5;}return v;}

/* bond pattern */
float jm(float x){return fract(x)-0.5;}
float bond(vec2 p,float bw,float bh,float gw){
  float row=floor(p.y/bh); p.x+=mod(row,2.0)*bw*0.5;
  vec2 b=vec2(jm(p.x/bw),jm(p.y/bh));
  float g=min(abs(b.x)-0.5+gw/bw, abs(b.y)-0.5+gw/bh);
  return smoothstep(0.0,0.008,g);
}

/* Poisson PCF shadow (16 taps) */
const vec2 poisson[16]=vec2[16](
  vec2(-0.94201624,-0.39906216),vec2(0.94558609,-0.76890725),
  vec2(-0.09418410,-0.92938870),vec2(0.34495938, 0.29387760),
  vec2(-0.91588581, 0.45771432),vec2(0.72110570,-0.01519740),
  vec2(-0.38277543, 0.27676845),vec2(0.44323325,-0.97511554),
  vec2(0.53742981,-0.47373420),vec2(-0.26496911,-0.41893023),
  vec2(0.79197514, 0.19090188),vec2(-0.24188840, 0.99706507),
  vec2(-0.81409955, 0.91437590),vec2(0.19984126, 0.78641367),
  vec2(0.14383161,-0.14100790),vec2(-0.70862610,-0.67149910)
);

float shadow(){
  if(uShadow<0.5) return 1.0;
  vec3 lp=vL*0.5+0.5;
  if(lp.z>1.0||lp.x<0.0||lp.x>1.0||lp.y<0.0||lp.y>1.0) return 1.0;
  float nl=clamp(dot(normalize(vN),uSun),0.0,1.0);
  float bias=mix(0.0016,0.0004,nl), spread=float(uK)*1.2/uSMs, s=0.0;
  for(int i=0;i<16;i++){
    vec2 off=poisson[i]*spread;
    float d=texture(uSM,lp.xy+off).r;
    s+=step(lp.z-bias,d);
  }
  return s/16.0;
}

/* sRGB to linear */
vec3 toLinear(vec3 c){return pow(c,vec3(2.2));}

void main(){
  if(vP.z>uCut) discard;
  vec3 N=normalize(vN);
  if(!gl_FrontFacing) N=-N;

  /* base color */
  vec3 col=vC.rgb;
  float alpha=vC.a;
  float pat=vM.x, sz=vM.y, gloss=vM.z;

  /* optionally linearize input color */
  if(uLinear) col=toLinear(col);

  /* procedural patterns */
  int pi=int(pat+0.5);
  vec2 uv;
  if(abs(N.z)>0.7) uv=vP.xy; else if(abs(N.x)>abs(N.y)) uv=vP.yz; else uv=vP.xz;
  uv*=1.0/max(sz,0.01);

  if(pi==1){/* brick */
    float b=bond(uv,1.0,0.42,0.04);
    col=mix(col*0.7,col,b);
  }else if(pi==2){/* block */
    float b=bond(uv,0.8,0.4,0.03);
    col=mix(col*0.75,col,b);
  }else if(pi==3){/* stone */
    float n=fbm(uv*3.0);
    col*=0.8+0.4*n;
  }else if(pi==4){/* concrete */
    float n=fbm(uv*8.0);
    col*=0.9+0.15*n;
  }else if(pi==5){/* paint */
    col*=0.97+0.06*vn(uv*20.0);
  }else if(pi==6){/* tiles */
    float b=bond(uv,1.0,1.0,0.03);
    col=mix(col*0.6,col,b);
  }else if(pi==7){/* wood */
    float g=sin(uv.x*30.0+fbm(uv*2.0)*5.0)*0.5+0.5;
    col*=0.7+0.3*g;
  }else if(pi==8){/* sheet ribs */
    float r=sin(uv.x*50.0)*0.5+0.5;
    col*=0.85+0.15*r;
  }else if(pi==9){/* roof tiles */
    float b=bond(uv,1.0,0.5,0.02);
    float w=sin(uv.y*25.0)*0.5+0.5;
    col*=0.8+0.2*w; col=mix(col*0.7,col,b);
  }else if(pi==10){/* grass */
    float n=fbm(uv*6.0);
    col*=0.7+0.5*n;
  }else if(pi==11){/* granite */
    float n1=vn(uv*40.0), n2=vn(uv*80.0);
    col*=0.8+0.2*n1; col=mix(col,col*vec3(1.05,1.0,0.95),n2);
  }else if(pi==12){/* glass */
    vec3 V=normalize(uEye-vP);
    float fresnel=pow(1.0-max(dot(V,N),0.0),3.0);
    col=mix(col,uSky,fresnel*0.5);
    alpha=mix(alpha,1.0,fresnel*0.3);
  }else if(pi==13){/* marble */
    float v=sin(uv.x*4.0+fbm(uv*3.0)*6.0)*0.5+0.5;
    col*=0.85+0.15*v;
  }else if(pi==14){/* pavers */
    float b=bond(uv,0.6,0.6,0.04);
    col=mix(col*0.65,col,b);
  }else if(pi==15){/* soil */
    col*=0.75+0.4*fbm(uv*5.0);
  }

  /* style override: 1=colors(flat), 2=white model */
  if(uStyle>1.5) col=vec3(0.92);
  if(uStyle>0.5 && uStyle<1.5) gloss=0.0;

  /* lighting */
  float diff=max(dot(N,uSun),0.0);
  float sh=shadow();
  vec3 amb=mix(uGnd,uSky,N.z*0.5+0.5)*uAmb;
  vec3 lit=amb + uSunCol*diff*sh;
  /* walk-through: a soft warm light carried by the viewer, so rooms the sun does not reach are still readable */
  if(uHead>0.01){ vec3 toE=uEye-vP; float dE=length(toE); lit+=vec3(1.0,0.95,0.86)*uHead*(0.35+0.65*max(dot(N,toE/max(dE,1e-4)),0.0))/(1.0+dE*dE*0.012); }

  /* specular */
  if(gloss>0.01 && uStyle<0.5){
    vec3 V=normalize(uEye-vP);
    vec3 H=normalize(uSun+V);
    float spec=pow(max(dot(N,H),0.0), 16.0+gloss*200.0);
    lit+=uSunCol*spec*gloss*sh;
  }

  col*=lit;

  /* selection highlight */
  if(uSel>0.5 && abs(vI-uSel)<0.5) col=mix(col,vec3(0.2,0.6,1.0),0.35);

  /* fog */
  if(uFog>0.5){
    float d=length(vP-uEye);
    float f=1.0-exp(-d*d*0.00004);
    col=mix(col,uHor,clamp(f,0.0,0.85));
  }

  fragColor=vec4(col,alpha);
}`;

/* Sky shader */
const KVS=`#version 300 es
precision highp float;
out vec2 vUV;
void main(){
  float x=float((gl_VertexID&1)<<2)-1.0;
  float y=float((gl_VertexID&2)<<1)-1.0;
  vUV=vec2(x,y); gl_Position=vec4(x,y,0.999,1);
}`;
const KFS=`#version 300 es
precision highp float;
in vec2 vUV;
uniform vec3 uZen,uHor2,uSunD;
uniform vec3 uSunCol2;
out vec4 fragColor;
void main(){
  vec3 rd=normalize(vec3(vUV,1.5));
  float h=rd.y*0.5+0.5;
  vec3 sky=mix(uHor2,uZen,smoothstep(0.0,0.55,h));
  /* atmospheric scattering near horizon */
  float horizonGlow=exp(-abs(rd.y)*6.0);
  sky+=uHor2*horizonGlow*0.25;
  /* sun glow — outer warm corona + bright disc */
  float sd=max(dot(rd,uSunD),0.0);
  sky+=uSunCol2*pow(sd,16.0)*0.15;  /* wide corona */
  sky+=uSunCol2*pow(sd,64.0)*0.5;   /* medium glow */
  sky+=uSunCol2*pow(sd,512.0)*1.8;  /* bright disc */
  /* subtle gradient at the very top for depth */
  sky=mix(sky,uZen*0.7,smoothstep(0.85,1.0,h));
  fragColor=vec4(sky,1);
}`;

/* Line/edge shader */
const LVS=`#version 300 es
precision highp float;
layout(location=0)in vec3 aP;
uniform mat4 uVP;
void main(){gl_Position=uVP*vec4(aP,1.0);}`;
const LFS=`#version 300 es
precision highp float;
uniform vec4 uLC;
out vec4 fragColor;
void main(){fragColor=uLC;}`;

/* Shadow map shader */
const SVS=`#version 300 es
precision highp float;
layout(location=0)in vec3 aP;
uniform mat4 uVP;
void main(){gl_Position=uVP*vec4(aP,1.0);}`;
const SFS=`#version 300 es
precision highp float;
out vec4 fragColor;
void main(){fragColor=vec4(gl_FragCoord.z,0,0,1);}`;

/* Pick shader */
const PVS=`#version 300 es
precision highp float;
layout(location=0)in vec3 aP;
layout(location=3)in float aI;
uniform mat4 uVP;
flat out float vI;
void main(){vI=aI; gl_Position=uVP*vec4(aP,1.0);}`;
const PFS=`#version 300 es
precision highp float;
flat in float vI;
out vec4 fragColor;
void main(){
  int id=int(vI+0.5);
  fragColor=vec4(float(id&255)/255.0, float((id>>8)&255)/255.0, float((id>>16)&255)/255.0, 1);
}`;

/* Composite shader — SSAO + tone mapping + gamma */
const CVS=`#version 300 es
precision highp float;
out vec2 vUV;
void main(){
  float x=float((gl_VertexID&1)<<2)-1.0;
  float y=float((gl_VertexID&2)<<1)-1.0;
  vUV=vec2(x*0.5+0.5,y*0.5+0.5);
  gl_Position=vec4(x,y,0,1);
}`;
const CFS=`#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uCol,uDep;
uniform vec2 uRes;
uniform float uNear,uFar;
uniform bool uDoSSAO,uDoTone,uVignette;
out vec4 fragColor;

/* Poisson disk for SSAO (16 samples) */
const vec2 ssaoK[16]=vec2[16](
  vec2(-0.94201624,-0.39906216),vec2(0.94558609,-0.76890725),
  vec2(-0.09418410,-0.92938870),vec2(0.34495938, 0.29387760),
  vec2(-0.91588581, 0.45771432),vec2(0.72110570,-0.01519740),
  vec2(-0.38277543, 0.27676845),vec2(0.44323325,-0.97511554),
  vec2(0.53742981,-0.47373420),vec2(-0.26496911,-0.41893023),
  vec2(0.79197514, 0.19090188),vec2(-0.24188840, 0.99706507),
  vec2(-0.81409955, 0.91437590),vec2(0.19984126, 0.78641367),
  vec2(0.14383161,-0.14100790),vec2(-0.70862610,-0.67149910)
);

float linDepth(float d){
  float ndc=d*2.0-1.0;
  return 2.0*uNear*uFar/(uFar+uNear-ndc*(uFar-uNear));
}

float ssao(){
  float d0=texture(uDep,vUV).r;
  if(d0>=0.999) return 1.0; /* sky */
  float ld0=linDepth(d0);
  float radius=0.8/ld0; /* screen-space radius */
  float occ=0.0;
  for(int i=0;i<16;i++){
    vec2 sc=vUV+ssaoK[i]*radius;
    float ds=texture(uDep,sc).r;
    float lds=linDepth(ds);
    float diff=ld0-lds;
    if(diff>0.02 && diff<2.0) occ+=1.0;
  }
  return 1.0-occ/16.0*0.6;
}

/* ACES filmic tone mapping */
vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
}

void main(){
  vec4 col=texture(uCol,vUV);
  float ao=uDoSSAO ? ssao() : 1.0;
  col.rgb*=ao;
  if(uDoTone){
    col.rgb=aces(col.rgb);
    col.rgb=pow(col.rgb,vec3(1.0/2.2)); /* sRGB gamma */
  }
  if(uVignette){
    vec2 vc=vUV-0.5;
    float v=1.0-dot(vc,vc)*0.5;
    col.rgb*=v;
  }
  fragColor=vec4(col.rgb,1.0);
}`;


/* ── View3D class ─────────────────────────────────── */
const P=B.View3D=function(canvas,opts){
  opts=opts||{};
  this.ok=false; this.dead=false;
  /* a host element (dialog previews) gets its own canvas */
  if(canvas && typeof canvas.getContext!=='function'){
    const host=canvas; canvas=document.createElement('canvas');
    canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none';
    host.appendChild(canvas);
  }
  this.cv=canvas;
  const gl=canvas&&canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true,alpha:false,premultipliedAlpha:false});
  if(!gl){console.warn('View3D: WebGL2 not available');this.dead=true;return;}
  this.gl=gl;

  /* compile shader programs */
  this.mp=this.prog(gl,VS,FS);   /* main */
  this.kp=this.prog(gl,KVS,KFS); /* sky */
  this.lp=this.prog(gl,LVS,LFS); /* lines */
  this.sp=this.prog(gl,SVS,SFS); /* shadow */
  this.pp=this.prog(gl,PVS,PFS); /* pick */
  this.cp=this.prog(gl,CVS,CFS); /* composite */

  /* empty VAO for fullscreen triangle draws */
  this.emptyVAO=gl.createVertexArray();

  /* shadow map */
  this.smSize=2048;
  this.setSM(this.smSize);

  /* camera */
  this.t=[0,0,1]; this.yaw=-0.8; this.pitch=0.55; this.dist=30;
  this.ortho_=false; this.fov=45*Math.PI/180;

  /* settings */
  this.cut=1e9; this.sel=-1;   /* cut = section height (m); 1e9 = no section */
  this.sunAz=135; this.sunEl=50;
  this.shadows=true; this.edges=true;
  this.bg=null; this.lose=!!opts.lose;   /* lose: free the WebGL context when the canvas leaves the page (previews) */
  this.showGround=true;
  const self0=this;
  this.cam={get ortho(){return self0.ortho_;},set ortho(v){self0.ortho_=!!v;self0.dirty=true;}};
  this.style=0; this.sky=true; this.fog=true;
  this.kern=1;
  this.ssao=false;    /* SSAO off for realtime */
  this.linear=false;  /* linear workflow (for renderImage) */

  /* post-process FBO (lazy init) */
  this.ppFBO=null; this.ppW=0; this.ppH=0;

  /* scene data */
  this.dirty=true;

  /* Force initial canvas dimensions — use parent if CSS layout not ready */
  this._forceSize();

  /* resize observer */
  this._ro=new ResizeObserver(()=>{this._forceSize();this.dirty=true;});
  this._ro.observe(canvas);
  /* also observe the host container for size changes */
  if(canvas.parentElement) this._ro.observe(canvas.parentElement);

  /* bind pointer events */
  this.bind();

  /* start render loop */
  this._raf=0;
  this.ok=true;
  this.loop();
};

/* compile + link shader, cache uniform locations */
P.prototype.prog=function(gl,vsrc,fsrc){
  function sh(type,src){
    const s=gl.createShader(type);
    gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))
      console.error('Shader compile error:',gl.getShaderInfoLog(s));
    return s;
  }
  const p=gl.createProgram();
  gl.attachShader(p,sh(gl.VERTEX_SHADER,vsrc));
  gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fsrc));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))
    console.error('Program link error:',gl.getProgramInfoLog(p));
  /* cache uniform locations */
  const u={}, n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){const info=gl.getActiveUniform(p,i); u[info.name]=gl.getUniformLocation(p,info.name);}
  p.u=u;
  return p;
};

/* create VBO */
P.prototype.vbo=function(gl,data){
  const b=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,b);
  gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  return b;
};

/* create VAO for a mesh buffer — full=all 5 attribs, else pos+id only */
P.prototype.makeVAO=function(gl,buf,full){
  const vao=gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  const stride=ST*4;
  if(full){
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);      /* pos */
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1,3,gl.FLOAT,false,stride,12);     /* normal */
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2,4,gl.FLOAT,false,stride,24);     /* color(rgba) */
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3,1,gl.FLOAT,false,stride,40);     /* id */
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4,3,gl.FLOAT,false,stride,44);     /* pattern,size,gloss */
  }else{
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);
    /* for pick shader, also need id at location 3 */
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3,1,gl.FLOAT,false,stride,40);
  }
  gl.bindVertexArray(null);
  return vao;
};

/* create line VAO — position only, stride = 3 floats */
P.prototype.makeLineVAO=function(gl,buf){
  const vao=gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
  gl.bindVertexArray(null);
  return vao;
};

/* (re)create shadow map FBO */
P.prototype.setSM=function(n){
  const gl=this.gl;
  if(this.smTex) gl.deleteTexture(this.smTex);
  if(this.smFB) gl.deleteFramebuffer(this.smFB);
  this.smSize=n;
  const tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,n,n,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.NONE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const fb=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,tex,0);
  gl.drawBuffers([gl.NONE]);  /* depth-only FBO — no color writes */
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  this.smTex=tex; this.smFB=fb;
};

/* ensure post-process FBO at given size */
P.prototype.ensurePP=function(w,h){
  const gl=this.gl;
  if(this.ppFBO && this.ppW===w && this.ppH===h) return;
  /* cleanup old */
  if(this.ppFBO){
    gl.deleteFramebuffer(this.ppFBO);
    gl.deleteTexture(this.ppColTex);
    gl.deleteTexture(this.ppDepTex);
  }
  const fb=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);

  /* color texture — try RGBA16F for HDR, fallback RGBA8 */
  const colTex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,colTex);
  const hdrExt=gl.getExtension('EXT_color_buffer_float');
  const fmt=hdrExt?gl.RGBA16F:gl.RGBA8;
  const type=hdrExt?gl.HALF_FLOAT:gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D,0,fmt,w,h,0,gl.RGBA,type,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,colTex,0);

  /* depth texture for SSAO — no compare mode so SSAO can sample raw depth */
  const depTex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,depTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depTex,0);

  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  this.ppFBO=fb; this.ppColTex=colTex; this.ppDepTex=depTex;
  this.ppW=w; this.ppH=h;
};

/* cleanup */
P.prototype.destroy=function(){
  if(this.dead) return;
  this.dead=true; this.ok=false;
  cancelAnimationFrame(this._raf);
  if(this._ro) this._ro.disconnect();
  if(this._cubeWrap && this._cubeWrap.parentElement) this._cubeWrap.parentElement.removeChild(this._cubeWrap);
  if(this.ppFBO){
    this.gl.deleteFramebuffer(this.ppFBO);
    this.gl.deleteTexture(this.ppColTex);
    this.gl.deleteTexture(this.ppDepTex);
    this.ppFBO=null;
  }
  if(this.lose){
    const ext=this.gl.getExtension('WEBGL_lose_context');
    if(ext) ext.loseContext();
  }
};

/* force canvas buffer size from CSS layout, parent, or fallback */
P.prototype._forceSize=function(){
  const cv=this.cv, dpr=Math.min(devicePixelRatio,2);
  /* try clientWidth/Height first */
  let cw=cv.clientWidth, ch=cv.clientHeight;
  /* try getBoundingClientRect */
  if(!cw||!ch){const r=cv.getBoundingClientRect();cw=r.width;ch=r.height;}
  /* try parent element */
  if((!cw||!ch)&&cv.parentElement){cw=cv.parentElement.clientWidth;ch=cv.parentElement.clientHeight;}
  if((!cw||!ch)&&cv.parentElement){const r=cv.parentElement.getBoundingClientRect();cw=r.width;ch=r.height;}
  /* fallback — use a reasonable default */
  if(!cw||!ch){cw=600;ch=400;}
  const w=cw*dpr|0, h=ch*dpr|0;
  if(w>0&&h>0&&(cv.width!==w||cv.height!==h)){cv.width=w;cv.height=h;}
  this.W=cw; this.H=ch;
  this.dirty=true;
};
/* backward compat alias */
P.prototype.resize=P.prototype._forceSize;

/* render loop */
P.prototype.loop=function(){
  if(this.dead) return;
  if(this.lose && !this.cv.isConnected){this.destroy();return;}
  this._raf=requestAnimationFrame(()=>this.loop());
  if(this.spin&&!this.walk){ const now=performance.now(); this.yaw+=((now-(this._spinT||now))/1000)*0.25; this._spinT=now; this.dirty=true; } else this._spinT=0;
  if(this.walk&&this._keys&&this._keys.size) this._walkKeys();
  if(!this.dirty) return;
  this.dirty=false;
  this.render(false);
  this._updateCube();
  if(this.onFrame) this.onFrame();
};

/* delete VAOs helper */
P.prototype._delVAOs=function(){
  const gl=this.gl;
  const names=['vaoOpF','vaoOpS','vaoTrF','vaoTrS','vaoGndF','vaoGndS','vaoLine'];
  for(const n of names){if(this[n]){gl.deleteVertexArray(this[n]);this[n]=null;}}
};

/* set scene data + build buffers + VAOs */
P.prototype.setScene=function(sc,keepCam){
  const gl=this.gl;
  this._delVAOs();

  /* split groups into opaque and transparent */
  let op=[],tr=[];
  const groups=sc.groups||[];
  for(const gRaw of groups){
    /* groups may be {id,idx,v,e} objects or raw Float32Arrays */
    const g=gRaw.v||gRaw;
    if(!g||!g.length) continue;
    let transparent=false;
    for(let i=0;i<g.length;i+=ST){
      if(g[i+9]<0.99){transparent=true;break;}
    }
    if(transparent) tr.push(g); else op.push(g);
  }

  /* merge arrays */
  function merge(arr){
    let len=0; for(const a of arr) len+=a.length;
    const out=new Float32Array(len);
    let off=0; for(const a of arr){out.set(a,off);off+=a.length;}
    return out;
  }

  const opData=merge(op), trData=merge(tr);
  this.opN=opData.length/ST|0;
  this.trN=trData.length/ST|0;

  /* store raw transparent data for back-to-front sorting */
  this.trRaw=trData.length>0?new Float32Array(trData):null;
  this.cuts=sc.cutouts||[];
  this.opRaw=opData;   /* kept for ray casting (measure, walk start) */

  /* create VBOs */
  if(this.opBuf) gl.deleteBuffer(this.opBuf);
  if(this.trBuf) gl.deleteBuffer(this.trBuf);
  this.opBuf=opData.length?this.vbo(gl,opData):null;
  /* transparent buffer needs DYNAMIC_DRAW for sorted re-upload */
  if(trData.length){
    const b=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,trData,gl.DYNAMIC_DRAW);
    this.trBuf=b;
  }else{this.trBuf=null;}

  /* create VAOs */
  if(this.opBuf){
    this.vaoOpF=this.makeVAO(gl,this.opBuf,true);
    this.vaoOpS=this.makeVAO(gl,this.opBuf,false);
  }
  if(this.trBuf){
    this.vaoTrF=this.makeVAO(gl,this.trBuf,true);
    this.vaoTrS=this.makeVAO(gl,this.trBuf,false);
  }

  /* edge lines */
  if(this.lnBuf) gl.deleteBuffer(this.lnBuf);
  this.lnBuf=null; this.lnN=0;
  let lines=sc.lines;
  if(!lines){lines=[];for(const g of groups){const ge=g&&g.e;if(ge&&ge.length)for(let i=0;i<ge.length;i++)lines.push(ge[i]);}}
  if(lines && lines.length){
    const ld=lines instanceof Float32Array?lines:new Float32Array(lines);
    this.lnN=ld.length/3|0;
    this.lnBuf=this.vbo(gl,ld);
    this.vaoLine=this.makeLineVAO(gl,this.lnBuf);
  }

  /* bounding box */
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  function ext(d,n){for(let i=0;i<n;i++){const o=i*ST;for(let j=0;j<3;j++){if(d[o+j]<mn[j])mn[j]=d[o+j];if(d[o+j]>mx[j])mx[j]=d[o+j];}}}
  if(this.opN) ext(opData,this.opN);
  if(this.trN) ext(trData,this.trN);
  if(mn[0]>mx[0]){mn=[0,0,0];mx=[10,10,3];}
  this.bbox=[mn[0],mn[1],mn[2],mx[0],mx[1],mx[2]];
  const c=[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2];
  const R=Math.hypot(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2])/2||5;
  this.bboxR=R; this.bboxC=c;

  /* index by entity id */
  const byIdx={};
  function indexBuf(d,n){for(let i=0;i<n;i++){const id=d[i*ST+10]|0;if(!byIdx[id])byIdx[id]=[];byIdx[id].push(i);}}
  if(this.opN) indexBuf(opData,this.opN);
  if(this.trN) indexBuf(trData,this.trN);
  this._vIdx=byIdx;
  this.byIdx=sc.byIdx||[];

  /* ground plane */
  if(this.gndBuf) gl.deleteBuffer(this.gndBuf);
  this.gndBuf=null; this.gndN=0;
  /* showGround is the user's switch (kept between rebuilds); a scene that draws its own terrain sets noGround */
  this.noGround=!!sc.noGround;
  if(!this.noGround){
    /* at natural ground level when the scene gives it (foundations stay below ground), else just under the model */
    const r=R*12, z=(typeof sc.ngl==='number'&&isFinite(sc.ngl)?Math.min(sc.ngl,mx[2]):mn[2])-0.01;
    const gk=sc.ground&&sc.ground.length>=3?sc.ground:null;
    const gr=gk?gk[0]:0.38, gg=gk?gk[1]:0.55, gb=gk?gk[2]:0.25, gp=gk?(gk.p||0):10, gs=gk?(gk.s||1):2.0, gq=gk?(gk.g||0):0;
    const gv=new Float32Array([
      c[0]-r,c[1]-r,z, 0,0,1, gr,gg,gb,1, 0, gp,gs,gq,
      c[0]+r,c[1]-r,z, 0,0,1, gr,gg,gb,1, 0, gp,gs,gq,
      c[0]+r,c[1]+r,z, 0,0,1, gr,gg,gb,1, 0, gp,gs,gq,
      c[0]-r,c[1]-r,z, 0,0,1, gr,gg,gb,1, 0, gp,gs,gq,
      c[0]+r,c[1]+r,z, 0,0,1, gr,gg,gb,1, 0, gp,gs,gq,
      c[0]-r,c[1]+r,z, 0,0,1, gr,gg,gb,1, 0, gp,gs,gq
    ]);
    this.gndN=6;
    this.gndBuf=this.vbo(gl,gv);
    this.vaoGndF=this.makeVAO(gl,this.gndBuf,true);
    this.vaoGndS=this.makeVAO(gl,this.gndBuf,false);
  }

  if(!keepCam) this.frame();
  this.dirty=true;
};

/* fit camera to bounding box */
P.prototype.frame=function(view){
  const c=this.bboxC, R=this.bboxR;
  if(!c) return;
  this.t=[c[0],c[1],c[2]];
  /* far enough that the whole model fits the narrower side of the view (a split pane is often taller than wide) */
  const asp=(this.W||1)/(this.H||1), hv=Math.tan(this.fov/2), half=Math.atan(Math.min(hv,hv*asp));
  this.dist=Math.max(R*2.5,R/Math.sin(half)*1.05);
  if(view==='top'){this.yaw=0;this.pitch=Math.PI/2-0.001;}
  else if(view==='front'){this.yaw=0;this.pitch=0;}
  else if(view==='back'){this.yaw=Math.PI;this.pitch=0;}
  else if(view==='left'){this.yaw=-Math.PI/2;this.pitch=0;}
  else if(view==='right'){this.yaw=Math.PI/2;this.pitch=0;}
  else{this.yaw=-0.8;this.pitch=0.55;} /* iso */
  this.dirty=true;
};

/* camera eye position */
P.prototype.eye=function(){
  if(this.walk&&this.we) return this.we.slice();
  const d=this.dist, y=this.yaw, p=this.pitch;
  const cp=Math.cos(p),sp=Math.sin(p),cy=Math.cos(y),sy=Math.sin(y);
  return[this.t[0]+d*cp*sy, this.t[1]-d*cp*cy, this.t[2]+d*sp];
};

/* compute VP matrix + eye */
P.prototype.mats=function(){
  const e=this.eye(), w=this.cv.width, h=this.cv.height;
  const asp=w/h||1;
  if(this.walk&&this.we){   /* first person: look from the eye along yaw / look-pitch */
    const d=this.walkDir(), nW=0.05, fW=Math.max(600,this.dist*100);
    return{vp:mul(look(e,[e[0]+d[0],e[1]+d[1],e[2]+d[2]],[0,0,1]),persp(this.walkFov||1.15,asp,nW,fW)),eye:e,near:nW,far:fW};
  }
  const V=look(e,this.t,[0,0,1]);
  const n=this.dist*0.01, f=this.dist*100;
  let Pr;
  if(this.ortho_){
    const s=this.dist*0.7;
    Pr=ortho(-s*asp,s*asp,-s,s,n,f);
  }else{
    Pr=persp(this.fov,asp,n,f);
  }
  return{vp:mul(V,Pr),eye:e,near:n,far:f};
};

/* compute lighting from sun position */
P.prototype.light=function(){
  const sd=this.sunDir();
  const el=this.sunEl*Math.PI/180;
  const dayFrac=Math.max(Math.sin(el),0);
  const warmth=Math.max(1-el/(Math.PI/3),0);
  const sunCol=[
    (0.95+0.05*warmth)*dayFrac*1.3,
    (0.88+0.04*warmth)*dayFrac*1.3,
    (0.78-0.12*warmth)*dayFrac*1.3
  ];
  if(dayFrac<0.01) return{sunCol:[0,0,0],sky:[0.03,0.03,0.06],gnd:[0.02,0.02,0.03],zen:[0.02,0.02,0.06],hor:[0.04,0.04,0.06]};
  const sky=[0.48*dayFrac+0.06,0.58*dayFrac+0.06,0.78*dayFrac+0.06];
  const gnd=[0.28*dayFrac+0.04,0.26*dayFrac+0.04,0.20*dayFrac+0.03];
  const zen=[0.24,0.38,0.70];
  const hor=[0.62+0.28*warmth,0.68+0.12*warmth,0.78-0.08*warmth];
  return{sunCol,sky,gnd,zen,hor};
};

/* sun direction unit vector */
P.prototype.sunDir=function(){
  const az=this.sunAz*Math.PI/180, el=this.sunEl*Math.PI/180;
  return[Math.cos(el)*Math.sin(az), Math.cos(el)*Math.cos(az), Math.sin(el)];
};

/* orthographic light VP for shadow map */
P.prototype.lightVP=function(){
  const sd=this.sunDir(), R=this.bboxR*3||30, c=this.bboxC||[0,0,0];
  const le=[c[0]+sd[0]*R*2,c[1]+sd[1]*R*2,c[2]+sd[2]*R*2];
  const V=look(le,c,[0,0,1]);
  const Pr=ortho(-R,R,-R,R,0.1,R*6);
  return mul(V,Pr);
};

/* sort transparent triangles back-to-front by centroid distance */
P.prototype.sortTransparent=function(eyePos){
  if(!this.trRaw || this.trN<3) return;
  const raw=this.trRaw, n=this.trN;
  const triCount=n/3|0;
  const dists=new Float32Array(triCount);
  const indices=new Uint32Array(triCount);
  const ex=eyePos[0],ey=eyePos[1],ez=eyePos[2];
  for(let i=0;i<triCount;i++){
    const o=i*3*ST;
    const cx=(raw[o]+raw[o+ST]+raw[o+ST*2])/3;
    const cy=(raw[o+1]+raw[o+ST+1]+raw[o+ST*2+1])/3;
    const cz=(raw[o+2]+raw[o+ST+2]+raw[o+ST*2+2])/3;
    const dx=cx-ex,dy=cy-ey,dz=cz-ez;
    dists[i]=dx*dx+dy*dy+dz*dz;
    indices[i]=i;
  }
  /* sort back-to-front (farthest first) */
  indices.sort((a,b)=>dists[b]-dists[a]);
  /* reorder raw data */
  const sorted=new Float32Array(raw.length);
  for(let i=0;i<triCount;i++){
    const src=indices[i]*3*ST;
    const dst=i*3*ST;
    for(let j=0;j<3*ST;j++) sorted[dst+j]=raw[src+j];
  }
  /* upload to existing buffer */
  const gl=this.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER,this.trBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,sorted);
};

/* ── main render pipeline ─────────────────────────── */
P.prototype.render=function(pick){
  const gl=this.gl, w=this.cv.width, h=this.cv.height;
  if(!w||!h){this._forceSize();return;}
  const m=this.mats(), {vp,eye:eyePos,near,far}=m;
  /* one-time deep diagnostic */
  if(!this._diagDone && !pick){
    this._diagDone=true;
    var D=function(m){console.log('[3D-DIAG] '+m);};
    D('canvas='+w+'x'+h);
    D('opN='+this.opN+' trN='+this.trN+' gndN='+this.gndN+' lnN='+this.lnN);
    D('vaoOpF='+!!this.vaoOpF+' vaoTrF='+!!this.vaoTrF+' vaoGndF='+!!this.vaoGndF+' vaoLine='+!!this.vaoLine);
    D('sky='+this.sky+' ortho='+this.ortho_+' shadows='+this.shadows+' ssao='+this.ssao);
    D('eye='+eyePos+' dist='+this.dist);
    D('mp valid='+gl.isProgram(this.mp)+' link='+gl.getProgramParameter(this.mp,gl.LINK_STATUS));
    D('kp valid='+gl.isProgram(this.kp)+' link='+gl.getProgramParameter(this.kp,gl.LINK_STATUS));
    D('lp valid='+gl.isProgram(this.lp)+' link='+gl.getProgramParameter(this.lp,gl.LINK_STATUS));
    D('sp valid='+gl.isProgram(this.sp)+' link='+gl.getProgramParameter(this.sp,gl.LINK_STATUS));
    /* check main program uniforms */
    var mu=this.mp.u, mnames='uVP uL uSun uEye uSunCol uSky uGnd uHor uSel uCut uShadow uSMs uStyle uFog uAmb uHead uK uSM'.split(' ');
    var mloc=[]; for(var i=0;i<mnames.length;i++) mloc.push(mnames[i]+'='+(mu[mnames[i]]!==null&&mu[mnames[i]]!==undefined?'OK':'NULL'));
    D('mp uniforms: '+mloc.join(' '));
    /* check sky program uniforms */
    var ku=this.kp.u, knames='uZen uHor2 uSunD uSunCol2'.split(' ');
    var kloc=[]; for(var i=0;i<knames.length;i++) kloc.push(knames[i]+'='+(ku[knames[i]]!==null&&ku[knames[i]]!==undefined?'OK':'NULL'));
    D('kp uniforms: '+kloc.join(' '));
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.smFB);
    D('smFB complete='+gl.checkFramebufferStatus(gl.FRAMEBUFFER)+' (36053=OK)');
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    D('defaultFB complete='+gl.checkFramebufferStatus(gl.FRAMEBUFFER));
    D('alpha='+gl.getContextAttributes().alpha+' premultiplied='+gl.getContextAttributes().premultipliedAlpha);
    D('GL err before render='+gl.getError());
  }
  const sd=this.sunDir(), lt=this.light(), lvp=this.lightVP();

  /* sort transparent triangles */
  if(this.trN>0) this.sortTransparent(eyePos);

  /* pick mode — render to pick FBO and return */
  if(pick){
    gl.viewport(0,0,w,h);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.pp);
    gl.uniformMatrix4fv(this.pp.u.uVP,false,vp);
    if(this.vaoOpS){
      gl.bindVertexArray(this.vaoOpS);
      gl.drawArrays(gl.TRIANGLES,0,this.opN);
    }
    if(this.vaoTrS){
      gl.bindVertexArray(this.vaoTrS);
      gl.drawArrays(gl.TRIANGLES,0,this.trN);
    }
    gl.bindVertexArray(null);
    return;
  }

  const usePost=this.ssao;

  /* 1. Shadow map pass */
  if(this.shadows && lt.sunCol[0]>0){
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.smFB);
    gl.viewport(0,0,this.smSize,this.smSize);
    gl.colorMask(false,false,false,false);   /* depth-only — suppress colour writes */
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.useProgram(this.sp);
    gl.uniformMatrix4fv(this.sp.u.uVP,false,lvp);
    if(this.vaoOpS){
      gl.bindVertexArray(this.vaoOpS);
      gl.drawArrays(gl.TRIANGLES,0,this.opN);
    }
    if(this.showGround && !this.noGround && this.vaoGndS){
      gl.bindVertexArray(this.vaoGndS);
      gl.drawArrays(gl.TRIANGLES,0,this.gndN);
    }
    gl.bindVertexArray(null);
    gl.colorMask(true,true,true,true);       /* restore colour writes */
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }

  /* 2. Bind render target — scene FBO or screen */
  if(usePost){
    this.ensurePP(w,h);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.ppFBO);
  }
  gl.viewport(0,0,w,h);

  /* ensure clean GL state before main rendering */
  gl.colorMask(true,true,true,true);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.depthFunc(gl.LESS);

  /* clear */
  const bgc=this.bg||lt.hor||[0.75,0.78,0.82];
  gl.clearColor(bgc[0],bgc[1],bgc[2],1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  /* 3. Sky pass */
  if(!this.ortho_ && this.sky){
    gl.depthMask(false);
    gl.useProgram(this.kp);
    const u=this.kp.u;
    gl.uniform3fv(u.uZen,lt.zen||[0.22,0.35,0.65]);
    gl.uniform3fv(u.uHor2,lt.hor||[0.75,0.78,0.82]);
    gl.uniform3fv(u.uSunD,sd);
    gl.uniform3fv(u.uSunCol2,lt.sunCol);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.depthMask(true);
    if(!this._skyErr){this._skyErr=true;var e=gl.getError();if(e)console.error('[3D-DIAG] sky GL err='+e);}
  }

  /* 4. Main pass — set uniforms */
  gl.useProgram(this.mp);
  const u=this.mp.u;
  gl.uniformMatrix4fv(u.uVP,false,vp);
  gl.uniformMatrix4fv(u.uL,false,lvp);
  gl.uniform3fv(u.uSun,sd);
  gl.uniform3fv(u.uEye,eyePos);
  gl.uniform3fv(u.uSunCol,lt.sunCol);
  gl.uniform3fv(u.uSky,lt.sky||[0.5,0.6,0.8]);
  gl.uniform3fv(u.uGnd,lt.gnd||[0.25,0.22,0.18]);
  gl.uniform3fv(u.uHor,lt.hor||[0.75,0.78,0.82]);
  gl.uniform1f(u.uSel,this.sel);
  gl.uniform1f(u.uCut,this.cut);
  gl.uniform1f(u.uShadow,this.shadows?1:0);
  gl.uniform1f(u.uSMs,this.smSize);
  gl.uniform1f(u.uStyle,this.style);
  gl.uniform1f(u.uFog,this.fog?1:0);
  gl.uniform1f(u.uAmb,this.walk?0.70:0.50); gl.uniform1f(u.uHead,this.walk?0.9:0.0);   /* brighter fill light indoors while walking */
  gl.uniform1i(u.uK,this.kern);
  if(u.uLinear) gl.uniform1i(u.uLinear,this.linear?1:0);

  /* bind shadow map */
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,this.smTex);
  gl.uniform1i(u.uSM,0);

  /* 5. Ground plane */
  if(this.showGround && !this.noGround && this.vaoGndF){
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1,1);
    gl.bindVertexArray(this.vaoGndF);
    gl.drawArrays(gl.TRIANGLES,0,this.gndN);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }

  /* 6. Opaque geometry */
  if(this.vaoOpF){
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1,1);
    gl.bindVertexArray(this.vaoOpF);
    gl.drawArrays(gl.TRIANGLES,0,this.opN);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    if(!this._opErr){this._opErr=true;var e=gl.getError();if(e)console.error('[3D-DIAG] opaque GL err='+e+' opN='+this.opN);}
  }

  /* 7. Edges */
  if(this.edges && this.lnN>0 && this.vaoLine){
    gl.useProgram(this.lp);
    gl.uniformMatrix4fv(this.lp.u.uVP,false,vp);
    gl.uniform4f(this.lp.u.uLC,0.15,0.15,0.15,0.35);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vaoLine);
    gl.drawArrays(gl.LINES,0,this.lnN);
    gl.disable(gl.BLEND);
  }

  /* 7b. Picture cut-outs (people, trees…): upright cards that turn to face the camera */
  if(this.cuts&&this.cuts.length) this._drawCuts(vp,eyePos);

  /* 8. Transparent geometry (sorted back-to-front) */
  if(this.trN>0 && this.vaoTrF){
    gl.useProgram(this.mp);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.bindVertexArray(this.vaoTrF);
    gl.drawArrays(gl.TRIANGLES,0,this.trN);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  gl.bindVertexArray(null);

  /* 9. Post-process composite (SSAO + tone mapping) */
  if(usePost){
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,w,h);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.cp);
    const cu=this.cp.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,this.ppColTex);
    gl.uniform1i(cu.uCol,0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,this.ppDepTex);
    gl.uniform1i(cu.uDep,1);
    gl.uniform2f(cu.uRes,w,h);
    gl.uniform1f(cu.uNear,near);
    gl.uniform1f(cu.uFar,far);
    gl.uniform1i(cu.uDoSSAO,1);
    gl.uniform1i(cu.uDoTone,this.linear?1:0);
    gl.uniform1i(cu.uVignette,0);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.DEPTH_TEST);
  }
};

/* ---------- ViewCube overlay (CSS 3D cube + compass ring) ---------- */
P.prototype._initCube=function(){
  if(this._cube) return;
  const wrap=document.createElement('div');
  wrap.className='vcube-wrap';
  wrap.style.cssText='position:absolute;bottom:8px;right:8px;width:140px;height:140px;pointer-events:auto;z-index:3;';
  /* compass ring (N/E/S/W) */
  const ring=document.createElement('div');
  ring.className='vcube-ring';
  ring.style.cssText='position:absolute;top:0;left:0;width:140px;height:140px;';
  /* 3D scene for cube */
  const scene=document.createElement('div');
  scene.className='vcube-scene';
  scene.style.cssText='position:absolute;top:30px;left:30px;width:80px;height:80px;perspective:300px;transform:scale(0.72);';   /* the whole cube stays inside the compass ring */
  const cube=document.createElement('div');
  cube.className='vcube-cube';
  cube.style.cssText='width:80px;height:80px;position:relative;transform-style:preserve-3d;transition:transform 0.4s ease;';
  const faces=[['TOP','rotateX(90deg)','#3a4558'],['BOTTOM','rotateX(-90deg)','#2c3344'],['FRONT','rotateZ(0)','#344050'],['BACK','rotateY(180deg)','#344050'],['RIGHT','rotateY(90deg)','#344050'],['LEFT','rotateY(-90deg)','#344050']];
  const self=this;
  faces.forEach(function(f){
    const d=document.createElement('div');
    d.textContent=f[0];
    d.dataset.vcFace=f[0].toLowerCase();
    d.style.cssText='position:absolute;width:80px;height:80px;display:flex;align-items:center;justify-content:center;font:bold 10px sans-serif;color:rgba(180,195,220,0.9);background:'+f[2]+';border:1px solid rgba(100,120,150,0.5);cursor:pointer;backface-visibility:hidden;user-select:none;transform:'+f[1]+' translateZ(40px);';
    d.addEventListener('click',function(ev){
      ev.stopPropagation();
      var vmap={top:'top',bottom:null,front:'front',back:'back',right:'right',left:'left'};
      var v=vmap[f[0].toLowerCase()];
      if(v) self.frame(v);
    });
    d.addEventListener('mouseenter',function(){ d.style.background='#4a6090'; });
    d.addEventListener('mouseleave',function(){ d.style.background=f[2]; });
    cube.appendChild(d);
  });
  scene.appendChild(cube);
  /* compass labels */
  const dirs=[['N',70,7,'#e54','bold'],['S',70,133,'#8899aa','normal'],['E',133,70,'#8899aa','normal'],['W',7,70,'#8899aa','normal']];
  dirs.forEach(function(d){
    const lb=document.createElement('span');
    lb.textContent=d[0]; lb.dataset.vcDir=d[0];
    lb.style.cssText='position:absolute;left:'+d[1]+'px;top:'+d[2]+'px;transform:translate(-50%,-50%);font:'+d[4]+' 12px sans-serif;color:'+d[3]+';cursor:pointer;user-select:none;';
    lb.addEventListener('click',function(ev){
      ev.stopPropagation();
      var vm={N:'back',S:'front',E:'right',W:'left'};
      self.frame(vm[d[0]]);
    });
    ring.appendChild(lb);
  });
  /* ring circle */
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','140'); svg.setAttribute('height','140');
  svg.style.cssText='position:absolute;top:0;left:0;pointer-events:none;';
  svg.innerHTML='<circle cx="70" cy="70" r="63" fill="rgba(20,28,40,0.28)" stroke="rgba(160,175,200,0.55)" stroke-width="1.5"/>';
  ring.appendChild(svg);
  wrap.appendChild(ring);
  wrap.appendChild(scene);
  this._cube=cube; this._cubeWrap=wrap; this._ring=ring;
  /* insert into the canvas parent */
  const par=this.cv.parentElement;
  if(par){ par.style.position='relative'; par.appendChild(wrap); }
};
P.prototype._updateCube=function(){
  if(this.lose) return;   /* small dialog previews have no view cube */
  if(!this._cube) this._initCube();
  if(!this._cube) return;
  /* map yaw/pitch to CSS rotateX/rotateY for cube orientation */
  const yDeg=(-this.yaw*180/Math.PI);
  const pDeg=(this.pitch*180/Math.PI);
  this._cube.style.transform='rotateX('+(-pDeg)+'deg) rotateY('+yDeg+'deg)';
  if(this._ring){const rd=-yDeg;this._ring.style.transform='rotate('+rd+'deg)';const lb=this._ring.querySelectorAll('span');for(let i=0;i<lb.length;i++)lb[i].style.transform='translate(-50%,-50%) rotate('+(-rd)+'deg)';}
};

/* pick entity at screen coordinates */
P.prototype.pickAt=function(x,y){
  const gl=this.gl;
  const dpr=Math.min(devicePixelRatio,2);
  const px=x*dpr|0, py=(this.cv.clientHeight-y)*dpr|0;

  /* create/resize pick FBO */
  const cw=this.cv.width,ch=this.cv.height;
  if(!this.pickFB||this.pickW!==cw||this.pickH!==ch){
    if(this.pickFB){gl.deleteFramebuffer(this.pickFB);gl.deleteTexture(this.pickCT);gl.deleteTexture(this.pickDT);}
    const ct=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,ct);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,cw,ch,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    const dt=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,dt);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,cw,ch,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    const fb=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,ct,0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,dt,0);
    this.pickFB=fb; this.pickCT=ct; this.pickDT=dt;
    this.pickW=cw; this.pickH=ch;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER,this.pickFB);
  this.render(true);
  const pix=new Uint8Array(4);
  gl.readPixels(px,py,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pix);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const id=pix[0]|(pix[1]<<8)|(pix[2]<<16);
  return id>0?id:-1;
};

/* export as PNG data URL */
P.prototype.png=function(){
  this.render(false);
  return this.cv.toDataURL('image/png');
};

/* high-quality still render */
P.prototype.renderImage=function(w,h,o){
  o=o||{};
  const gl=this.gl;
  const maxT=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE)||4096,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||4096);
  if(w>maxT||h>maxT) throw new Error('This size is larger than the graphics card allows ('+maxT+' px)');
  let ss=o.ss||2;
  ss=Math.max(1,Math.min(ss,Math.floor(maxT/w),Math.floor(maxT/h),Math.floor(Math.sqrt(20e6/(w*h)))||1));
  const iw=w*ss, ih=h*ss;

  /* save state */
  const origSM=this.smSize, origKern=this.kern;
  const origSSAO=this.ssao, origLinear=this.linear;
  const origEdges=this.edges;

  /* high-quality settings */
  this.setSM(4096);
  this.kern=o.soft===false?1:3;   /* soft shadows: wider filter */
  this.ssao=true;
  this.linear=true;
  if(o.edges!==undefined) this.edges=o.edges;

  /* render at supersample resolution */
  const origW=this.cv.width, origH=this.cv.height;
  this.cv.width=iw; this.cv.height=ih;

  this.ensurePP(iw,ih);
  this.render(false);

  /* read pixels */
  const pixels=new Uint8Array(iw*ih*4);
  gl.readPixels(0,0,iw,ih,gl.RGBA,gl.UNSIGNED_BYTE,pixels);

  /* downsample to output size */
  const oc=document.createElement('canvas');
  oc.width=iw; oc.height=ih;
  const ctx=oc.getContext('2d');
  const id=ctx.createImageData(iw,ih);
  /* flip Y */
  for(let y=0;y<ih;y++){
    const src=(ih-1-y)*iw*4, dst=y*iw*4;
    for(let x=0;x<iw*4;x++) id.data[dst+x]=pixels[src+x];
  }
  ctx.putImageData(id,0,0);

  const fc=document.createElement('canvas');
  fc.width=w; fc.height=h;
  const fctx=fc.getContext('2d');
  fctx.drawImage(oc,0,0,w,h);

  /* restore */
  this.cv.width=origW; this.cv.height=origH;
  this.setSM(origSM);
  this.kern=origKern;
  this.ssao=origSSAO;
  this.linear=origLinear;
  this.edges=origEdges;
  this.dirty=true;

  return {url:fc.toDataURL('image/png'), w:w, h:h, ss:ss, canvas:fc};
};

/* save/restore view state */
P.prototype.getView=function(){
  return{t:this.t.slice(),yaw:this.yaw,pitch:this.pitch,dist:this.dist,
    ortho:this.ortho_,fov:this.fov,style:this.style,edges:this.edges,
    shadows:this.shadows,sky:this.sky,fog:this.fog,ssao:this.ssao};
};
P.prototype.setView=function(v){
  if(v.t) this.t=v.t.slice();
  if(v.yaw!=null) this.yaw=v.yaw;
  if(v.pitch!=null) this.pitch=v.pitch;
  if(v.dist!=null) this.dist=v.dist;
  if(v.ortho!=null) this.ortho_=v.ortho;
  if(v.fov!=null) this.fov=v.fov;
  if(v.style!=null) this.style=v.style;
  if(v.edges!=null) this.edges=v.edges;
  if(v.shadows!=null) this.shadows=v.shadows;
  if(v.sky!=null) this.sky=v.sky;
  if(v.fog!=null) this.fog=v.fog;
  if(v.ssao!=null) this.ssao=v.ssao;
  this.dirty=true;
};

/* pointer event bindings (orbit, pan, zoom, pick) */
P.prototype.bind=function(){
  const cv=this.cv, self=this;
  let down=false, btn=0, lx=0, ly=0;
  let pinch0=0, touches=[], x0=0, y0=0, multi=false, mid0=null;

  cv.addEventListener('pointerdown',function(e){
    cv.setPointerCapture(e.pointerId);
    down=true; btn=e.button; lx=e.clientX; ly=e.clientY; x0=lx; y0=ly; multi=false;
    if(e.pointerType==='touch'){
      touches.push({id:e.pointerId,x:e.clientX,y:e.clientY});
      if(touches.length===2){
        const dx=touches[1].x-touches[0].x, dy=touches[1].y-touches[0].y;
        pinch0=Math.hypot(dx,dy); multi=true;
        mid0=[(touches[0].x+touches[1].x)/2,(touches[0].y+touches[1].y)/2];
      }
    }
  });

  cv.addEventListener('pointermove',function(e){
    if(!down) return;
    if(e.pointerType==='touch'){
      const ti=touches.findIndex(t=>t.id===e.pointerId);
      if(ti>=0){touches[ti].x=e.clientX;touches[ti].y=e.clientY;}
      if(touches.length===2){
        const dx=touches[1].x-touches[0].x, dy=touches[1].y-touches[0].y;
        const d=Math.hypot(dx,dy);
        if(pinch0>0 && d>0){
          self.dist=Math.max(0.1,self.dist*pinch0/d);
        }
        pinch0=d;
        /* two fingers moving together = pan */
        const mx2=(touches[0].x+touches[1].x)/2, my2=(touches[0].y+touches[1].y)/2;
        if(mid0) self.pan(mx2-mid0[0],my2-mid0[1]);
        mid0=[mx2,my2];
        self.dirty=true;
        return;
      }
    }
    const dx=e.clientX-lx, dy=e.clientY-ly;
    lx=e.clientX; ly=e.clientY;
    if(self.walk){
      if(btn===0 && !e.shiftKey){ self.yaw+=dx*0.004; self.wpitch=Math.max(-1.4,Math.min(1.4,(self.wpitch||0)-dy*0.004)); }
      else self.walkMove(dy*0.02,-dx*0.02,0);
      self.dirty=true; return;
    }
    if(btn===0 && !e.shiftKey){
      /* orbit */
      self.yaw-=dx*0.005;
      self.pitch+=dy*0.005;
      self.pitch=Math.max(-Math.PI/2+0.01,Math.min(Math.PI/2-0.01,self.pitch));
    }else{
      /* pan */
      self.pan(dx,dy);
    }
    self.dirty=true;
  });

  cv.addEventListener('pointerup',function(e){
    if(e.pointerType==='touch'){
      touches=touches.filter(t=>t.id!==e.pointerId);
      down=touches.length>0;
      if(touches.length===1){lx=touches[0].x;ly=touches[0].y;}   /* the remaining finger carries on orbiting from where it is */
      pinch0=0; mid0=null;
      if(down) return;
    }else down=false;
    /* tap = pick (measured from where the pointer went down, so an orbit / pan / pinch never picks) */
    const dx=Math.abs(e.clientX-x0), dy=Math.abs(e.clientY-y0);
    if(dx<4&&dy<4&&btn===0&&!multi){
      const r=cv.getBoundingClientRect();
      if(self.measure){ const hp=self.hitPoint(e.clientX-r.left,e.clientY-r.top); if(hp&&self.onMeasure) self.onMeasure(hp); return; }
      const id=self.pickAt(e.clientX-r.left,e.clientY-r.top);
      self.sel=id;
      self.dirty=true;
      /* the app works with element ids; byIdx[n-1] is the element drawn with index n */
      if(self.onPick) self.onPick(id>0&&self.byIdx?(self.byIdx[id-1]||null):null);
    }
  });
  cv.addEventListener('pointercancel',function(e){
    touches=touches.filter(t=>t.id!==e.pointerId);
    down=touches.length>0; pinch0=0; mid0=null; multi=true;
  });

  cv.tabIndex=0; self._keys=new Set();
  cv.addEventListener('pointerdown',function(){ if(self.walk) cv.focus({preventScroll:true}); });
  cv.addEventListener('keydown',function(e){ if(!self.walk) return; const k=e.key.toLowerCase(); if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].indexOf(k)>=0){ self._keys.add(k); e.preventDefault(); e.stopPropagation(); } });
  cv.addEventListener('keyup',function(e){ self._keys.delete(e.key.toLowerCase()); });
  cv.addEventListener('blur',function(){ self._keys.clear(); });

  cv.addEventListener('wheel',function(e){
    e.preventDefault();
    /* wheel in lines (Firefox) or pixels; exponential so a fast spin can never flip or zero the distance */
    const dy=e.deltaMode===1?e.deltaY*33:e.deltaMode===2?e.deltaY*400:e.deltaY;
    if(self.walk){ self.walkMove(-Math.max(-600,Math.min(600,dy))*0.004,0,0); return; }
    self.dist*=Math.exp(Math.max(-600,Math.min(600,dy))*0.001);
    self.dist=Math.max(0.1,self.dist);
    self.dirty=true;
  },{passive:false});
};

/* ---------- picture cut-outs ---------- */
const CUT_VS=`#version 300 es
in vec3 aP; in vec2 aUV; uniform mat4 uVP; out vec2 vUV;
void main(){ vUV=aUV; gl_Position=uVP*vec4(aP,1.0); }`;
const CUT_FS=`#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uT; uniform float uLit,uLin; out vec4 o;
void main(){ vec4 c=texture(uT,vUV); if(c.a<0.5) discard; vec3 k=c.rgb*uLit; if(uLin>0.5) k=pow(k,vec3(2.2)); o=vec4(k,1.0); }`;
P.prototype._cutTex=function(src){
  const gl=this.gl; this._ctex=this._ctex||{}; let t=this._ctex[src]; if(t) return t;
  t=this._ctex[src]={tex:null,ready:false}; const img=new Image(), self=this;
  img.onload=function(){ if(self.dead) return; try{
    /* draw through a canvas so SVG pictures get a real pixel size */
    const mx=1024, k=Math.min(1,mx/Math.max(img.naturalWidth||512,img.naturalHeight||512)), cw=Math.max(2,Math.round((img.naturalWidth||512)*k)), ch=Math.max(2,Math.round((img.naturalHeight||512)*k));
    const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch; cv.getContext('2d').drawImage(img,0,0,cw,ch);
    const tx=gl.createTexture(); gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,tx); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0); t.tex=tx; t.ready=true; t.asp=cw/ch; self.dirty=true; }catch(e){ t.err=String(e); } };
  img.onerror=function(){ t.err='load'; };
  img.src=src; return t;
};
P.prototype._drawCuts=function(vp,eye){
  const gl=this.gl;
  if(!this.bp){ this.bp=this.prog(gl,CUT_VS,CUT_FS); if(!this.bp) return; this.bU={vp:gl.getUniformLocation(this.bp,'uVP'),t:gl.getUniformLocation(this.bp,'uT'),lit:gl.getUniformLocation(this.bp,'uLit'),lin:gl.getUniformLocation(this.bp,'uLin')};
    this.bVAO=gl.createVertexArray(); this.bBuf=gl.createBuffer(); gl.bindVertexArray(this.bVAO); gl.bindBuffer(gl.ARRAY_BUFFER,this.bBuf);
    const a=gl.getAttribLocation(this.bp,'aP'), b=gl.getAttribLocation(this.bp,'aUV'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,3,gl.FLOAT,false,20,0); gl.enableVertexAttribArray(b); gl.vertexAttribPointer(b,2,gl.FLOAT,false,20,12); gl.bindVertexArray(null); }
  const sun=this.sunDir?this.sunDir():[0,0,1], lit=0.62+0.38*Math.max(0,Math.min(1,sun[2]*1.6));
  gl.useProgram(this.bp); gl.uniformMatrix4fv(this.bU.vp,false,vp); gl.uniform1i(this.bU.t,7); gl.uniform1f(this.bU.lit,lit); gl.uniform1f(this.bU.lin,this.linear?1:0);
  gl.bindVertexArray(this.bVAO); gl.bindBuffer(gl.ARRAY_BUFFER,this.bBuf); gl.activeTexture(gl.TEXTURE7); gl.disable(gl.CULL_FACE);
  for(const c of this.cuts){
    const t=this._cutTex(c.src); if(!t.ready) continue; if(this.cut<1e8&&c.p[2]>this.cut) continue;
    let dx=eye[0]-c.p[0], dy=eye[1]-c.p[1]; const dl=Math.hypot(dx,dy)||1; dx/=dl; dy/=dl;
    const h=c.h, w=c.w||h*t.asp, rx=-dy*w/2, ry=dx*w/2, x=c.p[0], y=c.p[1], z=c.p[2], u0=c.flip?1:0, u1=c.flip?0:1;
    const v=new Float32Array([x-rx,y-ry,z,u0,0, x+rx,y+ry,z,u1,0, x+rx,y+ry,z+h,u1,1, x-rx,y-ry,z,u0,0, x+rx,y+ry,z+h,u1,1, x-rx,y-ry,z+h,u0,1]);
    gl.bufferData(gl.ARRAY_BUFFER,v,gl.DYNAMIC_DRAW); gl.bindTexture(gl.TEXTURE_2D,t.tex); gl.drawArrays(gl.TRIANGLES,0,6);
  }
  gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
};

/* ---------- walk-through (first person) ---------- */
P.prototype.walkDir=function(){ const y=this.yaw, p=this.wpitch||0, cp=Math.cos(p); return[-Math.sin(y)*cp, Math.cos(y)*cp, Math.sin(p)]; };
/* on: enter at eye height above floorZ (metres), at pos [x,y] or where the orbit camera looks; off: back to the orbit view */
P.prototype.setWalk=function(on,floorZ,pos){
  if(on){
    if(!this.walk) this._orbit={t:this.t.slice(),yaw:this.yaw,pitch:this.pitch,dist:this.dist,ortho:this.ortho_};
    const e0=P.prototype.eye.call(Object.assign(Object.create(this),{walk:false}));
    const z=(floorZ||0)+1.6, far=Math.min(this.dist,8);
    /* stand a few metres in front of what the orbit camera was looking at, facing it */
    const dx=this.t[0]-e0[0], dy=this.t[1]-e0[1], L=Math.hypot(dx,dy)||1;
    this.we=pos?[pos[0],pos[1],z]:[this.t[0]-dx/L*far, this.t[1]-dy/L*far, z];
    this.wpitch=0; this.ortho_=false; this.walk=true;
  }else if(this.walk){
    this.walk=false; const o=this._orbit; if(o){ this.t=o.t; this.yaw=o.yaw; this.pitch=o.pitch; this.dist=o.dist; this.ortho_=o.ortho; }
  }
  this.dirty=true;
};
/* move: forward, right, up in metres (forward follows the ground, not the look pitch) */
P.prototype.walkMove=function(f,r,u){
  if(!this.walk||!this.we) return; const y=this.yaw, fx=-Math.sin(y), fy=Math.cos(y);
  this.we[0]+=fx*f+fy*r; this.we[1]+=fy*f-fx*r; this.we[2]+=u; this.dirty=true;
};
P.prototype._walkKeys=function(){
  const now=performance.now(), dt=Math.min(0.1,(now-(this._wkT||now))/1000)||0.016; this._wkT=now; const k=this._keys, v=2.2*dt;
  let f=0,r=0,u=0; if(k.has('w')||k.has('arrowup')) f+=v; if(k.has('s')||k.has('arrowdown')) f-=v; if(k.has('d')) r+=v; if(k.has('a')) r-=v; if(k.has('e')) u+=v; if(k.has('q')) u-=v;
  if(k.has('arrowleft')){ this.yaw+=1.4*dt; this.dirty=true; } if(k.has('arrowright')){ this.yaw-=1.4*dt; this.dirty=true; }
  if(f||r||u) this.walkMove(f,r,u);
};

/* ---------- ray casting: the model point under a screen position (CSS px) ---------- */
function xfRow(p,m){ const o=[0,0,0,0]; for(let c=0;c<4;c++) o[c]=p[0]*m[c]+p[1]*m[4+c]+p[2]*m[8+c]+p[3]*m[12+c]; return o; }
P.prototype.project=function(p){   /* model point (m) → CSS px, or null when behind the camera */
  const c=xfRow([p[0],p[1],p[2],1],this.mats().vp); if(c[3]<=1e-6) return null;
  return[(c[0]/c[3]*0.5+0.5)*this.cv.clientWidth,(0.5-c[1]/c[3]*0.5)*this.cv.clientHeight];
};
P.prototype.hitPoint=function(x,y,noSnap){
  const m=this.mats(), iv=inv(m.vp); if(!iv) return null;
  const nx=x/this.cv.clientWidth*2-1, ny=1-y/this.cv.clientHeight*2;
  const a=xfRow([nx,ny,-1,1],iv), b=xfRow([nx,ny,1,1],iv);
  const o=[a[0]/a[3],a[1]/a[3],a[2]/a[3]], e=[b[0]/b[3],b[1]/b[3],b[2]/b[3]];
  let d=[e[0]-o[0],e[1]-o[1],e[2]-o[2]]; const dl=Math.hypot(d[0],d[1],d[2])||1; d=[d[0]/dl,d[1]/dl,d[2]/dl];
  let best=Infinity, tri=null; const self=this;
  [this.opRaw,this.trRaw].forEach(function(V){ if(!V) return;
    for(let i=0;i+3*ST<=V.length;i+=3*ST){
      if(self.cut<1e8 && V[i+2]>self.cut && V[i+ST+2]>self.cut && V[i+2*ST+2]>self.cut) continue;
      const ax=V[i],ay=V[i+1],az=V[i+2], e1x=V[i+ST]-ax,e1y=V[i+ST+1]-ay,e1z=V[i+ST+2]-az, e2x=V[i+2*ST]-ax,e2y=V[i+2*ST+1]-ay,e2z=V[i+2*ST+2]-az;
      const px=d[1]*e2z-d[2]*e2y, py=d[2]*e2x-d[0]*e2z, pz=d[0]*e2y-d[1]*e2x, det=e1x*px+e1y*py+e1z*pz; if(det>-1e-12&&det<1e-12) continue;
      const id=1/det, tx=o[0]-ax,ty=o[1]-ay,tz=o[2]-az, u=(tx*px+ty*py+tz*pz)*id; if(u<0||u>1) continue;
      const qx=ty*e1z-tz*e1y, qy=tz*e1x-tx*e1z, qz=tx*e1y-ty*e1x, v=(d[0]*qx+d[1]*qy+d[2]*qz)*id; if(v<0||u+v>1) continue;
      const t=(e2x*qx+e2y*qy+e2z*qz)*id; if(t>1e-6&&t<best&&!(self.cut<1e8&&o[2]+d[2]*t>self.cut)){ best=t; tri=[[ax,ay,az],[V[i+ST],V[i+ST+1],V[i+ST+2]],[V[i+2*ST],V[i+2*ST+1],V[i+2*ST+2]]]; }
    }
  });
  if(!tri) return null;
  let p=[o[0]+d[0]*best,o[1]+d[1]*best,o[2]+d[2]*best], snapped=false;
  if(!noSnap){ let bd=14; for(const c of tri){ const s=this.project(c); if(!s) continue; const dd=Math.hypot(s[0]-x,s[1]-y); if(dd<bd){ bd=dd; p=c; snapped=true; } } }
  return{p:p,snap:snapped};
};

/* pan camera target in screen-aligned directions */
P.prototype.pan=function(dx,dy){
  if(this.walk) return;
  const e=this.eye(), fwd=nrm(sub(this.t,e));
  const right=nrm(cross(fwd,[0,0,1]));
  const up=cross(right,fwd);
  const s=this.dist*0.002;
  this.t[0]+=-dx*s*right[0]+dy*s*up[0];
  this.t[1]+=-dx*s*right[1]+dy*s*up[1];
  this.t[2]+=-dx*s*right[2]+dy*s*up[2];
};

})();
