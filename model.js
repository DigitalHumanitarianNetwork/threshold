(function(){
T.load().then(function(runs){
  var L=T.latest(runs);var label=T.param('m');if(!label||!L.by[label])label=L.labels[0];
  document.getElementById('mname').textContent=label;document.title=label+' | Threshold | Digital Humanitarian Network';
  var ms=document.getElementById('msel'),mr=document.getElementById('mrun');
  T.opts(ms,L.labels,null,label);ms.onchange=function(){location.search='?m='+encodeURIComponent(ms.value);};
  var mine=runs.filter(function(r){return r.models.some(function(m){return m.label===label;});});
  mr.appendChild(T.el('option',{value:''},'Most recent'));mine.slice().reverse().forEach(function(r,i){mr.appendChild(T.el('option',{value:r.run_id},T.when(r)+' UTC'));});
  function draw(){
    var run=mr.value?mine.filter(function(r){return r.run_id===mr.value;})[0]:mine[mine.length-1];
    var m=run.models.filter(function(x){return x.label===label;})[0];
    document.getElementById('intro').textContent='Run '+T.when(run)+' UTC. Judge: '+run.judge+'. Field pass line: '+(run.field_threshold!=null?run.field_threshold:run.pass_threshold)+'. Single questions can have their own line.';
    var st=document.getElementById('stats');T.clear(st);
    function stat(v,l){var s=T.el('div',{'class':'stat'});s.appendChild(T.el('b',null,v));s.appendChild(T.el('span',null,l));st.appendChild(s);}
    stat(T.fmt(m.mean_score),'mean score');stat(m.pass_rate==null?'n/a':Math.round(m.pass_rate*100)+'%','of scored questions passed');stat(m.answered+' of '+run.question_count,'questions scored ('+m.errors+' without a score)');
    ['topic','diff'].forEach(function(id){var box=document.getElementById(id);T.clear(box);var o=id==='topic'?m.by_topic:m.by_difficulty;Object.keys(o||{}).forEach(function(k){T.bar(box,k,o[k].mean,o[k].n);});});
    var t=document.getElementById('qtable');T.clear(t);var hr=T.el('tr');['ID','Topic','Difficulty','Score'].forEach(function(x){hr.appendChild(T.el('th',null,x));});t.appendChild(hr);
    run.questions.forEach(function(q){var s=q.scores?q.scores[label]:null;var tr=T.el('tr');tr.appendChild(T.el('td',null,q.id));tr.appendChild(T.el('td',null,q.topic));tr.appendChild(T.el('td',null,q.difficulty));var td=T.el('td');if(s==null)td.appendChild(T.el('span',{'class':'nos'},'no score'));else td.appendChild(T.chip(s));tr.appendChild(td);t.appendChild(tr);});
  }
  mr.onchange=draw;draw();
  var pts=mine.map(function(r){return {r:r,m:r.models.filter(function(x){return x.label===label;})[0]};});
  var fl=(function(){var last=mine[mine.length-1];return last.field_threshold!=null?last.field_threshold:(last.pass_threshold!=null?last.pass_threshold:0.7);})();
  var W=640,H=220,P=36,ch=document.getElementById('chart');
  var s=T.svg('svg',{viewBox:'0 0 '+W+' '+H,'class':'line',role:'img','aria-label':'Mean score by run for '+label});
  [0,0.5,fl,1].filter(function(v,i,a){return a.indexOf(v)===i;}).forEach(function(v){var y=H-P-(H-2*P)*v;s.appendChild(T.svg('line',{x1:P,x2:W-10,y1:y,y2:y,stroke:v===fl?'#F7A823':'#E3E3E0','stroke-dasharray':v===fl?'4 3':'0'}));var tx=T.svg('text',{x:4,y:y+4,'font-size':11,fill:'#555550'});tx.textContent=String(v);s.appendChild(tx);});
  var n=pts.length,xs=function(i){return n===1?W/2:P+(W-P-20)*i/(n-1);},ys=function(v){return H-P-(H-2*P)*(v==null?0:v);};
  var d=pts.map(function(p,i){return xs(i)+','+ys(p.m.mean_score);}).join(' ');
  if(n>1)s.appendChild(T.svg('polyline',{points:d,fill:'none',stroke:'#059698','stroke-width':3}));
  pts.forEach(function(p,i){s.appendChild(T.svg('circle',{cx:xs(i),cy:ys(p.m.mean_score),r:5,fill:T.col(p.m.mean_score||0)}));var tx=T.svg('text',{x:xs(i),y:H-12,'font-size':10,fill:'#555550','text-anchor':'middle'});tx.textContent=p.r.generated_at.slice(11,16);s.appendChild(tx);});
  ch.appendChild(s);
  var h=document.getElementById('history');var hr=T.el('tr');['Run (UTC)','Scored','Mean','Passed'].forEach(function(x){hr.appendChild(T.el('th',null,x));});h.appendChild(hr);
  pts.slice().reverse().forEach(function(p){var r=T.el('tr');r.appendChild(T.el('td',null,T.when(p.r)));r.appendChild(T.el('td',null,p.m.answered+' of '+p.r.question_count));r.appendChild(T.el('td',null,T.fmt(p.m.mean_score)));r.appendChild(T.el('td',null,p.m.pass_rate==null?'n/a':Math.round(p.m.pass_rate*100)+'%'));h.appendChild(r);});
}).catch(T.fail);
})();
