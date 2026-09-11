import { bootGuiApplication } from './application.js';
import { createGuiTestApi } from './test-api.js';
Reflect.set(globalThis, 'LiveTranslatorGuiTestApi', createGuiTestApi());
bootGuiApplication();
