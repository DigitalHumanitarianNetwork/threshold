(function(){
T.load().then(function(runs){
  var L=T.latest(runs);var want=(T.param('m')||'').split('|').filter(function(x){return L.by[x];});if(want.length<1)want=L.labels.slice();
  var box=document.getElementById('checks');
  L.labels.forEach(function(l,i){var lb=T.el('label');var cb=T.el('input',{type:'checkbox',value:l});cb.checked=want.indexOf(l)>=0;cb.onchange=draw;var sw=T.el('span',{'class':'sw'});sw.style.background=T.PAL[i%T.PAL.length];lb.appendChild(cb);lb.appendChild(document.createTextNode(' '));lb.appendChild(sw);lb.appendChild(document.createTextNode(l));box.appendChild(lb);});
  document.getElementById('intro').textContent=L.labels.length===1?'Only one model has been tested so far, so there is nothing to compare yet. More models will appear here as they are added.':'Tick the models to compare. Each model uses its most recent run.';
  function sel(){return Array.prototype.filter.call(box.querySelectorAll('input'),function(c){return c.checked;}).map(function(c){return c.value;});}
  function draw(){
    var ls=sel(),idx=function(l){return L.labels.indexOf(l);};
    var st=document.getElementById('stats');T.clear(st);
    ls.forEach(function(l){var m=L.by[l].model,s=T.el('div',{'class':'stat'});s.style.borderTopColor=T.PAL[idx(l)%T.PAL.length];s.appendChild(T.el('b',null,T.fmt(m.mean_score)));var sp=T.el('span');sp.appendChild(T.mlink(l));sp.appendChild(document.createTextNode(': mean, '+m.answered+' of '+L.by[l].run.question_count+' scored'));s.appendChild(sp);st.appendChild(s);});
    [['topic','topic'],['diff','difficulty']].forEach(function(p){var bx=document.getElementById(p[0]);T.clear(bx);
      T.uniq(runs,p[1]).forEach(function(g){var grp=T.el('div',{'class':'grp'});grp.appendChild(T.el('b',null,g));var bars=T.el('div',{'class':'bars'});
        ls.forEach(function(l){var run=L.by[l].run,sc=run.questions.filter(function(q){return q[p[1]]===g;}).map(function(q){return q.scores?q.scores[l]:null;});T.bar(bars,l,T.mean(sc),sc.filter(function(x){return x!=null;}).length,T.PAL[idx(l)%T.PAL.length]);});grp.appendChild(bars);bx.appendChild(grp);});});
    var t=document.getElementById('qtable');T.clear(t);var hr=T.el('tr');['ID','Topic','Difficulty'].concat(ls).forEach(function(x){hr.appendChild(T.el('th',null,x));});t.appendChild(hr);
    var qs={};ls.forEach(function(l){L.by[l].run.questions.forEach(function(q){qs[q.id]=q;});});
    Object.keys(qs).sort().forEach(function(id){var q=qs[id],tr=T.el('tr');tr.appendChild(T.el('td',null,q.id));tr.appendChild(T.el('td',null,q.topic));tr.appendChild(T.el('td',null,q.difficulty));
      ls.forEach(function(l){var qq=L.by[l].run.questions.filter(function(x){return x.id===id;})[0];var s=qq&&qq.scores?qq.scores[l]:null;var td=T.el('td');if(s==null)td.appendChild(T.el('span',{'class':'nos'},'no score'));else td.appendChild(T.chip(s));tr.appendChild(td);});t.appendChild(tr);});
  }
  draw();
}).catch(T.fail);
})();
