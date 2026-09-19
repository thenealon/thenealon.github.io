/* The binary bootstrap process owns every infection. This renderer only
   draws it: a volume-preserving moving embedding, a damped surface-wave
   equation, and advected colour. None of these fields feeds back into A_t. */
(function () {
  'use strict';
  var sin=Math.sin, cos=Math.cos, sqrt=Math.sqrt, exp=Math.exp, pow=Math.pow,
      min=Math.min, max=Math.max, floor=Math.floor, round=Math.round, PI=Math.PI, TAU=2*Math.PI;
  function clamp(v,a,b){return max(a,min(b,v));}
  function smooth(a,b,v){v=clamp((v-a)/(b-a),0,1);return v*v*(3-2*v);}
  var VERTEX=`attribute vec2 aPosition;
  varying vec2 vUV;
  void main(){vUV=vec2(aPosition.x*.5+.5,.5-aPosition.y*.5);gl_Position=vec4(aPosition,0.,1.);}`;
  var FRAGMENT=`#extension GL_OES_standard_derivatives : enable
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D uState;
  uniform vec2 uSize,uGrid;
  uniform float uCell,uTime,uOpacity,uScale;
  // Inverse of the three shears used by project(). Determinant = 1.
  vec2 material(vec2 p){
    float t=uTime;
    p.x-=10.*sin(p.y*.025+t*.74);
    p.y-=23.*sin(p.x*.012-t*.59)+8.*sin(p.x*.035+t*.93)+11.*sin(t*.66);
    p.x-=30.*sin(p.y*.011+t*.57)+12.*sin(p.y*.029-t*.81)+18.*sin(t*.48);
    return p;
  }
  vec4 field(vec2 q){
    vec2 p=q-.5,i=floor(p),f=fract(p);
    vec2 w0=pow(1.-f,vec2(3.))/6.;
    vec2 w1=(3.*f*f*f-6.*f*f+4.)/6.;
    vec2 w2=(-3.*f*f*f+3.*f*f+3.*f+1.)/6.;
    vec2 w3=f*f*f/6.;
    vec2 g0=w0+w1,g1=w2+w3;
    vec2 h0=(i-.5+w1/g0)/uGrid,h1=(i+1.5+w3/g1)/uGrid;
    return mix(mix(texture2D(uState,h0),texture2D(uState,vec2(h1.x,h0.y)),g1.x),
      mix(texture2D(uState,vec2(h0.x,h1.y)),texture2D(uState,h1),g1.x),g1.y);
  }
  float heightAt(vec2 q,vec4 data){
    float depth=smoothstep(.23,.88,data.r);
    // Large travelling waves, capillary waves, and actual splash waves.
    float wave=(data.g*255.-128.)/20.;
    wave+=1.30*sin(q.x*.035+q.y*.015-uTime*1.6);
    wave+=.72*sin(q.y*.055-q.x*.012+uTime*1.9);
    wave+=.35*sin(q.x*.086+q.y*.069-uTime*2.7);
    return 5.2*depth+wave*(.4+.6*depth);
  }
  void main(){
    vec2 p=vUV*uSize,q=material(p);
    vec4 data=field(q/uCell);
    float f=data.r;
    float aa=max(.004,fwidth(f)*.8);
    float mask=smoothstep(.235-aa,.235+aa,f);
    float depth=smoothstep(.23,.88,f);
    float z=heightAt(q,data),e=2./max(.8,uScale);
    vec2 qx=material(p+vec2(e,0.)),qy=material(p+vec2(0.,e));
    // A finite footprint prevents fine reflections from sparkling at an edge.
    vec3 n=normalize(vec3((z-heightAt(qx,field(qx/uCell)))/e,
                         (z-heightAt(qy,field(qy/uCell)))/e,1.));
    vec2 r=n.xy/max(.25,n.z);
    // Reflected soft boxes: narrow bright folds move with the surface normal.
    float wa=max(.027,1.2*fwidth(r.y)),wb=max(.045,1.2*fwidth(r.x));
    float a=exp(-pow((r.x+.075)/.21,4.)-pow((r.y+.080)/wa,2.))*sqrt(.027/wa);
    float b=exp(-pow((r.x-.12)/wb,2.)-pow((r.y-.01)/.32,4.))*sqrt(.045/wb);
    float broad=exp(-dot(r+vec2(.1,.07),r+vec2(.1,.07))*8.);
    vec3 thin=vec3(.30,.145,.059),deep=vec3(.066,.028,.012);
    vec3 color=mix(thin,deep,depth);
    color*=.85+data.b*.4;
    color+=vec3(.62,.56,.44)*a*.62;
    color+=vec3(.49,.56,.57)*b*.14;
    color+=vec3(.055,.036,.020)*broad;
    // Absorption leaves a transparent amber edge and a darker thick centre.
    float alpha=mix(.62,.88,depth)*mask*uOpacity;
    gl_FragColor=vec4(color,alpha);
  }`;

  window.createCoffeeSurface=function(){
    var surface=document.createElement('canvas'),gl=null,program=null,texture=null,uniforms={},floatTexture=false;
    var w=1,h=1,cols=1,rows=1,cell=14,scale=1,phase=0,lastTime=-1;
    var pixels,heights,velocities,previous,dye,dyeNext;
    var fallback=null,fc=null,fw=1,fh=1,frame,ff,fz,fd,filtered,blurPass;
    function compile(type,src){
      var shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    function setup(){
      try{
        gl=surface.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
        if(!gl||!gl.getExtension('OES_standard_derivatives')){gl=null;return;}
        floatTexture=!!(gl.getExtension('OES_texture_float')&&gl.getExtension('OES_texture_float_linear'));
        // Float interpolation avoids quantized, sparkling surface normals.
        // The software path stays smooth on hardware without this support.
        if(!floatTexture){gl=null;return;}
        var vs=compile(gl.VERTEX_SHADER,VERTEX),fs=compile(gl.FRAGMENT_SHADER,FRAGMENT);
        program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
        gl.deleteShader(vs);gl.deleteShader(fs);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        var buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
        var a=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
        ['uState','uSize','uGrid','uCell','uTime','uOpacity','uScale'].forEach(function(name){uniforms[name]=gl.getUniformLocation(program,name);});
        texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.uniform1i(uniforms.uState,0);
      }catch(e){console.warn('Coffee surface: using software rendering.',e.message);gl=null;}
    }
    setup();
    surface.addEventListener('webglcontextlost',function(e){e.preventDefault();gl=null;});
    surface.addEventListener('webglcontextrestored',function(){
      setup();pixels=floatTexture?new Float32Array(cols*rows*4):new Uint8Array(cols*rows*4);allocateTexture();
    });
    function allocateTexture(){
      if(!gl||!pixels)return;
      gl.viewport(0,0,surface.width,surface.height);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,cols,rows,0,gl.RGBA,floatTexture?gl.FLOAT:gl.UNSIGNED_BYTE,pixels);
      gl.uniform2f(uniforms.uSize,w,h);gl.uniform2f(uniforms.uGrid,cols,rows);gl.uniform1f(uniforms.uCell,cell);gl.uniform1f(uniforms.uScale,scale);
    }
    function resize(width,height,c,r,px){
      w=width;h=height;cols=c;rows=r;cell=px;
      var n=c*r;pixels=floatTexture?new Float32Array(n*4):new Uint8Array(n*4);heights=new Float32Array(n);velocities=new Float32Array(n);
      filtered=new Float32Array(n);blurPass=new Float32Array(n);
      previous=new Float32Array(n);dye=new Float32Array(n);dyeNext=new Float32Array(n);
      scale=min(window.devicePixelRatio||1,1.2,sqrt(850000/max(1,w*h)));
      surface.width=max(1,Math.round(w*scale));surface.height=max(1,Math.round(h*scale));allocateTexture();
      var softScale=min(.5,sqrt(28000/max(1,w*h)));
      fw=max(3,Math.round(w*softScale));fh=max(3,Math.round(h*softScale));
      fallback=null;ff=new Float32Array(fw*fh);fz=new Float32Array(fw*fh);fd=new Float32Array(fw*fh);
      reset();
    }
    function reset(){
      if(!heights)return;
      heights.fill(0);velocities.fill(0);previous.fill(0);lastTime=-1;
      for(var y=0;y<rows;y++)for(var x=0;x<cols;x++)dye[y*cols+x]=.5+.24*sin(x*.47+sin(y*.31)*3)*cos(y*.41);
    }
    // This moving, area-preserving embedding changes geometry, never adjacency.
    function project(x,y,t){
      t=t===undefined?phase:t;
      x+=30*sin(y*.011+t*.57)+12*sin(y*.029-t*.81)+18*sin(t*.48);
      y+=23*sin(x*.012-t*.59)+8*sin(x*.035+t*.93)+11*sin(t*.66);
      x+=10*sin(y*.025+t*.74);
      return {x:x,y:y};
    }
    function material(x,y,t){
      x-=10*sin(y*.025+t*.74);
      y-=23*sin(x*.012-t*.59)+8*sin(x*.035+t*.93)+11*sin(t*.66);
      x-=30*sin(y*.011+t*.57)+12*sin(y*.029-t*.81)+18*sin(t*.48);
      return {x:x,y:y};
    }
    function sample(a,x,y){
      x=clamp(x,0,cols-1);y=clamp(y,0,rows-1);
      var ix=floor(x),iy=floor(y),fx=x-ix,fy=y-iy,j=iy*cols+ix;
      var r=ix<cols-1?1:0,b=iy<rows-1?cols:0;
      return (a[j]*(1-fx)+a[j+r]*fx)*(1-fy)+(a[j+b]*(1-fx)+a[j+b+r]*fx)*fy;
    }
    function cubic(a,x,y){
      var ix=floor(x),iy=floor(y),fx=x-ix,fy=y-iy;
      var wx0=pow(1-fx,3)/6,wx1=(3*fx*fx*fx-6*fx*fx+4)/6,
          wx2=(-3*fx*fx*fx+3*fx*fx+3*fx+1)/6,wx3=fx*fx*fx/6;
      var x0=clamp(ix-1,0,cols-1),x1=clamp(ix,0,cols-1),x2=clamp(ix+1,0,cols-1),x3=clamp(ix+2,0,cols-1);
      var value=0;
      for(var k=0;k<4;k++){
        var row=clamp(iy+k-1,0,rows-1)*cols;
        var wy=k===0?pow(1-fy,3)/6:k===1?(3*fy*fy*fy-6*fy*fy+4)/6:k===2?(-3*fy*fy*fy+3*fy*fy+3*fy+1)/6:fy*fy*fy/6;
        value+=(a[row+x0]*wx0+a[row+x1]*wx1+a[row+x2]*wx2+a[row+x3]*wx3)*wy;
      }
      return value;
    }
    function evolve(levels,time){
      var dt=lastTime<0?0:clamp(time-lastTime,0,.06);lastTime=time;
      for(var i=0;i<levels.length;i++){
        velocities[i]+=max(0,levels[i]-previous[i])*8;
        previous[i]=levels[i];
      }
      var steps=Math.ceil(dt/(1/120)),ds=steps?dt/steps:0;
      var damping=exp(-ds*.8),windX=7*sin(time*.9),windY=7*cos(time*.73);
      for(var s=0;s<steps;s++){
        for(var y=0;y<rows;y++)for(var x=0;x<cols;x++){
          var i=y*cols+x;
          if(levels[i]<.015){heights[i]=0;velocities[i]=0;continue;}
          var z=heights[i],l=x>0&&levels[i-1]>.015,r=x<cols-1&&levels[i+1]>.015,
            u=y>0&&levels[i-cols]>.015,d=y<rows-1&&levels[i+cols]>.015;
          var lap=(l?heights[i-1]:z)+(r?heights[i+1]:z)+(u?heights[i-cols]:z)+(d?heights[i+cols]:z)-4*z;
          var slosh=windX*((l?1:0)-(r?1:0))+windY*((u?1:0)-(d?1:0));
          velocities[i]=(velocities[i]+ds*(4900/(cell*cell)*lap-z*1.4+slosh))*damping;
        }
        for(var i=0;i<levels.length;i++)heights[i]=clamp(heights[i]+velocities[i]*ds,-5,5);
      }
      if(dt){
        for(var y=0;y<rows;y++)for(var x=0;x<cols;x++){
          // Incompressible colour transport: vx(y), vy(x); zero divergence.
          var vx=16*sin(y*cell*.019+time*.5),vy=12*cos(x*cell*.023-time*.4);
          dyeNext[y*cols+x]=sample(dye,x-vx*dt/cell,y-vy*dt/cell);
        }
        var swap=dye;dye=dyeNext;dyeNext=swap;
      }
      if(gl)for(var i=0;i<levels.length;i++){
        var j=i*4;
        if(floatTexture){pixels[j]=levels[i];pixels[j+1]=(128+heights[i]*20)/255;pixels[j+2]=dye[i];pixels[j+3]=1;}
        else{pixels[j]=round(levels[i]*255);pixels[j+1]=clamp(round(128+heights[i]*20),0,255);pixels[j+2]=round(dye[i]*255);pixels[j+3]=255;}
      }
    }
    function splash(x,y,strength){
      var cx=floor(x/cell),cy=floor(y/cell);
      for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++){
        var xx=cx+dx,yy=cy+dy;
        if(xx>=0&&yy>=0&&xx<cols&&yy<rows)velocities[yy*cols+xx]+=strength*exp(-(dx*dx+dy*dy)*.7)*12;
      }
    }
    var cases=[[],[[3,0]],[[0,1]],[[3,1]],[[1,2]],[[3,0],[1,2]],
      [[0,2]],[[3,2]],[[2,3]],[[0,2]],[[0,1],[2,3]],[[1,2]],
      [[1,3]],[[0,1]],[[3,0]],[]];
    function contours(levels) {
      var nodes=Object.create(null),loops=[];
      function value(x,y){return x<0||y<0||x>=cols||y>=rows ? 0 : levels[y*cols+x];}
      function edge(x,y,e) {
        var ax=x,ay=y,bx=x,by=y,key;
        if(e===0){bx++;key='h'+x+','+y;}
        if(e===1){ax++;bx++;by++;key='v'+(x+1)+','+y;}
        if(e===2){ay++;by++;bx++;key='h'+x+','+(y+1);}
        if(e===3){by++;key='v'+x+','+y;}
        if(!nodes[key]){
          var a=value(ax,ay),b=value(bx,by),t=clamp((.235-a)/(b-a),0,1);
          var p=project((ax+.5+(bx-ax)*t)*cell,(ay+.5+(by-ay)*t)*cell);
          nodes[key]={x:p.x,y:p.y,next:[],seen:false};
        }
        return key;
      }
      for(var y=-1;y<rows;y++)for(var x=-1;x<cols;x++){
        var code=(value(x,y)>=.235?1:0)|(value(x+1,y)>=.235?2:0)|
          (value(x+1,y+1)>=.235?4:0)|(value(x,y+1)>=.235?8:0);
        var pairs=cases[code];
        for(var j=0;j<pairs.length;j++){
          var a=edge(x,y,pairs[j][0]),b=edge(x,y,pairs[j][1]);
          nodes[a].next.push(b);nodes[b].next.push(a);
        }
      }
      for(var key in nodes){
        if(nodes[key].seen)continue;
        var line=[],at=key,previous=null;
        while(!nodes[at].seen){
          var node=nodes[at];node.seen=true;line.push(node);
          var next=node.next[0]===previous?node.next[1]:node.next[0];
          previous=at;at=next;
          if(!at)break;
        }
        if(line.length>=3)loops.push(line);
      }
      return loops;
    }
    function trace(ctx,loops){
      ctx.beginPath();
      for(var j=0;j<loops.length;j++){
        var p=loops[j],n=p.length;
        // Quadratic corner rounding stays within the local convex hull.
        // This only rounds the displayed density contour.
        ctx.moveTo((p[n-1].x+p[0].x)/2,(p[n-1].y+p[0].y)/2);
        for(var i=0;i<n;i++){
          var a=p[i],b=p[(i+1)%n];
          ctx.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);
        }
        ctx.closePath();
      }
    }
    // Same moving surface and reflected lighting when WebGL is unavailable.
    // A small software framebuffer bounds CPU work on older devices.
    function drawFallback(ctx,levels,time,opacity){
      if(!fallback){fallback=document.createElement('canvas');fallback.width=fw;fallback.height=fh;fc=fallback.getContext('2d');frame=fc.createImageData(fw,fh);}
      // Reconstruct the density before shading. Filtering in material space
      // gives small drops the same round, merging silhouette as the GPU path.
      for(var y=0;y<rows;y++)for(var x=0;x<cols;x++){
        var i=y*cols+x;
        blurPass[i]=(levels[i-(x>0?1:0)]+4*levels[i]+levels[i+(x<cols-1?1:0)])/6;
      }
      for(var y=0;y<rows;y++)for(var x=0;x<cols;x++){
        var i=y*cols+x;
        filtered[i]=(blurPass[i-(y>0?cols:0)]+4*blurPass[i]+blurPass[i+(y<rows-1?cols:0)])/6;
      }
      var loops=contours(filtered);
      var sx=w/fw,sy=h/fh;
      for(var y=0;y<fh;y++)for(var x=0;x<fw;x++){
        var i=y*fw+x,q=material((x+.5)*sx,(y+.5)*sy,time),gx=q.x/cell-.5,gy=q.y/cell-.5;
        var f=cubic(levels,gx,gy),depth=smooth(.23,.88,f);
        ff[i]=f;fd[i]=sample(dye,gx,gy);
        var wave=sample(heights,gx,gy)+1.3*sin(q.x*.035+q.y*.015-time*1.6)+.72*sin(q.y*.055-q.x*.012+time*1.9)+.35*sin(q.x*.086+q.y*.069-time*2.7);
        fz[i]=5.2*depth+wave*(.4+.6*depth);
      }
      var out=frame.data;
      for(var y=0;y<fh;y++)for(var x=0;x<fw;x++){
        var i=y*fw+x,j=i*4,f=ff[i],depth=smooth(.23,.88,f);
        var l=i-(x>0?1:0),r=i+(x<fw-1?1:0),u=i-(y>0?fw:0),d=i+(y<fh-1?fw:0);
        var nx=-(fz[r]-fz[l])/(2*sx),ny=-(fz[d]-fz[u])/(2*sy);
        var a=exp(-pow((nx+.075)/.21,4)-pow((ny+.080)/.040,2))*.72;
        var b=exp(-pow((nx-.12)/.045,2)-pow((ny-.01)/.32,4));
        var broad=exp(-((nx+.1)*(nx+.1)+(ny+.07)*(ny+.07))*8),tint=.85+fd[i]*.4;
        out[j]=255*((.30+(.066-.30)*depth)*tint+.62*a*.62+.49*b*.14+.055*broad);
        out[j+1]=255*((.145+(.028-.145)*depth)*tint+.56*a*.62+.56*b*.14+.036*broad);
        out[j+2]=255*((.059+(.012-.059)*depth)*tint+.44*a*.62+.57*b*.14+.020*broad);
        out[j+3]=255*(.62+.26*depth)*opacity;
      }
      // The moving silhouette is clipped at native display resolution;
      // only the smooth interior reflections use the small framebuffer.
      fc.putImageData(frame,0,0);ctx.save();trace(ctx,loops);ctx.clip('evenodd');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(fallback,0,0,w,h);ctx.restore();
    }
    var pointerX=null,pointerY=null;
    function stir(x,y,time){
      if(pointerX!==null){
        var distance=Math.hypot(x-pointerX,y-pointerY);
        if(distance>.5&&distance<180){var q=material(x,y,time);splash(q.x,q.y,min(1.4,distance*.035));}
      }
      pointerX=x;pointerY=y;
    }
    function draw(ctx,levels,time,opacity){
      phase=time;evolve(levels,time);
      if(ctx.canvas&&ctx.canvas.setAttribute){
        var renderer=gl?'webgl':'software';
        if(ctx.canvas.getAttribute('data-liquid-renderer')!==renderer)ctx.canvas.setAttribute('data-liquid-renderer',renderer);
      }
      if(!gl){drawFallback(ctx,levels,time,opacity);return;}
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,cols,rows,gl.RGBA,floatTexture?gl.FLOAT:gl.UNSIGNED_BYTE,pixels);
      gl.uniform1f(uniforms.uTime,time);gl.uniform1f(uniforms.uOpacity,opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);ctx.drawImage(surface,0,0,w,h);
    }
    function cupPath(ctx) {
      ctx.beginPath(); ctx.moveTo(-20, -17);
      ctx.bezierCurveTo(-19, -5, -17, 13, -15, 20);
      ctx.bezierCurveTo(-12, 27, 12, 27, 15, 20);
      ctx.bezierCurveTo(17, 13, 19, -5, 20, -17);
      ctx.bezierCurveTo(12, -11, -12, -11, -20, -17); ctx.closePath();
    }
    function mug(ctx, x, y, tilt, opacity, amount) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(.85, .85);
      ctx.globalAlpha = opacity === undefined ? 1 : opacity;
      // A double-walled glass handle, continuous with the cup's silhouette.
      ctx.beginPath(); ctx.moveTo(-19, -10);
      ctx.bezierCurveTo(-44, -17, -44, 20, -16, 15);
      ctx.strokeStyle = 'rgba(175,188,190,.22)'; ctx.lineWidth = 5.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(232,237,229,.48)'; ctx.lineWidth = .8; ctx.stroke();
      cupPath(ctx);
      var glass = ctx.createLinearGradient(-23, 0, 23, 0);
      glass.addColorStop(0, 'rgba(214,225,217,.17)');
      glass.addColorStop(.18, 'rgba(164,177,170,.035)');
      glass.addColorStop(.73, 'rgba(164,177,170,.055)');
      glass.addColorStop(1, 'rgba(214,225,217,.22)');
      ctx.fillStyle = glass; ctx.fill();
      ctx.strokeStyle = 'rgba(209,220,213,.35)'; ctx.lineWidth = .9; ctx.stroke();
      ctx.save(); ctx.clip();
      // The liquid surface stays level as the glass tips, and the level
      // falls through the pour. Geometry is still the same vector cup.
      ctx.rotate(-tilt);
      var level = -5 + (1-(amount === undefined ? 1 : amount))*15;
      var espresso = ctx.createLinearGradient(0,level,0,35);
      espresso.addColorStop(0,'rgba(151,99,59,.73)');
      espresso.addColorStop(.22,'rgba(90,47,24,.76)');
      espresso.addColorStop(1,'rgba(34,20,12,.86)');
      ctx.fillStyle = espresso; ctx.fillRect(-50,level,100,70);
      ctx.strokeStyle = 'rgba(214,171,117,.50)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-45,level); ctx.lineTo(45,level); ctx.stroke();
      ctx.restore();
      // Fine rim and a single soft-box reflection, not a white cartoon fill.
      ctx.beginPath(); ctx.ellipse(0,-17,20,6.2,0,0,TAU);
      ctx.strokeStyle = 'rgba(235,240,229,.6)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0,-17,17.5,4.5,0,PI,TAU);
      ctx.strokeStyle = 'rgba(235,240,229,.22)'; ctx.lineWidth = .7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-15,-9); ctx.bezierCurveTo(-14,0,-13,10,-11,16);
      ctx.strokeStyle = 'rgba(239,241,224,.35)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0,21,12,2.4,0,0,PI);
      ctx.strokeStyle = 'rgba(227,231,214,.24)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    function lip(x, y, tilt) {
      return {x:x+.85*(19*cos(tilt)+17*sin(tilt)),
        y:y+.85*(19*sin(tilt)-17*cos(tilt))};
    }

    function drop(ctx,seed,u,time){
      if(seed.i%4!==0||u<0||u>1.4)return;
      var target=project(seed.x,seed.y,time);
      ctx.save();
      if(u<1){
        var dx=target.x-seed.startX,dy=target.y-seed.startY,b=max(0,u-.10);
        ctx.strokeStyle='rgba(138,85,46,.68)';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();
        ctx.moveTo(seed.startX+dx*b,seed.startY+dy*b*b);
        ctx.quadraticCurveTo(seed.startX+dx*(b+u)*.5,seed.startY+dy*b*u,seed.startX+dx*u,seed.startY+dy*u*u);ctx.stroke();
      }else{
        var a=(u-1)/.4;
        ctx.strokeStyle='rgba(202,172,127,'+(1-a)*.18+')';ctx.lineWidth=.8;ctx.beginPath();
        ctx.ellipse(target.x,target.y,3+a*17,2+a*10,0,0,TAU);ctx.stroke();
      }
      ctx.restore();
    }
    function pour(ctx,x,y,tilt,amount,time){
      var start=lip(x,y,tilt),length=25+8*sin(time*2.1),bend=4*sin(time*3.4);
      ctx.save();ctx.lineCap='round';
      var gradient=ctx.createLinearGradient(start.x,start.y,start.x,start.y+length);
      gradient.addColorStop(0,'rgba(123,76,40,.82)');gradient.addColorStop(.55,'rgba(107,62,30,.74)');gradient.addColorStop(1,'rgba(128,83,42,0)');
      ctx.strokeStyle=gradient;ctx.lineWidth=2.7*amount;ctx.beginPath();ctx.moveTo(start.x,start.y);
      ctx.bezierCurveTo(start.x+4,start.y+9,start.x+bend,start.y+length*.7,start.x+bend,start.y+length);ctx.stroke();
      ctx.restore();
    }
    return {resize:resize,draw:draw,mug:mug,lip:lip,drop:drop,pour:pour,splash:splash,stir:stir,reset:reset,project:project};
  };
}());
