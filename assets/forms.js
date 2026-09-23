/* Enquiry forms: the proposal request on /pricing/ (with its cost estimator) and the booking
   request on /contact/. Both post to the existing contact Worker as form "c", schema unchanged. */
/* Nimbi v0.41. Existing secure live enquiry contract; no credentials in this file. */
(function () {
 'use strict';
 var endpoint = 'https://nimbi-contact.nimbi-website.workers.dev';
 var sitekey = '0x4AAAAAAEoZ_xYFhf2xFw1I';
 var live = window.location.protocol === 'https:' && /^(www\.)?nimbi\.com\.au$/i.test(window.location.hostname);
 var forms = Array.prototype.slice.call(document.querySelectorAll('form[data-enquiry-kind]'));
 var widgets = new Map();
 var widgetLoading;
 var proposal = document.getElementById('proposal-form');
 function field(form, name) { return form.elements.namedItem(name); }
 function val(form, name) { var el = field(form, name); return el ? el.value.trim() : ''; }
 function money(n) { return '$' + n.toLocaleString('en-AU', { maximumFractionDigits: 0 }); }
 function checkCount(value) {
  if (String(value).trim() === '') return 0;
  var n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= 100000 ? n : null;
 }
 function quote(plan, kycValue, kybValue) {
  var kyc = checkCount(kycValue), kyb = checkCount(kybValue);
  if (kyc === null || kyb === null) return { invalid:true };
  if (plan === 'Nimbi Comprehensive') return { tailored:true, kyc:kyc, kyb:kyb };
  return { kyc:kyc, kyb:kyb, usage:kyc*19+kyb*45, monthly:159+kyc*19+kyb*45 };
 }
 function currentQuote() { return quote(val(proposal,'plan'), val(proposal,'kyc'), val(proposal,'kyb')); }
 function renderEstimate() {
  if (!proposal) return;
  var q=currentQuote();
  var label=document.getElementById('estimate-label'), amount=document.getElementById('estimate-value');
  var breakdown=document.getElementById('estimate-breakdown'), note=document.getElementById('estimate-note');
  if(q.invalid){ label.textContent='Check your volumes';amount.textContent='—';breakdown.textContent='Enter a whole number of zero or more for each check type.';note.textContent='We’ll help confirm your expected usage in the proposal.';return; }
  if(q.tailored){ label.textContent='Tailored to your business';amount.textContent='Price on application';breakdown.textContent='12 months of subscription + 60 KYC + 20 KYB checks included.';note.textContent='Your monthly volumes help us scope the proposal. The included checks are a total allowance for the first 12 months, not a monthly allowance. Extra checks are charged separately.';return; }
  label.textContent='Estimated monthly cost';amount.textContent=money(q.monthly);
  breakdown.textContent='$159 subscription + '+money(q.usage)+' checks';
  note.textContent='AUD, ex GST. '+(q.usage ? q.kyc+' KYC and '+q.kyb+' KYB checks per month. ' : 'Add your expected checks above. ')+'A 12-month subscription term applies. Actual usage may vary.';
 }
 function status(form, message, state) {
  var el=form.querySelector('.nf-status'); el.textContent=message;el.dataset.state=state||'';
 }
 function draft(form) {
  var request=form.dataset.enquiryKind==='proposal', name=val(form,'firstName')+' '+val(form,'lastName');
  var subject=request?'Proposal request — Nimbi Foundations + Lens':'Scoping call request — Nimbi';
  var lines=[request?'REQUEST FOR PROPOSAL':'REQUEST FOR A SCOPING CALL','', 'Name: '+name,'Business name: '+val(form,'firm'),'Work email: '+val(form,'email'),'Phone: '+val(form,'phone'),'Australian state or territory: '+val(form,'state'),'Sector: '+val(form,'sector')];
  if(request){
   var q=currentQuote();subject='Proposal request — '+val(form,'plan');
   lines.push('','Interested in: '+val(form,'plan'),'Estimated KYC checks per month: '+val(form,'kyc'),'Estimated KYB checks per month: '+val(form,'kyb'));
   if(q.tailored)lines.push('Price: on application. Included checks are a 12-month total allowance.');
   else if(!q.invalid)lines.push('Indicative monthly subscription and usage: '+money(q.monthly)+' AUD, ex GST.','Subscription: $159/month for a 12-month term. Usage: $19/KYC and $45/KYB.');
   lines.push('Please contact me to confirm the scope and prepare a proposal.');
  } else lines.push('','Please contact me to arrange a free 30-minute scoping call.');
  if(val(form,'message'))lines.push('','Message:',val(form,'message'));
  return {subject:subject,body:lines.join('\n'),name:name};
 }
 function loadBotCheck() {
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(widgetLoading)return widgetLoading;
  widgetLoading=new Promise(function(resolve,reject){
   window.nimbiFormsBotReady=function(){resolve(window.turnstile);};
   var s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=nimbiFormsBotReady&render=explicit';s.async=true;s.defer=true;
   s.onerror=function(){s.remove();widgetLoading=null;reject(new Error('Bot check unavailable'));};document.head.appendChild(s);
  });return widgetLoading;
 }
 async function prepareBotCheck(form){
  if(!live||widgets.has(form))return;
  widgets.set(form,null);
  try{
   var api=await loadBotCheck();
   var id=api.render(form.querySelector('.nf-bot-check'),{sitekey:sitekey,action:'contact_page',size:'compact',
    callback:function(){ status(form,'Security check complete. You can submit your request.'); },
    'expired-callback':function(){status(form,'The security check expired. Please complete it again.');},
    'error-callback':function(){status(form,'The security check could not load. Please retry, or email info@nimbi.com.au.','error');}
   });widgets.set(form,id);
  }catch(e){widgets.delete(form);status(form,'The security check is unavailable. Please try again or email info@nimbi.com.au.','error');}
 }
 function resetBot(form){var id=widgets.get(form);if(window.turnstile&&id!==undefined&&id!==null)window.turnstile.reset(id);}
 async function send(form, payload){
  var controller=new AbortController();var timeout=setTimeout(function(){controller.abort();},20000);
  try{
   var res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
   var out=await res.json().catch(function(){return {};});
   if(!res.ok||!out.ok)throw new Error('Submission not confirmed');
  }finally{clearTimeout(timeout);}
 }
 forms.forEach(function(form){
  var request=form.dataset.enquiryKind==='proposal',button=form.querySelector('button[type=submit]');
  var help=form.querySelector('.nf-delivery-note');
  button.textContent=request?'Get a proposal':'Book a free 30-minute call';
  button.disabled=!live;
  help.textContent=live?'Your request will be sent to the Nimbi team. We’ll contact you using the details above.':'To send an enquiry, use our secure live form.';
  var liveHelp=form.querySelector('.nf-live-help');if(liveHelp)liveHelp.hidden=live;
  if(live)form.addEventListener('focusin',function(){prepareBotCheck(form);});
  form.addEventListener('submit',async function(event){
   event.preventDefault();if(!form.reportValidity()||val(form,'website'))return;
   if(!live){status(form,'No request has been sent. Please use the secure live enquiry form.','error');return;}
   if(button.disabled)return;
   var content=draft(form);
   await prepareBotCheck(form);
   if(button.disabled)return;
   var id=widgets.get(form);var token=window.turnstile&&id!==undefined&&id!==null?window.turnstile.getResponse(id):'';
   if(!token){status(form,'Please complete the security check, then submit your request.','error');return;}
   button.disabled=true;status(form,'Sending your request…');
   // State, plan and usage travel in msg to preserve the existing server schema.
   var payload={form:'c',page:window.location.pathname,website:val(form,'website'),name:content.name,firm:val(form,'firm'),sector:val(form,'sector'),email:val(form,'email'),phone:val(form,'phone'),when:'Please contact me to arrange a time.',msg:content.subject+'\n\n'+content.body,turnstile:token};
   try{await send(form,payload);form.reset();if(request)renderEstimate();resetBot(form);status(form,'Thank you. Your request has been submitted. The Nimbi team will contact you.','success');}
   catch(e){resetBot(form);status(form,'We could not confirm submission. Your details are still here. Please email info@nimbi.com.au or call 1300 823 016 for help.','error');}
   finally{button.disabled=false;}
  });

 });
 if(proposal){proposal.addEventListener('input',renderEstimate);proposal.addEventListener('change',renderEstimate);renderEstimate();}
 document.querySelectorAll('a[data-plan]').forEach(function(a){a.addEventListener('click',function(){field(proposal,'plan').value=a.dataset.plan;renderEstimate();});});
})();
