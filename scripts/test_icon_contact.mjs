import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/icon-review-worker.js';
import {sealEmail, adminMetadata} from '../workers/icon-contact.mjs';
import {encode, decode} from '../workers/icon-publisher.mjs';
const origin='https://maddestalistar.github.io';
const env={ADMIN_KEY:'test-admin-secret-at-least-24-characters',GITHUB_TOKEN:'test-token',REVIEW_REPO:'test/queue'};
const email='creator+icons@example.com';
test('encrypted contacts use random IVs, bind to the submission and survive supported key rotation',async()=>{
 const a=await sealEmail(email,'test-id-123',env),b=await sealEmail(email,'test-id-123',env);
 assert.notEqual(a.data,b.data);assert(!JSON.stringify(a).includes(email));
 assert.equal((await adminMetadata({id:'test-id-123',contactEmailEncrypted:a},env)).email,email);
 assert.equal((await adminMetadata({id:'wrong-id',contactEmailEncrypted:a},env)).emailUnavailable,true);
 const rotated={...env,ADMIN_KEY:'replacement-admin-key-at-least-24-characters',CONTACT_EMAIL_PREVIOUS_ADMIN_KEY:env.ADMIN_KEY};
 assert.equal((await adminMetadata({id:'test-id-123',contactEmailEncrypted:a},rotated)).email,email);
 const dedicated={...env,CONTACT_EMAIL_KEY:'independent-contact-key-at-least-24-characters'};
 const c=await sealEmail(email,'id',dedicated);
 assert.equal((await adminMetadata({id:'id',contactEmailEncrypted:c},{...dedicated,ADMIN_KEY:rotated.ADMIN_KEY})).email,email);
});
for(const value of ['',email,'bad-address','a\nb@example.com','x'.repeat(255)+'@example.com'])test('submission validates and privately stores optional email '+JSON.stringify(value.slice(0,30)),async()=>{
 const bytes=Uint8Array.from([71,73,70,56,57,97,64,1,64,1,0,0,0,59]);
 const form=new FormData();form.set('name','Test');form.set('author','Tester');form.set('kind','动态');form.set('email',value);form.set('file',new File([bytes],'icon.gif',{type:'image/gif'}));
 const previous=globalThis.fetch,writes=[];
 globalThis.fetch=async(url,options)=>{writes.push({url,body:JSON.parse(options.body)});return new Response('{}',{status:201})};
 try{
  const res=await worker.fetch(new Request('https://example.test',{method:'POST',headers:{Origin:origin},body:form}),env);
  if(value!==''&&value!==email){assert.equal(res.status,400);assert.equal(writes.length,0);return}
  assert.equal(res.status,201);assert.equal(writes.length,2);
  assert.deepEqual(Buffer.from(writes[0].body.content,'base64'),Buffer.from(bytes));
  const meta=JSON.parse(decode(writes[1].body.content));
  assert.equal(meta.email,undefined);assert.equal((await adminMetadata(meta,env)).email,value);
  assert(!JSON.stringify(writes).includes(email));assert(!decode(writes[1].body.content).includes(email));
 }finally{globalThis.fetch=previous}
});
test('admin GET exposes decrypted email only after authentication; reject retains queue image and encrypted metadata',async()=>{
 const meta={id:'contact-test-123',name:'Test',filename:'pending/test.gif',status:'pending',contactEmailEncrypted:await sealEmail(email,'contact-test-123',env)};
 const previous=globalThis.fetch,writes=[];
 globalThis.fetch=async(url,options={})=>{
  if(options.method==='PUT'){writes.push({url,body:JSON.parse(options.body)});return Response.json({})}
  if(url.endsWith('/contents/pending'))return Response.json([{type:'file',name:'test.json'}]);
  return Response.json({sha:'old',content:encode(JSON.stringify(meta))});
 };
 try{
  const headers={Origin:origin,'X-Admin-Key':env.ADMIN_KEY};
  const list=await worker.fetch(new Request('https://example.test/admin',{headers}),env);
  const out=await list.json();assert.equal(out.items[0].email,email);assert.equal(out.items[0].contactEmailEncrypted,undefined);
  const res=await worker.fetch(new Request('https://example.test/admin',{method:'POST',headers,body:JSON.stringify({path:'pending/test.json',status:'rejected'})}),env);
  assert.equal(res.status,200);assert.equal((await res.json()).item.email,email);
  assert.equal(writes.length,1);assert(writes[0].url.endsWith('/pending/test.json'));
  const saved=JSON.parse(decode(writes[0].body.content));assert.equal(saved.status,'rejected');assert.equal(saved.filename,meta.filename);assert.deepEqual(saved.contactEmailEncrypted,meta.contactEmailEncrypted);assert.equal(saved.email,undefined);
 }finally{globalThis.fetch=previous}
});
