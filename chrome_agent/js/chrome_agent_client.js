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

export var chromeAgentClient = {};
export default chromeAgentClient;

/**
 * @constructor
 */
chromeAgentClient.ErrorSendingRequest = function(message) {
  this.message = message;
};

/**
 * @constructor
 */
chromeAgentClient.ErrorExecutingRequest = function(message) {
  this.message = message;
};

chromeAgentClient.AGENT_APP_ID_ = 'lfbhahfblgmngkkgbgbccedhhnkkhknb';
chromeAgentClient.AGENT_INSTALL_URL_ =
    'https://chrome.google.com/webstore/detail/' +
    chromeAgentClient.AGENT_APP_ID_;

/**
 * Open a new tab with the Agent extension's page in Chrome Web Store,
 * allowing the user to install it.
 *
 * @return {void}
 */
chromeAgentClient.installAgent = function() {
  window.open(chromeAgentClient.AGENT_INSTALL_URL_);
};

/**
 * Open a new tab with the official documentation for the given
 * Chrome Extensions API, or the top page of the documentation if no API is
 * provided.
 *
 * @param {string} api
 * @return {void}
 */
chromeAgentClient.openApiOnlineDoc = function(api) {
  var urlSuffix = 'api_index';
  if (api) {
    var parts = api.split('.');
    if (parts[0] === 'chrome')
      parts.shift();

    if (parts.length == 1)
      urlSuffix = parts[0];
    else if (parts.length == 2)
      urlSuffix = parts[0] + '#method-' + parts[1];
    else if (parts.length === 3)
      urlSuffix = parts[0] + '_' + parts[1] + '#method-' + parts[2];
  }
  var url = 'https://developer.chrome.com/extensions/' + urlSuffix;
  window.open(url);
};

/**
 * Invoke a Chrome API with the given name and arguments, and return the result
 * If the API's name resolves to something different from a function, and there
 * no arguments, the value of the resolved object is returned instead.
 * 
 * @param {!string} api
 * @param {!Object<string, *>} args
 * @param {!{timeout: number}} options
 * @return {!Promise<*>} Result returned by the API.
 */
chromeAgentClient.callApi = function(api, args, options) {
  return new Promise(function(resolve, reject) {
    if (!api) {
      return reject('No such API, or no permission to use it');
    }

    if (typeof api !== 'function') {
      // This can be an API property that the caller wants to read.
      if (args.length > 0) {
        return reject('This API is not a function: use with no arguments');
      }
      return resolve(api);
    }

    // Complete the promise either via a callback or a timeout.
    var timedOut = false;
    var timeout = null;
    if (options.timeout) {
      timeout = setTimeout(function() {
        timedOut = true;
        reject('Timed out');
      }.bind(this), options.timeout);
    }

    var callback = function(result) {
      if (!timedOut) {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      }
    }.bind(this);

    try {
      // `args` is an array, so we must use `apply` to invoke the API. The API,
      // however, requires a callback as one extra argument: append it to `args`.
      // NOTE: Since the callback of this call will resolve/reject the outer
      // Promise, make sure the following is the last call of this function.
      api.apply(this, args.concat([callback]));
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      }
    } catch (error) {
      if (!timedOut) {
        clearTimeout(timeout);
        var match = BAD_API_INVOCATION_ERROR_RE_.exec(error);
        if (match) {
          // Massage this particularly frequent error message to be clearer.
          reject(
              'Wrong API arguments: expected ' + match[2] +
              ' but got ' + match[1] + ' <= ' + JSON.stringify(args));
        } else {
          reject(error);
        }
      }
    }
  }.bind(this));
};

/**
 * Execute a script in the given tabs' "isolated world" (with full access to
 * the DOM context but not the JavaScript context).
 * 
 * The result of the executions is passed back as a single value for a single
 * requested tab, or as a map of form { tabId1: result1, ... } for multiple
 * requested tabs (special values 'all' and 'window' are considered multiple
 * tabs even if they resolve to just one).
 * 
 * The execution is resilient to errors and/or timeouts in individual tabs,
 * which can happen for various reasons (the script itself never returns or
 * attempts to return too much data; a tab may be hung ("Aw, snap!"); a tab may
 * be a special chrome:// tab, in which scripts are prohibited and error out).
 * Such errors are returned in the results map as special string values.
 *
 * Request the Agent extension to execute the given script in the given list
 * of tabs, with the given options. The result of the executions is passed back 
 * as a single value for a single requested tab, or as a map of form
 * { tabId1: result1, ... } for multiple requested tabs (special values 'all'
 * and 'window' are considered multiple tabs even if they resolve to just one).
 *
 * @param {!string} code
 * @param {!(Array<number>|string)} tabIds
 * @param {!{allFrames: boolean, runAt: string, timeout: number}} options
 * @return {!Promise<Object<string, *>>}
 */
chromeAgentClient.executeScriptInTabs = function(code, tabIds, options) {
  return this.applyActionToTabs_(tabIds, this.executeScriptInTab_, [code, options]);
};

/**
 * Insert the given CSS fragment into the given list of tabs, with the given
 * options. If there are any errors, they are returned as a single string for
 * a single requested tab, or as a map of form { tabId1: error1, ... } for
 * multiple requested tabs (special values 'all' and 'window' are considered
 * multiple tabs even if they resolve to just one).
 * 
 * Note that the author styles take precedence over any iserted styles, so
 * if there is a clash for some setting, the inserted CSS will have no effect
 * (this is the limitation of the underlying Chrome API).
 *
 * @param {!string} css
 * @param {!(Array<number>|string)} tabIds
 * @param {!{allFrames: boolean, runAt: string, timeout: number}} options
 * @return {!Promise<Object<string, *>>}
 */
chromeAgentClient.insertCssIntoTabs = function(css, tabIds, options) {
  return this.applyActionToTabs_(tabIds, this.insertCssIntoTab_, [css, options]);
};

/**
 * A regexp for one particularly frequent error message that needs to be
 * translated for the client.
 * 
 * @private @const
 */
var BAD_API_INVOCATION_ERROR_RE_ =
    /^Error: Invocation of form (.+) doesn't match definition (.+)$/;

/**
 * Execute a script in the given tab's "isolated world" (with full access to
 * the DOM context but not the JavaScript context).
 * 
 * The result of the executions is passed back as a single value for a single
 * requested tab, or as a map of form { tabId1: result1, ... } for multiple
 * requested tabs (special values 'all' and 'window' are considered multiple
 * tabs even if they resolve to just one).
 * 
 * The execution is resilient to errors and/or timeouts in individual tabs,
 * which can happen for various reasons (the script itself never returns or
 * attempts to return too much data; a tab may be hung ("Aw, snap!"); a tab may
 * be a special chrome:// tab, in which scripts are prohibited and error out).
 * Such errors are returned in the results map as special string values.
 *
 * Request the Agent extension to execute the given script in the given list
 * of tabs, with the given options. The result of the executions is passed back 
 * as a single value for a single requested tab, or as a map of form
 * { tabId1: result1, ... } for multiple requested tabs (special values 'all'
 * and 'window' are considered multiple tabs even if they resolve to just one).
 * 
 * @private
 * @param {!number} tabId
 * @param {!string} code
 * @param {{allFrames: boolean, runAt: string, timeout: number}} options
 * @return {!Promise<*>}
 */
chromeAgentClient.executeScriptInTab_ = function(tabId, code, options) {
  // TODO(ussuri): Catch and return possible exceptions in the user's code.
  // The following didn't work:
  // code = 'try {' + code + '} catch (err) { console.log("CAUGHT"); err; }';
  var details = {
    code: code,
    allFrames: options.allFrames || false,
    runAt: options.runAt || 'document_idle'
  };

  return this.callApi(chrome.tabs.executeScript, [tabId, details], options)
    .then(function(result) {
      return details.allFrames ? result : result[0];
    }.bind(this));
};

/**
 * Insert a fragment of CSS into the given tab and return the result of the
 * underlying API call (mostly useful in case of errors).
 *
 * @private
 * @param {!number} tabId
 * @param {!string} css
 * @param {{allFrames: boolean, runAt: string, timeout: number}} options
 * @return {!Promise<*>}
 */
chromeAgentClient.insertCssIntoTab_ = function(tabId, css, options) {
  var details = {
    code: css,
    allFrames: options.allFrames || false,
    runAt: options.runAt || 'document_idle'
  };
  return this.callApi(chrome.tabs.insertCSS, [tabId, details], options);
};

/**
 * Apply an action (a function-like entity) to the multiple requested tabs, and
 * return a map of form {tabId1: result1, ...}. Per-tab errors are reported as
 * strings with special values in the same map, but not flagged to the caller
 * in a more explicit way; that is, a call will always "succeed" from the
 * caller's perspective.
 *
 * @private
 * @param {!(Array<number>|string)} tabIds
 * @param {!function(!number, !string, {allFrames: boolean, runAt: string, timeout: number})} action
 * @param {!Array<*>} args
 * @return {!Promise<Object<string, *>>}
 */
chromeAgentClient.applyActionToTabs_ = function(tabIds, action, args) {
  // TODO(ussuri): Somehow return mixed results/errors, while explicitly
  // indicating to callers that error(s) have occurred.
  return this.normalizeTabIds_(tabIds).then(function(nTabIds) {
    var results = {};

    var applyAction = function(tabId) {
      return action.apply(this, [tabId].concat(args))
        .then(function(result) {
          results[tabId] = result;
        }.bind(this)).catch(function(error) {
          results[tabId] =
              '<ERROR: ' + (error.message ? error.message : error) + '>';
        }.bind(this));
    }.bind(this);

    var promises = nTabIds.map(function(tabId) {
      return applyAction(tabId);
    }.bind(this));
    return Promise.all(promises).then(function(_) {
      return results;
    }.bind(this));
  }.bind(this));
};

/**
 * Expand special values 'all' and 'window' of a tab ID list into an actual list
 * of IDs. Regular lists are returned as-is.
 *
 * @private
 * @param {!(Array<number>|string)} tabIds
 * @return {!Promise<!Array<number>>}
 */
chromeAgentClient.normalizeTabIds_ = function(tabIds) {
  if (!tabIds || tabIds === 'all') {
    return this.getAllTabIds_(false);
  } else if (tabIds === 'window') {
    return this.getAllTabIds_(true);
  } else {
    return /**@type {?}*/(Promise.resolve(tabIds));
  }
};

/**
 * Return a list of all tab IDs in all the open windows or the current
 * window only.
 *
 * @private
 * @param {boolean} thisWindowOnly
 * @return {!Promise<!Array<number>>} IDs of all the open tabs in all the windows.
 */
chromeAgentClient.getAllTabIds_ = function(thisWindowOnly) {
  return new Promise(function(resolve, reject) {
    // NOTE: {thisWindowOnly: false} means "other windows", but we want "all",
    // so use {}.
    var options = thisWindowOnly ? {currentWindow: true} : {};
    chrome.tabs.query(options, function(tabs) {
      resolve(tabs.map(function(tab) { return tab.id; }));
    }.bind(this));
  }.bind(this));
};

/**
 * @private @const
 */
var WEB_SHELL_TAB_PROPS_ = {
  title: 'Console',
  url: '*://*/**/web_shell/index.html'
};

/**
 * @private @const
 */
var HOSTED_WEB_SHELL_URL_ =
    'https://chromium.github.io/axiom/web_shell/index.html';

/**
 * @private
 * @type {number}
 */
var activeWebShellTabIdx_ = -1;

/**
 * Clicking on the extension icon in the toolbar will:
 * - If no tabs with the web shell are open, open a hosted shell in a new tab;
 * - If one or more tabs with the web shell are already open (e.g. a test
 *   and a hosted instances), then cycle through them.
 */
chrome.browserAction.onClicked.addListener(function() {
  chrome.tabs.query(WEB_SHELL_TAB_PROPS_, function(tabs) {
    if (tabs && tabs.length > 0) {
      ++activeWebShellTabIdx_;
      if (activeWebShellTabIdx_ >= tabs.length) {
        activeWebShellTabIdx_ = 0;
      }
      var tab = /** chrome.tabs.Tab */tabs[activeWebShellTabIdx_];
      chrome.tabs.update(tab.id, {active: true}, function() {});
      chrome.windows.update(tab.windowId, {focused: true}, function() {});
    } else {
      chrome.tabs.create({url: HOSTED_WEB_SHELL_URL_, active: true});
    }
  });
});
