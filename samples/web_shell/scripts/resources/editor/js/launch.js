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

var Substitution = function(substitutor) {
  this.substitutor = substitutor;
}

var Substitutor = function(findRegex, reverseToken, subType,
    matchIndex, unfoldMatchIndex) {
  this.findRegex_ = findRegex;
  this.reverseToken_ = reverseToken;
  this.subType_ = subType;
  this.matchIndex_ = matchIndex;
  this.unfoldMatchIndex_ = unfoldMatchIndex;

  this.editor_ = window.aceEditor;
  this.session_ = window.s;
}

Substitutor.prototype.matchAll = function(content) {
  var Range = require("ace/range").Range;

  while(this.findAndCreateSubstitution_(content, null));
}

Substitutor.prototype.findAndCreateSubstitution_ = function(content, substitutor) {
  m = this.findRegex_.exec(content)
  if (!m) return false;

  var info = this.getFoldToken_(m.index, content, m);
  var range = this.rangeFromIndexes_(info.start, info.end);
  // var start = m.index;
  // var range = this.rangeFromIndexes_(start, m[0].length + start - 1);

  if (this.session_.getFoldsInRange(range).length == 0) {
    return this.createSubstitution(range, info.label, substitutor);
  }
  return true;
}


Substitutor.prototype.getFoldToken_ = function(startIndex, content, match) {
  return {label: m[this.matchIndex_], start: startIndex,
      end: m[0].length + startIndex - 1};
}

Substitutor.prototype.rangeFromIndexes_ = function(startIndex, endIndex) {
  var Range = require("ace/range").Range;
  var startPosition = this.session_.getDocument().indexToPosition(startIndex)
  var endPosition = this.session_.getDocument().indexToPosition(endIndex)
  var range = new Range(startPosition.row, startPosition.column,
      endPosition.row, endPosition.column);
  console.log(this.session_.getFoldsInRange(range));
  return range
}

Substitutor.prototype.createSubstitution = function(markerRange, value,
    substitution) {
  if (this.session_.getFoldsInRange(markerRange).length == 0) {
    var typeName = value;
    // var placeholder = " \u25B6 " + value + " \u2630 ";
    var placeholder = " \u25B6 " + value + " ";
    var fold = new Fold(markerRange, placeholder)
    fold.subType = this.subType_;
    fold.substitution = substitution ? substitution : new Substitution(this);
    this.session_.addFold(fold, markerRange);
    // this.session_.addMarker(markerRange, "ace_selected-word", "text");
    return fold;
  }
  return null;
}

// Substitutor.prototype.findTop_ = function(content) {}

Substitutor.prototype.getUnfoldedToken_ = function(annotationText) {
  m = /(\S*)/g.exec(annotationText)
  var label = m[1];
  return {label: label, start: 0, end: label.length};
}

Substitutor.prototype.expand = function(fold) {
  var Range = require("ace/range").Range;
  var content = this.session_.getValue();
  var startIndex = this.session_.getDocument().positionToIndex(fold.start);
  var endIndex = this.session_.getDocument().positionToIndex(fold.end);
  //TODO (ericarnold): This should be done by setting .lastIndex of regex.
  var foldText = content.substr(startIndex, endIndex);
  if (fold.subType == 'unfolded_' + this.subType_) {
    var doc = this.session_.getDocument();
    var row = fold.start.row;
    this.findRegex_.lastIndex = content.lastIndexOf(this.reverseToken_, endIndex);
    this.session_.removeFold(fold);
    this.findAndCreateSubstitution_(content, fold.substitution);

    // m = this.findRegex_.exec(content)
    // var start = m.index;
    // var range = this.rangeFromIndexes_(start, m[0].length + start - 1);
    // this.createSubstitution(range, m[this.matchIndex_]);

    // this.createSubstitution(this.rangeFromIndexes_(annotationStartIndex,
    //     endIndex), this.subType_);
  } else {
    var unfoldInfo = this.getUnfoldedToken_(foldText);
    // var re = /(@type \{)([^}]+)\}/;
    var startPosition = this.session_.getDocument().indexToPosition(
        startIndex + unfoldInfo.start)
    var endPosition = this.session_.getDocument().indexToPosition(startIndex +
        unfoldInfo.end);
    var markerRange = new Range(startPosition.row, startPosition.column,
        endPosition.row, endPosition.column);
    var placeholder = "" + unfoldInfo.label + "";
    this.session_.removeFold(fold);
    var newFold = new Fold(markerRange, placeholder)
    newFold.subType = 'unfolded_' + this.subType_;
    newFold.substitution = fold.substitution;
    this.session_.addFold(newFold, markerRange);
  }
  return false;
}

/**
 * @constructor @extends {Substitutor}
 */
var TypeVarSubstitutor = function(reverseToken, subType,
    matchIndex, unfoldMatchIndex) {
  var findRegex = /(\/\*\* @type \{([^}]+)\} ?\*\/\n(\s*))\b(var) /g;
  Substitutor.call(this, findRegex, '/**', 'type_annotation', 2, 4);
}

TypeVarSubstitutor.prototype = Object.create(Substitutor.prototype);

TypeVarSubstitutor.prototype.getUnfoldedToken_ = function(annotationText) {
  var re = /(\/\*\* @type \{[^}]+\} ?\*\/\n\s*\b)(var)/g;
  m = re.exec(annotationText)
  var introLength = m[1].length;
  var varKeyword = m[2];
  var annotationStartIndex = m.index + introLength;
  return {label: varKeyword, start: annotationStartIndex,
      end: annotationStartIndex + varKeyword.length};
}

/**
 * @constructor @extends {Substitutor}
 */
var ClassSubstitutor = function(reverseToken, subType,
    matchIndex, unfoldMatchIndex) {
  var findRegex = /(\* @constructor)/g; // \b.*\*\/\nvar )([a-zA-Z_$][a-zA-Z_$0-9]*)
  Substitutor.call(this, findRegex, '/**', 'class_annotation', 2, 2);
}

ClassSubstitutor.prototype = Object.create(Substitutor.prototype);

ClassSubstitutor.prototype.getFoldToken_ = function(startIndex, content, match) {
  var findRegex = /(\*\/)(\n\s*var )([a-zA-Z_$][a-zA-Z_$0-9]*)( = function\([^{]*)/g
  findRegex.lastIndex = startIndex;
  var m = findRegex.exec(content);
  var annotationStart = content.lastIndexOf("/**", startIndex)
  var foldEnd = m.index + m[1].length;
  return {label: 'class ' + m[3] + " {", start: annotationStart, end: foldEnd};
}

ClassSubstitutor.prototype.getUnfoldedToken_ = function(annotationText) {
  var re = /(\* )(@constructor)/g; // \b.*\*\/\nvar )([a-zA-Z_$][a-zA-Z_$0-9]*)
  m = re.exec(annotationText)
  var introLength = m[1].length;
  var varKeyword = m[2];
  var annotationStartIndex = m.index + introLength;
  return {label: varKeyword, start: annotationStartIndex,
      end: annotationStartIndex + varKeyword.length};
}

ClassSubstitutor.prototype.findAndCreateSubstitution_ = function(content, substitutor) {
  var fold = Substitutor.prototype.findAndCreateSubstitution_.call(this,
      content, substitutor);
  if (!fold || fold === true) {
    return fold;
  }
  var constructorRegex = /(var )([a-zA-Z_$][a-zA-Z_$0-9]*)( = function)(\([^{]*)/g
  constructorRegex.lastIndex = this.session_.getDocument().positionToIndex(
      fold.start);
  m = constructorRegex.exec(content)
  var start = m.index;
  var label = m[2]
  var range = this.rangeFromIndexes_(start, start + m[1].length + label.length +
      m[3].length);
  // var start = m.index;
  // var range = this.rangeFromIndexes_(start, m[0].length + start - 1);

  if (this.session_.getFoldsInRange(range).length == 0) {
    return this.createSubstitution(range, label, substitutor);
  }
  return true;

}

/**
 * @constructor @extends {Substitutor}
 */
var VarSubstitutor = function(reverseToken, subType,
    matchIndex, unfoldMatchIndex) {
  var findRegex = /\b(var) /g;
  Substitutor.call(this, findRegex, 'var', 'blank_type_annotation', 1, 1);
}

VarSubstitutor.prototype = Object.create(Substitutor.prototype);

VarSubstitutor.prototype.expand = function(fold) {
  window.prompt('Type');
}


var Vide = function() {
  this.typeSub_ = null;
  this.editor_ = null;
  this.session_ = null;

  setTimeout(this.test_.bind(this), 1000);

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
    window.dispatchEvent(event);

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
        window.dispatchEvent(event);
      }).bind(this)
    });

    this.editor_ = window.aceEditor = editor;
    this.session_ = window.s = editor.getSession();
    this.initSubstitutors_();

    this.setupVisualization_(editor);
  }.bind(this));

  // document.addEventListener('mousedown', function(e) {
  //   if (e.target.classList.contains('ace_fold')) {
  //     this.allowNextUnfold_ = true;
  //   }
  // }.bind(this));
}


Vide.prototype.initSubstitutors_ = function() {
  this.classSub_ = new ClassSubstitutor();
  this.typeSub_ = new TypeVarSubstitutor();
  this.varSub_ = new VarSubstitutor();
}

Vide.prototype.setupVisualization_ = function(editor) {
  this.session_.onCollapsedFoldWidgetClick =
      this.onCollapsedFoldWidgetClick_.bind(this);

  editor.on('input', function() {
    // editor.getSession().unfold(2, true);
    var content = this.session_.getValue()
    // var re = /\/\*\* @type \{([A-Za-z_$.]+)\} ?\*\/\n(\s*)var/g;
    // var re = /for \(var ([a-zA-Z_$]+) *\= *([-a-zA-Z$0-9.]+) *
    //     ; *([a-zA-Z_$]+) *([<=>]+) *([-a-zA-Z$0-9.]+) *; *([a-zA-Z_$]+)(
    //     --|\+\+) *\)/g;
    // while(m = re.exec(content)) {
    //   var annotationStartIndex = m.index
    //   var annotationEndIndex = m[0].length + annotationStartIndex;
    //   var startPosition = this.session_.getDocument().indexToPosition(
    //       annotationStartIndex)
    //   var endPosition = this.session_.getDocument().indexToPosition(
    //       annotationEndIndex)
    //   var endValue = m[5];
    //   var placeholder = " \u25B6 loop " + m[1] + " : " + m[2] + " \u279C " +
    //       endValue + " \u2630 ";
    //   var markerRange = new Range(startPosition.row, startPosition.column,
    //       endPosition.row, endPosition.column);
    //   placeholder = new Fold(markerRange, placeholder)
    //   placeholder.subType = "if_statement";
    //   this.session_.addFold(placeholder, markerRange);
    // }

    this.classSub_.matchAll(content);
    this.typeSub_.matchAll(content);
    this.varSub_.matchAll(content);
  }.bind(this));
/*
  this.session_.addEventListener("changeFold", function(e) {
    return;
    // console.log(e);
    if (e.action == "remove") {
      if (this.allowNextUnfold_) {
        this.allowNextUnfold_ = false;
        if (e.data.subType == 'blank_type_annotation' || e.data.subType ==
            'type_annotation') {
          var content = this.session_.getValue()
          var startIndex = this.session_.getDocument().positionToIndex(
              e.data.start);
          var endIndex = this.session_.getDocument().positionToIndex(e.data.end);
          var annotationText = content.substr(startIndex, endIndex);
          // var re = /(@type \{)([^}]+)\}/;
          var re = /(|\/\*\* @type \{[^}]+\} ?\*\/\n\s*\b)(var)/g;
          m = re.exec(annotationText)
          var introLength = m[1].length;
          var typeName = m[2];
          var annotationStartIndex = m.index + startIndex + introLength;
          var annotationEndIndex = annotationStartIndex + typeName.length;
          var startPosition = this.session_.getDocument().indexToPosition(
              annotationStartIndex)
          var endPosition = this.session_.getDocument().indexToPosition(
              annotationEndIndex)
          var markerRange = new Range(startPosition.row, startPosition.column,
              endPosition.row, endPosition.column);
          var placeholder = "" + typeName + "";
          placeholder = new Fold(markerRange, placeholder)
          placeholder.subType = 'unfolded_' + subType;
          this.session_.addFold(placeholder, markerRange);
        } else {
          this.setupVisualization(editor);
        }
      } else {
        e.preventDefault();
        e.stopPropagation();
        var range = e.data.range;
        try {
          this.session_.addFold(e.data, range);
        } catch (e) {

        }
        // window.prompt("Type");
        return false;
      }
    }
  }.bind(this));*/
  this.session_.setValue(
      "//hello\n  /** @type {string} */\n  var pathSpec = 'hello'")
};

Vide.prototype.onCollapsedFoldWidgetClick_ = function(fold, e) {
  console.log(fold.substitution);
  fold.substitution.substitutor.expand(fold);
};


Vide.prototype.test_ = function() {
  var fold = document.getElementsByClassName('ace_fold')[0]
  //fold.mouseDown();
  console.log(fold)
}

window.onload = function() {
  this.vide_ = new Vide();
}

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


