// PASTE ALL OF THIS INTO THE BROWSER DEVELOPER CONSOLE AFTER YOUR UPDATED SITE SHOWS storage: 'supabase'.
// You need the original JSON backup and your private PACK_ADMIN_KEY from Render.
(async () => {
  const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';
  const file=await new Promise(resolve=>{picker.onchange=()=>resolve(picker.files[0]);picker.click()});
  if(!file) return;
  const backup=JSON.parse(await file.text());
  if(backup.format!=='duelclub-backup-v1') throw Error('Not a Duel Club backup file');
  const health=await fetch('/api/health').then(r=>r.json());
  if(health.storage!=='supabase') throw Error('Cloud storage is not enabled yet. Do not restore onto temporary storage.');
  const adminKey=prompt('Enter your private PACK_ADMIN_KEY from Render (minimum 16 characters):');
  if(!adminKey || adminKey.length<16) return alert('No admin key entered. Nothing imported.');
  const post=async(path,data)=>{
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw Error(`${path}: ${payload.error||`HTTP ${response.status}`}`);
    return payload;
  };
  // Validate the key before doing any uploads.
  const check=await fetch('/api/admin/restore-pack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminKey,pack:{id:'invalid!'}})});
  if(check.status===403) throw Error('Administrator key is incorrect');
  if(check.status!==400) throw Error(`Restore endpoint is not ready: HTTP ${check.status}`);
  const mapped=new Map();
  for(const original of backup.media||[]) {
    console.log(`Restoring media ${mapped.size+1}/${backup.media.length}: ${original.url}`);
    const raw=atob(original.dataUrl.split(',')[1]);
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
    const fd=new FormData();
    const ext=(original.url.split('.').at(-1)||'png').toLowerCase();
    const mime=original.mime||({gif:'image/gif',jpg:'image/jpeg',png:'image/png',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'}[ext]);
    fd.append('file',new File([bytes],`migrated.${ext}`,{type:mime}));
    const response=await fetch('/api/upload',{method:'POST',body:fd});
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw Error(`Media upload failed for ${original.url}: ${result.error||response.status}`);
    mapped.set(original.url,result.url);
  }
  const replaceMedia=items=>(items||[]).map(item=>({...item,image:mapped.get(item.image)||item.image}));
  const owned=JSON.parse(backup.local?.['duelclub:ownedPacks']||'{}');
  for(const {pack,stats} of backup.packs||[]) {
    console.log('Restoring pack',pack.title);
    const restored={...pack,items:replaceMedia(pack.items)};
    await post('/api/admin/restore-pack',{adminKey,pack:restored,stats,ownerKey:owned[pack.id]||null});
  }
  for(const studio of backup.studios||[]) {
    console.log('Restoring studio',studio.code);
    await post('/api/admin/restore-studio',{adminKey,studio:{...studio,items:replaceMedia(studio.items)}});
  }
  for(const [name,value] of Object.entries(backup.local||{})) {
    if(value!=null) localStorage.setItem(name,value);
  }
  // Solo packs are client-side too; if they used uploaded media, rewrite those links.
  try {
    const raw=localStorage.getItem('duelclub:soloDraft');
    if(raw){const draft=JSON.parse(raw);draft.items=replaceMedia(draft.items);localStorage.setItem('duelclub:soloDraft',JSON.stringify(draft));}
  } catch {}
  alert(`Restore finished! Imported ${backup.packs?.length||0} packs, ${backup.studios?.length||0} studios and ${mapped.size} media files. Refresh Duel Club.`);
})().catch(err=>alert(`Restore FAILED: ${err.message}. Fix the problem and rerun; previously imported packs are not overwritten.`));
