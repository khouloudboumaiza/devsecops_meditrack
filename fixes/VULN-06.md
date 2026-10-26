# Correctif VULN-06 - XSS stocké (src/views/pages/record.ejs)
Remplacer `<p class="note-line"><%- line %></p>` par `<p class="note-line"><%= line %></p>`.
Plus tard : ajouter une CSP (`Content-Security-Policy: default-src 'self'`), l'application n'ayant ni script ni style inline.
