(function(){
var MAXDEF=5;
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}
T.load().then(function(all){
  var topics=[];all.forEach(function(r){var f=r.field||'general';if(topics.indexOf(f)<0)topics.push(f);});
  topics.sort();
  var tsel=document.getElementById('topicsel'),box=document.getElementById('checks'),cnt=document.getElementById('count');
  var curTopic=T.param('t');if(topics.indexOf(curTopic)<0)curTopic=topics[0];
  topics.forEach(function(f){var o=T.el('option',{value:f},cap(f));if(f===curTopic)o.selected=true;tsel.appendChild(o);});
  var runs,L,order,wantParam=T.param('m');
  /* models of this topic, most recent run first (ties keep run order) */
  function setup(first){
    runs=all.filter(function(r){return (r.field||'general')===curTopic;});
    L=T.latest(runs);
    order=L.labels.map(function(l,i){return {l:l,i:i,t:L.by[l].run.generated_at||L.by[l].run.run_id};});
    order.sort(function(a,b){return a.t<b.t?1:a.t>b.t?-1:a.i-b.i;});
    var want=[];
    if(first&&wantParam)want=wantParam.split('|').filter(function(x){return L.by[x];});
    if(!want.length)want=order.slice(0,MAXDEF).map(function(o){return o.l;});
    T.clear(box);
    order.forEach(function(o){var lb=T.el('label');var cb=T.el('input',{type:'checkbox',value:o.l});cb.checked=want.indexOf(o.l)>=0;cb.onchange=draw;
      var sw=T.el('span',{'class':'sw'});sw.style.background=T.PAL[L.labels.indexOf(o.l)%T.PAL.length];
      lb.appendChild(cb);lb.appendChild(document.createTextNode(' '));lb.appendChild(sw);lb.appendChild(document.createTextNode(o.l));box.appendChild(lb);});
    document.getElementById('intro').textContent=L.labels.length===1?'Only one model has been tested on this topic so far, so there is nothing to compare yet. More models will appear here as they are added.':'Tick the models to show. The '+MAXDEF+' most recently tested are shown by default. Each model uses its most recent run.';
    document.getElementById('tools').style.display=L.labels.length>MAXDEF?'':'none';
    document.getElementById('qtitle').textContent=cap(curTopic);
    draw();
  }
  function boxes(){return Array.prototype.slice.call(box.querySelectorAll('input'));}
  function sel(){var s=boxes().filter(function(c){return c.checked;}).map(function(c){return c.value;});return order.map(function(o){return o.l;}).filter(function(l){return s.indexOf(l)>=0;});}
  function setAll(fn){boxes().forEach(function(c,i){c.checked=fn(i);});draw();}
  document.getElementById('btn-recent').onclick=function(){setAll(function(i){return i<MAXDEF;});};
  document.getElementById('btn-all').onclick=function(){setAll(function(){return true;});};
  document.getElementById('btn-none').onclick=function(){setAll(function(){return false;});};
  tsel.onchange=function(){curTopic=tsel.value;wantParam=null;setup(false);};
  function draw(){
    var ls=sel(),idx=function(l){return L.labels.indexOf(l);};
    cnt.textContent='Showing '+ls.length+' of '+L.labels.length+' models';
    var st=document.getElementById('stats');T.clear(st);
    if(!ls.length)st.appendChild(T.el('p',{'class':'lead'},'No models selected. Tick at least one model above.'));
    ls.forEach(function(l){var m=L.by[l].model,s=T.el('div',{'class':'stat'});s.style.borderTopColor=T.PAL[idx(l)%T.PAL.length];s.appendChild(T.el('b',null,T.fmt(m.mean_score)));var sp=T.el('span');sp.appendChild(T.mlink(l));sp.appendChild(document.createTextNode(': mean, '+m.answered+' of '+L.by[l].run.question_count+' scored'));s.appendChild(sp);st.appendChild(s);});
    [['topic','topic'],['diff','difficulty']].forEach(function(p){var bx=document.getElementById(p[0]);T.clear(bx);
      T.uniq(runs,p[1]).forEach(function(g){var grp=T.el('div',{'class':'grp'});grp.appendChild(T.el('b',null,g));var bars=T.el('div',{'class':'bars'});
        ls.forEach(function(l){var run=L.by[l].run,sc=run.questions.filter(function(q){return q[p[1]]===g;}).map(function(q){return q.scores?q.scores[l]:null;});T.bar(bars,l,T.mean(sc),sc.filter(function(x){return x!=null;}).length,T.PAL[idx(l)%T.PAL.length]);});grp.appendChild(bars);bx.appendChild(grp);});});
    var t=document.getElementById('qtable');T.clear(t);var hr=T.el('tr');['ID','Topic','Difficulty'].concat(ls).forEach(function(x){hr.appendChild(T.el('th',null,x));});t.appendChild(hr);
    var qs={};ls.forEach(function(l){L.by[l].run.questions.forEach(function(q){qs[q.id]=q;});});
    Object.keys(qs).sort().forEach(function(id){var q=qs[id],tr=T.el('tr');tr.appendChild(T.el('td',null,q.id));tr.appendChild(T.el('td',null,q.topic));tr.appendChild(T.el('td',null,q.difficulty));
      ls.forEach(function(l){var qq=L.by[l].run.questions.filter(function(x){return x.id===id;})[0];var s=qq&&qq.scores?qq.scores[l]:null;var td=T.el('td');if(s==null)td.appendChild(T.el('span',{'class':'nos'},'no score'));else td.appendChild(T.chip(s));tr.appendChild(td);});t.appendChild(tr);});
  }
  setup(true);
}).catch(T.fail);
})();
