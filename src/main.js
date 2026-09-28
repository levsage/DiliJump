import './styles/main.css';
import { ASSETS } from './config/assets.js';
import { DEFAULT_SKIN, getSkin, skinManifest, skinPreviewManifest } from './config/skins.js';
import { APP } from './config/constants.js';
import { AssetLoader } from './core/AssetLoader.js';
import { Input } from './core/Input.js';
import { Game } from './core/Game.js';
import { Renderer } from './rendering/Renderer.js';
import { AudioManager } from './systems/AudioManager.js';
import { Storage } from './services/Storage.js';
import { ProfileService } from './services/ProfileService.js';
import { WalletService } from './services/WalletService.js';
import { SkinService } from './services/SkinService.js';
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
  const skins = new SkinService(storage, wallet);
  const leaderboard = createLeaderboard(storage);
  leaderboard.setCurrentName(profile.name);
  const settings = new SettingsService(storage);

  const events = new EventBus();
  leaderboard
    .init()
    .then(() => leaderboard.myEntry())
    .then((me) => {
      if (leaderboard.mode === 'local') return;
      // best + XP follow the database (also after a leaderboard reset)
      if (profile.syncWithServer(ProfileService.statsFromEntry(me), leaderboard.unsyncedRuns())) {
        events.emit(EVENTS.PROFILE_SYNCED);
      }
    })
    .catch((err) => console.warn('[leaderboard] offline:', err.message));
  const audio = new AudioManager({ muted: settings.muted, music: settings.music });
  const input = new Input(canvas);
  const assets = new AssetLoader();
  const renderer = new Renderer(canvas, assets);

  const game = new Game({ events, input, renderer, audio, profile, wallet, leaderboard });
  /** Download a skin's artwork (if needed) and put it on the mascot. */
  const applySkin = async (id) => {
    await assets.loadAll(skinManifest(id));
    renderer.setSkin(getSkin(id));
    events.emit(EVENTS.SKIN_CHANGED, id);
  };
  const ui = new UIManager({
    game,
    events,
    profile,
    wallet,
    leaderboard,
    settings,
    audio,
    skins,
    applySkin,
  });

  registerServiceWorker({ onUpdate: () => events.emit(EVENTS.UPDATE_READY) });

  const progress = (p) => ui.setProgress(p);
  const withSkin = (id) => ({ images: { ...ASSETS.images, ...skinManifest(id).images } });
  let skinId = skins.equipped;
  try {
    await assets.loadAll(withSkin(skinId), progress);
  } catch (err) {
    if (skinId === DEFAULT_SKIN) throw err;
    // a bought skin that can't be downloaded right now must not block the game
    console.warn(`[skins] "${skinId}" unavailable, using ${DEFAULT_SKIN}:`, err.message);
    skinId = DEFAULT_SKIN;
    await assets.loadAll(withSkin(skinId), progress);
  }
  renderer.setSkin(getSkin(skinId));
  events.emit(EVENTS.SKIN_CHANGED, skinId);
  // Dressing Room previews: nice to have, never blocking
  assets.loadAll(skinPreviewManifest()).catch(() => {});
  game.boot();

  // Handy for debugging in the browser console.
  if (import.meta.env?.DEV)
    window.__DILIJUMP__ = { game, profile, wallet, leaderboard, audio, skins };
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
