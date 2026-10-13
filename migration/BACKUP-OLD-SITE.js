// PASTE ALL OF THIS INTO THE BROWSER DEVELOPER CONSOLE WHILE YOUR OLD DUEL CLUB SITE IS STILL ONLINE.
// The downloaded JSON can include private ownership keys and large base64 media; keep it private.
(async () => {
  const get = async path => { const response=await fetch(path); if(!response.ok) throw new Error(`${path}: HTTP ${response.status}`); return response.json(); };
  const summary = await get('/api/packs');
  const packs = [];
  for (const p of summary) {
    console.log(`Backing up pack: ${p.title}`);
    const full = await get(`/api/packs/${encodeURIComponent(p.id)}`);
    let stats = null;
    try { stats = await get(`/api/packs/${encodeURIComponent(p.id)}/stats`); } catch {}
    packs.push({pack:full,stats});
  }
  const local = {};
  for (const name of ['duelclub:ownedPacks','duelclub:studios','duelclub:soloDraft','duelclub:playerId','duelclub:name']) {
    local[name] = localStorage.getItem(name);
  }
  const studios=[];
  const codes=JSON.parse(local['duelclub:studios']||'[]');
  for (const code of codes) {
    try {
      const summary=await get(`/api/studios/${code}/summary`);
      const studio = await new Promise((resolve,reject)=>{
        const sock=io({reconnection:false,timeout:7000});
        const timer=setTimeout(()=>{sock.disconnect();reject(Error('Studio timed out'));},9000);
        const finish=(err,result)=>{clearTimeout(timer);sock.disconnect();err?reject(err):resolve(result)};
        sock.once('connect_error',err=>finish(err));
        sock.on('draft:state',data=>{if(data.code===code) finish(null,{...data,...summary})});
        sock.once('connect',()=>sock.emit('draft:join',{
          code,playerId:local['duelclub:playerId'],name:local['duelclub:name']||'Friend'
        },reply=>{if(!reply?.ok) finish(Error(reply?.error||'Studio unavailable'));}));
      });
      studios.push(studio);
      console.log(`Backing up collaborative studio: ${code}`);
    } catch (error) { console.warn(`Studio ${code} could not be backed up:`,error); }
  }
  const urls=new Set();
  const addMedia=items=>items?.forEach(item=>{if(/^\/uploads\/[^/?#]+$/i.test(item.image||'')) urls.add(item.image)});
  packs.forEach(({pack})=>addMedia(pack.items));
  studios.forEach(studio=>addMedia(studio.items));
  try { const draft=JSON.parse(local['duelclub:soloDraft']||'null');addMedia(draft?.items); } catch {}
  const media=[];
  for(const url of urls) {
    console.log(`Backing up media ${media.length+1}/${urls.size}: ${url}`);
    const response=await fetch(url);
    if(!response.ok) throw Error(`Cannot back up ${url}: ${response.status}`);
    const blob=await response.blob();
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)});
    media.push({url,mime:blob.type,dataUrl});
  }
  const backup={format:'duelclub-backup-v1',madeAt:new Date().toISOString(),packs,studios,local,media};
  const file=new Blob([JSON.stringify(backup)],{type:'application/json'});
  const url=URL.createObjectURL(file),link=document.createElement('a');
  link.href=url;link.download=`duel-club-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  alert(`Backup saved! ${packs.length} packs, ${studios.length} studios, ${media.length} uploaded files. Keep the JSON private.`);
})().catch(err=>alert(`Backup FAILED: ${err.message}. Do not deploy until you have a successful backup!`));
