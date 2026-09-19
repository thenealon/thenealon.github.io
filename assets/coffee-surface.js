/* Translucent espresso, rendered identically on every Canvas 2D browser.
   The only geometric input is the bootstrap lattice's infection level.
   Smoothed contours follow the state; illumination never infects a site.
   The optional lattice overlay draws the exact binary state, without smoothing. */
(function () {
  'use strict';
  var PI = Math.PI, cos = Math.cos, floor = Math.floor, max = Math.max, min = Math.min, sin = Math.sin;
  var TAU = PI * 2;
  function clamp(x, a, b) { return max(a, min(b, x)); }
  window.createCoffeeSurface = function () {
    var w=1,h=1,cols=1,rows=1,cell=30,bendX=0,bendY=0,phase=0;
    function horizontal(y) {
      return bendX*(sin(y*.0061+.3)+.26*sin(y*.014-.7)) + 2.4*sin(y*.04+phase*.42);
    }
    function vertical(x) {
      return bendY*(sin(x*.0049-1.1)+.23*sin(x*.011+.6)) + 1.7*sin(x*.043-phase*.31);
    }
    // A composition of shears is bijective and has Jacobian determinant 1.
    // Both the liquid and the exact lattice use this same embedding.
    function project(x,y) {x+=horizontal(y);return {x:x,y:y+vertical(x)};}
    function resize(width,height,c,r,px) {
      w=width;h=height;cols=c;rows=r;cell=px;phase=0;
      bendX=min(65,w*.10);bendY=min(46,h*.065);
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
          var a=value(ax,ay),b=value(bx,by),t=clamp((.5-a)/(b-a),0,1);
          var p=project((ax+.5+(bx-ax)*t)*cell,(ay+.5+(by-ay)*t)*cell);
          nodes[key]={x:p.x,y:p.y,next:[],seen:false};
        }
        return key;
      }
      for(var y=-1;y<rows;y++)for(var x=-1;x<cols;x++){
        var code=(value(x,y)>=.5?1:0)|(value(x+1,y)>=.5?2:0)|
          (value(x+1,y+1)>=.5?4:0)|(value(x,y+1)>=.5?8:0);
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
        // Infected centres remain distinct from the uninfected lattice sites.
        ctx.moveTo((p[n-1].x+p[0].x)/2,(p[n-1].y+p[0].y)/2);
        for(var i=0;i<n;i++){
          var a=p[i],b=p[(i+1)%n];
          ctx.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);
        }
        ctx.closePath();
      }
    }
    function draw(ctx,levels,time,opacity){
      phase=time;
      var loops=contours(levels);if(!loops.length||opacity<=0)return;
      ctx.save();ctx.globalAlpha=opacity;
      trace(ctx,loops);
      var body=ctx.createLinearGradient(0,0,w,h);
      body.addColorStop(0,'rgba(106,67,40,.32)');
      body.addColorStop(.44,'rgba(63,35,21,.24)');
      body.addColorStop(1,'rgba(104,64,37,.31)');
      ctx.fillStyle=body;ctx.fill('evenodd');
      ctx.save();ctx.clip('evenodd');
      // Reflections drift slowly over the liquid, independently of the
      // exact infection times. All reflected light is clipped to its pool.
      var offset=sin(time*.055)*h*.08;
      var reflection=ctx.createLinearGradient(0,-h*.3+offset,w*.7,h+offset);
      reflection.addColorStop(0,'rgba(206,175,130,0)');
      reflection.addColorStop(.29,'rgba(206,175,130,0)');
      reflection.addColorStop(.37,'rgba(206,175,130,.018)');
      reflection.addColorStop(.405,'rgba(226,201,162,.09)');
      reflection.addColorStop(.44,'rgba(180,137,88,.025)');
      reflection.addColorStop(.48,'rgba(206,175,130,0)');
      reflection.addColorStop(.73,'rgba(206,175,130,0)');
      reflection.addColorStop(.82,'rgba(210,181,143,.045)');
      reflection.addColorStop(1,'rgba(206,175,130,0)');
      ctx.fillStyle=reflection;ctx.fillRect(0,0,w,h);
      var ring=ctx.createLinearGradient(0,0,w,h);
      ring.addColorStop(0,'rgba(226,207,174,.06)');
      ring.addColorStop(.5,'rgba(160,114,64,.018)');
      ring.addColorStop(1,'rgba(216,185,134,.04)');
      ctx.strokeStyle=ring;ctx.lineWidth=1.1;
      for(var q=0;q<3;q++){
        var y=h*(.25+q*.29)+sin(time*.22+q*1.9)*12;
        ctx.beginPath();ctx.moveTo(-40,y);
        ctx.bezierCurveTo(w*.28,y-100,w*.54,y+80,w+40,y-70);
        ctx.stroke();
      }
      ctx.restore();
      // Two restrained meniscus strokes give the transparent film depth.
      trace(ctx,loops);
      var rim=ctx.createLinearGradient(0,0,w,h);
      rim.addColorStop(0,'rgba(222,203,169,.31)');
      rim.addColorStop(.34,'rgba(204,165,113,.13)');
      rim.addColorStop(.61,'rgba(95,65,40,.04)');
      rim.addColorStop(1,'rgba(212,187,149,.22)');
      ctx.strokeStyle=rim;ctx.lineWidth=1.1;ctx.stroke();
      ctx.save();ctx.translate(0,1.6);trace(ctx,loops);
      ctx.strokeStyle='rgba(7,5,3,.42)';ctx.lineWidth=1.2;ctx.stroke();ctx.restore();
      ctx.restore();
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
    function drop(ctx, seed, u) {
      if (u < 0 || u > 1 || seed.i % 7 !== 0) return;
      var target = project(seed.x,seed.y);
      var a = clamp(u,0,1), b = max(0,a-.055);
      var dx = target.x-seed.startX, dy = target.y-seed.startY;
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(192,146,92,.34)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(seed.startX+dx*b,seed.startY+dy*b*b);
      ctx.quadraticCurveTo(seed.startX+dx*(a+b)/2,seed.startY+dy*a*b,
        seed.startX+dx*a,seed.startY+dy*a*a); ctx.stroke();
      ctx.restore();
    }
    function lattice(ctx, infected, opacity) {
      ctx.save(); ctx.globalAlpha = opacity;
      ctx.strokeStyle='rgba(198,180,149,.13)'; ctx.lineWidth=.6;
      ctx.beginPath();
      for (var x=0;x<cols;x++) {
        for (var y=0;y<rows;y+=.25) {
          var p=project((x+.5)*cell,(y+.5)*cell);
          if (y===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
        }
      }
      for (var y=0;y<rows;y++) {
        for (var x=0;x<cols;x+=.25) {
          var p=project((x+.5)*cell,(y+.5)*cell);
          if (x===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
        }
      }
      ctx.stroke();
      for (var kind=0;kind<2;kind++) {
        ctx.beginPath();
        for (var i=0;i<infected.length;i++) {
          if (infected[i]!==kind) continue;
          var p=project((i%cols+.5)*cell,(floor(i/cols)+.5)*cell);
          ctx.moveTo(p.x+1.8,p.y); ctx.arc(p.x,p.y,1.8,0,TAU);
        }
        if (kind) {ctx.fillStyle='rgba(235,199,150,.85)';ctx.fill();}
        else {ctx.strokeStyle='rgba(185,181,167,.35)';ctx.lineWidth=.65;ctx.stroke();}
      }
      ctx.restore();
    }
    return {resize:resize, draw:draw, mug:mug, lip:lip, drop:drop, lattice:lattice, project:project,
      invalidate:function () {}};
  };
}());
