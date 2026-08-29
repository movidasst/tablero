(() => {
  const cfg = window.TABLERO_CONFIG;
  const $ = id => document.getElementById(id);
  const HOURS_PER_COURSE = Math.max(0, Number(cfg.trainingHoursPerCourse || 4));
  const state = { token: localStorage.getItem('tablero_portal_token') || '', user: null, accesses: [], companyId: null, report: null, view: 'summary' };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const pct = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(Number(value)%1?1:0)}%`;
  const num = value => new Intl.NumberFormat('es-ES').format(Number(value || 0));
  const dateFromEpoch = value => Number(value) ? new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(Number(value)*1000)) : 'Sin registro';
  const dateIso = value => value ? new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—';
  const initials = value => String(value || 'U').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();

  function statusBox(id, message='', type='error') {
    const el=$(id); if(!el) return;
    if(!message){ el.className='status-box hidden'; el.textContent=''; return; }
    el.className=`status-box ${type}`; el.textContent=message;
  }
  function globalStatus(message='', type='error') {
    const el=$('globalStatus');
    el.innerHTML=message?`<div class="status-box ${type}">${esc(message)}</div>`:'';
  }
  function loading(on){ $('loadingBlock').classList.toggle('hidden',!on); }
  function clearSession(){ state.token=''; state.user=null; state.accesses=[]; state.report=null; localStorage.removeItem('tablero_portal_token'); localStorage.removeItem('tablero_empresa'); }

  async function invoke(body, authenticated=true){
    const headers={'content-type':'application/json'};
    if(cfg.supabaseKey) headers.apikey=cfg.supabaseKey;
    if(authenticated && state.token) headers.authorization=`Bearer ${state.token}`;
    let response;
    try{
      response=await fetch(`${cfg.supabaseUrl}/functions/v1/${cfg.dashboardFunction}`,{method:'POST',headers,body:JSON.stringify(body)});
    }catch(_){ throw new Error('No fue posible conectar con el tablero.'); }
    const data=await response.json().catch(()=>({}));
    if(!response.ok || data?.ok===false){
      if(response.status===401 && authenticated) clearSession();
      throw new Error(data?.error || 'La operación no pudo completarse.');
    }
    return data;
  }

  async function loadMe(){
    const data=await invoke({action:'me'});
    state.user=data.user||null;
    state.accesses=data.accesses||[];
    if(!state.accesses.length) throw new Error('Tu usuario no tiene una empresa asignada.');
    const saved=localStorage.getItem('tablero_empresa');
    state.companyId=state.accesses.some(a=>a.empresa_id===saved)?saved:state.accesses[0].empresa_id;
    renderCompanySwitch();
  }

  function renderCompanySwitch(){
    const select=$('companySwitch');
    select.innerHTML=state.accesses.map(a=>`<option value="${esc(a.empresa_id)}">${esc(a.academia_empresas?.nombre || 'Empresa')}</option>`).join('');
    select.value=state.companyId;
    select.classList.toggle('hidden',state.accesses.length<2);
    const access=state.accesses.find(a=>a.empresa_id===state.companyId);
    $('companyName').textContent=access?.academia_empresas?.nombre || 'Empresa';
    $('printCompany').textContent=access?.academia_empresas?.nombre || '';
    $('userAvatar').textContent=initials(state.user?.nombre || state.user?.email);
  }

  async function loadDashboard(force=false){
    loading(true); globalStatus();
    try{
      const data=await invoke({action:'dashboard',empresa_id:state.companyId,inactive_days:cfg.inactiveDays,force_refresh:force});
      state.report=data.report;
      renderReport();
      $('syncNote').textContent=`Datos ${data.cached?'en caché':'actualizados'} · ${dateIso(state.report?.generated_at)} · inactividad: ${state.report?.inactive_days || cfg.inactiveDays} días`;
    }catch(error){
      globalStatus(error.message);
      if(!state.token) showLogin();
    } finally { loading(false); }
  }

  function metricCards(summary={}){
    const cards=[
      ['Participantes',num(summary.participants),'Personas asignadas',''],
      ['Matriculados',num(summary.enrolled),'Confirmados en Moodle',''],
      ['Activos',num(summary.active),`Acceso en últimos ${state.report?.inactive_days||cfg.inactiveDays} días`,'good'],
      ['Nunca ingresaron',num(summary.never_accessed),'Requieren seguimiento','alert'],
      ['Completados',num(summary.completed),'Cursos finalizados','good'],
      ['Horas completadas',`${num(Number(summary.completed||0)*HOURS_PER_COURSE)} h`,`${HOURS_PER_COURSE} h por curso completado`,'good'],
      ['Avance promedio',pct(summary.average_progress),'Actividades completadas',''],
      ['Asistencia',pct(summary.attendance_average),'Registros esperados vs. realizados','']
    ];
    return cards.map(([label,value,sub,cls])=>`<article class="metric-card ${cls}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></article>`).join('');
  }

  function courseCard(row){
    const c=row.company_course||{}, s=row.summary||{};
    const status=Number(s.alerts||0)>0?'warn':'ok';
    return `<article class="course-card">
      <div class="course-card-top"><div><h3>${esc(c.moodle_course_name || 'Curso')}</h3><small>${esc(row.contract?.codigo || '')}${c.fecha_inicio||c.fecha_fin?` · ${esc(c.fecha_inicio||'')} → ${esc(c.fecha_fin||'')}`:''}</small></div><span class="badge ${status}">${Number(s.alerts||0)?`${num(s.alerts)} alertas`:'Sin alertas'}</span></div>
      <div class="course-stats"><div class="course-stat"><strong>${num(s.participants)}</strong><span>Participantes</span></div><div class="course-stat"><strong>${num(s.completed)}</strong><span>Completados</span></div><div class="course-stat"><strong>${pct(s.attendance_average)}</strong><span>Asistencia</span></div></div>
      <div class="progress-wrap"><div class="progress-label"><span>Avance promedio</span><strong>${pct(s.average_progress)}</strong></div><div class="progress"><span style="width:${Math.max(0,Math.min(100,Number(s.average_progress||0)))}%"></span></div></div>
      <div class="page-actions no-print" style="margin-top:12px"><button class="btn btn-secondary btn-small" type="button" data-course-people="${esc(c.id)}">Ver empleados</button></div>
    </article>`;
  }

  function personKey(person){
    if(Number(person.moodle_user_id||0)>0) return `m:${Number(person.moodle_user_id)}`;
    const email=String(person.email||'').trim().toLowerCase(); if(email) return `e:${email}`;
    const document=String(person.document||'').replace(/\s+/g,'').toUpperCase(); if(document) return `d:${document}`;
    return `n:${String(person.fullname||'').trim().toLowerCase()}`;
  }
  function flattenPeople(){
    const raw=(state.report?.courses||[]).flatMap(row=>(row.students||[]).map(person=>({...person,course_name:row.company_course?.moodle_course_name||'Curso',course_line_id:row.company_course?.id||''})));
    const completedCourses=new Map();
    raw.forEach(person=>{
      const key=personKey(person);
      if(!completedCourses.has(key)) completedCourses.set(key,new Set());
      if(person.completed===true) completedCourses.get(key).add(person.course_line_id||person.course_name);
    });
    return raw.map(person=>({...person,training_hours:(completedCourses.get(personKey(person))?.size||0)*HOURS_PER_COURSE}));
  }
  function flattenAlerts(){ return flattenPeople().flatMap(p=>(p.alerts||[]).map(a=>({...a,fullname:p.fullname,course_name:p.course_name,email:p.email}))); }
  function accessBadge(person){
    if(person.completed) return '<span class="badge ok">Completado</span>';
    if(person.access_status==='active') return '<span class="badge info">Activo</span>';
    if(person.access_status==='inactive') return '<span class="badge warn">Inactivo</span>';
    return '<span class="badge danger">Nunca ingresó</span>';
  }
  function attendanceValue(person){ const a=person.attendance||{}; return a.available ? pct(a.percentage) : '—'; }

  function renderPeopleFilters(){
    const select=$('peopleCourse'); const current=select.value;
    select.innerHTML='<option value="">Todos los cursos</option>'+(state.report?.courses||[]).map(r=>`<option value="${esc(r.company_course?.id||'')}">${esc(r.company_course?.moodle_course_name||'Curso')}</option>`).join('');
    if([...select.options].some(o=>o.value===current)) select.value=current;
  }
  function renderPeople(){
    const q=String($('peopleSearch').value||'').toLowerCase().trim(); const course=$('peopleCourse').value; const status=$('peopleStatus').value;
    let rows=flattenPeople();
    if(q) rows=rows.filter(p=>[p.fullname,p.email,p.document].some(v=>String(v||'').toLowerCase().includes(q)));
    if(course) rows=rows.filter(p=>p.course_line_id===course);
    if(status==='completed') rows=rows.filter(p=>p.completed===true); else if(status==='attention') rows=rows.filter(p=>p.status==='attention'); else if(status) rows=rows.filter(p=>p.access_status===status);
    $('peopleBody').innerHTML=rows.length?rows.map(p=>`<tr><td><span class="person-name">${esc(p.fullname)}</span><span class="person-sub">${esc(p.email||p.document||'')}</span></td><td>${esc(p.course_name)}</td><td>${accessBadge(p)}<span class="person-sub">${esc(dateFromEpoch(p.lastcourseaccess))}</span></td><td><strong>${pct(p.progress)}</strong><span class="person-sub">${p.activities_pending==null?'—':`${num(p.activities_pending)} pendientes`}</span></td><td>${pct(p.grade?.percentage)}</td><td>${attendanceValue(p)}</td><td><strong>${num(p.training_hours)} h</strong><span class="person-sub">${num(p.training_hours/HOURS_PER_COURSE)} curso(s) completado(s)</span></td><td>${p.status==='attention'?'<span class="badge warn">Atención</span>':p.completed?'<span class="badge ok">Finalizado</span>':'<span class="badge info">En curso</span>'}</td></tr>`).join(''):`<tr><td colspan="8"><div class="empty"><strong>Sin resultados</strong>Prueba con otro filtro.</div></td></tr>`;
  }

  function alertRow(a){ return `<div class="alert-row"><span class="alert-dot ${a.severity==='danger'?'danger':'warn'}"></span><div><strong>${esc(a.fullname)}</strong> · ${esc(a.course_name)}<div class="muted">${esc(a.message)}</div></div></div>`; }
  function renderAlerts(){
    const alerts=flattenAlerts(); $('alertCount').textContent=num(alerts.length);
    $('alertsList').innerHTML=alerts.length?alerts.map(alertRow).join(''):'<div class="empty"><strong>Sin alertas activas</strong>No hay situaciones que requieran seguimiento con los criterios actuales.</div>';
    $('summaryAlerts').innerHTML=alerts.length?alerts.slice(0,5).map(alertRow).join(''):'<div class="empty"><strong>Todo en orden</strong>No hay alertas activas.</div>';
  }
  function renderCourseReport(){
    const rows=state.report?.courses||[];
    $('reportCourseBody').innerHTML=rows.length?rows.map(r=>{const s=r.summary||{};return `<tr><td><span class="person-name">${esc(r.company_course?.moodle_course_name||'Curso')}</span></td><td>${num(s.participants)}</td><td>${num(s.active)}</td><td>${num(s.completed)}</td><td>${num(Number(s.completed||0)*HOURS_PER_COURSE)} h</td><td>${pct(s.average_progress)}</td><td>${pct(s.average_grade)}</td><td>${pct(s.attendance_average)}</td><td>${num(s.alerts)}</td></tr>`;}).join(''):'<tr><td colspan="9"><div class="empty">No hay cursos disponibles.</div></td></tr>';
  }
  function renderReport(){
    const report=state.report||{summary:{},courses:[]}; const s=report.summary||{};
    $('metricGrid').innerHTML=metricCards(s); $('reportMetrics').innerHTML=metricCards(s); $('summaryCourseCount').textContent=`${num(report.courses?.length||0)} cursos`;
    const cards=(report.courses||[]).map(courseCard).join(''); const empty='<div class="empty"><strong>Aún no hay participantes</strong>Cuando se incorporen y matriculen empleados desde Gestión, su avance aparecerá aquí automáticamente.</div>';
    $('summaryCourses').innerHTML=cards||empty; $('courseGrid').innerHTML=cards||empty; renderPeopleFilters(); renderPeople(); renderAlerts(); renderCourseReport();
  }

  function setView(view){
    state.view=view; document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`)); document.querySelectorAll('.bottom-nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    const copy={summary:['Resumen ejecutivo','Estado actual de la formación de tu equipo.'],courses:['Cursos contratados','Métricas y avance por cada curso empresarial.'],people:['Personas y avance','Seguimiento individual de los empleados asignados.'],alerts:['Alertas de seguimiento','Personas que requieren atención según acceso, avance y calificaciones.'],report:['Informe de avance','Resumen preparado para revisión y descarga.']};
    $('pageTitle').textContent=copy[view][0]; $('pageSubtitle').textContent=copy[view][1]; window.scrollTo({top:0,behavior:'smooth'});
  }

  function csv(){
    const rows=flattenPeople(); const header=['Empresa','Curso','Nombre','Correo','Documento','Matriculado','Último acceso','Estado acceso','Avance %','Nota %','Asistencia %','Horas acumuladas','Completado','Alertas']; const company=state.report?.company?.nombre||'';
    const data=[header,...rows.map(p=>[company,p.course_name,p.fullname,p.email||'',p.document||'',p.enrolled?'Sí':'No',dateFromEpoch(p.lastcourseaccess),p.access_status||'',p.progress??'',p.grade?.percentage??'',p.attendance?.available?p.attendance.percentage:'',p.training_hours||0,p.completed?'Sí':'No',(p.alerts||[]).map(a=>a.message).join(' | ')])];
    const content='\ufeff'+data.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\r\n'); const blob=new Blob([content],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`avance-${company.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'empresa'}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  async function enterApp(){
    $('authShell').classList.add('hidden'); $('appShell').classList.remove('hidden'); renderCompanySwitch(); await loadDashboard(false);
  }
  function showLogin(){ $('appShell').classList.add('hidden'); $('authShell').classList.remove('hidden'); }

  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault(); statusBox('loginStatus');
    const button=e.submitter; if(button) button.disabled=true;
    try{
      const data=await invoke({action:'login',email:$('loginEmail').value.trim(),password:$('loginPassword').value},false);
      state.token=data.token; state.user=data.user||null; state.accesses=data.accesses||[]; localStorage.setItem('tablero_portal_token',state.token);
      const saved=localStorage.getItem('tablero_empresa'); state.companyId=state.accesses.some(a=>a.empresa_id===saved)?saved:state.accesses[0]?.empresa_id||null;
      if(!state.companyId) throw new Error('Tu usuario no tiene una empresa asignada.');
      await enterApp();
    }catch(error){ statusBox('loginStatus',error.message); }
    finally{ if(button) button.disabled=false; }
  });

  $('logoutBtn').addEventListener('click',async()=>{ try{ if(state.token) await invoke({action:'logout'}); }catch(_){} clearSession(); showLogin(); });
  $('refreshBtn').addEventListener('click',()=>loadDashboard(true));
  $('companySwitch').addEventListener('change',async e=>{state.companyId=e.target.value;localStorage.setItem('tablero_empresa',state.companyId);renderCompanySwitch();await loadDashboard(false);});
  document.querySelector('.bottom-nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view);});
  document.addEventListener('click',e=>{const open=e.target.closest('[data-open-view]');if(open)setView(open.dataset.openView);const course=e.target.closest('[data-course-people]');if(course){$('peopleCourse').value=course.dataset.coursePeople;renderPeople();setView('people');}});
  ['peopleSearch','peopleCourse','peopleStatus'].forEach(id=>$(id).addEventListener(id==='peopleSearch'?'input':'change',renderPeople));
  $('csvBtn').addEventListener('click',csv); $('printBtn').addEventListener('click',()=>window.print());

  async function init(){
    $('authLogo').src=cfg.brand.logo; $('topLogo').src=cfg.brand.logo;
    if(!state.token){ showLogin(); return; }
    try{ await loadMe(); await enterApp(); }
    catch(_){ clearSession(); showLogin(); }
  }
  init();
})();
