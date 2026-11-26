// Classic script for Wix "Custom Element > Server URL". Tag name: pdf-toolkit-app
(function () {
  if (customElements.get('pdf-toolkit-app')) return;
  var BASE = 'https://ecomswiftllc.github.io/pdf-toolkit/';
  class PdfToolkitApp extends HTMLElement {
    static get observedAttributes() { return ['tool', 'hub', 'base']; }
    connectedCallback() { this.go(); }
    attributeChangedCallback() { this.go(); }
    go() {
      var self = this; clearTimeout(this._t);
      this._t = setTimeout(function () {
        if (!self.isConnected || (!self.hasAttribute('tool') && !self.hasAttribute('hub'))) return;
        import(BASE + 'js/element.bundle.js?v=6').then(function (m) { return m.mount(self); })
          .catch(function () { self.textContent = 'The PDF tools could not load. Please refresh the page.'; });
      }, 40);
    }
  }
  customElements.define('pdf-toolkit-app', PdfToolkitApp);
})();
