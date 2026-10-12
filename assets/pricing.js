/* Pricing page on /pricing/. The billing toggle switches the Pro and
   Comprehensive cards between monthly and annual upfront prices, and the cost
   calculator estimates a chosen plan's subscription plus its KYC and standard
   KYB checks (Comprehensive's included allowance deducted), recalculated as
   the plan, billing or volumes change. Links to /contact/ remember the
   estimate or the chosen plan for the contact form. Nothing leaves the page. */
(function () {
  'use strict';
  var planSelect = document.getElementById('estimate-plan');
  var inputs = ['kyc-count', 'standard-count'].map(function (id) { return document.getElementById(id); });
  var output = document.getElementById('estimate-total');
  if (!planSelect || !inputs[0] || !inputs[1] || !output) return;

  var currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  function fmt(n) { return currency.format(n); }
  function clamp(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(999, Math.floor(n))) : 0;
  }
  function $(id) { return document.getElementById(id); }
  function $$(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }
  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }
  function remember(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (e) { /* storage unavailable: nothing to remember */ }
  }
  function forget(key) {
    try { window.sessionStorage.removeItem(key); } catch (e) { /* storage unavailable: nothing to forget */ }
  }

  /* ---------- plans ---------- */
  var billing = 'monthly';
  var pricingPlans = {
    pro: { name: 'Nimbi Pro', monthly: 159, annual: 1399, kyc: 19, kyb: 45, includedKyc: 0, includedKyb: 0 },
    comprehensive: { name: 'Nimbi Comprehensive', monthly: 399, annual: 3349, kyc: 15, kyb: 39, includedKyc: 4, includedKyb: 2 },
    lite: { name: 'Nimbi Lite', monthly: 0, annual: 0, kyc: 25, kyb: 50, includedKyc: 0, includedKyb: 0 }
  };
  function planNamed(name) {
    var keys = Object.keys(pricingPlans);
    for (var i = 0; i < keys.length; i++) {
      if (pricingPlans[keys[i]].name === name) return pricingPlans[keys[i]];
    }
    return null;
  }
  function comprehensiveAllowanceText(annual) {
    return annual
      ? '48 KYC and 24 KYB checks included for the 12-month allowance period; unused checks expire at the end of that period'
      : '4 KYC and 2 KYB checks allocated monthly; unused allocations roll forward and expire at the end of the 12-month allowance period';
  }

  /* ---------- the estimate ---------- */
  function currentEstimate() {
    var p = pricingPlans[planSelect.value] || pricingPlans.pro;
    var k = clamp(inputs[0].value), s = clamp(inputs[1].value);
    var kc = Math.max(0, k - p.includedKyc) * p.kyc, sc = Math.max(0, s - p.includedKyb) * p.kyb;
    var annual = billing === 'annual' && p !== pricingPlans.lite;
    var sub = annual ? p.annual : p.monthly;
    var total = sub + (kc + sc) * (annual ? 12 : 1);
    var text = p.name + ' — ' + fmt(total) + (annual ? ' estimated per year' : ' estimated per month')
      + ', based on ' + k + ' KYC and ' + s + ' standard KYB checks per month'
      + (annual ? '; ' + fmt(sub) + ' subscription paid upfront, checks charged as used' : '; monthly billing')
      + (p === pricingPlans.comprehensive ? '; ' + comprehensiveAllowanceText(annual) : '');
    return { p: p, k: k, s: s, kc: kc, sc: sc, annual: annual, sub: sub, total: total, text: text };
  }
  function updateEstimate() {
    var e = currentEstimate();
    output.textContent = fmt(e.total);
    setText('estimate-label', e.annual ? 'Estimated annual total' : 'Estimated monthly total');
    setText('estimate-unit', 'AUD, excluding GST / ' + (e.annual ? 'year' : 'month'));
    var breakdown = $('estimate-breakdown');
    if (breakdown) {
      breakdown.innerHTML = '<strong>' + fmt(e.sub) + ' subscription' + (e.annual ? ' paid upfront' : ' per month') + '</strong><br>'
        + fmt(e.kc + e.sc) + (e.annual ? ' checks per month × 12' : ' checks per month');
    }
    setText('estimate-billing', e.p === pricingPlans.lite ? 'Lite has no subscription fee.' : e.annual ? 'Annual payment selected. Subscription paid upfront; checks charged as used.' : 'Monthly payment selected.');
    setText('kyc-help', e.p.includedKyc ? (e.annual ? '48 included in your annual allocation; additional checks $15 each.' : '4 allocated each month; additional checks $15 each.') : '$' + e.p.kyc + ' per individual check.');
    setText('standard-help', e.p.includedKyb ? (e.annual ? '24 included in your annual allocation; additional standard checks $39 each.' : '2 allocated each month; additional standard checks $39 each.') : '$' + e.p.kyb + ' per standard legal entity check.');
  }

  /* ---------- monthly or annual billing ---------- */
  function updateBilling() {
    var annual = billing === 'annual';
    $$('[data-billing]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-billing') === billing));
    });
    setText('pro-price', annual ? '$1,399' : '$159');
    setText('pro-period', annual ? '/ year' : '/ month');
    setText('pro-billing-note', annual ? 'Paid upfront · equivalent to $116.58/month' : '12-month term, billed monthly');
    setText('pro-saving', annual ? 'Save over 25%' : 'Pay annually and save over 25%');
    setText('comprehensive-price', annual ? '$3,349' : '$399');
    setText('comprehensive-period', annual ? '/ year' : '/ month');
    setText('comprehensive-billing-note', annual ? 'Paid upfront · equivalent to $279.08/month' : 'Billed monthly');
    setText('comprehensive-saving', annual ? 'Save 30%' : 'Pay annually and save 30%');
    var allowance = $('comprehensive-allowance');
    if (allowance) allowance.setAttribute('aria-label', 'Nimbi Comprehensive ' + (annual ? 'annual' : 'monthly') + ' check allowance');
    setText('comprehensive-allowance-title', annual ? 'Checks included for 12 months' : 'Checks allocated each month');
    setText('comprehensive-kyc-allowance', annual ? '48 KYC' : '4 KYC');
    /* The KYB figure is the text before the "*" note link, so only that text node changes. */
    var kyb = $('comprehensive-kyb-allowance');
    if (kyb && kyb.firstChild && kyb.firstChild.nodeType === 3) kyb.firstChild.nodeValue = annual ? '24 KYB' : '2 KYB';
    setText('comprehensive-allowance-note', 'Comprehensive: ' + (annual ? 'Your annual allocation is 48 KYC and 24 KYB checks. Unused checks expire at the end of your 12-month allowance period.' : 'Unused monthly allocations roll forward from month to month and expire at the end of your 12-month allowance period.'));
    setText('billing-announcement', annual ? 'Annual upfront prices shown. Pro $1,399 per year; Comprehensive $3,349 per year.' : 'Monthly prices shown. Pro $159; Comprehensive $399.');
    updateEstimate();
  }

  $$('[data-billing]').forEach(function (button) {
    button.addEventListener('click', function () {
      billing = button.getAttribute('data-billing');
      updateBilling();
    });
  });
  planSelect.addEventListener('change', updateEstimate);
  inputs.forEach(function (el) {
    el.addEventListener('input', updateEstimate);
    el.addEventListener('change', function () { el.value = clamp(el.value); updateEstimate(); });
  });
  updateBilling();

  /* ---------- handoff to /contact/ ---------- */
  /* A link to the contact page inside the calculator carries the current
     estimate and its plan; a plan card's link carries that plan's summary
     (nav.js remembers the card's data-interest); any other link to /contact/
     clears a stale estimate. */
  function planSummary(p) {
    if (p === pricingPlans.lite) {
      return p.name + ', no subscription fee; ' + fmt(p.kyc) + ' per KYC and ' + fmt(p.kyb) + ' per standard KYB; optional services charged separately';
    }
    var annual = billing === 'annual';
    return p.name + ', ' + (annual ? fmt(p.annual) + ' per year, paid upfront' : fmt(p.monthly) + ' per month, billed monthly')
      + (p === pricingPlans.comprehensive ? '; ' + comprehensiveAllowanceText(annual) + '; additional checks charged separately' : '; checks charged separately');
  }
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link || (link.getAttribute('href') || '').indexOf('/contact/') !== 0) return;
    if (link.closest('#cost-calculator')) {
      var estimate = currentEstimate();
      remember('nimbi.estimate', estimate.text);
      remember('nimbi.interest', estimate.p.name);
      return;
    }
    var plan = link.closest('.pg-card') ? planNamed(link.getAttribute('data-interest')) : null;
    if (plan) remember('nimbi.estimate', planSummary(plan));
    else forget('nimbi.estimate');
  });
})();
