// Inserted with <script src=".../embed.js"></script>: it puts the form in an
// iframe right after the tag, forwards the page's query string (UTM tags) and
// grows the iframe to fit its content.
export const buildPublicFormEmbedScript = ({
  formId,
  pageUrl,
  title,
}: {
  formId: string;
  pageUrl: string;
  title: string;
}) => `(function () {
  var script = document.currentScript;
  if (!script || !script.parentNode) return;
  var query = new URLSearchParams(window.location.search);
  query.set('embed', '1');
  query.set('sourceUrl', window.location.href);
  var iframe = document.createElement('iframe');
  iframe.src = ${JSON.stringify(pageUrl)} + '?' + query.toString();
  iframe.title = ${JSON.stringify(title)};
  iframe.setAttribute('loading', 'lazy');
  iframe.style.cssText = 'display:block;width:100%;min-height:480px;border:0;background:transparent;';
  script.parentNode.insertBefore(iframe, script.nextSibling);
  window.addEventListener('message', function (event) {
    if (event.source !== iframe.contentWindow || !event.data || event.data.formId !== ${JSON.stringify(formId)}) return;
    if (event.data.type === 'flolabs-form:resize') iframe.style.height = event.data.height + 'px';
    if (event.data.type === 'flolabs-form:submitted' || event.data.type === 'flolabs-form:step') iframe.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
`;
