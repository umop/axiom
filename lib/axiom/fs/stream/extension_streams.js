// Copyright 2015 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import AxiomError from 'axiom/core/error';
import BufferedStreams from 'axiom/fs/stream/buffered_streams';
import PostMessageStreams from 'axiom/fs/stream/post_message_streams';
import EventWithCallback from 'axiom/fs/stream/buffered_streams';

/**
 * Extend PostMessageStreams for use with a Chrome extension.
 *
 * @constructor
 * @extends {PostMessageStreams}
 */
export var ExtensionStreams = function() {
  PostMessageStreams.call(this);

  /** @type {?string} */
  this.appId = null;

  /** @private @type {boolean} */
  this.listening_ = false;

  // Handlers
  this.handleExtensionConnected_ = this.handleExtensionConnected_.bind(this);
};

ExtensionStreams.prototype = Object.create(PostMessageStreams.prototype);

export default ExtensionStreams;

/**
 * Open an ExtensionStream at given appId
 *
 * @param {string} appId The appId where receiving ExtensionStream lives.
 * @return {Promise}
 */
ExtensionStreams.prototype.openExtension = function(appId) {
  this.appId = appId;

  if (this.listening_) throw new AxiomError.Invalid(
      'Cannot connect.  Already listening.', this.getState_());

  var port = chrome.runtime.connect(appId);
  return PostMessageStreams.prototype.open.call(this, {port: port,
      alreadyConnected: false});
};

/**
 * Listen (as an extension) for a connection.
 *
 * @return {Promise<*>}
 * @param {boolean} oneShot
 */
ExtensionStreams.prototype.startListening = function(oneShot) {
  if (this.getState_() != BufferedStreams.ConnectionState.CLOSED) {
    throw new AxiomError.Invalid('Cannot listen.  Connection not closed.',
    this.getState_());
  }

  if (!this.listening_) {
    this.oneShot_ = oneShot;
    chrome.runtime.onConnectExternal.addListener(this.handleExtensionConnected_);
    this.listening_ = true;
  }
};

/**
 * Stop listening for a connection.
 *
 * @return {Promise<*>}
 */
ExtensionStreams.prototype.stopListening = function() {
  if (this.listening_) {
    chrome.runtime.onConnectExternal.removeListener(this.handleExtensionConnected_);
    this.listening_ = false;
  }
}

ExtensionStreams.prototype.handleExtensionConnected_ = function(port) {
  this.stopListening();
  PostMessageStreams.prototype.open.call(this, {port: port,
      alreadyConnected: true});

  port.postMessage({command: 'connected'});
};
  