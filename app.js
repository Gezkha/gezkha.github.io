'use strict';
/* UI ParkSense V4.4.1 — faculty list displays verified vacant slots or Belum dihitung, not raw capacity. */
const $ = id => document.getElementById(id);
const conf = window.PARKSENSE_CONFIG || {};
const liveRequested = Boolean(conf.supabaseUrl && conf.supabaseAnonKey);
// Rencana FMIPA: dibaca dari data yang dikonfirmasi pengguna, BUKAN dari staging (akses internal).
// Sampai jumlah kendaraan terisi diketahui, zona-zona ini hanya boleh tampil sebagai 'Belum aktif'.
// Setelah masing-masing kode tersedia pada public.parking_zones, catatan preview otomatis diganti data asli.
const FMIPA_PLAN = [
  {code:'FMIPA-MTR-DEPAN',name:'Parkiran Motor Depan FMIPA',faculty:'FMIPA UI',address:'Dekat Departemen Matematika · pintu masuk berdasarkan titik pengguna',lat:-6.369348218824862,lng:106.82608683028899,motor_capacity:80,car_capacity:0},
  {code:'FMIPA-GEO',name:'Parkiran Departemen Geografi',faculty:'FMIPA UI',address:'Area Geografi · titik berdasarkan pengguna',lat:-6.368865580762137,lng:106.82754036592713,motor_capacity:378,car_capacity:20},
  {code:'FMIPA-GK2',name:'Parkiran Mobil Gedung Kuliah 2',faculty:'FMIPA UI',address:'Gedung Kuliah 2 · titik berdasarkan pengguna',lat:-6.369942986055496,lng:106.82641914599024,motor_capacity:0,car_capacity:20}
];
// Kapasitas & koordinat FEB berasal dari pendataan pemilik proyek.
// Angka terisi baru boleh tampil setelah petugas FEB melakukan hitungan awal secara nyata.
const FEB_PLAN = [
  {code:'FEB-MTR',name:'Parkiran Motor FEB',faculty:'FEB UI',address:'Area parkir motor FEB UI, Kampus Depok',lat:-6.360276771566495,lng:106.8272663084437,motor_capacity:264,car_capacity:0},
  {code:'FEB-MBL-DEPAN',name:'Parkiran Mobil Depan FEB',faculty:'FEB UI',address:'Area parkir mobil depan FEB UI, Kampus Depok',lat:-6.359712394600076,lng:106.82622505520686,motor_capacity:0,car_capacity:76},
  {code:'FEB-MBL-BELAKANG',name:'Parkiran Mobil Belakang FEB',faculty:'FEB UI',address:'Area parkir mobil belakang FEB UI, Kampus Depok',lat:-6.360248620348667,lng:106.82530041950231,motor_capacity:0,car_capacity:65}
];
// Daftar fakultas dari laman resmi SIMAK Universitas Indonesia.
// RIK adalah KAWASAN bersama, bukan fakultas; Vokasi/Pascasarjana bukan termasuk 14 fakultas.
const FACULTIES = [
  {code:'FT',name:'Fakultas Teknik'},
  {code:'FMIPA',name:'Fakultas Matematika & Ilmu Pengetahuan Alam'},
  {code:'FEB',name:'Fakultas Ekonomi & Bisnis'},
  {code:'FISIP',name:'Fakultas Ilmu Sosial & Ilmu Politik'},
  {code:'FH',name:'Fakultas Hukum'},
  {code:'FIB',name:'Fakultas Ilmu Budaya'},
  {code:'FASILKOM',name:'Fakultas Ilmu Komputer'},
  {code:'FPSI',name:'Fakultas Psikologi'},
  {code:'FIA',name:'Fakultas Ilmu Administrasi'},
  {code:'FK',name:'Fakultas Kedokteran'},
  {code:'FKG',name:'Fakultas Kedokteran Gigi'},
  {code:'FKM',name:'Fakultas Kesehatan Masyarakat'},
  {code:'FIK',name:'Fakultas Ilmu Keperawatan'},
  {code:'FF',name:'Fakultas Farmasi'}
];
// Faculty Makara assets from the reference artwork supplied for this project.
const MAKARA_FACULTIES = new Set(['FT','FMIPA','FEB','FISIP','FH','FIB','FASILKOM','FPSI','FIA','FK','FKG','FKM','FIK','FF']);
function makaraSrc(code){
 const base=String(code||'').toUpperCase();
 // Prefix match protects FIK/FK/FKG/FKM and avoids treating RIK as a faculty.
 const faculty=FACULTIES.find(f=>base===f.code || base.startsWith(f.code+'-'))?.code;
 return faculty&&MAKARA_FACULTIES.has(faculty)?'assets/makara/'+faculty.toLowerCase()+'.webp':'assets/makara/ui.png';
}
function facultyFor(z){return facultyCodeOf(z)||'RIK';}
function vehicleLabel(z){return cap(z,'motor')>0&&cap(z,'mobil')>0?'Motor & mobil':cap(z,'motor')>0?'Sepeda motor':'Mobil';}
function capacityLabel(z){
 return [cap(z,'motor')>0?nf(cap(z,'motor'))+' motor':'',cap(z,'mobil')>0?nf(cap(z,'mobil'))+' mobil':''].filter(Boolean).join(' · ');
}
function coordsHref(z){return Number.isFinite(z.lat)&&Number.isFinite(z.lng)?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(z.lat+','+z.lng):null;}
const ALL_PLANS = [...FMIPA_PLAN,...FEB_PLAN];
const PLAN_CODES = new Set(ALL_PLANS.map(z=>z.code));
const LEGACY_CODES = new Set(['FMIPA','FEB']);
function planned(z){return {...z,id:'preview:'+z.code,motor_occupied:null,car_occupied:null,__preview:true,verified:false,operational:false,counts_initialized:false,updated_at:null};}
// Zona gabungan lama tetap berada di database sebagai arsip, tetapi tidak muncul
// di Guest maupun Admin V3 untuk menghindari double count dan perubahan data demo.
function facultyCodeOf(z){
 const code=String(z.code||'').toUpperCase();
 // Batas '-' mencegah FT salah cocok pada kode lain.
 const match=FACULTIES.find(f=>code===f.code||code.startsWith(f.code+'-'));
 return match?match.code:null;
}
// Zona tambahan tanpa okupansi dibaca dari katalog Supabase yang aman.
// Kode fakultas lama disembunyikan otomatis saat ada kode turunan,
// sehingga tidak dihitung ganda saat migrasi multi-zona berikutnya.
function visibleZones(){
 const fromDb=state.zones.slice();
 const existing=new Set(fromDb.map(z=>z.code));
 const pending=[...state.pendingCatalogue,...ALL_PLANS].filter(z=>!existing.has(z.code));
 const uniquePending=[];const seen=new Set();
 for(const z of pending){if(!seen.has(z.code)){seen.add(z.code);uniquePending.push(planned(z));}}
 const all=[...fromDb,...uniquePending];
 const legacyHide=new Set(['FMIPA','FEB']);
 for(const z of all){
  const f=FACULTIES.find(f=>z.code.startsWith(f.code+'-'));
  if(f)legacyHide.add(f.code);
 }
 return all.filter(z=>!legacyHide.has(z.code));
}
function supports(z,v=state.vehicle){return cap(z,v)>0;}
function isUnknown(z,v=state.vehicle){return Boolean(z.__preview)||z.operational===false||z.counts_initialized===false||z[`${dbType(v)}_occupied`] == null;}
function mappedZones(){return visibleZones().filter(z=>supports(z));}
function activeZones(){return mappedZones().filter(z=>!isUnknown(z));}

const state = {activeSection:'beranda',mode:liveRequested?'connecting':'offline',sb:null,zones:[],pendingCatalogue:[],facultyFilter:'all',selected:'FT',vehicle:'motor',query:'',status:'all',sort:'free',user:null,assignments:[],coords:null,history:[],map:null,markers:null,markerCache:new Map(),busy:null,poll:null};
function safe(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const miniSvg=(name)=>`<svg class="mini-svg" aria-hidden="true" focusable="false"><use href="#ps-${name}"></use></svg>`;
const dbType = v => v==='mobil'?'car':'motor';
const free = (z,v=state.vehicle) => isUnknown(z,v)?null:Math.max(0,cap(z,v)-occ(z,v));
const cap = (z,v=state.vehicle) => Number(z[`${dbType(v)}_capacity`]||0);
const occ = (z,v=state.vehicle) => isUnknown(z,v)?null:Number(z[`${dbType(v)}_occupied`]);
function status(z,v=state.vehicle){const c=cap(z,v),f=free(z,v);return c<=0?'unavailable':f===null?'pending':f<=0?'full':f/c<=.18?'limited':'available';}
function statusName(s){return s==='pending'?'Belum dihitung':s==='unavailable'?'Tidak tersedia':s==='full'?'Penuh':s==='limited'?'Hampir penuh':'Tersedia';}
const nf=n=>n==null?'—':Number(n).toLocaleString('id-ID');
function localTime(iso){if(!iso)return 'Belum diperbarui';const d=new Date(iso);if(!Number.isFinite(d.getTime()))return 'Belum diperbarui';return d.toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' WIB';}
function lastAge(iso){if(!iso)return '';const ms=Date.now()-new Date(iso).getTime();return ms>3600000?' · > 1 jam':ms>900000?' · > 15 menit':'';}
function haversine(a,b){const r=6371,rad=Math.PI/180,dl=(b.lat-a.lat)*rad,dn=(b.lng-a.lng)*rad,k=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;return 2*r*Math.asin(Math.min(1,Math.sqrt(k)));}
function distanceText(z){if(!state.coords)return null;const d=haversine(state.coords,z);return d<1?`${Math.round(d*1000)} m`:`${d.toFixed(2).replace('.',',')} km`;}
function toast(message,error=false){const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=message;$('toastWrap').append(el);setTimeout(()=>el.remove(),4800);}
function isLive(){return state.mode==='live';}
function normalized(z){
 return {...z,id:z.id||z.code,
  motor_capacity:Number(z.motor_capacity||0),
  motor_occupied:z.motor_occupied==null?null:Number(z.motor_occupied),
  car_capacity:Number(z.car_capacity||0),
  car_occupied:z.car_occupied==null?null:Number(z.car_occupied),
  lat:z.lat==null?NaN:Number(z.lat),lng:z.lng==null?NaN:Number(z.lng)};
}
function setMode(mode,msg){state.mode=mode;$('syncChip').className='sync-chip '+(mode==='live'?'live':mode==='offline'?'offline':'connecting');$('syncChip').innerHTML='<span class="pulse"></span> '+(mode==='live'?'Data tersambung':mode==='offline'?'Koneksi bermasalah':mode==='connecting'?'Menyambungkan…':'Data belum tersedia');$('sideMode').textContent=mode==='live'?'Terhubung ke database':mode==='offline'?'Database tidak terhubung':'Menghubungkan database';$('sideModeDesc').textContent=mode==='live'?'Pembaruan petugas dapat dilihat bersama oleh semua pengunjung.':'Periksa konfigurasi dan jaringan Supabase.';$('mapLiveLabel').textContent=mode==='live'?'● Terhubung':'● Belum terhubung';$('demoAlert').classList.toggle('hidden',mode==='live');$('loginHint').textContent='Akun petugas dibuat oleh pengelola melalui Supabase; tidak ada pendaftaran publik.';if(msg)toast(msg,mode==='offline');}
function refreshVerificationNotice(){
 const needsVerification=state.zones.some(z=>z.verified!==true);
 const hasPlanned=visibleZones().some(z=>PLAN_CODES.has(z.code)&&isUnknown(z));
 const show=!isLive()||needsVerification||hasPlanned;
 $('demoAlert').classList.toggle('hidden',!show);
 if(isLive()){
  $('demoAlert').innerHTML='<span class="alert-icon">ⓘ</span><div><strong>Data terhubung ke Supabase.</strong> Status Belum dihitung berarti jumlah kendaraan dan slot kosong belum tersedia, bukan berarti parkiran kosong. Beberapa kapasitas, titik koordinat, dan data zona lama masih memerlukan verifikasi lapangan; kapasitas mobil FMIPA adalah perkiraan.</div>';
  $('syncChip').innerHTML='<span class="pulse"></span> Terhubung';
 }else{
  $('demoAlert').innerHTML='<span class="alert-icon">ⓘ</span><div><strong>Data belum terhubung.</strong> Periksa file config.js dan koneksi Supabase. Titik FMIPA dan FEB hanya menampilkan kapasitas; jumlah kosong belum diketahui.</div>';
 }
}
function selectedZone(){const zs=mappedZones();return zs.find(z=>String(z.id)===String(state.selected))||zs[0];}
function filtered(){
 const s=state.query.toLocaleLowerCase('id-ID').trim();
 return mappedZones().filter(z=>(state.facultyFilter==='all'||facultyCodeOf(z)===state.facultyFilter)&&(!s||[z.name,z.faculty,z.code,z.address].some(x=>String(x).toLocaleLowerCase('id-ID').includes(s)))&&(state.status==='all'||status(z)===state.status))
 .sort((a,b)=>state.sort==='name'?a.name.localeCompare(b.name,'id-ID'):
 state.sort==='nearest'&&state.coords?haversine(state.coords,a)-haversine(state.coords,b):
 (free(b)===null?-1:free(a)===null?1:free(b)-free(a)));
}
let facultyViewMode='cards';
function renderFacultyDirectory(){
 const el=$('facultyGrid'); if(!el)return;
 const all=visibleZones();
 const countMapped=FACULTIES.filter(f=>all.some(z=>facultyCodeOf(z)===f.code)).length;
 const pendingCount=all.filter(z=>['motor','mobil'].some(v=>cap(z,v)>0&&isUnknown(z,v))).length;
 $('facultyProgress').textContent=countMapped===FACULTIES.length
  ?'14 fakultas telah didata · '+(pendingCount?'beberapa zona masih menunggu penghitungan petugas.':'silakan periksa rincian setiap zona.')
  :countMapped+' dari 14 fakultas terdata · '+(FACULTIES.length-countMapped)+' masih dalam pendataan.';
 $('resetFacultyFilter').classList.toggle('hidden',state.facultyFilter==='all');
 el.classList.toggle('list-mode',facultyViewMode==='list');
 document.querySelectorAll('[data-faculty-view]').forEach(b=>{b.classList.toggle('active',b.dataset.facultyView===facultyViewMode);b.setAttribute('aria-pressed',String(b.dataset.facultyView===facultyViewMode));});
 el.innerHTML=FACULTIES.map(f=>{
  const zones=all.filter(z=>facultyCodeOf(z)===f.code);
  const pending=zones.some(z=>['motor','mobil'].some(v=>cap(z,v)>0&&isUnknown(z,v)));
  const unverified=zones.some(z=>z.verified!==true);
  const badge=!zones.length?'Belum didata':pending?'Belum dihitung':unverified?'Perlu verifikasi':'Data terhitung';
  const klass=!zones.length?'not-mapped':pending?'pending':unverified?'review':'ready';
  // Fakultas menampilkan SLOT KOSONG yang benar-benar dihitung, bukan kapasitas total.
  // Bila satu saja zona relevan belum dihitung, total fakultas tetap 'Belum dihitung'
  // agar tidak memberi kesan bahwa angka sebagian adalah ketersediaan keseluruhan.
  function facultyVacancy(vehicle){
   const applicable=zones.filter(z=>cap(z,vehicle)>0);
   if(!applicable.length)return {label:'—',pending:false};
   if(applicable.some(z=>isUnknown(z,vehicle)))return {label:'Belum dihitung',pending:true};
   return {label:nf(applicable.reduce((sum,z)=>sum+free(z,vehicle),0)),pending:false};
  }
  const motor=facultyVacancy('motor');
  const car=facultyVacancy('mobil');
  const hasMap=zones.some(z=>Number.isFinite(z.lat)&&Number.isFinite(z.lng));
  const description=zones.length?zones.length+' zona terdata · '+(pending?'slot kosong belum diketahui':'lihat rincian untuk status tiap zona'):'Data lokasi belum tersedia';
  return `<article class="faculty-card ${klass} ${state.facultyFilter===f.code?'chosen':''}" aria-label="${safe(f.name)}: ${safe(badge)}">
   <div class="faculty-card-top"><img class="faculty-makara" src="${makaraSrc(f.code)}" alt="Makara ${safe(f.name)}" loading="lazy" width="64" height="64"><div class="faculty-card-heading"><span class="faculty-code">${f.code}</span><strong>${safe(f.name)}</strong></div><span class="faculty-label ${klass}">${safe(badge)}</span></div>
   <p class="faculty-card-caption">${safe(description)}</p>
   <div class="faculty-capacity-row" aria-label="Slot kosong kendaraan"><span title="Slot motor kosong">${miniSvg('motorcycle')} Motor <b class="${motor.pending?'pending-value':''}">${motor.label}</b></span><i aria-hidden="true"></i><span title="Slot mobil kosong">${miniSvg('car')} Mobil <b class="${car.pending?'pending-value':''}">${car.label}</b></span></div>
   <div class="faculty-card-actions"><button type="button" data-faculty-code="${f.code}" ${zones.length?'':'disabled'}>Lihat parkiran ↗</button><button type="button" data-faculty-map="${f.code}" ${hasMap?'':'disabled'}>${miniSvg('map-pin')} Lihat peta</button></div>
  </article>`;
 }).join('');
}
function updateHeader(){const active=$('adminView').classList.contains('hidden')?'guest':'admin';const labels={beranda:'Dashboard',peta:'Peta parkir',daftar:'Daftar lokasi',fakultas:'14 Fakultas UI','info-parkir':'Info Parkir UI',bantuan:'Pusat Bantuan'};$('breadcrumb').textContent=active==='admin'?'Dashboard petugas':labels[state.activeSection||'beranda'];$('headerLogin').innerHTML=state.user?'Dashboard petugas <span>↗</span>':'Masuk Petugas <span>↗</span>';document.body.classList.toggle('admin-open',active==='admin');$('dateNow').textContent=new Date().toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',weekday:'long',day:'numeric',month:'long',year:'numeric'});document.querySelectorAll('.side-link[data-view]').forEach(x=>{x.classList.toggle('active',active==='guest'&&x.dataset.target===(state.activeSection||'beranda'));});}
function drawStats(){
 const all=visibleZones();
 const mapped=mappedZones();
 // Summary uses only counted and operating zones; missing counts are NOT zero vacancies.
 function summaryFor(v){
  const applicable=all.filter(z=>cap(z,v)>0);
  const counted=applicable.filter(z=>!isUnknown(z,v)&&Number.isFinite(Number(z[`${dbType(v)}_occupied`]))&&Number(z[`${dbType(v)}_occupied`])>=0&&Number(z[`${dbType(v)}_occupied`])<=cap(z,v));
  return {total:counted.length?counted.reduce((sum,z)=>sum+free(z,v),0):null,known:counted.length,unknown:applicable.length-counted.length};
 }
 const motor=summaryFor('motor'),car=summaryFor('mobil');
 function showSummary(which,value){
  $(which==='motor'?'statMotorCapacity':'statCarCapacity').textContent=value.total===null?'Belum dihitung':nf(value.total)+' slot';
  $(which==='motor'?'statMotorNote':'statCarNote').textContent=value.known?
   (value.known+' zona terhitung'+(value.unknown?' · '+value.unknown+' belum dihitung':'')):
   (value.unknown?'Menunggu hitungan petugas':'Belum ada zona terdata');
 }
 $('statLocations').textContent=nf(all.length);
 showSummary('motor',motor);
 showSummary('mobil',car);
 $('statFacultyCount').textContent=nf(FACULTIES.length)+' fakultas';
 $('mapCount').textContent=mapped.length+' titik';
 const known=mapped.filter(z=>!isUnknown(z));
 const latest=known.reduce((a,z)=>new Date(z.updated_at||0)>new Date(a)?z.updated_at:a,'1970-01-01');
 $('lastSync').textContent=known.length?'Data zona aktif: '+localTime(latest):'Jumlah slot kosong belum diketahui';
 const fmipaPending=all.some(z=>FMIPA_PLAN.some(p=>p.code===z.code)&&isUnknown(z));
 const febPending=all.some(z=>FEB_PLAN.some(p=>p.code===z.code)&&isUnknown(z));
 $('fmipaPlanNotice').classList.toggle('hidden',!fmipaPending);
 $('febPlanNotice').classList.toggle('hidden',!febPending);
}
function drawDetail(){
 const z=selectedZone();if(!z){$('detailName').textContent='Tidak ada lokasi';$('detailAvailable').textContent='—';$('detailCapacity').textContent='Belum ada data';$('detailOccupied').textContent='—';$('detailPercent').textContent='—';$('detailBar').style.width='0%';return;}
 state.selected=z.id;
 const c=cap(z),f=free(z),s=status(z),rate=f===null||!c?0:100*f/c;
 $('detailCode').textContent=z.code;$('detailName').textContent=z.name;$('detailAddress').textContent=z.address;$('detailMakara').src=makaraSrc(z.code);$('detailMakara').alt='Makara '+(facultyCodeOf(z)||'Universitas Indonesia');
 $('detailAvailable').textContent=nf(f);$('detailCapacity').textContent=f===null?'Belum ada hitungan petugas · kapasitas '+nf(c):'dari '+nf(c)+' kapasitas';
 $('detailOccupied').textContent=nf(occ(z));$('detailPercent').textContent=f===null?'—':Math.round(rate)+'%';
 $('detailType').textContent=state.vehicle==='motor'?'Sepeda motor':'Mobil';
 $('detailUpdated').textContent=f===null?'Belum ada data awal':localTime(z.updated_at)+lastAge(z.updated_at);
 $('detailStatus').textContent=statusName(s);$('detailStatus').className='status-badge '+s;
 $('detailBar').className='bar-fill '+s;$('detailBar').style.width=rate+'%';
 $('distanceRow').hidden=!state.coords;if(state.coords)$('detailDistance').textContent=distanceText(z);
 $('markerDisclaimer').textContent=z.__preview?('ⓘ Titik diberikan pengguna. Zona belum aktif dan jumlah kendaraan terisi menunggu data petugas.'+(z.code.startsWith('FMIPA')?' Kapasitas mobil FMIPA masih perkiraan.':'')):'ⓘ Lokasi dan data harus diperiksa pengelola sebelum dijadikan acuan operasional.';
 $('directionsBtn').href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(z.lat+','+z.lng)+'&travelmode=driving';
 $('directionsBtn').textContent='↗ Petunjuk arah'+(z.__preview?' (titik rencana)':'');
}
function drawCards(){if(window.ParkSenseV46) return window.ParkSenseV46.drawCards();
 const zs=filtered();$('resultCounter').textContent=zs.length+' lokasi';
 $('parkingCards').innerHTML=zs.length?zs.map(z=>{
 const c=cap(z),f=free(z),s=status(z),rate=f===null||!c?0:f/c*100;
 const title=f===null?'Belum dihitung':nf(f);
 const countText=f===null?'Kapasitas '+nf(c)+' · menunggu data petugas':'/ '+nf(c)+' slot kosong';
 const note=f===null?'Belum beroperasi · menunggu input awal petugas':`${nf(occ(z))} terisi · ${safe(localTime(z.updated_at))}`;
 const dir=coordsHref(z);
 return `<article class="parking-card premium-card ${z.__preview?'preview-zone':''} ${String(z.id)===String(state.selected)?'selected':''}" data-faculty="${safe(facultyFor(z))}">
   <div class="parking-card-visual" aria-hidden="true"><div class="parking-card-visual-halo"></div><img class="parking-card-makara" src="${makaraSrc(z.code)}" alt="" loading="lazy" width="96" height="96"><span class="parking-visual-kicker">${safe(facultyFor(z))} · UI PARKSENSE</span></div>
   <div class="parking-card-body"><div class="parking-top"><span class="parking-faculty-code">${safe(facultyFor(z))}</span><span class="status-badge ${s}">${statusName(s)}</span></div>
   <h3>${safe(z.name)}</h3><div class="sub">⌖ &nbsp;${safe(z.faculty)}${state.coords?' · '+safe(distanceText(z)):''}</div>
   <div class="v4-capacity"><span>${safe(vehicleLabel(z))}</span><strong>${safe(capacityLabel(z))}</strong></div>
   <div class="parking-value ${f===null?'pending-value':''}"><strong>${title}</strong><span>${countText}</span></div>
   <div class="card-progress"><i style="width:${rate}%;background:${s==='full'?'#c95c58':s==='limited'?'#c08d27':'#33916b'}"></i></div>
   <div class="card-footer"><small>${note}</small><div class="card-actions"><button type="button" data-select="${safe(z.id)}">Lihat detail ↗</button>${dir?`<a href="${safe(dir)}" target="_blank" rel="noopener noreferrer" aria-label="Petunjuk arah menuju ${safe(z.name)}">Petunjuk arah ⤴</a>`:''}</div></div></div>
 </article>`;
 }).join(''):'<div class="empty-list">Belum ada lokasi parkir yang sesuai pencarian. Coba filter lain.</div>';
}
function drawMap(){
 if(!state.map||!state.markers){renderOfflineMap();return;}
 state.markers.clearLayers();state.markerCache.clear();
 for(const z of mappedZones()){
  if(!Number.isFinite(z.lat)||!Number.isFinite(z.lng))continue;
  const s=status(z),selected=String(z.id)===String(state.selected);
  const symbol=({
   'FMIPA-MTR-DEPAN':'MAT','FMIPA-GEO':'GEO','FMIPA-GK2':'GK2',
   'FEB-MTR':'FEBM','FEB-MBL-DEPAN':'FDP','FEB-MBL-BELAKANG':'FBK'
  })[z.code]||(z.code.length>4?z.code.slice(0,2):z.code);
  const ic=window.L.divIcon({className:'map-marker '+s+(selected?' chosen':''),html:`<div class="marker-inner"><span>${safe(symbol)}</span></div>`,iconSize:[38,38],iconAnchor:[19,19]});
  const marker=window.L.marker([z.lat,z.lng],{icon:ic,title:z.name,keyboard:true}).addTo(state.markers);
  const popup=document.createElement('div');popup.className='pin-popup';
  popup.innerHTML=`<b>${safe(z.faculty)}</b><small>${safe(z.name)}</small><strong class="${free(z)===null?'pending-text':''}">${free(z)===null?'Belum dihitung':nf(free(z))}</strong> ${free(z)===null?'· kapasitas '+nf(cap(z)):'slot kosong'}<button type="button" data-map-select="${safe(z.id)}">Lihat detail →</button>`;
  marker.bindPopup(popup);marker.on('click',()=>{state.selected=z.id;drawDetail();drawCards();});state.markerCache.set(String(z.id),marker);
 }
}
function renderOfflineMap(){
 const canvas=$('parkingMap');if(!canvas||state.map)return;
 const pins=mappedZones().map(z=>{
  const x=Math.max(8,Math.min(90,12+(z.lng-106.822)*8400)),y=Math.max(10,Math.min(84,10+(-6.359-z.lat)*5500));
  const s=status(z);return `<button class="offline-pin ${s} ${String(state.selected)===String(z.id)?'chosen':''}" style="left:${x}%;top:${y}%" type="button" data-offline-select="${safe(z.id)}" title="${safe(z.name)}"><b>${safe(z.code)}</b><small>${free(z)===null?'Belum dihitung':nf(free(z))+' slot'}</small></button>`;
 }).join('');
 canvas.innerHTML=`<div class="offline-canvas" role="group" aria-label="Peta skematis area fakultas"><svg viewBox="0 0 700 430" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="700" height="430" fill="#e9f0e5"/><path d="M-40 210Q140 130 245 205T490 190T740 185" stroke="white" stroke-width="27" fill="none"/><path d="M260 -30Q370 60 310 145T365 295T315 470" stroke="white" stroke-width="26" fill="none"/><path d="M570 32Q475 95 520 170T530 420" stroke="#f9fcf7" stroke-width="22" fill="none"/></svg><span class="sketch-note">PETA SKEMATIS · BUKAN DENAH RESMI</span><span class="offline-sub">Peta sebenarnya memerlukan internet</span>${pins}</div>`;
}
function initMap(){if(!window.L){renderOfflineMap();return;}state.map=L.map('parkingMap',{scrollWheelZoom:false,zoomControl:true}).setView([-6.365,106.8273],15);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(state.map);state.markers=L.layerGroup().addTo(state.map);$('mapFallback')?.remove();drawMap();}
function fitMap(){if(!state.map||!window.L)return;const loc=mappedZones().filter(z=>Number.isFinite(z.lat)&&Number.isFinite(z.lng)).map(z=>[z.lat,z.lng]);if(loc.length)state.map.fitBounds(loc,{padding:[32,32],maxZoom:16});}
function chooseZone(id,scroll=false){
 const z=visibleZones().find(x=>String(x.id)===String(id));if(!z)return;
 if(!supports(z)){state.vehicle=cap(z,'motor')>0?'motor':'mobil';}
 state.selected=z.id;renderGuest();
 if(state.map){state.map.flyTo([z.lat,z.lng],Math.max(state.map.getZoom(),16),{duration:.4});const marker=state.markerCache.get(String(z.id));if(marker)marker.openPopup();}
 if(scroll)$('peta').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderGuest(){refreshVerificationNotice();drawStats();renderFacultyDirectory();drawDetail();drawCards();drawMap();document.querySelectorAll('[data-vehicle]').forEach(x=>x.classList.toggle('active',x.dataset.vehicle===state.vehicle));}
function showGuest(target='beranda'){if(!['beranda','peta','daftar','fakultas','info-parkir','bantuan'].includes(target))target='beranda';state.activeSection=target;$('guestView').classList.remove('hidden');$('adminView').classList.add('hidden');$('sidebar').classList.remove('mobile-open');$('adminMenu').classList.remove('active');updateHeader();requestAnimationFrame(()=>{if(state.map)state.map.invalidateSize();const anchor=$(target);if(anchor)anchor.scrollIntoView({behavior:'smooth',block:'start'});});if(target==='info-parkir')window.ParkSenseV48?.loadAnnouncements?.(state.sb).catch(()=>{});}
function canAdmin(){return isLive()&&Boolean(state.user)&&state.assignments.length>0;}
function openAdmin(){if(!canAdmin()){openLogin();return;} $('guestView').classList.add('hidden');$('adminView').classList.remove('hidden');$('sidebar').classList.remove('mobile-open');document.querySelectorAll('.side-link').forEach(x=>x.classList.remove('active'));$('adminMenu').classList.add('active');updateHeader();renderAdmin();if(ps47AdminTab==='berita')window.ParkSenseNewsV49?.onOpen?.();window.scrollTo({top:0,behavior:'smooth'});}
function openLogin(){if(isLive()&&state.user&&state.assignments.length){openAdmin();return;}if(state.mode==='offline'||state.mode==='connecting'){toast('Login petugas belum tersedia. Periksa koneksi database.',true);return;}$('loginModal').classList.remove('hidden');$('loginError').classList.add('hidden');setTimeout(()=>$('loginEmail').focus(),50);}
function closeLogin(){$('loginModal').classList.add('hidden');$('loginForm').reset();}
async function requestLocation(){if(!navigator.geolocation){toast('Browser ini tidak menyediakan akses lokasi.',true);return;}toast('Meminta izin lokasi perangkat…');navigator.geolocation.getCurrentPosition(p=>{state.coords={lat:p.coords.latitude,lng:p.coords.longitude};state.sort='nearest';$('sortSelect').value='nearest';if(state.map){if(state.userMarker)state.map.removeLayer(state.userMarker);state.userMarker=L.circleMarker([state.coords.lat,state.coords.lng],{radius:8,color:'#fff',weight:3,fillColor:'#277bb6',fillOpacity:1}).addTo(state.map).bindPopup('Lokasi perangkat Anda (perkiraan)');}renderGuest();toast('Lokasi ditemukan. Daftar diurutkan berdasarkan jarak garis lurus.');},e=>toast(e.code===1?'Izin lokasi tidak diberikan.':'Lokasi tidak dapat ditentukan. Coba aktifkan GPS.',true),{enableHighAccuracy:false,timeout:12000,maximumAge:30000});}
function ownZones(){
 const own=state.zones.filter(z=>state.assignments.includes(String(z.id)));
 const hasFmipa=own.some(z=>z.code==='FMIPA'||FMIPA_PLAN.some(p=>p.code===z.code));
 const hasFeb=own.some(z=>z.code==='FEB'||FEB_PLAN.some(p=>p.code===z.code));
 const result=own.filter(z=>!LEGACY_CODES.has(z.code));
 const present=new Set(result.map(z=>z.code));
 if(hasFmipa)result.push(...FMIPA_PLAN.filter(z=>!present.has(z.code)).map(planned));
 if(hasFeb)result.push(...FEB_PLAN.filter(z=>!present.has(z.code)).map(planned));
 return result;
}
function drawCounter(z,v){
 const c=cap(z,v);if(c<=0)return '';
 const o=occ(z,v),f=free(z,v);
 if(o===null)return `<h4>${v==='motor'?'▣ &nbsp; SEPEDA MOTOR':'▰ &nbsp; MOBIL'}</h4><div class="counter pending-counter"><div><small>Kapasitas</small><strong>${nf(c)}</strong></div><div><small>Terisi</small><strong>—</strong></div><div class="counter-free"><small>Kosong</small><strong>—</strong></div></div><p class="admin-pending">Belum ada penghitungan petugas. Tombol masuk/keluar akan aktif setelah aktivasi database.</p>`;
 const blocked=Boolean(state.busy);
 return `<h4>${v==='motor'?'▣ &nbsp; SEPEDA MOTOR':'▰ &nbsp; MOBIL'}</h4><div class="counter"><div><small>Kapasitas</small><strong>${nf(c)}</strong></div><div><small>Terisi</small><strong>${nf(o)}</strong></div><div class="counter-free"><small>Kosong</small><strong>${nf(f)}</strong></div></div><div class="admin-controls"><button data-zone-id="${safe(z.id)}" data-v="${v}" data-delta="1" ${blocked||o>=c?'disabled':''}>+ Kendaraan masuk</button><button class="out" data-zone-id="${safe(z.id)}" data-v="${v}" data-delta="-1" ${blocked||o<=0?'disabled':''}>− Kendaraan keluar</button></div>`;
}
function renderFmipaActivation(zs){
 const panel=$('fmipaActivationPanel');if(!panel)return;
 const codes=['FMIPA-MTR-DEPAN','FMIPA-GEO','FMIPA-GK2'];
 const entries=codes.map(code=>zs.find(z=>z.code===code));
 const canInit=isLive()&&entries.every(z=>z&&!z.__preview&&z.operational===false&&z.counts_initialized===false&&state.assignments.includes(String(z.id)));
 panel.classList.toggle('hidden',!canInit);
 if(!canInit){panel.innerHTML='';return;}
 const caps={front:cap(entries[0],'motor'),geoMotor:cap(entries[1],'motor'),geoCar:cap(entries[1],'mobil'),gk2Car:cap(entries[2],'mobil')};
 panel.innerHTML=`<div class="activation-title"><div><span class="activation-kicker">KHUSUS PETUGAS FMIPA · SETUP SATU KALI</span><h3>Aktifkan 3 zona parkir FMIPA</h3><p>Isi kendaraan yang sedang terparkir tepat saat mulai bertugas. Ketiganya akan aktif bersamaan. Sebelum itu, pengunjung hanya melihat status belum beroperasi.</p></div><span class="status-badge pending">Belum aktif</span></div>
 <form id="fmipaActivateForm" class="activation-form">
 <label>Motor terisi · Depan FMIPA <small>Maks. ${caps.front}</small><input name="frontMotor" type="number" min="0" max="${caps.front}" step="1" required placeholder="Jumlah motor saat mulai"></label>
 <label>Motor terisi · Geografi <small>Maks. ${caps.geoMotor}</small><input name="geoMotor" type="number" min="0" max="${caps.geoMotor}" step="1" required placeholder="Jumlah motor saat mulai"></label>
 <label>Mobil terisi · Geografi <small>Maks. ${caps.geoCar} (estimasi)</small><input name="geoCar" type="number" min="0" max="${caps.geoCar}" step="1" required placeholder="Jumlah mobil saat mulai"></label>
 <label>Mobil terisi · Gedung Kuliah 2 <small>Maks. ${caps.gk2Car} (estimasi)</small><input name="gk2Car" type="number" min="0" max="${caps.gk2Car}" step="1" required placeholder="Jumlah mobil saat mulai"></label>
 <div class="activation-action"><label class="activation-confirm"><input type="checkbox" name="confirmed" required> Saya petugas berwenang, sudah menghitung kendaraan saat ini, dan memahami bahwa angka akan ditampilkan secara publik.</label><button type="submit" ${state.busy?'disabled':''}>Aktifkan ketiga zona secara bersamaan →</button><small>Jangan gunakan angka percobaan. Kapasitas mobil perlu dikonfirmasi pengelola sebelum operasional.</small></div>
 </form>`;
}
async function activateFmipa(ev){
 ev.preventDefault();if(state.busy||!isLive()||!state.user||!state.sb)return;
 const form=ev.target;const entries=['frontMotor','geoMotor','geoCar','gk2Car'].map(x=>form.elements[x]?.value);
 if(!form.reportValidity()||entries.some(x=>!/^\d+$/.test(x)))return;
 const vals=entries.map(Number);
 const zones=ownZones();const byCode=code=>zones.find(z=>z.code===code);
 const caps=[cap(byCode('FMIPA-MTR-DEPAN'),'motor'),cap(byCode('FMIPA-GEO'),'motor'),cap(byCode('FMIPA-GEO'),'mobil'),cap(byCode('FMIPA-GK2'),'mobil')];
 if(vals.some((x,i)=>!Number.isSafeInteger(x)||x<0||x>caps[i])){toast('Data terisi tidak boleh melebihi kapasitas.',true);return;}
 if(!window.confirm('Yakin semua kendaraan sudah dihitung? Tiga zona akan langsung menampilkan slot kosong ke pengunjung.'))return;
 state.busy='fmipa';renderAdmin();
 try{
  const {error}=await state.sb.rpc('activate_fmipa_zones',{p_front_motor:vals[0],p_geo_motor:vals[1],p_geo_car:vals[2],p_gk2_car:vals[3]});
  if(error)throw error;
  await loadZones();await loadHistory();
  toast('Tiga zona FMIPA berhasil diaktifkan. Jumlah slot kini mengikuti data petugas.');
 }catch(e){toast('Aktivasi gagal: '+(e.message||'Periksa data atau izin akun.'),true);}
 finally{state.busy=null;renderAdmin();}
}
function renderFebActivation(zs){
 const panel=$('febActivationPanel');if(!panel)return;
 const codes=['FEB-MTR','FEB-MBL-DEPAN','FEB-MBL-BELAKANG'];
 const entries=codes.map(code=>zs.find(z=>z.code===code));
 const canInit=isLive()&&entries.every(z=>z&&!z.__preview&&z.operational===false&&z.counts_initialized===false&&state.assignments.includes(String(z.id)));
 panel.classList.toggle('hidden',!canInit);
 if(!canInit){panel.innerHTML='';return;}
 const caps={motor:cap(entries[0],'motor'),front:cap(entries[1],'mobil'),rear:cap(entries[2],'mobil')};
 panel.innerHTML=`<div class="activation-title"><div><span class="activation-kicker">KHUSUS PETUGAS FEB · SETUP SATU KALI</span><h3>Aktifkan 3 zona parkir FEB</h3><p>Masukkan jumlah kendaraan yang benar-benar sedang terparkir saat operasional dimulai. Seluruh zona akan aktif bersamaan; jangan gunakan angka contoh.</p></div><span class="status-badge pending">Belum aktif</span></div>
 <form id="febActivateForm" class="activation-form">
 <label>Motor terisi · Parkiran Motor FEB <small>Maks. ${caps.motor}</small><input name="motor" type="number" min="0" max="${caps.motor}" step="1" required placeholder="Motor terparkir saat mulai"></label>
 <label>Mobil terisi · Parkiran Depan <small>Maks. ${caps.front}</small><input name="front" type="number" min="0" max="${caps.front}" step="1" required placeholder="Mobil terparkir saat mulai"></label>
 <label>Mobil terisi · Parkiran Belakang <small>Maks. ${caps.rear}</small><input name="rear" type="number" min="0" max="${caps.rear}" step="1" required placeholder="Mobil terparkir saat mulai"></label>
 <div class="activation-action"><label class="activation-confirm"><input type="checkbox" name="confirmed" required> Saya petugas berwenang, telah menghitung kendaraan yang ada saat ini, dan memahami bahwa hasilnya akan tampil di website publik.</label><button type="submit" ${state.busy?'disabled':''}>Aktifkan ketiga zona FEB →</button><small>Jangan diaktifkan sebelum petugas benar-benar siap mencatat kendaraan masuk dan keluar.</small></div>
 </form>`;
}
async function activateFeb(ev){
 ev.preventDefault();if(state.busy||!isLive()||!state.user||!state.sb)return;
 const form=ev.target;const entries=['motor','front','rear'].map(x=>form.elements[x]?.value);
 if(!form.reportValidity()||entries.some(x=>!/^\d+$/.test(x)))return;
 const vals=entries.map(Number);
 const zones=ownZones();const byCode=code=>zones.find(z=>z.code===code);
 const caps=[cap(byCode('FEB-MTR'),'motor'),cap(byCode('FEB-MBL-DEPAN'),'mobil'),cap(byCode('FEB-MBL-BELAKANG'),'mobil')];
 if(vals.some((x,i)=>!Number.isSafeInteger(x)||x<0||x>caps[i])){toast('Data terisi tidak boleh melebihi kapasitas FEB.',true);return;}
 if(!window.confirm('Yakin semua jumlah kendaraan FEB sudah dihitung secara nyata? Ketiga zona akan segera terlihat sebagai zona aktif untuk pengunjung.'))return;
 state.busy='feb';renderAdmin();
 try{
  const {error}=await state.sb.rpc('activate_feb_zones',{p_motor:vals[0],p_front_car:vals[1],p_rear_car:vals[2]});
  if(error)throw error;
  await loadZones();await loadHistory();
  toast('Tiga zona FEB berhasil diaktifkan berdasarkan hitungan awal petugas.');
 }catch(e){toast('Aktivasi FEB gagal: '+(e.message||'Periksa data atau izin akun.'),true);}
 finally{state.busy=null;renderAdmin();}
}
function genericZoneActivationMarkup(z){
 if(z.__preview||z.operational!==false||z.counts_initialized!==false||!state.assignments.includes(String(z.id))||!isLive()||z.code.startsWith('FMIPA-')||z.code.startsWith('FEB-'))return '';
 const m=cap(z,'motor'),c=cap(z,'mobil');
 if(!m&&!c)return '';
 return `<form class="zone-start-form" data-activate-zone="${safe(z.id)}">
  <b>Aktivasi satu kali · ${safe(z.code)}</b>
  <p>Isi jumlah kendaraan yang benar-benar terparkir saat petugas mulai beroperasi.</p>
  <div class="zone-start-inputs">
  ${m?`<label>Motor terisi (maks. ${m})<input name="motor" type="number" min="0" max="${m}" step="1" required placeholder="Jumlah saat ini"></label>`:''}
  ${c?`<label>Mobil terisi (maks. ${c})<input name="car" type="number" min="0" max="${c}" step="1" required placeholder="Jumlah saat ini"></label>`:''}
  </div>
  <label class="zone-start-confirm"><input name="confirmed" type="checkbox" required> Saya petugas yang ditugaskan dan sudah menghitung kendaraan sebenarnya.</label>
  <button type="submit" ${state.busy?'disabled':''}>Aktifkan zona →</button>
 </form>`;
}
async function activateGenericZone(ev){
 ev.preventDefault();const form=ev.target;
 if(state.busy||!isLive()||!state.user||!state.sb||!form.reportValidity())return;
 const id=form.dataset.activateZone;const z=state.zones.find(z=>String(z.id)===id);
 if(!z||z.operational!==false||z.counts_initialized!==false||!state.assignments.includes(id))return;
 const m=cap(z,'motor')>0?Number(form.elements.motor?.value):0;
 const c=cap(z,'mobil')>0?Number(form.elements.car?.value):0;
 if(!Number.isSafeInteger(m)||!Number.isSafeInteger(c)||m<0||c<0||m>cap(z,'motor')||c>cap(z,'mobil')){toast('Input awal tidak valid.',true);return;}
 if(!window.confirm('Aktifkan '+z.name+' berdasarkan hitungan kendaraan nyata? Data slot akan menjadi publik.'))return;
 state.busy=id;renderAdmin();
 try{const {error}=await state.sb.rpc('parksense_activate_one_zone',{p_zone_id:id,p_motor_occupied:m,p_car_occupied:c});
  if(error)throw error;await loadZones();toast('Zona '+z.code+' berhasil diaktifkan berdasarkan data petugas.');}
 catch(e){toast('Aktivasi gagal: '+(e.message||'Periksa akses.'),true);}
 finally{state.busy=null;renderAdmin();}
}

// V4.4: Petugas dapat mengubah kapasitas TOTAL pada zona yang ditugaskan.
// Otorisasi, penguncian baris, validasi kapasitas >= terisi, dan audit ditangani di Supabase RPC.
// Kartu tidak mengizinkan menambah jenis kendaraan baru pada zona (kapasitas awal 0).
function capacityEditorMarkup(z, expanded=false){
 if(z.__preview || !isLive() || !state.user || !state.assignments.includes(String(z.id)))return '';
 const m=cap(z,'motor'),c=cap(z,'mobil');
 if(!m&&!c)return '';
 const disabled=state.busy?'disabled':'';
 return `<details class="capacity-editor" ${expanded?'open':''} data-capacity-panel="${safe(z.id)}">
   <summary><span class="capacity-edit-icon" aria-hidden="true">✎</span> Ubah kapasitas total zona <span class="capacity-edit-hint">Hanya petugas berwenang</span></summary>
   <form class="capacity-edit-form" data-update-capacity="${safe(z.id)}">
     <p class="capacity-edit-help">Sesuaikan jumlah tempat parkir fisik setelah pemeriksaan lapangan. Ini <b>kapasitas total</b>, bukan jumlah slot kosong. Slot kosong dihitung otomatis dari kapasitas − kendaraan terisi.</p>
     <div class="capacity-edit-inputs">
       ${m?`<label>Kapasitas motor (saat ini ${nf(m)})<input name="motor" type="number" min="1" max="100000" step="1" value="${m}" required ${disabled}></label>`:''}
       ${c?`<label>Kapasitas mobil (saat ini ${nf(c)})<input name="car" type="number" min="1" max="100000" step="1" value="${c}" required ${disabled}></label>`:''}
     </div>
     <label class="capacity-edit-reason">Alasan penyesuaian kapasitas<input name="reason" type="text" minlength="10" maxlength="500" required placeholder="Contoh: Area tambahan dibuka setelah pengecekan lapangan" ${disabled}></label>
     <label class="capacity-edit-confirm"><input name="confirmed" type="checkbox" required ${disabled}> Saya telah memeriksa kapasitas fisik zona ini. Perubahan akan tampil di website publik bila zona sudah aktif.</label>
     <button type="submit" ${disabled}>Simpan kapasitas baru</button>
     <small>Riwayat perubahan tersimpan di database. Perubahan untuk zona belum dihitung tidak mengaktifkan zona.</small>
   </form>
 </details>`;
}
async function updateZoneCapacity(ev){
 ev.preventDefault();
 const form=ev.target;
 if(state.busy || !isLive() || !canAdmin() || !state.sb || !form.reportValidity())return;
 const id=form.dataset.updateCapacity;
 const z=state.zones.find(z=>String(z.id)===String(id));
 if(!z || z.__preview || !state.assignments.includes(String(id))){toast('Zona tidak ditugaskan kepada akun ini.',true);return;}
 const m=cap(z,'motor')>0?Number(form.elements.namedItem('motor')?.value):0;
 const c=cap(z,'mobil')>0?Number(form.elements.namedItem('car')?.value):0;
 const reason=String(form.elements.namedItem('reason')?.value||'').trim();
 if(!Number.isSafeInteger(m)||!Number.isSafeInteger(c)||m<0||c<0||m>100000||c>100000||reason.length<10||reason.length>500){toast('Kapasitas atau alasan tidak valid.',true);return;}
 if(m===cap(z,'motor')&&c===cap(z,'mobil')){toast('Kapasitas belum berubah.');return;}
 if(!isUnknown(z,'motor')&&m<occ(z,'motor') || !isUnknown(z,'mobil')&&c<occ(z,'mobil')){toast('Kapasitas baru tidak boleh lebih kecil dari jumlah kendaraan terisi.',true);return;}
 if(!window.confirm('Simpan kapasitas baru untuk '+z.name+'?\nMotor: '+nf(cap(z,'motor'))+' → '+nf(m)+'\nMobil: '+nf(cap(z,'mobil'))+' → '+nf(c)+'\n\nKetersediaan pengunjung akan ikut berubah saat data zona aktif.'))return;
 state.busy=id;renderAdmin();
 try{
   const {error}=await state.sb.rpc('parksense_update_zone_capacity',{
      p_zone_id:id,p_motor_capacity:m,p_car_capacity:c,p_reason:reason
   });
   if(error)throw error;
   await loadZones();
   toast('Kapasitas '+z.name+' berhasil disimpan. Slot kosong otomatis diperbarui.');
 }catch(e){toast('Gagal menyimpan kapasitas: '+(e.message||'Periksa koneksi atau izin petugas.'),true);}
 finally{state.busy=null;renderAdmin();}
}

// V4.7 Workspace: tiga kartu, satu panel yang terlihat pada satu waktu.
let ps47AdminTab='kendaraan';
function showPs47AdminTab(tab, focus=false){
 if(!['kendaraan','kapasitas','berita'].includes(tab))tab='kendaraan';
 ps47AdminTab=tab;
 document.querySelectorAll('[data-ps47-admin-tab]').forEach(b=>{
   const active=b.dataset.ps47AdminTab===tab;
   b.classList.toggle('is-current',active);
   b.setAttribute('aria-selected',String(active));
   b.tabIndex=active?0:-1;
 });
 document.querySelectorAll('[data-ps47-pane]').forEach(p=>{
   const active=p.dataset.ps47Pane===tab;
   p.classList.toggle('hidden',!active);
 });
 if(tab==='berita') window.ParkSenseNewsV49?.onOpen?.();
 if(focus){const panel=$('ps47-panel-'+tab);panel?.scrollIntoView({behavior:'smooth',block:'start'});}
}
function populateNewsZoneChoices(zones){
 const select=$('ps47NewsZone');if(!select)return;
 const existing=select.value;
 const visible=zones.filter(z=>!z.__preview&&state.assignments.includes(String(z.id)));
 const sig=visible.map(z=>String(z.id)+':'+z.name).join('|');
 if(select.dataset.signature===sig)return;
 select.dataset.signature=sig;
 select.innerHTML='<option value="">Pilih zona yang dikelola</option>'+visible.map(z=>`<option value="${safe(z.id)}">${safe(z.code)} — ${safe(z.name)}</option>`).join('');
 if(visible.some(z=>String(z.id)===String(existing)))select.value=existing;
}
async function previewNewsDraft(event){
 event.preventDefault();
 const form=event.target;if(!form.reportValidity())return;
 const file=$('ps47NewsImage').files?.[0];
 const accepted=['image/jpeg','image/png','image/webp'];
 if(file&&(!accepted.includes(file.type)||file.size>5*1024*1024)){
   toast('Gunakan JPG, PNG, atau WebP maksimal 5 MB.',true);return;
 }
 const zone=$('ps47NewsZone');
 const selected=ownZones().find(z=>String(z.id)===String(zone.value)&&!z.__preview&&state.assignments.includes(String(z.id)));
 if(!selected){toast('Pilih zona yang ditugaskan kepada akun Anda.',true);return;}
 $('ps47PreviewMeta').textContent=$('ps47NewsCategory').value+' · '+selected.name+' · Pratinjau lokal';
 $('ps47PreviewTitle').textContent=$('ps47NewsTitle').value.trim();
 $('ps47PreviewBody').textContent=$('ps47NewsBody').value.trim();
 const media=$('ps47PreviewMedia');media.replaceChildren();
 if(file){
   const img=document.createElement('img');img.alt='Foto pratinjau pengumuman';
   const url=URL.createObjectURL(file);img.src=url;img.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
   media.append(img);
 }else{const el=document.createElement('span');el.textContent='Belum ada gambar';media.append(el);}
 $('ps47NewsPreview').classList.remove('hidden');
 $('ps47NewsPreview').scrollIntoView({behavior:'smooth',block:'nearest'});
 toast('Pratinjau dibuat di browser saja. Berita belum tersimpan atau terbit.');
}

function renderAdmin(){
 if(!canAdmin())return;const zs=ownZones();
 const plan=zs.some(z=>isUnknown(z,'motor')&&cap(z,'motor')>0 || isUnknown(z,'mobil')&&cap(z,'mobil')>0),active=zs.filter(z=>!z.__preview&&z.operational!==false&&z.counts_initialized!==false);
 $('adminBanner').className='admin-banner'+(isLive()?' live':'');
 $('adminBanner').textContent=plan?'MULTI-ZONA DALAM PERSIAPAN — hitungan awal belum diisi pada sebagian area. Tombol kendaraan masuk/keluar baru dapat digunakan setelah aktivasi oleh petugas berwenang.':'AKUN PETUGAS AKTIF — perubahan disimpan ke database dan diteruskan ke dashboard pengunjung.';
 $('adminLogout').textContent='Keluar akun';
 $('myZones').textContent=nf(zs.length);$('myMotorFree').textContent=active.length?nf(active.reduce((s,z)=>s+(free(z,'motor')||0),0)):'—';$('myCarFree').textContent=active.length?nf(active.reduce((s,z)=>s+(free(z,'mobil')||0),0)):'—';
 renderFmipaActivation(zs);
 renderFebActivation(zs);
 $('adminZones').innerHTML=zs.length?zs.map(z=>`<article class="admin-zone ${isUnknown(z,'motor')||isUnknown(z,'mobil')?'preview-zone':''}"><div class="admin-zone-head"><div class="admin-zone-title"><img class="admin-faculty-logo" src="${makaraSrc(z.code)}" alt="Makara ${safe(z.faculty)}" loading="lazy" width="45" height="45"><div><h3>${safe(z.name)}</h3><small>⌖ ${safe(z.faculty)}</small></div></div><span class="detail-tag">${safe(z.code)}</span></div>${z.__preview||z.operational===false?'<p class="zone-preview-label">Menunggu input awal petugas · belum beroperasi</p>':''}${drawCounter(z,'motor')}${drawCounter(z,'mobil')}${genericZoneActivationMarkup(z)}<div class="admin-foot"><span>Terakhir diperbarui</span><strong>${z.__preview||z.operational===false?'Belum beroperasi':safe(localTime(z.updated_at))}</strong></div></article>`).join(''):'<div class="empty-list">Akun ini belum memiliki area parkir yang ditugaskan. Hubungi pengelola.</div>';
  $('adminCapacityZones').innerHTML=zs.length?zs.map(z=>`<article class="ps47-capacity-card"><div class="ps47-capacity-heading"><img src="${makaraSrc(z.code)}" alt="" width="42" height="42" loading="lazy"><div><span class="ps47-capacity-code">${safe(z.code)}</span><h3>${safe(z.name)}</h3><p>${safe(z.faculty)}</p></div></div><div class="ps47-capacity-values"><span>Motor: <strong>${cap(z,'motor')?nf(cap(z,'motor')):'—'}</strong></span><span>Mobil: <strong>${cap(z,'mobil')?nf(cap(z,'mobil')):'—'}</strong></span></div>${capacityEditorMarkup(z,true)||'<p class="ps47-unavailable">Zona pratinjau atau belum ditugaskan secara penuh. Perubahan kapasitas belum tersedia.</p>'}</article>`).join(''):'<div class="empty-list">Belum ada zona yang ditugaskan.</div>';
  populateNewsZoneChoices(zs);
 drawHistory();
}
function drawHistory(){if(!canAdmin())return;const source=state.history.filter(e=>state.assignments.includes(String(e.zone_id)));$('activityList').innerHTML=source.length?source.slice(0,12).map(e=>{const name=state.zones.find(z=>String(z.id)===String(e.zone_id))?.code||'—',pos=e.delta>0;return `<div class="history-item"><div class="history-ico ${pos?'':'minus'}">${pos?'+':'−'}</div><div class="history-copy"><strong>${safe(e.vehicle==='motor'?'Motor':'Mobil')} ${pos?'masuk':'keluar'} · ${safe(name)}</strong><small>${pos?'Terisi bertambah 1 slot':'Terisi berkurang 1 slot'}</small></div><div class="history-date">${safe(localTime(e.created_at))}</div></div>`;}).join(''):'<div style="padding:23px 0;font-size:11px;color:#92a396">Belum ada aktivitas kendaraan yang tercatat.</div>';}
async function updateCount(id,vehicle,delta){if(state.busy)return;const z=state.zones.find(x=>String(x.id)===String(id));if(!z||z.operational===false||z.counts_initialized===false||!['motor','mobil'].includes(vehicle)||![-1,1].includes(delta)||!canAdmin())return;if(!state.assignments.includes(String(id))){toast('Akun Anda tidak berwenang mengubah lokasi ini.',true);return;}const next=occ(z,vehicle)+delta;if(next<0||next>cap(z,vehicle)){toast(delta>0?'Tempat parkir sudah penuh.':'Jumlah kendaraan sudah nol.',true);return;}state.busy=id;renderAdmin();try{const {data,error}=await state.sb.rpc('apply_parking_event',{p_zone_id:id,p_vehicle:vehicle,p_delta:delta});if(error)throw error;if(data){const updated=normalized(Array.isArray(data)?data[0]:data);state.zones=state.zones.map(x=>String(x.id)===String(id)?updated:x);}await loadHistory();renderGuest();toast(`${vehicle==='motor'?'Motor':'Mobil'} ${delta>0?'masuk':'keluar'} berhasil dicatat.`);}catch(e){toast('Perubahan gagal disimpan: '+(e.message||'Koneksi bermasalah'),true);}finally{state.busy=null;renderAdmin();}}
async function loadPublicPendingCatalogue(){
 if(!state.sb)return;
 try{const {data,error}=await state.sb.rpc('parksense_pending_public_zones');
  if(error){
   // Kompatibel saat SQL 03 belum dipasang: 6 zona lama tetap punya preview.
   if(!/PGRST202|42883|does not exist|not find/i.test(String(error.code||'')+' '+error.message))console.warn('Katalog belum dimuat:',error.message);
   return;
  }
  state.pendingCatalogue=(data||[]).filter(z=>z&&z.code&&Number(z.motor_capacity||0)+Number(z.car_capacity||0)>0);
 }catch(e){console.warn('Katalog belum dimuat:',e.message);}
}
async function loadZones(){
 if(!state.sb)return;
 const {data,error}=await state.sb.from('parking_zones').select('*').order('code');if(error)throw error;
 state.zones=(data||[]).map(normalized);
 await loadPublicPendingCatalogue();
 // Jangan pilih zona legacy FMIPA atau FEB yang disembunyikan dalam UI V3.
 if(!visibleZones().some(z=>String(z.id)===String(state.selected)))state.selected=mappedZones()[0]?.id||null;
 renderGuest();if(canAdmin())renderAdmin();
}
async function loadHistory(){if(!state.sb||!state.user||!state.assignments.length)return;const {data,error}=await state.sb.from('parking_events').select('id,zone_id,vehicle,delta,created_at').order('created_at',{ascending:false}).limit(30);if(!error)state.history=data||[];}
async function fetchAssignments(){if(!state.user||!state.sb){state.assignments=[];return;}const {data,error}=await state.sb.from('parking_assignments').select('zone_id').eq('user_id',state.user.id);if(error)throw error;state.assignments=(data||[]).map(x=>String(x.zone_id));if(state.assignments.length)await loadHistory();}
async function initSupabase(){if(!liveRequested){state.zones=[];setMode('offline','Konfigurasi Supabase belum tersedia. Salin config.js dari website lama.');renderGuest();return;}setMode('connecting');if(!window.supabase?.createClient){setMode('offline','Gagal memuat Supabase. Periksa koneksi internet.');return;}try{state.sb=window.supabase.createClient(conf.supabaseUrl,conf.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});await loadZones();setMode('live');refreshVerificationNotice();window.ParkSenseV48?.loadAnnouncements(state.sb).catch(e=>console.warn('Pengumuman:',e.message));const {data:{user},error}=await state.sb.auth.getUser();if(error&&!/Auth session missing/i.test(error.message)){/* continue as guest */}if(user){state.user=user;await fetchAssignments();if(state.assignments.length)await loadZones();}state.sb.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){state.user=null;state.assignments=[];state.history=[];window.ParkSenseNewsV49?.resetSession?.();if(!$('adminView').classList.contains('hidden'))showGuest('beranda');updateHeader();}});state.sb.channel('parksense-parkir').on('postgres_changes',{event:'*',schema:'public',table:'parking_zones'},()=>{loadZones().catch(()=>{});}).subscribe();state.poll=setInterval(()=>loadZones().catch(()=>{}),30000);if(state.user&&state.assignments.length)updateHeader();}catch(e){setMode('offline','Database gagal dimuat: '+(e.message||'Periksa konfigurasi.'));console.error('ParkSense:',e);}}
async function handleLogin(e){e.preventDefault();$('loginError').classList.add('hidden');if(!isLive()||!state.sb){$('loginError').textContent='Hubungkan Supabase terlebih dahulu.';$('loginError').classList.remove('hidden');return;}const btn=$('loginSubmit');btn.disabled=true;btn.textContent='Memeriksa akun…';try{const {data,error}=await state.sb.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});if(error)throw error;state.user=data.user;await fetchAssignments();if(state.assignments.length)await loadZones();if(!state.assignments.length){await state.sb.auth.signOut();state.user=null;throw new Error('Akun berhasil masuk, tetapi belum memiliki area yang ditugaskan. Hubungi pengelola.');}closeLogin();updateHeader();openAdmin();toast('Selamat datang! Anda dapat mengelola area yang ditugaskan.');}catch(err){$('loginError').textContent=err.message||'Login tidak berhasil.';$('loginError').classList.remove('hidden');}finally{btn.disabled=false;btn.textContent='Masuk ke dashboard →';}}
async function logout(){if(!state.sb)return;const {error}=await state.sb.auth.signOut();if(error){toast('Gagal keluar: '+error.message,true);return;}state.user=null;state.assignments=[];state.history=[];window.ParkSenseNewsV49?.resetSession?.();await loadZones();showGuest('beranda');toast('Berhasil keluar dari akun petugas.');}
function events(){document.querySelectorAll('[data-ps47-admin-tab]').forEach(b=>b.addEventListener('click',()=>showPs47AdminTab(b.dataset.ps47AdminTab,true)));/* Berita V4.9: form dikendalikan news-admin-v49.js */document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>showGuest(btn.dataset.target)));$('hamburger').addEventListener('click',()=>$('sidebar').classList.toggle('mobile-open'));$('brandLink').addEventListener('click',e=>{e.preventDefault();showGuest('beranda');});$('headerLogin').addEventListener('click',()=>canAdmin()?openAdmin():openLogin());$('adminMenu').addEventListener('click',openAdmin);$('backGuest').addEventListener('click',()=>showGuest('beranda'));$('adminLogout').addEventListener('click',logout);$('closeLogin').addEventListener('click',closeLogin);$('loginModal').addEventListener('click',e=>{if(e.target===$('loginModal'))closeLogin();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('loginModal').classList.add('hidden');$('sidebar').classList.remove('mobile-open');}});$('loginForm').addEventListener('submit',handleLogin);document.querySelectorAll('[data-vehicle]').forEach(b=>b.addEventListener('click',()=>{state.vehicle=b.dataset.vehicle;state.selected=mappedZones().some(z=>String(z.id)===String(state.selected))?state.selected:mappedZones()[0]?.id;renderGuest();}));$('heroSearchBtn').addEventListener('click',()=>{state.query=$('heroSearch').value;$('listSearch').value=state.query;drawCards();$('daftar').scrollIntoView({behavior:'smooth'});});$('heroSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){$('heroSearchBtn').click();}});$('topSearchForm').addEventListener('submit',e=>{e.preventDefault();state.facultyFilter='all';state.query=$('topSearch').value.trim();$('heroSearch').value=state.query;$('listSearch').value=state.query;drawCards();showGuest('daftar');});$('listSearch').addEventListener('input',e=>{state.query=e.target.value;$('heroSearch').value=state.query;drawCards();});$('statusFilter').addEventListener('change',e=>{state.status=e.target.value;drawCards();});$('sortSelect').addEventListener('change',e=>{state.sort=e.target.value;if(state.sort==='nearest'&&!state.coords)requestLocation();drawCards();});$('locateBtn').addEventListener('click',requestLocation);$('recenterBtn').addEventListener('click',fitMap);$('parkingCards').addEventListener('click',e=>{const b=e.target.closest('[data-select]');if(b)chooseZone(b.dataset.select,true);});$('parkingMap').addEventListener('click',e=>{const b=e.target.closest('[data-map-select],[data-offline-select]');if(b)chooseZone(b.dataset.mapSelect||b.dataset.offlineSelect);});$('adminView').addEventListener('submit',e=>{if(e.target.id==='fmipaActivateForm')activateFmipa(e);if(e.target.id==='febActivateForm')activateFeb(e);if(e.target.matches('[data-activate-zone]'))activateGenericZone(e);if(e.target.matches('[data-update-capacity]'))updateZoneCapacity(e);});$('facultyGrid').addEventListener('click',e=>{const b=e.target.closest('[data-faculty-code],[data-faculty-map]');if(!b||b.disabled)return;const code=b.dataset.facultyCode||b.dataset.facultyMap;const zs=visibleZones().filter(z=>facultyCodeOf(z)===code);if(!zs.length)return;state.facultyFilter=code;state.query='';$('heroSearch').value='';$('listSearch').value='';$('topSearch').value='';if(!zs.some(z=>cap(z,state.vehicle)>0))state.vehicle=zs.some(z=>cap(z,'motor')>0)?'motor':'mobil';const first=zs.find(z=>supports(z));if(first)state.selected=first.id;renderGuest();showGuest(b.dataset.facultyMap?'peta':'daftar');});document.querySelectorAll('[data-faculty-view]').forEach(b=>b.addEventListener('click',()=>{facultyViewMode=b.dataset.facultyView;renderFacultyDirectory();}));$('resetFacultyFilter').addEventListener('click',()=>{state.facultyFilter='all';renderGuest();});$('adminZones').addEventListener('click',e=>{const b=e.target.closest('[data-zone-id]');if(b&&!b.disabled)updateCount(b.dataset.zoneId,b.dataset.v,Number(b.dataset.delta));});}
window.addEventListener('DOMContentLoaded',()=>{events();updateHeader();initMap();initSupabase();});

window.ParkSenseNewsContext = () => ({client:state.sb, user:state.user, zones: ownZones().filter(z=>!z.__preview&&state.assignments.includes(String(z.id))), assignments:state.assignments.slice()});
