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


var Fold;
this.allowNextUnfold_ = false;

window.onload = function() {
  require.config({
      baseUrl: "http://acejs.localhost"
  });
  var editor;
  require(["ace/ace", "ace/edit_session/fold"], function (ace, fold) {
      editor = ace.edit("editor");
      Fold = fold.Fold;
      // editor.setTheme("ace/theme/monokai");
      editor.getSession().setMode("ace/mode/javascript");
        var event = new Event('ready');
        event.initEvent('ready', false, false);
        this.dispatchEvent(event);

        editor.focus();
        editor.commands.addCommand({
          name: 'saveFile',
          bindKey: {
            win: 'Ctrl-S',
            mac: 'Command-S',
            sender: 'editor|cli'
          },
          exec: (function(editor, args, request) {
            var event = new Event('save');
            event.initEvent('save', false, false);
            event.target = this;
            this.dispatchEvent(event);
          }).bind(this)
        });

        setupVisualization(editor);
  });

  document.addEventListener('mousedown', function(e) {
    if (e.target.classList.contains('ace_fold')) {
      this.allowNextUnfold_ = true;
    }
  }.bind(this));
}.bind(this);

if (window.opener && window.opener.onEditorWindowOpened) {
  window.opener.onEditorWindowOpened();
}

function setContents(contents) {
  var session = window.aceEditor.getSession();
  session.setValue(contents, -1);
}

function getContents() {
  var session = window.aceEditor.getSession();
  return session.getValue();
}

this.setupVisualization = function (editor) {
  var Range = require("ace/range").Range;

  editor.on('input', function() {
    editor.getSession().unfold(2, true);
    var content = editor.session.getValue()
    // var re = /\/\*\* @type \{([A-Za-z_$.]+)\} ?\*\/\n(\s*)var/g;
    var re = /for \(var ([a-zA-Z_$]+) *\= *([-a-zA-Z$0-9.]+) *; *([a-zA-Z_$]+) *([<=>]+) *([-a-zA-Z$0-9.]+) *; *([a-zA-Z_$]+)(--|\+\+) *\)/g;
    while(m = re.exec(content)) {
      var annotationStartIndex = m.index
      var annotationEndIndex = m[0].length + annotationStartIndex;
      var startPosition = editor.session.getDocument().indexToPosition(annotationStartIndex)
      var endPosition = editor.session.getDocument().indexToPosition(annotationEndIndex)
      var endValue = m[5];
      var placeholder = " \u25B6 loop " + m[1] + " : " + m[2] + " \u279C " + endValue + " \u2630 ";
      var markerRange = new Range(startPosition.row, startPosition.column, endPosition.row, endPosition.column);
      placeholder = new Fold(markerRange, placeholder)
      placeholder.subType = "if_statement";
      editor.session.addFold(placeholder, markerRange);
    }

    var re = /(|\/\*\* @type \{([^}]+)\} ?\*\/\n(\s*))\bvar /g;
    while(m = re.exec(content)) {
      var annotationStartIndex = m.index
      var annotationEndIndex = m[0].length + annotationStartIndex - 1;
      var startPosition = editor.session.getDocument().indexToPosition(annotationStartIndex)
      var endPosition = editor.session.getDocument().indexToPosition(annotationEndIndex)
      var markerRange = new Range(startPosition.row, startPosition.column, endPosition.row, endPosition.column);
      var typeName = m[2];
      var subType = "type_annotation";
      if (typeName === undefined) {
        typeName = "var";
      } else {
        subType = "blank_type_annotation";

      }
      // var placeholder = " \u25B6 " + typeName + " \u2630 ";
      var placeholder = " \u25B6 " + typeName + " ";
      placeholder = new Fold(markerRange, placeholder)
              placeholder.subType = subType;
      editor.session.addFold(placeholder, markerRange);
      // editor.session.addMarker(markerRange, "ace_selected-word", "text");
    }
  });

  editor.session.addEventListener("changeFold", function(e) {
    console.log(e);
    if (e.action == "remove") {
      if (this.allowNextUnfold_) {
        this.allowNextUnfold_ = false;
        if (e.data.subType == 'blank_type_annotation' || e.data.subType == 'type_annotation') {
          var content = editor.session.getValue()
          var startIndex = editor.session.getDocument().positionToIndex(e.data.start);
          var endIndex = editor.session.getDocument().positionToIndex(e.data.end);
          var annotationText = content.substr(startIndex, endIndex);
          // var re = /(@type \{)([^}]+)\}/;
          var re = /(|\/\*\* @type \{[^}]+\} ?\*\/\n\s*\b)(var)/g;
          m = re.exec(annotationText)
          var introLength = m[1].length;
          var typeName = m[2];
          var annotationStartIndex = m.index + startIndex + introLength;
          var annotationEndIndex = annotationStartIndex + typeName.length;
          var startPosition = editor.session.getDocument().indexToPosition(annotationStartIndex)
          var endPosition = editor.session.getDocument().indexToPosition(annotationEndIndex)
          var markerRange = new Range(startPosition.row, startPosition.column, endPosition.row, endPosition.column);
          var placeholder = "" + typeName + "";
          placeholder = new Fold(markerRange, placeholder)
          placeholder.subType = 'unfolded_annotation';
          editor.session.addFold(placeholder, markerRange);
        } else {
          this.setupVisualization(editor);
        }
      } else {
        e.preventDefault();
        e.stopPropagation();
        var range = e.data.range;
        try {
          editor.session.addFold(e.data, range);
        } catch (e) {

        }
        // window.prompt("Type");
        return false;
      }
    }
  }.bind(this));
  editor.session.setValue("//hello\n  /** @type {string} */\n  var pathSpec = 'hello'")
}.bind(this);