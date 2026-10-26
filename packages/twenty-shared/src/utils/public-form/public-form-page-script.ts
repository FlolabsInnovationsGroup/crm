import { createPublicFormEngine } from './public-form-engine';

// Runs in the visitor's browser, so it is plain ES2019 kept as a string. The
// logic engine is the same function the server validates with.
export const PUBLIC_FORM_PAGE_SCRIPT = `
(function () {
  'use strict';

  var engine = (${createPublicFormEngine.toString()})();

  var definition = JSON.parse(document.getElementById('ff-definition').textContent);
  var config = JSON.parse(document.getElementById('ff-config').textContent);
  var messages = config.messages;
  var englishMessages = config.englishMessages;
  var form = document.getElementById('ff-form');
  var submitButton = document.getElementById('ff-submit');
  var nextButton = document.getElementById('ff-next');
  var backButton = document.getElementById('ff-back');
  var progress = document.getElementById('ff-progress');
  var progressBar = document.getElementById('ff-progress-bar');
  var steps = Array.prototype.slice.call(form.querySelectorAll('.ff-step'));
  var currentStep = 0;
  var review = document.getElementById('ff-review');
  var reviewList = document.getElementById('ff-review-list');
  var isReviewing = false;
  var formError = document.getElementById('ff-form-error');
  var success = document.getElementById('ff-success');
  var params = new URLSearchParams(window.location.search);
  var isEmbedded = window.parent !== window;

  var TEXT_TYPES = ['shortText', 'longText', 'email', 'phone', 'number', 'url', 'date', 'time', 'hidden'];
  var SINGLE_CHOICE_TYPES = ['select', 'yesNo', 'rating', 'scale'];
  var BOOLEAN_TYPES = ['checkbox', 'consent'];
  var FILE_TYPES = ['file', 'signature'];
  var ADDRESS_PARTS = ['street', 'city', 'region', 'postcode', 'country'];
  var NO_REVIEW_TYPES = ['heading', 'paragraph', 'image', 'pageBreak', 'hidden'];

  function wrapperOf(field) {
    return form.querySelector('[data-field-id="' + CSS.escape(field.id) + '"]');
  }

  // Hand-written markup may skip the wrappers, so inputs are found by name.
  function controlsOf(field, suffix) {
    var scope = wrapperOf(field) || form;
    return Array.prototype.slice.call(
      scope.querySelectorAll('[name="' + CSS.escape(field.id + (suffix || '')) + '"]')
    );
  }

  function firstControl(field, suffix) {
    return controlsOf(field, suffix)[0] || null;
  }

  function checkedValue(controls) {
    var checked = controls.filter(function (control) { return control.checked; })[0];
    return checked ? checked.value : '';
  }

  function readAnswer(field) {
    if (FILE_TYPES.indexOf(field.type) !== -1) return undefined;
    if (field.type === 'address') {
      if (!firstControl(field, '__street')) return undefined;
      return ADDRESS_PARTS.map(function (part) {
        var control = firstControl(field, '__' + part);
        return control ? control.value : '';
      });
    }
    if (field.type === 'matrix') {
      return (field.options || []).map(function (_row, rowIndex) {
        return checkedValue(controlsOf(field, '__' + rowIndex));
      });
    }
    var controls = controlsOf(field);
    var control = controls[0];
    if (!control) return undefined;
    if (field.type === 'slider') {
      return control.getAttribute('data-touched') === 'true' ? control.value : '';
    }
    if (control.tagName === 'SELECT' && !control.multiple) return control.value;
    if (control.tagName === 'SELECT') {
      return Array.prototype.filter.call(control.options, function (option) { return option.selected; })
        .map(function (option) { return option.value; });
    }
    if (control.type === 'radio') return checkedValue(controls);
    if (control.type === 'checkbox') {
      if (field.type === 'multiSelect') {
        return controls.filter(function (input) { return input.checked; })
          .map(function (input) { return input.value; });
      }
      return control.checked;
    }
    return control.value;
  }

  function writeAnswer(field, value) {
    var controls = controlsOf(field);
    var control = controls[0];
    if (!control) return;
    var values = field.type === 'multiSelect'
      ? value.split(',').map(function (item) { return item.trim().toLowerCase(); })
      : [value.toLowerCase()];
    if (control.type === 'radio' || (control.type === 'checkbox' && field.type === 'multiSelect')) {
      controls.forEach(function (input) {
        input.checked = values.indexOf(input.value.toLowerCase()) !== -1;
      });
    } else if (control.type === 'checkbox') {
      control.checked = value === 'true' || value === '1';
    } else {
      control.value = value;
      if (field.type === 'slider') {
        control.setAttribute('data-touched', 'true');
        updateSliderOutput(control);
      }
    }
  }

  function readAnswers() {
    var answers = {};
    definition.fields.forEach(function (field) {
      var answer = readAnswer(field);
      if (answer !== undefined) answers[field.id] = answer;
    });
    return answers;
  }

  function evaluateAnswers(answers) {
    return engine.evaluate(definition, answers);
  }

  function formatError(error) {
    if (!error) return null;
    if (error.message) return error.message;
    var template = messages[error.code] || messages.genericError;
    return template.replace('{n}', error.params && error.params.n ? error.params.n : '');
  }

  function applyVisibility() {
    var evaluation = evaluateAnswers(readAnswers());
    var visible = evaluation.visible;
    definition.fields.forEach(function (field) {
      var wrapper = wrapperOf(field);
      if (!wrapper || field.type === 'hidden') return;
      var requiredMark = wrapper.querySelector('[data-required-when]');
      if (requiredMark) requiredMark.hidden = !engine.isFieldRequired(field, evaluation);
      var isVisible = visible[field.id] === true;
      if (wrapper.hidden === !isVisible) return;
      wrapper.hidden = !isVisible;
      if (!isVisible) setFieldError(field, null);
    });
    form.querySelectorAll('[data-template]').forEach(function (element) {
      element.textContent = engine.interpolate(element.getAttribute('data-template'), definition, evaluation);
    });
    renderSteps(visible);
    return evaluation;
  }

  // A step is shown when its page break is visible and it has something to show.
  function visibleStepIndexes(visible) {
    return steps.map(function (step, index) {
      var pageBreakId = step.getAttribute('data-step-field-id');
      if (pageBreakId && !visible[pageBreakId]) return -1;
      var hasContent = Array.prototype.some.call(
        step.querySelectorAll('[data-field-id]:not(.ff-step-header)'),
        function (wrapper) { return !wrapper.hidden; }
      );
      return hasContent ? index : -1;
    }).filter(function (index) { return index !== -1; });
  }

  function renderProgress(position, total) {
    progress.hidden = total < 2;
    progress.textContent = messages.stepOf
      .replace('{current}', String(position + 1))
      .replace('{total}', String(total));
    if (!progressBar) return;
    progressBar.hidden = !config.showProgressBar || total < 2;
    progressBar.firstElementChild.style.width = Math.round(((position + 1) / total) * 100) + '%';
  }

  function renderSteps(visible) {
    if (steps.length === 0) {
      if (nextButton) nextButton.hidden = true;
      if (backButton) backButton.hidden = true;
      if (submitButton) submitButton.hidden = false;
      renderProgress(0, 1);
      return { visibleSteps: [0], position: 0, isLast: true };
    }
    var visibleSteps = visibleStepIndexes(visible || evaluateAnswers(readAnswers()).visible);
    if (visibleSteps.length === 0) visibleSteps = [0];
    if (visibleSteps.indexOf(currentStep) === -1) {
      var previous = visibleSteps.filter(function (index) { return index < currentStep; });
      currentStep = previous.length > 0 ? previous[previous.length - 1] : visibleSteps[0];
    }
    var position = visibleSteps.indexOf(currentStep);
    steps.forEach(function (step, index) { step.hidden = isReviewing || index !== currentStep; });
    var isLast = position === visibleSteps.length - 1;
    var startLabel = definition.settings.startButtonLabel;
    nextButton.textContent = position === 0 && startLabel ? startLabel : messages.next;
    nextButton.hidden = isLast;
    submitButton.hidden = !isLast;
    backButton.hidden = position === 0 && !isReviewing;
    renderProgress(isReviewing ? visibleSteps.length : position, visibleSteps.length + (review ? 1 : 0));
    return { visibleSteps: visibleSteps, position: position, isLast: isLast };
  }

  function goToStep(index) {
    isReviewing = false;
    if (review) review.hidden = true;
    currentStep = index;
    renderSteps();
    showFormError(null);
    var firstInput = steps[currentStep].querySelector('input:not([type=hidden]), textarea, select');
    window.scrollTo(0, 0);
    postToParent('flolabs-form:step');
    announce('flolabs:step', { step: currentStep });
    var stepState = renderSteps();
    track('step', stepState.position);
    if (firstInput) firstInput.focus({ preventScroll: true });
  }

  function stepOfField(field) {
    var element = wrapperOf(field) || firstControl(field);
    for (var index = 0; index < steps.length; index++) {
      if (element && steps[index].contains(element)) return index;
    }
    return currentStep;
  }

  function reviewValue(field, answers, evaluation) {
    if (field.type === 'signature') {
      var pad = wrapperOf(field) && wrapperOf(field).querySelector('canvas');
      return pad && pad.getAttribute('data-signed') === 'true' ? '✓' : '';
    }
    if (field.type === 'file') {
      var input = wrapperOf(field) && wrapperOf(field).querySelector('input[type=file]');
      return input && input.files && input.files[0] ? input.files[0].name : '';
    }
    if (answers[field.id] === undefined) return '';
    return engine.interpolate('{{' + field.id + '}}', definition, evaluation);
  }

  // A last page listing the answers; "Edit" jumps back to the question.
  function showReview(evaluation, answers) {
    isReviewing = true;
    reviewList.textContent = '';
    definition.fields.forEach(function (field) {
      if (!evaluation.visible[field.id] || NO_REVIEW_TYPES.indexOf(field.type) !== -1) return;
      var item = document.createElement('div');
      item.className = 'ff-review-item';
      var term = document.createElement('dt');
      term.textContent = field.label;
      var value = document.createElement('dd');
      value.textContent = reviewValue(field, answers, evaluation) || messages.noAnswer;
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'ff-review-edit';
      edit.textContent = messages.edit;
      edit.addEventListener('click', function () { goToStep(stepOfField(field)); });
      item.appendChild(term);
      item.appendChild(value);
      item.appendChild(edit);
      reviewList.appendChild(item);
    });
    review.hidden = false;
    renderSteps();
    window.scrollTo(0, 0);
    postToParent('flolabs-form:step');
    track('step', steps.length);
  }

  function moveStep(direction) {
    var state = renderSteps();
    var target = state.visibleSteps[state.position + direction];
    if (target !== undefined) goToStep(target);
  }

  function validateVisibleFields(evaluation, answers, isInScope) {
    var hasErrors = false;
    definition.fields.forEach(function (field) {
      if (!evaluation.visible[field.id] || !isInScope(field)) return;
      var message = validateField(field, answers[field.id], evaluation);
      setFieldError(field, message);
      if (message) hasErrors = true;
    });
    return hasErrors;
  }

  function isInCurrentStep(field) {
    if (steps.length === 0) return true;
    var element = wrapperOf(field) || firstControl(field) || firstControl(field, '__0') || firstControl(field, '__street');
    return Boolean(element) && steps[currentStep].contains(element);
  }

  function extensionOf(fileName) {
    var dot = fileName.lastIndexOf('.');
    return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
  }

  function validateFile(field, isRequired) {
    var input = wrapperOf(field).querySelector('input[type=file]');
    var file = input.files && input.files[0];
    if (!file) return isRequired ? messages.fileRequired : null;
    var maxMb = Math.min(field.maxFileSizeMb || config.maxFileSizeMb, config.maxFileSizeMb);
    if (file.size > maxMb * 1024 * 1024) return messages.fileTooLarge;
    var accepted = (field.acceptedFileExtensions || []).map(function (extension) {
      return extension.replace(/^\\./, '').toLowerCase();
    });
    if (accepted.length > 0 && accepted.indexOf(extensionOf(file.name)) === -1) {
      return messages.fileTypes + accepted.join(', ');
    }
    return null;
  }

  function validateField(field, answer, evaluation) {
    var isRequired = engine.isFieldRequired(field, evaluation || evaluateAnswers(readAnswers()));
    if (field.type === 'file') return validateFile(field, isRequired);
    if (field.type === 'signature') {
      var pad = wrapperOf(field).querySelector('canvas');
      return isRequired && pad.getAttribute('data-signed') !== 'true' ? messages.signatureRequired : null;
    }
    return formatError(engine.validateValue(field, answer, isRequired));
  }

  function setFieldError(field, message) {
    var wrapper = wrapperOf(field);
    var errorElement = wrapper
      ? wrapper.querySelector('.ff-error')
      : form.querySelector('[data-error-for="' + CSS.escape(field.id) + '"]');
    var target = wrapper || firstControl(field) || firstControl(field, '__0') || firstControl(field, '__street');
    if (target) target.classList.toggle('ff-invalid', Boolean(message));
    if (errorElement) errorElement.textContent = message || '';
  }

  function translateServerMessage(message) {
    if (typeof message !== 'string') return messages.genericError;
    var keys = Object.keys(englishMessages);
    for (var index = 0; index < keys.length; index++) {
      var key = keys[index];
      if (englishMessages[key] === message) return messages[key];
      if (key === 'fileTypes' && message.indexOf(englishMessages.fileTypes) === 0) {
        return messages.fileTypes + message.slice(englishMessages.fileTypes.length);
      }
    }
    return message;
  }

  function showFormError(message) {
    formError.textContent = message || '';
    formError.hidden = !message;
  }

  function focusFirstError() {
    var firstWrapper = form.querySelector('.ff-invalid');
    var invalidStep = firstWrapper ? steps.indexOf(firstWrapper.closest('.ff-step')) : -1;
    if (firstWrapper && isReviewing) {
      isReviewing = false;
      review.hidden = true;
      renderSteps();
    }
    if (invalidStep !== -1 && invalidStep !== currentStep) {
      currentStep = invalidStep;
      renderSteps();
    }
    var firstInvalid = form.querySelector('.ff-invalid input, .ff-invalid textarea, .ff-invalid select, input.ff-invalid, textarea.ff-invalid, select.ff-invalid');
    if (firstInvalid) firstInvalid.focus();
  }

  function postToParent(type, extra) {
    if (!isEmbedded) return;
    var payload = { type: type, formId: config.formId };
    Object.keys(extra || {}).forEach(function (key) { payload[key] = extra[key]; });
    window.parent.postMessage(payload, '*');
  }

  function isSafeRedirect(url) {
    return typeof url === 'string' && /^https?:\\/\\//i.test(url);
  }

  // Analytics only: a lost beacon must never affect the visitor.
  function track(type, step) {
    if (config.isPreview || !config.eventsUrl) return;
    var url = config.eventsUrl + '?type=' + type + (step === undefined ? '' : '&step=' + step);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
      fetch(url, { method: 'POST', credentials: 'omit', keepalive: true }).catch(function () {});
    } catch (error) {
      return;
    }
  }

  function announce(type, detail) {
    window.dispatchEvent(new CustomEvent(type, { detail: detail }));
  }

  function onSubmitted(evaluation) {
    postToParent('flolabs-form:submitted');
    announce('flolabs:submitted', { answers: evaluation.visibleAnswers, variables: evaluation.variables });
    var ending = engine.findEnding(definition, evaluation);
    var redirectUrl = ending ? ending.redirectUrl : definition.settings.redirectUrl;
    var message = ending && ending.message ? ending.message : definition.settings.successMessage;
    if (redirectUrl) redirectUrl = engine.interpolate(redirectUrl, definition, evaluation, encodeURIComponent);
    if (isSafeRedirect(redirectUrl) && !config.isPreview) {
      try {
        window.top.location.href = redirectUrl;
      } catch (error) {
        window.location.href = redirectUrl;
      }
      return;
    }
    document.getElementById('ff-success-message').textContent = engine.interpolate(message, definition, evaluation);
    form.hidden = true;
    success.hidden = false;
    success.focus();
  }

  function setSending(isSending) {
    submitButton.disabled = isSending;
    submitButton.textContent = isSending ? messages.sending : config.submitLabel;
  }

  function updateSliderOutput(range) {
    var output = range.parentNode.querySelector('output');
    if (output) output.textContent = range.getAttribute('data-touched') === 'true' ? range.value : '–';
  }

  function dataUrlToBlob(dataUrl) {
    var binary = atob(dataUrl.split(',')[1]);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: 'image/png' });
  }

  // Drawing uses pointer events so mouse, pen and touch all work.
  function setUpSignaturePad(canvas) {
    var context = canvas.getContext('2d');
    if (!context) return;
    var isDrawing = false;
    function resize() {
      var ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      context.scale(ratio, ratio);
      context.lineWidth = 2.2;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = getComputedStyle(canvas).color || '#111';
      canvas.removeAttribute('data-signed');
    }
    function point(event) {
      var box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    }
    canvas.addEventListener('pointerdown', function (event) {
      // A pad on a hidden page had no size when the form loaded.
      if (canvas.getAttribute('data-signed') !== 'true' && canvas.width !== Math.round(canvas.clientWidth * (window.devicePixelRatio || 1))) resize();
      isDrawing = true;
      canvas.setPointerCapture(event.pointerId);
      var start = point(event);
      context.beginPath();
      context.moveTo(start.x, start.y);
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!isDrawing) return;
      var next = point(event);
      context.lineTo(next.x, next.y);
      context.stroke();
      canvas.setAttribute('data-signed', 'true');
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
      canvas.addEventListener(type, function () {
        if (!isDrawing) return;
        isDrawing = false;
        form.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    canvas.parentNode.querySelector('.ff-signature-clear').addEventListener('click', function () {
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.removeAttribute('data-signed');
    });
    resize();
  }

  var hasStarted = false;
  track('view');
  form.addEventListener('input', function () {
    if (hasStarted) return;
    hasStarted = true;
    track('start');
  });

  form.querySelectorAll('.ff-signature-pad').forEach(setUpSignaturePad);
  form.querySelectorAll('input[type=range]').forEach(function (range) {
    range.addEventListener('input', function () {
      range.setAttribute('data-touched', 'true');
      updateSliderOutput(range);
    });
  });

  definition.fields.forEach(function (field) {
    var fromQuery = field.prefillQueryParam ? params.get(field.prefillQueryParam) : null;
    var value = fromQuery !== null ? fromQuery : field.defaultValue;
    if (typeof value === 'string' && value !== '') writeAnswer(field, value);
  });
  applyVisibility();

  // Re-validating on input rather than change: change fires on blur, and the
  // resulting layout shift would swallow the click that caused the blur.
  form.addEventListener('input', function (event) {
    applyVisibility();
    var wrapper = event.target.closest('[data-field-id]');
    if (!wrapper || !wrapper.classList.contains('ff-invalid')) return;
    var field = definition.fields.find(function (candidate) {
      return candidate.id === wrapper.getAttribute('data-field-id');
    });
    if (field) setFieldError(field, validateField(field, readAnswer(field)));
  });

  form.addEventListener('change', function (event) {
    if (!event.target.matches('.ff-file-input')) return;
    var nameElement = event.target.parentNode.querySelector('.ff-file-name');
    var file = event.target.files && event.target.files[0];
    nameElement.textContent = file ? file.name : nameElement.getAttribute('data-empty');
  });

  nextButton.addEventListener('click', function () {
    form.requestSubmit();
  });
  backButton.addEventListener('click', function () {
    if (isReviewing) return goToStep(currentStep);
    moveStep(-1);
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    showFormError(null);

    var answers = readAnswers();
    var evaluation = evaluateAnswers(answers);
    var visible = evaluation.visible;

    // Enter in a field submits the form; before the last step it means "Next".
    if (!renderSteps(visible).isLast) {
      if (validateVisibleFields(evaluation, answers, isInCurrentStep)) {
        showFormError(messages.fixErrors);
        focusFirstError();
        return;
      }
      moveStep(1);
      return;
    }

    if (validateVisibleFields(evaluation, answers, function () { return true; })) {
      showFormError(messages.fixErrors);
      focusFirstError();
      return;
    }

    if (review && !isReviewing) return showReview(evaluation, answers);

    var visibleAnswers = {};
    definition.fields.forEach(function (field) {
      if (visible[field.id] && answers[field.id] !== undefined) visibleAnswers[field.id] = answers[field.id];
    });

    var body = new FormData();
    body.append('answers', JSON.stringify(visibleAnswers));
    body.append('sourceUrl', params.get('sourceUrl') || document.referrer || window.location.href);
    body.append(config.honeypotField, form.querySelector('[name="' + config.honeypotField + '"]').value);
    definition.fields.forEach(function (field) {
      if (FILE_TYPES.indexOf(field.type) === -1 || !visible[field.id]) return;
      if (field.type === 'signature') {
        var pad = wrapperOf(field).querySelector('canvas');
        if (pad.getAttribute('data-signed') === 'true') {
          body.append('file:' + field.id, dataUrlToBlob(pad.toDataURL('image/png')), 'signature.png');
        }
        return;
      }
      var input = wrapperOf(field).querySelector('input[type=file]');
      if (input.files && input.files[0]) body.append('file:' + field.id, input.files[0]);
    });

    if (config.isPreview) return onSubmitted(evaluation);

    setSending(true);
    fetch(config.submitUrl, { method: 'POST', body: body, credentials: 'omit' })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { response: response, data: data };
        });
      })
      .then(function (result) {
        setSending(false);
        if (result.response.ok) return onSubmitted(evaluation);
        if (result.response.status === 429) return showFormError(messages.tooManyRequests);
        var errors = result.data && Array.isArray(result.data.errors) ? result.data.errors : [];
        var hasFieldErrors = false;
        errors.forEach(function (error) {
          var field = definition.fields.find(function (candidate) { return candidate.id === error.fieldId; });
          if (field) {
            hasFieldErrors = true;
            setFieldError(field, error.code && messages[error.code] ? formatError(error) : translateServerMessage(error.message));
          }
        });
        showFormError(hasFieldErrors ? messages.fixErrors : (errors[0] ? translateServerMessage(errors[0].message) : messages.genericError));
        focusFirstError();
      })
      .catch(function () {
        setSending(false);
        showFormError(messages.genericError);
      });
  });

  if (isEmbedded && 'ResizeObserver' in window) {
    new ResizeObserver(function () {
      postToParent('flolabs-form:resize', { height: Math.ceil(document.documentElement.getBoundingClientRect().height) });
    }).observe(document.documentElement);
  }
  // For custom code on the page.
  window.flolabsForm = {
    definition: definition,
    getAnswers: readAnswers,
    evaluate: function () { return evaluateAnswers(readAnswers()); },
    refresh: applyVisibility,
  };
})();
`;
