import './styles/main.css';
import { ASSETS, PLAYER_POSES } from './config/assets.js';
import { APP } from './config/constants.js';
import { AssetLoader } from './core/AssetLoader.js';
import { EventBus } from './core/EventBus.js';
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
  const audio = new AudioManager({ muted: settings.muted });
  const input = new Input(canvas);
  const assets = new AssetLoader();
  const renderer = new Renderer(canvas, assets);

  const game = new Game({ events, input, renderer, audio, profile, wallet, leaderboard });
  const ui = new UIManager({ game, events, profile, wallet, leaderboard, settings, audio });

  await assets.loadAll(ASSETS, (p) => ui.setProgress(p));
  renderer.cachePoses(PLAYER_POSES);
  game.boot();

  // Handy for debugging in the browser console.
  if (import.meta.env?.DEV) window.__DILIJUMP__ = { game, profile, wallet, leaderboard };
  console.info(`%c${APP.NAME} v${APP.VERSION}`, 'color:#5fb0f5;font-weight:bold');
}

bootstrap().catch((err) => {
  console.error(err);
  const el = document.getElementById('screen-loading');
  if (el) el.innerHTML = `<p class="error">Failed to start DiliJump.<br/>${err.message}</p>`;
});
