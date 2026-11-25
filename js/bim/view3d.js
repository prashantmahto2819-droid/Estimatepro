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
uniform vec3 uOff;
uniform vec4 uFlip;   /* a moving vehicle: on, its centre on plan, the angle it has turned */
uniform vec4 uWh;   /* a driving vehicle: wheel angle, its direction on plan, on */
out vec3 vP,vN,vL;
out vec4 vC;
out float vI;
out vec3 vM;
void main(){
  vec3 p=aP, nn=aN;
  if(uWh.w>0.5 && aM.x>17.5 && aM.x<18.5){ float c=cos(uWh.x), s=sin(uWh.x); vec2 q=aM.yz, r=vec2(q.x*c-q.y*s,q.x*s+q.y*c); p.xy+=uWh.yz*(r.x-q.x); p.z+=r.y-q.y; float nd=dot(nn.xy,uWh.yz); vec2 nr=vec2(nd*c-nn.z*s,nd*s+nn.z*c); nn.xy+=uWh.yz*(nr.x-nd); nn.z=nr.y; }   /* wheels turn about their axle */
  if(uFlip.x>0.5){ float fc=cos(uFlip.w), fs=sin(uFlip.w); vec2 fq=p.xy-uFlip.yz; p.xy=uFlip.yz+vec2(fq.x*fc-fq.y*fs,fq.x*fs+fq.y*fc); nn.xy=vec2(nn.x*fc-nn.y*fs,nn.x*fs+nn.y*fc); }   /* a vehicle on its way back: turned half round about its own centre */
  p+=uOff;
  vP=p; vN=nn; vC=aC; vI=aI; vM=aM;
  vL=(uL*vec4(p,1.0)).xyz;
  gl_Position=uVP*vec4(p,1.0);
}`;

/* Main fragment shader — Poisson PCF, improved lighting */
const FS=`#version 300 es
precision highp float;
in vec3 vP,vN,vL;
in vec4 vC;
in float vI;
in vec3 vM;
uniform vec3 uSun,uEye,uSunCol,uSky,uGnd,uHor;
uniform float uSel,uCut,uShadow,uSMs,uStyle,uFog,uAmb,uHead,uXr,uSecFill,uTm;
uniform vec3 uSecCol;
uniform vec4 uBox;
uniform vec4 uPL[32];   /* light fittings: xyz + strength */
uniform vec3 uPLc[32];  /* colour of each fitting's light */
uniform int uPLn;
uniform float uPLk;
uniform int uK;
uniform sampler2D uSM;
uniform vec3 uTxR[8];   /* turn (radians) and shift (in picture widths) of each picture */
uniform sampler2D uTx0,uTx1,uTx2,uTx3,uTx4,uTx5,uTx6,uTx7;   /* the user's own material pictures (pattern 20…27) */
uniform sampler2D uLS; uniform mat4 uLSm; uniform vec4 uLSp;   /* depth seen from the nearest ceiling light looking down, its matrix, its position (w = on) */
uniform sampler2D uLS4; uniform mat4 uLS4m[16]; uniform vec4 uLS4p[16];   /* the next sixteen fittings ("More shadows"): 4 × 4 tiles of one depth picture */
uniform vec4 uPLd[32];  /* direction a fitting shines (xyz) and the cosine of its beam edge (w); w < -1.5 = all round */
float lampSh4(vec3 P,int k){ vec4 c=uLS4m[k]*vec4(P,1.0); if(c.w<=0.01) return 1.0; vec3 n=c.xyz/c.w*0.5+0.5; if(n.x<0.012||n.x>0.988||n.y<0.012||n.y>0.988||n.z>1.0) return 1.0;
  vec2 b=n.xy*0.25+vec2(float(k-(k/4)*4),float(k/4))*0.25; float s=0.0; vec2 t=vec2(1.0/2048.0); for(int i=0;i<9;i++){ vec2 o=vec2(float(i-(i/3)*3)-1.0,float(i/3)-1.0)*t*1.25; s+=step(n.z-0.0012,texture(uLS4,b+o).r); } return s/9.0; }
float lampSh(vec3 P){ vec4 c=uLSm*vec4(P,1.0); if(c.w<=0.01) return 1.0; vec3 n=c.xyz/c.w*0.5+0.5; if(n.x<0.01||n.x>0.99||n.y<0.01||n.y>0.99||n.z>1.0) return 1.0;
  float s=0.0, t=1.0/1024.0; for(int i=0;i<4;i++){ vec2 o=vec2(float(i-(i/2)*2)-0.5,float(i/2)-0.5)*t*1.5; s+=step(n.z-0.0009,texture(uLS,n.xy+o).r); } return s*0.25; }
uniform sampler2D uRC,uRD;  /* the frame before this one — colour and depth — for reflections on water */
uniform mat4 uVPf; uniform vec3 uRf;   /* uRf: on, near, far */
float rLin(float d){ return 2.0*uRf.y*uRf.z/(uRf.z+uRf.y-(d*2.0-1.0)*(uRf.z-uRf.y)); }
/* what a ray from P along R meets on the screen: colour and how sure (0…1) */
vec4 ssr(vec3 P,vec3 R){
  float stp=0.25; vec3 p=P+R*0.1; vec2 lastUV=vec2(-1.0); int out_=0;
  for(int i=0;i<26;i++){ p+=R*stp; stp*=1.16; vec4 c=uVPf*vec4(p,1.0); if(c.w<=0.001) break; vec3 n=c.xyz/c.w; vec2 uv=n.xy*0.5+0.5; if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ out_=1; break; } lastUV=uv;
    float d=texture(uRD,uv).r; if(d>0.99999) continue; float ls=rLin(d), lr=rLin(n.z*0.5+0.5), df=lr-ls;
    if(df>0.0 && df<max(0.6,stp*2.5)){ vec2 e=min(uv,1.0-uv); float fade=clamp(min(e.x,e.y)*12.0,0.0,1.0)*clamp(1.0-float(i)/26.0,0.0,1.0); return vec4(texture(uRC,uv).rgb,fade); } }
  /* the ray left the screen: what lies beyond is not known, so the colours at the edge it left by are stretched (blurred) as a faint reflection */
  if(out_==1 && lastUV.x>=0.0 && R.z<0.35){ vec2 q=clamp(lastUV,0.02,0.98); vec3 sc=(texture(uRC,q).rgb+texture(uRC,q+vec2(0.03,0.0)).rgb+texture(uRC,q-vec2(0.03,0.0)).rgb+texture(uRC,q+vec2(0.0,0.03)).rgb+texture(uRC,q-vec2(0.0,0.03)).rgb)*0.2; return vec4(sc,0.35); }
  return vec4(0.0);
}
uniform sampler2D uWM;      /* plan of the walls and columns, one tile per storey (3 × 3): light from fittings stops at them */
uniform vec4 uWMb;          /* x0, y0, 1/width, 1/height of the plan in metres */
uniform int uWMn;           /* storeys in the plan (0 = no wall check) */
uniform float uWMz[9];      /* floor level of each storey, metres */
int wmLvl(float z){ int k=0; for(int i=0;i<9;i++){ if(i>=uWMn) break; if(z>=uWMz[i]-0.03) k=i; } return k; }
float wmAt(vec2 p,int lv){ vec2 q=(p-uWMb.xy)*uWMb.zw; if(q.x<0.0||q.y<0.0||q.x>1.0||q.y>1.0) return 0.0; vec2 tile=vec2(float(lv-(lv/3)*3),float(lv/3)); return texture(uWM,(tile+clamp(q,0.002,0.998))/3.0).r; }
/* 1 = the fitting at b is seen from a, 0 = a wall, a column or a floor slab stands between */
float wmSee(vec3 a,vec3 b){
  if(uWMn==0) return 1.0;
  int la=wmLvl(a.z), lb=wmLvl(b.z-0.06); if(la!=lb) return 0.0;
  vec2 d=b.xy-a.xy; float L=length(d); if(L<0.25) return 1.0;
  float px=1.0/(uWMb.z*256.0), stp=max(0.1,px*0.7), n=min(48.0,ceil(L/stp)); stp=L/n;   /* steps shorter than a wall is thick, so no wall is stepped over */
  for(int k=1;k<48;k++){ float s=float(k)*stp; if(s>=L-0.12) break; if(wmAt(a.xy+d*(s/L),la)>0.45) return 0.0; }
  return 1.0;
}
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
  /* bias grows with the slope of the face to the sun and with the blur width, so faces the sun only grazes are not blotchy */
  float tanT=sqrt(max(1.0-nl*nl,0.0))/max(nl,0.04), spread=float(uK)*1.2/uSMs;
  float bias=clamp(0.0004+(1.0+float(uK)*1.2)*tanT/(3.0*uSMs),0.0006,0.012), s=0.0;
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
  if(vP.x<uBox.x||vP.x>uBox.y||vP.y<uBox.z||vP.y>uBox.w) discard;   /* section box */
  vec3 N=normalize(vN);
  if(!gl_FrontFacing) N=-N;

  /* base color */
  vec3 col=vC.rgb;
  float alpha=vC.a;
  float pat=vM.x, sz=vM.y, gloss=vM.z;
  if(pat>17.5 && pat<18.5){ pat=0.0; sz=1.0; gloss=0.3; }   /* wheel: the slots hold its offsets from the axle, not a pattern */

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
  }else if(pi==6){/* tiles: straight grid, joints that stay clean at a distance, slight tone change tile to tile */
    vec2 aa=fwidth(uv)*1.3; vec2 e=0.5-abs(fract(uv)-0.5);
    vec2 m=smoothstep(vec2(0.012)-aa,vec2(0.012)+aa,e);
    float far=clamp(max(aa.x,aa.y)*2.2,0.0,1.0);
    float g=mix(min(m.x,m.y),0.96,far);
    float tv=fract(sin(dot(floor(uv),vec2(12.9898,78.233)))*43758.5453);
    col*=mix(0.965+0.07*tv,1.0,far);
    col=mix(col*0.55,col,g);
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
  }else if(pi==17){/* water: soft ripples that also tilt the surface, so the reflected sky breaks up */
    float w1=fbm(uv*2.2+vec2(uTm*0.07,1.7+uTm*0.045)), w2=fbm(uv*5.1+vec2(3.1-uTm*0.06,0.4+uTm*0.09));   /* the ripples drift while ▶ Play is on */
    col*=0.82+0.22*w1+0.1*w2;
    if(N.z>0.5) N=normalize(N+vec3((w1-0.5)*0.22,(w2-0.5)*0.22,0.0));
  }

  if(pi>=20){ vec3 tr=uTxR[min(pi-20,7)]; float tc=cos(tr.x), ts=sin(tr.x); vec2 tq=uv+tr.yz; uv=vec2(tq.x*tc-tq.y*ts,tq.x*ts+tq.y*tc); vec3 t; if(pi==20) t=texture(uTx0,uv).rgb; else if(pi==21) t=texture(uTx1,uv).rgb; else if(pi==22) t=texture(uTx2,uv).rgb; else if(pi==23) t=texture(uTx3,uv).rgb; else if(pi==24) t=texture(uTx4,uv).rgb; else if(pi==25) t=texture(uTx5,uv).rgb; else if(pi==26) t=texture(uTx6,uv).rgb; else t=texture(uTx7,uv).rgb; col=t; }

  /* style override: 1=colors(flat), 2=white model */
  if(uStyle>1.5) col=vec3(0.92);
  if(uStyle>0.5 && uStyle<1.5) gloss=0.0;

  /* lighting */
  float diff=max(dot(N,uSun),0.0);
  float sh=shadow();
  vec3 amb=mix(uGnd,uSky,N.z*0.5+0.5)*uAmb;
  vec3 lit=amb + uSunCol*diff*sh;
  /* light fittings (no shadows): warm point lights that fall off with distance */
  for(int i=0;i<32;i++){ if(i>=uPLn) break; vec3 toL=uPL[i].xyz-vP; float dL=length(toL); float nl=max(dot(N,toL/max(dL,1e-4)),0.0); float att=uPL[i].w*uPLk*(0.18+0.82*nl)/(1.0+dL*dL*0.16); if(uPLd[i].w>-1.5){ float cs=dot(-toL/max(dL,1e-4),uPLd[i].xyz); att*=smoothstep(uPLd[i].w,min(1.0,uPLd[i].w+0.22),cs); } if(att>0.012){ att*=wmSee(vP+N*0.16,uPL[i].xyz); if(uLSp.w>0.5 && abs(uPL[i].x-uLSp.x)+abs(uPL[i].y-uLSp.y)+abs(uPL[i].z-uLSp.z)<0.02) att*=0.25+0.75*lampSh(vP+N*0.02); else for(int k=0;k<16;k++){ if(uLS4p[k].w>0.5 && abs(uPL[i].x-uLS4p[k].x)+abs(uPL[i].y-uLS4p[k].y)+abs(uPL[i].z-uLS4p[k].z)<0.02){ att*=0.25+0.75*lampSh4(vP+N*0.02,k); break; } } } lit+=uPLc[i]*att; }
  /* walk-through: a soft warm light carried by the viewer, so rooms the sun does not reach are still readable */
  if(uHead>0.01){ vec3 toE=uEye-vP; float dE=length(toE); lit+=vec3(1.0,0.95,0.86)*uHead*(0.35+0.65*max(dot(N,toE/max(dE,1e-4)),0.0))/(1.0+dE*dE*0.012); }

  /* specular */
  if(gloss>0.01 && uStyle<0.5){
    vec3 V=normalize(uEye-vP);
    vec3 H=normalize(uSun+V);
    float spec=pow(max(dot(N,H),0.0), 16.0+gloss*200.0);
    lit+=uSunCol*spec*gloss*sh;
  }

  if(pi==16 && uStyle<0.5) col*=max(lit,vec3(1.2)); else col*=lit;   /* 16 = light-giving surface (LED, lamp): never darker than its own colour */

  /* reflection of the sky on glass and polished surfaces: stronger at glancing angles */
  if(uStyle<0.5 && (pi==12 || pi==17 || gloss>0.25)){
    vec3 Vr=normalize(uEye-vP); float nv=max(dot(Vr,N),0.0); vec3 R=reflect(-Vr,N);
    vec3 env=R.z>0.0 ? mix(uHor,uSky,pow(clamp(R.z,0.0,1.0),0.45)) : mix(uHor,uGnd,clamp(-R.z*3.0,0.0,1.0))*0.8;
    float fr=0.04+0.96*pow(1.0-nv,5.0);
    if(pi==17){ fr=0.12+0.88*pow(1.0-nv,3.0); if(uRf.x>0.5 && R.z>0.02){ vec4 h=ssr(vP,R); env=mix(env,h.rgb,h.a*0.85); } }   /* water mirrors what stands beside it */
    else if(uRf.x>1.5 && (pi==12 || gloss>0.45)){ vec4 h2=ssr(vP,R); env=mix(env,h2.rgb,h2.a*0.8); fr=max(fr,pi==12?0.10:0.06*gloss); }   /* ✨ Reflections: glass and polished floors mirror the scene too */
    col=mix(col,env,clamp(fr*(pi==12||pi==17?0.9:gloss*0.55),0.0,pi==12||pi==17?0.75:0.4));
  }

  /* section fill: where the cut opens a solid, its inside faces are seen — show them as hatched cut material */
  if(!gl_FrontFacing && uSecFill>0.5 && alpha>0.9 && pi!=10 && pi!=17){ float hh=step(0.55,fract((vP.x+vP.y+vP.z)*7.0)); col=mix(uSecCol*0.44,uSecCol,hh)*(uStyle>1.5?1.6:1.0); }

  /* selection highlight */
  if(uSel>0.5 && abs(vI-uSel)<0.5) col=mix(col,vec3(0.2,0.6,1.0),0.35);

  /* fog */
  if(uFog>0.5){
    float d=length(vP-uEye);
    float f=1.0-exp(-d*d*0.00004);
    col=mix(col,uHor,clamp(f,0.0,0.85));
  }

  fragColor=vec4(col,alpha*uXr);
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
uniform vec3 uCR,uCU,uCF;     /* camera right*tan*asp, up*tan, forward (world, Z up) */
uniform int uKind;            /* 0 clear 1 clouds 2 overcast 3 dusk 4 studio 5 picture */
uniform float uRot,uDrift,uLinS;
uniform vec4 uPicA;           /* repeats round, vertical span (rad), bottom angle, full panorama? */
uniform sampler2D uPic;
out vec4 fragColor;
float hsh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float nz(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x),mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*nz(p); p=p*2.03+vec2(17.3,9.1); a*=0.5; } return s; }
void main(){
  vec3 rd=normalize(uCF+uCR*vUV.x+uCU*vUV.y);
  float h=rd.z*0.5+0.5;
  vec3 sky=mix(uHor2,uZen,smoothstep(0.5,0.85,h));
  float horizonGlow=exp(-abs(rd.z)*6.0);
  sky+=uHor2*horizonGlow*0.25;
  float sd=max(dot(rd,uSunD),0.0);
  float sunK=(uKind==2||uKind==4)?0.0:1.0;
  sky+=uSunCol2*pow(sd,16.0)*0.15*sunK;
  sky+=uSunCol2*pow(sd,64.0)*0.5*sunK;
  sky=mix(sky,uZen*0.7,smoothstep(0.93,1.0,h));
  vec3 disc=uSunCol2*pow(sd,512.0)*1.8*sunK;
  if(uKind==1||uKind==2||uKind==3){
    float up=max(rd.z,0.0);
    vec2 q=rd.xy/(up+0.12)*1.35+vec2(uDrift,uDrift*0.4);
    float f=fbm(q), f2=fbm(q*2.7+vec2(4.0,1.0));
    float lo=uKind==2?0.18:uKind==3?0.50:0.47, hi=uKind==2?0.55:0.72;
    float cv=smoothstep(lo,hi,f*0.75+f2*0.25)*smoothstep(0.0,0.10,rd.z);
    float lum=max(max(uSunCol2.r,uSunCol2.g),uSunCol2.b);
    vec3 lit=mix(uHor2*1.15+vec3(0.10),vec3(1.0),0.55)*(0.45+0.55*min(lum,1.0));
    if(uKind==3) lit=mix(lit,vec3(1.0,0.62,0.38),0.55);
    vec3 shade=mix(uZen,vec3(0.55,0.57,0.62),0.75)*(0.35+0.5*min(lum,1.0));
    vec3 cc=mix(lit,shade,smoothstep(0.55,0.95,f2*0.6+f*0.5));
    cc+=uSunCol2*pow(sd,8.0)*0.18*sunK;
    disc*=(1.0-cv);
    sky=mix(sky,cc,cv*(uKind==2?0.96:0.9));
  }
  sky+=disc;
  if(uKind==5){
    float az=atan(rd.x,rd.y)/6.2831853+uRot;
    vec2 uv; float k=1.0;
    if(uPicA.w>0.5){ uv=vec2(fract(az),asin(clamp(rd.z,-1.0,1.0))/3.14159265+0.5); }
    else{
      float t=az*uPicA.x, m=mod(floor(t),2.0); float fx=fract(t); if(m>0.5) fx=1.0-fx;
      float el=asin(clamp(rd.z,-1.0,1.0)); float v=(el-uPicA.z)/uPicA.y;
      uv=vec2(fx,clamp(v,0.002,0.998)); k=1.0-smoothstep(0.90,1.0,v);
    }
    vec3 pc=textureLod(uPic,uv,0.0).rgb;
    float lum=clamp(max(max(uSunCol2.r,uSunCol2.g),uSunCol2.b)+0.25,0.12,1.0);
    vec3 topc=textureLod(uPic,vec2(uv.x,0.995),4.0).rgb;
    sky=mix(topc,pc,k)*lum; if(uLinS>0.5) sky=pow(sky,vec3(2.2));
  }
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
uniform vec3 uOff;
uniform vec4 uFlip;
out vec3 vW;
void main(){vec3 p=aP; if(uFlip.x>0.5){ float fc=cos(uFlip.w), fs=sin(uFlip.w); vec2 fq=p.xy-uFlip.yz; p.xy=uFlip.yz+vec2(fq.x*fc-fq.y*fs,fq.x*fs+fq.y*fc); } vW=p+uOff; gl_Position=uVP*vec4(vW,1.0);}`;
const SFS=`#version 300 es
precision highp float;
in vec3 vW;
uniform float uCutS; uniform vec4 uBoxS;
out vec4 fragColor;
void main(){ if(vW.z>uCutS||vW.x<uBoxS.x||vW.x>uBoxS.y||vW.y<uBoxS.z||vW.y>uBoxS.w) discard;   /* parts cut away throw no shadow */
  fragColor=vec4(gl_FragCoord.z,0,0,1);}`;

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
uniform float uBloom;   /* glow round light sources (night) */
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
  if(uBloom>0.0){
    vec3 g=vec3(0.0); float asp=uRes.y/uRes.x;
    for(int i=0;i<28;i++){ float fi=float(i)+0.5, r=sqrt(fi/28.0)*0.034, a=fi*2.399963; vec3 s=texture(uCol,vUV+vec2(cos(a)*r*asp,sin(a)*r)).rgb; float l=max(max(s.r,s.g),s.b); g+=s*smoothstep(0.80,1.0,l)*(1.0-sqrt(fi/28.0)*0.6); }
    col.rgb+=g*(uBloom/28.0)*1.6;
  }
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
  if(this.play){ this._playT=performance.now()/1000; this.dirty=true; }
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
  this._hasWater=false; try{ for(const g of (sc.groups||[])){ const V=g.v; if(!V) continue; for(let i=11;i<V.length;i+=42){ if(V[i]===17){ this._hasWater=true; break; } } if(this._hasWater) break; } }catch(eW){}
  const gl=this.gl;
  this._delVAOs();

  /* split groups into opaque and transparent */
  let op=[],tr=[]; const movers=[];
  (this.movers||[]).forEach(function(m){ gl.deleteVertexArray(m.vF); gl.deleteVertexArray(m.vS); gl.deleteBuffer(m.buf); }); this.movers=[];
  const groups=sc.groups||[];
  for(const gRaw of groups){
    /* groups may be {id,idx,v,e} objects or raw Float32Arrays */
    const g=gRaw.v||gRaw;
    if(!g||!g.length) continue;
    if(gRaw.mv){ movers.push({v:g,mv:gRaw.mv}); continue; }
    /* split triangle by triangle: an object that is partly glass (a glazed shutter, a hob on a counter) must keep its
       solid faces in the depth-writing pass, or they are drawn in sort order and show through each other */
    let transparent=false;
    for(let i=0;i<g.length;i+=ST){
      if(g[i+9]<0.99){transparent=true;break;}
    }
    if(!transparent){ op.push(g); continue; }
    const T3=ST*3, nT=(g.length/T3)|0, o2=[], t2=[];
    for(let t=0;t<nT;t++){ const b=t*T3, isT=g[b+9]<0.99||g[b+ST+9]<0.99||g[b+2*ST+9]<0.99, dst=isT?t2:o2; for(let k=0;k<T3;k++) dst.push(g[b+k]); }
    if(o2.length) op.push(new Float32Array(o2)); if(t2.length) tr.push(new Float32Array(t2));
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
  this.cuts=sc.cutouts||[]; this.lights=sc.lights||[];
  for(const m of movers){ const buf=this.vbo(gl,m.v instanceof Float32Array?m.v:new Float32Array(m.v)); this.movers.push({buf:buf,vF:this.makeVAO(gl,buf,true),vS:this.makeVAO(gl,buf,false),n:m.v.length/ST|0,raw:m.v,mv:m.mv,seed:(m.v[0]*1.7+m.v[1]*0.9)%5}); }
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
    const d=this.walkDir(), nW=0.12, fW=Math.max(600,this.dist*100);
    return{vp:mul(look(e,[e[0]+d[0],e[1]+d[1],e[2]+d[2]],[0,0,1]),persp(this.walkFov||1.15,asp,nW,fW)),eye:e,near:nW,far:fW};
  }
  const V=look(e,this.t,[0,0,1]);
  const n=this.dist*0.04, f=this.dist*100;   /* a nearer near plane wastes depth precision: thin layers (a shutter 18 mm in front of its carcass) then flicker on 16-bit depth buffers */
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
  if(this.night) return{sunCol:[0,0,0],sky:[0.07,0.08,0.14],gnd:[0.03,0.03,0.05],zen:[0.015,0.02,0.07],hor:[0.05,0.06,0.12]};
  if(dayFrac<0.01) return{sunCol:[0,0,0],sky:[0.03,0.03,0.06],gnd:[0.02,0.02,0.03],zen:[0.02,0.02,0.06],hor:[0.04,0.04,0.06]};
  const sk=this.skyKind|0;
  if(sk===2){ const g=0.25+0.55*dayFrac; return{sunCol:[sunCol[0]*0.22,sunCol[1]*0.22,sunCol[2]*0.22],sky:[0.62*g+0.05,0.65*g+0.05,0.70*g+0.05],gnd:[0.30*g,0.29*g,0.27*g],zen:[0.42*g,0.45*g,0.50*g],hor:[0.72*g,0.74*g,0.77*g]}; }
  if(sk===3){ return{sunCol:[1.15*dayFrac,0.62*dayFrac,0.34*dayFrac],sky:[0.42*dayFrac+0.08,0.36*dayFrac+0.07,0.50*dayFrac+0.10],gnd:[0.26*dayFrac+0.04,0.18*dayFrac+0.03,0.14*dayFrac+0.03],zen:[0.10,0.14,0.36],hor:[0.98,0.52,0.26]}; }
  if(sk===4){ return{sunCol:[sunCol[0]*0.8,sunCol[1]*0.8,sunCol[2]*0.8],sky:[0.72,0.74,0.76],gnd:[0.34,0.34,0.34],zen:[0.80,0.82,0.85],hor:[0.93,0.94,0.95]}; }
  if(sk===5 && this.picLight!==false && this._sky && this._sky.amb){ const A=this._sky.amb, mx=function(a,b,k){ return [a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k]; }, sky0=[0.48*dayFrac+0.06,0.58*dayFrac+0.06,0.78*dayFrac+0.06], gnd0=[0.28*dayFrac+0.04,0.26*dayFrac+0.04,0.20*dayFrac+0.03], hor0=[0.62+0.28*warmth,0.68+0.12*warmth,0.78-0.08*warmth];
    const hb=(A.hor[0]+A.hor[1]+A.hor[2])/3+0.05, tint=[A.hor[0]/hb*0.34+0.66,A.hor[1]/hb*0.34+0.66,A.hor[2]/hb*0.34+0.66].map(function(v){ return Math.max(0.6,Math.min(1.3,v)); });
    return{sunCol:[sunCol[0]*tint[0],sunCol[1]*tint[1],sunCol[2]*tint[2]],sky:mx(sky0,A.sky,0.7),gnd:mx(gnd0,A.gnd,0.7),zen:A.sky,hor:mx(hor0,A.hor,0.8)}; }   /* 🖼 the background picture lights the model */
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

/* the camera of a light fitting for its shadow picture: looks the way the fitting shines (down unless it has a direction) */
function lampVP(q){ const d=q[5]&&q[5].length===3?q[5]:[0,0,-1], n=Math.hypot(d[0],d[1],d[2])||1, dn=[d[0]/n,d[1]/n,d[2]/n], up=Math.abs(dn[2])>0.9?[0,1,0]:[0,0,1];
  return mul(look([q[0],q[1],q[2]],[q[0]+dn[0],q[1]+dn[1],q[2]+dn[2]],up),persp(2.25,1,0.2,14)); }
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
    var mu=this.mp.u, mnames='uVP uL uSun uEye uSunCol uSky uGnd uHor uSel uCut uShadow uSMs uStyle uFog uAmb uHead uXr uBox uPLn uPLk uK uSM'.split(' ');
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

  /* 1b. the nearest light fitting looks straight down and throws the shadows of furniture (night view) */
  this._ls=null; this._ls4=null;
  if(this.night && this.lampShadow!==false && !this.lightThru && this.lightsOn!==false && (this.lights||[]).length && this.style<0.5 && this.vaoOpS){ try{
    const tC=this.walk&&this.we?this.we:this.t, Lg=this.lights.slice().sort(function(a,b){ return ((a[0]-tC[0])*(a[0]-tC[0])+(a[1]-tC[1])*(a[1]-tC[1])+(a[2]-tC[2])*(a[2]-tC[2]))-((b[0]-tC[0])*(b[0]-tC[0])+(b[1]-tC[1])*(b[1]-tC[1])+(b[2]-tC[2])*(b[2]-tC[2])); })[0];
    if(!this.lsFB){ const n=1024, tex=gl.createTexture(); gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,tex); gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,n,n,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.NONE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,tex,0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindTexture(gl.TEXTURE_2D,null); gl.activeTexture(gl.TEXTURE0); this.lsFB=fb; this.lsTex=tex; }
    const lvm=lampVP(Lg);
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,null); gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.lsFB); gl.viewport(0,0,1024,1024); gl.colorMask(false,false,false,false); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    gl.useProgram(this.sp); gl.uniformMatrix4fv(this.sp.u.uVP,false,lvm); if(!this._scLoc) this._scLoc={c:gl.getUniformLocation(this.sp,'uCutS'),b:gl.getUniformLocation(this.sp,'uBoxS')}; gl.uniform1f(this._scLoc.c,1e9); gl.uniform4f(this._scLoc.b,-1e9,1e9,-1e9,1e9);
    gl.bindVertexArray(this.vaoOpS); gl.drawArrays(gl.TRIANGLES,0,this.opN); gl.bindVertexArray(null);
    gl.colorMask(true,true,true,true); gl.bindFramebuffer(gl.FRAMEBUFFER,null); this._ls={m:lvm,p:Lg};
    this._ls4=null;
    if(this.lampShadowAll && this.lights.length>1){   /* "More shadows": the next three fittings nearest to the view throw shadows too */
      const tC2=this.walk&&this.we?this.we:this.t, d2=function(a){ return (a[0]-tC2[0])*(a[0]-tC2[0])+(a[1]-tC2[1])*(a[1]-tC2[1])+(a[2]-tC2[2])*(a[2]-tC2[2]); }, more=this.lights.slice().sort(function(a,b){ return d2(a)-d2(b); }).slice(1,17);
      if(!this.ls4FB){ const tex=gl.createTexture(); gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D,tex); gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,2048,2048,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.NONE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,tex,0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindTexture(gl.TEXTURE_2D,null); gl.activeTexture(gl.TEXTURE0); this.ls4FB=fb; this.ls4Tex=tex; }
      gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D,null); gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.ls4FB); gl.viewport(0,0,2048,2048); gl.colorMask(false,false,false,false); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.useProgram(this.sp); gl.bindVertexArray(this.vaoOpS);
      const out4=[]; for(let k=0;k<more.length;k++){ const q=more[k], m4=lampVP(q); gl.viewport((k%4)*512,Math.floor(k/4)*512,512,512); gl.uniformMatrix4fv(this.sp.u.uVP,false,m4); gl.drawArrays(gl.TRIANGLES,0,this.opN); out4.push({m:m4,p:q}); }
      gl.bindVertexArray(null); gl.colorMask(true,true,true,true); gl.bindFramebuffer(gl.FRAMEBUFFER,null); this._ls4=out4; }
  }catch(eL){ this._ls4=null; this.lampShadow=false; this._ls=null; gl.colorMask(true,true,true,true); gl.bindFramebuffer(gl.FRAMEBUFFER,null); } }

  const bloomOn=this.night && this.bloom!==false && !this.ortho_ && (this.lights||[]).length>0 && this.style<0.5;
  const rfWant=(!!this._hasWater || !!this.reflAll) && this.reflect!==false && this.style<0.5 && !this.ortho_;
  const usePost=this.ssao || bloomOn || rfWant;

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
    if(!this._scLoc) this._scLoc={c:gl.getUniformLocation(this.sp,'uCutS'),b:gl.getUniformLocation(this.sp,'uBoxS')}; gl.uniform1f(this._scLoc.c,this.cut<1e7?this.cut:1e9); { const bS=this.box||[-1e9,1e9,-1e9,1e9]; gl.uniform4f(this._scLoc.b,bS[0],bS[1],bS[2],bS[3]); }
    if(this.vaoOpS){
      gl.bindVertexArray(this.vaoOpS);
      gl.drawArrays(gl.TRIANGLES,0,this.opN);
    }
    if(this.showGround && !this.noGround && this.vaoGndS){
      gl.bindVertexArray(this.vaoGndS);
      gl.drawArrays(gl.TRIANGLES,0,this.gndN);
    }
    gl.bindVertexArray(null);
    if(this.movers&&this.movers.length){ this._drawMovers(this.sp,false); gl.useProgram(this.sp); }
    if(this.cuts&&this.cuts.length) this._drawCuts(lvp,null,this.sunDir());   /* picture cut-outs cast their outline as a shadow */
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
    this._skyU(m);
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
  { if(!this._ls4Loc) this._ls4Loc={s:gl.getUniformLocation(this.mp,'uLS4'),m:gl.getUniformLocation(this.mp,'uLS4m'),p:gl.getUniformLocation(this.mp,'uLS4p')}; const L4=this._ls4||[], pm=new Float32Array(256), pp=new Float32Array(64); for(let k=0;k<16;k++){ if(L4[k]){ pm.set(L4[k].m,k*16); pp[k*4]=L4[k].p[0]; pp[k*4+1]=L4[k].p[1]; pp[k*4+2]=L4[k].p[2]; pp[k*4+3]=1; } }
    gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D,L4.length?this.ls4Tex:null); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this._ls4Loc.s,12); if(this._ls4Loc.m) gl.uniformMatrix4fv(this._ls4Loc.m,false,pm); if(this._ls4Loc.p) gl.uniform4fv(this._ls4Loc.p,pp); }
  { if(!this._lsLoc) this._lsLoc={s:gl.getUniformLocation(this.mp,'uLS'),m:gl.getUniformLocation(this.mp,'uLSm'),p:gl.getUniformLocation(this.mp,'uLSp')}; const LS=this._ls;
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D,LS?this.lsTex:null); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this._lsLoc.s,11);
    if(LS){ gl.uniformMatrix4fv(this._lsLoc.m,false,LS.m); gl.uniform4f(this._lsLoc.p,LS.p[0],LS.p[1],LS.p[2],1); } else gl.uniform4f(this._lsLoc.p,0,0,0,0); }
  { if(!this._rfLoc) this._rfLoc={c:gl.getUniformLocation(this.mp,'uRC'),d:gl.getUniformLocation(this.mp,'uRD'),m:gl.getUniformLocation(this.mp,'uVPf'),f:gl.getUniformLocation(this.mp,'uRf')};
    const rOn=rfWant && usePost && this.rfFBO && this._rfValid && this.rfW===w && this.rfH===h;
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D,rOn?this.rfCol:null); gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D,rOn?this.rfDep:null); gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this._rfLoc.c,9); gl.uniform1i(this._rfLoc.d,10); gl.uniformMatrix4fv(this._rfLoc.m,false,this._rfVP||vp); gl.uniform3f(this._rfLoc.f,rOn?(this.reflAll?2:1):0,this._rfNF?this._rfNF[0]:near,this._rfNF?this._rfNF[1]:far); }
  gl.uniform3fv(u.uSun,sd);
  gl.uniform3fv(u.uEye,eyePos);
  gl.uniform3fv(u.uSunCol,lt.sunCol);
  gl.uniform3fv(u.uSky,lt.sky||[0.5,0.6,0.8]);
  gl.uniform3fv(u.uGnd,lt.gnd||[0.25,0.22,0.18]);
  gl.uniform3fv(u.uHor,lt.hor||[0.75,0.78,0.82]);
  gl.uniform1f(u.uSel,this.sel);
  gl.uniform1f(u.uCut,this.cut);
  if(this._tmLoc===undefined) this._tmLoc=gl.getUniformLocation(this.mp,'uTm'); gl.uniform1f(this._tmLoc,this.play?((this._playT||0)%600):0);
  if(this._sfLoc===undefined) this._sfLoc=gl.getUniformLocation(this.mp,'uSecFill'); gl.uniform1f(this._sfLoc,(this.cut<1e7||this.box)&&this.secFill!==false&&!this.xray?1:0); if(this._secCLoc===undefined) this._secCLoc=gl.getUniformLocation(this.mp,"uSecCol"); gl.uniform3fv(this._secCLoc,this.secCol||[0.46,0.42,0.40]);
  gl.uniform4f(u.uBox,-1e9,1e9,-1e9,1e9); gl.uniform1f(u.uXr,1.0);   /* the ground is never cut or made see-through */
  gl.uniform1f(u.uShadow,this.shadows?1:0);
  gl.uniform1f(u.uSMs,this.smSize);
  gl.uniform1f(u.uStyle,this.style);
  gl.uniform1f(u.uFog,this.fog?1:0);
  { const L=this.lights||[], t=this.walk&&this.we?this.we:this.t, near=L.map(function(l){return{l:l,d:(l[0]-t[0])*(l[0]-t[0])+(l[1]-t[1])*(l[1]-t[1])+(l[2]-t[2])*(l[2]-t[2])};}).sort(function(a,b){return a.d-b.d;}).slice(0,32), arr=new Float32Array(128);
    const arc=new Float32Array(96); near.forEach(function(x,i){ arr[i*4]=x.l[0]; arr[i*4+1]=x.l[1]; arr[i*4+2]=x.l[2]; arr[i*4+3]=x.l[3]==null?1:x.l[3]; const c=x.l[4]||[1,0.9,0.72]; arc[i*3]=c[0]; arc[i*3+1]=c[1]; arc[i*3+2]=c[2]; });
    if(!this._plcLoc) this._plcLoc=gl.getUniformLocation(this.mp,'uPLc'); gl.uniform3fv(this._plcLoc,arc);
    { const W=this.wallMask, on=!!(W&&W.tex&&this.lightWalls!==false&&!this.lightThru); if(!this._wmLoc) this._wmLoc={s:gl.getUniformLocation(this.mp,'uWM'),b:gl.getUniformLocation(this.mp,'uWMb'),n:gl.getUniformLocation(this.mp,'uWMn'),z:gl.getUniformLocation(this.mp,'uWMz')};
      gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D,on?W.tex:(this._wmBlank||(this._wmBlank=this._wmMake(null)))); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this._wmLoc.s,8); gl.uniform1i(this._wmLoc.n,on?W.z.length:0);
      if(on){ gl.uniform4f(this._wmLoc.b,W.box[0],W.box[1],1/(W.box[2]-W.box[0]),1/(W.box[3]-W.box[1])); const zz=new Float32Array(9); W.z.forEach(function(v,i){ zz[i]=v; }); gl.uniform1fv(this._wmLoc.z,zz); } }
    { const ad=new Float32Array(128); for(let i=0;i<32;i++) ad[i*4+3]=-2; near.forEach(function(x,i){ const dd=x.l[5]; if(dd&&dd.length===3){ const n=Math.hypot(dd[0],dd[1],dd[2])||1; ad[i*4]=dd[0]/n; ad[i*4+1]=dd[1]/n; ad[i*4+2]=dd[2]/n; ad[i*4+3]=x.l[6]==null?0.5:x.l[6]; } });
      if(this._pldLoc===undefined) this._pldLoc=gl.getUniformLocation(this.mp,'uPLd'); if(this._pldLoc) gl.uniform4fv(this._pldLoc,ad); }
    if(!this._plLoc) this._plLoc=gl.getUniformLocation(this.mp,'uPL'); gl.uniform4fv(this._plLoc,arr); gl.uniform1i(u.uPLn,this.lightsOn===false?0:near.length); gl.uniform1f(u.uPLk,this.night?1.0:0.22); }
  gl.uniform1f(u.uAmb,this.night?(this.walk?0.42:0.75):this.walk?0.70:0.50); gl.uniform1f(u.uHead,this.walk?(this.night?0.22:0.9):0.0);   /* brighter fill light indoors while walking */
  gl.uniform1i(u.uK,this.kern);
  if(u.uLinear) gl.uniform1i(u.uLinear,this.linear?1:0);

  /* own material pictures on units 2…6 */
  { const TS=(EP.bim.TEXSLOTS||[]); if(!this._txLoc) this._txLoc=[0,1,2,3,4,5,6,7].map(i=>gl.getUniformLocation(this.mp,'uTx'+i)); const UN=[2,3,4,5,6,13,14,15];
    for(let i=0;i<8;i++){ const t=TS[i]?this._matTex(TS[i]):this._matTex(null); gl.activeTexture(gl.TEXTURE0+UN[i]); gl.bindTexture(gl.TEXTURE_2D,t.tex||this._matTex(null).tex); gl.uniform1i(this._txLoc[i],UN[i]); } gl.activeTexture(gl.TEXTURE0);
    if(this._txrLoc===undefined) this._txrLoc=gl.getUniformLocation(this.mp,'uTxR'); const TR=EP.bim.TEXR||[], fr=new Float32Array(24); for(let i=0;i<8;i++){ const r=TR[i]||[0,0,0]; fr[i*3]=r[0]; fr[i*3+1]=r[1]; fr[i*3+2]=r[2]; } if(this._txrLoc) gl.uniform3fv(this._txrLoc,fr); }
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
    { const bx=this.box||[-1e9,1e9,-1e9,1e9]; gl.uniform4f(u.uBox,bx[0],bx[1],bx[2],bx[3]); gl.uniform1f(u.uXr,this.xray?0.28:1.0); }
    if(this.xray){ gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }   /* x-ray: see through everything */
    gl.drawArrays(gl.TRIANGLES,0,this.opN);
    if(this.xray){ gl.disable(gl.BLEND); gl.depthMask(true); }
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  if(this.movers&&this.movers.length){ this._drawMovers(this.mp,true); gl.useProgram(this.mp); }

  /* 7. Edges */
  if(this.edges && this.lnN>0 && this.vaoLine){
    gl.useProgram(this.lp);
    gl.uniformMatrix4fv(this.lp.u.uVP,false,vp);
    if(this.box) gl.uniform4f(this.lp.u.uLC,0,0,0,0); else
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

  /* keep a copy of this frame (colour + depth) for the reflections of the next one */
  if(usePost && rfWant){ try{
    if(!this.rfFBO || this.rfW!==w || this.rfH!==h){ if(this.rfFBO){ gl.deleteFramebuffer(this.rfFBO); gl.deleteTexture(this.rfCol); gl.deleteTexture(this.rfDep); }
      const fb=gl.createFramebuffer(), ct=gl.createTexture(), dt=gl.createTexture(), hdr=gl.getExtension('EXT_color_buffer_float'); gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
      gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D,ct); gl.texImage2D(gl.TEXTURE_2D,0,hdr?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,hdr?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,ct,0);
      gl.bindTexture(gl.TEXTURE_2D,dt); gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,dt,0);
      gl.bindTexture(gl.TEXTURE_2D,null); gl.activeTexture(gl.TEXTURE0); this.rfFBO=fb; this.rfCol=ct; this.rfDep=dt; this.rfW=w; this.rfH=h; this._rfValid=false; }
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D,null); gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D,null); gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.ppFBO); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.rfFBO); gl.blitFramebuffer(0,0,w,h,0,0,w,h,gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const moved=!this._rfVP || this._rfVP.some(function(x,i){ return Math.abs(x-vp[i])>1e-5; }); this._rfVP=Array.from(vp); this._rfNF=[near,far];
    if(!this._rfValid || moved){ this._rfValid=true; this.dirty=true; }   /* one more frame, so the reflection is of the view as it now stands */
  }catch(eR){ this.reflect=false; } }

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
    gl.uniform1i(cu.uDoSSAO,this.ssao?1:0); gl.uniform1f(cu.uBloom,bloomOn?1.0:0.0);
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
  let drag=null;

  cv.addEventListener('pointerdown',function(e){
    cv.setPointerCapture(e.pointerId);
    down=true; btn=e.button; lx=e.clientX; ly=e.clientY; x0=lx; y0=ly; multi=false;
    drag=null;
    if(self.moveMode && !self.walk && !self.measure && e.button===0 && touches.length===0){
      const r=cv.getBoundingClientRect(), X=e.clientX-r.left, Y=e.clientY-r.top, pid=self.pickAt(X,Y), el=pid>0&&self.byIdx?(self.byIdx[pid-1]||null):null, hp=el?self.hitPoint(X,Y,true):null;
      if(el && hp && self.onMoveStart && self.onMoveStart(el,hp.p)){ drag={p:hp.p,moved:false}; self.sel=pid; self.dirty=true; }
    }
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
    if(drag){
      if(Math.abs(e.clientX-x0)+Math.abs(e.clientY-y0)<5 && !drag.moved) return;
      const r=cv.getBoundingClientRect(), ry=self.rayAt(e.clientX-r.left,e.clientY-r.top); if(!ry || Math.abs(ry.d[2])<0.02) return;
      const t=(drag.p[2]-ry.o[2])/ry.d[2]; if(!(t>0) || t>2000) return;
      drag.moved=true; if(self.onMoveDrag) self.onMoveDrag(ry.o[0]+ry.d[0]*t-drag.p[0], ry.o[1]+ry.d[1]*t-drag.p[1]); return;
    }
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
    if(drag){ const mvd=drag.moved; drag=null; if(self.onMoveEnd) self.onMoveEnd(mvd); if(mvd) return; }
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
    if(drag){ drag=null; if(self.onMoveEnd) self.onMoveEnd(false,true); }
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

/* ---------- moving vehicles: groups kept out of the merged buffer and drawn with an offset ---------- */
P.prototype._drawMovers=function(prog,full){
  const gl=this.gl; gl.useProgram(prog); prog._off=prog._off||gl.getUniformLocation(prog,'uOff'); if(prog._flip===undefined) prog._flip=gl.getUniformLocation(prog,'uFlip');
  for(const m of this.movers){
    if(!m.piv){ let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity; const V=m.raw; if(V){ for(let i=0;i<V.length;i+=ST){ if(V[i]<x0)x0=V[i]; if(V[i]>x1)x1=V[i]; if(V[i+1]<y0)y0=V[i+1]; if(V[i+1]>y1)y1=V[i+1]; } m.piv=[(x0+x1)/2,(y0+y1)/2]; } else m.piv=[0,0]; }
    if(prog._wh===undefined) prog._wh=gl.getUniformLocation(prog,'uWh');
    const PT=m.mv.path, go=this.play&&(PT?m.mv.len>0.5:m.mv.d>0.5), t=(this._playT||0)+(PT?0:m.seed);
    if(PT&&go){   /* drives along the path drawn for it: there and back, or round and round on a closed path */
      const v=m.mv.spd||5.5, Lp=m.mv.len, cum=m.mv.cum;
      if(!m.mv.tt){   /* it slows for the corners (and to turn round at the ends of an open route): time along the route, every quarter metre */
        const cs=[]; for(let i=1;i<PT.length-1;i++){ const a1=Math.atan2(PT[i][1]-PT[i-1][1],PT[i][0]-PT[i-1][0]), a2=Math.atan2(PT[i+1][1]-PT[i][1],PT[i+1][0]-PT[i][0]); let da=Math.abs(a2-a1); if(da>Math.PI) da=2*Math.PI-da; if(da>0.35) cs.push(cum[i]); }
        if(m.mv.loop){ cs.push(0); cs.push(Lp); } const ends=m.mv.loop?[]:[0,Lp], n=Math.max(2,Math.ceil(Lp/0.25)), tt=new Float32Array(n+1); let T=0;
        for(let i=0;i<n;i++){ const sm=(i+0.5)*Lp/n; let f=1; cs.forEach(c=>{ f=Math.min(f,0.42+0.58*Math.min(1,Math.abs(sm-c)/3.5)); }); (m.mv.stops||[]).forEach(c=>{ f=Math.min(f,0.2+0.8*Math.min(1,Math.abs(sm-(c-3.5))/5)); }); ends.forEach(c=>{ f=Math.min(f,0.25+0.75*Math.min(1,Math.abs(sm-c)/4)); }); T+=(Lp/n)/(v*f); (m.mv.stops||[]).forEach(c=>{ const st=Math.max(0,c-3.5), s0=i*Lp/n, s1=(i+1)*Lp/n; if(st>=s0&&st<s1) T+=3; }); tt[i+1]=T; }
        m.mv.tt=tt; m.mv.T=T; }
      const tt=m.mv.tt, TT=m.mv.T, cyc=m.mv.loop?TT:2*TT; let tc=t%cyc, back=false; if(tc>TT){ back=true; tc=2*TT-tc; }
      let lo=0, hi=tt.length-1; while(hi-lo>1){ const md=(lo+hi)>>1; if(tt[md]<=tc) lo=md; else hi=md; } const seg=Lp/(tt.length-1); let s=(lo+(tc-tt[lo])/((tt[hi]-tt[lo])||1))*seg;
      const run=Math.floor(t/cyc)*(m.mv.loop?Lp:2*Lp)+(back?2*Lp-s:s);
      const at=function(q){ if(m.mv.loop) q=((q%Lp)+Lp)%Lp; else q=Math.max(0,Math.min(Lp,q)); let k=1; while(k<cum.length-1&&cum[k]<q) k++; const f=(q-cum[k-1])/((cum[k]-cum[k-1])||1); return [PT[k-1][0]+(PT[k][0]-PT[k-1][0])*f,PT[k-1][1]+(PT[k][1]-PT[k-1][1])*f]; };
      const c=at(s), a=at(s-1.2), b=at(s+1.2); let hd=Math.hypot(b[0]-a[0],b[1]-a[1])>0.01?Math.atan2(b[1]-a[1],b[0]-a[0]):m.mv.rot; if(back) hd+=Math.PI;
      if(prog._flip) gl.uniform4f(prog._flip,1,m.piv[0],m.piv[1],hd-m.mv.rot);
      if(prog._wh) gl.uniform4f(prog._wh,-(run%207.3)/0.33,m.mv.dir[0],m.mv.dir[1],1);
      gl.uniform3f(prog._off,c[0]-m.piv[0],c[1]-m.piv[1],0);
    } else {
      let d=0, back=false; if(go){ const T=m.mv.d/5.5, ph=(t%(2*T)); back=ph>T; d=back?(2*T-ph)*5.5:ph*5.5; }   /* about 20 km/h to the end of its run, turns round and comes back */
      if(prog._flip) gl.uniform4f(prog._flip,back&&m.raw?1:0,m.piv[0],m.piv[1],Math.PI);
      if(prog._wh){ const T2=m.mv.d/5.5, ph2=go?(t%(2*T2)):0; gl.uniform4f(prog._wh,-(ph2*5.5)/0.33,m.mv.dir[0],m.mv.dir[1],go?1:0); }
      gl.uniform3f(prog._off,m.mv.dir[0]*d,m.mv.dir[1]*d,0);
    }
    gl.bindVertexArray(full?m.vF:m.vS); gl.drawArrays(gl.TRIANGLES,0,m.n);
  }
  if(prog._flip) gl.uniform4f(prog._flip,0,0,0,0); if(prog._wh) gl.uniform4f(prog._wh,0,1,0,0);
  gl.uniform3f(prog._off,0,0,0); gl.bindVertexArray(null);
};

/* ---------- sky: world-space view rays, presets and an own background picture ---------- */
P.SKIES=[['clear','Clear sky'],['clouds','Clouds'],['overcast','Overcast (soft light)'],['dusk','Evening glow'],['studio','Studio (plain light)'],['pic','My own picture']];
P.prototype.setSky=function(o){ o=o||{}; const i=P.SKIES.findIndex(function(x){return x[0]===o.kind;}); this.skyKind=i<0?0:i; this.skyRot=(+o.rot||0)/360; this.skySrc=o.src||null; this.skyPano=!!o.pano; this.skyHz=o.hz==null?0.3:+o.hz; if(this.skyKind===5&&!this.skySrc) this.skyKind=0; this.dirty=true; };
P.prototype._skyTex=function(src){
  const gl=this.gl; if(this._sky&&this._sky.src===src) return this._sky; if(this._sky&&this._sky.tex) gl.deleteTexture(this._sky.tex);
  const t=this._sky={src:src,tex:gl.createTexture(),ready:false,asp:2}; gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,t.tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([150,180,220,255])); gl.activeTexture(gl.TEXTURE0);
  if(!src){ t.ready=true; return t; }
  const img=new Image(), self=this;
  img.onload=function(){ if(self.dead||self._sky!==t) return; try{
    const mx=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE)), k=Math.min(1,mx/Math.max(img.naturalWidth,img.naturalHeight)), cw=Math.max(2,Math.round(img.naturalWidth*k)), ch=Math.max(2,Math.round(img.naturalHeight*k));
    const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch; cv.getContext('2d').drawImage(img,0,0,cw,ch); t.asp=cw/ch;
    /* the picture lights the model: average colours of its sky, horizon and ground bands become the ambient light */
    try{ const sc2=document.createElement('canvas'); sc2.width=32; sc2.height=32; const c2=sc2.getContext('2d'); c2.drawImage(img,0,0,32,32); const px=c2.getImageData(0,0,32,32).data, lin=function(v){ v/=255; return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4); };
      const band=function(y0,y1){ const o=[0,0,0]; let n=0; for(let y=y0;y<y1;y++) for(let x=0;x<32;x++){ const i=(y*32+x)*4; o[0]+=lin(px[i]); o[1]+=lin(px[i+1]); o[2]+=lin(px[i+2]); n++; } return o.map(function(v){ return Math.pow(v/n,1/2.2); }); };
      t.amb={sky:band(0,12),hor:band(12,21),gnd:band(21,32)}; }catch(eA){ t.amb=null; }
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,t.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0); t.ready=true; self.dirty=true; }catch(e){ t.err=String(e); } };
  img.src=src; return t;
};
P.prototype._skyU=function(m){
  const gl=this.gl, kp=this.kp; if(!kp._sk){ kp._sk={}; 'uCR uCU uCF uKind uRot uDrift uPicA uPic uLinS'.split(' ').forEach(function(n){ kp._sk[n]=gl.getUniformLocation(kp,n); }); }
  const L=kp._sk, e=m.eye, asp=this.cv.width/this.cv.height||1;
  let f, fov=this.fov; if(this.walk&&this.we){ f=this.walkDir(); fov=this.walkFov||1.15; } else f=nrm(sub(this.t,e));
  let r=cross(f,[0,0,1]); if(Math.hypot(r[0],r[1],r[2])<1e-5) r=[Math.cos(this.yaw||0),Math.sin(this.yaw||0),0]; r=nrm(r); const up=nrm(cross(r,f)), tn=Math.tan(fov/2);
  gl.uniform3f(L.uCR,r[0]*tn*asp,r[1]*tn*asp,r[2]*tn*asp); gl.uniform3f(L.uCU,up[0]*tn,up[1]*tn,up[2]*tn); gl.uniform3f(L.uCF,f[0],f[1],f[2]);
  let kind=this.night?0:(this.skyKind|0), t=null;
  if(kind===5){ t=this._skyTex(this.skySrc); if(!t.ready) kind=0; }
  gl.uniform1i(L.uKind,kind); gl.uniform1i(L.uPic,7);   /* never unit 0: that may hold the post-process colour texture being drawn into */ gl.uniform1f(L.uLinS,this.linear?1:0); gl.uniform1f(L.uRot,this.skyRot||0); gl.uniform1f(L.uDrift,this.play?((performance.now()/1000)*0.012)%1000:0);
  if(t){ const pano=this.skyPano||t.asp>=1.9; let n=2; while(n<8 && (6.2831853/n)/t.asp>1.25) n+=2; const span=(6.2831853/n)/t.asp;
    gl.uniform4f(L.uPicA,n,span,-span*this.skyHz,pano?1:0); gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,t.tex); gl.uniform1i(L.uPic,7); gl.activeTexture(gl.TEXTURE0); }
};

/* ---------- own material pictures: repeating textures ---------- */
P.prototype._matTex=function(src){
  const gl=this.gl; this._mtex=this._mtex||{}; const key=src||'__white'; let t=this._mtex[key]; if(t) return t;
  t=this._mtex[key]={tex:gl.createTexture(),ready:false}; gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,t.tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([200,200,200,255])); gl.activeTexture(gl.TEXTURE0);
  if(!src){ t.ready=true; return t; }
  const img=new Image(), self=this;
  img.onload=function(){ if(self.dead) return; try{
    const k=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight)), cw=Math.max(2,Math.round(img.naturalWidth*k)), ch=Math.max(2,Math.round(img.naturalHeight*k));
    const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch; cv.getContext('2d').drawImage(img,0,0,cw,ch);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D,t.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0); t.ready=true; self.dirty=true; }catch(e){ t.err=String(e); } };
  img.src=src; return t;
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
P.prototype._drawCuts=function(vp,eye,sunD){
  const gl=this.gl;
  if(!this.bp){ this.bp=this.prog(gl,CUT_VS,CUT_FS); if(!this.bp) return; this.bU={vp:gl.getUniformLocation(this.bp,'uVP'),t:gl.getUniformLocation(this.bp,'uT'),lit:gl.getUniformLocation(this.bp,'uLit'),lin:gl.getUniformLocation(this.bp,'uLin')};
    this.bVAO=gl.createVertexArray(); this.bBuf=gl.createBuffer(); gl.bindVertexArray(this.bVAO); gl.bindBuffer(gl.ARRAY_BUFFER,this.bBuf);
    const a=gl.getAttribLocation(this.bp,'aP'), b=gl.getAttribLocation(this.bp,'aUV'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,3,gl.FLOAT,false,20,0); gl.enableVertexAttribArray(b); gl.vertexAttribPointer(b,2,gl.FLOAT,false,20,12); gl.bindVertexArray(null); }
  const sun=this.sunDir?this.sunDir():[0,0,1], lit=0.62+0.38*Math.max(0,Math.min(1,sun[2]*1.6));
  gl.useProgram(this.bp); gl.uniformMatrix4fv(this.bU.vp,false,vp); gl.uniform1i(this.bU.t,7); gl.uniform1f(this.bU.lit,lit); gl.uniform1f(this.bU.lin,this.linear?1:0);
  gl.bindVertexArray(this.bVAO); gl.bindBuffer(gl.ARRAY_BUFFER,this.bBuf); gl.activeTexture(gl.TEXTURE7); gl.disable(gl.CULL_FACE);
  for(const c of this.cuts){
    const t=this._cutTex(c.src); if(!t.ready) continue; if(this.cut<1e8&&c.p[2]>this.cut) continue;
    let x=c.p[0], y=c.p[1], fl=!!c.flip, z=c.p[2];
    if(this.play&&c.walk>0.2){   /* walks back and forth along its direction at about 1.2 m/s */
      const T=c.walk/1.2, ph=((this._playT||0)+(c.seed||0))%(2*T), back=ph>T, d=back?(2*T-ph)*1.2:ph*1.2; x+=c.dir[0]*d; y+=c.dir[1]*d; if(back) fl=!fl; z+=Math.abs(Math.sin(((this._playT||0)+(c.seed||0))*6.5))*0.035;   /* a small rise and fall with each step */
    }
    if(this.box&&(x<this.box[0]||x>this.box[1]||y<this.box[2]||y>this.box[3])) continue;
    let dx=sunD?sunD[0]:eye[0]-x, dy=sunD?sunD[1]:eye[1]-y; const dl=Math.hypot(dx,dy)||1; dx/=dl; dy/=dl;
    const h=c.h, w=c.w||h*t.asp, rx=-dy*w/2, ry=dx*w/2, u0=fl?1:0, u1=fl?0:1;
    let tx=0, ty=0; if(this.play&&c.walk>0.2){ const sw=Math.sin(((this._playT||0)+(c.seed||0))*6.5)*0.035*h; tx=-dy*sw; ty=dx*sw; }   /* the body sways from foot to foot */
    const v=new Float32Array([x-rx,y-ry,z,u0,0, x+rx,y+ry,z,u1,0, x+rx+tx,y+ry+ty,z+h,u1,1, x-rx,y-ry,z,u0,0, x+rx+tx,y+ry+ty,z+h,u1,1, x-rx+tx,y-ry+ty,z+h,u0,1]);
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
/* plan of walls for the light fittings: m = { canvas (2 × 2 tiles, white = solid), box: [x0, y0, x1, y1] m, z: [floor levels m] } or null */
P.prototype._wmMake=function(cv){ const gl=this.gl, tx=gl.createTexture(); gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D,tx);
  if(cv) gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv); else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); gl.activeTexture(gl.TEXTURE0); return tx; };
P.prototype.setWallMask=function(m){ const gl=this.gl; if(this.wallMask&&this.wallMask.tex) gl.deleteTexture(this.wallMask.tex); this.wallMask=null; if(m&&m.canvas&&m.z&&m.z.length){ try{ this.wallMask={tex:this._wmMake(m.canvas),box:m.box,z:m.z.slice(0,9)}; }catch(e){ this.wallMask=null; } } this.dirty=true; };
/* ray through a screen point: {o, d} in world metres */
P.prototype.rayAt=function(x,y){
  const m=this.mats(), iv=inv(m.vp); if(!iv) return null;
  const nx=x/this.cv.clientWidth*2-1, ny=1-y/this.cv.clientHeight*2;
  const a=xfRow([nx,ny,-1,1],iv), b=xfRow([nx,ny,1,1],iv);
  const o=[a[0]/a[3],a[1]/a[3],a[2]/a[3]], e=[b[0]/b[3],b[1]/b[3],b[2]/b[3]];
  let d=[e[0]-o[0],e[1]-o[1],e[2]-o[2]]; const dl=Math.hypot(d[0],d[1],d[2])||1; return {o:o,d:[d[0]/dl,d[1]/dl,d[2]/dl]};
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
