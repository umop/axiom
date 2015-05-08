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
import AxiomEvent from 'axiom/core/event';
import BufferedStreams from 'axiom/fs/stream/buffered_streams';
import EventWithCallback from 'axiom/fs/stream/buffered_streams';
import Completer from 'axiom/core/completer';

/**
 * Extend a BufferedStreams over a messaging port.
 *
 * @constructor
 * @extends {BufferedStreams}
 */
export var PostMessageStreams = function() {
  BufferedStreams.call(this);

  /** @type {Port} */
  this.port = null;

  /** @private @type {?Completer} */
  this.completer_ = null;
  /** @private @type {BufferedStreams.ConnectionState} */
  this.connectionState_ = BufferedStreams.ConnectionState.CLOSED;

  /** @const @type {!AxiomEvent} */
  this.onDisconnect = new AxiomEvent();

  /** @const @type {!AxiomEvent} */
  this.onConnect = new AxiomEvent();

  // Bind event handlers
  this.onConnectedMessage_ = this.onConnectedMessage_.bind(this);
  this.onPortConnectionError_ = this.onPortConnectionError_.bind(this);
  this.onPostMessage_ = this.onPostMessage_.bind(this);
  this.onPortDisconnect = this.onPortDisconnect.bind(this);
};

PostMessageStreams.prototype = Object.create(BufferedStreams.prototype);

export default PostMessageStreams;

/**
 * @return {Promise}
 * @param { !{port: !Port, alreadyConnected: !boolean} } argObject
 */
PostMessageStreams.prototype.open = function(argObject) {
  /** @type {Port} port */
  var port = argObject.port
  /** @param {boolean=} alreadyConnected */
  var alreadyConnected = argObject.alreadyConnected;

  this.port = port;

  if (alreadyConnected) {
    this.handleConnected_();
    // TODO(ericarnold): Handle failed connect event
    // TODO(ericarnold): Handle disconnect event
    // TODO(ericarnold): Handle error event
    return Promise.resolve();
  } else {
    this.completer_ = new Completer();
    this.connectionState_ = BufferedStreams.ConnectionState.CONNECTING;
    port.onMessage.addListener(this.onConnectedMessage_);
    port.onDisconnect.addListener(this.onPortConnectionError_);

    return this.completer_.promise;
  }
};

/**
 * @return {void}
 */
PostMessageStreams.prototype.close = function() {
  this.port.disconnect();
  this.connectionState_ = BufferedStreams.ConnectionState.CLOSING;
  //TODO: Implement
};

/**
 * @return {void}
 */
PostMessageStreams.prototype.onConnectedMessage_ = function(event) {
  this.cleanupConnectionListeners_();
  this.handleConnected_();
  this.completer_.resolve();
};

/**
 * @return {void}
 */
PostMessageStreams.prototype.onPortConnectionError_ = function(event) {
  this.connectionState_ = BufferedStreams.ConnectionState.CLOSED;
  this.cleanupConnectionListeners_();
  this.completer_.reject(new AxiomError.Runtime('Error connecting to extension'));
  this.port = null;
};

/**
 * @return {void}
 */
PostMessageStreams.prototype.onPortDisconnect = function(event) {
  this.connectionState_ = BufferedStreams.ConnectionState.CLOSED;
  this.handleClose_();
  this.port = null;
  this.onDisconnect.fire(null);
};

/**
 * @return {void}
 */
PostMessageStreams.prototype.onPostMessage_ = function(message) {
  this.handleReceive_(message);
};

/**
 * @protected
 * @param {EventWithCallback|string} item
 * @return {void}
 */
PostMessageStreams.prototype.handleSend_ = function(item) {
  BufferedStreams.prototype.handleSend_.call(this, item);

  if (item instanceof EventWithCallback) {
    this.port.postMessage(/* string */(item.value));

    // TODO (ericarnold): implement callback
    item.callback();
  } else {
    this.port.postMessage(/** @type {Object<string, string>} */(item));
  }
};

/**
 * @protected
 * @override
 * @return {void}
 */
PostMessageStreams.prototype.handleConnected_ = function() {
  this.connectionState_ = BufferedStreams.ConnectionState.CONNECTED;
  this.port.onMessage.addListener(this.onPostMessage_);
  this.port.onDisconnect.addListener(this.onPortDisconnect);
  BufferedStreams.prototype.handleConnected_.call(this);
  this.onConnect.fire(null);
};

/**
 * @protected
 * @override
 * @return {void}
 */
PostMessageStreams.prototype.handleClose_ = function() {
  this.port.onMessage.removeListener(this.onPostMessage_);
  this.port.onDisconnect.removeListener(this.onPortDisconnect);
  BufferedStreams.prototype.handleClose_.call(this);
};

/**
 * @return {void}
 */
PostMessageStreams.prototype.cleanupConnectionListeners_ = function() {
  this.port.onMessage.removeListener(this.onConnectedMessage_);
  this.port.onDisconnect.removeListener(this.onPortConnectionError_);
};

/**
 * Return the state of the connection.
 *
 * @protected
 */
PostMessageStreams.prototype.getState_ = function() {
  BufferedStreams.prototype.getState_.call(this);

  if (this.port === null) {
    return BufferedStreams.ConnectionState.CLOSED;
  } else {
    return this.connectionState_;
  }
};

