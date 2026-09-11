import { initializeGuiShell, logGuiLoaded } from './application.js';
import { renderRuntimePanelsForFeed } from './panels/render.js';
import { refreshGuiPolicySnapshot } from './policy.js';
import { guiPreviewController as preview } from './preview.js';
import { refreshRuntimeFeed } from './runtime/feed-refresh.js';
import { stopUpdateChecker } from './version/controller.js';
if (!preview.isEnabled())
    throw new Error('The GUI preview entry requires an explicit preview query.');
preview.installControls();
initializeGuiShell();
preview.beforeBoot();
window.addEventListener('beforeunload', stopUpdateChecker);
preview.refreshRuntimeContext();
preview.refreshConfigSummary();
preview.refreshVersionPanel();
refreshRuntimeFeed(preview.getGameWindow());
renderRuntimePanelsForFeed(refreshGuiPolicySnapshot(), { force: true });
preview.afterBoot();
logGuiLoaded('GUI monitor preview loaded.');
