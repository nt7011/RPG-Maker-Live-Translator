export const failureCode = `
int failureCode(vec4 value){ivec3 b=ivec3(round(value.rgb*255.0));return b.r|(b.g<<8)|(b.b<<16);}
vec4 failureColor(int code){return vec4(code&255,(code>>8)&255,(code>>16)&255,255)/255.0;}`;
export const vertex = `#version 300 es
precision highp float;
void main(){ vec2 p=gl_VertexID==0?vec2(-1,-1):gl_VertexID==1?vec2(3,-1):vec2(-1,3); gl_Position=vec4(p,0,1); }`;
export const canvasPixelEquality = `
ivec4 canvasBytes(vec4 value){return ivec4(round(vec4(value.rgb*value.a,value.a)*255.0));}
bool sameCanvasPixel(vec4 a,vec4 b){return all(equal(canvasBytes(a),canvasBytes(b)));}`;
export const compareFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D beforeImage;
uniform sampler2D afterImage;
uniform sampler2D candidateImage;
uniform ivec2 origin;
uniform ivec2 evidenceOffset;
uniform ivec2 damageExtent;
uniform int compareAll;
out vec4 color;
${canvasPixelEquality}
void main(){
 ivec2 base=ivec2(gl_FragCoord.xy)*8;
 bool changedAny=false,valid=true;
 for(int y=0;y<8;y++)for(int x=0;x<8;x++){
  ivec2 p=base+ivec2(x,y);if(any(greaterThanEqual(p,damageExtent)))continue;
  vec4 b=texelFetch(beforeImage,p+evidenceOffset,0),a=texelFetch(afterImage,p+evidenceOffset,0);
  bool changed=compareAll==1||!sameCanvasPixel(b,a);
  changedAny=changedAny||changed;
  valid=valid&&((compareAll==0&&!changed)||sameCanvasPixel(texelFetch(candidateImage,p+origin,0),a));
 }
 color=vec4(changedAny?1.0:0.0,valid?1.0:0.0,0.0,1.0);
}`;
export const reduceFragment = (diagnostics: boolean) => `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D inputImage;
uniform int finalPass;
out vec4 color;
${diagnostics ? `uniform sampler2D priorValid; uniform int diagnosticIndex; ${failureCode}` : ''}
void main(){
 ${diagnostics
    ? `if(finalPass>=2&&texelFetch(priorValid,ivec2(0),0).r<0.5)discard;
 if(finalPass==3){
  int code=failureCode(texelFetch(inputImage,ivec2(0),0));
  if(code==0)discard;
  color=failureColor(diagnosticIndex+code);return;
 }`
    : ''}
 ivec2 base=ivec2(gl_FragCoord.xy)*8,extent=textureSize(inputImage,0);
 vec2 result=vec2(0,1);
 for(int y=0;y<8;y++)for(int x=0;x<8;x++){
  ivec2 p=base+ivec2(x,y);if(any(greaterThanEqual(p,extent)))continue;
  vec2 value=texelFetch(inputImage,p,0).rg;
  result=vec2(max(result.r,value.r),min(result.g,value.g));
 }
 ${diagnostics
    ? `if(finalPass==2){
  if(result.r>0.5&&result.g>0.5)discard;
  color=failureColor(diagnosticIndex+(result.r>0.5?1:0));return;
 }`
    : ''}
 color=finalPass==1?vec4(result.r>0.5&&result.g>0.5?1.0:0.0):vec4(result,0,1);
}`;
export const regionEvidenceFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D afterImage;
uniform sampler2D candidateImage;
uniform ivec2 origin;
uniform ivec2 extent;
uniform ivec2 effectOrigin;
out vec4 color;
${canvasPixelEquality}
void main(){
 ivec2 base=ivec2(gl_FragCoord.xy)*8;bool valid=true;
 for(int y=0;y<8;y++)for(int x=0;x<8;x++){
  ivec2 p=base+ivec2(x,y);if(any(greaterThanEqual(p,extent)))continue;
  ivec2 q=p+origin;
  valid=valid&&sameCanvasPixel(texelFetch(candidateImage,q,0),texelFetch(afterImage,q-effectOrigin,0));
 }
 color=vec4(1.0,valid?1.0:0.0,0.0,1.0);
}`;
export const pixelOwnerCode = `
int ownerCode(vec4 v){ivec3 b=ivec3(round(v.rgb*255.0));return b.r|(b.g<<8)|(b.b<<16);}
vec4 ownerColor(int n){return vec4(n&255,(n>>8)&255,(n>>16)&255,255)/255.0;}`;
export const ownershipFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D owners;
uniform sampler2D beforeImage;
uniform sampler2D afterImage;
uniform ivec2 origin;
uniform ivec2 imageOrigin;
uniform int mode;
uniform sampler2D validFlag;
uniform int guarded;
uniform int owner;
out vec4 color;
${canvasPixelEquality}
${pixelOwnerCode}
void main(){
 ivec2 q=ivec2(gl_FragCoord.xy)+origin,p=q-imageOrigin;
 vec4 prior=texelFetch(owners,q,0),a=texelFetch(afterImage,p,0);
 if(guarded==1&&texelFetch(validFlag,ivec2(0),0).r<0.5){color=prior;return;}
 bool ink=mode==2||(mode==1?a.a>0.0:!sameCanvasPixel(a,texelFetch(beforeImage,p,0)));
 int old=ownerCode(prior);
 color=ink?ownerColor(old==0||old==owner?owner:16777215):prior;
}`;
export const collisionFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D owners;
uniform sampler2D textImage;
uniform ivec2 origin;
uniform ivec2 extent;
uniform int owner;
out vec4 color;
${pixelOwnerCode}
void main(){
 ivec2 base=ivec2(gl_FragCoord.xy)*8;bool valid=true;
 for(int y=0;y<8;y++)for(int x=0;x<8;x++){
  ivec2 p=base+ivec2(x,y);if(any(greaterThanEqual(p,extent)))continue;
  ivec2 q=p+origin;int occupied=ownerCode(texelFetch(owners,q,0));
  valid=valid&&(texelFetch(textImage,q,0).a==0.0||occupied==0||occupied==owner);
 }
 color=vec4(1.0,valid?1.0:0.0,0.0,1.0);
}`;
export const vacantFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D candidateImage;
uniform sampler2D permissionImage;
uniform bool allowBackground;
uniform ivec2 origin;
uniform ivec2 extent;
out vec4 color;
void main(){
 ivec2 base=ivec2(gl_FragCoord.xy)*8;
 bool valid=true;
 for(int y=0;y<8;y++)for(int x=0;x<8;x++){
  ivec2 p=base+ivec2(x,y);if(any(greaterThanEqual(p,extent)))continue;
  ivec2 q=p+origin;
  valid=valid&&((allowBackground&&texelFetch(permissionImage,q,0).r>0.5)||texelFetch(candidateImage,q,0).a==0.0);
 }
 color=vec4(1.0,valid?1.0:0.0,0.0,1.0);
}`;
export const reverseFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D beforeImage;
uniform sampler2D afterImage;
uniform sampler2D candidateImage;
uniform ivec2 origin;
uniform ivec2 evidenceOffset;
out vec4 color;
${canvasPixelEquality}
void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 b=texelFetch(beforeImage,p+evidenceOffset,0),a=texelFetch(afterImage,p+evidenceOffset,0);color=!sameCanvasPixel(a,b)?b:texelFetch(candidateImage,p+origin,0);}`;
const sourceOver = `vec4 sourceOver(vec4 b,vec4 t){
 float alpha=t.a+b.a*(1.0-t.a);
 return vec4(alpha>0.0?(t.rgb*t.a+b.rgb*b.a*(1.0-t.a))/alpha:vec3(0),alpha);
}`;
export const displayFragment = (overlay: boolean) => `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D sourceImage;
uniform sampler2D candidateImage;
uniform sampler2D validFlag;
uniform ivec2 drawOrigin;
uniform ivec2 sourceOffset;
uniform int outputHeight;
out vec4 color;
${overlay ? `uniform sampler2D textImage; uniform sampler2D textValid; ${sourceOver}` : ''}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy)-drawOrigin;p.y=outputHeight-1-p.y;
 ivec2 q=p+sourceOffset;
 bool inside=all(greaterThanEqual(q,ivec2(0)))&&all(lessThan(q,textureSize(sourceImage,0)));
 vec4 source=inside?texelFetch(sourceImage,q,0):vec4(0);
 if(texelFetch(validFlag,ivec2(0),0).r<0.5){color=source;return;}
 color=texelFetch(candidateImage,p,0);
 ${overlay ? 'if(texelFetch(textValid,ivec2(0),0).r>=0.5)color=sourceOver(color,texelFetch(textImage,p,0));' : ''}
}`;
export const imageFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D inputImage;
uniform ivec2 drawOrigin;
out vec4 color;
void main(){ivec2 p=ivec2(gl_FragCoord.xy)-drawOrigin;p.y=textureSize(inputImage,0).y-1-p.y;color=texelFetch(inputImage,p,0);}`;
export const commitFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D candidateImage;
uniform sampler2D validFlag;
out vec4 color;
void main(){if(texelFetch(validFlag,ivec2(0),0).r<0.5)discard;color=texelFetch(candidateImage,ivec2(gl_FragCoord.xy),0);}`;
export const selectionFragment = `#version 300 es
precision highp float;
uniform sampler2D firstFlag;
uniform sampler2D secondFlag;
uniform int suppress;
out vec4 color;
void main(){
 float first=texelFetch(firstFlag,ivec2(0),0).r;
 if(suppress==1){if(first<0.5)discard;color=vec4(0);return;}
 color=vec4(max(first,texelFetch(secondFlag,ivec2(0),0).r));
}`;
export const overlayFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D candidateImage;
uniform sampler2D textImage;
uniform sampler2D validFlag;
out vec4 color;
${sourceOver}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);vec4 b=texelFetch(candidateImage,p,0);
 if(texelFetch(validFlag,ivec2(0),0).r<0.5){color=b;return;}
 color=sourceOver(b,texelFetch(textImage,p,0));
}`;
export const proofFragment = (diagnostics: boolean) => `#version 300 es
precision highp float;
uniform sampler2D validFlag;
out vec4 color;
${diagnostics
    ? `precision highp int; uniform int diagnosticBit; ${failureCode}
void main(){
 vec4 value=texelFetch(validFlag,ivec2(0),0);
 if(diagnosticBit<0?value.r<0.5:(failureCode(value)&(1<<diagnosticBit))==0)discard;
 color=vec4(0);
}`
    : 'void main(){if(texelFetch(validFlag,ivec2(0),0).r<0.5)discard;color=vec4(0);}'} `;
