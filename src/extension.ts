'use strict';
import {StatusBar} from './status_bar';
import * as utils from './utils';
import {commands, window, ExtensionContext} from 'vscode';
let paredit = require('paredit.js');

const languages = new Set(["clojure", "lisp", "scheme"]);
let enabled = true;

const navigate = (fn, ...args) =>
    ({textEditor, ast, selection}) => {
        let res = fn(ast, selection.cursor, ...args);
        utils.select(textEditor, res);
    }
const navigateRange = (fn, ...args) =>
    ({textEditor, ast, selection}) => {
        let res = fn(ast, selection.start, selection.end, ...args);
        utils.select(textEditor, res);
    }

function indent({textEditor, range}) {
    let src = textEditor.document.getText(),
        ast = paredit.parse(src),
        res = paredit.editor.indentRange(ast, src, range.start, range.end);

    utils
    .edit(textEditor, utils.commands(res))
    .then((applied?) => utils.undoStop(textEditor));
}

const edit = (fn, ...args) =>
    ({textEditor, src, ast, selection}) => {
        let res = fn(ast, src, selection.cursor, ...args);

        if (res)
            if (res.changes.length > 0) {
                let cmd = utils.commands(res),
                    sel = { start: Math.min(...cmd.map(c => c.start)),
                            end:   Math.max(...cmd.map(utils.end)) };

                utils
                .edit(textEditor, cmd)
                .then((applied?) => {
                    utils.select(textEditor, res.newIndex);
                    indent({ textEditor: textEditor,
                             range:      sel })});
            }
            else
                utils.select(textEditor, res.newIndex);
    }

function pareditDelete(ast,src,idx) {
    let result = paredit.editor.delete(ast,src,idx, {'backward': true});
    if (result.changes.length == 0) {
        return {changes: [], newIndex: result.newIndex - 1};
    }
    return result;
}

const pareditCommands : [[string, Function]] = [

    // NAVIGATION
    ['paredit.forwardSexp',            navigate(paredit.navigator.forwardSexp)],
    ['paredit.backwardSexp',           navigate(paredit.navigator.backwardSexp)],
    ['paredit.forwardDownSexp',        navigate(paredit.navigator.forwardDownSexp)],
    ['paredit.backwardUpSexp',         navigate(paredit.navigator.backwardUpSexp)],
    ['paredit.sexpRangeExpansion',     navigateRange(paredit.navigator.sexpRangeExpansion)],
    ['paredit.closeList',              navigate(paredit.navigator.closeList)],
    ['paredit.rangeForDefun',          navigate(paredit.navigator.rangeForDefun)],
        
    // EDITING
    ['paredit.slurpSexpForward',       edit(paredit.editor.slurpSexp, {'backward': false})],
    ['paredit.slurpSexpBackward',      edit(paredit.editor.slurpSexp, {'backward': true})],
    ['paredit.barfSexpForward',        edit(paredit.editor.barfSexp, {'backward': false})],
    ['paredit.barfSexpBackward',       edit(paredit.editor.barfSexp, {'backward': true})],
    ['paredit.spliceSexp',             edit(paredit.editor.spliceSexp)],
    ['paredit.splitSexp',              edit(paredit.editor.splitSexp)],
    ['paredit.killSexpForward',        edit(paredit.editor.killSexp, {'backward': false})],
    ['paredit.killSexpBackward',       edit(paredit.editor.killSexp, {'backward': true})],
    ['paredit.spliceSexpKillForward',  edit(paredit.editor.spliceSexpKill, {'backward': false})],
    ['paredit.spliceSexpKillBackward', edit(paredit.editor.spliceSexpKill, {'backward': true})],
    ['paredit.wrapAroundParens',       edit(paredit.editor.wrapAround, '(', ')')],
    ['paredit.wrapAroundSquare',       edit(paredit.editor.wrapAround, '[', ']')],
    ['paredit.wrapAroundCurly',        edit(paredit.editor.wrapAround, '{', '}')],
    ['paredit.indentRange',            indent],
    ['paredit.transpose',              edit(paredit.editor.transpose)],
    ['paredit.backspace',              edit(pareditDelete)]
];

function wrapPareditCommand(fn) {
    return () => {

        let textEditor = window.activeTextEditor;
        let doc = textEditor.document;
        if (!enabled || !languages.has(doc.languageId)) return;

        let src = textEditor.document.getText();
        fn({ textEditor: textEditor,
             src:        src,
             ast:        paredit.parse(src),
             selection:  utils.getSelection(textEditor) });
    }
}

export function activate(context: ExtensionContext) {

    let statusBar = new StatusBar();

    context.subscriptions.push(

        statusBar,
        commands.registerCommand('paredit.toggle', () => {enabled = !enabled; statusBar.enabled = enabled;}),
        window.onDidChangeActiveTextEditor((e) => statusBar.visible = languages.has(e.document.languageId)),

        ...pareditCommands
           .map(([command, fn]) => commands.registerCommand(command, wrapPareditCommand(fn))));
}

export function deactivate() {
}
