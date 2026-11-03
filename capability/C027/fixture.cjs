'use strict';

const { getProfileV1, getProfileV2 } = require('../C020/profiles.cjs');
const protocol = require('./protocol.js');
const { fields, profileFor, VERSION, EVENT_COUNT, ProtocolError, freeze, expectedEvent, parseCursor } = protocol;

function getLog(request) {
  const { profileId, version } = fields(request, ['profileId', 'version']);
  profileFor(profileId);
  if (version !== VERSION) throw new ProtocolError('UNKNOWN_VERSION', 'Only the immutable r1 SSE fixture exists.', 404);
  return freeze(Array.from({ length: EVENT_COUNT }, (_, index) => {
    const event = expectedEvent(profileId, index + 1);
    const fixture = index % 2 ? getProfileV2 : getProfileV1;
    return freeze({ ...event, payload: fixture({ profileId }) });
  }));
}

function encodeEvent(event) {
  protocol.validateEvent(event?.id, JSON.stringify(event), event?.payload?.profile?.id);
  return Buffer.from(`id: ${event.id}\nevent: profile\ndata: ${JSON.stringify(event)}\n\n`, 'utf8');
}

function suffix(request, acceptedCursor) {
  const log = getLog(request);
  return freeze(log.slice(parseCursor(acceptedCursor, request.profileId)));
}

module.exports = Object.freeze({ getLog, encodeEvent, suffix });
