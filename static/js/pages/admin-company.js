import { getCompany, saveCompany } from '../firebase/settings.js';
import { showToast } from '../core/toast.js';
const $ = s => document.querySelector(s);
export async function mount() {
  document.getElementById('adminTitle').textContent = '회사정보';
  const host = document.getElementById('adminGrid');
  host.style.cssText = 'padding:20px;overflow:auto';
  const fields = [
    ['biz_name','상호'],['biz_no','사업자번호'],['ceo','대표자'],['phone','대표전화'],
    ['address','주소'],['biz_type','업태'],['biz_item','종목'],
    ['bank_name','입금은행'],['bank_account','입금계좌'],['bank_holder','예금주'],
  ];
  host.innerHTML = `<div style="max-width:600px"><div class="form-section"><div class="form-section-title">회사정보</div><div class="form-grid">${
    fields.map(([k,l])=>`<div class="field"><label>${l}</label><input type="text" name="${k}"></div>`).join('')
  }</div></div><div style="margin-top:12px;text-align:right"><button class="btn btn-primary" id="companySave">저장</button></div></div>`;
  try { const c = await getCompany(); if(c) fields.forEach(([k])=>{ const i=host.querySelector(`[name="${k}"]`); if(i&&c[k]) i.value=c[k]; }); } catch{}
  $('#companySave')?.addEventListener('click', async()=>{
    const data={}; host.querySelectorAll('[name]').forEach(el=>{data[el.name]=el.value.trim()});
    try { await saveCompany(data); showToast('저장 완료','success'); } catch(e){ showToast(e.message,'error'); }
  });
}
