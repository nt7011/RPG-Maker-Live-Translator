import { bootGuiApplication } from './application.js';
import { publishGuiDiagnosticsSink } from './runtime/diagnostics-push.js';
import { publishGuiStatusSink } from './runtime/status-push.js';
import { publishGuiTextRecordsSink } from './runtime/current-translations.js';
bootGuiApplication();
publishGuiStatusSink();
publishGuiTextRecordsSink();
publishGuiDiagnosticsSink();
