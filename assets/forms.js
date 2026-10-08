/* Enquiry form on /contact/. Posts to the existing contact Worker as form "c",
   schema unchanged: the request kind, interest, estimate and state travel in
   msg. The proposal / scoping-call wording follows the URL hash (#call), and an
   estimate carried over from the pricing calculator is shown and sent along.
   No credentials in this file: the Turnstile sitekey is public. */
(function () {
  'use strict';
  // The Worker that serves the page also takes the enquiry, so post to the same origin.
  var endpoint = '/api/contact';
  var sitekey = '0x4AAAAAAEoZ_xYFhf2xFw1I';
  var KEY_INTEREST = 'nimbi.interest', KEY_ESTIMATE = 'nimbi.estimate';
  var live = window.location.protocol === 'https:' && /^(www\.|staging\.)?nimbi\.com\.au$/i.test(window.location.hostname);

  var form = document.getElementById('connected-enquiry');
  if (!form) return;
  var button = form.querySelector('button[type="submit"]');
  var statusEl = form.querySelector('.form-status');
  var deliveryNote = form.querySelector('.delivery-note');
  var liveHelp = form.querySelector('.live-help');
  var botBox = form.querySelector('.bot-check');
  var contactHeading = document.getElementById('contact-heading');
  var contactIntro = document.getElementById('contact-intro');
  var enquiryHeading = document.getElementById('enquiry-heading');
  var interestSelect = document.getElementById('enquiry-interest');
  var estimateBox = document.getElementById('estimate-selection');
  var widgetId = null, widgetLoading = null, botPrepared = false;

  function read(key) { try { return window.sessionStorage.getItem(key); } catch (e) { return null; } }
  function forget(key) { try { window.sessionStorage.removeItem(key); } catch (e) { /* nothing stored */ } }
  function field(name) { return form.elements.namedItem(name); }
  function val(name) { var el = field(name); return el && typeof el.value === 'string' ? el.value.trim() : ''; }
  function isCall() { return window.location.hash === '#call'; }
  function setText(el, text) { if (el) el.textContent = text; }
  function status(message, state) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.state = state || '';
  }

  /* ---------- proposal or scoping call, from the URL hash ---------- */
  function setButtonLabel(text) {
    if (!button) return;
    var arrow = button.querySelector('span[aria-hidden="true"]');
    button.textContent = text;
    if (arrow) { button.appendChild(document.createTextNode(' ')); button.appendChild(arrow); }
  }
  function route() {
    var call = isCall();
    setText(enquiryHeading, call ? 'Request a scoping call' : 'Request a proposal');
    setText(contactHeading, call ? 'Let’s talk through your next step.' : 'Let’s find the right support.');
    setText(contactIntro, call ? 'A free 30-minute conversation about your services, your current arrangements and where you need help.' : 'Tell us about your business and what you need. We’ll help you identify the support that fits.');
    setButtonLabel(call ? 'Request a scoping call' : 'Get a proposal');
    form.dataset.kind = call ? 'Scoping call' : 'Proposal';
  }

  /* ---------- what the visitor carried over from other pages ---------- */
  function preselectInterest() {
    var interest = read(KEY_INTEREST);
    if (!interest || !interestSelect) return;
    var known = Array.prototype.some.call(interestSelect.options, function (option) { return option.value === interest; });
    if (known) interestSelect.value = interest;
  }
  function showEstimate() {
    if (!estimateBox) return;
    var estimate = read(KEY_ESTIMATE);
    estimateBox.hidden = !estimate;
    estimateBox.textContent = estimate ? 'Your estimate: ' + estimate + '. Outsourced support is quoted separately.' : '';
  }

  /* ---------- bot check, loaded on first focus ---------- */
  function loadBotCheck() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (widgetLoading) return widgetLoading;
    widgetLoading = new Promise(function (resolve, reject) {
      window.nimbiFormsBotReady = function () { resolve(window.turnstile); };
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=nimbiFormsBotReady&render=explicit';
      s.async = true; s.defer = true;
      s.onerror = function () { s.remove(); widgetLoading = null; reject(new Error('Bot check unavailable')); };
      document.head.appendChild(s);
    });
    return widgetLoading;
  }
  async function prepareBotCheck() {
    if (!live || botPrepared || !botBox) return;
    botPrepared = true;
    try {
      var api = await loadBotCheck();
      widgetId = api.render(botBox, {
        sitekey: sitekey, action: 'contact_page', size: 'compact',
        callback: function () { status('Security check complete. You can submit your request.'); },
        'expired-callback': function () { status('The security check expired. Please complete it again.'); },
        'error-callback': function () { status('The security check could not load. Please retry, or email info@nimbi.com.au.', 'error'); }
      });
    } catch (e) {
      botPrepared = false;
      status('The security check is unavailable. Please try again or email info@nimbi.com.au.', 'error');
    }
  }
  function haveWidget() { return !!window.turnstile && widgetId !== null && widgetId !== undefined; }
  function botToken() { return haveWidget() ? window.turnstile.getResponse(widgetId) : ''; }
  function resetBot() { if (haveWidget()) window.turnstile.reset(widgetId); }

  /* ---------- sending ---------- */
  async function send(payload) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      var out = await res.json().catch(function () { return {}; });
      if (!res.ok || !out.ok) throw new Error('Submission not confirmed');
    } finally { clearTimeout(timeout); }
  }
  /* Kind, interest, estimate and state travel in msg to preserve the Worker's schema. */
  function message() {
    var lines = [isCall() ? 'REQUEST FOR A SCOPING CALL' : 'REQUEST FOR PROPOSAL', '', 'Interested in: ' + val('interest')];
    var estimate = read(KEY_ESTIMATE);
    if (estimate) lines.push('Estimate: ' + estimate);
    lines.push('State or territory: ' + val('state'));
    if (val('message')) lines.push('', 'Message:', val('message'));
    return lines.join('\n');
  }

  /* ---------- set-up ---------- */
  if (button) button.disabled = !live;
  if (!live && deliveryNote) deliveryNote.textContent = 'To send an enquiry, use our secure live form.';
  if (liveHelp) liveHelp.hidden = live;
  Array.prototype.forEach.call(form.querySelectorAll('input[type="text"]'), function (input) {
    if (input.name !== 'website') input.setAttribute('pattern', '.*\\S.*');
  });
  if (live) form.addEventListener('focusin', function () { prepareBotCheck(); });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!form.reportValidity() || val('website')) return;
    if (!live) { status('No request has been sent. Please use the secure live enquiry form.', 'error'); return; }
    if (!button || button.disabled) return;
    await prepareBotCheck();
    if (button.disabled) return;
    var token = botToken();
    if (!token) { status('Please complete the security check, then submit your request.', 'error'); return; }
    button.disabled = true;
    status('Sending your request…');
    var payload = {
      form: 'c',
      page: window.location.pathname,
      website: val('website'),
      name: val('firstName') + ' ' + val('lastName'),
      firm: val('business'),
      sector: val('industry'),
      email: val('email'),
      phone: val('phone'),
      when: 'Please contact me to arrange a time.',
      msg: message(),
      turnstile: token
    };
    try {
      await send(payload);
      form.reset();
      forget(KEY_INTEREST);
      forget(KEY_ESTIMATE);
      showEstimate();
      resetBot();
      status('Thank you. Your request has been submitted. The Nimbi team will contact you.', 'success');
    } catch (e) {
      resetBot();
      status('We could not confirm submission. Your details are still here. Please email info@nimbi.com.au or call 1300 823 016 for help.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener('hashchange', route);
  route();
  preselectInterest();
  showEstimate();
})();
