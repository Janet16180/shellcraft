/* global document, location */
/**
 * The page wired to stand-ins (stub session, stub map) for screenshots taken
 * before the engine and the map are merged. The screenshot script serves this
 * file in place of src/main.js.
 */

import { createSimBackend } from '../../../src/shell/backend.js';
import { startApp } from '../../../src/ui/app.js';
import { createStubSession } from './stub-session.js';
import { createStubMap, describeStubRoom } from './stub-map.js';

const params = new URLSearchParams(location.search);
const session = createStubSession(createSimBackend(), { introSeen: params.has('seen') });

startApp({ doc: document, session, createMap: createStubMap, describeRoom: describeStubRoom, createIntroBackend: createSimBackend });
