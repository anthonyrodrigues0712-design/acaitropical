(function(){
    const DB_NAME='acaiDB';
    const DB_VERSION=2;
    const STORE_SALES='sales';
    const STORE_REPORTS='reports';
    const STORE_META='meta';
    const STORE_DAILY='dailyTotals';

    function openDB(){
      return new Promise((resolve,reject)=>{
        const req=indexedDB.open(DB_NAME,DB_VERSION);
        req.onupgradeneeded=function(ev){
          const db=ev.target.result;
          if(!db.objectStoreNames.contains(STORE_SALES)) db.createObjectStore(STORE_SALES,{keyPath:'id'});
          if(!db.objectStoreNames.contains(STORE_REPORTS)) db.createObjectStore(STORE_REPORTS,{keyPath:'id'});
          if(!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META,{keyPath:'key'});
          if(!db.objectStoreNames.contains(STORE_DAILY)) db.createObjectStore(STORE_DAILY,{keyPath:'key'});
        };
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error);
      });
    }

    async function dbGetAll(storeName){
      const db=await openDB();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(storeName,'readonly');
        const store=tx.objectStore(storeName);
        const req=store.getAll();
        req.onsuccess=()=>resolve(req.result||[]);
        req.onerror=()=>reject(req.error);
      });
    }

    async function dbAdd(storeName,obj){
      const db=await openDB();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(storeName,'readwrite');
        const store=tx.objectStore(storeName);
        const req=store.add(obj);
        req.onsuccess=()=>resolve(req.result);
        req.onerror=(e)=>reject(e.target.error);
      });
    }

    async function dbPut(storeName,obj){
      const db=await openDB();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(storeName,'readwrite');
        const store=tx.objectStore(storeName);
        const req=store.put(obj);
        req.onsuccess=()=>resolve(req.result);
        req.onerror=(e)=>reject(e.target.error);
      });
    }

    async function dbGet(storeName,key){
      const db=await openDB();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(storeName,'readonly');
        const store=tx.objectStore(storeName);
        const req=store.get(key);
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error);
      });
    }

    async function dbDelete(storeName,key){
      const db=await openDB();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(storeName,'readwrite');
        const store=tx.objectStore(storeName);
        const req=store.delete(key);
        req.onsuccess=()=>resolve();
        req.onerror=()=>reject(req.error);
      });
    }

    async function dbClear(storeName){
      const db=await openDB();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(storeName,'readwrite');
        const store=tx.objectStore(storeName);
        const req=store.clear();
        req.onsuccess=()=>resolve();
        req.onerror=()=>reject(req.error);
      });
    }

    async function dbDeleteBySeller(storeName,sellerUsername){
      const all=await dbGetAll(storeName);
      for(const it of all){
        if(it && it.seller===sellerUsername){
          const key=it.id||it.key;
          if(key){
            try{ await dbDelete(storeName,key); }catch(e){ console.warn('Erro ao deletar item:',e); }
          }
        }
      }
    }

    const USERS_KEY='acai_users_v1';
    const LOGGED_KEY='loggedUser';

    function seedUsersIfNeeded(){
      const raw=localStorage.getItem(USERS_KEY);
      if(!raw){
        const demo=[
          {username:'vendedor1',password:'1234',name:'Carlos'},
          {username:'vendedor2',password:'abcd',name:'Mariana'}
        ];
        localStorage.setItem(USERS_KEY,JSON.stringify(demo));
      }
    }

    function getUsers(){ try{ return JSON.parse(localStorage.getItem(USERS_KEY))||[]; }catch{ return []; } }
    function saveUsers(users){ localStorage.setItem(USERS_KEY,JSON.stringify(users)); }
    function getLoggedUser(){ try{ return JSON.parse(localStorage.getItem(LOGGED_KEY)); }catch{ return null; } }
    function setLoggedUser(user){ localStorage.setItem(LOGGED_KEY,JSON.stringify(user)); }
    function clearLoggedUser(){ localStorage.removeItem(LOGGED_KEY); }

    async function migrateLocalStorageIfNeeded(){
      try{
        const s=localStorage.getItem('acai_sales_v1');
        const r=localStorage.getItem('acai_reports_v1');
        const m=localStorage.getItem('acai_meta_v1');
        const existingSales=await dbGetAll(STORE_SALES);
        if(existingSales.length===0 && s){
          const sales=JSON.parse(s);
          for(const sale of sales){
            if(!sale.id) sale.id='S'+Date.now()+Math.random();
            await dbPut(STORE_SALES,sale);
          }
        }
        const existingReports=await dbGetAll(STORE_REPORTS);
        if(existingReports.length===0 && r){
          const reports=JSON.parse(r);
          for(const rep of reports){
            if(!rep.id) rep.id='R'+Date.now()+Math.random();
            await dbPut(STORE_REPORTS,rep);
          }
        }
        if(m){
          const parsed=parseFloat(m);
          if(!isNaN(parsed)) await dbPut(STORE_META,{key:'global_dailyGoal',value:parsed});
        }
      }catch(err){
        console.warn('Migração localStorage falhou (não crítica):',err);
      }
    }

    const PRICE_SUGGEST={agua:3.00,refri:5.00};
    let sales=[];
    let reports=[];
    let dailyGoal=500.00;
    let currentUser=null;

    const openSaleLayerBtn=document.getElementById('openSaleLayer');
    const saleLayer=document.getElementById('saleLayer');
    const closeSaleLayerBtn=document.getElementById('closeSaleLayer');
    const productSelect=document.getElementById('product');
    const quantityInput=document.getElementById('quantity');
    const unitPriceInput=document.getElementById('unitPriceInput');
    const totalPriceEl=document.getElementById('totalPrice');
    const paymentMethodSelect=document.getElementById('paymentMethod');
    const confirmSaleBtn=document.getElementById('confirmSaleBtn');
    const recentSalesEl=document.getElementById('recentSales');
    const ordersTodayEl=document.getElementById('ordersToday');
    const revenueTodayEl=document.getElementById('revenueToday');
    const vendorNameCardEl=document.getElementById('vendorNameCard');
    const progressBar=document.getElementById('progressBar');
    const metaPercent=document.getElementById('metaPercent');
    const metaTargetValue=document.getElementById('metaTargetValue');
    const metaNote=document.getElementById('metaNote');
    const reportsListEl=document.getElementById('reportsList');
    const generateReportBtn=document.getElementById('generateReportBtn');
    const clearSalesBtn=document.getElementById('clearSalesBtn');
    const saleMsg=document.getElementById('saleMsg');
    const metaInput=document.getElementById('metaInput');
    const saveMetaBtn=document.getElementById('saveMetaBtn');
    const paymentFilter=document.getElementById('paymentFilter');
    const totalDinheiroEl=document.getElementById('totalDinheiro');
    const totalPIXEl=document.getElementById('totalPIX');
    const totalCartaoEl=document.getElementById('totalCartao');
    const vendedorNomeEl=document.getElementById('vendedorNome');
    const logoutBtn=document.getElementById('logoutBtn');
    const loginLayer=document.getElementById('loginLayer');
    const loginUserInput=document.getElementById('loginUser');
    const loginPassInput=document.getElementById('loginPass');
    const loginBtn=document.getElementById('loginBtn');
    const loginError=document.getElementById('loginError');
    const createUserBtn=document.getElementById('createUserBtn');
    const dateFilter=document.getElementById('dateFilter');
    const dailyTotalsList=document.getElementById('dailyTotalsList');

    const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
    const formatDateTime=ts=>new Date(ts).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});

    function userGoalKey(username){ return `dailyGoal_${username}`; }

    async function init(){
      try{
        seedUsersIfNeeded();
        await openDB();
        await migrateLocalStorageIfNeeded();
        sales=await dbGetAll(STORE_SALES);
        reports=await dbGetAll(STORE_REPORTS);
        bindEvents();
        restoreLogin();
        await computeDailyTotalsForAllDates();
        scheduleMidnightRollover();
        updateUI();
      }catch(err){
        console.error('Erro inicializando app:',err);
        alert('Erro ao inicializar o banco local. Veja o console.');
      }
    }

    function bindEvents(){
      openSaleLayerBtn.addEventListener('click',()=>{ if(!currentUser){ showLoginLayer(true); return; } showSaleLayer(true); });
      closeSaleLayerBtn.addEventListener('click',()=>showSaleLayer(false));
      saleLayer.addEventListener('click',(e)=>{ if(e.target===saleLayer) showSaleLayer(false); });
      productSelect.addEventListener('change',onProductChange);
      quantityInput.addEventListener('input',updateTotalFromInputs);
      unitPriceInput.addEventListener('input',updateTotalFromInputs);
      confirmSaleBtn.addEventListener('click',handleConfirmSale);
      generateReportBtn.addEventListener('click',()=>{ if(!currentUser){ showLoginLayer(true); return; } handleGenerateReport(); });
      clearSalesBtn.addEventListener('click',async()=>{
        if(!currentUser){ showLoginLayer(true); return; }
        if(!confirm('Limpar histórico apenas de vendas do usuário logado? Esta ação não pode ser desfeita.')) return;
        await dbDeleteBySeller(STORE_SALES,currentUser.username);
        sales=(await dbGetAll(STORE_SALES))||[];
        await computeDailyTotalsForAllDates();
        updateUI();
      });
      saveMetaBtn.addEventListener('click',async()=>{
        if(!currentUser){ showLoginLayer(true); return; }
        const val=parseFloat(metaInput.value);
        if(isNaN(val)||val<0){ alert('Insira um valor válido para a meta.'); return; }
        dailyGoal=+val.toFixed(2);
        await dbPut(STORE_META,{key:userGoalKey(currentUser.username),value:dailyGoal});
        updateUI();
        alert('Meta atualizada: '+money(dailyGoal));
      });
      paymentFilter.addEventListener('change',()=>renderRecentSales());
      loginBtn.addEventListener('click',doLogin);
      loginUserInput.addEventListener('keydown',(e)=>{ if(e.key==='Enter') doLogin(); });
      loginPassInput.addEventListener('keydown',(e)=>{ if(e.key==='Enter') doLogin(); });
      createUserBtn.addEventListener('click',createDemoUser);
      logoutBtn.addEventListener('click',()=>{
        clearLoggedUser();
        currentUser=null;
        vendedorNomeEl.textContent='—';
        updateUI();
        showLoginLayer(true);
      });
      dateFilter.addEventListener('change',()=>{ renderRecentSales(); });
    }

    function restoreLogin(){
      const u=getLoggedUser();
      if(u && u.username){
        currentUser=u;
        vendedorNomeEl.textContent=currentUser.name||currentUser.username;
        loadUserMeta().then(()=>{ showLoginLayer(false); updateUI(); });
      }else{
        showLoginLayer(true);
      }
    }

    function showLoginLayer(show=true){
      loginLayer.style.display=show?'flex':'none';
      loginLayer.setAttribute('aria-hidden',show?'false':'true');
      if(show){
        loginUserInput.value='';
        loginPassInput.value='';
        loginError.style.display='none';
        loginUserInput.focus();
      }
    }

    function showSaleLayer(show=true){
      saleLayer.style.display=show?'flex':'none';
      saleLayer.setAttribute('aria-hidden',show?'false':'true');
      saleMsg.textContent='';
      if(show){
        productSelect.value='acai';
        quantityInput.value=1;
        unitPriceInput.value='';
        paymentMethodSelect.value='Dinheiro';
        onProductChange();
        unitPriceInput.focus();
      }
    }

    function createDemoUser(){
      const username=loginUserInput.value.trim()||'vendedor'+Math.floor(Math.random()*1000);
      const password=loginPassInput.value.trim()||'1234';
      const name=username;
      const users=getUsers();
      if(users.some(u=>u.username===username)){
        loginError.textContent='Usuário já existe. Tente outro usuário.';
        loginError.style.display='block';
        return;
      }
      users.push({username,password,name});
      saveUsers(users);
      loginError.style.display='none';
      alert(`Usuário criado: ${username} (senha: ${password}). Faça login para começar.`);
    }

    async function doLogin(){
      const user=loginUserInput.value.trim();
      const pass=loginPassInput.value.trim();
      const users=getUsers();
      const found=users.find(u=>u.username===user&&u.password===pass);
      if(!found){
        loginError.style.display='block';
        return;
      }
      currentUser=found;
      setLoggedUser(found);
      vendedorNomeEl.textContent=currentUser.name||currentUser.username;
      await loadUserMeta();
      showLoginLayer(false);
      updateUI();
    }

    function onProductChange(){
      const prod=productSelect.value;
      if(PRICE_SUGGEST.hasOwnProperty(prod)) unitPriceInput.value=PRICE_SUGGEST[prod].toFixed(2);
      else unitPriceInput.value='';
      updateTotalFromInputs();
    }

    function updateTotalFromInputs(){
      const qty=Math.max(1,parseInt(quantityInput.value)||1);
      const unit=Math.max(0,parseFloat(unitPriceInput.value)||0);
      const total=+(unit*qty).toFixed(2);
      totalPriceEl.textContent=money(total);
    }

    function dateKeyFromTs(ts){
      const d=new Date(ts);
      const y=d.getFullYear();
      const m=String(d.getMonth()+1).padStart(2,'0');
      const day=String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`;
    }

    async function computeDailyTotalsForDate(dateStr){
      const allSales=await dbGetAll(STORE_SALES);
      const daySales=allSales.filter(s=>dateKeyFromTs(s.ts)===dateStr);
      const totalsPerSeller={};
      let total=0;
      for(const s of daySales){
        total+=s.total;
        if(!totalsPerSeller[s.seller]) totalsPerSeller[s.seller]=0;
        totalsPerSeller[s.seller]+=s.total;
      }
      const record={ key:dateStr, date:dateStr, total:+total.toFixed(2), perSeller:totalsPerSeller };
      try{ await dbPut(STORE_DAILY,record); }catch(e){ console.warn('Falha ao gravar dailyTotals:',e); }
      await populateDateFilter();
      renderDailyTotalsList();
    }

    async function computeDailyTotalsForAllDates(){
      const allSales=await dbGetAll(STORE_SALES);
      const dateSet=new Set();
      for(const s of allSales) dateSet.add(dateKeyFromTs(s.ts));
      for(const d of dateSet) await computeDailyTotalsForDate(d);
      await populateDateFilter();
      renderDailyTotalsList();
    }

    function msUntilNextMidnight(){
      const now=new Date();
      const next=new Date(now);
      next.setDate(now.getDate()+1);
      next.setHours(0,0,0,0);
      return next - now;
    }

    function scheduleMidnightRollover(){
      const ms=msUntilNextMidnight();
      setTimeout(async()=>{
        const yesterday=new Date();
        yesterday.setDate(yesterday.getDate()-1);
        const key=dateKeyFromTs(yesterday.getTime());
        await computeDailyTotalsForDate(key);
        await computeDailyTotalsForAllDates();
        updateUI();
        scheduleMidnightRollover();
      },ms+2000);
    }

    async function populateDateFilter(){
      const daily=await dbGetAll(STORE_DAILY);
      daily.sort((a,b)=>b.date.localeCompare(a.date));
      dateFilter.innerHTML='<option value="all">Todas as datas</option>';
      for(const d of daily){
        const opt=document.createElement('option');
        opt.value=d.date;
        opt.textContent=d.date+' — '+money(d.total);
        dateFilter.appendChild(opt);
      }
    }

    async function renderDailyTotalsList(){
      const daily=await dbGetAll(STORE_DAILY);
      daily.sort((a,b)=>b.date.localeCompare(a.date));
      dailyTotalsList.innerHTML='';
      if(daily.length===0){ dailyTotalsList.innerHTML='<div class="muted">Nenhum total diário calculado.</div>'; return; }
      for(const d of daily){
        const el=document.createElement('div');
        el.className='daily-item';
        const left=document.createElement('div');
        left.textContent=d.date;
        const right=document.createElement('div');
        right.textContent=money(d.total);
        el.appendChild(left);
        el.appendChild(right);
        el.addEventListener('click',()=>{
          dateFilter.value=d.date;
          renderRecentSales();
        });
        dailyTotalsList.appendChild(el);
      }
    }

    async function handleConfirmSale(){
      if(!currentUser){ showLoginLayer(true); return; }
      const prod=productSelect.value;
      const qty=Math.max(1,parseInt(quantityInput.value)||1);
      const unit=Math.max(0,parseFloat(unitPriceInput.value)||0);
      const total=+(unit*qty).toFixed(2);
      const paymentMethod=paymentMethodSelect.value||'Dinheiro';
      const ts=Date.now();
      const id='S'+ts;
      if(unit<=0){ if(!confirm('Preço unitário é zero. Deseja registrar a venda mesmo assim?')) return; }
      const sale={ id, product:prod, qty, unit, total, paymentMethod, ts, seller:currentUser.username, sellerName:currentUser.name||currentUser.username };
      try{ await dbAdd(STORE_SALES,sale); }catch(err){ await dbPut(STORE_SALES,sale); }
      sales=[sale,...sales.filter(s=>s.id!==sale.id)];
      const dayKey=dateKeyFromTs(sale.ts);
      await computeDailyTotalsForDate(dayKey);
      saleMsg.textContent=`Venda registrada: ${productLabel(prod)} — ${qty} x ${money(unit)} = ${money(total)} (${paymentMethod})`;
      setTimeout(()=>saleMsg.textContent='',3000);
      updateUI();
      showSaleLayer(false);
    }

    function productLabel(k){
      if(k==='acai') return 'Açaí';
      if(k==='agua') return 'Água';
      if(k==='refri') return 'Refrigerante';
      return k;
    }

    async function handleGenerateReport(){
      if(!currentUser){ showLoginLayer(true); return; }
      const userSales=sales.filter(s=>s.seller===currentUser.username);
      if(userSales.length===0){ alert('Não há vendas registradas para gerar relatório.'); return; }
      const totalValue=userSales.reduce((s,v)=>s+v.total,0);
      const itemsCount=userSales.reduce((s,v)=>s+v.qty,0);
      const report={ id:'R'+Date.now(), ts:Date.now(), totalValue:+totalValue.toFixed(2), itemsCount, salesCount:userSales.length, items:[...userSales], seller:currentUser.username };
      try{ await dbAdd(STORE_REPORTS,report); }catch(err){ await dbPut(STORE_REPORTS,report); }
      reports=[report,...reports.filter(r=>r.id!==report.id)];
      updateUI();
      downloadReportAsPDF(report);
    }

    function downloadReportAsPDF(report){
      try{
        const { jsPDF } = window.jspdf;
        const doc=new jsPDF({unit:'pt',format:'a4'});
        const margin=40;
        let y=40;
        const lineHeight=13;
        const pageHeight=doc.internal.pageSize.getHeight();
        doc.setFontSize(16);
        doc.setTextColor('#6a1b9a');
        doc.text('Relatório de Vendas - Açaí Tropical',margin,y); y+=20;
        doc.setFontSize(10); doc.setTextColor('#333');
        doc.text(`Gerado em: ${formatDateTime(report.ts)}`,margin,y); y+=16;
        doc.text(`Vendas: ${report.salesCount} — Itens: ${report.itemsCount}`,margin,y); y+=16;
        doc.setDrawColor(220); doc.setLineWidth(0.5);
        doc.line(margin,y,doc.internal.pageSize.getWidth()-margin,y); y+=12;
        const pageWidth=doc.internal.pageSize.getWidth();
        const cw={produto:140,qtd:36,unit:60,total:60,forma:70,vendedor:90};
        const startX=margin;
        const col={produto:startX,qtd:startX+cw.produto,unit:startX+cw.produto+cw.qtd,total:startX+cw.produto+cw.qtd+cw.unit,forma:startX+cw.produto+cw.qtd+cw.unit+cw.total,vendedor:startX+cw.produto+cw.qtd+cw.unit+cw.total+cw.forma,hora:pageWidth-margin};
        doc.setFontSize(10); doc.setFont(undefined,'bold');
        doc.text('Produto',col.produto,y);
        doc.text('Qtd',col.qtd+cw.qtd/2,y,{align:'center'});
        doc.text('Unitário',col.unit+cw.unit-2,y,{align:'right'});
        doc.text('Total',col.total+cw.total-2,y,{align:'right'});
        doc.text('Forma',col.forma+4,y);
        doc.text('Vendedor',col.vendedor+4,y);
        doc.text('Hora',col.hora,y,{align:'right'});
        doc.setFont(undefined,'normal');
        y+=lineHeight;
        for(let i=0;i<report.items.length;i++){
          const s=report.items[i];
          if(y+30>pageHeight-margin){ doc.addPage(); y=margin; }
          doc.setFontSize(10);
          doc.text(productLabel(s.product),col.produto,y);
          doc.text(String(s.qty),col.qtd+cw.qtd/2,y,{align:'center'});
          doc.text(money(s.unit),col.unit+cw.unit-2,y,{align:'right'});
          doc.text(money(s.total),col.total+cw.total-2,y,{align:'right'});
          doc.text(String(s.paymentMethod),col.forma+4,y);
          doc.text(String(s.sellerName||s.seller||'--'),col.vendedor+4,y);
          doc.text(formatDateTime(s.ts),col.hora,y,{align:'right'});
          y+=lineHeight;
        }
        if(y+40>pageHeight-margin){ doc.addPage(); y=margin; }
        y+=8;
        doc.line(margin,y,pageWidth-margin,y); y+=14;
        doc.setFont(undefined,'bold');
        doc.text('TOTAL:',margin,y);
        doc.text(money(report.totalValue),pageWidth-margin,y,{align:'right'});
        const filename=`relatorio_${report.id}.pdf`;
        doc.save(filename);
      }catch(err){
        console.error('Erro ao gerar PDF:',err);
        alert('Erro ao gerar PDF. Veja o console.');
      }
    }

    function updateUI(){
      metaTargetValue.textContent=dailyGoal.toFixed(2).replace('.',',');
      metaInput.value=dailyGoal;
      renderTopCards();
      renderRecentSales();
      renderReports();
      updateMetaProgress();
      renderPaymentTotals();
      vendedorNomeEl.textContent=currentUser? (currentUser.name||currentUser.username) : '—';
      populateDateFilter();
      renderDailyTotalsList();
    }

    function isSameDay(tsA,tsB){
      const a=new Date(tsA), b=new Date(tsB);
      return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
    }

    function renderTopCards(){
      const today=Date.now();
      const todaysSales=sales.filter(s=> currentUser && s.seller===currentUser.username && isSameDay(s.ts,today));
      const ordersToday=todaysSales.length;
      const revenueToday=todaysSales.reduce((sum,s)=>sum+s.total,0);
      ordersTodayEl.textContent=ordersToday;
      revenueTodayEl.textContent=money(revenueToday);
      vendorNameCardEl.textContent=currentUser? (currentUser.name||currentUser.username) : '—';
      document.getElementById('ordersDelta').textContent=`Meta diária: ${money(dailyGoal)}`;
    }

    function renderRecentSales(){
      const filter=paymentFilter.value||'all';
      const dateSel=dateFilter.value||'all';
      let filtered=[...sales].filter(s=> currentUser && s.seller===currentUser.username);
      if(filter!=='all') filtered=filtered.filter(s=>s.paymentMethod===filter);
      if(dateSel!=='all') filtered=filtered.filter(s=>dateKeyFromTs(s.ts)===dateSel);
      const last=filtered.sort((a,b)=>b.ts-a.ts); // show all matching sales (no slice)
      recentSalesEl.innerHTML='';
      if(last.length===0){ recentSalesEl.innerHTML='<p class="muted">Nenhuma venda registrada.</p>'; return; }
      last.forEach(s=>{
        const el=document.createElement('div');
        el.className='sale-item';
        el.innerHTML=`
          <div class="sale-left">
            <div class="sale-title">${productLabel(s.product)}</div>
            <div class="sale-meta">Pedido ${s.id} — ${s.qty} x ${money(s.unit)} — ${s.paymentMethod} — ${s.sellerName || s.seller || '—'}</div>
          </div>
          <div class="sale-right">
            <div class="sale-total">${money(s.total)}</div>
            <div class="sale-time">${formatDateTime(s.ts)}</div>
          </div>
        `;
        recentSalesEl.appendChild(el);
      });
    }

    function renderPaymentTotals(){
      const totals={Dinheiro:0,PIX:0,Cartão:0};
      sales.filter(s=> currentUser && s.seller===currentUser.username).forEach(s=>{ if(totals.hasOwnProperty(s.paymentMethod)) totals[s.paymentMethod]+=s.total; });
      totalDinheiroEl.textContent=money(totals.Dinheiro);
      totalPIXEl.textContent=money(totals.PIX);
      totalCartaoEl.textContent=money(totals.Cartão);
    }

    function renderReports(){
      reportsListEl.innerHTML='';
      const userReports=reports.filter(r=> currentUser && r.seller===currentUser.username);
      if(!userReports || userReports.length===0){ reportsListEl.innerHTML='<p class="muted">Nenhum relatório gerado.</p>'; return; }
      userReports.forEach(r=>{
        const item=document.createElement('div');
        item.className='report-item';
        item.innerHTML=`
          <div class="report-left">
            <div class="report-date">${formatDateTime(r.ts)}</div>
            <div class="report-meta">${r.salesCount} vendas — ${r.itemsCount} itens</div>
          </div>
          <div class="report-right">
            <div class="report-value">${money(r.totalValue)}</div>
            <button class="small-btn view-report">Ver</button>
            <button class="small-btn download-report">Baixar PDF</button>
          </div>
        `;
        item.querySelector('.view-report').addEventListener('click',()=> alert(buildReportQuickText(r)));
        item.querySelector('.download-report').addEventListener('click',()=> downloadReportAsPDF(r));
        reportsListEl.appendChild(item);
      });
    }

    function buildReportQuickText(r){
      const lines=[
        `Relatório: ${formatDateTime(r.ts)}`,
        `Vendas: ${r.salesCount} — Itens: ${r.itemsCount}`,
        `Total: ${money(r.totalValue)}`,
        '',
        'Detalhes:'
      ];
      r.items.forEach(it=>lines.push(`${formatDateTime(it.ts)} — ${productLabel(it.product)} — ${it.qty} x ${money(it.unit)} = ${money(it.total)} — ${it.paymentMethod} — ${it.sellerName || it.seller || '--'}`));
      return lines.join('\n');
    }

    function updateMetaProgress(){
      const today=Date.now();
      const revenueToday=sales.filter(s=> currentUser && s.seller===currentUser.username && isSameDay(s.ts,today)).reduce((sum,s)=>sum+s.total,0);
      const percent=dailyGoal>0? Math.min(100,Math.round((revenueToday/dailyGoal)*100)) : 0;
      progressBar.style.width=percent+'%';
      metaPercent.textContent=percent+'%';
      metaNote.textContent=`R$ ${revenueToday.toFixed(2).replace('.',',')} vendidos hoje.`;
    }

    async function loadUserMeta(){
      if(!currentUser) return;
      try{
        const meta=await dbGet(STORE_META,userGoalKey(currentUser.username));
        if(meta && typeof meta.value==='number') dailyGoal=meta.value;
      }catch(e){ console.warn('Erro ao carregar meta do usuário:',e); }
    }

    init();
  })();
