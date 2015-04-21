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
import GenericStreams from 'axiom/fs/stream/generic_streams';
import PostMessageStreams from 'axiom/fs/stream/post_message_streams';
import EventWithCallback from 'axiom/fs/stream/generic_streams';

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
};

ExtensionStreams.prototype = Object.create(PostMessageStreams.prototype);

export default ExtensionStreams;

/**
 * @param {string} appId
 * @return {Promise}
 */
ExtensionStreams.prototype.openExtension = function(appId) {
  this.appId = appId;

  var port = chrome.runtime.connect(appId);
  return PostMessageStreams.prototype.openPort.call(this, port, false);
};

/**
 * Listen (as an extension) for a connection.
 * @param {string} appId
 * @return {Promise}
 */
ExtensionStreams.prototype.listenAsExtension = function() {
  return new Promise(function(resolve, reject) {
    chrome.runtime.onConnectExternal.addListener(function(port) {
      PostMessageStreams.prototype.openPort.call(this, port, true);
      port.postMessage({command: 'connected'});
      resolve();
    }.bind(this));
  }.bind(this));
}