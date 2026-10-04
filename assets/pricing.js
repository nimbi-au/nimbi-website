/* Cost calculator on /pricing/. The monthly estimate is the $159 subscription
   plus $19 per KYC check and $45 per standard KYB check, recalculated as the
   volumes change. "Get a proposal" under the estimate remembers the figure and
   the plan for the contact form. Nothing leaves the page. */
(function () {
  'use strict';
  var inputs = ['kyc-count', 'standard-count'].map(function (id) { return document.getElementById(id); });
  var total = document.getElementById('estimate-total');
  var breakdown = document.getElementById('estimate-breakdown');
  if (!inputs[0] || !inputs[1] || !total || !breakdown) return;

  var currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  function fmt(n) { return currency.format(n); }
  function clamp(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(999, Math.floor(n))) : 0;
  }
  function counts() { return inputs.map(function (el) { return clamp(el.value); }); }
  function remember(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (e) { /* storage unavailable: nothing to remember */ }
  }

  function updateEstimate() {
    var c = counts(), k = c[0], s = c[1];
    total.textContent = fmt(159 + 19 * k + 45 * s);
    breakdown.innerHTML = '<strong>$159 subscription</strong><br>' + fmt(k * 19) + ' KYC + ' + fmt(s * 45) + ' standard KYB';
  }
  inputs.forEach(function (el) {
    el.addEventListener('input', updateEstimate);
    el.addEventListener('change', function () { el.value = clamp(el.value); updateEstimate(); });
  });
  updateEstimate();

  /* The calculator's "Get a proposal" link (the one pointing at the proposal
     form) carries the estimate across to /contact/. */
  var calculator = document.getElementById('cost-calculator');
  if (calculator) {
    calculator.addEventListener('click', function (e) {
      var link = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!link || !/#proposal$/.test(link.getAttribute('href') || '')) return;
      var c = counts(), k = c[0], s = c[1];
      remember('nimbi.estimate', fmt(159 + 19 * k + 45 * s) + ' per month, ' + k + ' KYC and ' + s + ' standard KYB checks');
      remember('nimbi.interest', 'Foundations + Lens');
    });
  }
})();
