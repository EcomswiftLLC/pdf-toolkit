// Classic script for Wix "Custom Element > Server URL". Tag name: pdf-toolkit-app
(function () {
  if (customElements.get('pdf-toolkit-app')) return;
  var BASE = 'https://ecomswiftllc.github.io/pdf-toolkit/';
  class PdfToolkitApp extends HTMLElement {
    static get observedAttributes() { return ['tool', 'hub', 'base', 'kit']; }
    connectedCallback() { this.go(); }
    attributeChangedCallback() { this.go(); }
    go() {
      var self = this; clearTimeout(this._t);
      this._t = setTimeout(function () {
        if (!self.isConnected || (!self.hasAttribute('tool') && !self.hasAttribute('hub'))) return;
        import(BASE + (self.hasAttribute('kit') || self.getAttribute('hub') === 'all' ? 'js/element.all.bundle.js?v=2' : 'js/element.bundle.js?v=7')).then(function (m) { return m.mount(self); })
          .catch(function () { self.textContent = 'The PDF tools could not load. Please refresh the page.'; });
      }, 40);
    }
  }
  customElements.define('pdf-toolkit-app', PdfToolkitApp);
})();
