/* Shared helpers. Static page: reads only the public JSON in results/. Text is always set with textContent. */
var T={NS:'http://www.w3.org/2000/svg',PAL:['#059698','#E5352B','#F7A823','#434341','#7A5CC2','#2B7DE5']};
T.el=function(t,p,x){var e=document.createElement(t);if(p)for(var k in p)e.setAttribute(k,p[k]);if(x!=null)e.textContent=x;return e;};
T.svg=function(t,p){var e=document.createElementNS(T.NS,t);if(p)for(var k in p)e.setAttribute(k,p[k]);return e;};
T.col=function(s){return s>=0.9?'#059698':s>=0.7?'#F7A823':'#E5352B';};
T.fmt=function(s){return s==null?'no score':(Math.round(s*100)/100).toFixed(2);};
T.mean=function(a){a=a.filter(function(x){return x!=null;});return a.length?a.reduce(function(s,x){return s+x;},0)/a.length:null;};
T.get=function(u){return fetch(u,{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error(u);return r.json();});};
T.chip=function(s){var c=T.el('span',{'class':'chip'},T.fmt(s));c.style.background=T.col(s);return c;};
T.clear=function(n){while(n.firstChild)n.removeChild(n.firstChild);};
T.param=function(k){var m=new RegExp('[?&]'+k+'=([^&]*)').exec(location.search);return m?decodeURIComponent(m[1].replace(/\+/g,' ')):null;};
T.when=function(d){return (d.generated_at||d.run_id).slice(0,16).replace('T',' ');};
/* all runs, oldest first */
T.load=function(){return T.get('results/index.json').then(function(ix){
  return Promise.all(ix.runs.map(function(f){return T.get('results/runs/'+f).catch(function(){return null;});}));
}).then(function(rs){rs=rs.filter(Boolean);rs.sort(function(a,b){return (a.generated_at||'')<(b.generated_at||'')?-1:1;});return rs;});};
/* label -> {run, model} for the most recent run that includes the model */
T.latest=function(runs){var o={},order=[];runs.forEach(function(r){r.models.forEach(function(m){if(!o[m.label])order.push(m.label);o[m.label]={run:r,model:m};});});return {by:o,labels:order};};
T.qscores=function(run,label,topic,diff){return run.questions.filter(function(q){return (!topic||q.topic===topic)&&(!diff||q.difficulty===diff);}).map(function(q){return q.scores?q.scores[label]:null;});};
/* pass line for a question: its own line, else the run's field line, else the old global line */
T.qline=function(run,q){return q.threshold!=null?q.threshold:(run.field_threshold!=null?run.field_threshold:(run.pass_threshold!=null?run.pass_threshold:0.7));};
T.opts=function(sel,vals,all,cur){T.clear(sel);if(all)sel.appendChild(T.el('option',{value:''},all));vals.forEach(function(v){var o=T.el('option',{value:v},v);if(v===cur)o.selected=true;sel.appendChild(o);});};
T.uniq=function(runs,k){var s={};runs.forEach(function(r){r.questions.forEach(function(q){if(q[k])s[q[k]]=1;});});return Object.keys(s);};
T.bar=function(parent,label,val,n,color){var r=T.el('div',{'class':'bar'});r.appendChild(T.el('span',null,label+(n!=null?' (n='+n+')':'')));
  var s=T.svg('svg',{viewBox:'0 0 100 22',preserveAspectRatio:'none',role:'img','aria-label':label+' '+T.fmt(val)});
  s.appendChild(T.svg('rect',{width:100,height:22,rx:3,fill:'#E3E3E0'}));
  if(val!=null)s.appendChild(T.svg('rect',{width:Math.max(0,Math.min(1,val))*100,height:22,rx:3,fill:color||T.col(val)}));
  r.appendChild(s);r.appendChild(T.el('span',{'class':'v'},T.fmt(val)));parent.appendChild(r);};
T.mlink=function(label){var a=T.el('a',{'class':'mlink',href:'model.html?m='+encodeURIComponent(label)},label);return a;};
T.fail=function(){var i=document.getElementById('intro');if(i)i.textContent='Results could not be loaded right now.';};
