(function(){
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}
T.load().then(function(all){
  var fields=[];all.forEach(function(r){var f=r.field||'general';if(fields.indexOf(f)<0)fields.push(f);});fields.sort();
  var fsel=document.getElementById('fieldsel'),cur=T.param('t');if(fields.indexOf(cur)<0)cur=fields[0];
  fields.forEach(function(f){var o=T.el('option',{value:f},cap(f));if(f===cur)o.selected=true;fsel.appendChild(o);});
  var ft=document.getElementById('ftopic'),fd=document.getElementById('fdiff');
  var runs,L,last;
  function setup(){
  runs=all.filter(function(r){return (r.field||'general')===cur;});L=T.latest(runs);last=runs[runs.length-1];
  T.opts(ft,T.uniq(runs,'topic'),'All topics');T.opts(fd,T.uniq(runs,'difficulty'),'All difficulties');
  document.getElementById('intro').textContent=cap(cur)+': '+L.labels.length+' model'+(L.labels.length===1?'':'s')+' tested across '+runs.length+' saved run'+(runs.length===1?'':'s')+'. Latest run: '+T.when(last)+' UTC. Judge: '+last.judge+'.';
  var h=document.getElementById('history');T.clear(h);var hr0=T.el('tr');['Run (UTC)','Model','Scored','Mean','Passed'].forEach(function(x){hr0.appendChild(T.el('th',null,x));});h.appendChild(hr0);
  runs.slice().reverse().forEach(function(d){d.models.forEach(function(m){var r=T.el('tr');r.appendChild(T.el('td',null,T.when(d)));var c=T.el('td');c.appendChild(T.mlink(m.label));r.appendChild(c);r.appendChild(T.el('td',null,m.answered+' of '+d.question_count));r.appendChild(T.el('td',null,T.fmt(m.mean_score)));r.appendChild(T.el('td',null,m.pass_rate==null?'n/a':Math.round(m.pass_rate*100)+'%'));h.appendChild(r);});});
  draw();}
  function draw(){
    printInfo();
    var tp=ft.value,df=fd.value;
    var b=document.getElementById('board');T.clear(b);var hr=T.el('tr');['Model','Mean score','Scored','Passed','Run'].forEach(function(x){hr.appendChild(T.el('th',null,x));});b.appendChild(hr);
    var rows=L.labels.map(function(l){var e=L.by[l],sc=T.qscores(e.run,l,tp,df),ok=sc.filter(function(x){return x!=null;});return {l:l,run:e.run,mean:T.mean(sc),n:ok.length,tot:sc.length,pass:ok.filter(function(x){return x>=e.run.pass_threshold;}).length};});
    rows.sort(function(a,b){return (b.mean==null?-1:b.mean)-(a.mean==null?-1:a.mean);});
    rows.forEach(function(r){var tr=T.el('tr');var c=T.el('td');c.appendChild(T.mlink(r.l));tr.appendChild(c);
      var m=T.el('td');var w=T.el('div',{'class':'bars'});T.bar(w,'',r.mean,null);m.appendChild(w);tr.appendChild(m);
      tr.appendChild(T.el('td',null,r.n+' of '+r.tot));tr.appendChild(T.el('td',null,r.n?Math.round(r.pass/r.n*100)+'%':'n/a'));tr.appendChild(T.el('td',null,T.when(r.run)));b.appendChild(tr);});
    var t=document.getElementById('qtable');T.clear(t);var h2=T.el('tr');['ID','Topic','Difficulty'].concat(L.labels).forEach(function(x){h2.appendChild(T.el('th',null,x));});t.appendChild(h2);
    var qs={};L.labels.forEach(function(l){L.by[l].run.questions.forEach(function(q){qs[q.id]=q;});});
    Object.keys(qs).sort().forEach(function(id){var q=qs[id];if((tp&&q.topic!==tp)||(df&&q.difficulty!==df))return;
      var tr=T.el('tr');tr.appendChild(T.el('td',null,q.id));tr.appendChild(T.el('td',null,q.topic));tr.appendChild(T.el('td',null,q.difficulty));
      L.labels.forEach(function(l){var run=L.by[l].run,qq=run.questions.filter(function(x){return x.id===id;})[0];var s=qq&&qq.scores?qq.scores[l]:null;var td=T.el('td');if(s==null)td.appendChild(T.el('span',{'class':'nos'},'no score'));else td.appendChild(T.chip(s));tr.appendChild(td);});t.appendChild(tr);});
  }
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function printInfo(){var d=new Date();
    document.getElementById('p-field').textContent=cap(cur);
    document.getElementById('p-topic').textContent=ft.value||'All topics';
    document.getElementById('p-diff').textContent=fd.value||'All difficulties';
    document.getElementById('p-date').textContent=d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear();
    document.getElementById('p-url').textContent=location.host+location.pathname;}
  var oldTitle=document.title;
  window.addEventListener('beforeprint',function(){printInfo();document.title='Threshold - Results - '+cap(cur)+' - '+new Date().toISOString().slice(0,10);});
  window.addEventListener('afterprint',function(){document.title=oldTitle;});
  document.getElementById('btn-pdf').onclick=function(){window.print();};
  ft.onchange=draw;fd.onchange=draw;fsel.onchange=function(){cur=fsel.value;setup();};setup();
}).catch(T.fail);
})();
