// Copyright (c) 2015 Google Inc. All rights reserved.
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

import JsFileSystem from 'axiom/fs/js/file_system';
import SkeletonFileSystem from 'axiom/fs/stream/skeleton_file_system';
import Transport from 'axiom/fs/stream/transport';
import Channel from 'axiom/fs/stream/channel';
import ExtensionStreams from 'axiom/fs/stream/extension_streams';

/** @typedef AxiomEvent$$module$axiom$core$event */
var AxiomEvent;

/**
 * Host filesystem with chrome handling executable for use with axiom.
 * Listens for an ExtensionStream connection and then attaches
 * a SkeletonFileSystem to it.
 *
 * @constructor
 */
export var ChromeAgent = function() {
  this.streams = null;
  this.handleConnected_ = this.handleConnected_.bind(this);
  this.handleDisconnected_ = this.handleDisconnected_.bind(this);
  this.setupConnection();
}

ChromeAgent.prototype.setupConnection = function() {
  // TODO (ericarnold): This will be leaked.  We need to make sure there is a weak
  // reference somewhere in the transport, channel, filesystem, stream chain.
  this.streams = new ExtensionStreams();
  this.streams.startListening(true);
  this.streams.resume();
  this.streams.onConnect.addListener(this.handleConnected_);
  this.streams.onDisconnect.addListener(this.handleDisconnected_);

  /** @const @type {!AxiomEvent} */
  this.onConnect = this.streams.onConnect;

  /** @const @type {!AxiomEvent} */
  this.onDisconnect = this.streams.onDisconnect;
};

ChromeAgent.prototype.handleDisconnected_ = function(event) {
  this.setupConnection();
};

ChromeAgent.prototype.handleConnected_ = function(event) {
  var jsfs = new JsFileSystem();
  var fsm = jsfs.fileSystemManager;

  jsfs.rootDirectory.mkdir('exe').then(function(jsdir) {
    var transport = new Transport(
        'PostMessageTransport',
        this.streams.readableStream,
        this.streams.writableStream);
    var channel = new Channel('PostMessageChannel', 'ext', transport);
    var skeleton = new SkeletonFileSystem('extfs', jsfs, channel);
  }.bind(this));
}
