'use strict';
const crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function createFloodObservation(server,{readBooks=()=>null,disabled=false}={}){
  let cohort=null,required=0,before=null,generation=0;
  const states=new Set(),bySocket=new WeakMap(),errors=[];
  const fault=message=>{if(errors.length<64)errors.push(message);};
  function arm(options){
    if(!options||typeof options.cohort!=='string'||options.cohort.length<1||options.cohort.length>128
      ||!Number.isSafeInteger(options.sockets)||options.sockets<1||options.sockets>128)throw new Error('FIXTURE_COHORT_INVALID');
    if([...states].some(state=>state.slot!==null&&!state.closed))throw new Error('FIXTURE_COHORT_STILL_OPEN');
    cohort=options.cohort;required=options.sockets;generation++;states.clear();errors.length=0;before=readBooks();
  }
  server.on('connection',socket=>{
    if(!cohort||disabled)return;
    if(states.size>=256){fault('OWNED_CONNECTION_OBSERVATION_BOUND');return;}
    const state={slot:null,closed:false,requests:[],finished:new Set(),chunks:[],bytes:0,nested:false};
    states.add(state);bySocket.set(socket,state);
    for(const method of ['write','end']){
      const original=socket[method];
      socket[method]=function observedOwnedSocketWrite(...args){
        const outer=!state.nested;
        const payload=outer&&(typeof args[0]==='string'||Buffer.isBuffer(args[0]))
          ?Buffer.from(args[0],typeof args[1]==='string'?args[1]:undefined):null;
        const previous=state.nested;state.nested=true;
        let value;
        try{value=Reflect.apply(original,this,args);}
        catch(error){fault('OWNED_SOCKET_WRITE_THROW');throw error;}
        finally{state.nested=previous;}
        if(payload){
          state.bytes+=payload.length;
          if(state.bytes<=65536)state.chunks.push(payload);else fault('OWNED_SOCKET_OBSERVATION_BYTES_BOUND');
        }
        return value;
      };
    }
    socket.once('close',()=>{state.closed=true;});
  });
  server.prependListener('request',(request,response)=>{
    if(!cohort||disabled||request.headers['x-c011-flood-cohort']===undefined)return;
    const state=bySocket.get(request.socket);
    if(!state){fault('COHORT_REQUEST_WITHOUT_OWNED_CONNECTION');return;}
    if(request.headers['x-c011-flood-cohort']!==cohort){fault('COHORT_HEADER_MISMATCH');return;}
    const text=request.headers['x-c011-flood-slot'];
    if(typeof text!=='string'||!/^(?:0|[1-9]\d*)$/.test(text)){fault('SLOT_HEADER_INVALID');return;}
    const slot=Number(text);
    if(slot>=required){fault('SLOT_OUTSIDE_COHORT');return;}
    if(state.slot!==null&&state.slot!==slot){fault('SOCKET_CHANGED_COHORT_SLOT');return;}
    if([...states].some(other=>other!==state&&other.slot===slot)){fault('DUPLICATE_COHORT_SOCKET');return;}
    state.slot=slot;
    const ordinal=state.requests.length;
    state.requests.push({method:request.method,url:request.url,version:request.httpVersion});
    response.once('finish',()=>state.finished.add(ordinal));
  });
  function frames(state){
    const all=Buffer.concat(state.chunks),parsed=[];let at=0;
    while(at<all.length){
      const end=all.indexOf('\r\n\r\n',at);
      if(end<0){if(state.closed)fault('PARTIAL_SERVER_RESPONSE_HEADERS');break;}
      const lines=all.subarray(at,end).toString('latin1').split('\r\n');
      const status=/^HTTP\/1\.[01] (\d{3}) /.exec(lines.shift());
      if(!status){fault('SERVER_RESPONSE_STATUS_INVALID');break;}
      const headers={};
      for(const line of lines){
        const colon=line.indexOf(':');if(colon<1){fault('SERVER_RESPONSE_HEADER_INVALID');continue;}
        const key=line.slice(0,colon).toLowerCase();
        if(Object.hasOwn(headers,key))fault('DUPLICATE_SERVER_RESPONSE_HEADER');
        headers[key]=line.slice(colon+1).trim();
      }
      if(!/^(?:0|[1-9]\d*)$/.test(headers['content-length']||'')){fault('SERVER_CONTENT_LENGTH_REQUIRED');break;}
      const length=Number(headers['content-length']),start=end+4;
      if(length>32768){fault('UNBOUNDED_SERVER_BODY');break;}
      if(start+length>all.length){if(state.closed)fault('PARTIAL_SERVER_BODY');break;}
      const bytes=all.subarray(start,start+length);let body=null;
      try{body=JSON.parse(bytes.toString('utf8'));}catch{fault('SERVER_BODY_NOT_JSON');}
      parsed.push({status:Number(status[1]),headers,body,bodyBytes:bytes.length,bodySha256:sha(bytes),
        finished:state.finished.has(parsed.length),source:'actual successful outer socket.write/end payload, no client-count inference'});
      at=start+length;
    }
    return parsed;
  }
  function snapshot(){
    if(!cohort||disabled)return null;
    const slots=[...states].filter(state=>state.slot!==null).sort((a,b)=>a.slot-b.slot).map(state=>({
      slot:state.slot,closed:state.closed,requests:state.requests.map(request=>({...request})),frames:frames(state)
    }));
    const closed=slots.filter(slot=>slot.closed).length;
    return{schema:'C011-owned-flood-observation/1',cohort,generation,expectedSockets:required,closed,slots,errors:[...new Set(errors)],
      barrier:{serverCohortClosed:closed,openCohort:slots.length-closed,settled:slots.length===required&&closed===required,
        source:'Owned server socket close callbacks plus an IPC stats reply after an event-loop turn'},
      booksBefore:before,booksAfter:readBooks(),scope:'Only this owned fixture server; no global interception'};
  }
  return{arm,snapshot};
}
module.exports={createFloodObservation};
