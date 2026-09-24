import './styles/main.css';
import { ASSETS, PLAYER_POSES, SPRITE_SHEETS } from './config/assets.js';
import { APP } from './config/constants.js';
import { AssetLoader } from './core/AssetLoader.js';
import { Input } from './core/Input.js';
import { Game } from './core/Game.js';
import { Renderer } from './rendering/Renderer.js';
import { AudioManager } from './systems/AudioManager.js';
import { Storage } from './services/Storage.js';
import { ProfileService } from './services/ProfileService.js';
import { WalletService } from './services/WalletService.js';
import { createLeaderboard } from './services/leaderboard/index.js';
import { SettingsService } from './services/SettingsService.js';
import { UIManager } from './ui/UIManager.js';
import { EventBus, EVENTS } from './core/EventBus.js';
import { registerServiceWorker } from './services/serviceWorker.js';

/**
 * Composition root — the only place where concrete classes are wired
 * together. Everything else receives its dependencies via constructors.
 */
async function bootstrap() {
  const canvas = document.getElementById('game');

  const storage = new Storage();
  const profile = new ProfileService(storage);
  const wallet = new WalletService(storage);
  const leaderboard = createLeaderboard(storage);
  leaderboard.setCurrentName(profile.name);
  leaderboard.init().catch((err) => console.warn('[leaderboard] offline:', err.message));
  const settings = new SettingsService(storage);

  const events = new EventBus();
  const audio = new AudioManager({ muted: settings.muted, music: settings.music });
  const input = new Input(canvas);
  const assets = new AssetLoader();
  const renderer = new Renderer(canvas, assets);

  const game = new Game({ events, input, renderer, audio, profile, wallet, leaderboard });
  const ui = new UIManager({ game, events, profile, wallet, leaderboard, settings, audio });

  registerServiceWorker({ onUpdate: () => events.emit(EVENTS.UPDATE_READY) });

  await assets.loadAll(ASSETS, (p) => ui.setProgress(p));
  renderer.cachePoses(PLAYER_POSES);
  renderer.cacheSheets(SPRITE_SHEETS);
  game.boot();

  // Handy for debugging in the browser console.
  if (import.meta.env?.DEV) window.__DILIJUMP__ = { game, profile, wallet, leaderboard, audio };
  console.info(`%c${APP.NAME} v${APP.VERSION}`, 'color:#5fb0f5;font-weight:bold');
}

bootstrap().catch((err) => {
  console.error(err);
  const el = document.getElementById('screen-loading');
  if (!el) return;
  const msg = document.createElement('p');
  msg.className = 'error';
  msg.textContent = 'DiliJump could not start. Check your connection and try again.';
  const btn = document.createElement('button');
  btn.className = 'btn btn--primary';
  btn.textContent = '↻ Reload';
  btn.addEventListener('click', () => window.location.reload());
  el.replaceChildren(msg, btn);
});
