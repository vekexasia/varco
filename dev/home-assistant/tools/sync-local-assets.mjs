import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dev/home-assistant/config/www', { recursive: true });
copyFileSync('packages/client/dist/varco-client.js', 'dev/home-assistant/config/www/varco-client.js');
copyFileSync('dev/home-assistant/local-assets/varco-local-hass-card.js', 'dev/home-assistant/config/www/varco-local-hass-card.js');
console.log('Synced Varco local Home Assistant dashboard assets to dev/home-assistant/config/www');
