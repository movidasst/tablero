(() => {
  const cfg=window.TABLERO_CONFIG;
  const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const $=id=>document.getElementById(id);
  const state={session:null,companies:[],accesses:[]};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const date=v=>v?new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'Nunca';
  function box(id,msg='',type='error'){const el=$(id);if(!msg){el.className='status-box hidden';el.textContent='';return;}el.className=`status-box ${type}`;el.textContent=msg;}
  function global(msg='',type='error'){$('globalStatus').innerHTML=msg?`<div class="status-box ${type}">${esc(msg)}</div>`:'';}
  function loading(v){$('loadingBlock').classList.toggle('hidden',!v);}
  async function invoke(body){const {data,error}=await sb.functions.invoke(cfg.adminFunction,{body});if(error)throw new Error(data?.error||error.message||'No fue posible completar la operación.');if(data?.ok===false)throw new Error(data.error||'La operación falló.');return data;}
  function companyName(id){return state.companies.find(c=>c.id===id)?.nombre||'Empresa';}

  function render(){
    $('companyCount').textContent=state.companies.length;
    $('accessCount').textContent=state.accesses.length;
    $('companyId').innerHTML=state.companies.filter(c=>c.estado==='activo').map(c=>`<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
    $('companyList').innerHTML=state.companies.length?state.companies.map(c=>`<div class="company-admin-card"><strong>${esc(c.nombre)}</strong><small>${esc(c.pais_iso2||'')} · ${Number(c.portal_users||0)} usuario(s) del tablero · ${esc(c.estado)}</small></div>`).join(''):'<div class="empty">No hay empresas registradas en Gestión.</div>';
    renderAccesses();
  }
  function renderAccesses(){
    const q=String($('accessSearch').value||'').toLowerCase().trim();
    const rows=state.accesses.filter(a=>!q||[a.email,a.nombre,a.cargo,companyName(a.empresa_id)].some(v=>String(v||'').toLowerCase().includes(q)));
    $('accessList').innerHTML=rows.length?rows.map(a=>`<article class="access-row" data-access="${esc(a.id)}">
      <div class="access-main"><strong>${esc(a.nombre||a.email)}</strong><small>${esc(a.email)} · ${esc(companyName(a.empresa_id))}${a.cargo?` · ${esc(a.cargo)}`:''}</small><small>Último acceso: ${esc(date(a.ultimo_acceso_at))} · ${a.activo?'Activo':'Suspendido'}</small></div>
      <div class="access-actions"><select data-role><option value="lector" ${a.rol==='lector'?'selected':''}>Consulta</option><option value="admin_empresa" ${a.rol==='admin_empresa'?'selected':''}>Admin empresa</option></select><button class="btn btn-secondary btn-small" type="button" data-toggle>${a.activo?'Suspender':'Activar'}</button><button class="btn btn-secondary btn-small" type="button" data-reset>Recuperar acceso</button><button class="btn btn-danger btn-small" type="button" data-remove>Quitar</button></div>
    </article>`).join(''):'<div class="empty"><strong>Sin usuarios</strong>Crea el primer acceso para una empresa.</div>';
  }

  async function load(){loading(true);global();try{const data=await invoke({action:'dashboard'});state.companies=data.companies||[];state.accesses=data.accesses||[];render();}catch(e){global(e.message);}finally{loading(false);}}
  async function enter(){ $('authShell').classList.add('hidden'); $('adminShell').classList.remove('hidden'); await load(); }
  function showLogin(){ $('adminShell').classList.add('hidden'); $('authShell').classList.remove('hidden'); }

  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();box('loginStatus');const {data,error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)return box('loginStatus',error.message);state.session=data.session;try{await enter();}catch(err){box('loginStatus',err.message);showLogin();}});
  $('logoutBtn').addEventListener('click',async()=>{await sb.auth.signOut();state.session=null;showLogin();});
  $('reloadBtn').addEventListener('click',load);
  $('accessSearch').addEventListener('input',renderAccesses);
  $('inviteForm').addEventListener('submit',async e=>{e.preventDefault();box('inviteStatus');const payload={action:'invite_user',empresa_id:$('companyId').value,nombre:$('clientName').value,cargo:$('clientCargo').value,email:$('clientEmail').value,rol:$('clientRole').value};try{const data=await invoke(payload);box('inviteStatus',data.message||'Acceso creado.','ok');e.target.reset();await load();}catch(err){box('inviteStatus',err.message);}});

  $('accessList').addEventListener('change',async e=>{const select=e.target.closest('[data-role]');if(!select)return;const row=select.closest('[data-access]');const access=state.accesses.find(a=>a.id===row.dataset.access);if(!access)return;try{await invoke({action:'update_access',access_id:access.id,rol:select.value,activo:access.activo});await load();}catch(err){global(err.message);}});
  $('accessList').addEventListener('click',async e=>{
    const row=e.target.closest('[data-access]');if(!row)return;const access=state.accesses.find(a=>a.id===row.dataset.access);if(!access)return;
    try{
      if(e.target.closest('[data-toggle]')){await invoke({action:'update_access',access_id:access.id,rol:access.rol,activo:!access.activo});await load();return;}
      if(e.target.closest('[data-reset]')){const data=await invoke({action:'send_reset',email:access.email});global(data.message||'Correo enviado.','ok');return;}
      if(e.target.closest('[data-remove]')){if(!confirm(`¿Quitar el acceso de ${access.email} a ${companyName(access.empresa_id)}?`))return;await invoke({action:'remove_access',access_id:access.id});await load();return;}
    }catch(err){global(err.message);}
  });

  async function init(){ $('authLogo').src=cfg.brand.logo;$('topLogo').src=cfg.brand.logo;const {data}=await sb.auth.getSession();state.session=data.session;if(state.session){try{await enter();}catch(e){box('loginStatus',e.message);showLogin();}}else showLogin(); }
  init().catch(e=>box('loginStatus',e.message));
})();
