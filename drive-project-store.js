'use strict';
// Loaded by the Google service, before builder-project-store.js. Standalone pages remain local.
(function(root) {
  if (!root.BuilderDriveMode) return;
  const revisions = new Map(), operations = new Map();
  function call(method, argument) {
    return new Promise((resolve, reject) => {
      if (!root.google?.script?.run) {reject(new Error('Connexion Google indisponible. Rouvrez le lien partagé.'));return;}
      root.google.script.run.withSuccessHandler(resolve).withFailureHandler(error =>
        reject(new Error(error?.message || 'Drive indisponible. Votre travail reste ouvert.')))[method](argument);
    });
  }
  root.BuilderDriveStore = {
    list: () => call('buildersList'),
    async get(id) {
      const row = await call('buildersGet', id);
      return row;
    },
    // Only opening a project adopts its revision. Refreshing the list must never do so.
    use(id, revision) {
      if (id && Number.isSafeInteger(revision) && revision > 0) revisions.set(id, revision);
      else if (id) revisions.delete(id);
    },
    async put(row) {
      const payload = JSON.stringify(row.data), old = operations.get(row.id);
      const operationId = old?.payload === payload ? old.operationId : root.crypto.randomUUID();
      operations.set(row.id, {payload, operationId});
      const result = await call('buildersPut', {id:row.id, data:row.data,
        expectedRevision:revisions.get(row.id) ?? null, operationId});
      revisions.set(row.id, result.revision);
      operations.delete(row.id);
      return result;
    }
  };
  if (root.document) {
    // Preserve the Google entry point when switching between calculators.
    root.document.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      if (!link || !root.BuilderDriveServiceUrl) return;
      const url = new URL(link.href, root.document.baseURI);
      const name = url.pathname.split('/').pop();
      const base = new URL(root.document.baseURI);
      if (url.origin === base.origin && ['index.html','terrasse.html','escalier.html','pergola.html'].includes(name)) {
        link.href = root.BuilderDriveServiceUrl + '?page=' + name;
        link.target = '_top';
      }
    }, true);
    root.document.addEventListener('DOMContentLoaded', () => {
      const status = root.document.getElementById('projectStatus');
      if (status) status.textContent = 'Projets partagés sur Drive. Enregistrer met à jour la version commune.';
      const list = root.document.getElementById('projectList');
      if (list) list.setAttribute('aria-label', 'Projets partagés sur Drive');
    });
  }
})(typeof window === 'undefined' ? globalThis : window);
