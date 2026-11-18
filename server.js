'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');
const questions = require('./questions.json');
const PORT = Number(process.env.PORT || 3000);
const DB_NAME = process.env.MONGODB_DB_NAME || 'bayroq_quest';
let dbPromise;
const publicQuestions = questions.map((q,id)=>({id,text:q[0],choices:q[1]}));
function getDatabase(){
 if(!process.env.MONGODB_URI) throw Object.assign(new Error('MongoDB Atlas hali ulanmagan (MONGODB_URI kerak)'),{status:503});
 if(!dbPromise) dbPromise=(async()=>{
  const client = new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:7000,maxPoolSize:12,appName:'bayroq-quest'});
  try{
   await client.connect();
   const db = client.db(DB_NAME);
   await db.collection('attempts').createIndex({status:1,score:-1,finishedAt:1});
   await db.collection('attempts').createIndex({nameKey:1,groupKey:1});
   return db;
  }catch(e){await client.close().catch(()=>{});throw e;}
 })().catch(err=>{dbPromise=undefined;throw err});
 return dbPromise;
}
function send(res,code,data){
 res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(data));
}
async function body(req){
 return new Promise((resolve,reject)=>{
  let chunks='',size=0;
  req.on('data',b=>{size+=b.length;if(size>12000){reject(Object.assign(new Error('So‘rov juda katta'),{status:413}));req.destroy();return}chunks+=b.toString()});
  req.on('end',()=>{try{resolve(JSON.parse(chunks||'{}'))}catch(e){reject(Object.assign(new Error('Noto‘g‘ri JSON'),{status:400}))}});
  req.on('error',reject);
 });
}
const rates = new Map();
function rateLimit(req){
 let ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0];
 const now=Date.now();let r=rates.get(ip);
 if(!r||now-r.start>3600000)r={start:now,count:0};
 r.count++;rates.set(ip,r);
 if(r.count>120)throw Object.assign(new Error('Juda ko‘p so‘rov. Keyinroq urinib ko‘ring.'),{status:429});
 if(rates.size>5000)for(const [k,v] of rates)if(now-v.start>3600000)rates.delete(k);
}
function canonical(s,max=80){return typeof s==='string'?s.trim().replace(/\s+/g,' ').slice(0,max):''}
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=crypto.randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
// Generate a balanced answer-key position distribution: 25 questions = 6/6/6/7.
// Prevent long runs of the same correct answer position for fair gameplay.
function makeOptionOrders(questionOrder){
 const n=questionOrder.length;
 const slots=Array.from({length:Math.floor(n/4)},()=>[0,1,2,3]).flat();
 const extra=shuffle([0,1,2,3]).slice(0,n%4);
 const bag=[...slots,...extra];
 let positions;
 for(let attempt=0;attempt<300;attempt++){
  positions=shuffle([...bag]);
  if(!positions.some((p,i)=>i>=2&&p===positions[i-1]&&p===positions[i-2]))break;
 }
 return questionOrder.map((questionId,i)=>{
  const originalCorrect=questions[questionId][2];
  const order=shuffle([0,1,2,3].filter(n=>n!==originalCorrect));
  order.splice(positions[i],0,originalCorrect);
  return order;
 });
}
function choicesFor(s){
 if(s.status!=='active'||s.index>=questions.length)return null;
 const q=questions[s.order[s.index]];
 const indices=s.optionOrders?.[s.index]||[0,1,2,3];
 return indices.map(i=>q[1][i]);
}
function sessionPublic(s){return {sessionId:s._id,fullName:s.fullName,group:s.group,timeLimit:s.timeLimit,order:s.order,index:s.index,score:s.score,correct:s.correct,wrong:s.wrong,streak:s.streak,maxStreak:s.maxStreak,status:s.status,questionAt:s.questionAt,finishedAt:s.finishedAt,choices:choicesFor(s)};}
async function handler(req,res){
 const u=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/index.html')){
  fs.readFile(path.join(__dirname,'index.html'),(err,buf)=>{
   if(err){res.writeHead(500);return res.end('Internal error')}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=120','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'"});res.end(buf);
  });return;
 }
 if(req.method==='GET'&&u.pathname==='/health')return send(res,200,{ok:true,storageConfigured:!!process.env.MONGODB_URI});
 if(req.method==='GET'&&u.pathname==='/api/questions')return send(res,200,{questions:publicQuestions});
 if(req.method==='GET'&&u.pathname==='/api/status'){try{await getDatabase();return send(res,200,{ready:true})}catch(e){return send(res,503,{ready:false,message:'Doimiy baza hozircha ulanmagan. MongoDB Atlas konfiguratsiyasini tekshiring.'})}}
 if(req.method==='GET'&&u.pathname==='/api/leaderboard'){
  const db=await getDatabase();
  const items=await db.collection('attempts').aggregate([
   {$match:{status:'finished'}},
   {$sort:{score:-1,finishedAt:1}},
   {$group:{_id:{nameKey:'$nameKey',groupKey:'$groupKey'},best:{$first:'$$ROOT'}}},
   {$replaceRoot:{newRoot:'$best'}},
   {$sort:{score:-1,finishedAt:1}},
   {$limit:100},
   {$project:{_id:0,fullName:1,group:1,score:1,correct:1,wrong:1,maxStreak:1,finishedAt:1}}
  ]).toArray();
  return send(res,200,{items:items.map((x,i)=>({...x,rank:i+1}))});
 }
 if(req.method==='GET'&&u.pathname==='/api/session'){
  const id=u.searchParams.get('id');
  if(!id||!/^[0-9a-f-]{36}$/.test(id))return send(res,400,{error:'Noto‘g‘ri ID'});
  const db=await getDatabase();const s=await db.collection('attempts').findOne({_id:id});
  return s?send(res,200,{session:sessionPublic(s)}):send(res,404,{error:'Urinish topilmadi'});
 }
 if(req.method==='POST'&&u.pathname==='/api/start'){
  rateLimit(req);
  const input=await body(req),fullName=canonical(input.fullName),group=canonical(input.group,40);
  if(fullName.length<5||!/\S+\s+\S+/.test(fullName))return send(res,400,{error:'Ism va familiyangizni to‘liq kiriting.'});
  if(group.length<2)return send(res,400,{error:'Guruhingizni kiriting.'});
  const limit=[15,20,30].includes(Number(input.timeLimit))?Number(input.timeLimit):20;
  const db=await getDatabase(),now=new Date();
  const s={_id:crypto.randomUUID(),fullName,group,nameKey:fullName.toLocaleLowerCase('uz'),groupKey:group.toLocaleLowerCase('uz'),timeLimit:limit,
    order:input.shuffle===false?questions.map((_,i)=>i):shuffle(questions.map((_,i)=>i)),
    index:0,score:0,correct:0,wrong:0,streak:0,maxStreak:0,status:'active',questionAt:now,createdAt:now,finishedAt:null};
  s.optionOrders=makeOptionOrders(s.order);
  await db.collection('attempts').insertOne(s);
  return send(res,201,{session:sessionPublic(s)});
 }
 if(req.method==='POST'&&u.pathname==='/api/answer'){
  rateLimit(req);const input=await body(req),id=input.sessionId;
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id)||!Number.isInteger(input.index)||!Number.isInteger(input.selected)||input.selected< -1||input.selected>3)
   return send(res,400,{error:'Javob parametrlari noto‘g‘ri'});
  const db=await getDatabase(),collection=db.collection('attempts'),s=await collection.findOne({_id:id});
  if(!s)return send(res,404,{error:'Urinish topilmadi'});
  if(s.status!=='active')return send(res,409,{error:'Test allaqachon tugagan',session:sessionPublic(s)});
  if(input.index!==s.index)return send(res,409,{error:'Savol allaqachon yakunlangan',session:sessionPublic(s)});
  const now=new Date(),elapsed=Math.max(0,(now-new Date(s.questionAt))/1000),remaining=Math.max(0,s.timeLimit-Math.ceil(elapsed));
  const chosen=elapsed>s.timeLimit+5?-1:input.selected;
  const q=questions[s.order[s.index]];
  const optionOrder=s.optionOrders?.[s.index]||[0,1,2,3]; // Support sessions started before this update.
  const correctIndex=optionOrder.indexOf(q[2]);
  const ok=chosen===correctIndex,nextIndex=s.index+1,finished=nextIndex>=questions.length;
  const streak=ok?s.streak+1:0,points=ok?500+Math.round(remaining/s.timeLimit*500)+Math.min(streak-1,5)*100:0;
  const patch={$set:{index:nextIndex,score:s.score+points,correct:s.correct+(ok?1:0),wrong:s.wrong+(ok?0:1),streak,maxStreak:Math.max(s.maxStreak,streak),
      questionAt:now,status:finished?'finished':'active',...(finished?{finishedAt:now}:{})}};
  const changed=await collection.updateOne({_id:id,index:s.index,status:'active'},patch);
  if(changed.modifiedCount!==1)return send(res,409,{error:'Bu savolga allaqachon javob berilgan. Sahifani yangilang.'});
  return send(res,200,{ok,correctIndex,explanation:q[3],points,selected:chosen,finished,session:sessionPublic({...s,...patch.$set})});
 }
 return send(res,404,{error:'Sahifa topilmadi'});
}
http.createServer((req,res)=>{handler(req,res).catch(e=>{console.error('API failure:',e.message);if(!res.headersSent)send(res,e.status||503,{error:e.status?e.message:'Maʼlumotlar bazasiga ulanib bo‘lmadi. Keyinroq urinib ko‘ring.'})})})
 .listen(PORT,'0.0.0.0',()=>console.log('Bayroq Quest v2 on port '+PORT+' / MongoDB configured: '+Boolean(process.env.MONGODB_URI)));
