# OpenCloud Forms 1.2.0

First public release of OpenCloud Forms. Install both the Web extension and the Forms service.

## Français

- Interface, page publique et messages de validation disponibles en français, espagnol et allemand.
- Page publique dans la langue du navigateur ; `?lang=fr`, `?lang=es` ou `?lang=de` permet de la choisir explicitement.
- Langue configurable pour les en-têtes du tableur et les réponses Oui/Non.
- Corrections de validation des dates, nombres décimaux, cases obligatoires et erreurs de stockage.
- Les questions et les textes personnalisés restent dans la langue de leur auteur.

## Español

- Interfaz, página pública y mensajes de validación disponibles en francés, español y alemán.
- La página pública usa el idioma del navegador; se puede elegir con `?lang=fr`, `?lang=es` o `?lang=de`.
- Idioma configurable para los encabezados de la hoja de cálculo y las respuestas Sí/No.
- Correcciones de validación de fechas, números decimales, casillas obligatorias y errores de almacenamiento.
- Las preguntas y los textos personalizados conservan el idioma de su autor.

## Deutsch

- Oberfläche, öffentliche Formularseite und Validierungsmeldungen auf Französisch, Spanisch und Deutsch.
- Die öffentliche Seite folgt der Browsersprache; mit `?lang=fr`, `?lang=es` oder `?lang=de` lässt sie sich festlegen.
- Einstellbare Sprache für Tabellenüberschriften und Ja/Nein-Antworten.
- Korrekturen für Datumsprüfung, Dezimalzahlen, Pflichtauswahl und Speicherfehler.
- Fragen und benutzerdefinierte Texte bleiben in der Sprache ihres Autors.

## Downloads and installation

- `forms.zip`: extract into `<WEB_ASSET_APPS_PATH>/forms/`, then restart OpenCloud.
- `forms-server.zip`: extract and run the service; set `OPENCLOUD_URL` and a stable `FORMS_SECRET` (at least 32 characters), then proxy `/forms-api/` to it.
- `opencloud-forms-1.2.0.zip`: complete sources and both installation archives.
- `SHA256SUMS`: checksums for all three archives.

See [README.md](https://github.com/JulesMellot/opencloud-forms/blob/main/README.md) for setup details.
Deploy the extension and service together. The service now also requires `l10n/translations.json`, included in its archive and container.

## Validation and limits

Unit, server, translation and Chromium browser tests cover the three languages. The maintainer has also manually validated this release on their OpenCloud instance.
This manual validation does not establish compatibility with every OpenCloud installation. The extension targets the OpenCloud Web 7.4 SDK; compatibility with every
OpenCloud release is not guaranteed. English remains available as a fallback.
