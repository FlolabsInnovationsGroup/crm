// Runs in the visitor's browser, so it is plain ES2017 kept as a string.
// The visibility rules mirror twenty-shared's getPublicFormVisibleFieldIds;
// the server re-validates every submission with the shared code.
export const PUBLIC_FORM_PAGE_SCRIPT = `
(function () {
  'use strict';

  var definition = JSON.parse(document.getElementById('ff-definition').textContent);
  var config = JSON.parse(document.getElementById('ff-config').textContent);
  var messages = config.messages;
  var englishMessages = config.englishMessages;
  var form = document.getElementById('ff-form');
  var submitButton = document.getElementById('ff-submit');
  var formError = document.getElementById('ff-form-error');
  var success = document.getElementById('ff-success');
  var params = new URLSearchParams(window.location.search);
  var isEmbedded = window.parent !== window;

  var EMAIL_PATTERN = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  var PHONE_PATTERN = /^\\+?[0-9 ()./-]{6,25}$/;
  var URL_PATTERN = /^https?:\\/\\/\\S+\\.\\S+$/i;
  var DATE_PATTERN = /^\\d{4}-\\d{2}-\\d{2}$/;
  var TEXT_TYPES = ['shortText', 'longText', 'email', 'phone', 'number', 'url', 'date', 'hidden'];

  function wrapperOf(field) {
    return form.querySelector('[data-field-id="' + CSS.escape(field.id) + '"]');
  }

  function readAnswer(field) {
    var wrapper = wrapperOf(field);
    if (!wrapper) return undefined;
    if (TEXT_TYPES.indexOf(field.type) !== -1) {
      return wrapper.querySelector('input, textarea').value;
    }
    if (field.type === 'select') {
      var dropdown = wrapper.querySelector('select');
      if (dropdown) return dropdown.value;
      var checkedRadio = wrapper.querySelector('input[type=radio]:checked');
      return checkedRadio ? checkedRadio.value : '';
    }
    if (field.type === 'multiSelect') {
      return Array.prototype.map.call(
        wrapper.querySelectorAll('input[type=checkbox]:checked'),
        function (input) { return input.value; }
      );
    }
    if (field.type === 'checkbox') {
      return wrapper.querySelector('input[type=checkbox]').checked;
    }
    return undefined;
  }

  function writeAnswer(field, value) {
    var wrapper = wrapperOf(field);
    if (!wrapper) return;
    if (TEXT_TYPES.indexOf(field.type) !== -1) {
      wrapper.querySelector('input, textarea').value = value;
    } else if (field.type === 'select') {
      var dropdown = wrapper.querySelector('select');
      if (dropdown) dropdown.value = value;
      wrapper.querySelectorAll('input[type=radio]').forEach(function (input) {
        input.checked = input.value.toLowerCase() === value.toLowerCase();
      });
    } else if (field.type === 'multiSelect') {
      var values = value.split(',').map(function (item) { return item.trim().toLowerCase(); });
      wrapper.querySelectorAll('input[type=checkbox]').forEach(function (input) {
        input.checked = values.indexOf(input.value.toLowerCase()) !== -1;
      });
    } else if (field.type === 'checkbox') {
      wrapper.querySelector('input[type=checkbox]').checked = value === 'true' || value === '1';
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

  function comparableValues(answer) {
    if (Array.isArray(answer)) return answer;
    if (typeof answer === 'boolean') return answer ? ['true'] : [];
    if (typeof answer === 'string' && answer.trim() !== '') return [answer.trim()];
    return [];
  }

  function isConditionMet(condition, answers) {
    var values = comparableValues(answers[condition.fieldId]);
    var expected = (condition.value || '').trim().toLowerCase();
    var normalized = values.map(function (value) { return value.toLowerCase(); });
    switch (condition.operator) {
      case 'equals': return normalized.indexOf(expected) !== -1;
      case 'notEquals': return normalized.indexOf(expected) === -1;
      case 'contains': return normalized.some(function (value) { return value.indexOf(expected) !== -1; });
      case 'notContains': return !normalized.some(function (value) { return value.indexOf(expected) !== -1; });
      case 'isEmpty': return values.length === 0;
      case 'isNotEmpty': return values.length > 0;
      default: return true;
    }
  }

  function visibleFieldIds(answers) {
    var visibleAnswers = {};
    var visible = {};
    definition.fields.forEach(function (field) {
      var conditions = field.visibleWhen || [];
      var isVisible = conditions.every(function (condition) {
        return isConditionMet(condition, visibleAnswers);
      });
      if (!isVisible) return;
      visible[field.id] = true;
      if (answers[field.id] !== undefined) visibleAnswers[field.id] = answers[field.id];
    });
    return visible;
  }

  function applyVisibility() {
    var visible = visibleFieldIds(readAnswers());
    definition.fields.forEach(function (field) {
      var wrapper = wrapperOf(field);
      if (!wrapper || field.type === 'hidden') return;
      var isVisible = visible[field.id] === true;
      if (wrapper.hidden === !isVisible) return;
      wrapper.hidden = !isVisible;
      if (!isVisible) setFieldError(field, null);
    });
  }

  function isEmpty(answer) {
    return answer === undefined || answer === false ||
      (typeof answer === 'string' && answer.trim() === '') ||
      (Array.isArray(answer) && answer.length === 0);
  }

  function extensionOf(fileName) {
    var dot = fileName.lastIndexOf('.');
    return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
  }

  function validateFile(field) {
    var input = wrapperOf(field).querySelector('input[type=file]');
    var file = input.files && input.files[0];
    if (!file) return field.required ? messages.fileRequired : null;
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

  function validateField(field, answer) {
    if (field.type === 'file') return validateFile(field);
    if (['heading', 'paragraph', 'hidden'].indexOf(field.type) !== -1) return null;
    if (isEmpty(answer)) return field.required ? messages.required : null;
    var text = typeof answer === 'string' ? answer.trim() : '';
    switch (field.type) {
      case 'email': return EMAIL_PATTERN.test(text) ? null : messages.email;
      case 'phone': return PHONE_PATTERN.test(text) ? null : messages.phone;
      case 'url': return URL_PATTERN.test(text) ? null : messages.url;
      case 'number': return isNaN(Number(text)) ? messages.number : null;
      case 'date': return DATE_PATTERN.test(text) ? null : messages.date;
      default: return null;
    }
  }

  function setFieldError(field, message) {
    var wrapper = wrapperOf(field);
    if (!wrapper) return;
    var errorElement = wrapper.querySelector('.ff-error');
    wrapper.classList.toggle('ff-invalid', Boolean(message));
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
    var firstInvalid = form.querySelector('.ff-invalid input, .ff-invalid textarea, .ff-invalid select');
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

  function onSubmitted() {
    postToParent('flolabs-form:submitted');
    var redirectUrl = definition.settings.redirectUrl;
    if (isSafeRedirect(redirectUrl) && !config.isPreview) {
      try {
        window.top.location.href = redirectUrl;
      } catch (error) {
        window.location.href = redirectUrl;
      }
      return;
    }
    form.hidden = true;
    success.hidden = false;
    success.focus();
  }

  function setSending(isSending) {
    submitButton.disabled = isSending;
    submitButton.textContent = isSending ? messages.sending : config.submitLabel;
  }

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

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    showFormError(null);

    var answers = readAnswers();
    var visible = visibleFieldIds(answers);
    var visibleAnswers = {};
    var hasErrors = false;

    definition.fields.forEach(function (field) {
      if (!visible[field.id]) return;
      if (answers[field.id] !== undefined) visibleAnswers[field.id] = answers[field.id];
      var message = validateField(field, answers[field.id]);
      setFieldError(field, message);
      if (message) hasErrors = true;
    });

    if (hasErrors) {
      showFormError(messages.fixErrors);
      focusFirstError();
      return;
    }

    var body = new FormData();
    body.append('answers', JSON.stringify(visibleAnswers));
    body.append('sourceUrl', params.get('sourceUrl') || document.referrer || window.location.href);
    body.append(config.honeypotField, form.querySelector('[name="' + config.honeypotField + '"]').value);
    definition.fields.forEach(function (field) {
      if (field.type !== 'file' || !visible[field.id]) return;
      var input = wrapperOf(field).querySelector('input[type=file]');
      if (input.files && input.files[0]) body.append('file:' + field.id, input.files[0]);
    });

    if (config.isPreview) return onSubmitted();

    setSending(true);
    fetch(config.submitUrl, { method: 'POST', body: body, credentials: 'omit' })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { response: response, data: data };
        });
      })
      .then(function (result) {
        setSending(false);
        if (result.response.ok) return onSubmitted();
        if (result.response.status === 429) return showFormError(messages.tooManyRequests);
        var errors = result.data && Array.isArray(result.data.errors) ? result.data.errors : [];
        var hasFieldErrors = false;
        errors.forEach(function (error) {
          var field = definition.fields.find(function (candidate) { return candidate.id === error.fieldId; });
          if (field) {
            hasFieldErrors = true;
            setFieldError(field, translateServerMessage(error.message));
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
})();
`;
