(() => {
  'use strict';
  const terms = JSON.parse(document.getElementById('terms-data').textContent);
  const amount = document.getElementById('amount');
  const scenario = document.getElementById('scenario');
  const set = (id, value) => document.getElementById(id).textContent = value;
  const money = value => '¥ ' + new Intl.NumberFormat('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2}).format(value);
  function calculate() {
    const value = Number(amount.value);
    const valid = amount.value.trim() !== '' && amount.validity.valid && Number.isFinite(value);
    set('calc-error', valid ? '' : '请输入0至1,000,000,000元的有效金额，最多两位小数。');
    if (!valid) {
      ['total-commission','l1-income','l2-income'].forEach(id=>set(id,'—'));
      set('commission-label','输入有效金额后显示结果'); return;
    }
    const second = scenario.value === 'second';
    const firstRate = second ? terms.override : terms.first;
    const secondRate = second ? terms.second : 0;
    const firstIncome = Math.round(value * firstRate) / 100;
    const secondIncome = Math.round(value * secondRate) / 100;
    set('total-commission', money(firstIncome + secondIncome));
    set('commission-label','合伙人分成合计 ' + (firstRate + secondRate) + '% · 按实际回款计提');
    set('l1-rate', '一级收益 · ' + firstRate + '%');
    set('l2-rate', '二级收益 · ' + secondRate + '%');
    set('l1-income', money(firstIncome)); set('l2-income', money(secondIncome));
  }
  document.getElementById('calculator').addEventListener('submit', e=>e.preventDefault());
  amount.addEventListener('input', calculate); scenario.addEventListener('change', calculate); calculate();
  const dialog = document.getElementById('consult-dialog');
  const form = document.getElementById('consult-form');
  const submit = form.querySelector('[type="submit"]');
  const success = document.getElementById('consult-success');
  let pending = false, unknown = false, previousFocus, bodyOverflow;
  let requestId = crypto.randomUUID();
  document.querySelectorAll('[data-consult]').forEach(button => button.addEventListener('click', () => {
    previousFocus = button;
    if (!success.hidden) {success.hidden=true;form.hidden=false;requestId=crypto.randomUUID();}
    if (button.dataset.consult) form.elements.mode.value=button.dataset.consult;
    bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();
  }));
  function close() {if (!pending) dialog.close();}
  document.getElementById('close-consult').addEventListener('click',close);
  document.getElementById('success-close').addEventListener('click',close);
  dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
  dialog.addEventListener('close',()=>{document.body.style.overflow=bodyOverflow||'';previousFocus?.focus({preventScroll:true});});
  form.addEventListener('submit',async event=>{
    event.preventDefault(); if(pending||unknown||!form.reportValidity())return;
    const payload={...Object.fromEntries(new FormData(form)),consent:form.elements.consent.checked,requestId};
    pending=true;set('form-status','');form.setAttribute('aria-busy','true');
    const fields=[...form.querySelectorAll('input,select,textarea')];fields.forEach(field=>field.disabled=true);
    submit.disabled=true;submit.textContent='正在提交…';
    try {
      const response=await fetch(new URL('api/consult',document.baseURI).href,{method:'POST',headers:{'Content-Type':'application/json','X-Suda-Csrf-Token':decodeURIComponent(document.cookie.split('; ').find(item=>item.startsWith('suda-csrf-token='))?.split('=')[1]||'')},credentials:'same-origin',body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
      const result=await response.json();
      if(response.ok&&result.ok===true){form.reset();form.hidden=true;success.hidden=false;set('receipt','咨询编号：'+result.requestId);document.getElementById('success-close').focus();}
      else {if(['delivery_unknown','in_progress'].includes(result.code))unknown=true;set('form-status',result.message||'暂时无法提交，填写内容已保留。请稍后再试。');if(!unknown)requestId=crypto.randomUUID();}
    }catch{unknown=true;set('form-status','暂时无法确认提交结果，填写内容已保留。请勿重复提交，可稍后联系DeepFocus确认。');}
    finally{pending=false;form.removeAttribute('aria-busy');fields.forEach(field=>field.disabled=false);submit.disabled=unknown;submit.textContent=unknown?'等待确认提交结果':'提交合作咨询';}
  });
})();
